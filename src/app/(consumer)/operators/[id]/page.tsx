import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BadgeCheck, Star } from "lucide-react";
import { getDb } from "@/lib/server";
import { routeSummaries } from "@/lib/services/search";
import { OperatorLogo } from "@/components/operator-badge";
import { Badge, Notice } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/money";
import { addDaysIso, formatDate, formatDuration, todayIso } from "@/lib/domain/time";
import { searchHref } from "@/lib/search-href";

export const metadata: Metadata = { title: "Operator" };

export default async function OperatorProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [o] = await db.query<{ id: string; name: string; initials: string; brand_color: string; description: string; rating_avg: string; rating_count: number; is_demo: boolean; seating_mode: string; founded_year: number; hq: string }>(
    `select o.*, c.name hq from operators o left join cities c on c.id = o.hq_city_id where o.id = $1 and o.status = 'verified'`, [id]);
  if (!o) notFound();
  const routes = (await routeSummaries(db)).filter((r) => r.operatorNames.includes(o.name));
  const reviews = await db.query<{ id: string; author_name: string; rating: number; comment: string; route_label: string; created_at: Date }>(`select * from reviews where operator_id = $1 order by created_at desc limit 8`, [id]);
  const date = addDaysIso(todayIso(), 1);
  return (
    <div className="container-page py-6 sm:py-10">
      <div className="flex flex-wrap items-center gap-4">
        <OperatorLogo initials={o.initials} color={o.brand_color} size="lg" />
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold sm:text-3xl">{o.name}<BadgeCheck className="h-6 w-6 text-navy-500" aria-label="Verified" /></h1>
          <p className="flex flex-wrap items-center gap-2 text-[15px] text-ink-3"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{Number(o.rating_avg).toFixed(1)} · {o.rating_count.toLocaleString()} ratings · Based in {o.hq} · Since {o.founded_year}{o.is_demo && <Badge tone="warning">Demo operator</Badge>}</p>
        </div>
      </div>
      <p className="mt-4 max-w-2xl text-[15px] text-ink-2">{o.description}</p>
      {o.is_demo && <Notice tone="neutral" className="mt-4 max-w-2xl">This is a fictional operator used for demonstration. It is not affiliated with any real transport company.</Notice>}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section><h2 className="text-lg font-semibold">Routes ({routes.length})</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
            {routes.map((r) => <li key={`${r.from}-${r.to}`}><Link href={searchHref({ from: r.from, to: r.to, date, pax: 1 })} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"><span className="flex items-center gap-1.5 font-medium">{r.fromName}<ArrowRight className="h-3.5 w-3.5 text-ink-3" />{r.toName}<span className="font-normal text-ink-3">· {formatDuration(r.minDuration)}</span></span><span className="text-sm">from <b className="tabular">{formatMoney(r.minFare)}</b></span></Link></li>)}
          </ul></section>
        <section><h2 className="text-lg font-semibold">Recent reviews</h2>
          <ul className="mt-3 space-y-3">{reviews.map((r) => <li key={r.id} className="rounded-xl border border-line bg-white p-4 text-[14px]"><div className="flex justify-between"><b className="font-medium">{r.author_name}</b><span className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={n <= r.rating ? "h-3.5 w-3.5 fill-amber-400 text-amber-400" : "h-3.5 w-3.5 text-line-strong"} />)}</span></div><p className="mt-1 text-ink-2">{r.comment}</p><p className="mt-1 text-xs text-ink-3">{r.route_label} · {formatDate(r.created_at)}</p></li>)}</ul></section>
      </div>
    </div>
  );
}
