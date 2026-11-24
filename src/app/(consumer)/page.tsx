import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock, Headphones, LockKeyhole, ReceiptText, Search, Armchair, Ticket, Star, Tag } from "lucide-react";
import { getDb } from "@/lib/server";
import { listDestinations, listOperators, listPlaces, routeSummaries } from "@/lib/services/search";
import { SearchWidget } from "@/components/search/search-widget";
import { RecentSearches } from "@/components/home/recent-searches";
import { InstallApp } from "@/components/home/install-app";
import { CityImage } from "@/components/city-image";
import { FaqList, CORE_FAQS } from "@/components/faq";
import { OperatorLogo } from "@/components/operator-badge";
import { SectionHeading } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/money";
import { addDaysIso, formatDuration, todayIso } from "@/lib/domain/time";
import { searchHref } from "@/lib/search-href";

const POPULAR: [string, string][] = [
  ["abuja", "lagos"], ["lagos", "ibadan"], ["abuja", "kano"], ["lagos", "benin-city"], ["abuja", "kaduna"],
  ["port-harcourt", "enugu"], ["lagos", "akure"], ["abuja", "jos"], ["kano", "kaduna"], ["enugu", "owerri"],
];
const DESTINATIONS = ["lagos", "abuja", "kano", "ibadan", "port-harcourt", "enugu", "kaduna", "jos", "calabar", "benin-city", "uyo", "sokoto"];

