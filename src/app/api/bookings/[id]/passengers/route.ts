import { authorizeBooking, json, readJson, route } from "@/lib/api";
import { savePassengers } from "@/lib/services/bookings";

export const PUT = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { db, bookingId } = await authorizeBooking((await ctx.params).id);
  return json(await savePassengers(db, bookingId, await readJson(req)));
});
