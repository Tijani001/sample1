"use client";
import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import * as Slider from "@radix-ui/react-slider";
import { ArrowLeft, ArrowRight, Check, Pencil, SearchX, SlidersHorizontal, Sun, Sunrise, Sunset, Moon, Users, ArrowUpDown, CircleCheck } from "lucide-react";
import type { Place, TripResult } from "@/lib/services/search";
import { formatMoney } from "@/lib/domain/money";
import { formatDuration, formatDate } from "@/lib/domain/time";
import { SearchWidget } from "@/components/search/search-widget";
import { TripCard, JourneyLine, type TripTag } from "@/components/trip/trip-card";
import { AMENITIES } from "@/components/trip/amenities";
import { Overlay } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { OperatorLogo } from "@/components/operator-badge";
import { pushRecent } from "@/components/search/recent";
import { cn } from "@/lib/cn";

type Query = { from: string; to: string; date: string; returnDate: string | null; pax: number; fromTerminal: string | null; toTerminal: string | null; vehicle: string | null };
type SortKey = "recommended" | "cheapest" | "fastest" | "earliest" | "latest" | "rating";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recommended", label: "Recommended" },
  { key: "cheapest", label: "Cheapest" },
  { key: "fastest", label: "Fastest" },
  { key: "earliest", label: "Earliest" },
  { key: "latest", label: "Latest" },
  { key: "rating", label: "Highest rated" },
];

const TIME_BUCKETS = [
  { id: "early", label: "Before 6am", icon: Sunrise, range: [0, 6] },
  { id: "morning", label: "6am – 12pm", icon: Sun, range: [6, 12] },
  { id: "afternoon", label: "12pm – 6pm", icon: Sunset, range: [12, 18] },
  { id: "evening", label: "After 6pm", icon: Moon, range: [18, 24] },
] as const;

const VEHICLE_CATS: Record<string, string[]> = { car: ["car", "suv"], minivan: ["minivan"], bus: ["bus"], coach: ["coach"] };
const VEHICLE_LABEL: Record<string, string> = { car: "Car / SUV", minivan: "Minivan", bus: "Bus", coach: "Coach" };

type Filters = {
  maxPrice: number | null; depart: string[]; arrive: string[]; operators: string[]; vehicles: string[]; fromTerminals: string[]; toTerminals: string[];
  maxDuration: number | null; amenities: string[]; refundable: boolean; direct: boolean; hideSoldOut: boolean;
};
const emptyFilters = (): Filters => ({ maxPrice: null, depart: [], arrive: [], operators: [], vehicles: [], fromTerminals: [], toTerminals: [], maxDuration: null, amenities: [], refundable: false, direct: false, hideSoldOut: false });

const hourIn = (iso: string, tz: string) => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: tz }).format(new Date(iso))) % 24;
const inBuckets = (h: number, ids: string[]) => !ids.length || TIME_BUCKETS.some((b) => ids.includes(b.id) && h >= b.range[0] && h < b.range[1]);

function score(t: TripResult, minFare: number, minDur: number) {
  const price = minFare / t.fare;
  const speed = minDur / t.durationMin;
  const rating = (t.operator.rating ?? 3.5) / 5;
  return price * 0.45 + speed * 0.3 + rating * 0.25;
}

