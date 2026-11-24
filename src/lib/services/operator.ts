import type { Db } from "@/lib/db/client";
import { parseLayout, validateLayout, seatCount, type LayoutSpec } from "@/lib/domain/seat-layout";
import { addDaysIso, todayIso } from "@/lib/domain/time";
import { audit, type Actor } from "./audit";
import { notify } from "./notifications";
import { cancelBooking, BookingError } from "./bookings";
import { ensureTrips, ensureTripWindow } from "./inventory";

export async function operatorDashboard(db: Db, operatorId: string) {
  await ensureTripWindow(db, -30, 7);
  const [stats] = await db.query<{ bookings30: number; gross30: number; cancelled30: number; upcoming7: number; today: number; vehicles: number; active_vehicles: number }>(
    `select
       (select count(distinct b.id) from bookings b join booking_segments bs on bs.booking_id = b.id join trips t on t.id = bs.trip_id where t.operator_id = $1 and b.confirmed_at > now() - interval '30 days')::int bookings30,
       (select coalesce(sum(pc.gross),0) from platform_commissions pc join bookings b on b.id = pc.booking_id where pc.operator_id = $1 and pc.created_at > now() - interval '30 days' and b.status = 'confirmed')::int gross30,
       (select count(distinct b.id) from bookings b join booking_segments bs on bs.booking_id = b.id join trips t on t.id = bs.trip_id where t.operator_id = $1 and b.cancelled_at > now() - interval '30 days')::int cancelled30,
       (select count(*) from trips where operator_id = $1 and departure_at between now() and now() + interval '7 days' and status <> 'cancelled')::int upcoming7,
       (select count(*) from trips where operator_id = $1 and service_date = (now() at time zone 'Africa/Lagos')::date and status <> 'cancelled')::int today,
       (select count(*) from vehicles where operator_id = $1)::int vehicles,
       (select count(*) from vehicles where operator_id = $1 and status = 'active')::int active_vehicles`,
    [operatorId],
  );
  const [occ] = await db.query<{ occupancy: number | null }>(
    `select round(avg(taken::numeric / capacity) * 100)::int occupancy from (
       select t.capacity, (select count(*) from seat_inventory si where si.trip_id = t.id and si.status in ('sold','external'))::int taken
         from trips t where t.operator_id = $1 and t.departure_at between now() and now() + interval '7 days' and t.status <> 'cancelled') x`, [operatorId]);
  const [settle] = await db.query<{ pending: number }>(
    `select coalesce(sum(pc.gross - pc.amount),0)::int pending from platform_commissions pc join bookings b on b.id = pc.booking_id
      where pc.operator_id = $1 and b.status = 'confirmed' and not exists (select 1 from operator_settlements s where s.operator_id = pc.operator_id and s.status = 'paid' and pc.created_at::date between s.period_start and s.period_end)`, [operatorId]);
  const recent = await db.query<{ reference: string; pax: number; total: number; status: string; created_at: Date; route: string; departure_at: Date; contact_name: string }>(
    `select b.reference, b.passenger_count pax, pc.gross total, b.status, b.confirmed_at created_at, oc.name || ' → ' || dc.name route, t.departure_at, b.contact_name
       from platform_commissions pc join bookings b on b.id = pc.booking_id join booking_segments bs on bs.id = pc.segment_id join trips t on t.id = bs.trip_id join routes r on r.id = t.route_id
       join cities oc on oc.id = r.origin_city_id join cities dc on dc.id = r.destination_city_id
      where pc.operator_id = $1 order by pc.created_at desc limit 8`, [operatorId]);
  const cancellationRate = stats.bookings30 + stats.cancelled30 > 0 ? Math.round((stats.cancelled30 / (stats.bookings30 + stats.cancelled30)) * 1000) / 10 : 0;
  return { ...stats, occupancy: occ.occupancy ?? 0, pendingSettlement: settle.pending, cancellationRate, recent };
}

