"use client";
import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, ChevronDown, Luggage, MapPin, Star, Armchair, Info } from "lucide-react";
import type { TripResult } from "@/lib/services/search";
import { formatMoney } from "@/lib/domain/money";
import { formatDuration, formatTime, dayOffsetLabel } from "@/lib/domain/time";
import { OperatorLogo } from "@/components/operator-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { AmenityIcons, AMENITIES } from "./amenities";

export type TripTag = "cheapest" | "fastest" | "best_value";
const TAGS: Record<TripTag, { label: string; tone: "success" | "info" | "coral" }> = {
  cheapest: { label: "Cheapest", tone: "success" },
  fastest: { label: "Fastest", tone: "info" },
  best_value: { label: "Best value", tone: "coral" },
};

export function JourneyLine({ trip, compact }: { trip: TripResult; compact?: boolean }) {
  const dep = new Date(trip.departureAt);
  const arr = new Date(trip.arrivalEstAt);
  const plus = dayOffsetLabel(dep, arr, trip.tz);
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
      <div>
        <p className={cn("font-semibold leading-none tabular", compact ? "text-lg" : "text-[22px]")}>{formatTime(dep, trip.tz)}</p>
        <p className="mt-1.5 max-w-[140px] truncate text-[13px] text-ink-3">{trip.origin.terminalName.replace(" Terminal", "")}</p>
      </div>
      <div className="flex min-w-[64px] flex-col items-center px-1">
        <span className="text-xs text-ink-3 tabular">{formatDuration(trip.durationMin)}</span>
        <div className="relative my-1.5 flex h-2 w-full items-center">
          <span className="h-2 w-2 shrink-0 rounded-full border-2 border-navy-600 bg-white" />
          <span className="h-[2px] flex-1 bg-navy-200" />
          {trip.stops.map((s, i) => (
            <span key={i} title={s.name} className={cn("absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full", s.kind === "pickup" ? "bg-coral-500" : "bg-navy-300")} style={{ left: `${Math.min(92, Math.max(8, (s.offsetMin / trip.durationMin) * 100))}%` }} />
          ))}
          <span className="h-2 w-2 shrink-0 rounded-full bg-navy-600" />
        </div>
        <span className="text-xs text-ink-3">{trip.direct ? (trip.stops.length ? `${trip.stops.length} rest stop${trip.stops.length > 1 ? "s" : ""}` : "Direct") : `${trip.stops.filter((s) => s.kind === "pickup").length} pickup stop`}</span>
      </div>
      <div className="text-right">
        <p className={cn("font-semibold leading-none tabular", compact ? "text-lg" : "text-[22px]")}>
          <span className="sr-only">Estimated arrival </span>~{formatTime(arr, trip.tz)}
          {plus && <sup className="ml-0.5 text-xs font-medium text-coral-700">{plus}</sup>}
        </p>
        <p className="mt-1.5 max-w-[140px] truncate text-[13px] text-ink-3">{trip.destination.terminalName.replace(" Terminal", "")}</p>
      </div>
    </div>
  );
}

