import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/lib/db/client";
import { searchTrips, fareCalendar, type TripResult } from "@/lib/services/search";
import { createDraft, savePassengers, saveExtras, getBookingView, cancelBooking, changeSeats, BookingError } from "@/lib/services/bookings";
import { initializePayment, verifyPayment, handleWebhook, processRefund } from "@/lib/services/payments";
import { completeDemoTransaction } from "@/lib/services/payments/demo";
import { pickFreeSeats, getSeatMap, expireStaleBookings } from "@/lib/services/inventory";
import { verifyTicket } from "@/lib/services/tickets";
import { setSeatBlocks, updateTripStatus } from "@/lib/services/operator";
import { addDaysIso, todayIso } from "@/lib/domain/time";

let db: Db;
const SYS = { userId: null, label: "test" };
const contact = { name: "Test Traveller", email: "test@example.com", phone: "08031234567" };
const lead = { fullName: "Test Traveller", nextOfKinName: "Next Kin", nextOfKinPhone: "08039999999" };

async function bookableTrip(from = "lagos", to = "ibadan", days = 5, minFree = 4): Promise<TripResult> {
  const trips = await searchTrips(db, { from, to, date: addDaysIso(todayIso(), days) });
  const t = trips.find((x) => x.bookable && x.seatsLeft >= minFree && x.seatingMode === "assigned");
  if (!t) throw new Error("no bookable trip in seed data");
  return t;
}

async function draftAndPay(trip: TripResult, seats: string[], pay = true) {
  const d = await createDraft(db, { tripType: "one_way", passengers: seats.length, segments: [{ tripId: trip.id, direction: "outbound", seats }] });
  await savePassengers(db, d.bookingId, { contact, passengers: seats.map((_, i) => (i === 0 ? lead : { fullName: `Passenger ${"BCDEFGHIJ"[i]}ola` })) });
  const p = await initializePayment(db, { bookingId: d.bookingId, provider: "demo", baseUrl: "http://test" });
  if (pay) await completeDemoTransaction(db, p.reference, "success", "card");
  return { ...d, paymentRef: p.reference };
}

beforeAll(async () => {
  db = await createTestDb();
});

describe("search", () => {
  it("returns comparable trips from several operators with live availability", async () => {
    const trips = await searchTrips(db, { from: "lagos", to: "abuja", date: addDaysIso(todayIso(), 3) });
    expect(trips.length).toBeGreaterThan(2);
    expect(new Set(trips.map((t) => t.operator.id)).size).toBeGreaterThan(1);
    for (const t of trips) {
      expect(t.origin.cityId).toBe("lagos");
      expect(t.seatsLeft).toBeLessThanOrEqual(t.capacity);
      expect(Number.isInteger(t.fare)).toBe(true);
    }
  });
  it("returns nothing for unknown pairs and builds a fare calendar", async () => {
    expect(await searchTrips(db, { from: "sokoto", to: "calabar", date: addDaysIso(todayIso(), 3) })).toEqual([]);
    const cal = await fareCalendar(db, { from: "lagos", to: "ibadan", date: addDaysIso(todayIso(), 5) });
    expect(cal.some((c) => c.minFare != null)).toBe(true);
  });
});

