import { authorizeBooking, json, readJson, route } from "@/lib/api";
import { submitReview } from "@/lib/services/bookings";

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { db, bookingId, user } = await authorizeBooking((await ctx.params).id);
  const body = await readJson<{ rating?: number; comment?: string }>(req);
  return json(await submitReview(db, bookingId, user?.id ?? null, Number(body.rating), String(body.comment ?? "")));
});
