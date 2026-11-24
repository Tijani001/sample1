import { getDb } from "@/lib/server";
import { adminFor } from "../guard";
import { PageHeader, Stat, Table } from "@/components/portal/shell";
import { Badge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/money";
import { formatDate, formatTime } from "@/lib/domain/time";

export const metadata = { title: "Payments" };
export default async function AdminPayments() {
  await adminFor("payments");
  const db = await getDb();
  const [s] = await db.query<{ success: number; success_amt: number; pending: number; failed: number; reversed: number }>(
    `select count(*) filter (where status = 'success')::int success, coalesce(sum(amount) filter (where status = 'success'),0)::int success_amt,
            count(*) filter (where status = 'pending')::int pending, count(*) filter (where status = 'failed')::int failed, count(*) filter (where status = 'reversed')::int reversed from payments`);
  const recon = await db.query<{ reference: string; status: string; total: number; created_at: Date }>(`select reference, status, total, created_at from bookings where status = 'needs_reconciliation' order by created_at desc`);
  const payments = await db.query<{ reference: string; provider: string; amount: number; status: string; channel: string | null; failure_reason: string | null; created_at: Date; verified_at: Date | null; booking: string }>(
    `select p.reference, p.provider, p.amount, p.status, p.channel, p.failure_reason, p.created_at, p.verified_at, b.reference booking from payments p join bookings b on b.id = p.booking_id order by p.created_at desc limit 80`);
  const events = await db.query<{ provider: string; event_type: string; reference: string | null; signature_valid: boolean; received_at: Date; processed_at: Date | null }>(`select provider, event_type, reference, signature_valid, received_at, processed_at from payment_events order by received_at desc limit 20`);
  return (
    <>
      <PageHeader title="Payment reconciliation" subtitle="Every payment is verified server-side with the provider before a booking is confirmed" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Verified payments" value={s.success} /><Stat label="Verified amount" value={formatMoney(s.success_amt)} /><Stat label="Pending" value={s.pending} /><Stat label="Failed" value={s.failed} /><Stat label="Duplicates reversed" value={s.reversed} />
      </div>
      <section className="mt-6"><h2 className="mb-3 text-lg font-semibold">Needs reconciliation</h2>
        <Table head={["Booking", "Status", "Amount", "Created"]} empty={recon.length ? undefined : "Nothing to reconcile."}>{recon.map((r) => <tr key={r.reference}><td className="font-mono">{r.reference}</td><td><Badge tone="warning">{r.status.replace(/_/g, " ")}</Badge></td><td className="tabular">{formatMoney(r.total)}</td><td>{formatDate(r.created_at)}</td></tr>)}</Table></section>
      <section className="mt-6"><h2 className="mb-3 text-lg font-semibold">Payments</h2>
        <Table head={["Reference", "Booking", "Provider", "Amount", "Status", "Verified"]}>{payments.map((p) => <tr key={p.reference}><td className="font-mono text-xs">{p.reference}</td><td className="font-mono text-xs">{p.booking}</td><td>{p.provider === "demo" ? <Badge tone="warning">sandbox</Badge> : p.provider}<span className="block text-xs text-ink-3">{p.channel?.replace("_", " ")}</span></td><td className="tabular">{formatMoney(p.amount)}</td><td><Badge tone={p.status === "success" ? "success" : p.status === "failed" ? "danger" : "neutral"}>{p.status}</Badge>{p.failure_reason && <span className="block text-xs text-ink-3">{p.failure_reason}</span>}</td><td className="text-xs">{p.verified_at ? `${formatDate(p.verified_at)} ${formatTime(p.verified_at)}` : "—"}</td></tr>)}</Table></section>
      <section className="mt-6"><h2 className="mb-3 text-lg font-semibold">Webhook events</h2>
        <Table head={["Provider", "Event", "Reference", "Signature", "Received"]} empty={events.length ? undefined : "No webhooks received yet (sandbox payments verify directly)."}>{events.map((e, i) => <tr key={i}><td>{e.provider}</td><td>{e.event_type}</td><td className="font-mono text-xs">{e.reference}</td><td><Badge tone={e.signature_valid ? "success" : "danger"}>{e.signature_valid ? "valid" : "invalid"}</Badge></td><td>{formatDate(e.received_at)} {formatTime(e.received_at)}</td></tr>)}</Table></section>
    </>
  );
}
