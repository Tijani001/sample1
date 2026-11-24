import type { Db, Queryable } from "@/lib/db/client";
import { bookingReference, secureToken, sha256, ticketNumber } from "@/lib/domain/ids";
import { computeQuote, computeRefund, type AddonCode, type Quote, ADDONS } from "@/lib/domain/pricing";
import { evaluatePromo, type Promotion } from "@/lib/domain/promo";
import { deriveJourneyStatus, type BookingStatus, type JourneyStatus, type TripStatus } from "@/lib/domain/status";
import { formatDate, formatTime } from "@/lib/domain/time";
import { passengersFormSchema } from "@/lib/validation";
import { acquireHolds, expireStaleBookings, HOLD_MINUTES, pickFreeSeats, releaseBookingSeats, SeatUnavailableError } from "./inventory";
import { getTrip, type TripResult } from "./search";
import { audit, SYSTEM_ACTOR, type Actor } from "./audit";
import { notify } from "./notifications";
import { log } from "@/lib/log";

export class BookingError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) {
    super(message);
    this.name = "BookingError";
  }
}

export type DraftInput = {
  tripType: "one_way" | "round_trip";
  passengers: number;
  segments: { tripId: string; direction: "outbound" | "return"; seats?: string[] }[];
  userId?: string | null;
  idempotencyKey?: string | null;
};

async function loadSegmentsForValidation(db: Db, segs: DraftInput["segments"]) {
  const trips: TripResult[] = [];
  for (const s of segs) {
    const t = await getTrip(db, s.tripId);
    if (!t) throw new BookingError("trip_not_found", "This departure could not be found.", 404);
    if (!t.bookable) throw new BookingError("trip_not_bookable", `The ${t.origin.cityName} → ${t.destination.cityName} departure is no longer available to book.`, 409);
    trips.push(t);
  }
  return trips;
}

/** Creates an unpaid booking and places temporary seat holds for every segment, atomically. */
export async function createDraft(db: Db, input: DraftInput) {
  if (input.passengers < 1 || input.passengers > 10) throw new BookingError("invalid_passengers", "Choose between 1 and 10 passengers.");
  const dirs = input.segments.map((s) => s.direction);
  if (input.tripType === "one_way" && (input.segments.length !== 1 || dirs[0] !== "outbound")) throw new BookingError("invalid_segments", "Select one departure.");
  if (input.tripType === "round_trip" && (input.segments.length !== 2 || !dirs.includes("outbound") || !dirs.includes("return"))) {
    throw new BookingError("invalid_segments", "Select an outbound and a return departure.");
  }
  if (input.idempotencyKey) {
    const [existing] = await db.query<{ id: string; reference: string; hold_expires_at: Date; status: string }>(
      `select id, reference, hold_expires_at, status from bookings where idempotency_key = $1`, [input.idempotencyKey]);
    if (existing) return { bookingId: existing.id, reference: existing.reference, accessToken: null, holdExpiresAt: new Date(existing.hold_expires_at).toISOString(), replayed: true };
  }
  await expireStaleBookings(db);
  const trips = await loadSegmentsForValidation(db, input.segments);
  if (input.tripType === "round_trip") {
    const out = trips[input.segments.findIndex((s) => s.direction === "outbound")];
    const ret = trips[input.segments.findIndex((s) => s.direction === "return")];
    if (new Date(ret.departureAt) <= new Date(out.arrivalEstAt)) throw new BookingError("invalid_return", "Your return must depart after your outbound journey arrives.");
    if (out.origin.cityId !== ret.destination.cityId || out.destination.cityId !== ret.origin.cityId) throw new BookingError("invalid_return", "Return journey must go back the way you came.");
  }
  for (let i = 0; i < trips.length; i++) {
    const seats = input.segments[i].seats ?? [];
    if (trips[i].seatingMode === "assigned") {
      if (seats.length !== input.passengers) throw new BookingError("seat_count", `Select ${input.passengers} seat${input.passengers > 1 ? "s" : ""} for each journey.`);
      if (new Set(seats).size !== seats.length) throw new BookingError("seat_duplicate", "Each passenger needs a different seat.");
    }
    if (trips[i].seatsLeft < input.passengers) throw new BookingError("insufficient_seats", `Only ${trips[i].seatsLeft} seat${trips[i].seatsLeft === 1 ? "" : "s"} left on this departure.`, 409);
  }

  const accessToken = secureToken(24);
  const holdUntil = new Date(Date.now() + HOLD_MINUTES * 60_000);
  try {
    return await db.tx(async (q) => {
      let booking: { id: string; reference: string } | undefined;
      for (let attempt = 0; attempt < 5 && !booking; attempt++) {
        const ref = bookingReference();
        const rows = await q.query<{ id: string; reference: string }>(
          `insert into bookings (reference, user_id, trip_type, passenger_count, hold_expires_at, access_token_hash, idempotency_key)
           values ($1,$2,$3,$4,$5,$6,$7) on conflict (reference) do nothing returning id, reference`,
          [ref, input.userId ?? null, input.tripType, input.passengers, holdUntil.toISOString(), sha256(accessToken), input.idempotencyKey ?? null],
        );
        booking = rows[0];
      }
      if (!booking) throw new BookingError("reference_exhausted", "Please try again.", 500);
      for (let p = 1; p <= input.passengers; p++) await q.query(`insert into booking_passengers (booking_id, seq) values ($1,$2)`, [booking.id, p]);
      for (let i = 0; i < trips.length; i++) {
        const t = trips[i];
        const seg = input.segments[i];
        const [{ id: segmentId }] = await q.query<{ id: string }>(
          `insert into booking_segments (booking_id, trip_id, direction, fare_per_seat) values ($1,$2,$3,$4) returning id`,
          [booking.id, t.id, seg.direction, t.fare],
        );
        const seats = t.seatingMode === "assigned" ? seg.seats! : await pickFreeSeats(q, t.id, input.passengers);
        if (seats.length < input.passengers) throw new SeatUnavailableError([], t.id);
        await acquireHolds(q, { tripId: t.id, bookingId: booking.id, seats, until: holdUntil });
        await writeBookingSeats(q, segmentId, t.id, seats);
      }
      await recalc(q, booking.id);
      return { bookingId: booking.id, reference: booking.reference, accessToken, holdExpiresAt: holdUntil.toISOString(), replayed: false };
    });
  } catch (e) {
    if (e instanceof SeatUnavailableError) throw new BookingError("seat_unavailable", e.message, 409, { seats: e.seats, tripId: e.tripId });
    throw e;
  }
}