export async function departuresForDate(db: Db, operatorId: string, date: string) {
  await ensureTrips(db, [date]);
  return db.query<{ id: string; departure_at: Date; arrival_est_at: Date; status: string; delay_min: number; capacity: number; sold: number; external: number; held: number; blocked: number; route: string; plate: string; model: string; boarded: number; tickets: number }>(
    `select t.id, t.departure_at, t.arrival_est_at, t.status, t.delay_min, t.capacity,
            count(si.*) filter (where si.status = 'sold')::int sold, count(si.*) filter (where si.status = 'external')::int external,
            count(si.*) filter (where si.status = 'held' and si.held_until > now())::int held, count(si.*) filter (where si.status = 'blocked')::int blocked,
            oc.name || ' → ' || dc.name route, v.plate_number plate, v.model,
            (select count(*) from tickets tk join booking_segments bs on bs.id = tk.segment_id where bs.trip_id = t.id and tk.status = 'boarded')::int boarded,
            (select count(*) from tickets tk join booking_segments bs on bs.id = tk.segment_id where bs.trip_id = t.id and tk.status <> 'void')::int tickets
       from trips t join routes r on r.id = t.route_id join cities oc on oc.id = r.origin_city_id join cities dc on dc.id = r.destination_city_id
       join vehicles v on v.id = t.vehicle_id left join seat_inventory si on si.trip_id = t.id
      where t.operator_id = $1 and t.service_date = $2::date
      group by t.id, oc.name, dc.name, v.plate_number, v.model order by t.departure_at`,
    [operatorId, date],
  );
}

export async function tripManifest(db: Db, operatorId: string, tripId: string) {
  const [trip] = await db.query<{ id: string; operator_id: string }>(`select id, operator_id from trips where id = $1`, [tripId]);
  if (!trip || trip.operator_id !== operatorId) throw new BookingError("forbidden", "This departure belongs to another operator.", 403);
  return db.query<{ ticket_id: string; ticket_no: string; ticket_status: string; boarded_at: Date | null; full_name: string; phone: string | null; nok_name: string | null; nok_phone: string | null; seat_no: string | null; reference: string; booking_status: string }>(
    `select tk.id ticket_id, tk.ticket_no, tk.status ticket_status, tk.boarded_at, bp.full_name, coalesce(bp.phone, b.contact_phone) phone, bp.next_of_kin_name nok_name, bp.next_of_kin_phone nok_phone, bst.seat_no, b.reference, b.status booking_status
       from booking_segments bs join bookings b on b.id = bs.booking_id join tickets tk on tk.segment_id = bs.id
       join booking_passengers bp on bp.booking_id = b.id and bp.seq = tk.passenger_seq
       left join booking_seats bst on bst.segment_id = bs.id and bst.passenger_seq = tk.passenger_seq
      where bs.trip_id = $1 order by bst.seat_no::int nulls last, bp.full_name`, [tripId]);
}

async function assertTrip(db: Db, operatorId: string, tripId: string) {
  const [t] = await db.query<{ operator_id: string; status: string; departure_at: Date; arrival_est_at: Date; o: string; d: string }>(
    `select t.operator_id, t.status, t.departure_at, t.arrival_est_at, oc.name o, dc.name d from trips t join routes r on r.id = t.route_id join cities oc on oc.id = r.origin_city_id join cities dc on dc.id = r.destination_city_id where t.id = $1`, [tripId]);
  if (!t || t.operator_id !== operatorId) throw new BookingError("forbidden", "This departure belongs to another operator.", 403);
  return t;
}

const STATUS_MESSAGES: Record<string, (o: string, d: string, extra: string) => string> = {
  boarding: (o) => `Boarding has started at the ${o} terminal.`,
  departed: (o, d) => `Your vehicle has departed ${o} for ${d}.`,
  in_transit: (_o, d) => `On the way to ${d}.`,
  delayed: (_o, _d, extra) => `Delayed by about ${extra} minutes.`,
  arrived: (_o, d) => `Arrived in ${d}. Thanks for travelling with Goroada.`,
  cancelled: () => "This departure has been cancelled by the operator. You'll receive a full refund.",
};

