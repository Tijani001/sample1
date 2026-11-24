import type { Db, Queryable } from "@/lib/db/client";
import { parseLayout, type LayoutSpec } from "@/lib/domain/seat-layout";
import { addDaysIso, todayIso } from "@/lib/domain/time";

/** How long seats stay reserved while a traveller completes checkout. */
export const HOLD_MINUTES = 12;
/** Bookings close this many minutes before departure. */
export const SALES_CUTOFF_MINUTES = 20;

export class SeatUnavailableError extends Error {
  constructor(public seats: string[], public tripId: string) {
    super(seats.length ? `Seat${seats.length > 1 ? "s" : ""} ${seats.join(", ")} ${seats.length > 1 ? "are" : "is"} no longer available.` : "Not enough seats are available.");
    this.name = "SeatUnavailableError";
  }
}

/**
 * Materialises trips from active schedules for the given service dates (idempotent). Demo operators also get
 * seats pre-sold "through other channels" so that availability varies realistically between departures.
 */
export async function ensureTrips(db: Db, dates: string[], opts: { scheduleId?: string } = {}) {
  const unique = [...new Set(dates)];
  if (!unique.length) return;
  let pending = unique;
  if (!opts.scheduleId) {
    const done = await db.query<{ d: string }>(`select to_char(service_date,'YYYY-MM-DD') d from trip_materializations where service_date = any($1::date[])`, [unique]);
    const doneSet = new Set(done.map((r) => r.d));
    pending = unique.filter((d) => !doneSet.has(d));
    if (!pending.length) return;
  }
  await db.tx(async (q) => {
    const created = await q.query<{ id: string }>(
      `insert into trips (schedule_id, route_id, operator_id, vehicle_id, layout_id, service_date, departure_at, arrival_est_at, base_fare, currency, capacity, seating_mode, status)
       select s.id, s.route_id, s.operator_id, s.vehicle_id, v.layout_id, d::date,
              ((d::date + s.departure_time)::timestamp at time zone c.tz),
              ((d::date + s.departure_time)::timestamp at time zone c.tz) + make_interval(mins => r.duration_min),
              s.base_fare, s.currency, l.seat_count, o.seating_mode,
              case when ((d::date + s.departure_time)::timestamp at time zone c.tz) + make_interval(mins => r.duration_min) < now() then 'arrived' else 'scheduled' end
         from schedules s
         join routes r on r.id = s.route_id
         join cities c on c.id = r.origin_city_id
         join vehicles v on v.id = s.vehicle_id
         join vehicle_layouts l on l.id = v.layout_id
         join operators o on o.id = s.operator_id
         cross join unnest($1::date[]) d
        where s.status = 'active' and r.status = 'active'
          and extract(dow from d)::int = any(s.days_of_week)
          and d >= s.valid_from and (s.valid_to is null or d <= s.valid_to)
          and ($2::text is null or s.id = $2)
       on conflict (schedule_id, service_date) do nothing
       returning id`,
      [pending, opts.scheduleId ?? null],
    );
    if (created.length) {
      await q.query(
        `insert into seat_inventory (trip_id, seat_no, status, source)
         select t.id, st.seat_no, 'external', 'external_channel'
           from trips t
           join schedules s on s.id = t.schedule_id
           join operators o on o.id = t.operator_id and o.is_demo
           join seats st on st.layout_id = t.layout_id
          where t.id = any($1::uuid[])
            and (abs(hashtext(t.id::text || ':' || st.seat_no)) % 100) <
                greatest(0, least(100, s.demo_load_pct + case when s.demo_load_pct >= 90 then 0 else (abs(hashtext(t.id::text)) % 31) - 15 end))
         on conflict do nothing`,
        [created.map((r) => r.id)],
      );
    }
    if (!opts.scheduleId) {
      await q.query(`insert into trip_materializations (service_date) select unnest($1::date[]) on conflict do nothing`, [pending]);
    }
  });
}

/** Ensures a rolling window of trips exists (used by portals and dashboards). */
export async function ensureTripWindow(db: Db, from = -7, to = 14) {
  const today = todayIso();
  const dates: string[] = [];
  for (let i = from; i <= to; i++) dates.push(addDaysIso(today, i));
  await ensureTrips(db, dates);
}

export type SeatState = "available" | "held" | "sold" | "blocked";

