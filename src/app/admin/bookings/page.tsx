import Link from "next/link";
import { getDb } from "@/lib/server";
import { adminFor } from "../guard";
import { PageHeader, Table } from "@/components/portal/shell";
import { Badge, Input, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/portal/action-button";
import { adminCancelBookingAction } from "../actions";
import { formatMoney } from "@/lib/domain/money";
import { formatDate, formatTime } from "@/lib/domain/time";

export const metadata = { title: "Bookings" };
export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await adminFor("bookings");
  const { q = "", status = "" } = await searchParams;
  const rows = await (await getDb()).query<{ id: string; reference: string; status: string; contact_name: string | null; contact_email: string | null; total: number; created_at: Date; route: string; departure_at: Date; operator: string; provider: string | null }>(
    `select b.id, b.reference, b.status, b.contact_name, b.contact_email, b.total, b.created_at, oc.name || ' → ' || dc.name route, t.departure_at, o.name operator,
            (select provider from payments p where p.booking_id = b.id and p.status = 'success' limit 1) provider
       from bookings b join booking_segments bs on bs.booking_id = b.id and bs.direction = 'outbound' join trips t on t.id = bs.trip_id join routes r on r.id = t.route_id
       join cities oc on oc.id = r.origin_city_id join cities dc on dc.id = r.destination_city_id join operators o on o.id = t.operator_id
      where ($1 = '' or b.reference ilike '%' || $1 || '%' or b.contact_email ilike '%' || $1 || '%' or b.contact_phone like '%' || $1 || '%')
        and ($2 = '' or b.status = $2)
      order by b.created_at desc limit 100`, [q.trim(), status]);
  return (
    <>
      <PageHeader title="Bookings" subtitle="Search by reference, email or phone" />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="GR-XXXXXX, email or phone" className="h-10 max-w-xs" aria-label="Search bookings" />
        <Select name="status" defaultValue={status} className="h-10 w-48" aria-label="Status"><option value="">All statuses</option>{["confirmed", "awaiting_payment", "payment_processing", "refund_pending", "refunded", "cancelled", "expired", "needs_reconciliation"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</Select>
        <Button variant="navy" size="sm" className="h-10">Search</Button>
      </form>
      <Table head={["Booking", "Customer", "Journey", "Total", "Status", ""]} empty={rows.length ? undefined : "No bookings match."}>
        {rows.map((b) => (
          <tr key={b.id}>
            <td><Link href={`/trips/${b.reference}`} className="font-mono font-semibold text-navy-700 hover:underline">{b.reference}</Link><span className="block text-xs text-ink-3">{formatDate(b.created_at)}</span></td>
            <td>{b.contact_name ?? "—"}<span className="block text-xs text-ink-3">{b.contact_email}</span></td>
            <td>{b.route}<span className="block text-xs text-ink-3">{b.operator} · {formatDate(b.departure_at, undefined, "weekday")} {formatTime(b.departure_at)}</span></td>
            <td className="tabular">{formatMoney(b.total)}{b.provider && <span className="block text-xs text-ink-3">{b.provider === "demo" ? "sandbox" : b.provider}</span>}</td>
            <td><Badge tone={b.status === "confirmed" ? "success" : ["needs_reconciliation", "refund_pending", "awaiting_payment"].includes(b.status) ? "warning" : "neutral"}>{b.status.replace(/_/g, " ")}</Badge></td>
            <td>{b.status === "confirmed" && new Date(b.departure_at) > new Date() && <ActionButton size="sm" variant="ghost" action={adminCancelBookingAction.bind(null, b.id, "customer request via support")} confirmText={`Cancel ${b.reference} and issue a refund according to the fare rules?`}>Cancel</ActionButton>}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