export function SearchResults({ places, today, query, leg, legDate, outbound, trips, hiddenEarlier, calendar }: {
  places: Place[]; today: string; query: Query; leg: "outbound" | "return"; legDate: string; outbound: TripResult | null;
  trips: TripResult[]; hiddenEarlier: number; calendar: { date: string; minFare: number | null; trips: number }[];
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [sort, setSort] = useState<SortKey>("recommended");
  const [filters, setFilters] = useState<Filters>(() => {
    const f = emptyFilters();
    if (query.vehicle && VEHICLE_CATS[query.vehicle]) f.vehicles = [query.vehicle];
    const dep = leg === "outbound" ? query.fromTerminal : query.toTerminal;
    const arr = leg === "outbound" ? query.toTerminal : query.fromTerminal;
    if (dep) f.fromTerminals = [dep];
    if (arr) f.toTerminals = [arr];
    return f;
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const fromName = places.find((p) => p.id === query.from)?.name ?? query.from;
  const toName = places.find((p) => p.id === query.to)?.name ?? query.to;
  const legFromName = leg === "outbound" ? fromName : toName;
  const legToName = leg === "outbound" ? toName : fromName;
  const tz = trips[0]?.tz ?? "Africa/Lagos";

  useEffect(() => {
    pushRecent({ from: query.from, to: query.to, fromName, toName, date: query.date, returnDate: query.returnDate ?? undefined, pax: query.pax, tripType: query.returnDate ? "round_trip" : "one_way" });
  }, [query.from, query.to, query.date, query.returnDate, query.pax, fromName, toName]);

  const bookable = trips.filter((t) => t.bookable && t.seatsLeft >= query.pax);
  const maxFare = Math.max(0, ...trips.map((t) => t.fare));
  const minFare = Math.min(...trips.map((t) => t.fare));
  const maxDur = Math.max(0, ...trips.map((t) => t.durationMin));
  const minDur = Math.min(...trips.map((t) => t.durationMin));

  const tags = useMemo(() => {
    const m = new Map<string, TripTag[]>();
    if (bookable.length < 2) return m;
    const cheapest = Math.min(...bookable.map((t) => t.fare));
    const fastest = Math.min(...bookable.map((t) => t.durationMin));
    for (const t of bookable) {
      const tg: TripTag[] = [];
      if (t.fare === cheapest) tg.push("cheapest");
      if (t.durationMin === fastest && bookable.some((x) => x.durationMin > fastest)) tg.push("fastest");
      m.set(t.id, tg);
    }
    const best = [...bookable].sort((a, b) => score(b, cheapest, fastest) - score(a, cheapest, fastest))[0];
    if (best && !(m.get(best.id) ?? []).length && bookable.length >= 3) m.set(best.id, ["best_value"]);
    return m;
  }, [bookable]);

  const facets = useMemo(() => {
    const ops = new Map<string, { id: string; name: string; initials: string; color: string; count: number; min: number }>();
    const vehicles = new Map<string, number>();
    const fromT = new Map<string, { name: string; count: number }>();
    const toT = new Map<string, { name: string; count: number }>();
    const amen = new Map<string, number>();
    for (const t of trips) {
      const o = ops.get(t.operator.id) ?? { id: t.operator.id, name: t.operator.name, initials: t.operator.initials, color: t.operator.color, count: 0, min: Infinity };
      o.count++; o.min = Math.min(o.min, t.fare); ops.set(t.operator.id, o);
      const vc = Object.entries(VEHICLE_CATS).find(([, cats]) => cats.includes(t.vehicle.category))?.[0];
      if (vc) vehicles.set(vc, (vehicles.get(vc) ?? 0) + 1);
      fromT.set(t.origin.terminalId, { name: t.origin.terminalName, count: (fromT.get(t.origin.terminalId)?.count ?? 0) + 1 });
      toT.set(t.destination.terminalId, { name: t.destination.terminalName, count: (toT.get(t.destination.terminalId)?.count ?? 0) + 1 });
      for (const a of t.vehicle.amenities) amen.set(a, (amen.get(a) ?? 0) + 1);
    }
    return { ops: [...ops.values()], vehicles, fromT, toT, amen };
  }, [trips]);

  const apply = (list: TripResult[], f: Filters) =>
    list.filter((t) =>
      (f.maxPrice == null || t.fare <= f.maxPrice) &&
      inBuckets(hourIn(t.departureAt, t.tz), f.depart) &&
      inBuckets(hourIn(t.arrivalEstAt, t.tz), f.arrive) &&
      (!f.operators.length || f.operators.includes(t.operator.id)) &&
      (!f.vehicles.length || f.vehicles.some((v) => VEHICLE_CATS[v]?.includes(t.vehicle.category))) &&
      (!f.fromTerminals.length || f.fromTerminals.includes(t.origin.terminalId)) &&
      (!f.toTerminals.length || f.toTerminals.includes(t.destination.terminalId)) &&
      (f.maxDuration == null || t.durationMin <= f.maxDuration) &&
      f.amenities.every((a) => t.vehicle.amenities.includes(a)) &&
      (!f.refundable || t.policy.refundable) &&
      (!f.direct || t.direct) &&
      (!f.hideSoldOut || (t.bookable && t.seatsLeft >= query.pax)),
    );

  const filtered = useMemo(() => apply(trips, filters), [trips, filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const avail = (t: TripResult) => (t.bookable && t.seatsLeft >= query.pax ? 0 : 1);
    const cmp: Record<SortKey, (a: TripResult, b: TripResult) => number> = {
      recommended: (a, b) => score(b, minFare, minDur) - score(a, minFare, minDur),
      cheapest: (a, b) => a.fare - b.fare || a.departureAt.localeCompare(b.departureAt),
      fastest: (a, b) => a.durationMin - b.durationMin || a.fare - b.fare,
      earliest: (a, b) => a.departureAt.localeCompare(b.departureAt),
      latest: (a, b) => b.departureAt.localeCompare(a.departureAt),
      rating: (a, b) => (b.operator.rating ?? 0) - (a.operator.rating ?? 0) || a.fare - b.fare,
    };
    return arr.sort((a, b) => avail(a) - avail(b) || cmp[sort](a, b));
  }, [filtered, sort, query.pax, minFare, minDur]);

  const activeCount =
    (filters.maxPrice != null ? 1 : 0) + filters.depart.length + filters.arrive.length + filters.operators.length + filters.vehicles.length +
    filters.fromTerminals.length + filters.toTerminals.length + (filters.maxDuration != null ? 1 : 0) + filters.amenities.length +
    (filters.refundable ? 1 : 0) + (filters.direct ? 1 : 0) + (filters.hideSoldOut ? 1 : 0);

  const hrefWith = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    return `${pathname}?${p.toString()}`;
  };
  const dateHref = (d: string) => {
    if (leg === "return") return hrefWith({ return: d });
    return hrefWith({ date: d, return: query.returnDate && query.returnDate < d ? d : query.returnDate, out: null });
  };
  const selectHref = (t: TripResult) => {
    if (!query.returnDate) return `/book?out=${t.id}&pax=${query.pax}`;
    if (leg === "outbound") return hrefWith({ out: t.id });
    return `/book?out=${outbound!.id}&ret=${t.id}&pax=${query.pax}`;
  };

  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.querySelector('[aria-current="date"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [legDate]);

  const filterPanel = (
    <FilterPanel filters={filters} setFilters={setFilters} facets={facets} maxFare={maxFare} minFare={minFare} maxDur={maxDur} minDur={minDur} legFromName={legFromName} legToName={legToName} />
  );

  return (
    <div className="pb-16">
      {/* Search summary */}
      <div className="sticky top-14 z-30 border-b border-line bg-white/95 backdrop-blur md:top-16">
        <div className="container-page flex items-center gap-3 py-2.5">
          <Link href="/" aria-label="Back to home" className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-surface-2 md:hidden"><ArrowLeft className="h-5 w-5" /></Link>
          <button onClick={() => setEditOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-surface-2 md:flex-none md:px-3" aria-label="Edit search">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
                {fromName}{query.returnDate ? <ArrowUpDown className="h-3.5 w-3.5 rotate-90 text-ink-3" /> : <ArrowRight className="h-3.5 w-3.5 text-ink-3" />}{toName}
              </p>
              <p className="truncate text-[13px] text-ink-3 tabular">
                {formatDate(`${query.date}T12:00:00Z`, "UTC", "weekday")}{query.returnDate && ` – ${formatDate(`${query.returnDate}T12:00:00Z`, "UTC", "weekday")}`} · <Users className="inline h-3 w-3 align-[-1px]" /> {query.pax} · {query.returnDate ? "Round trip" : "One-way"}
              </p>
            </div>
            <Pencil className="ml-auto h-4 w-4 shrink-0 text-ink-3 md:ml-2" />
          </button>
          <div className="ml-auto hidden md:block"><Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>Modify search</Button></div>
        </div>
      </div>
      <Overlay open={editOpen} onOpenChange={setEditOpen} title="Modify search" size="lg" className="md:max-w-5xl">
        <SearchWidget places={places} today={today} variant="compact" initial={{ ...query }} onSubmitted={() => setEditOpen(false)} />
      </Overlay>

      <div className="container-page">
        {/* Round-trip progress */}
        {query.returnDate && (
          <ol className="mt-5 grid grid-cols-2 gap-2 text-sm" aria-label="Round trip steps">
            <li className={cn("rounded-xl border px-3 py-2.5", leg === "outbound" ? "border-coral-500 bg-coral-50/60" : "border-line bg-white")}>
              <p className="flex items-center gap-1.5 text-xs font-medium text-ink-3">{leg === "return" ? <CircleCheck className="h-3.5 w-3.5 text-success" /> : <span className="grid h-4 w-4 place-items-center rounded-full bg-coral-600 text-[10px] text-white">1</span>}Outbound</p>
              <p className="mt-0.5 truncate font-semibold">{fromName} → {toName}</p>
            </li>
            <li className={cn("rounded-xl border px-3 py-2.5", leg === "return" ? "border-coral-500 bg-coral-50/60" : "border-line bg-white")}>
              <p className="flex items-center gap-1.5 text-xs font-medium text-ink-3"><span className={cn("grid h-4 w-4 place-items-center rounded-full text-[10px]", leg === "return" ? "bg-coral-600 text-white" : "bg-surface-3 text-ink-3")}>2</span>Return</p>
              <p className="mt-0.5 truncate font-semibold">{toName} → {fromName}</p>
            </li>
          </ol>
        )}
        {leg === "return" && outbound && (
          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <OperatorLogo initials={outbound.operator.initials} color={outbound.operator.color} size="sm" />
              <div>
                <p className="text-xs font-medium text-ink-3">Outbound selected · {formatDate(outbound.departureAt, outbound.tz, "weekday")}</p>
                <p className="text-sm font-semibold">{outbound.operator.name} · {formatMoney(outbound.fare)}</p>
              </div>
            </div>
            <div className="min-w-0 flex-1 sm:px-6"><JourneyLine trip={outbound} compact /></div>
            <Link href={hrefWith({ out: null })} className="text-sm font-semibold text-coral-700 hover:text-coral-800">Change</Link>
          </div>
        )}

        <h1 className="mt-6 text-xl font-semibold sm:text-2xl">
          {leg === "return" ? "Choose your return" : query.returnDate ? "Choose your outbound trip" : `${legFromName} to ${legToName}`}
          <span className="sr-only"> on {formatDate(`${legDate}T12:00:00Z`, "UTC", "long")}</span>
        </h1>

        {/* Date strip */}
        <div ref={stripRef} className="no-scrollbar -mx-4 mt-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="list" aria-label="Nearby dates">
          {calendar.map((c) => {
            const active = c.date === legDate;
            const disabled = leg === "return" && c.date < query.date;
            const cheapestDay = c.minFare != null && c.minFare === Math.min(...calendar.filter((x) => x.minFare != null).map((x) => x.minFare!));
            return (
              <Link key={c.date} role="listitem" href={disabled ? "#" : dateHref(c.date)} scroll={false} aria-current={active ? "date" : undefined} tabIndex={disabled ? -1 : undefined}
                className={cn("relative flex min-w-[92px] shrink-0 snap-center flex-col items-center rounded-xl border px-3 py-2 text-center transition-colors",
                  active ? "border-navy-600 bg-navy-600 text-white" : "border-line bg-white hover:border-line-strong", disabled && "pointer-events-none opacity-40")}>
                <span className={cn("text-xs", active ? "text-white/80" : "text-ink-3")}>{c.date === today ? "Today" : formatDate(`${c.date}T12:00:00Z`, "UTC", "weekday").split(" ")[0]}</span>
                <span className="text-sm font-semibold tabular">{formatDate(`${c.date}T12:00:00Z`, "UTC", "weekday").split(" ").slice(1).join(" ")}</span>
                <span className={cn("text-xs tabular", active ? "text-white" : cheapestDay ? "font-semibold text-success" : "text-ink-3")}>{c.minFare != null ? formatMoney(c.minFare) : c.trips ? "Full" : "—"}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden lg:block" aria-label="Filters">
            <div className="sticky top-36 max-h-[calc(100vh-10rem)] overflow-y-auto pr-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">Filters</h2>
                {activeCount > 0 && <button onClick={() => setFilters(emptyFilters())} className="text-sm font-medium text-coral-700 hover:text-coral-800">Clear all ({activeCount})</button>}
              </div>
              {filterPanel}
            </div>
          </aside>

          <section aria-label="Trip results" className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-3" aria-live="polite">
                <span className="font-semibold text-ink tabular">{sorted.length}</span> of {trips.length} departure{trips.length === 1 ? "" : "s"}
                {hiddenEarlier > 0 && <> · {hiddenEarlier} leave before you arrive</>}
              </p>
              <div className="hidden gap-1 rounded-xl bg-surface-2 p-1 md:flex" role="tablist" aria-label="Sort by">
                {SORTS.map((s) => (
                  <button key={s.key} role="tab" aria-selected={sort === s.key} onClick={() => setSort(s.key)} className={cn("relative h-8 rounded-lg px-3 text-[13px] font-medium transition-colors", sort === s.key ? "text-ink" : "text-ink-3 hover:text-ink")}>
                    {sort === s.key && <motion.span layoutId="sort-pill" className="absolute inset-0 rounded-lg bg-white shadow-sm" />}
                    <span className="relative">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Mobile controls */}
            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:hidden lg:hidden">
              <button onClick={() => setFiltersOpen(true)} className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium", activeCount ? "border-navy-600 bg-navy-600 text-white" : "border-line-strong bg-white")}>
                <SlidersHorizontal className="h-4 w-4" />Filters{activeCount > 0 && <span className="tabular">· {activeCount}</span>}
              </button>
              <label className="relative inline-flex h-9 shrink-0 items-center rounded-full border border-line-strong bg-white pl-3.5 pr-8 text-sm font-medium">
                <span className="sr-only">Sort by</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="appearance-none bg-transparent outline-none">
                  {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <ArrowUpDown className="pointer-events-none absolute right-3 h-3.5 w-3.5" />
              </label>
              {(["direct", "refundable"] as const).map((k) => (
                <button key={k} onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))} aria-pressed={filters[k]} className={cn("inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-sm", filters[k] ? "border-navy-600 bg-navy-50 text-navy-700" : "border-line-strong bg-white")}>
                  {filters[k] && <Check className="h-3.5 w-3.5" />}{k === "direct" ? "Direct" : "Refundable"}
                </button>
              ))}
            </div>
            <div className="mt-3 hidden md:flex lg:hidden">
              <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}><SlidersHorizontal className="h-4 w-4" />Filters{activeCount > 0 && ` · ${activeCount}`}</Button>
            </div>

            <div className="mt-4 space-y-3">
              {trips.length === 0 ? (
                <EmptyState icon={<SearchX className="h-6 w-6" />} title="No departures on this date"
                  action={calendar.find((c) => c.minFare != null && c.date !== legDate) && (
                    <Button asChild variant="navy"><Link href={dateHref(calendar.find((c) => c.minFare != null && c.date > legDate)?.date ?? calendar.find((c) => c.minFare != null)!.date)}>See the next available date</Link></Button>
                  )}>
                  We couldn&apos;t find trips from {legFromName} to {legToName} on {formatDate(`${legDate}T12:00:00Z`, "UTC", "weekday")}. Try another date from the strip above.
                </EmptyState>
              ) : sorted.length === 0 ? (
                <EmptyState icon={<SlidersHorizontal className="h-6 w-6" />} title="No trips match your filters" action={<Button variant="outline" onClick={() => setFilters(emptyFilters())}>Clear all filters</Button>}>
                  {trips.length} departure{trips.length > 1 ? "s are" : " is"} hidden by your filters.
                </EmptyState>
              ) : (
                <AnimatePresence mode="popLayout" initial={false}>
                  {sorted.map((t) => (
                    <TripCard key={t.id} trip={t} pax={query.pax} tags={tags.get(t.id) ?? []} selectHref={selectHref(t)}
                      selectLabel={query.returnDate && leg === "outbound" ? "Select outbound" : "Select"} detailsHref={`/trip/${t.id}?pax=${query.pax}`} />
                  ))}
                </AnimatePresence>
              )}
            </div>
            {trips.length > 0 && <p className="mt-6 text-center text-xs text-ink-3">Fares, schedules and availability shown are demonstration data. Arrival times are estimates. Times shown in {tz.replace("_", " ")} time.</p>}
          </section>
        </div>
      </div>

      <Overlay open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters" full
        footer={
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setFilters(emptyFilters())} disabled={!activeCount}>Clear all</Button>
            <Button className="flex-[2]" onClick={() => setFiltersOpen(false)}>Show {sorted.length} trip{sorted.length === 1 ? "" : "s"}</Button>
          </div>
        }>
        {filterPanel}
      </Overlay>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-b border-line py-4 first:pt-1 last:border-0">
      <legend className="float-left mb-3 w-full text-sm font-semibold">{title}</legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  );
}

function Check2({ checked, onChange, label, meta }: { checked: boolean; onChange: () => void; label: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <label className="flex min-h-[40px] cursor-pointer items-center gap-3 rounded-lg py-1.5 text-[14px]">
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-navy-400", checked ? "border-navy-600 bg-navy-600 text-white" : "border-line-strong bg-white")}>
        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && <span className="text-[13px] text-ink-3 tabular">{meta}</span>}
    </label>
  );
}

function FilterPanel({ filters, setFilters, facets, maxFare, minFare, maxDur, minDur, legFromName, legToName }: {
  filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  facets: { ops: { id: string; name: string; initials: string; color: string; count: number; min: number }[]; vehicles: Map<string, number>; fromT: Map<string, { name: string; count: number }>; toT: Map<string, { name: string; count: number }>; amen: Map<string, number> };
  maxFare: number; minFare: number; maxDur: number; minDur: number; legFromName: string; legToName: string;
}) {
  const toggle = (key: "depart" | "arrive" | "operators" | "vehicles" | "fromTerminals" | "toTerminals" | "amenities", v: string) =>
    setFilters((f) => ({ ...f, [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] }));
  const price = filters.maxPrice ?? maxFare;
  const dur = filters.maxDuration ?? maxDur;
  return (
    <div>
      <FilterGroup title="Quick filters">
        <Check2 checked={filters.hideSoldOut} onChange={() => setFilters((f) => ({ ...f, hideSoldOut: !f.hideSoldOut }))} label="Seats available for everyone" />
        <Check2 checked={filters.direct} onChange={() => setFilters((f) => ({ ...f, direct: !f.direct }))} label="Direct (no pickup stops)" />
        <Check2 checked={filters.refundable} onChange={() => setFilters((f) => ({ ...f, refundable: !f.refundable }))} label="Refundable fares" />
      </FilterGroup>
      {maxFare > minFare && (
        <FilterGroup title="Max price per passenger">
          <div className="flex justify-between text-sm"><span className="text-ink-3">Up to</span><span className="font-semibold tabular">{formatMoney(price)}</span></div>
          <Slider.Root className="relative mt-3 flex h-6 touch-none select-none items-center" min={minFare} max={maxFare} step={50000} value={[price]} onValueChange={([v]) => setFilters((f) => ({ ...f, maxPrice: v >= maxFare ? null : v }))} aria-label="Maximum price">
            <Slider.Track className="relative h-1.5 grow rounded-full bg-surface-3"><Slider.Range className="absolute h-full rounded-full bg-navy-600" /></Slider.Track>
            <Slider.Thumb className="block h-6 w-6 rounded-full border-2 border-navy-600 bg-white shadow-md outline-none focus-visible:ring-4 focus-visible:ring-navy-200" />
          </Slider.Root>
          <div className="mt-1 flex justify-between text-xs text-ink-3 tabular"><span>{formatMoney(minFare)}</span><span>{formatMoney(maxFare)}</span></div>
        </FilterGroup>
      )}
      <FilterGroup title={`Departure from ${legFromName}`}>
        <div className="grid grid-cols-2 gap-2">
          {TIME_BUCKETS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-pressed={filters.depart.includes(id)} onClick={() => toggle("depart", id)}
              className={cn("flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs transition-colors", filters.depart.includes(id) ? "border-navy-600 bg-navy-50 text-navy-700" : "border-line hover:border-line-strong")}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup title={`Arrival in ${legToName}`}>
        <div className="grid grid-cols-2 gap-2">
          {TIME_BUCKETS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-pressed={filters.arrive.includes(id)} onClick={() => toggle("arrive", id)}
              className={cn("flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs transition-colors", filters.arrive.includes(id) ? "border-navy-600 bg-navy-50 text-navy-700" : "border-line hover:border-line-strong")}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup title="Operators">
        {facets.ops.map((o) => <Check2 key={o.id} checked={filters.operators.includes(o.id)} onChange={() => toggle("operators", o.id)} label={<span className="inline-flex items-center gap-2"><OperatorLogo initials={o.initials} color={o.color} size="sm" className="h-6 w-6 rounded-md text-[9px]" />{o.name}</span>} meta={formatMoney(o.min)} />)}
      </FilterGroup>
      <FilterGroup title="Vehicle type">
        {[...facets.vehicles.entries()].map(([v, n]) => <Check2 key={v} checked={filters.vehicles.includes(v)} onChange={() => toggle("vehicles", v)} label={VEHICLE_LABEL[v]} meta={n} />)}
      </FilterGroup>
      {maxDur > minDur && (
        <FilterGroup title="Journey duration">
          <div className="flex justify-between text-sm"><span className="text-ink-3">Up to</span><span className="font-semibold tabular">{formatDuration(dur)}</span></div>
          <Slider.Root className="relative mt-3 flex h-6 touch-none select-none items-center" min={minDur} max={maxDur} step={5} value={[dur]} onValueChange={([v]) => setFilters((f) => ({ ...f, maxDuration: v >= maxDur ? null : v }))} aria-label="Maximum duration">
            <Slider.Track className="relative h-1.5 grow rounded-full bg-surface-3"><Slider.Range className="absolute h-full rounded-full bg-navy-600" /></Slider.Track>
            <Slider.Thumb className="block h-6 w-6 rounded-full border-2 border-navy-600 bg-white shadow-md outline-none focus-visible:ring-4 focus-visible:ring-navy-200" />
          </Slider.Root>
        </FilterGroup>
      )}
      <FilterGroup title="Departure terminal">
        {[...facets.fromT.entries()].map(([id, t]) => <Check2 key={id} checked={filters.fromTerminals.includes(id)} onChange={() => toggle("fromTerminals", id)} label={t.name} meta={t.count} />)}
      </FilterGroup>
      <FilterGroup title="Arrival terminal">
        {[...facets.toT.entries()].map(([id, t]) => <Check2 key={id} checked={filters.toTerminals.includes(id)} onChange={() => toggle("toTerminals", id)} label={t.name} meta={t.count} />)}
      </FilterGroup>
      <FilterGroup title="Amenities">
        {Object.keys(AMENITIES).filter((a) => facets.amen.has(a)).map((a) => <Check2 key={a} checked={filters.amenities.includes(a)} onChange={() => toggle("amenities", a)} label={AMENITIES[a].label} meta={facets.amen.get(a)} />)}
        {facets.amen.size === 0 && <p className="text-sm text-ink-3">No amenities listed on this route.</p>}
      </FilterGroup>
    </div>
  );
}
