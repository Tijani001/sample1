import { getDb } from "@/lib/server";
import { adminFor } from "../guard";
import { PageHeader, Table } from "@/components/portal/shell";
import { Badge } from "@/components/ui/primitives";
import { ActionButton } from "@/components/portal/action-button";
import { markSettlementPaidAction, runSettlementAction } from "../actions";
import { formatMoney } from "@/lib/domain/money";
import { formatDate } from "@/lib/domain/time";

export const metadata = { title: "Settlements" };
export default async function AdminSettlements() {
  await adminFor("settlements");
  const db = await getDb();
  const rows = await db.query<{ id: string; name: string; period_start: Date; period_end: Date; gross: number; commission: number; refunds: number; net: number; status: string; paid_at: Date | null; bank: string; last4: string }>(
    `select s.*, o.name, pa.bank_name bank, pa.account_last4 last4 from operator_settlements s join operators o on o.id = s.operator_id left join operator_payout_accounts pa on pa.operator_id = s.operator_id order by s.period_end desc, o.name`);
  const commissions = await db.query<{ name: string; gross: number; commission: number; rate: number }>(`select o.name, sum(pc.gross)::int gross, sum(pc.amount)::int commission, o.commission_bps rate from platform_commissions pc join operators o on o.id = pc.operator_id group by o.name, o.commission_bps order by 2 desc`);
  return (
    <>
      <PageHeader title="Settlements & commissions" subtitle="Weekly operator payouts, net of platform commission" actions={<ActionButton variant="navy" size="sm" action={runSettlementAction}>Run settlement for last week</ActionButton>} />
      <Table head={["Operator", "Period", "Gross", "Commission", "Net payout", "Payout account", "Status", ""]} empty={rows.length ? undefined : "No settlements yet. Run one for last week."}>
        {rows.map((s) => <tr key={s.id}><td className="font-medium">{s.name}</td><td className="text-xs">{formatDate(s.period_start)} – {formatDate(s.period_end)}</td><td className="tabular">{formatMoney(s.gross)}</td><td className="tabular">{formatMoney(s.commission)}</td><td className="font-semibold tabular">{formatMoney(s.net)}</td><td className="text-xs">{s.bank} ••{s.last4}</td><td><Badge tone={s.status === "paid" ? "success" : "warning"}>{s.status}</Badge></td><td>{s.status !== "paid" && <ActionButton size="sm" variant="outline" action={markSettlementPaidAction.bind(null, s.id)} confirmText="Confirm the bank transfer has been made?">Mark paid</ActionButton>}</td></tr>)}
      </Table>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Commission by operator (all time)</h2>
      <Table head={["Operator", "Rate", "Gross", "Commission"]}>{commissions.map((c) => <tr key={c.name}><td>{c.name}</td><td>{c.rate / 100}%</td><td className="tabular">{formatMoney(c.gross)}</td><td className="tabular">{formatMoney(c.commission)}</td></tr>)}</Table>
    </>
  );
}