export function TripCard({ trip, tags, pax, onSelect, selectHref, selectLabel = "Select", detailsHref, selected }: {
  trip: TripResult; tags: TripTag[]; pax: number; onSelect?: () => void; selectHref?: string; selectLabel?: string; detailsHref: string; selected?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const soldOut = trip.seatsLeft === 0;
  const notEnough = !soldOut && trip.seatsLeft < pax;
  const disabled = !trip.bookable || notEnough;
  const low = trip.seatsLeft > 0 && trip.seatsLeft <= 5;
  const cta = disabled ? (
    <Button size="md" disabled className="w-full sm:w-auto sm:min-w-[120px]">{soldOut ? "Sold out" : notEnough ? `Only ${trip.seatsLeft} left` : "Closed"}</Button>
  ) : selectHref ? (
    <Button asChild size="md" className="w-full sm:w-auto sm:min-w-[120px]"><Link href={selectHref}>{selectLabel}</Link></Button>
  ) : (
    <Button size="md" onClick={onSelect} className="w-full sm:w-auto sm:min-w-[120px]">{selectLabel}</Button>
  );

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={cn("overflow-hidden rounded-2xl border bg-white transition-shadow", selected ? "border-coral-500 ring-1 ring-coral-500" : "border-line hover:shadow-md", disabled && "bg-surface-2/50")}
      aria-label={`${trip.operator.name}, departs ${formatTime(trip.departureAt, trip.tz)}, ${formatMoney(trip.fare)}`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <OperatorLogo initials={trip.operator.initials} color={trip.operator.color} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate text-[15.5px] font-semibold">{trip.operator.name}</h3>
              {trip.operator.verified && <BadgeCheck className="h-4 w-4 text-navy-500" aria-label="Verified operator" />}
              {tags.map((t) => <Badge key={t} tone={TAGS[t].tone}>{TAGS[t].label}</Badge>)}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-3">
              {trip.operator.rating && (
                <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /><span className="font-medium text-ink tabular">{trip.operator.rating.toFixed(1)}</span><span className="tabular">({trip.operator.ratingCount.toLocaleString()})</span> ·</span>
              )}
              <span>{trip.vehicle.typeName}</span>
              {trip.operator.isDemo && <span className="text-ink-4">· Demo</span>}
            </p>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-[22px] font-semibold leading-none tabular">{formatMoney(trip.fare)}</p>
            <p className="mt-1 text-xs text-ink-3">per passenger</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8">
          <JourneyLine trip={trip} />
          <div className="hidden sm:block">{cta}</div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-dashed border-line pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            <span className={cn("inline-flex items-center gap-1.5 font-medium tabular", soldOut ? "text-ink-3" : low ? "text-coral-700" : "text-success")}>
              <Armchair className="h-4 w-4" />{soldOut ? "Sold out" : `${trip.seatsLeft} seat${trip.seatsLeft === 1 ? "" : "s"} left`}
            </span>
            <AmenityIcons items={trip.vehicle.amenities} />
            <span className={cn("text-ink-3", trip.policy.refundable && "text-ink-2")}>{trip.policy.refundable ? trip.policy.name === "Flexible" ? "Free cancellation 24h+" : "Partly refundable" : "Non-refundable"}</span>
            {trip.seatingMode === "open" && <span className="text-ink-3">Seats assigned at boarding</span>}
          </div>
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="-mr-2 inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-navy-600 hover:bg-surface-2">
            {open ? "Hide details" : "Details"}
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-4 sm:hidden">
          <div>
            <p className="text-xl font-semibold leading-none tabular">{formatMoney(trip.fare)}</p>
            <p className="mt-1 text-xs text-ink-3">per passenger</p>
          </div>
          <div className="w-[48%]">{cta}</div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24 }} className="overflow-hidden border-t border-line bg-surface-2/50">
            <div className="grid gap-6 p-4 sm:grid-cols-2 sm:p-5">
              <div>
                <h4 className="text-sm font-semibold">Route</h4>
                <ol className="mt-3 space-y-0">
                  {[{ name: trip.origin.terminalName, sub: trip.origin.address, t: trip.departureAt, kind: "start" as const }, ...trip.stops.map((s) => ({ name: s.name, sub: s.kind === "pickup" ? "Pickup stop" : `Rest stop · ${s.dwellMin} min`, t: new Date(new Date(trip.departureAt).getTime() + s.offsetMin * 60000).toISOString(), kind: s.kind })), { name: trip.destination.terminalName, sub: trip.destination.address, t: trip.arrivalEstAt, kind: "end" as const }].map((p, i, arr) => (
                    <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                      {i < arr.length - 1 && <span className="absolute left-[5px] top-3 h-full w-[2px] bg-navy-100" aria-hidden />}
                      <span className={cn("relative mt-1 h-3 w-3 shrink-0 rounded-full border-2", p.kind === "start" || p.kind === "end" ? "border-navy-600 bg-white" : "border-navy-300 bg-navy-100")} />
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium"><span className="mr-2 tabular text-ink-3">{i === 0 ? "" : "~"}{formatTime(p.t, trip.tz)}</span>{p.name}</p>
                        <p className="truncate text-[13px] text-ink-3">{p.sub}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-3"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Arrival and stop times are estimates based on the operator&apos;s schedule. Departure time is scheduled.</p>
              </div>
              <div className="space-y-4 text-[14px]">
                <div>
                  <h4 className="text-sm font-semibold">Vehicle</h4>
                  <p className="mt-1 text-ink-2">{trip.vehicle.model}</p>
                  <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-3">{trip.vehicle.amenities.map((a) => <li key={a}>{AMENITIES[a]?.label}</li>)}</ul>
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Cancellation · {trip.policy.name}</h4>
                  <p className="mt-1 text-ink-3">{trip.policy.summary}</p>
                </div>
                <div className="flex items-center gap-2 text-ink-3"><Luggage className="h-4 w-4" />1 bag up to 20 kg + 1 hand item included</div>
                <div className="flex items-center gap-2 text-ink-3"><MapPin className="h-4 w-4" />{trip.distanceKm} km by road</div>
                <Link href={detailsHref} className="inline-flex items-center gap-1 text-sm font-semibold text-coral-700 hover:text-coral-800">Full trip details, reviews and map →</Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
