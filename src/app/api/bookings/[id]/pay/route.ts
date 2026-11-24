import { z } from "zod";
import { authorizeBooking, json, readJson, route } from "@/lib/api";
import { BookingError } from "@/lib/services/bookings";
import { initializePayment } from "@/lib/services/payments";
import { baseUrl } from "@/lib/server";

const schema = z.object({ provider: z.enum(["demo", "paystack", "flutterwave"]) });

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { db, bookingId } = await authorizeBooking((await ctx.params).id);
  const body = schema.safeParse(await readJson(req));
  if (!body.success) throw new BookingError("bad_request", "Choose a payment method.", 400);
  const res = await initializePayment(db, { bookingId, provider: body.data.provider, baseUrl: await baseUrl() });
  return json(res);
});