async function writeBookingSeats(q: Queryable, segmentId: string, tripId: string, seats: string[]) {
  await q.query(`delete from booking_seats where segment_id = $1`, [segmentId]);
  const premium = await q.query<{ seat_no: string; charge: number }>(
    `select st.seat_no, case when st.is_premium then l.premium_surcharge else 0 end charge
       from trips t join vehicle_layouts l on l.id = t.layout_id join seats st on st.layout_id = t.layout_id
      where t.id = $1 and st.seat_no = any($2::text[])`,
    [tripId, seats],
  );
  for (let i = 0; i < seats.length; i++) {
    const charge = premium.find((p) => p.seat_no === seats[i])?.charge ?? 0;
    await q.query(`insert into booking_seats (segment_id, passenger_seq, seat_no, premium_charge) values ($1,$2,$3,$4)`, [segmentId, i + 1, seats[i], charge]);
  }
}

async function lockDraft(q: Queryable, bookingId: string) {
  const [b] = await q.query<{ id: string; status: BookingStatus; hold_expires_at: Date; passenger_count: number; user_id: string | null }>(
    `select id, status, hold_expires_at, passenger_count, user_id from bookings where id = $1 for update`, [bookingId]);
  if (!b) throw new BookingError("not_found", "Booking not found.", 404);
  if (b.status !== "awaiting_payment") throw new BookingError("not_editable", "This booking can no longer be changed.", 409);
  if (new Date(b.hold_expires_at).getTime() < Date.now()) throw new BookingError("hold_expired", "Your seat reservation has expired. Please select your seats again.", 410);
  return b;
}

/** Changes the held seats for one segment of an unpaid booking. The original hold expiry is kept. */
export async function changeSeats(db: Db, bookingId: string, direction: "outbound" | "return", seats: string[]) {
  try {
    return await db.tx(async (q) => {
      const b = await lockDraft(q, bookingId);
      const [seg] = await q.query<{ id: string; trip_id: string; seating_mode: string }>(
        `select bs.id, bs.trip_id, t.seating_mode from booking_segments bs join trips t on t.id = bs.trip_id where bs.booking_id = $1 and bs.direction = $2`, [bookingId, direction]);
      if (!seg) throw new BookingError("not_found", "Journey not found on this booking.", 404);
      if (seg.seating_mode !== "assigned") throw new BookingError("open_seating", "Seats are allocated at boarding for this operator.");
      if (seats.length !== b.passenger_count || new Set(seats).size !== seats.length) throw new BookingError("seat_count", `Select ${b.passenger_count} different seats.`);
      await acquireHolds(q, { tripId: seg.trip_id, bookingId, seats, until: new Date(b.hold_expires_at) });
      await writeBookingSeats(q, seg.id, seg.trip_id, seats);
      return recalc(q, bookingId);
    });
  } catch (e) {
    if (e instanceof SeatUnavailableError) throw new BookingError("seat_unavailable", e.message, 409, { seats: e.seats, tripId: e.tripId });
    throw e;
  }
}

