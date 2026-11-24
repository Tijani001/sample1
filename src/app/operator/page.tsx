import Link from "next/link";
import { getDb } from "@/lib/server";
import { requireOperator } from "@/lib/auth/guards";
import { departuresForDate, operatorDashboard } from "@/lib/services/operator";
import { PageHeader, Stat, Table } from "@/components/portal/shell";
import { Badge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/money";
import { formatDate, formatTime, nowMs, todayIso } from "@/lib/domain/time";

export const metadata = { title: "Dashboard" };

export default async function OperatorDashboard() {
  const u = await requireOperator();
  const db = await getDb();
  const s = await operatorDashboard(db, u.operator.id);
  const allToday = await departuresForDate(db, u.operator.id, todayIso());
  const today = allToday.filter((t) => new Date(t.arrival_est_at).getTime() > nowMs()).slice(0, 8);
  return (
    <>
      <PageHeader title={`Good day, ${u.name.split(" ")[0]}`} subtitle={`${u.operator.name} · ${formatDate(new Date(), undefined, "long")}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bookings (30 days)" value={s.bookings30} />
        <Stat label="Gross sales (30 days)" value={formatMoney(s.gross30)} />
        <Stat label="Upcoming departures (7 days)" value={s.upcoming7} sub={`${s.today} today`} />
        <Stat label="Seat occupancy (next 7 days)" value={`${s.occupancy}%`} sub="All channels" />
        <Stat label="Active vehicles" value={`${s.active_vehicles}/${s.vehicles}`} />
        <Stat label="Cancellation rate" value={`${s.cancellationRate}%`} tone={s.cancellationRate > 10 ? "warning" : undefined} />
        <Stat label="Pending settlement" value={formatMoney(s.pendingSettlement)} sub="After commission" />
        <Stat label="Revenue (30 days, net)" value={formatMoney(Math.round(s.gross30 * 0.92))} sub="Gross less 8% commission" />
      </div>
      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2 [&>section]:min-w-0">
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Next departures today <span className="text-sm font-normal text-ink-3">({allToday.length} today)</span></h2><Link href="/operator/departures" className="text-sm font-semibold text-coral-700">All departures</Link></div>
          <Table head={["Time", "Route", "Load", "Status"]} empty={today.length ? undefined : "No more departures today."}>
            {today.map((t) => {
              const taken = t.sold + t.external + t.blocked;
              return (
                <tr key={t.id}><td className="font-semibold tabular"><Link href={`/operator/departures/${t.id}`} className="hover:underline">{formatTime(t.departure_at)}</Link></td><td>{t.route}<span className="block text-xs text-ink-3">{t.plate}</span></td>
                  <td className="tabular">{taken}/{t.capacity}<div className="mt-1 h-1.5 w-24 rounded-full bg-surface-3"><div className="h-full rounded-full bg-navy-600" style={{ width: `${(taken / t.capacity) * 100}%` }} /></div></td>
                  <td><Badge tone={t.status === "delayed" ? "warning" : t.status === "cancelled" ? "danger" : t.status === "arrived" ? "neutral" : "info"}>{t.status.replace("_", " ")}</Badge></td></tr>
              );
            })}
          </Table>
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recent Goroada bookings</h2>
          <Table head={["Booking", "Route", "Pax", "Gross"]} empty={s.recent.length ? undefined : "No bookings yet."}>
            {s.recent.map((r) => <tr key={r.reference + r.route}><td><span className="font-mono">{r.reference}</span><span className="block text-xs text-ink-3">{r.contact_name}</span></td><td>{r.route}<span className="block text-xs text-ink-3">{formatDate(r.departure_at, undefined, "weekday")} {formatTime(r.departure_at)}</span></td><td className="tabular">{r.pax}</td><td className="tabular">{formatMoney(r.total)}</td></tr>)}
          </Table>
        </section>
      </div>
    </>
  );
}