export default async function HomePage() {
  const db = await getDb();
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  const [places, popular, destinations, operators, promos] = await Promise.all([
    listPlaces(db),
    routeSummaries(db, POPULAR),
    listDestinations(db),
    listOperators(db),
    db.query<{ code: string; title: string; description: string; ends_at: Date; category: string }>(
      `select code, title, description, ends_at, category from promotions where active and now() between starts_at and ends_at order by created_at limit 3`),
  ]);
  const dest = DESTINATIONS.map((id) => destinations.find((d) => d.id === id)!).filter(Boolean);
  const lagos = destinations.find((d) => d.id === "lagos");
  const affordable = (await routeSummaries(db)).filter((r) => r.minDuration <= 240).sort((a, b) => a.minFare - b.minFare).slice(0, 4);

  return (
    <>
      {/* Hero + search */}
      <section className="relative">
        <div className="relative h-[260px] overflow-hidden sm:h-[300px] md:h-[340px]">
          <CityImage src={lagos?.image_url} alt="" name="Nigeria" className="absolute inset-0 h-full" sizes="100vw" priority width={1600} />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(8_26_43/0.55)_0%,rgb(8_26_43/0.35)_55%,rgb(8_26_43/0.6)_100%)]" />
          <div className="container-page relative flex h-full flex-col justify-center pb-16 pt-4 text-white md:pb-24">
            <h1 className="max-w-2xl text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-4xl md:text-[46px]">Where are you going next?</h1>
            <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-white/85 sm:text-[17px]">Search, compare and book road trips from trusted transport operators, all in one place.</p>
          </div>
        </div>
        <div className="container-page relative -mt-14 md:-mt-20">
          <SearchWidget places={places} today={today} />
          <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 px-1 text-[13.5px] text-ink-2 md:flex md:justify-center md:gap-8">
            <li className="flex items-center gap-2"><BadgeCheck className="h-[18px] w-[18px] shrink-0 text-navy-500" />Verified operators only</li>
            <li className="flex items-center gap-2"><LockKeyhole className="h-[18px] w-[18px] shrink-0 text-navy-500" />Payments via licensed providers</li>
            <li className="flex items-center gap-2"><ReceiptText className="h-[18px] w-[18px] shrink-0 text-navy-500" />Full price shown before you pay</li>
            <li className="flex items-center gap-2"><Headphones className="h-[18px] w-[18px] shrink-0 text-navy-500" />Support before and during your trip</li>
          </ul>
        </div>
      </section>

      <RecentSearches today={today} />

      {/* Popular routes */}
      <section aria-labelledby="popular-heading" className="container-page mt-14">
        <SectionHeading title={<span id="popular-heading">Popular routes</span>} subtitle="Lowest fares this week, per passenger" />
        <ul className="no-scrollbar -mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-5">
          {popular.map((r) => (
            <li key={`${r.from}-${r.to}`} className="w-[78%] shrink-0 snap-start sm:w-auto">
              <Link href={searchHref({ from: r.from, to: r.to, date: tomorrow, pax: 1 })} className="group block overflow-hidden rounded-2xl border border-line bg-white transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                <CityImage src={r.image} alt={`${r.toName}`} name={r.toName} className="aspect-[16/9] w-full transition-transform duration-500 group-hover:scale-[1.03]" sizes="(max-width: 640px) 78vw, (max-width: 1024px) 45vw, 230px" />
                <div className="p-3.5">
                  <p className="flex items-center gap-1.5 text-[15px] font-semibold">{r.fromName}<ArrowRight className="h-3.5 w-3.5 text-ink-3" />{r.toName}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-3"><Clock className="h-3.5 w-3.5" />from {formatDuration(r.minDuration)} · {r.operators} operator{r.operators > 1 ? "s" : ""}</p>
                  <p className="mt-2.5 text-[13px] text-ink-3">From <span className="text-[17px] font-semibold text-ink tabular">{formatMoney(r.minFare)}</span></p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Destinations */}
      <section aria-labelledby="dest-heading" className="container-page mt-16">
        <SectionHeading title={<span id="dest-heading">Explore Nigeria by road</span>} subtitle="Cities you can reach with Goroada"
          action={<Link href="/explore" className="hidden items-center gap-1 text-sm font-semibold text-coral-700 hover:text-coral-800 sm:inline-flex">View all<ArrowRight className="h-4 w-4" /></Link>} />
        <ul className="no-scrollbar -mx-4 mt-5 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {dest.map((d, i) => (
            <li key={d.id} className={i < 2 ? "w-[62%] shrink-0 sm:col-span-1 sm:w-auto lg:col-span-2 lg:row-span-1" : "w-[62%] shrink-0 sm:w-auto"}>
              <Link href={`/explore/${d.id}`} className="group relative block overflow-hidden rounded-2xl">
                <CityImage src={d.image_url} alt={`View of ${d.name}`} name={d.name} className={i < 2 ? "aspect-[4/5] sm:aspect-[4/3] lg:aspect-[16/8]" : "aspect-[4/5] sm:aspect-[4/3]"} sizes="(max-width: 640px) 62vw, (max-width: 1024px) 31vw, 300px" width={i < 2 ? 960 : 640} />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgb(8_26_43/0.78)_100%)] transition-opacity group-hover:opacity-95" />
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <p className="text-lg font-semibold leading-tight">{d.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-[13px] text-white/80">{d.blurb}</p>
                  {d.min_fare && <p className="mt-2 text-[13px] text-white/85">Trips from <span className="font-semibold text-white tabular">{formatMoney(d.min_fare)}</span></p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Deals + affordable */}
      <section aria-labelledby="deals-heading" className="container-page mt-16 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr] [&>div]:min-w-0">
        <div>
          <SectionHeading title={<span id="deals-heading">Travel deals</span>} subtitle="Codes you can apply at checkout"
            action={<Link href="/offers" className="inline-flex items-center gap-1 text-sm font-semibold text-coral-700 hover:text-coral-800">All offers<ArrowRight className="h-4 w-4" /></Link>} />
          <ul className="mt-5 grid grid-cols-1 gap-3 [&>li]:min-w-0">
            {promos.map((p) => (
              <li key={p.code}>
                <Link href="/offers" className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 transition hover:border-line-strong hover:shadow-md">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-coral-50 text-coral-700"><Tag className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.title}</span>
                    <span className="block truncate text-[13.5px] text-ink-3">{p.description}</span>
                  </span>
                  <span className="hidden rounded-lg border border-dashed border-coral-300 px-2.5 py-1 font-mono text-[13px] font-semibold text-coral-700 sm:block">{p.code}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionHeading title="Short hops under 4 hours" subtitle="Affordable weekend getaways" />
          <ul className="mt-5 divide-y divide-line rounded-2xl border border-line bg-white">
            {affordable.map((r) => (
              <li key={`${r.from}-${r.to}`}>
                <Link href={searchHref({ from: r.from, to: r.to, date: tomorrow, pax: 1 })} className="flex items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-surface-2">
                  <span>
                    <span className="flex items-center gap-1.5 font-medium">{r.fromName}<ArrowRight className="h-3.5 w-3.5 text-ink-3" />{r.toName}</span>
                    <span className="text-[13px] text-ink-3">{formatDuration(r.minDuration)} · {r.distanceKm} km</span>
                  </span>
                  <span className="text-right text-[13px] text-ink-3">from<br /><span className="text-[15px] font-semibold text-ink tabular">{formatMoney(r.minFare)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-heading" className="container-page mt-16">
        <SectionHeading title={<span id="how-heading">How Goroada works</span>} />
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { icon: Search, t: "Search and compare", d: "See departures from every operator on your route, with real fares, seats left and journey times." },
            { icon: Armchair, t: "Pick your seat", d: "Choose exactly where you'll sit on an interactive seat map, then add passenger details." },
            { icon: Ticket, t: "Pay and board", d: "Pay securely and get a digital ticket with a QR code. Show it at the terminal to board." },
          ].map(({ icon: Icon, t, d }, i) => (
            <li key={t} className="relative rounded-2xl border border-line bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-50 text-navy-600"><Icon className="h-5 w-5" /></span>
                <span className="text-sm font-medium text-ink-3 tabular">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-[17px] font-semibold">{t}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-3">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Operators */}
      <section aria-labelledby="ops-heading" className="container-page mt-16">
        <SectionHeading title={<span id="ops-heading">Operators on Goroada</span>} subtitle="Demonstration operators for this development build" />
        <ul className="no-scrollbar -mx-4 mt-5 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
          {operators.slice(0, 5).map((o) => (
            <li key={o.id} className="w-[230px] shrink-0 sm:w-auto">
              <Link href={`/operators/${o.id}`} className="flex h-full flex-col rounded-2xl border border-line bg-white p-4 transition hover:border-line-strong hover:shadow-md">
                <OperatorLogo initials={o.initials} color={o.brand_color} />
                <p className="mt-3 font-semibold">{o.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-3">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span className="font-medium text-ink tabular">{Number(o.rating_avg).toFixed(1)}</span>
                  <span className="tabular">({o.rating_count.toLocaleString()})</span> · {o.routes} routes
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="faq-heading" className="container-page mt-16 grid gap-8 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <h2 id="faq-heading" className="text-2xl font-semibold">Questions, answered</h2>
          <p className="mt-2 text-[15px] text-ink-3">Can&apos;t find what you need? Our support team is here for bookings, payments and anything on the road.</p>
          <Link href="/help" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-coral-700 hover:text-coral-800">Visit the help centre<ArrowRight className="h-4 w-4" /></Link>
        </div>
        <FaqList items={CORE_FAQS.slice(0, 5)} />
      </section>

      <InstallApp />
    </>
  );
}
