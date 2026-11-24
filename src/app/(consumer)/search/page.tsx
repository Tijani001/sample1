import type { Metadata } from "next";
import { getDb } from "@/lib/server";
import { fareCalendar, listPlaces, searchTrips, getTrip } from "@/lib/services/search";
import { addDaysIso, diffDaysIso, isIsoDate, todayIso } from "@/lib/domain/time";
import { SearchResults } from "./results";
import { SearchWidget } from "@/components/search/search-widget";
import { Notice } from "@/components/ui/primitives";

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const db = await getDb();
  const places = await listPlaces(db);
  const f = places.find((p) => p.id === str(sp.from))?.name;
  const t = places.find((p) => p.id === str(sp.to))?.name;
  return { title: f && t ? `${f} to ${t}` : "Search trips", robots: { index: false } };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIso();
  const places = await listPlaces(db);
  const from = str(sp.from);
  const to = str(sp.to);
  let date = str(sp.date);
  const ret = str(sp.return) || null;
  const pax = Math.min(10, Math.max(1, Number(str(sp.pax)) || 1));
  const outId = str(sp.out) || null;
  const fromCity = places.find((p) => p.id === from && p.kind === "city");
  const toCity = places.find((p) => p.id === to && p.kind === "city");

  const errors: string[] = [];
  if (!fromCity || !toCity) errors.push("Choose a departure and destination city.");
  else if (from === to) errors.push("Departure and destination must be different cities.");
  if (!isIsoDate(date)) date = addDaysIso(today, 1);
  if (date < today) errors.push("That date has passed. Choose today or a later date.");
  if (diffDaysIso(today, date) > 120) errors.push("You can book up to 120 days ahead.");
  if (ret && (!isIsoDate(ret) || ret < date)) errors.push("Your return date must be on or after your departure date.");

  if (errors.length) {
    return (
      <div className="container-page py-8">
        <h1 className="mb-4 text-2xl font-semibold">Search trips</h1>
        <Notice tone="warning" title="Let's fix your search" className="mb-5">{errors.join(" ")}</Notice>
        <SearchWidget places={places} today={today} initial={{ from, to, date: date >= today ? date : null, returnDate: ret, pax }} />
      </div>
    );
  }

  const roundTrip = !!ret;
  const outbound = roundTrip && outId ? await getTrip(db, outId) : null;
  const leg: "outbound" | "return" = roundTrip && outbound ? "return" : "outbound";
  const legFrom = leg === "return" ? to : from;
  const legTo = leg === "return" ? from : to;
  const legDate = leg === "return" ? ret! : date;
  const [trips, calendar] = await Promise.all([
    searchTrips(db, { from: legFrom, to: legTo, date: legDate }),
    fareCalendar(db, { from: legFrom, to: legTo, date: legDate, before: 3, after: 10 }),
  ]);
  const visibleTrips = leg === "return" && outbound ? trips.filter((t) => new Date(t.departureAt) > new Date(outbound.arrivalEstAt)) : trips;

  return (
    <SearchResults
      key={`${legFrom}-${legTo}-${legDate}-${leg}`}
      places={places}
      today={today}
      query={{ from, to, date, returnDate: ret, pax, fromTerminal: str(sp.fromTerminal) || null, toTerminal: str(sp.toTerminal) || null, vehicle: str(sp.vehicle) || null }}
      leg={leg}
      legDate={legDate}
      outbound={outbound}
      trips={visibleTrips}
      hiddenEarlier={trips.length - visibleTrips.length}
      calendar={calendar}
    />
  );
}
