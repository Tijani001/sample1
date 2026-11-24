import type { Db } from "@/lib/db/client";
import { paymentReference } from "@/lib/domain/ids";
import { log } from "@/lib/log";
import { allocateAndConfirm, BookingError, type ConfirmOutcome } from "../bookings";
import { audit, SYSTEM_ACTOR, type Actor } from "../audit";
import { notify } from "../notifications";
import { demoProvider } from "./demo";
import { flutterwaveProvider } from "./flutterwave";
import { paystackProvider } from "./paystack";
import type { PaymentProvider, ProviderId } from "./types";

const ALL: PaymentProvider[] = [paystackProvider, flutterwaveProvider, demoProvider];

export function getProvider(id: string): PaymentProvider | null {
  return ALL.find((p) => p.id === id) ?? null;
}

export function availableProviders() {
  return ALL.filter((p) => p.configured()).map((p) => ({ id: p.id, label: p.label, live: p.live }));
}

export async function initializePayment(db: Db, args: { bookingId: string; provider: ProviderId; baseUrl: string }) {
  const provider = getProvider(args.provider);
  if (!provider || !provider.configured()) throw new BookingError("provider_unavailable", "This payment method isn't available right now.", 400);
  const [b] = await db.query<{ id: string; reference: string; status: string; total: number; currency: string; hold_expires_at: Date | null; contact_email: string | null; contact_name: string | null; contact_phone: string | null }>(
    `select id, reference, status, total, currency, hold_expires_at, contact_email, contact_name, contact_phone from bookings where id = $1`, [args.bookingId]);
  if (!b) throw new BookingError("not_found", "Booking not found.", 404);
  if (b.status === "confirmed") throw new BookingError("already_paid", "This booking is already paid.", 409);
  if (b.status !== "awaiting_payment") throw new BookingError("not_payable", "This booking can no longer be paid.", 409);
  if (!b.contact_email) throw new BookingError("missing_details", "Add passenger and contact details first.", 422);
  const [{ incomplete }] = await db.query<{ incomplete: number }>(`select count(*)::int incomplete from booking_passengers where booking_id = $1 and length(full_name) < 2`, [b.id]);
  if (incomplete > 0) throw new BookingError("missing_details", "Add passenger details first.", 422);
  if (b.hold_expires_at && new Date(b.hold_expires_at).getTime() < Date.now()) throw new BookingError("hold_expired", "Your seat reservation has expired. Please choose your seats again.", 410);

  // Reuse a recent initialised payment for the same amount (idempotent retries / double clicks).
  const [existing] = await db.query<{ reference: string; provider: string }>(
    `select reference, provider from payments where booking_id = $1 and provider = $2 and status = 'initialized' and amount = $3 and created_at > now() - interval '20 minutes' order by created_at desc limit 1`,
    [b.id, provider.id, b.total]);
  const reference = existing?.reference ?? paymentReference(b.reference);
  if (!existing) {
    await db.query(`insert into payments (booking_id, provider, reference, amount, currency, status) values ($1,$2,$3,$4,$5,'initialized')`, [b.id, provider.id, reference, b.total, b.currency]);
  }
  const callbackUrl = `${args.baseUrl}/checkout/return?reference=${encodeURIComponent(reference)}`;
  const { redirectUrl } = await provider.initialize(db, { reference, amount: b.total, currency: b.currency, email: b.contact_email, name: b.contact_name, phone: b.contact_phone, callbackUrl, bookingReference: b.reference });
  log.info("payment.initialized", { provider: provider.id, reference });
  return { reference, redirectUrl, provider: provider.id };
}

export type VerifyOutcome =
  | { state: "confirmed"; bookingId: string; reference: string; outcome: ConfirmOutcome }
  | { state: "pending"; bookingId: string; reference: string }
  | { state: "failed"; bookingId: string; reference: string; message: string }
  | { state: "review"; bookingId: string; reference: string; message: string };

/**
 * Verifies a payment with its provider (server-to-server) and, if successful, confirms the booking.
 * Idempotent: safe to call from the browser return URL and from webhooks, any number of times.
 */
