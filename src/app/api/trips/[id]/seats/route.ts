import { json, route } from "@/lib/api";
import { getDb } from "@/lib/server";
import { getSeatMap } from "@/lib/services/inventory";
import { BookingError } from "@/lib/services/bookings";
import { grantedBookingIds } from "@/lib/auth/session";

export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BookingError("not_found", "Trip not found.", 404);
  const booking = new URL(req.url).searchParams.get("booking");
  const mine = booking && (await grantedBookingIds()).includes(booking) ? booking : null;
  const map = await getSeatMap(await getDb(), id, mine);
  if (!map) throw new BookingError("not_found", "Trip not found.", 404);
  return json(map, { headers: { "Cache-Control": "no-store" } });
});
