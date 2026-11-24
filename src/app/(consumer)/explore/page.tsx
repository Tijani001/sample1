import type { Metadata } from "next";
import { getDb } from "@/lib/server";
import { listDestinations, routeSummaries } from "@/lib/services/search";
import { todayIso } from "@/lib/domain/time";
import { ExploreClient } from "./explore-client";

export const metadata: Metadata = { title: "Explore destinations", description: "Discover where you can go by road from your city, with starting fares and journey times." };

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const db = await getDb();
  const [routes, destinations] = await Promise.all([routeSummaries(db), listDestinations(db)]);
  const { from } = await searchParams;
  const origins = [...new Map(routes.map((r) => [r.from, r.fromName])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  return <ExploreClient routes={routes} destinations={destinations.map((d) => ({ id: d.id, name: d.name, region: d.region, blurb: d.blurb, image: d.image_url }))} origins={origins} initialFrom={origins.some((o) => o.id === from) ? from! : "lagos"} today={todayIso()} />;
}
