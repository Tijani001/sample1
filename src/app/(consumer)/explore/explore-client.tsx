"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Clock, MapPin, Search, Wallet, CalendarDays, Compass } from "lucide-react";
import type { RouteSummary } from "@/lib/services/search";
import { CityImage } from "@/components/city-image";
import { Select, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/domain/money";
import { formatDuration } from "@/lib/domain/time";
import { searchHref } from "@/lib/search-href";
import { cn } from "@/lib/cn";

const BUDGETS = [{ v: 0, l: "Any budget" }, { v: 1000000, l: "Under ₦10,000" }, { v: 2000000, l: "Under ₦20,000" }, { v: 4000000, l: "Under ₦40,000" }];
const DURATIONS = [{ v: 0, l: "Any duration" }, { v: 180, l: "Up to 3 hours" }, { v: 360, l: "Up to 6 hours" }, { v: 600, l: "Up to 10 hours" }];

function nextSaturday(today: string) {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

export function ExploreClient({ routes, destinations, origins, initialFrom, today }: {
  routes: RouteSummary[]; destinations: { id: string; name: string; region: string; blurb: string; image: string | null }[]; origins: { id: string; name: string }[]; initialFrom: string; today: string;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [budget, setBudget] = useState(0);
  const [duration, setDuration] = useState(0);
  const [when, setWhen] = useState<"tomorrow" | "weekend" | "custom">("tomorrow");
  const [date, setDate] = useState(() => new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10));
  const [q, setQ] = useState("");
  const travelDate = when === "weekend" ? nextSaturday(today) : when === "tomorrow" ? new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) : date;
  const list = useMemo(() => routes
    .filter((r) => r.from === from && (!budget || r.minFare <= budget) && (!duration || r.minDuration <= duration) && (!q || r.toName.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.minFare - b.minFare), [routes, from, budget, duration, q]);
  const fromName = origins.find((o) => o.id === from)?.name;
  const img = (id: string) => destinations.find((d) => d.id === id)?.image ?? null;
  const weekend = routes.filter((r) => r.from === from && r.minDuration <= 330).sort((a, b) => a.minDuration - b.minDuration).slice(0, 4);

  return (
    <div className="container-page py-6 sm:py-10">
      <h1 className="text-2xl font-semibold sm:text-3xl">Explore by road</h1>
      <p className="mt-1 text-[15px] text-ink-3">See where you can go from your city, how long it takes and what it costs.</p>
      <div className="mt-6 grid gap-3 rounded-2xl border border-line bg-white p-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1.3fr]">
        <label className="block"><span className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-ink-3"><MapPin className="h-3.5 w-3.5" />Departing from</span>
          <Select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Departure city">{origins.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></label>
        <label className="block"><span className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-ink-3"><Wallet className="h-3.5 w-3.5" />Budget per person</span>
          <Select value={budget} onChange={(e) => setBudget(Number(e.target.value))} aria-label="Budget">{BUDGETS.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}</Select></label>
        <label className="block"><span className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-ink-3"><Clock className="h-3.5 w-3.5" />Travel time</span>
          <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))} aria-label="Travel duration">{DURATIONS.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}</Select></label>
        <div><span className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-ink-3"><CalendarDays className="h-3.5 w-3.5" />When</span>
          <div className="flex gap-1.5">
            {(["tomorrow", "weekend", "custom"] as const).map((w) => (
              <button key={w} onClick={() => setWhen(w)} aria-pressed={when === w} className={cn("h-12 flex-1 rounded-lg border text-sm font-medium", when === w ? "border-navy-600 bg-navy-50 text-navy-700" : "border-line-strong")}>{w === "tomorrow" ? "Tomorrow" : w === "weekend" ? "Weekend" : "Date"}</button>
            ))}
          </div>
          {when === "custom" && <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-line-strong px-3" aria-label="Travel date" />}
        </div>
      </div>
      <div className="relative mt-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search destinations" aria-label="Search destinations" className="h-11 w-full rounded-full border border-line-strong bg-white pl-10 pr-4 text-[15px] outline-none focus:border-navy-500" />
      </div>

      <h2 className="mt-8 text-lg font-semibold">From {fromName} <span className="font-normal text-ink-3">· {list.length} destination{list.length === 1 ? "" : "s"}</span></h2>
      {list.length === 0 ? (
        <EmptyState className="mt-4" icon={<Compass className="h-6 w-6" />} title="No destinations match" action={<Button variant="outline" onClick={() => { setBudget(0); setDuration(0); setQ(""); }}>Reset filters</Button>}>Try a higher budget or a longer travel time.</EmptyState>
      ) : (
        <motion.ul layout className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {list.map((r) => (
              <motion.li layout key={`${r.from}-${r.to}`} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <Link href={searchHref({ from: r.from, to: r.to, date: travelDate, pax: 1 })} className="group flex overflow-hidden rounded-2xl border border-line bg-white transition hover:shadow-md">
                  <CityImage src={img(r.to)} alt={r.toName} name={r.toName} className="w-32 shrink-0" sizes="128px" width={320} />
                  <div className="min-w-0 flex-1 p-4">
                    <p className="text-[17px] font-semibold">{r.toName}</p>
                    <p className="mt-0.5 text-[13px] text-ink-3">{formatDuration(r.minDuration)} · {r.distanceKm} km · {r.operators} operator{r.operators > 1 ? "s" : ""}</p>
                    <p className="mt-3 flex items-center justify-between text-[13px] text-ink-3">From <span className="text-[17px] font-semibold text-ink tabular">{formatMoney(r.minFare)}</span></p>
                    <p className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-coral-700">See trips<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></p>
                  </div>
                </Link>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      {weekend.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">Weekend escapes from {fromName}</h2>
          <p className="text-[14px] text-ink-3">Under 5½ hours away, departing Saturday</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {weekend.map((r) => (
              <li key={r.to}><Link href={searchHref({ from: r.from, to: r.to, date: nextSaturday(today), pax: 1, returnDate: new Date(Date.parse(`${nextSaturday(today)}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) })} className="block rounded-2xl border border-line bg-white p-4 hover:shadow-md">
                <p className="font-semibold">{r.toName}</p><p className="text-[13px] text-ink-3">Sat → Sun · {formatDuration(r.minDuration)} each way</p><p className="mt-2 text-sm">from <b className="tabular">{formatMoney(r.minFare)}</b></p></Link></li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-lg font-semibold">All destinations</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {destinations.map((d) => (
            <li key={d.id}><Link href={`/explore/${d.id}`} className="group relative block overflow-hidden rounded-2xl">
              <CityImage src={d.image} alt={d.name} name={d.name} className="aspect-[4/5]" sizes="(max-width:640px) 50vw, 20vw" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_50%,rgb(8_26_43/0.75))]" />
              <div className="absolute inset-x-0 bottom-0 p-3 text-white"><p className="font-semibold">{d.name}</p><p className="text-xs text-white/80">{d.region}</p></div>
            </Link></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
