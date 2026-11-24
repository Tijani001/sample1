import crypto from "node:crypto";
import type { PaymentProvider, VerifyResult } from "./types";

const BASE = "https://api.paystack.co";
const secret = () => process.env.PAYSTACK_SECRET_KEY ?? "";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: unknown };
  if (!res.ok || body.status === false) throw new Error(`Paystack error: ${body.message ?? res.status}`);
  return body.data as T;
}

/** Paystack adapter (cards, bank transfer, USSD, bank). Amounts are sent in kobo. */
export const paystackProvider: PaymentProvider = {
  id: "paystack",
  label: "Paystack",
  live: true,
  configured: () => secret().startsWith("sk_"),
  async initialize(_db, args) {
    const data = await call<{ authorization_url: string; reference: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: args.email,
        amount: args.amount,
        currency: args.currency,
        reference: args.reference,
        callback_url: args.callbackUrl,
        channels: ["card", "bank_transfer", "ussd", "bank"],
        metadata: { booking_reference: args.bookingReference },
      }),
    });
    return { redirectUrl: data.authorization_url, providerRef: data.reference };
  },
  async verify(_db, reference): Promise<VerifyResult> {
    const d = await call<{ status: string; amount: number; currency: string; reference: string; channel: string; id: number }>(`/transaction/verify/${encodeURIComponent(reference)}`);
    const status = d.status === "success" ? "success" : d.status === "abandoned" ? "abandoned" : ["ongoing", "pending", "processing", "queued"].includes(d.status) ? "pending" : "failed";
    return { reference: d.reference, status, amount: d.amount, currency: d.currency, channel: d.channel, providerTxnId: String(d.id), raw: { status: d.status } };
  },
  verifyWebhook(rawBody, headers) {
    const sig = headers.get("x-paystack-signature");
    if (!sig || !secret()) return false;
    const expected = crypto.createHmac("sha512", secret()).update(rawBody).digest("hex");
    return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  },
  parseWebhook(rawBody) {
    try {
      const e = JSON.parse(rawBody) as { event: string; data?: { id?: number; reference?: string } };
      return { dedupeKey: `paystack:${e.event}:${e.data?.id ?? e.data?.reference}`, type: e.event, reference: e.data?.reference ?? null, payload: e };
    } catch {
      return null;
    }
  },
  async refund(_db, args) {
    const d = await call<{ id: number }>("/refund", { method: "POST", body: JSON.stringify({ transaction: args.reference, amount: args.amount }) });
    return { ok: true, providerRef: String(d.id) };
  },
};
