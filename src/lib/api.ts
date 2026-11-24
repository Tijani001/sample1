import "server-only";
import { NextResponse } from "next/server";
import { BookingError } from "@/lib/services/bookings";
import { log } from "@/lib/log";
import { getDb } from "@/lib/db/client";
import { canAccessBooking, getSessionUser } from "@/lib/auth/session";

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

/** Wraps a route handler with consistent error responses. Unexpected errors never leak internals. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof BookingError) return json({ error: { code: e.code, message: e.message, details: e.details } }, e.status);
      log.error("api.unhandled", { error: (e as Error).message, stack: (e as Error).stack?.split("\n").slice(0, 4).join(" | ") });
      return json({ error: { code: "internal", message: "Something went wrong on our side. Please try again." } }, 500);
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new BookingError("bad_request", "Invalid request body.", 400);
  }
}

/** Loads a booking id the caller is allowed to act on (owner, guest grant or staff). */
export async function authorizeBooking(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BookingError("not_found", "Booking not found.", 404);
  const db = await getDb();
  const [b] = await db.query<{ id: string; user_id: string | null }>(`select id, user_id from bookings where id = $1`, [id]);
  if (!b) throw new BookingError("not_found", "Booking not found.", 404);
  const user = await getSessionUser();
  if (!(await canAccessBooking({ id: b.id, userId: b.user_id }, user))) throw new BookingError("forbidden", "You don't have access to this booking.", 403);
  return { db, user, bookingId: b.id };
}
