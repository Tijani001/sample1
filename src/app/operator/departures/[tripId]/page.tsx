import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/server";
import { requireOperator } from "@/lib/auth/guards";
import { getTrip } from "@/lib/services/search";
import { getSeatMap } from "@/lib/services/inventory";
import { tripManifest } from "@/lib/services/operator";
import { PageHeader } from "@/components/portal/shell";
import { formatDate, formatTime } from "@/lib/domain/time";
import { DepartureControls, InventoryEditor, Manifest } from "./client";

export const metadata = { title: "Departure" };

export default async function DepartureDetail({ params }: { params: Promise<{ tripId: string }> }) {
  const u = await requireOperator();
  const { tripId } = await params;
  const db = await getDb();
  const trip = await getTrip(db, tripId);
  if (!trip || trip.operator.id !== u.operator.id) notFound();
  const [manifest, seatMap, events] = await Promise.all([
    tripManifest(db, u.operator.id, tripId),
    getSeatMap(db, tripId),
    db.query<{ message: string; created_at: Date; status: string | null }>(`select message, created_at, status from journey_events where trip_id = $1 order by created_at desc limit 10`, [tripId]),
  ]);
  const releasable = (await db.query<{ seat_no: string }>(`select seat_no from seat_inventory where trip_id = $1 and status in ('blocked','external')`, [tripId])).map((r) => r.seat_no);
  const canSeeContacts = u.operator.role !== "agent";
  return (
    <>
      <Link href={`/operator/departures?date=${trip.serviceDate}`} className="text-sm text-ink-3 hover:text-ink">← Departures</Link>
      <PageHeader title={`${trip.origin.cityName} → ${trip.destination.cityName}`} subtitle={`${formatDate(trip.departureAt, trip.tz, "long")} · ${formatTime(trip.departureAt, trip.tz)} from ${trip.origin.terminalName} · ${trip.vehicle.model}`} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6 min-w-0">
          <Manifest tripId={tripId} rows={manifest.map((m) => ({ ...m, boarded_at: m.boarded_at ? new Date(m.boarded_at).toISOString() : null, phone: canSeeContacts ? m.phone : m.phone ? `${m.phone.slice(0, 7)}•••${m.phone.slice(-2)}` : null, nok_phone: canSeeContacts ? m.nok_phone : null }))} />
          {seatMap && seatMap.seatingMode === "assigned" && <InventoryEditor tripId={tripId} map={seatMap} releasable={releasable} />}
        </div>
        <div className="space-y-6">
          <DepartureControls tripId={tripId} status={trip.status} delayMin={trip.delayMin} />
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-semibold">Journey log</h2>
            <ul className="mt-3 space-y-3 text-[14px]">
              {events.length === 0 && <li className="text-ink-3">No updates posted yet.</li>}
              {events.map((e, i) => <li key={i}><p>{e.message}</p><p className="text-xs text-ink-3">{formatTime(e.created_at)} · {formatDate(e.created_at, undefined, "weekday")}</p></li>)}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
