import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb, getSessionUser } from "@/lib/server";
import { canAccessBooking } from "@/lib/auth/session";
import { getBookingView } from "@/lib/services/bookings";
import { getSeatMap } from "@/lib/services/inventory";
import { availableProviders } from "@/lib/services/payments";
import { BookingFlow, type Step } from "../flow";
import { EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Lock, TimerReset } from "lucide-react";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function DraftPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { step } = await searchParams;
  const db = await getDb();
  const user = await getSessionUser();
  const booking = await getBookingView(db, id);
  if (!booking) notFound();
  if (!(await canAccessBooking({ id: booking.id, userId: booking.userId }, user))) {
    return <div className="container-page py-16"><EmptyState icon={<Lock className="h-6 w-6" />} title="This checkout belongs to another session">Open it from the browser you started booking in, or find your booking with its reference.</EmptyState></div>;
  }
  if (["confirmed", "refund_pending", "refunded", "cancelled", "needs_reconciliation", "payment_processing"].includes(booking.status)) redirect(`/trips/${booking.reference}`);
  const restart = `/book?out=${booking.segments[0].trip.id}${booking.segments[1] ? `&ret=${booking.segments[1].trip.id}` : ""}&pax=${booking.passengerCount}`;
  if (booking.status === "expired") {
    return <div className="container-page py-16"><EmptyState icon={<TimerReset className="h-6 w-6" />} title="This reservation has expired" action={<Button asChild><Link href={restart}>Choose seats again</Link></Button>}>Your seats were released after the hold time ended. You haven&apos;t been charged.</EmptyState></div>;
  }
  const segments = await Promise.all(booking.segments.map(async (s) => ({
    direction: s.direction, trip: s.trip, seatMap: (await getSeatMap(db, s.trip.id, booking.id))!,
    seats: s.trip.seatingMode === "assigned" ? s.seats.map((x) => x.seatNo) : [],
  })));
  const saved = user ? await db.query<{ id: string; full_name: string; phone: string | null; email: string | null; next_of_kin_name: string | null; next_of_kin_phone: string | null }>(`select id, full_name, phone, email, next_of_kin_name, next_of_kin_phone from saved_passengers where user_id = $1 order by created_at`, [user.id]) : [];
  const detailsDone = booking.passengers.every((p) => p.fullName.length > 1) && !!booking.contact.email;
  let initial: Step = (["seats", "details", "extras", "pay"].includes(step ?? "") ? step : "details") as Step;
  if ((initial === "extras" || initial === "pay") && !detailsDone) initial = "details";
  return (
    <BookingFlow key={booking.id} pax={booking.passengerCount} segments={segments} booking={booking} initialStep={initial}
      user={user ? { name: user.name, email: user.email, phone: user.phone } : null} savedPassengers={saved} providers={availableProviders()} restartHref={restart} />
  );
}
