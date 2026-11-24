import { z } from "zod";
import { json, readJson, route } from "@/lib/api";
import { getDb, getSessionUser, clientIp } from "@/lib/server";
import { createDraft, BookingError } from "@/lib/services/bookings";
import { grantBookingAccess } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  passengers: z.number().int().min(1).max(10),
  segments: z.array(z.object({ tripId: z.string().uuid(), direction: z.enum(["outbound", "return"]), seats: z.array(z.string().max(4)).max(10).optional() })).min(1).max(2),
});

export const POST = route(async (req: Request) => {
  const body = schema.safeParse(await readJson(req));
  if (!body.success) throw new BookingError("bad_request", "Invalid booking request.", 400);
  const db = await getDb();
  const rl = await rateLimit(db, `draft:${await clientIp()}`, 30, 600);
  if (!rl.ok) throw new BookingError("rate_limited", "Too many booking attempts. Please wait a few minutes.", 429);
  const user = await getSessionUser();
  const draft = await createDraft(db, {
    tripType: body.data.segments.length === 2 ? "round_trip" : "one_way",
    passengers: body.data.passengers,
    segments: body.data.segments,
    userId: user?.id ?? null,
    idempotencyKey: req.headers.get("idempotency-key")?.slice(0, 80) || null,
  });
  await grantBookingAccess(draft.bookingId);
  return json({ bookingId: draft.bookingId, reference: draft.reference, holdExpiresAt: draft.holdExpiresAt, accessToken: draft.accessToken }, 201);
});