export async function savePassengers(db: Db, bookingId: string, raw: unknown) {
  const parsed = passengersFormSchema.safeParse(raw);
  if (!parsed.success) throw new BookingError("validation", "Please check the passenger details.", 422, parsed.error.issues);
  const data = parsed.data;
  return db.tx(async (q) => {
    const b = await lockDraft(q, bookingId);
    if (data.passengers.length !== b.passenger_count) throw new BookingError("validation", `Enter details for ${b.passenger_count} passengers.`, 422);
    await q.query(`update bookings set contact_name = $2, contact_email = $3, contact_phone = $4 where id = $1`, [bookingId, data.contact.name, data.contact.email, data.contact.phone]);
    for (let i = 0; i < data.passengers.length; i++) {
      const p = data.passengers[i];
      await q.query(
        `update booking_passengers set full_name = $3, phone = $4, email = $5, next_of_kin_name = $6, next_of_kin_phone = $7 where booking_id = $1 and seq = $2`,
        [bookingId, i + 1, p.fullName, p.phone ?? (i === 0 ? data.contact.phone : null), p.email ?? (i === 0 ? data.contact.email : null), p.nextOfKinName || null, p.nextOfKinPhone || null],
      );
    }
    return { ok: true };
  });
}

async function promoContext(q: Queryable, bookingId: string, promo: Promotion, subtotal: number) {
  const [b] = await q.query<{ user_id: string | null; contact_email: string | null }>(`select user_id, contact_email from bookings where id = $1`, [bookingId]);
  const segments = await q.query<{ o: string; d: string; op: string }>(
    `select r.origin_city_id o, r.destination_city_id d, t.operator_id op from booking_segments bs join trips t on t.id = bs.trip_id join routes r on r.id = t.route_id where bs.booking_id = $1`, [bookingId]);
  const [{ total }] = await q.query<{ total: number }>(`select count(*)::int total from promo_redemptions where promotion_id = $1`, [promo.id]);
  const [{ mine }] = await q.query<{ mine: number }>(
    `select count(*)::int mine from promo_redemptions where promotion_id = $1 and ((user_id is not null and user_id = $2) or (contact_email is not null and lower(contact_email) = lower($3)))`,
    [promo.id, b.user_id, b.contact_email ?? ""]);
  const [{ prior }] = await q.query<{ prior: number }>(
    `select count(*)::int prior from bookings where id <> $1 and status in ('confirmed','refunded','refund_pending','cancelled') and confirmed_at is not null
       and ((user_id is not null and user_id = $2) or (contact_email is not null and lower(contact_email) = lower($3)))`,
    [bookingId, b.user_id, b.contact_email ?? ""]);
  return { now: new Date(), subtotal, segments: segments.map((s) => ({ originCityId: s.o, destinationCityId: s.d, operatorId: s.op })), totalRedemptions: total, customerRedemptions: mine, customerPriorBookings: prior };
}

