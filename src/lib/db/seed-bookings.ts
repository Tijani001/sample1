import type { Db } from "./client";
import { addDaysIso, todayIso } from "@/lib/domain/time";
import { bookingReference, secureToken, sha256, ticketNumber } from "@/lib/domain/ids";
import { ensureTrips, pickFreeSeats } from "@/lib/services/inventory";
import { createDraft, savePassengers, cancelBooking } from "@/lib/services/bookings";
import { initializePayment, verifyPayment, processRefund } from "@/lib/services/payments";
import { completeDemoTransaction } from "@/lib/services/payments/demo";
import { log } from "@/lib/log";

async function findTrip(db: Db, from: string, to: string, date: string, operator?: string | null) {
  await ensureTrips(db, [date]);
  const [t] = await db.query<{ id: string }>(
    `select t.id from trips t join routes r on r.id = t.route_id
      where r.origin_city_id = $1 and r.destination_city_id = $2 and t.service_date = $3::date and ($4::text is null or t.operator_id = $4)
        and t.seating_mode = 'assigned'
        and t.capacity - (select count(*) from seat_inventory si where si.trip_id = t.id) >= 3
      order by t.departure_at limit 1`,
    [from, to, date, operator ?? null],
  );
  return t?.id ?? null;
}

const traveller = { name: "Adaeze Okafor", email: "traveller@demo.goroada.app", phone: "+2348030000001" };

async function bookUpcoming(db: Db, userId: string, from: string, to: string, days: number, pax: number, operator?: string) {
  const date = addDaysIso(todayIso(), days);
  const tripId = await findTrip(db, from, to, date, operator);
  if (!tripId) return null;
  const seats = await pickFreeSeats(db, tripId, pax);
  const draft = await createDraft(db, { tripType: "one_way", passengers: pax, segments: [{ tripId, direction: "outbound", seats }], userId });
  await savePassengers(db, draft.bookingId, {
    contact: traveller,
    passengers: [
      { fullName: "Adaeze Okafor", phone: traveller.phone, email: traveller.email, nextOfKinName: "Chidi Okafor", nextOfKinPhone: "+2348030000009" },
      { fullName: "Obinna Okafor", phone: "+2348030000011" },
    ].slice(0, pax),
  });
  const pay = await initializePayment(db, { bookingId: draft.bookingId, provider: "demo", baseUrl: "" });
  await completeDemoTransaction(db, pay.reference, "success", "card");
  await verifyPayment(db, pay.reference);
  return draft.bookingId;
}

/** A historical, completed journey (inserted directly because past departures are not bookable). */
async function insertCompleted(db: Db, userId: string | null, from: string, to: string, daysAgo: number, who = traveller, operator: string | null = null) {
  const date = addDaysIso(todayIso(), -daysAgo);
  const tripId = await findTrip(db, from, to, date, operator);
  if (!tripId) return;
  const seats = await pickFreeSeats(db, tripId, 1);
  if (!seats.length) return;
  await db.tx(async (q) => {
    const [t] = await q.query<{ base_fare: number }>(`select base_fare from trips where id = $1`, [tripId]);
    const total = t.base_fare + 30000;
    const [b] = await q.query<{ id: string }>(
      `insert into bookings (reference, user_id, status, trip_type, passenger_count, contact_name, contact_email, contact_phone, fare_total, service_fee, total, access_token_hash, created_at, confirmed_at)
       values ($1,$2,'confirmed','one_way',1,$3,$4,$5,$6,30000,$7,$8, now() - make_interval(days => $9), now() - make_interval(days => $9)) returning id`,
      [bookingReference(), userId, who.name, who.email, who.phone, t.base_fare, total, sha256(secureToken()), Math.max(daysAgo, 1) + (daysAgo % 3)],
    );
    const [s] = await q.query<{ id: string }>(`insert into booking_segments (booking_id, trip_id, direction, fare_per_seat) values ($1,$2,'outbound',$3) returning id`, [b.id, tripId, t.base_fare]);
    await q.query(`insert into booking_passengers (booking_id, seq, full_name, phone, email, next_of_kin_name, next_of_kin_phone) values ($1,1,$2,$3,$4,'Chidi Okafor','+2348030000009')`, [b.id, who.name, who.phone, who.email]);
    await q.query(`insert into booking_seats (segment_id, passenger_seq, seat_no) values ($1,1,$2)`, [s.id, seats[0]]);
    await q.query(`insert into seat_inventory (trip_id, seat_no, status, booking_id) values ($1,$2,'sold',$3) on conflict do nothing`, [tripId, seats[0], b.id]);
    await q.query(`insert into tickets (booking_id, segment_id, passenger_seq, ticket_no, verification_token, status, boarded_at) values ($1,$2,1,$3,$4,'boarded', now() - make_interval(days => $5))`, [b.id, s.id, ticketNumber(), secureToken(16), daysAgo]);
    await q.query(`insert into payments (booking_id, provider, reference, amount, currency, status, channel, verified_at) values ($1,'demo',$2,$3,'NGN','success','card', now() - make_interval(days => $4))`, [b.id, `${b.id.slice(0, 8)}-SEED`, total, daysAgo + 4]);
    await q.query(`insert into platform_commissions (booking_id, segment_id, operator_id, gross, rate_bps, amount, created_at) select $1, $2, operator_id, $3, 800, $3 * 8 / 100, now() - make_interval(days => $5) from trips where id = $4`, [b.id, s.id, t.base_fare, tripId, Math.max(daysAgo, 1) + (daysAgo % 3)]);
  });
}

