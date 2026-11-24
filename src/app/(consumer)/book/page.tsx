import type { Metadata } from "next";
import Link from "next/link";
import { getDb, getSessionUser } from "@/lib/server";
import { getTrip } from "@/lib/services/search";
import { getSeatMap } from "@/lib/services/inventory";
import { availableProviders } from "@/lib/services/payments";
import { BookingFlow } from "./flow";
import { EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CalendarX } from "lucide-react";

export const metadata: Metadata = { title: "Choose seats", robots: { index: false } };
type SP = Record<string, string | string[] | undefined>;
const s = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function BookPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const db = await getDb();
  const pax = Math.min(10, Math.max(1, Number(s(sp.pax)) || 1));
  const out = await getTrip(db, s(sp.out));
  const ret = s(sp.ret) ? await getTrip(db, s(sp.ret)) : null;
  const trips = [out, ret].filter(Boolean) as NonNullable<typeof out>[];
  const problem = !out ? "We couldn't find that departure." : trips.find((t) => !t.bookable) ? "This departure is no longer available to book." : trips.find((t) => t.seatsLeft < pax) ? `Not enough seats left for ${pax} passengers.` : null;
  if (problem) {
    return (
      <div className="container-page py-16">
        <EmptyState icon={<CalendarX className="h-6 w-6" />} title={problem} action={<Button asChild variant="navy"><Link href={out ? `/search?from=${out.origin.cityId}&to=${out.destination.cityId}&date=${out.serviceDate}&pax=${pax}` : "/"}>Find another departure</Link></Button>}>
          Seats sell quickly on popular routes. Choose another time or date.
        </EmptyState>
      </div>
    );
  }
  const user = await getSessionUser();
  const segments = await Promise.all(trips.map(async (t, i) => ({ direction: (i === 0 ? "outbound" : "return") as "outbound" | "return", trip: t, seatMap: (await getSeatMap(db, t.id))!, seats: [] as string[] })));
  const saved = user ? await db.query<{ id: string; full_name: string; phone: string | null; email: string | null; next_of_kin_name: string | null; next_of_kin_phone: string | null }>(`select id, full_name, phone, email, next_of_kin_name, next_of_kin_phone from saved_passengers where user_id = $1 order by created_at`, [user.id]) : [];
  return (
    <BookingFlow pax={pax} segments={segments} booking={null} initialStep="seats" user={user ? { name: user.name, email: user.email, phone: user.phone } : null}
      savedPassengers={saved} providers={availableProviders()} restartHref={`/book?out=${out!.id}${ret ? `&ret=${ret.id}` : ""}&pax=${pax}`} />
  );
}