/** Operator journey update: changes trip status, logs a verified event and notifies every confirmed passenger. */
export async function updateTripStatus(db: Db, operatorId: string, tripId: string, actor: Actor, input: { status: "boarding" | "departed" | "in_transit" | "delayed" | "arrived" | "cancelled"; delayMin?: number; note?: string }) {
  const t = await assertTrip(db, operatorId, tripId);
  if (["arrived", "cancelled"].includes(t.status)) throw new BookingError("invalid_state", `This departure is already ${t.status}.`, 409);
  const delay = input.status === "delayed" ? Math.max(5, Math.min(600, Math.round(input.delayMin ?? 30))) : undefined;
  const message = (input.note?.trim() || STATUS_MESSAGES[input.status](t.o, t.d, String(delay ?? ""))).slice(0, 300);
  const eta = delay != null ? new Date(new Date(t.arrival_est_at).getTime() + delay * 60000) : null;
  const bookings = await db.query<{ id: string; user_id: string | null; reference: string; contact_email: string | null; contact_phone: string | null }>(
    `select distinct b.id, b.user_id, b.reference, b.contact_email, b.contact_phone from booking_segments bs join bookings b on b.id = bs.booking_id where bs.trip_id = $1 and b.status = 'confirmed'`, [tripId]);
  await db.tx(async (q) => {
    await q.query(`update trips set status = $2, delay_min = coalesce($3, delay_min), updated_at = now() where id = $1`, [tripId, input.status, delay ?? null]);
    await q.query(`insert into journey_events (trip_id, kind, status, message, eta, source, created_by) values ($1,$2,$3,$4,$5,'operator',$6)`,
      [tripId, input.status === "delayed" ? "delay" : "status", input.status, message, eta?.toISOString() ?? null, actor.userId]);
    for (const b of bookings) {
      if (input.status === "in_transit") continue; // avoid noise
      await notify(q, { userId: b.user_id, bookingId: b.id, category: "transactional", kind: `trip_${input.status}`, title: `${t.o} → ${t.d}: ${input.status.replace("_", " ")}`, body: message, href: `/trips/${b.reference}/track`, channels: { sms: b.contact_phone, email: input.status === "cancelled" || input.status === "delayed" ? b.contact_email : null } });
    }
    await audit(q, actor, `trip.${input.status}`, "trip", tripId, { delay, passengers: bookings.length });
  });
  if (input.status === "cancelled") {
    for (const b of bookings) await cancelBooking(db, b.id, actor, "Departure cancelled by operator", { operatorCancelled: true });
  }
  return { notified: bookings.length };
}

/** Blocks or releases seats on a departure (e.g. offline sales, crew seats). Never touches sold seats. */
export async function setSeatBlocks(db: Db, operatorId: string, tripId: string, actor: Actor, block: string[], unblock: string[]) {
  await assertTrip(db, operatorId, tripId);
  return db.tx(async (q) => {
    let blocked = 0;
    if (block.length) {
      await q.query(`delete from seat_inventory where trip_id = $1 and status = 'held' and held_until < now()`, [tripId]);
      const r = await q.query(`insert into seat_inventory (trip_id, seat_no, status, source) select $1, s, 'blocked', 'operator' from unnest($2::text[]) s
                               where exists (select 1 from trips t join seats st on st.layout_id = t.layout_id where t.id = $1 and st.seat_no = s) on conflict do nothing returning seat_no`, [tripId, block]);
      blocked = r.length;
    }
    let released = 0;
    if (unblock.length) released = (await q.query(`delete from seat_inventory where trip_id = $1 and seat_no = any($2::text[]) and status in ('blocked','external') returning seat_no`, [tripId, unblock])).length;
    await audit(q, actor, "inventory.updated", "trip", tripId, { blocked, released });
    return { blocked, released, skipped: block.length - blocked };
  });
}

export async function createLayout(db: Db, operatorId: string, actor: Actor, input: { name: string; spec: LayoutSpec; premiumSurcharge: number }) {
  const errors = validateLayout(input.spec);
  if (errors.length) throw new BookingError("invalid_layout", errors.join(" "), 422);
  const id = `${operatorId}-layout-${Date.now().toString(36)}`;
  const parsed = parseLayout(input.spec);
  await db.tx(async (q) => {
    await q.query(`insert into vehicle_layouts (id, operator_id, name, spec, seat_count, premium_surcharge) values ($1,$2,$3,$4,$5,$6)`, [id, operatorId, input.name.slice(0, 60), JSON.stringify(input.spec), seatCount(input.spec), Math.max(0, input.premiumSurcharge)]);
    for (const s of parsed.seats) await q.query(`insert into seats (layout_id, seat_no, row_idx, col_idx, is_premium) values ($1,$2,$3,$4,$5)`, [id, s.seatNo, s.row, s.col, s.premium]);
    await audit(q, actor, "layout.created", "vehicle_layout", id, { seats: parsed.seats.length });
  });
  return id;
}

