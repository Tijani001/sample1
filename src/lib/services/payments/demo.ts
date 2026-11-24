import type { PaymentProvider } from "./types";

/**
 * Sandbox payment gateway for development and demos. It keeps its own ledger (demo_gateway_transactions)
 * so the platform's verification path is exercised exactly as with a real provider: the checkout page
 * completes a gateway transaction, and Goroada then verifies it server-side before confirming anything.
 * No money moves, and every screen that uses it is labelled as a sandbox.
 */
export const demoProvider: PaymentProvider = {
  id: "demo",
  label: "Sandbox payment (no real money)",
  live: false,
  configured: () => process.env.DISABLE_DEMO_PAYMENTS !== "true",
  async initialize(db, args) {
    await db.query(
      `insert into demo_gateway_transactions (reference, amount, currency, status) values ($1,$2,$3,'pending') on conflict (reference) do nothing`,
      [args.reference, args.amount, args.currency],
    );
    return { redirectUrl: `/pay/sandbox/${encodeURIComponent(args.reference)}` };
  },
  async verify(db, reference) {
    await db.query(`update demo_gateway_transactions set status = 'success' where reference = $1 and status = 'pending' and channel = 'bank_transfer' and completed_at <= now()`, [reference]);
    const [t] = await db.query<{ reference: string; amount: number; currency: string; status: "pending" | "success" | "failed" | "abandoned"; channel: string | null }>(
      `select reference, amount, currency, status, channel from demo_gateway_transactions where reference = $1`,
      [reference],
    );
    if (!t) return { reference, status: "failed", amount: 0, currency: "NGN" };
    return { reference: t.reference, status: t.status, amount: t.amount, currency: t.currency, channel: t.channel, providerTxnId: `SANDBOX-${t.reference}` };
  },
  async refund() {
    return { ok: true, providerRef: `SANDBOX-REFUND-${Date.now()}`, message: "Sandbox refund recorded (no money moved)." };
  },
};

/** Sandbox gateway action, invoked from the clearly labelled sandbox checkout page. */
export async function completeDemoTransaction(
  db: import("@/lib/db/client").Db,
  reference: string,
  outcome: "success" | "failed" | "pending",
  channel: "card" | "bank_transfer" | "ussd",
) {
  const rows = await db.query<{ reference: string }>(
    // A "delayed transfer" settles automatically 30 seconds later, like a real bank transfer confirmation.
    `update demo_gateway_transactions set status = $2, channel = $3, completed_at = case when $2 = 'pending' then now() + interval '30 seconds' else now() end
      where reference = $1 and status in ('pending') returning reference`,
    [reference, outcome, channel],
  );
  return rows.length > 0;
}