/** Recomputes and persists the booking's price breakdown from the database (the single source of truth). */
export async function recalc(q: Queryable, bookingId: string): Promise<Quote & { promo?: { code: string; ok: boolean; message: string } }> {
  const [b] = await q.query<{ passenger_count: number; promotion_id: string | null }>(`select passenger_count, promotion_id from bookings where id = $1`, [bookingId]);
  const segs = await q.query<{ id: string; fare_per_seat: number; amenities: string[] }>(
    `select bs.id, bs.fare_per_seat, v.amenities from booking_segments bs join trips t on t.id = bs.trip_id join vehicles v on v.id = t.vehicle_id where bs.booking_id = $1 order by bs.direction desc`, [bookingId]);
  const seatRows = await q.query<{ segment_id: string; premium_charge: number }>(`select bst.segment_id, bst.premium_charge from booking_seats bst join booking_segments bs on bs.id = bst.segment_id where bs.booking_id = $1`, [bookingId]);
  const addons = await q.query<{ code: AddonCode; quantity: number }>(`select code, quantity from booking_addons where booking_id = $1`, [bookingId]);
  const quoteInput = {
    passengers: b.passenger_count,
    segments: segs.map((s) => ({ farePerSeat: s.fare_per_seat, seatCharges: seatRows.filter((r) => r.segment_id === s.id).map((r) => r.premium_charge), offersMeal: (s.amenities ?? []).includes("refreshments") })),
    addons: Object.fromEntries(addons.map((a) => [a.code, a.quantity])),
  };
  let quote = computeQuote(quoteInput);
  let promoInfo: { code: string; ok: boolean; message: string } | undefined;
  if (b.promotion_id) {
    const [promo] = await q.query<Promotion>(`select * from promotions where id = $1`, [b.promotion_id]);
    const res = evaluatePromo(promo ?? null, await promoContext(q, bookingId, promo, quote.discountableSubtotal));
    if (res.ok) {
      quote = computeQuote({ ...quoteInput, discount: res.discount });
      promoInfo = { code: promo.code, ok: true, message: res.message };
    } else {
      await q.query(`update bookings set promotion_id = null where id = $1`, [bookingId]);
      promoInfo = { code: promo?.code ?? "", ok: false, message: res.error };
    }
  }
  await q.query(
    `update bookings set fare_total = $2, seat_charges = $3, addons_total = $4, service_fee = $5, discount = $6, total = $7 where id = $1`,
    [bookingId, quote.fareTotal, quote.seatCharges, quote.addonsTotal, quote.serviceFee, quote.discount, quote.total],
  );
  return { ...quote, promo: promoInfo };
}

export async function saveExtras(db: Db, bookingId: string, input: { addons?: Partial<Record<AddonCode, number>>; promoCode?: string | null }) {
  return db.tx(async (q) => {
    await lockDraft(q, bookingId);
    if (input.addons) {
      await q.query(`delete from booking_addons where booking_id = $1`, [bookingId]);
      for (const [code, qty] of Object.entries(input.addons) as [AddonCode, number][]) {
        const def = ADDONS[code];
        if (!def || !qty || qty <= 0) continue;
        await q.query(`insert into booking_addons (booking_id, code, label, quantity, unit_price, total) values ($1,$2,$3,$4,0,0)`, [bookingId, code, def.label, Math.floor(qty)]);
      }
    }
    let promoError: string | null = null;
    if (input.promoCode !== undefined) {
      if (!input.promoCode) await q.query(`update bookings set promotion_id = null where id = $1`, [bookingId]);
      else {
        const [promo] = await q.query<Promotion>(`select * from promotions where upper(code) = upper($1)`, [input.promoCode.trim()]);
        if (!promo) promoError = "This promo code isn't valid.";
        else {
          const quote = await recalc(q, bookingId);
          const res = evaluatePromo(promo, await promoContext(q, bookingId, promo, quote.discountableSubtotal));
          if (res.ok) await q.query(`update bookings set promotion_id = $2 where id = $1`, [bookingId, promo.id]);
          else promoError = res.error;
        }
      }
    }
    const quote = await recalc(q, bookingId);
    // Persist add-on line amounts for the receipt.
    for (const line of quote.addonLines) {
      await q.query(`update booking_addons set unit_price = $3, total = $4 where booking_id = $1 and code = $2`, [bookingId, line.code, line.unitPrice, line.amount]);
    }
    return { quote, promoError };
  });
}

// ───────────────────────── Reading bookings ─────────────────────────

export type BookingView = Awaited<ReturnType<typeof getBookingView>>;

