import type { Metadata } from "next";
import { Tag, CalendarRange, MapPin, Building2, UserPlus } from "lucide-react";
import { getDb } from "@/lib/server";
import { formatMoney } from "@/lib/domain/money";
import { formatDate } from "@/lib/domain/time";
import { Badge } from "@/components/ui/primitives";
import { CopyCode } from "./copy-code";

export const metadata: Metadata = { title: "Offers", description: "Current Goroada promo codes and travel deals." };

const CAT: Record<string, { label: string; icon: typeof Tag }> = { first_booking: { label: "First booking", icon: UserPlus }, seasonal: { label: "Seasonal", icon: CalendarRange }, route: { label: "Route deal", icon: MapPin }, operator: { label: "Operator promotion", icon: Building2 }, referral: { label: "Referral", icon: UserPlus } };

export default async function OffersPage() {
  const db = await getDb();
  const promos = await db.query<{ code: string; title: string; description: string; kind: string; value: number; max_discount: number | null; min_subtotal: number; starts_at: Date; ends_at: Date; category: string; terms: string; o: string | null; d: string | null; op: string | null; first_booking_only: boolean }>(
    `select p.*, oc.name o, dc.name d, op.name op from promotions p left join cities oc on oc.id = p.origin_city_id left join cities dc on dc.id = p.destination_city_id left join operators op on op.id = p.operator_id
      where p.active and now() between p.starts_at and p.ends_at order by p.created_at`);
  return (
    <div className="container-page py-6 sm:py-10">
      <h1 className="text-2xl font-semibold sm:text-3xl">Offers</h1>
      <p className="mt-1 max-w-2xl text-[15px] text-ink-3">Apply a code at checkout. Discounts apply to fares and seat charges only; the booking fee always stays the same. No countdowns, no catches.</p>
      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {promos.map((p) => {
          const c = CAT[p.category] ?? CAT.seasonal;
          return (
            <li key={p.code} className="flex flex-col rounded-2xl border border-line bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-coral-50 text-coral-700"><c.icon className="h-5 w-5" /></span>
                  <div><Badge tone="navy">{c.label}</Badge><h2 className="mt-1 text-[17px] font-semibold">{p.title}</h2></div></div>
                <p className="shrink-0 text-right text-xl font-semibold text-coral-700">{p.kind === "percent" ? `${p.value}%` : formatMoney(p.value)}<span className="block text-xs font-normal text-ink-3">off</span></p>
              </div>
              <p className="mt-3 text-[15px] text-ink-2">{p.description}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
                <div><dt className="text-ink-3">Valid</dt><dd className="font-medium">{formatDate(p.starts_at)} – {formatDate(p.ends_at)}</dd></div>
                <div><dt className="text-ink-3">Applies to</dt><dd className="font-medium">{p.o && p.d ? `${p.o} → ${p.d}` : p.op ? `${p.op} departures` : "All routes"}</dd></div>
                <div><dt className="text-ink-3">Eligibility</dt><dd className="font-medium">{p.first_booking_only ? "First booking only" : "All customers"}</dd></div>
                <div><dt className="text-ink-3">Limits</dt><dd className="font-medium">{p.max_discount ? `Up to ${formatMoney(p.max_discount)}` : "No cap"}{p.min_subtotal ? ` · min ${formatMoney(p.min_subtotal)}` : ""}</dd></div>
              </dl>
              <details className="mt-3 text-[13px] text-ink-3"><summary className="cursor-pointer font-medium text-ink-2">Terms and conditions</summary><p className="mt-2">{p.terms}</p></details>
              <div className="mt-auto pt-4"><CopyCode code={p.code} /></div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
