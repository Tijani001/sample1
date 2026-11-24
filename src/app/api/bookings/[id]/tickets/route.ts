import { authorizeBooking, route } from "@/lib/api";
import { BookingError, getBookingView } from "@/lib/services/bookings";
import { renderTicketsPdf } from "@/lib/services/ticket-pdf";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { db, bookingId } = await authorizeBooking((await ctx.params).id);
  const b = await getBookingView(db, bookingId);
  if (!b || b.status !== "confirmed") throw new BookingError("not_confirmed", "Tickets are available once the booking is confirmed.", 409);
  const bytes = await renderTicketsPdf(b, { sandbox: b.paidPayment?.provider === "demo" });
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="goroada-${b.reference}.pdf"`, "Cache-Control": "private, no-store" } });
});