export async function getBookingView(db: Db, bookingId: string) {
  const [b] = await db.query<{
    id: string; reference: string; user_id: string | null; status: BookingStatus; trip_type: "one_way" | "round_trip"; passenger_count: number;
    contact_name: string | null; contact_email: string | null; contact_phone: string | null; currency: string; fare_total: number; seat_charges: number;
    addons_total: number; service_fee: number; discount: number; total: number; promotion_id: string | null; hold_expires_at: Date; created_at: Date;
    confirmed_at: Date | null; cancelled_at: Date | null; cancel_reason: string | null; promo_code: string | null;
  }>(`select b.*, p.code promo_code from bookings b left join promotions p on p.id = b.promotion_id where b.id = $1`, [bookingId]);
  if (!b) return null;
  const segRows = await db.query<{ id: string; trip_id: string; direction: "outbound" | "return"; fare_per_seat: number }>(
    `select id, trip_id, direction, fare_per_seat from booking_segments where booking_id = $1 order by case direction when 'outbound' then 0 else 1 end`, [bookingId]);
  const passengers = await db.query<{ seq: number; full_name: string; phone: string | null; email: string | null; next_of_kin_name: string | null; next_of_kin_phone: string | null }>(
    `select seq, full_name, phone, email, next_of_kin_name, next_of_kin_phone from booking_passengers where booking_id = $1 order by seq`, [bookingId]);
  const seats = await db.query<{ segment_id: string; passenger_seq: number; seat_no: string; premium_charge: number }>(
    `select bst.* from booking_seats bst join booking_segments bs on bs.id = bst.segment_id where bs.booking_id = $1 order by passenger_seq`, [bookingId]);
  const tickets = await db.query<{ id: string; segment_id: string; passenger_seq: number; ticket_no: string; verification_token: string; status: string; boarded_at: Date | null }>(
    `select id, segment_id, passenger_seq, ticket_no, verification_token, status, boarded_at from tickets where booking_id = $1 order by passenger_seq`, [bookingId]);
  const addons = await db.query<{ code: AddonCode; label: string; quantity: number; unit_price: number; total: number }>(`select code, label, quantity, unit_price, total from booking_addons where booking_id = $1`, [bookingId]);
  const payments = await db.query<{ id: string; provider: string; reference: string; amount: number; currency: string; status: string; channel: string | null; verified_at: Date | null; created_at: Date }>(
    `select id, provider, reference, amount, currency, status, channel, verified_at, created_at from payments where booking_id = $1 order by created_at desc`, [bookingId]);
  const refunds = await db.query<{ id: string; amount: number; status: string; reason: string; created_at: Date; processed_at: Date | null }>(
    `select id, amount, status, reason, created_at, processed_at from refunds where booking_id = $1 order by created_at desc`, [bookingId]);
  const [review] = await db.query<{ rating: number; comment: string | null }>(`select rating, comment from reviews where booking_id = $1`, [bookingId]);

  const segments = [] as {
    id: string; direction: "outbound" | "return"; farePerSeat: number; trip: TripResult;
    seats: { passengerSeq: number; seatNo: string; premiumCharge: number }[];
    tickets: typeof tickets;
    journeyStatus: JourneyStatus;
  }[];
  for (const s of segRows) {
    const trip = await getTrip(db, s.trip_id);
    if (!trip) continue;
    const segTickets = tickets.filter((t) => t.segment_id === s.id);
    segments.push({
      id: s.id,
      direction: s.direction,
      farePerSeat: s.fare_per_seat,
      trip,
      seats: seats.filter((x) => x.segment_id === s.id).map((x) => ({ passengerSeq: x.passenger_seq, seatNo: x.seat_no, premiumCharge: x.premium_charge })),
      tickets: segTickets,
      journeyStatus: deriveJourneyStatus({
        booking: b.status,
        trip: trip.status as TripStatus,
        departureAt: new Date(trip.departureAt),
        arrivalAt: new Date(trip.arrivalEstAt),
        ticketBoarded: segTickets.length > 0 && segTickets.every((t) => t.status === "boarded"),
      }),
    });
  }
  const paid = payments.find((p) => p.status === "success");
  return {
    id: b.id,
    reference: b.reference,
    userId: b.user_id,
    status: b.status,
    tripType: b.trip_type,
    passengerCount: b.passenger_count,
    contact: { name: b.contact_name, email: b.contact_email, phone: b.contact_phone },
    currency: b.currency,
    amounts: { fareTotal: b.fare_total, seatCharges: b.seat_charges, addonsTotal: b.addons_total, serviceFee: b.service_fee, discount: b.discount, total: b.total },
    promoCode: b.promo_code,
    holdExpiresAt: new Date(b.hold_expires_at).toISOString(),
    createdAt: new Date(b.created_at).toISOString(),
    confirmedAt: b.confirmed_at ? new Date(b.confirmed_at).toISOString() : null,
    cancelledAt: b.cancelled_at ? new Date(b.cancelled_at).toISOString() : null,
    cancelReason: b.cancel_reason,
    passengers: passengers.map((p) => ({ seq: p.seq, fullName: p.full_name, phone: p.phone, email: p.email, nextOfKinName: p.next_of_kin_name, nextOfKinPhone: p.next_of_kin_phone })),
    segments,
    addons,
    payments: payments.map((p) => ({ ...p, verified_at: p.verified_at ? new Date(p.verified_at).toISOString() : null, created_at: new Date(p.created_at).toISOString() })),
    paidPayment: paid ? { provider: paid.provider, reference: paid.reference, amount: paid.amount, channel: paid.channel, verifiedAt: paid.verified_at ? new Date(paid.verified_at).toISOString() : null } : null,
    refunds: refunds.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString(), processed_at: r.processed_at ? new Date(r.processed_at).toISOString() : null })),
    review: review ?? null,
  };
}

