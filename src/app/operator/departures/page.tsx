import Link from "next/link";
import { getDb } from "@/lib/server";
import { requireOperator } from "@/lib/auth/guards";
import { departuresForDate } from "@/lib/services/operator";
import { PageHeader, Table } from "@/components/portal/shell";
import { Badge } from "@/components/ui/primitives";
import { addDaysIso, formatDate, formatTime, isIsoDate, todayIso } from "@/lib/domain/time";
import { cn } from "@/lib/cn";

export const metadata = { title: "Departures" };

export default async function Departures({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const u = await requireOperator();
  const sp = await searchParams;
  const today = todayIso();
  const date = isIsoDate(sp.date) ? sp.date : today;
  const rows = await departuresForDate(await getDb(), u.operator.id, date);
  const days = Array.from({ length: 10 }, (_, i) => addDaysIso(today, i - 2));
  return (
    <>
      <PageHeader title="Departures" subtitle="Manifests, seat inventory, boarding and journey updates" />
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto">
        {days.map((d) => <Link key={d} href={`/operator/departures?date=${d}`} className={cn("shrink-0 rounded-xl border px-3 py-2 text-center text-sm", d === date ? "border-navy-600 bg-navy-600 text-white" : "border-line bg-white")}>{d === today ? "Today" : formatDate(`${d}T12:00:00Z`, "UTC", "weekday")}</Link>)}
      </div>
      <Table head={["Departure", "Route", "Vehicle", "Goroada", "Other channels", "Boarded", "Status"]} empty={rows.length ? undefined : "No departures scheduled for this date."}>
        {rows.map((t) => (
          <tr key={t.id} className="hover:bg-surface-2/60">
            <td><Link href={`/operator/departures/${t.id}`} className="font-semibold text-navy-700 hover:underline tabular">{formatTime(t.departure_at)}</Link></td>
            <td>{t.route}</td>
            <td>{t.plate}<span className="block text-xs text-ink-3">{t.model}</span></td>
            <td className="tabular">{t.sold}{t.held > 0 && <span className="text-xs text-ink-3"> (+{t.held} held)</span>}</td>
            <td className="tabular">{t.external + t.blocked}</td>
            <td className="tabular">{t.boarded}/{t.tickets}</td>
            <td><Badge tone={t.status === "delayed" ? "warning" : t.status === "cancelled" ? "danger" : t.status === "arrived" ? "neutral" : "info"}>{t.status.replace("_", " ")}{t.status === "delayed" && ` +${t.delay_min}m`}</Badge></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
