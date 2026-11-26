import { requireUser } from "@/lib/auth/guards";
import Link from "next/link";
import { ArrowRight, Heart, Star } from "lucide-react";
import { getDb } from "@/lib/server";
import { toggleFavouriteOperatorAction, toggleFavouriteRouteAction } from "../actions";
import { OperatorLogo } from "@/components/operator-badge";
import { Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { searchHref } from "@/lib/search-href";
import { addDaysIso, todayIso } from "@/lib/domain/time";

export const metadata = { title: "Favourites" };
export default async function Favourites() {
  const user = await requireUser("/account/favourites");
  const db = await getDb();
  const routes = await db.query<{ o: string; oname: string; d: string; dname: string }>(`select f.origin_city_id o, oc.name oname, f.destination_city_id d, dc.name dname from favourite_routes f join cities oc on oc.id = f.origin_city_id join cities dc on dc.id = f.destination_city_id where f.user_id = $1 order by f.created_at`, [user.id]);
  const ops = await db.query<{ id: string; name: string; initials: string; brand_color: string; rating_avg: string; fav: boolean }>(`select o.id, o.name, o.initials, o.brand_color, o.rating_avg, exists(select 1 from favourite_operators f where f.user_id = $1 and f.operator_id = o.id) fav from operators o where o.status = 'verified' order by o.name`, [user.id]);
  const cities = await db.query<{ id: string; name: string }>(`select id, name from cities order by name`);
  const date = addDaysIso(todayIso(), 1);
  return (
    <div>
      <h1 className="text-2xl font-semibold">Favourites</h1>
      <h2 className="mt-6 text-lg font-semibold">Favourite routes</h2>
      <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
        {routes.length === 0 && <li className="p-4 text-base text-ink-3">No favourite routes yet.</li>}
        {routes.map((r) => (
          <li key={`${r.o}-${r.d}`} className="flex items-center gap-3 px-4 py-3">
            <Link href={searchHref({ from: r.o, to: r.d, date, pax: 1 })} className="flex flex-1 items-center gap-1.5 font-medium hover:underline">{r.oname}<ArrowRight className="h-4 w-4 text-ink-3" />{r.dname}</Link>
            <form action={toggleFavouriteRouteAction}><input type="hidden" name="from" value={r.o} /><input type="hidden" name="to" value={r.d} /><button className="text-sm text-ink-3 hover:text-danger">Remove</button></form>
          </li>
        ))}
      </ul>
      <form action={toggleFavouriteRouteAction} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[140px] flex-1 text-sm">From<Select name="from" className="mt-1">{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
        <label className="min-w-[140px] flex-1 text-sm">To<Select name="to" defaultValue="abuja" className="mt-1">{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
        <Button variant="outline" className="h-12">Add route</Button>
      </form>
      <h2 className="mt-8 text-lg font-semibold">Operators</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {ops.map((o) => (
          <li key={o.id} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
            <OperatorLogo initials={o.initials} color={o.brand_color} size="sm" />
            <span className="flex-1"><span className="block font-medium">{o.name}</span><span className="flex items-center gap-1 text-xs text-ink-3"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{Number(o.rating_avg).toFixed(1)}</span></span>
            <form action={toggleFavouriteOperatorAction}><input type="hidden" name="operator" value={o.id} /><button aria-pressed={o.fav} aria-label={o.fav ? `Remove ${o.name} from favourites` : `Add ${o.name} to favourites`} className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2"><Heart className={o.fav ? "h-5 w-5 fill-coral-500 text-coral-500" : "h-5 w-5 text-ink-3"} /></button></form>
          </li>
        ))}
      </ul>
    </div>
  );
}