export async function findBookingIdByReference(db: Db, reference: string) {
  const [b] = await db.query<{ id: string }>(`select id from bookings where upper(reference) = upper($1)`, [reference.trim()]);
  return b?.id ?? null;
}

export async function listBookingsForUser(db: Db, userId: string) {
  const rows = await db.query<{ id: string }>(
    `select b.id from bookings b where b.user_id = $1 and b.status not in ('awaiting_payment','expired') order by b.created_at desc limit 100`, [userId]);
  const out: NonNullable<BookingView>[] = [];
  for (const r of rows) {
    const v = await getBookingView(db, r.id);
    if (v) out.push(v);
  }
  return out;
}

// ───────────────────────── Confirmation (called after verified payment) ─────────────────────────

export type ConfirmOutcome = { status: "confirmed" | "already_confirmed" | "reassigned" | "needs_reconciliation"; changedSeats?: { direction: string; from: string; to: string }[] };

/**
 * Converts held seats into sold seats, issues tickets and records commissions. Must run inside the same
 * transaction that marks the payment successful. Handles payments that arrive after a hold expired:
 *   1. If the original seats are still free, they are re-secured.
 *   2. Otherwise, other free seats on the same departure are allocated and the traveller is notified.
 *   3. If the departure has no capacity left, the booking is flagged for reconciliation and a full refund is opened.
 */
