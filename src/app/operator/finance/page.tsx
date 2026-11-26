import { Download } from "lucide-react";
import { getDb } from "@/lib/server";
import { requireOperator } from "@/lib/auth/guards";
import { financeSummary } from "@/lib/services/operator";
import { PageHeader, Stat, Table } from "@/components/portal/shell";
import { Badge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/money";
import { formatDate } from "@/lib/domain/time";

export const metadata = { title: "Finance" };
export default async function Finance() {
  const u = await requireOperator();
  const f = await financeSummary(await getDb(), u.operator.id);
  const max = Math.max(1, ...f.series.map((s) => s.gross));
  return (
    <>
      <PageHeader title="Finance" subtitle="Last 90 days · Goroada sales only" actions={<a href="/api/operator/report" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-white px-3 text-sm font-semibold hover:bg-surface-2"><Download className="h-4 w-4" />Download CSV</a>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Gross sales" value={formatMoney(f.totals.gross)} />
        <Stat label="Platform commission" value={formatMoney(f.totals.commission)} />
        <Stat label="Net revenue" value={formatMoney(f.totals.net)} tone="success" />
        <Stat label="Refunds" value={formatMoney(f.totals.refunds)} />
        <Stat label="Bookings" value={f.totals.bookings} />
      </div>
      <section className="mt-6 rounded-2xl border border-line bg-white p-5">
        <h2 className="font-semibold">Daily gross sales (14 days)</h2>
        <div className="mt-4 flex h-40 items-end gap-1.5" role="img" aria-label="Bar chart of daily sales">
          {f.series.map((s) => <div key={s.d} className="group relative flex-1"><div className="w-full rounded-t-md bg-navy-600 transition-colors group-hover:bg-coral-600" style={{ height: `${Math.max(2, (s.gross / max) * 150)}px` }} /><span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-xs text-white group-hover:block">{formatMoney(s.gross)}</span></div>)}
        </div>
        <div className="mt-1 flex justify-between text-xs text-ink-3"><span>{formatDate(`${f.series[0].d}T12:00:00Z`, "UTC", "weekday")}</span><span>Today</span></div>
      </section>
      <section className="mt-6"><h2 className="mb-3 text-lg font-semibold">Settlements</h2>
        <Table head={["Period", "Gross", "Commission", "Refunds", "Net payout", "Status"]} empty={f.settlements.length ? undefined : "No settlements yet. Goroada runs settlements weekly."}>
          {f.settlements.map((s) => <tr key={s.id}><td>{formatDate(s.period_start)} – {formatDate(s.period_end)}</td><td className="tabular">{formatMoney(s.gross)}</td><td className="tabular">{formatMoney(s.commission)}</td><td className="tabular">{formatMoney(s.refunds)}</td><td className="font-semibold tabular">{formatMoney(s.net)}</td><td><Badge tone={s.status === "paid" ? "success" : "warning"}>{s.status}</Badge></td></tr>)}
        </Table></section>
      <section className="mt-6"><h2 className="mb-3 text-lg font-semibold">Booking transactions</h2>
        <Table head={["Booking", "Date", "Route", "Gross", "Commission", "Status"]}>
          {f.transactions.map((t, i) => <tr key={i}><td className="font-mono">{t.reference}</td><td>{formatDate(t.created_at)}</td><td>{t.route}</td><td className="tabular">{formatMoney(t.gross)}</td><td className="tabular">{formatMoney(t.commission)}</td><td><Badge tone={t.status === "confirmed" ? "success" : "neutral"}>{t.status.replace("_", " ")}</Badge></td></tr>)}
        </Table></section>
    </>
  );
}