export async function getSeatMap(db: Queryable, tripId: string, bookingId?: string | null) {
  const [trip] = await db.query<{ layout_id: string; spec: LayoutSpec; premium_surcharge: number; seating_mode: string; capacity: number }>(
    `select t.layout_id, l.spec, l.premium_surcharge, t.seating_mode, t.capacity from trips t join vehicle_layouts l on l.id = t.layout_id where t.id = $1`,
    [tripId],
  );
  if (!trip) return null;
  const rows = await db.query<{ seat_no: string; status: string; booking_id: string | null; held_until: Date | null }>(
    `select seat_no, status, booking_id, held_until from seat_inventory where trip_id = $1`,
    [tripId],
  );
  const now = Date.now();
  const states: Record<string, { state: SeatState; mine: boolean }> = {};
  for (const r of rows) {
    const mine = !!bookingId && r.booking_id === bookingId;
    if (r.status === "held") {
      if (r.held_until && new Date(r.held_until).getTime() > now) states[r.seat_no] = { state: "held", mine };
    } else if (r.status === "sold" || r.status === "external") {
      states[r.seat_no] = { state: "sold", mine };
    } else states[r.seat_no] = { state: "blocked", mine };
  }
  const parsed = parseLayout(trip.spec);
  const available = parsed.seats.filter((s) => !states[s.seatNo] || states[s.seatNo].mine).length;
  return { layoutId: trip.layout_id, spec: trip.spec, premiumSurcharge: trip.premium_surcharge, seatingMode: trip.seating_mode as "assigned" | "open", states, available, capacity: trip.capacity };
}

/**
 * Atomically reserves `seats` on `tripId` for `bookingId` inside the caller's transaction.
 * Expired holds are swept first; the (trip_id, seat_no) primary key guarantees no seat is ever held or sold twice.
 */
export async function acquireHolds(q: Queryable, args: { tripId: string; bookingId: string; seats: string[]; until: Date }) {
  const { tripId, bookingId, seats, until } = args;
  await q.query(`delete from seat_inventory where trip_id = $1 and status = 'held' and held_until < now()`, [tripId]);
  // Keep seats this booking already holds (re-entrant), release the rest of its holds on this trip.
  await q.query(`delete from seat_inventory where trip_id = $1 and booking_id = $2 and status = 'held' and not (seat_no = any($3::text[]))`, [tripId, bookingId, seats]);
  const inserted = await q.query<{ seat_no: string }>(
    `insert into seat_inventory (trip_id, seat_no, status, booking_id, held_until)
     select $1, s, 'held', $2, $4 from unnest($3::text[]) s
     on conflict (trip_id, seat_no) do update set held_until = excluded.held_until
       where seat_inventory.booking_id = excluded.booking_id and seat_inventory.status = 'held'
     returning seat_no`,
    [tripId, bookingId, seats, until.toISOString()],
  );
  const got = new Set(inserted.map((r) => r.seat_no));
  const missing = seats.filter((s) => !got.has(s));
  if (missing.length) throw new SeatUnavailableError(missing, tripId);
}

/** Picks the lowest-numbered free standard seats (used for open-seating operators and reconciliation). */
export async function pickFreeSeats(q: Queryable, tripId: string, count: number, exclude: string[] = []) {
  const rows = await q.query<{ seat_no: string }>(
    `select st.seat_no from trips t join seats st on st.layout_id = t.layout_id
      where t.id = $1
        and not exists (select 1 from seat_inventory si where si.trip_id = t.id and si.seat_no = st.seat_no and (si.status <> 'held' or si.held_until > now()))
        and not (st.seat_no = any($3::text[]))
      order by st.is_premium, st.seat_no::int
      limit $2`,
    [tripId, count, exclude],
  );
  return rows.map((r) => r.seat_no);
}

export async function releaseBookingSeats(q: Queryable, bookingId: string) {
  await q.query(`delete from seat_inventory where booking_id = $1`, [bookingId]);
}

/** Expires unpaid bookings whose seat hold has lapsed and frees their seats. Safe to run at any time. */
export async function expireStaleBookings(db: Db) {
  return db.tx(async (q) => {
    const expired = await q.query<{ id: string }>(
      `update bookings set status = 'expired'
        where status = 'awaiting_payment' and hold_expires_at < now() - interval '2 minutes'
          and not exists (select 1 from payments p where p.booking_id = bookings.id and p.status in ('pending','success'))
        returning id`,
    );
    if (expired.length) {
      await q.query(`delete from seat_inventory where status = 'held' and booking_id = any($1::uuid[])`, [expired.map((e) => e.id)]);
    }
    return expired.length;
  });
}
