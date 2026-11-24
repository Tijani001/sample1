import { z } from "zod";
import { authorizeBooking, json, readJson, route } from "@/lib/api";
import { BookingError, saveExtras } from "@/lib/services/bookings";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  addons: z.object({ extra_luggage: z.number().int().min(0).max(20).optional(), flex_cancel: z.number().int().min(0).max(1).optional(), meal_pack: z.number().int().min(0).max(1).optional() }).optional(),
  promoCode: z.string().max(30).nullable().optional(),
});

export const PUT = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { db, bookingId } = await authorizeBooking((await ctx.params).id);
  const body = schema.safeParse(await readJson(req));
  if (!body.success) throw new BookingError("bad_request", "Invalid request.", 400);
  if (body.data.promoCode) {
    const rl = await rateLimit(db, `promo:${bookingId}`, 10, 600);
    if (!rl.ok) throw new BookingError("rate_limited", "Too many promo code attempts. Try again later.", 429);
  }
  return json(await saveExtras(db, bookingId, body.data));
});
