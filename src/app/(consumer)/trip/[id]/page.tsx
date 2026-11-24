import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Camera, ClipboardList, Luggage, MapPin, ShieldCheck, Star, Users, Info } from "lucide-react";
import { getDb } from "@/lib/server";
import { getTrip } from "@/lib/services/search";
import { JourneyLine } from "@/components/trip/trip-card";
import { AmenityList } from "@/components/trip/amenities";
import { RouteMap } from "@/components/map/route-map";
import { OperatorLogo } from "@/components/operator-badge";
import { Badge, Notice } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/domain/money";
import { SERVICE_FEE_PER_PASSENGER_JOURNEY } from "@/lib/domain/pricing";
import { formatDate, formatDuration, formatTime } from "@/lib/domain/time";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const trip = await getTrip(await getDb(), (await params).id);
  return { title: trip ? `${trip.origin.cityName} to ${trip.destination.cityName} · ${trip.operator.name}` : "Trip" };
}

export default async function TripDetails({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pax?: string }> }) {
  const { id } = await params;
  const pax = Math.min(10, Math.max(1, Number((await searchParams).pax) || 1));
  const db = await getDb();
  const trip = await getTrip(db, id);
  if (!trip) notFound();
  const reviews = await db.query<{ id: string; author_name: string; rating: number; comment: string | null; route_label: string | null; is_demo: boolean; created_at: Date }>(
    `select id, author_name, rating, comment, route_label, is_demo, created_at from reviews where operator_id = $1 order by created_at desc limit 6`, [trip.operator.id]);
  const stopsGeo = await db.query<{ name: string; lat: number; lng: number }>(`select rs.name, c.lat, c.lng from route_stops rs join cities c on c.id = rs.city_id where rs.route_id = $1 order by seq`, [trip.routeId]);
  const total = (trip.fare + SERVICE_FEE_PER_PASSENGER_JOURNEY) * pax;
  const bookHref = `/book?out=${trip.id}&pax=${pax}`;
  const canBook = trip.bookable && trip.seatsLeft >= pax;
  const section = "rounded-2xl border border-line bg-white p-5 sm:p-6";
  const h2 = "text-lg font-semibold";

  return (
    <div className="pb-32 lg:pb-16">
      <div className="container-page pt-6">
        <Link href={`/search?from=${trip.origin.cityId}&to=${trip.destination.cityId}&date=${trip.serviceDate}&pax=${pax}`} className="text-sm text-ink-3 hover:text-ink">← Back to results</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <OperatorLogo initials={trip.operator.initials} color={trip.operator.color} size="lg" />
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">{trip.origin.cityName} to {trip.destination.cityName}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[15px] text-ink-3">
              <span className="inline-flex items-center gap-1 font-medium text-ink">{trip.operator.name}{trip.operator.verified && <BadgeCheck className="h-4 w-4 text-navy-500" aria-label="Verified" />}</span>
              {trip.operator.rating && <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{trip.operator.rating.toFixed(1)} ({trip.operator.ratingCount.toLocaleString()})</span>}
              <span>· {formatDate(trip.departureAt, trip.tz, "long")}</span>
              {trip.operator.isDemo && <Badge tone="warning">Demo operator</Badge>}
            </p>
          </div>
        </div>
      </div>

      <div className="container-page mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <section className={section} aria-labelledby="sched">
            <h2 id="sched" className="sr-only">Schedule</h2>
            <JourneyLine trip={trip} />
            <div className="mt-5 grid gap-4 border-t border-line pt-5 text-[14px] sm:grid-cols-2">
              {[trip.origin, trip.destination].map((t, i) => (
                <div key={t.terminalId} className="flex gap-3">
                  <MapPin className={i ? "mt-0.5 h-4 w-4 text-coral-600" : "mt-0.5 h-4 w-4 text-navy-600"} />
                  <div>
                    <p className="font-medium">{i ? "Arrive" : "Depart"} · {t.terminalName}</p>
                    <p className="text-ink-3">{t.address}</p>
                    <a className="text-[13px] font-medium text-coral-700" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`}>Open in maps</a>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-start gap-1.5 text-xs text-ink-3"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Departure at {formatTime(trip.departureAt, trip.tz)} is scheduled. Arrival ~{formatTime(trip.arrivalEstAt, trip.tz)} is an estimate ({formatDuration(trip.durationMin)}, {trip.distanceKm} km) and may vary with traffic and road conditions.</p>
          </section>

          <section className={section} aria-labelledby="route">
            <h2 id="route" className={h2}>Route</h2>
            <RouteMap className="mt-4 aspect-[16/9]" origin={{ name: trip.origin.cityName, lat: trip.origin.lat!, lng: trip.origin.lng! }} destination={{ name: trip.destination.cityName, lat: trip.destination.lat!, lng: trip.destination.lng! }} stops={stopsGeo} />
            <ol className="mt-5 space-y-3 text-[14px]">
              {trip.stops.length === 0 ? <li className="text-ink-3">No scheduled stops. Drivers may take short comfort breaks.</li> : trip.stops.map((s) => (
                <li key={s.name} className="flex justify-between gap-3"><span><b className="font-medium">{s.name}</b> <span className="text-ink-3">· {s.kind === "pickup" ? "pickup stop" : `rest stop, ${s.dwellMin} min`}</span></span><span className="text-ink-3 tabular">~{formatTime(new Date(new Date(trip.departureAt).getTime() + s.offsetMin * 60000), trip.tz)}</span></li>
              ))}
            </ol>
          </section>

          <section className={section} aria-labelledby="veh">
            <h2 id="veh" className={h2}>Vehicle</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_1fr]">
              <dl className="space-y-2 text-[14px]">
                <div className="flex justify-between"><dt className="text-ink-3">Model</dt><dd className="font-medium">{trip.vehicle.model}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-3">Type</dt><dd className="font-medium">{trip.vehicle.typeName}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-3">Capacity</dt><dd className="font-medium tabular">{trip.capacity} seats</dd></div>
                <div className="flex justify-between"><dt className="text-ink-3">Seating</dt><dd className="font-medium">{trip.seatingMode === "assigned" ? "Choose your seat" : "Assigned at boarding"}</dd></div>
              </dl>
              <div className="grid place-items-center rounded-xl bg-surface-2 p-6 text-center text-[13px] text-ink-3"><Camera className="mb-2 h-6 w-6" />The operator hasn&apos;t uploaded vehicle photos yet.</div>
            </div>
            <h3 className="mb-3 mt-6 text-sm font-semibold">Amenities confirmed by the operator</h3>
            <AmenityList items={trip.vehicle.amenities} />
          </section>

          <section className={section} aria-labelledby="policies">
            <h2 id="policies" className={h2}>Policies and boarding</h2>
            <div className="mt-4 grid gap-5 text-[14px] sm:grid-cols-2">
              <div className="flex gap-3"><Luggage className="mt-0.5 h-5 w-5 shrink-0 text-navy-500" /><div><p className="font-medium">Luggage allowance</p><p className="text-ink-3">1 bag up to 20 kg in the hold plus 1 small hand item. Extra bags can be added at checkout.</p></div></div>
              <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-navy-500" /><div><p className="font-medium">Cancellation · {trip.policy.name}</p><p className="text-ink-3">{trip.policy.summary}</p></div></div>
              <div className="flex gap-3"><ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-navy-500" /><div><p className="font-medium">Refunds</p><p className="text-ink-3">{trip.policy.refundable ? "Refunds go back to your original payment method within 5–10 working days. The booking fee is non-refundable unless the operator cancels." : "Fare is non-refundable. If the operator cancels, you get a full refund including fees."}{trip.policy.allowsReschedule && ` Date changes allowed${trip.policy.rescheduleFee ? ` for ${formatMoney(trip.policy.rescheduleFee)}` : " free of charge"}.`}</p></div></div>
              <div className="flex gap-3"><Users className="mt-0.5 h-5 w-5 shrink-0 text-navy-500" /><div><p className="font-medium">Boarding</p><p className="text-ink-3">Arrive 45 minutes before departure with your QR ticket and a valid photo ID. Boarding closes 10 minutes before departure.</p></div></div>
            </div>
          </section>

          <section className={section} aria-labelledby="reviews">
            <div className="flex items-end justify-between gap-3">
              <h2 id="reviews" className={h2}>Passenger reviews</h2>
              {trip.operator.rating && <p className="text-sm text-ink-3"><span className="text-xl font-semibold text-ink">{trip.operator.rating.toFixed(1)}</span> / 5 · {trip.operator.ratingCount.toLocaleString()} ratings</p>}
            </div>
            {reviews.some((r) => r.is_demo) && <Notice tone="neutral" className="mt-3">Reviews below are demonstration data for this development build.</Notice>}
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-xl bg-surface-2/70 p-4 text-[14px]">
                  <div className="flex items-center justify-between"><span className="font-medium">{r.author_name}</span><span className="flex" aria-label={`${r.rating} out of 5`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={n <= r.rating ? "h-3.5 w-3.5 fill-amber-400 text-amber-400" : "h-3.5 w-3.5 text-line-strong"} />)}</span></div>
                  {r.comment && <p className="mt-2 text-ink-2">{r.comment}</p>}
                  <p className="mt-2 text-xs text-ink-3">{r.route_label} · {formatDate(r.created_at)}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-line bg-white p-5 shadow-sm">
            <p className="text-sm text-ink-3">Fare per passenger</p>
            <p className="text-3xl font-semibold tabular">{formatMoney(trip.fare)}</p>
            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-[14px]">
              <div className="flex justify-between"><dt className="text-ink-3">Fare × {pax}</dt><dd className="tabular">{formatMoney(trip.fare * pax)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">Booking fee × {pax}</dt><dd className="tabular">{formatMoney(SERVICE_FEE_PER_PASSENGER_JOURNEY * pax)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Total</dt><dd className="tabular">{formatMoney(total)}</dd></div>
            </dl>
            <p className={`mt-3 text-sm font-medium ${trip.seatsLeft <= 5 ? "text-coral-700" : "text-success"}`}>{trip.seatsLeft} of {trip.capacity} seats available</p>
            {canBook ? <Button asChild size="lg" className="mt-4 w-full"><Link href={bookHref}>{trip.seatingMode === "assigned" ? "Choose seats" : "Continue"}</Link></Button> : <Button size="lg" className="mt-4 w-full" disabled>Not available</Button>}
            <p className="mt-3 text-center text-xs text-ink-3">Premium seats and add-ons, if any, are shown before payment.</p>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-white px-4 py-3 shadow-[0_-8px_24px_rgb(16_42_67/0.06)] md:bottom-0 lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <div className="flex-1"><p className="text-xs text-ink-3">Total for {pax}</p><p className="text-lg font-semibold tabular">{formatMoney(total)}</p></div>
          {canBook ? <Button asChild size="lg" className="flex-1"><Link href={bookHref}>Choose seats</Link></Button> : <Button size="lg" disabled className="flex-1">Not available</Button>}
        </div>
      </div>
    </div>
  );
}
