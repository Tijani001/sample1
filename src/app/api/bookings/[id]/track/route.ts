import { authorizeBooking, json, route } from "@/lib/api";
import { secureToken } from "@/lib/domain/ids";
import { BookingError } from "@/lib/services/bookings";
import { baseUrl } from "@/lib/server";

/** Creates a time-limited, revocable tracking link for family and friends (no personal data on the page). */
export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { db, bookingId } = await authorizeBooking((await ctx.params).id);
  const [seg] = await db.query<{ id: string; arrival_est_at: Date; status: string }>(
    `select bs.id, t.arrival_est_at, b.status from booking_segments bs join trips t on t.id = bs.trip_id join bookings b on b.id = bs.booking_id
      where bs.booking_id = $1 and t.arrival_est_at > now() - interval '6 hours' order by t.departure_at limit 1`, [bookingId]);
  if (!seg || seg.status !== "confirmed") throw new BookingError("not_trackable", "There's no upcoming confirmed journey to share.", 409);
  const token = secureToken(18);
  const expires = new Date(new Date(seg.arrival_est_at).getTime() + 12 * 3600_000);
  await db.query(`insert into tracking_shares (token, booking_id, segment_id, expires_at) values ($1,$2,$3,$4)`, [token, bookingId, seg.id, expires.toISOString()]);
  return json({ url: `${await baseUrl()}/track/${token}`, expiresAt: expires.toISOString() });
});