export async function createVehicle(db: Db, operatorId: string, actor: Actor, input: { typeId: string; layoutId: string; plate: string; model: string; year: number; amenities: string[] }) {
  const [layout] = await db.query(`select 1 from vehicle_layouts where id = $1 and (operator_id is null or operator_id = $2)`, [input.layoutId, operatorId]);
  if (!layout) throw new BookingError("invalid_layout", "Choose a valid seat layout.", 422);
  const id = `${operatorId}-v-${Date.now().toString(36)}`;
  await db.query(`insert into vehicles (id, operator_id, vehicle_type_id, layout_id, plate_number, model, year, amenities) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, operatorId, input.typeId, input.layoutId, input.plate.toUpperCase().slice(0, 15), input.model.slice(0, 60), input.year, input.amenities]);
  await audit(db, actor, "vehicle.created", "vehicle", id, { plate: input.plate });
  return id;
}

export async function createSchedule(db: Db, operatorId: string, actor: Actor, input: { routeId: string; vehicleId: string; time: string; days: number[]; fare: number; policyId: string }) {
  const [ok] = await db.query(`select 1 from routes r join vehicles v on v.operator_id = r.operator_id where r.id = $1 and v.id = $2 and r.operator_id = $3`, [input.routeId, input.vehicleId, operatorId]);
  if (!ok) throw new BookingError("forbidden", "Route or vehicle not found.", 404);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new BookingError("validation", "Enter a valid departure time.", 422);
  if (!input.days.length) throw new BookingError("validation", "Choose at least one day of the week.", 422);
  if (input.fare < 50000 || input.fare > 50_000_000) throw new BookingError("validation", "Fare must be between ₦500 and ₦500,000.", 422);
  const id = `${input.routeId}@${input.time}-${Date.now().toString(36).slice(-4)}`;
  await db.query(`insert into schedules (id, route_id, operator_id, vehicle_id, departure_time, days_of_week, base_fare, cancellation_policy_id, valid_from) values ($1,$2,$3,$4,$5,$6,$7,$8,current_date)`,
    [id, input.routeId, operatorId, input.vehicleId, input.time, input.days, input.fare, input.policyId]);
  const dates = (await db.query<{ d: string }>(`select to_char(service_date,'YYYY-MM-DD') d from trip_materializations where service_date >= current_date`)).map((r) => r.d);
  await ensureTrips(db, dates, { scheduleId: id });
  await audit(db, actor, "schedule.created", "schedule", id, { fare: input.fare, time: input.time });
  return id;
}

export async function financeSummary(db: Db, operatorId: string, days = 90) {
  const [totals] = await db.query<{ gross: number; commission: number; refunds: number; bookings: number }>(
    `select coalesce(sum(pc.gross),0)::int gross, coalesce(sum(pc.amount),0)::int commission, count(distinct pc.booking_id)::int bookings,
            (select coalesce(sum(r.amount),0) from refunds r join booking_segments bs on bs.booking_id = r.booking_id join trips t on t.id = bs.trip_id where t.operator_id = $1 and r.created_at > now() - make_interval(days => $2))::int refunds
       from platform_commissions pc where pc.operator_id = $1 and pc.created_at > now() - make_interval(days => $2)`, [operatorId, days]);
  const daily = await db.query<{ d: string; gross: number }>(
    `select to_char(created_at at time zone 'Africa/Lagos','YYYY-MM-DD') d, sum(gross)::int gross from platform_commissions where operator_id = $1 and created_at > now() - interval '14 days' group by 1 order by 1`, [operatorId]);
  const transactions = await db.query<{ reference: string; created_at: Date; gross: number; commission: number; status: string; route: string }>(
    `select b.reference, pc.created_at, pc.gross, pc.amount commission, b.status, oc.name || ' → ' || dc.name route
       from platform_commissions pc join bookings b on b.id = pc.booking_id join booking_segments bs on bs.id = pc.segment_id join trips t on t.id = bs.trip_id join routes r on r.id = t.route_id
       join cities oc on oc.id = r.origin_city_id join cities dc on dc.id = r.destination_city_id where pc.operator_id = $1 order by pc.created_at desc limit 100`, [operatorId]);
  const settlements = await db.query<{ id: string; period_start: Date; period_end: Date; gross: number; commission: number; refunds: number; net: number; status: string; paid_at: Date | null }>(
    `select * from operator_settlements where operator_id = $1 order by period_end desc`, [operatorId]);
  const today = todayIso();
  const series: { d: string; gross: number }[] = [];
  for (let i = 13; i >= 0; i--) { const d = addDaysIso(today, -i); series.push({ d, gross: daily.find((x) => x.d === d)?.gross ?? 0 }); }
  return { totals: { ...totals, net: totals.gross - totals.commission }, series, transactions, settlements };
}
