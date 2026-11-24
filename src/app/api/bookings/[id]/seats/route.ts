import { z } from "zod";
import { authorizeBooking, json, readJson, route } from "@/lib/api";
import { BookingError, changeSeats } from "@/lib/services/bookings";

const schema = z.object({ direction: z.enum(["outbound", "return"]), seats: z.array(z.string().max(4)).min(1).max(10) });

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { db, bookingId } = await authorizeBooking((await ctx.params).id);
  const body = schema.safeParse(await readJson(req));
  if (!body.success) throw new BookingError("bad_request", "Invalid seat selection.", 400);
  const quote = await changeSeats(db, bookingId, body.data.direction, body.data.seats);
  return json({ quote });
});
