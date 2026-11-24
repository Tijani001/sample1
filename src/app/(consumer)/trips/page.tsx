import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Luggage, Search, Ticket, Clock } from "lucide-react";
import { getDb, getSessionUser } from "@/lib/server";
import { grantedBookingIds } from "@/lib/auth/session";
import { getBookingView, listBookingsForUser, type BookingView } from "@/lib/services/bookings";
import { JOURNEY_STATUS_META } from "@/lib/domain/status";
import { formatDate, formatTime, nowMs } from "@/lib/domain/time";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { OperatorLogo } from "@/components/operator-badge";
import { CityImage } from "@/components/city-image";
import { TabLinks } from "@/components/ui/tab-links";

export const metadata: Metadata = { title: "My Trips" };

type B = NonNullable<BookingView>;
function bucket(b: B): "upcoming" | "completed" | "cancelled" {
  if (["cancelled", "refunded", "refund_pending", "expired", "needs_reconciliation"].includes(b.status)) return "cancelled";
  const last = b.segments[b.segments.length - 1];
  if (b.status === "confirmed" && (last.journeyStatus === "arrived" || new Date(last.trip.arrivalEstAt).getTime() < nowMs() - 3 * 3600_000)) return "completed";
  return "upcoming";
}

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab = (["upcoming", "completed", "cancelled"].includes(rawTab ?? "") ? rawTab : "upcoming") as "upcoming" | "completed" | "cancelled";
  const db = await getDb();
  const user = await getSessionUser();
  const list: B[] = user ? await listBookingsForUser(db, user.id) : [];
  for (const id of await grantedBookingIds()) {
    if (list.some((b) => b.id === id)) continue;
    const v = await getBookingView(db, id);
    if (v && !["expired"].includes(v.status) && !(v.status === "awaiting_payment" && new Date(v.holdExpiresAt) < new Date())) list.push(v);
  }
  const groups = { upcoming: [] as B[], completed: [] as B[], cancelled: [] as B[] };
  for (const b of list) groups[bucket(b)].push(b);
  groups.upcoming.sort((a, b) => a.segments[0].trip.departureAt.localeCompare(b.segments[0].trip.departureAt));
  groups.completed.sort((a, b) => b.segments[0].trip.departureAt.localeCompare(a.segments[0].trip.departureAt));
  const items = groups[tab];

  return (
    <div className="container-page py-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">My Trips</h1>
          <p className="mt-1 text-[15px] text-ink-3">{user ? "All your Goroada bookings." : "Bookings made in this browser. Sign in to see trips from all your devices."}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/trips/find"><Search className="h-4 w-4" />Find a booking</Link></Button>
          {!user && <Button asChild variant="navy" size="sm"><Link href="/signin?next=/trips">Sign in</Link></Button>}
        </div>
      </div>
      <TabLinks className="mt-6" active={tab} tabs={[
        { id: "upcoming", label: "Upcoming", count: groups.upcoming.length, href: "/trips?tab=upcoming" },
        { id: "completed", label: "Completed", count: groups.completed.length, href: "/trips?tab=completed" },
        { id: "cancelled", label: "Cancelled", count: groups.cancelled.length, href: "/trips?tab=cancelled" },
      ]} />
      <div className="mt-6">
        {items.length === 0 ? (
          <EmptyState icon={tab === "upcoming" ? <Luggage className="h-6 w-6" /> : <Ticket className="h-6 w-6" />}
            title={tab === "upcoming" ? "No upcoming trips" : tab === "completed" ? "No completed trips yet" : "No cancelled trips"}
            action={tab === "upcoming" ? <Button asChild><Link href="/">Plan a trip</Link></Button> : undefined}>
            {tab === "upcoming" ? "When you book a journey, your tickets will appear here, ready for boarding." : tab === "completed" ? "Trips you've taken will appear here so you can rebook or rate them." : "Cancelled and refunded bookings will appear here."}
          </EmptyState>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {items.map((b) => <TripListCard key={b.id} b={b} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function TripListCard({ b }: { b: B }) {
  const s = b.segments[0];
  const meta = JOURNEY_STATUS_META[s.journeyStatus];
  const hours = (new Date(s.trip.departureAt).getTime() - nowMs()) / 3600_000;
  const tone = meta.tone === "neutral" ? "neutral" : meta.tone;
  return (
    <li>
      <Link href={`/trips/${b.reference}`} className="group flex overflow-hidden rounded-2xl border border-line bg-white transition hover:border-line-strong hover:shadow-md">
        <CityImage src={null} alt="" name={s.trip.destination.cityName} className="hidden w-28 shrink-0 sm:block" />
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-[17px] font-semibold">{s.trip.origin.cityName}<ArrowRight className="h-4 w-4 text-ink-3" />{s.trip.destination.cityName}</p>
              <p className="mt-0.5 text-[13.5px] text-ink-3 tabular">{formatDate(s.trip.departureAt, s.trip.tz, "weekday")} · {formatTime(s.trip.departureAt, s.trip.tz)}{b.tripType === "round_trip" && ` · Return ${formatDate(b.segments[1]?.trip.departureAt ?? s.trip.departureAt, s.trip.tz, "weekday")}`}</p>
            </div>
            <Badge tone={tone as "neutral"}>{meta.label}</Badge>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[13px] text-ink-2">
            <OperatorLogo initials={s.trip.operator.initials} color={s.trip.operator.color} size="sm" className="h-6 w-6 rounded-md text-[9px]" />
            <span className="truncate">{s.trip.operator.name}</span>
            <span className="text-ink-4">·</span>
            <span className="font-mono">{b.reference}</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-dashed border-line pt-3 text-[13px]">
            <span className="text-ink-3 tabular">{s.trip.seatingMode === "open" ? "Seats at boarding" : `Seat${s.seats.length > 1 ? "s" : ""} ${s.seats.map((x) => x.seatNo).join(", ")}`} · {b.passengerCount} pax</span>
            {b.status === "confirmed" && hours > 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold text-coral-700"><Clock className="h-3.5 w-3.5" />{hours < 48 ? `in ${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m` : `in ${Math.round(hours / 24)} days`} · View ticket</span>
            ) : <span className="font-semibold text-navy-600 group-hover:underline">View details</span>}
          </div>
        </div>
      </Link>
    </li>
  );
}