export async function allocateAndConfirm(q: Queryable, bookingId: string, actor: Actor = SYSTEM_ACTOR): Promise<ConfirmOutcome> {
  const [b] = await q.query<{ status: BookingStatus; reference: string; user_id: string | null; passenger_count: number; contact_email: string | null; contact_phone: string | null; promotion_id: string | null; discount: number; total: number }>(
    `select status, reference, user_id, passenger_count, contact_email, contact_phone, promotion_id, discount, total from bookings where id = $1 for update`, [bookingId]);
  if (!b) throw new BookingError("not_found", "Booking not found.", 404);
  if (b.status === "confirmed") return { status: "already_confirmed" };

  const segs = await q.query<{ id: string; trip_id: string; direction: string; fare_per_seat: number; operator_id: string; commission_bps: number }>(
    `select bs.id, bs.trip_id, bs.direction, bs.fare_per_seat, t.operator_id, o.commission_bps
       from booking_segments bs join trips t on t.id = bs.trip_id join operators o on o.id = t.operator_id where bs.booking_id = $1`, [bookingId]);
  const changed: { direction: string; from: string; to: string }[] = [];
  for (const seg of segs) {
    const wanted = await q.query<{ passenger_seq: number; seat_no: string }>(`select passenger_seq, seat_no from booking_seats where segment_id = $1 order by passenger_seq`, [seg.id]);
    // Sweep expired holds of *other* bookings, then try to (re)claim our seats.
    await q.query(`delete from seat_inventory where trip_id = $1 and status = 'held' and held_until < now() and booking_id is distinct from $2`, [seg.trip_id, bookingId]);
    const claimed = await q.query<{ seat_no: string }>(
      `insert into seat_inventory (trip_id, seat_no, status, booking_id, source)
       select $1, s, 'sold', $2, 'goroada' from unnest($3::text[]) s
       on conflict (trip_id, seat_no) do update set status = 'sold', held_until = null
         where seat_inventory.booking_id = excluded.booking_id
       returning seat_no`,
      [seg.trip_id, bookingId, wanted.map((w) => w.seat_no)],
    );
    const got = new Set(claimed.map((c) => c.seat_no));
    const lost = wanted.filter((w) => !got.has(w.seat_no));
    if (lost.length) {
      const replacements = await pickFreeSeats(q, seg.trip_id, lost.length, [...got]);
      if (replacements.length < lost.length) {
        await releaseBookingSeats(q, bookingId);
        await q.query(`update bookings set status = 'needs_reconciliation' where id = $1`, [bookingId]);
        const [pay] = await q.query<{ id: string; amount: number }>(`select id, amount from payments where booking_id = $1 and status = 'success'`, [bookingId]);
        if (pay) {
          await q.query(`insert into refunds (booking_id, payment_id, amount, status, reason) values ($1,$2,$3,'approved',$4) on conflict do nothing`,
            [bookingId, pay.id, pay.amount, "Payment received after the seat hold expired and the departure sold out. Full refund."]);
        }
        await notify(q, { userId: b.user_id, bookingId, category: "transactional", kind: "booking_reconciliation", title: `We couldn't secure seats for ${b.reference}`,
          body: "Your payment arrived after your reservation expired and the departure is now full. A full refund has been approved automatically.", href: `/trips/${b.reference}`,
          channels: { email: b.contact_email, sms: b.contact_phone } });
        await audit(q, actor, "booking.reconciliation_required", "booking", bookingId, { reference: b.reference, reason: "sold_out_after_hold_expiry" });
        log.warn("booking.reconciliation_required", { reference: b.reference });
        return { status: "needs_reconciliation" };
      }
      await q.query(`insert into seat_inventory (trip_id, seat_no, status, booking_id, source) select $1, s, 'sold', $2, 'goroada' from unnest($3::text[]) s`, [seg.trip_id, bookingId, replacements]);
      for (let i = 0; i < lost.length; i++) {
        await q.query(`update booking_seats set seat_no = $3, premium_charge = 0 where segment_id = $1 and passenger_seq = $2`, [seg.id, lost[i].passenger_seq, replacements[i]]);
        changed.push({ direction: seg.direction, from: lost[i].seat_no, to: replacements[i] });
      }
    }
    // Tickets: one per passenger per journey. The unique constraint makes this idempotent.
    for (let p = 1; p <= b.passenger_count; p++) {
      await q.query(
        `insert into tickets (booking_id, segment_id, passenger_seq, ticket_no, verification_token) values ($1,$2,$3,$4,$5) on conflict (segment_id, passenger_seq) do nothing`,
        [bookingId, seg.id, p, ticketNumber(), secureToken(16)],
      );
    }
    const gross = seg.fare_per_seat * b.passenger_count;
    await q.query(
      `insert into platform_commissions (booking_id, segment_id, operator_id, gross, rate_bps, amount) values ($1,$2,$3,$4,$5,$6) on conflict (segment_id) do nothing`,
      [bookingId, seg.id, seg.operator_id, gross, seg.commission_bps, Math.round((gross * seg.commission_bps) / 10000)],
    );
  }
  await q.query(`update bookings set status = 'confirmed', confirmed_at = now() where id = $1`, [bookingId]);
  if (b.promotion_id && b.discount > 0) {
    await q.query(`insert into promo_redemptions (promotion_id, booking_id, user_id, contact_email, amount) values ($1,$2,$3,$4,$5) on conflict (booking_id) do nothing`,
      [b.promotion_id, bookingId, b.user_id, b.contact_email, b.discount]);
  }
  const [first] = await q.query<{ o: string; d: string; dep: Date; tz: string }>(
    `select oc.name o, dc.name d, t.departure_at dep, oc.tz from booking_segments bs join trips t on t.id = bs.trip_id join routes r on r.id = t.route_id
       join cities oc on oc.id = r.origin_city_id join cities dc on dc.id = r.destination_city_id where bs.booking_id = $1 and bs.direction = 'outbound'`, [bookingId]);
  await notify(q, {
    userId: b.user_id, bookingId, category: "transactional", kind: "booking_confirmed",
    title: `Booking confirmed · ${b.reference}`,
    body: `${first.o} → ${first.d}, ${formatDate(first.dep, first.tz, "weekday")} at ${formatTime(first.dep, first.tz)}. Your tickets are ready.${changed.length ? " Note: some seat numbers changed." : ""}`,
    href: `/trips/${b.reference}`, channels: { email: b.contact_email, sms: b.contact_phone, whatsapp: b.contact_phone },
  });
  await audit(q, actor, "booking.confirmed", "booking", bookingId, { reference: b.reference, reassigned: changed.length });
  return changed.length ? { status: "reassigned", changedSeats: changed } : { status: "confirmed" };
}

// ───────────────────────── Cancellation & refunds ─────────────────────────

export async function cancellationQuote(db: Db, bookingId: string) {
  const v = await getBookingView(db, bookingId);
  if (!v) throw new BookingError("not_found", "Booking not found.", 404);
  if (v.status !== "confirmed") return { allowed: false as const, reason: "Only confirmed bookings can be cancelled.", refund: 0, lines: [] };
  const hasFlex = v.addons.some((a) => a.code === "flex_cancel");
  const lines = v.segments.map((s) => {
    const hours = (new Date(s.trip.departureAt).getTime() - Date.now()) / 3600_000;
    const boarded = s.tickets.some((t) => t.status === "boarded");
    const share = v.segments.length > 1 ? 0.5 : 1;
    const paidForSegment = s.farePerSeat * v.passengerCount + s.seats.reduce((a, x) => a + x.premiumCharge, 0) + Math.round((v.amounts.addonsTotal - (hasFlex ? v.addons.find((a) => a.code === "flex_cancel")!.total : 0)) * share) - Math.round(v.amounts.discount * share);
    const r = boarded ? { amount: 0, pct: 0, reason: "Already boarded." } : computeRefund({ paidForSegment, hoursBeforeDeparture: hours, rules: s.trip.policy.rules, hasFlexCancel: hasFlex });
    return { direction: s.direction, label: `${s.trip.origin.cityName} → ${s.trip.destination.cityName}`, departed: hours <= 0 || boarded, ...r };
  });
  if (lines.every((l) => l.departed)) return { allowed: false as const, reason: "This journey has already departed.", refund: 0, lines };
  return { allowed: true as const, reason: null, refund: lines.reduce((a, l) => a + l.amount, 0), lines };
}