export async function verifyPayment(db: Db, paymentRef: string, actor: Actor = SYSTEM_ACTOR): Promise<VerifyOutcome> {
  const [p] = await db.query<{ id: string; booking_id: string; provider: ProviderId; amount: number; currency: string; status: string; booking_ref: string }>(
    `select p.id, p.booking_id, p.provider, p.amount, p.currency, p.status, b.reference booking_ref from payments p join bookings b on b.id = p.booking_id where p.reference = $1`, [paymentRef]);
  if (!p) throw new BookingError("payment_not_found", "Payment not found.", 404);
  if (p.status === "success") return { state: "confirmed", bookingId: p.booking_id, reference: p.booking_ref, outcome: { status: "already_confirmed" } };
  const provider = getProvider(p.provider)!;
  const result = await provider.verify(db, paymentRef);

  return db.tx(async (q): Promise<VerifyOutcome> => {
    const [locked] = await q.query<{ status: string }>(`select status from payments where id = $1 for update`, [p.id]);
    if (locked.status === "success") return { state: "confirmed", bookingId: p.booking_id, reference: p.booking_ref, outcome: { status: "already_confirmed" } };
    if (result.status === "pending") {
      await q.query(`update payments set status = 'pending', channel = coalesce($2, channel) where id = $1`, [p.id, result.channel ?? null]);
      await q.query(`update bookings set status = 'payment_processing' where id = $1 and status = 'awaiting_payment'`, [p.booking_id]);
      return { state: "pending", bookingId: p.booking_id, reference: p.booking_ref };
    }
    if (result.status !== "success") {
      await q.query(`update payments set status = $2, failure_reason = $3 where id = $1`, [p.id, result.status === "abandoned" ? "abandoned" : "failed", `provider_status:${result.status}`]);
      await q.query(`update bookings set status = 'awaiting_payment' where id = $1 and status = 'payment_processing'`, [p.booking_id]);
      return { state: "failed", bookingId: p.booking_id, reference: p.booking_ref, message: "The payment was not completed. You have not been charged." };
    }
    // Success reported: check it matches what we asked for before trusting it.
    if (result.reference !== paymentRef || result.amount !== p.amount || result.currency !== p.currency) {
      await q.query(`update payments set status = 'failed', failure_reason = 'mismatch', provider_txn_id = $2 where id = $1`, [p.id, result.providerTxnId ?? null]);
      await q.query(`update bookings set status = 'needs_reconciliation' where id = $1`, [p.booking_id]);
      await audit(q, actor, "payment.mismatch", "payment", p.id, { expected: { amount: p.amount, currency: p.currency }, got: { amount: result.amount, currency: result.currency } });
      log.error("payment.mismatch", { reference: paymentRef });
      return { state: "review", bookingId: p.booking_id, reference: p.booking_ref, message: "We received a payment that doesn't match this booking. Our team will review it and contact you." };
    }
    const [other] = await q.query<{ id: string }>(`select id from payments where booking_id = $1 and status = 'success' and id <> $2`, [p.booking_id, p.id]);
    if (other) {
      // Duplicate payment for an already-paid booking: record it and refund it in full.
      await q.query(`update payments set status = 'reversed', failure_reason = 'duplicate_payment', verified_at = now(), provider_txn_id = $2 where id = $1`, [p.id, result.providerTxnId ?? null]);
      await q.query(`insert into refunds (booking_id, payment_id, amount, status, reason) values ($1,$2,$3,'approved','Duplicate payment refunded in full') on conflict do nothing`, [p.booking_id, p.id, p.amount]);
      await audit(q, actor, "payment.duplicate", "payment", p.id, { reference: paymentRef });
      return { state: "confirmed", bookingId: p.booking_id, reference: p.booking_ref, outcome: { status: "already_confirmed" } };
    }
    await q.query(`update payments set status = 'success', verified_at = now(), channel = $2, provider_txn_id = $3 where id = $1`, [p.id, result.channel ?? null, result.providerTxnId ?? null]);
    await audit(q, actor, "payment.verified", "payment", p.id, { reference: paymentRef, provider: p.provider, amount: p.amount });
    const outcome = await allocateAndConfirm(q, p.booking_id, actor);
    if (outcome.status === "needs_reconciliation") {
      return { state: "review", bookingId: p.booking_id, reference: p.booking_ref, message: "Your payment arrived after your seats were released and this departure is now full. A full refund has been approved." };
    }
    return { state: "confirmed", bookingId: p.booking_id, reference: p.booking_ref, outcome };
  });
}

