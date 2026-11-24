import type { Metadata } from "next";
import { getDb } from "@/lib/server";
import { getJourneyState } from "@/lib/services/journey";
import { JourneyTracker } from "@/components/map/journey-tracker";
import { EmptyState } from "@/components/ui/primitives";
import { LinkIcon } from "lucide-react";
import { AutoRefresh } from "../../checkout/return/auto-refresh";
import { formatDate } from "@/lib/domain/time";

export const metadata: Metadata = { title: "Shared journey", robots: { index: false, follow: false } };

/** Public, time-limited view shared by a traveller. Shows the journey only: no names, seats or contact details. */
export default async function SharedTrack({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const [s] = await db.query<{ trip_id: string; expires_at: Date; revoked_at: Date | null }>(
    `select bs.trip_id, ts.expires_at, ts.revoked_at from tracking_shares ts join booking_segments bs on bs.id = ts.segment_id where ts.token = $1`, [token.slice(0, 60)]);
  if (!s || s.revoked_at || new Date(s.expires_at) < new Date()) {
    return <div className="container-page py-16"><EmptyState icon={<LinkIcon className="h-6 w-6" />} title="This tracking link has expired">Shared journey links stop working 12 hours after the estimated arrival. Ask the traveller for a new link.</EmptyState></div>;
  }
  const state = await getJourneyState(db, s.trip_id, null);
  if (!state) return null;
  return (
    <div className="container-page py-6 sm:py-10">
      <p className="text-sm font-medium text-coral-700">Shared journey</p>
      <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{state.trip.origin.cityName} → {state.trip.destination.cityName}</h1>
      <p className="text-[15px] text-ink-3">{state.trip.operator.name} · {formatDate(state.trip.departureAt, state.trip.tz, "long")} · link expires {formatDate(s.expires_at, state.trip.tz, "weekday")}</p>
      <div className="mt-6"><JourneyTracker state={state} shared /></div>
      <AutoRefresh seconds={30} />
    </div>
  );
}