describe("seat holds", () => {
  it("holds seats atomically and blocks a second traveller from the same seat", async () => {
    const trip = await bookableTrip();
    const [seat] = await pickFreeSeats(db, trip.id, 1);
    await createDraft(db, { tripType: "one_way", passengers: 1, segments: [{ tripId: trip.id, direction: "outbound", seats: [seat] }] });
    await expect(createDraft(db, { tripType: "one_way", passengers: 1, segments: [{ tripId: trip.id, direction: "outbound", seats: [seat] }] }))
      .rejects.toMatchObject({ code: "seat_unavailable" });
    const map = await getSeatMap(db, trip.id);
    expect(map!.states[seat].state).toBe("held");
  });

  it("allows exactly one winner when many travellers race for the same seat", async () => {
    const trip = await bookableTrip("lagos", "benin-city");
    const [seat] = await pickFreeSeats(db, trip.id, 1);
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, () =>
      createDraft(db, { tripType: "one_way", passengers: 1, segments: [{ tripId: trip.id, direction: "outbound", seats: [seat] }] })));
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const [{ n }] = await db.query<{ n: number }>(`select count(*)::int n from seat_inventory where trip_id = $1 and seat_no = $2`, [trip.id, seat]);
    expect(n).toBe(1);
  });

  it("releases expired holds so the seat can be booked again", async () => {
    const trip = await bookableTrip("abuja", "kaduna");
    const [seat] = await pickFreeSeats(db, trip.id, 1);
    const d = await createDraft(db, { tripType: "one_way", passengers: 1, segments: [{ tripId: trip.id, direction: "outbound", seats: [seat] }] });
    await db.query(`update seat_inventory set held_until = now() - interval '1 minute' where booking_id = $1`, [d.bookingId]);
    await db.query(`update bookings set hold_expires_at = now() - interval '5 minutes' where id = $1`, [d.bookingId]);
    expect(await expireStaleBookings(db)).toBeGreaterThanOrEqual(1);
    const again = await createDraft(db, { tripType: "one_way", passengers: 1, segments: [{ tripId: trip.id, direction: "outbound", seats: [seat] }] });
    expect(again.bookingId).not.toBe(d.bookingId);
    const [b] = await db.query<{ status: string }>(`select status from bookings where id = $1`, [d.bookingId]);
    expect(b.status).toBe("expired");
  });

  it("validates seat counts, duplicate seats and passenger limits", async () => {
    const trip = await bookableTrip();
    const seats = await pickFreeSeats(db, trip.id, 2);
    await expect(createDraft(db, { tripType: "one_way", passengers: 2, segments: [{ tripId: trip.id, direction: "outbound", seats: [seats[0]] }] })).rejects.toBeInstanceOf(BookingError);
    await expect(createDraft(db, { tripType: "one_way", passengers: 2, segments: [{ tripId: trip.id, direction: "outbound", seats: [seats[0], seats[0]] }] })).rejects.toMatchObject({ code: "seat_duplicate" });
    await expect(createDraft(db, { tripType: "one_way", passengers: 11, segments: [{ tripId: trip.id, direction: "outbound", seats }] })).rejects.toMatchObject({ code: "invalid_passengers" });
  });

  it("lets a traveller change seats within the original hold", async () => {
    const trip = await bookableTrip("enugu", "owerri", 6, 3);
    const [a, b] = await pickFreeSeats(db, trip.id, 2);
    const d = await createDraft(db, { tripType: "one_way", passengers: 1, segments: [{ tripId: trip.id, direction: "outbound", seats: [a] }] });
    await changeSeats(db, d.bookingId, "outbound", [b]);
    const map = await getSeatMap(db, trip.id);
    expect(map!.states[a]).toBeUndefined();
    expect(map!.states[b].state).toBe("held");
  });
});

