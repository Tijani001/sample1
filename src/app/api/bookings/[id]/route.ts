import { authorizeBooking, json, route } from "@/lib/api";
import { getBookingView } from "@/lib/services/bookings";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { db, bookingId } = await authorizeBooking((await ctx.params).id);
  return json(await getBookingView(db, bookingId));
});