/** Records a provider webhook once (dedupe), then verifies via the provider API rather than trusting the payload. */
export async function handleWebhook(db: Db, providerId: ProviderId, rawBody: string, headers: Headers) {
  const provider = getProvider(providerId);
  if (!provider?.verifyWebhook || !provider.parseWebhook) return { status: 404 as const };
  const valid = provider.verifyWebhook(rawBody, headers);
  const event = provider.parseWebhook(rawBody);
  if (!event) return { status: 400 as const };
  const inserted = await db.query<{ id: string }>(
    `insert into payment_events (provider, dedupe_key, reference, event_type, signature_valid, payload) values ($1,$2,$3,$4,$5,$6) on conflict (dedupe_key) do nothing returning id`,
    [providerId, event.dedupeKey, event.reference, event.type, valid, JSON.stringify(event.payload)]);
  if (!valid) {
    log.warn("webhook.invalid_signature", { provider: providerId });
    return { status: 401 as const };
  }
  if (!inserted.length) return { status: 200 as const, duplicate: true };
  if (event.reference && /charge\.success|charge\.completed/.test(event.type)) {
    try {
      await verifyPayment(db, event.reference, { userId: null, label: `webhook:${providerId}` });
    } catch (e) {
      log.error("webhook.verify_failed", { provider: providerId, error: (e as Error).message });
    }
  }
  await db.query(`update payment_events set processed_at = now() where id = $1`, [inserted[0].id]);
  return { status: 200 as const };
}

/** Finance action: pays out an approved/pending refund through the original provider. */
export async function processRefund(db: Db, refundId: string, actor: Actor) {
  const [r] = await db.query<{ id: string; booking_id: string; amount: number; status: string; provider: string | null; reference: string | null; booking_ref: string; user_id: string | null; contact_email: string | null }>(
    `select r.id, r.booking_id, r.amount, r.status, p.provider, p.reference, b.reference booking_ref, b.user_id, b.contact_email
       from refunds r join bookings b on b.id = r.booking_id left join payments p on p.id = r.payment_id where r.id = $1`, [refundId]);
  if (!r) throw new BookingError("not_found", "Refund not found.", 404);
  if (!["pending", "approved"].includes(r.status)) throw new BookingError("invalid_state", "This refund has already been handled.", 409);
  const provider = r.provider ? getProvider(r.provider) : null;
  const result = provider?.refund && r.reference ? await provider.refund(db, { reference: r.reference, amount: r.amount }) : { ok: true, message: "Manual refund recorded." };
  if (!result.ok) throw new BookingError("refund_failed", result.message ?? "Refund failed.", 502);
  await db.tx(async (q) => {
    await q.query(`update refunds set status = 'processed', processed_at = now(), processed_by = $2 where id = $1`, [refundId, actor.userId]);
    await q.query(`update bookings set status = 'refunded' where id = $1 and status in ('refund_pending','needs_reconciliation')`, [r.booking_id]);
    await notify(q, { userId: r.user_id, bookingId: r.booking_id, category: "transactional", kind: "refund_processed", title: `Refund sent · ${r.booking_ref}`,
      body: `₦${(r.amount / 100).toLocaleString("en-NG")} has been refunded to your original payment method.`, href: `/trips/${r.booking_ref}`, channels: { email: r.contact_email } });
    await audit(q, actor, "refund.processed", "refund", refundId, { booking: r.booking_ref, amount: r.amount, provider: r.provider });
  });
  return { ok: true };
}