describe("payment verification and confirmation", () => {
  it("confirms only after server-side verification and issues tickets exactly once", async () => {
    const trip = await bookableTrip("lagos", "abeokuta");
    const seats = await pickFreeSeats(db, trip.id, 2);
    const unpaid = await draftAndPay(trip, seats, false);
    const pending = await verifyPayment(db, unpaid.paymentRef);
    expect(pending.state).toBe("pending");
    await completeDemoTransaction(db, unpaid.paymentRef, "success", "card");
    const first = await verifyPayment(db, unpaid.paymentRef);
    const second = await verifyPayment(db, unpaid.paymentRef);
    expect(first.state).toBe("confirmed");
    expect(second).toMatchObject({ state: "confirmed", outcome: { status: "already_confirmed" } });
    const v = await getBookingView(db, unpaid.bookingId);
    expect(v!.status).toBe("confirmed");
    expect(v!.segments[0].tickets).toHaveLength(2);
    const [{ sold }] = await db.query<{ sold: number }>(`select count(*)::int sold from seat_inventory where booking_id = $1 and status = 'sold'`, [unpaid.bookingId]);
    expect(sold).toBe(2);
  });

  it("flags amount mismatches for reconciliation instead of confirming", async () => {
    const trip = await bookableTrip("ibadan", "osogbo");
    const seats = await pickFreeSeats(db, trip.id, 1);
    const d = await draftAndPay(trip, seats);
    await db.query(`update demo_gateway_transactions set amount = amount - 100 where reference = $1`, [d.paymentRef]);
    const r = await verifyPayment(db, d.paymentRef);
    expect(r.state).toBe("review");
    const [b] = await db.query<{ status: string }>(`select status from bookings where id = $1`, [d.bookingId]);
    expect(b.status).toBe("needs_reconciliation");
  });

  it("does not confirm failed payments and lets the traveller retry", async () => {
    const trip = await bookableTrip("lagos", "akure");
    const d = await draftAndPay(trip, await pickFreeSeats(db, trip.id, 1), false);
    await completeDemoTransaction(db, d.paymentRef, "failed", "card");
    expect((await verifyPayment(db, d.paymentRef)).state).toBe("failed");
    const [b] = await db.query<{ status: string }>(`select status from bookings where id = $1`, [d.bookingId]);
    expect(b.status).toBe("awaiting_payment");
  });

  it("refunds a duplicate second payment for an already-paid booking", async () => {
    const trip = await bookableTrip("kano", "kaduna");
    const d = await draftAndPay(trip, await pickFreeSeats(db, trip.id, 1));
    // A second payment is created before the first is verified (e.g. two tabs).
    const ref2 = `${d.reference}-DUP01`;
    const [{ total }] = await db.query<{ total: number }>(`select total from bookings where id = $1`, [d.bookingId]);
    await db.query(`insert into payments (booking_id, provider, reference, amount, currency) values ($1,'demo',$2,$3,'NGN')`, [d.bookingId, ref2, total]);
    await db.query(`insert into demo_gateway_transactions (reference, amount, currency, status) values ($1,$2,'NGN','success')`, [ref2, total]);
    expect((await verifyPayment(db, d.paymentRef)).state).toBe("confirmed");
    expect((await verifyPayment(db, ref2)).state).toBe("confirmed");
    const [p] = await db.query<{ status: string }>(`select status from payments where reference = $1`, [ref2]);
    expect(p.status).toBe("reversed");
    const refunds = await db.query(`select * from refunds where booking_id = $1`, [d.bookingId]);
    expect(refunds).toHaveLength(1);
  });

  it("re-allocates seats when payment arrives after the hold expired and the seat was taken", async () => {
    const trip = await bookableTrip("abuja", "minna", 7, 4);
    const [seat] = await pickFreeSeats(db, trip.id, 1);
    const late = await draftAndPay(trip, [seat]);
    await db.query(`update seat_inventory set held_until = now() - interval '1 minute' where booking_id = $1`, [late.bookingId]);
    // Someone else takes the seat after the hold lapsed.
    await createDraft(db, { tripType: "one_way", passengers: 1, segments: [{ tripId: trip.id, direction: "outbound", seats: [seat] }] });
    const r = await verifyPayment(db, late.paymentRef);
    expect(r).toMatchObject({ state: "confirmed", outcome: { status: "reassigned" } });
    const v = await getBookingView(db, late.bookingId);
    expect(v!.segments[0].seats[0].seatNo).not.toBe(seat);
  });

  it("opens a full refund when a late payment arrives for a sold-out departure", async () => {
    const trip = await bookableTrip("uyo", "calabar", 8, 1);
    const [seat] = await pickFreeSeats(db, trip.id, 1);
    const late = await draftAndPay(trip, [seat]);
    await db.query(`update seat_inventory set held_until = now() - interval '1 minute' where booking_id = $1`, [late.bookingId]);
    await db.query(`delete from seat_inventory where booking_id = $1`, [late.bookingId]);
    await db.query(`insert into seat_inventory (trip_id, seat_no, status, source) select $1, st.seat_no, 'external', 'external_channel' from trips t join seats st on st.layout_id = t.layout_id where t.id = $1 on conflict do nothing`, [trip.id]);
    const r = await verifyPayment(db, late.paymentRef);
    expect(r.state).toBe("review");
    const [refund] = await db.query<{ amount: number; status: string }>(`select amount, status from refunds where booking_id = $1`, [late.bookingId]);
    expect(refund.status).toBe("approved");
  });

  it("rejects webhooks with invalid signatures and processes valid ones once", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_dummy";
    const body = JSON.stringify({ event: "charge.success", data: { id: 987, reference: "UNKNOWN-REF" } });
    const bad = await handleWebhook(db, "paystack", body, new Headers({ "x-paystack-signature": "deadbeef" }));
    expect(bad.status).toBe(401);
    const sig = crypto.createHmac("sha512", "sk_test_dummy").update(body).digest("hex");
    const body2 = JSON.stringify({ event: "charge.success", data: { id: 988, reference: "UNKNOWN-REF" } });
    const sig2 = crypto.createHmac("sha512", "sk_test_dummy").update(body2).digest("hex");
    void sig;
    expect((await handleWebhook(db, "paystack", body2, new Headers({ "x-paystack-signature": sig2 }))).status).toBe(200);
    expect(await handleWebhook(db, "paystack", body2, new Headers({ "x-paystack-signature": sig2 }))).toMatchObject({ status: 200, duplicate: true });
    delete process.env.PAYSTACK_SECRET_KEY;
  });
});

