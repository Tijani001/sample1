import crypto from "node:crypto";
import type { PaymentProvider, VerifyResult } from "./types";

const BASE = "https://api.flutterwave.com/v3";
const secret = () => process.env.FLUTTERWAVE_SECRET_KEY ?? "";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: unknown };
  if (!res.ok || body.status !== "success") throw new Error(`Flutterwave error: ${body.message ?? res.status}`);
  return body.data as T;
}

/** Flutterwave adapter. Flutterwave expresses amounts in major units, so we convert at the boundary. */
export const flutterwaveProvider: PaymentProvider = {
  id: "flutterwave",
  label: "Flutterwave",
  live: true,
  configured: () => secret().startsWith("FLWSECK"),
  async initialize(_db, args) {
    const data = await call<{ link: string }>("/payments", {
      method: "POST",
      body: JSON.stringify({
        tx_ref: args.reference,
        amount: (args.amount / 100).toFixed(2),
        currency: args.currency,
        redirect_url: args.callbackUrl,
        payment_options: "card,banktransfer,ussd",
        customer: { email: args.email, name: args.name ?? undefined, phonenumber: args.phone ?? undefined },
        meta: { booking_reference: args.bookingReference },
        customizations: { title: "Goroada", description: `Booking ${args.bookingReference}` },
      }),
    });
    return { redirectUrl: data.link };
  },
  async verify(_db, reference): Promise<VerifyResult> {
    const d = await call<{ status: string; amount: number; currency: string; tx_ref: string; payment_type: string; id: number }>(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
    );
    const status = d.status === "successful" ? "success" : d.status === "pending" ? "pending" : "failed";
    return { reference: d.tx_ref, status, amount: Math.round(d.amount * 100), currency: d.currency, channel: d.payment_type, providerTxnId: String(d.id) };
  },
  verifyWebhook(_rawBody, headers) {
    const expected = process.env.FLUTTERWAVE_WEBHOOK_HASH ?? "";
    const got = headers.get("verif-hash") ?? "";
    return !!expected && got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  },
  parseWebhook(rawBody) {
    try {
      const e = JSON.parse(rawBody) as { event?: string; data?: { id?: number; tx_ref?: string } };
      return { dedupeKey: `flutterwave:${e.event}:${e.data?.id ?? e.data?.tx_ref}`, type: e.event ?? "unknown", reference: e.data?.tx_ref ?? null, payload: e };
    } catch {
      return null;
    }
  },
};