export async function cancelBooking(db: Db, bookingId: string, actor: Actor, reason: string, opts: { operatorCancelled?: boolean } = {}) {
  const quote = opts.operatorCancelled ? null : await cancellationQuote(db, bookingId);
  if (quote && !quote.allowed) throw new BookingError("not_cancellable", quote.reason ?? "This booking can't be cancelled.", 409);
  return db.tx(async (q) => {
    const [b] = await q.query<{ status: string; reference: string; user_id: string | null; total: number; contact_email: string | null; contact_phone: string | null }>(
      `select status, reference, user_id, total, contact_email, contact_phone from bookings where id = $1 for update`, [bookingId]);
    if (!b || b.status !== "confirmed") throw new BookingError("not_cancellable", "This booking can't be cancelled.", 409);
    const refundAmount = opts.operatorCancelled ? b.total : quote!.refund;
    await releaseBookingSeats(q, bookingId);
    await q.query(`update tickets set status = 'void' where booking_id = $1 and status = 'valid'`, [bookingId]);
    await q.query(`update bookings set status = $2, cancelled_at = now(), cancel_reason = $3 where id = $1`, [bookingId, refundAmount > 0 ? "refund_pending" : "cancelled", reason]);
    if (refundAmount > 0) {
      const [pay] = await q.query<{ id: string }>(`select id from payments where booking_id = $1 and status = 'success'`, [bookingId]);
      await q.query(`insert into refunds (booking_id, payment_id, amount, status, reason, requested_by) values ($1,$2,$3,'pending',$4,$5)`,
        [bookingId, pay?.id ?? null, refundAmount, opts.operatorCancelled ? "Trip cancelled by operator" : reason, actor.userId]);
    }
    await notify(q, { userId: b.user_id, bookingId, category: "transactional", kind: "booking_cancelled", title: `Booking ${b.reference} cancelled`,
      body: refundAmount > 0 ? `A refund of ₦${(refundAmount / 100).toLocaleString("en-NG")} has been requested. Refunds usually reach your account within 5–10 working days.` : "This booking was cancelled. No refund is due under the fare rules.",
      href: `/trips/${b.reference}`, channels: { email: b.contact_email, sms: b.contact_phone } });
    await audit(q, actor, "booking.cancelled", "booking", bookingId, { reference: b.reference, refund: refundAmount, operatorCancelled: !!opts.operatorCancelled });
    return { refund: refundAmount, status: refundAmount > 0 ? "refund_pending" : "cancelled" };
  });
}

export async function submitReview(db: Db, bookingId: string, userId: string | null, rating: number, comment: string) {
  const v = await getBookingView(db, bookingId);
  if (!v) throw new BookingError("not_found", "Booking not found.", 404);
  const seg = v.segments[0];
  if (v.status !== "confirmed" || !["arrived"].includes(seg.journeyStatus)) throw new BookingError("not_completed", "You can rate a trip once it's completed.", 409);
  if (rating < 1 || rating > 5) throw new BookingError("validation", "Choose a rating from 1 to 5.", 422);
  return db.tx(async (q) => {
    await q.query(
      `insert into reviews (operator_id, booking_id, user_id, author_name, rating, comment, route_label) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (booking_id) do update set rating = excluded.rating, comment = excluded.comment`,
      [seg.trip.operator.id, bookingId, userId, (v.contact.name ?? "Traveller").split(" ")[0] + " " + ((v.contact.name ?? "").split(" ")[1]?.[0] ?? "") + ".", rating, comment.slice(0, 1000) || null, `${seg.trip.origin.cityName} → ${seg.trip.destination.cityName}`],
    );
    if (!v.review) {
      await q.query(
        `update operators set rating_avg = round(((coalesce(rating_avg, 0) * rating_count + $2) / (rating_count + 1))::numeric, 2), rating_count = rating_count + 1 where id = $1`,
        [seg.trip.operator.id, rating],
      );
    }
    return { ok: true };
  });
}
