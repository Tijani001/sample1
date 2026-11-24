import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getDb } from "@/lib/server";
import { listDestinations, routeSummaries } from "@/lib/services/search";
import { CityImage } from "@/components/city-image";
import { formatMoney } from "@/lib/domain/money";
import { addDaysIso, formatDuration, todayIso } from "@/lib/domain/time";
import { searchHref } from "@/lib/search-href";

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city } = await params;
  const d = (await listDestinations(await getDb())).find((x) => x.id === city);
  return { title: d ? `Travel to ${d.name} by road` : "Destination" };
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const db = await getDb();
  const d = (await listDestinations(db)).find((x) => x.id === city);
  if (!d) notFound();
  const all = await routeSummaries(db);
  const inbound = all.filter((r) => r.to === city).sort((a, b) => a.minFare - b.minFare);
  const outbound = all.filter((r) => r.from === city).sort((a, b) => a.minFare - b.minFare);
  const date = addDaysIso(todayIso(), 1);
  const Row = ({ r, label }: { r: (typeof all)[number]; label: string }) => (
    <li><Link href={searchHref({ from: r.from, to: r.to, date, pax: 1 })} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-2">
      <span><span className="font-medium">{label}</span><span className="block text-[13px] text-ink-3">{formatDuration(r.minDuration)} · {r.operators} operator{r.operators > 1 ? "s" : ""}</span></span>
      <span className="flex items-center gap-3 text-sm">from <b className="tabular">{formatMoney(r.minFare)}</b><ArrowRight className="h-4 w-4 text-ink-3" /></span></Link></li>
  );
  return (
    <div>
      <div className="relative h-64 sm:h-80">
        <CityImage src={d.image_url} alt={`View of ${d.name}`} name={d.name} className="absolute inset-0" sizes="100vw" width={1600} priority />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(8_26_43/0.2),rgb(8_26_43/0.7))]" />
        <div className="container-page relative flex h-full flex-col justify-end pb-8 text-white">
          <p className="text-sm text-white/80">{d.region}</p>
          <h1 className="text-3xl font-semibold sm:text-4xl">{d.name}</h1>
          <p className="mt-1 max-w-xl text-white/85">{d.blurb}</p>
        </div>
      </div>
      <div className="container-page mt-8 grid gap-8 md:grid-cols-2">
        <section><h2 className="text-lg font-semibold">Getting to {d.name}</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">{inbound.map((r) => <Row key={r.from} r={r} label={`From ${r.fromName}`} />)}</ul></section>
        <section><h2 className="text-lg font-semibold">Leaving {d.name}</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">{outbound.map((r) => <Row key={r.to} r={r} label={`To ${r.toName}`} />)}</ul></section>
      </div>
      {d.image_source_url && <p className="container-page mt-6 text-xs text-ink-3">Photo: <a className="underline" href={d.image_source_url} target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> (see source page for author and licence).</p>}
    </div>
  );
}
