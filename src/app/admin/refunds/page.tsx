import { getDb } from "@/lib/server";
import { adminFor } from "../guard";
import { PageHeader, Table } from "@/components/portal/shell";
import { Badge } from "@/components/ui/primitives";
import { ActionButton } from "@/components/portal/action-button";
import { processRefundAction, rejectRefundAction } from "../actions";
import { formatMoney } from "@/lib/domain/money";
import { formatDate } from "@/lib/domain/time";

export const metadata = { title: "Refunds" };
export default async function AdminRefunds() {
  await adminFor("refunds");
  const rows = await (await getDb()).query<{ id: string; amount: number; status: string; reason: string; created_at: Date; processed_at: Date | null; reference: string; provider: string | null }>(
    `select r.id, r.amount, r.status, r.reason, r.created_at, r.processed_at, b.reference, p.provider from refunds r join bookings b on b.id = r.booking_id left join payments p on p.id = r.payment_id order by case when r.status in ('pending','approved') then 0 else 1 end, r.created_at desc`);
  return (
    <>
      <PageHeader title="Refunds" subtitle="Refunds are paid back through the original payment provider" />
      <Table head={["Booking", "Amount", "Reason", "Requested", "Status", "Actions"]} empty={rows.length ? undefined : "No refunds."}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono">{r.reference}<span className="block font-sans text-xs text-ink-3">{r.provider === "demo" ? "sandbox" : r.provider ?? "manual"}</span></td>
            <td className="font-semibold tabular">{formatMoney(r.amount)}</td><td className="max-w-xs text-xs">{r.reason}</td><td>{formatDate(r.created_at)}</td>
            <td><Badge tone={r.status === "processed" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{r.status}</Badge></td>
            <td className="space-x-1 whitespace-nowrap">{["pending", "approved"].includes(r.status) && <><ActionButton size="sm" variant="navy" action={processRefundAction.bind(null, r.id)} confirmText={`Send ${formatMoney(r.amount)} back to the customer?`}>Process</ActionButton><ActionButton size="sm" variant="ghost" action={rejectRefundAction.bind(null, r.id)} confirmText="Reject this refund?">Reject</ActionButton></>}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
