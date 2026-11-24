import type { Db } from "@/lib/db/client";

export type ProviderId = "demo" | "paystack" | "flutterwave";

export type InitializeArgs = {
  reference: string;
  amount: number; // minor units
  currency: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  callbackUrl: string;
  bookingReference: string;
};

export type VerifyResult = {
  reference: string;
  status: "success" | "pending" | "failed" | "abandoned";
  amount: number; // minor units, as reported by the provider
  currency: string;
  channel?: string | null;
  providerTxnId?: string | null;
  raw?: unknown;
};

export type WebhookEvent = { dedupeKey: string; type: string; reference: string | null; payload: unknown };

export interface PaymentProvider {
  id: ProviderId;
  label: string;
  /** True when the provider moves real money. The demo provider never does. */
  live: boolean;
  configured(): boolean;
  initialize(db: Db, args: InitializeArgs): Promise<{ redirectUrl: string; providerRef?: string }>;
  /** Server-to-server verification. Never trust a client callback on its own. */
  verify(db: Db, reference: string): Promise<VerifyResult>;
  /** Validates the webhook signature against the raw body. */
  verifyWebhook?(rawBody: string, headers: Headers): boolean;
  parseWebhook?(rawBody: string): WebhookEvent | null;
  refund?(db: Db, args: { reference: string; amount: number }): Promise<{ ok: boolean; providerRef?: string; message?: string }>;
}
