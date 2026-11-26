import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb, getSessionUser } from "@/lib/server";
import { canAccessBooking } from "@/lib/auth/session";
import { findBookingIdByReference, getBookingView } from "@/lib/services/bookings";
import { nowMs } from "@/lib/domain/time";
import { getJourneyState } from "@/lib/services/journey";
import { JourneyTracker } from "@/components/map/journey-tracker";
import { AutoRefresh } from "../../../checkout/return/auto-refresh";
import { ShareJourney } from "./share";

export const metadata: Metadata = { title: "Track journey", robots: { index: false } };

export default async function TrackPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const db = await getDb();
  const id = await findBookingIdByReference(db, ref);
  if (!id) notFound();
  const b = await getBookingView(db, id);
  if (!b || !(await canAccessBooking({ id: b.id, userId: b.userId }, await getSessionUser()))) redirect(`/trips/${ref}`);
  const seg = b.segments.find((s) => new Date(s.trip.arrivalEstAt).getTime() > nowMs() - 6 * 3600_000) ?? b.segments[b.segments.length - 1];
  const state = await getJourneyState(db, seg.trip.id, b.confirmedAt);
  if (!state) notFound();
  return (
    <div className="container-page py-6 sm:py-10">
      <Link href={`/trips/${b.reference}`} className="text-sm text-ink-3 hover:text-ink">← Booking {b.reference}</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{seg.trip.origin.cityName} → {seg.trip.destination.cityName}</h1>
          <p className="text-base text-ink-3">{seg.trip.operator.name} · {seg.trip.vehicle.model}</p>
        </div>
        <ShareJourney bookingId={b.id} />
      </div>
      <div className="mt-6"><JourneyTracker state={state} /></div>
      <AutoRefresh seconds={30} />
    </div>
  );
}
