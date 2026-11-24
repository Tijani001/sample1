import { authorizeBooking, route } from "@/lib/api";
import { BookingError, getBookingView } from "@/lib/services/bookings";
import { renderIcs } from "@/lib/services/ticket-pdf";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { db, bookingId } = await authorizeBooking((await ctx.params).id);
  const b = await getBookingView(db, bookingId);
  if (!b) throw new BookingError("not_found", "Booking not found.", 404);
  return new Response(renderIcs(b), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="goroada-${b.reference}.ics"` } });
});
