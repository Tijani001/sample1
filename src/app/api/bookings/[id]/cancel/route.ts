import { authorizeBooking, json, readJson, route } from "@/lib/api";
import { cancelBooking, cancellationQuote } from "@/lib/services/bookings";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { db, bookingId } = await authorizeBooking((await ctx.params).id);
  return json(await cancellationQuote(db, bookingId));
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { db, bookingId, user } = await authorizeBooking((await ctx.params).id);
  const body = await readJson<{ reason?: string }>(req);
  const res = await cancelBooking(db, bookingId, { userId: user?.id ?? null, label: user ? "traveller" : "guest" }, String(body.reason ?? "Cancelled by traveller").slice(0, 300));
  return json(res);
});