export async function seedSampleBookings(db: Db) {
  try {
    const [u] = await db.query<{ id: string }>(`select id from users where email = 'traveller@demo.goroada.app'`);
    if (!u) return;
    await bookUpcoming(db, u.id, "lagos", "abuja", 5, 2, "atlantic-coaches");
    await bookUpcoming(db, u.id, "lagos", "ibadan", 1, 1);
    const toCancel = await bookUpcoming(db, u.id, "abuja", "kano", 9, 1);
    if (toCancel) {
      await cancelBooking(db, toCancel, { userId: u.id, label: "traveller" }, "Change of plans");
      const [r] = await db.query<{ id: string }>(`select id from refunds where booking_id = $1`, [toCancel]);
      if (r) await processRefund(db, r.id, { userId: null, label: "seed" });
    }
    await insertCompleted(db, u.id, "lagos", "ibadan", 6);
    await insertCompleted(db, u.id, "ibadan", "lagos", 4);
    // Background marketplace activity from other (fictional) guest customers, for dashboards and reports.
    const names = ["Bola Adewale", "Chinedu Eze", "Fatima Sani", "Kunle Ojo", "Amaka Nwosu", "Sadiq Umar", "Yemi Alade", "Ifeoma Obi", "Tunde Bello", "Hauwa Musa"];
    const lanes: [string, string, string][] = [["abuja", "kaduna", "savannah-line"], ["abuja", "kano", "savannah-line"], ["kano", "abuja", "savannah-line"], ["lagos", "ibadan", "greenway-motors"], ["lagos", "abuja", "atlantic-coaches"], ["port-harcourt", "enugu", "eastlink-comfort"], ["lagos", "benin-city", "delta-star"], ["abuja", "lagos", "savannah-line"], ["kano", "kaduna", "harmattan-transit"], ["uyo", "calabar", "crossriver-express"]];
    for (let i = 0; i < 36; i++) {
      const [f, t, op] = lanes[i % lanes.length];
      const n = names[i % names.length];
      const who = { name: n, email: `${n.split(" ")[0].toLowerCase()}.${i}@example.com`, phone: `+23480${String(40000000 + i * 7919).slice(0, 8)}` };
      await insertCompleted(db, null, f, t, 1 + (i % 21), who, op);
    }
    // Mark notifications from seeding as read except the latest confirmation.
    await db.query(`update notifications set read_at = now() where user_id = $1 and kind <> 'booking_confirmed'`, [u.id]);
  } catch (e) {
    log.error("seed.sample_bookings_failed", { error: (e as Error).message });
  }
}