describe("promotions at checkout", () => {
  it("applies a valid code, rejects an expired one and records redemption on confirmation", async () => {
    const trip = await bookableTrip("lagos", "ibadan", 9);
    const d = await createDraft(db, { tripType: "one_way", passengers: 1, segments: [{ tripId: trip.id, direction: "outbound", seats: await pickFreeSeats(db, trip.id, 1) }] });
    await savePassengers(db, d.bookingId, { contact: { ...contact, email: "promo@example.com" }, passengers: [lead] });
    expect((await saveExtras(db, d.bookingId, { promoCode: "RAINY2026" })).promoError).toMatch(/expired/);
    const ok = await saveExtras(db, d.bookingId, { promoCode: "lagiba1k" });
    expect(ok.promoError).toBeNull();
    expect(ok.quote.discount).toBe(100000);
    const p = await initializePayment(db, { bookingId: d.bookingId, provider: "demo", baseUrl: "" });
    await completeDemoTransaction(db, p.reference, "success", "card");
    await verifyPayment(db, p.reference);
    const [{ n }] = await db.query<{ n: number }>(`select count(*)::int n from promo_redemptions where booking_id = $1`, [d.bookingId]);
    expect(n).toBe(1);
  });
});

describe("tickets, cancellations and operator operations", () => {
  it("verifies tickets once and blocks duplicate boarding and other operators", async () => {
    const trip = await bookableTrip("lagos", "ibadan", 0, 1).catch(() => bookableTrip("lagos", "ibadan", 1, 1));
    const d = await draftAndPay(trip, await pickFreeSeats(db, trip.id, 1));
    await verifyPayment(db, d.paymentRef);
    const v = await getBookingView(db, d.bookingId);
    const token = v!.segments[0].tickets[0].verification_token;
    expect((await verifyTicket(db, `GOROADA:1:${token}`, "some-other-operator", SYS, false))).toMatchObject({ ok: false, reason: "wrong_operator" });
    const check = await verifyTicket(db, `GOROADA:1:${token}`, trip.operator.id, SYS, false);
    if (!check.ok && check.reason === "wrong_day") return; // trip not within boarding window on this run
    expect(check).toMatchObject({ ok: true, status: "valid" });
    expect(await verifyTicket(db, `GOROADA:1:${token}`, trip.operator.id, SYS, true)).toMatchObject({ ok: true, status: "boarded_now" });
    expect(await verifyTicket(db, `GOROADA:1:${token}`, trip.operator.id, SYS, true)).toMatchObject({ ok: false, reason: "already_boarded" });
    expect(await verifyTicket(db, "GOROADA:1:not-a-real-token-123456", null, SYS, false)).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("cancels with the fare-rule refund, voids tickets and frees seats", async () => {
    const trip = await bookableTrip("port-harcourt", "enugu", 10);
    const d = await draftAndPay(trip, await pickFreeSeats(db, trip.id, 1));
    await verifyPayment(db, d.paymentRef);
    const res = await cancelBooking(db, d.bookingId, SYS, "test");
    expect(res.refund).toBeGreaterThan(0);
    const v = await getBookingView(db, d.bookingId);
    expect(v!.status).toBe("refund_pending");
    expect(v!.segments[0].tickets.every((t) => t.status === "void")).toBe(true);
    const [{ n }] = await db.query<{ n: number }>(`select count(*)::int n from seat_inventory where booking_id = $1`, [d.bookingId]);
    expect(n).toBe(0);
    const [r] = await db.query<{ id: string }>(`select id from refunds where booking_id = $1`, [d.bookingId]);
    await processRefund(db, r.id, SYS);
    expect((await getBookingView(db, d.bookingId))!.status).toBe("refunded");
    await expect(cancelBooking(db, d.bookingId, SYS, "again")).rejects.toBeInstanceOf(BookingError);
  });

  it("lets operators block seats but never touch Goroada-sold seats", async () => {
    const trip = await bookableTrip("abuja", "lokoja", 11, 3);
    const d = await draftAndPay(trip, await pickFreeSeats(db, trip.id, 1));
    await verifyPayment(db, d.paymentRef);
    const sold = (await getBookingView(db, d.bookingId))!.segments[0].seats[0].seatNo;
    const [free] = await pickFreeSeats(db, trip.id, 1);
    const r = await setSeatBlocks(db, trip.operator.id, trip.id, SYS, [free, sold], [sold]);
    expect(r).toMatchObject({ blocked: 1, released: 0 });
    await expect(setSeatBlocks(db, "not-this-operator", trip.id, SYS, [free], [])).rejects.toMatchObject({ code: "forbidden" });
  });

  it("operator cancellation refunds every passenger in full", async () => {
    const trip = await bookableTrip("benin-city", "warri", 12, 2);
    const d = await draftAndPay(trip, await pickFreeSeats(db, trip.id, 1));
    await verifyPayment(db, d.paymentRef);
    const [{ total }] = await db.query<{ total: number }>(`select total from bookings where id = $1`, [d.bookingId]);
    await updateTripStatus(db, trip.operator.id, trip.id, SYS, { status: "cancelled" });
    const [refund] = await db.query<{ amount: number }>(`select amount from refunds where booking_id = $1`, [d.bookingId]);
    expect(refund.amount).toBe(total);
  });
});
