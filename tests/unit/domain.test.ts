import { describe, expect, it } from "vitest";
import { computeQuote, computeRefund, addonQuantityLimits, SERVICE_FEE_PER_PASSENGER_JOURNEY } from "@/lib/domain/pricing";
import { evaluatePromo, type Promotion } from "@/lib/domain/promo";
import { LAYOUT_TEMPLATES, parseLayout, seatCount, validateLayout } from "@/lib/domain/seat-layout";
import { normalizePhone, passengersFormSchema } from "@/lib/validation";
import { formatMoney } from "@/lib/domain/money";
import { deriveJourneyStatus } from "@/lib/domain/status";
import { canAccess } from "@/lib/auth/rbac";
import { addDaysIso, isIsoDate } from "@/lib/domain/time";

describe("fare calculation", () => {
  it("adds fares, seat charges, add-ons and fees in integer kobo", () => {
    const q = computeQuote({ passengers: 2, segments: [{ farePerSeat: 1_250_050, seatCharges: [150000, 0] }], addons: { extra_luggage: 1 } });
    expect(q.fareTotal).toBe(2_500_100);
    expect(q.seatCharges).toBe(150000);
    expect(q.addonsTotal).toBe(150000);
    expect(q.serviceFee).toBe(SERVICE_FEE_PER_PASSENGER_JOURNEY * 2);
    expect(q.total).toBe(2_500_100 + 150000 + 150000 + 60000);
    expect(Number.isInteger(q.total)).toBe(true);
  });
  it("charges fees per passenger per journey on round trips", () => {
    const q = computeQuote({ passengers: 3, segments: [{ farePerSeat: 1000000, seatCharges: [0, 0, 0] }, { farePerSeat: 900000, seatCharges: [0, 0, 0] }], addons: {} });
    expect(q.fareTotal).toBe(5_700_000);
    expect(q.serviceFee).toBe(SERVICE_FEE_PER_PASSENGER_JOURNEY * 6);
  });
  it("caps discounts at the discountable subtotal and never discounts fees", () => {
    const q = computeQuote({ passengers: 1, segments: [{ farePerSeat: 500000, seatCharges: [0] }], addons: {}, discount: 9_999_999 });
    expect(q.discount).toBe(500000);
    expect(q.total).toBe(SERVICE_FEE_PER_PASSENGER_JOURNEY);
  });
  it("clamps add-on quantities and only offers meals where provided", () => {
    expect(addonQuantityLimits("extra_luggage", 2).max).toBe(4);
    const q = computeQuote({ passengers: 1, segments: [{ farePerSeat: 1000000, seatCharges: [0], offersMeal: false }], addons: { extra_luggage: 99, meal_pack: 1 } });
    expect(q.addonLines.find((l) => l.code === "extra_luggage")?.quantity).toBe(2);
    expect(q.addonLines.find((l) => l.code === "meal_pack")).toBeUndefined();
  });
  it("computes refunds from fare rules", () => {
    const rules = [{ hours_before: 24, refund_pct: 90 }, { hours_before: 6, refund_pct: 50 }];
    expect(computeRefund({ paidForSegment: 100000, hoursBeforeDeparture: 48, rules, hasFlexCancel: false }).amount).toBe(90000);
    expect(computeRefund({ paidForSegment: 100000, hoursBeforeDeparture: 10, rules, hasFlexCancel: false }).amount).toBe(50000);
    expect(computeRefund({ paidForSegment: 100000, hoursBeforeDeparture: 2, rules, hasFlexCancel: false }).amount).toBe(0);
    expect(computeRefund({ paidForSegment: 100000, hoursBeforeDeparture: 7, rules, hasFlexCancel: true }).amount).toBe(100000);
    expect(computeRefund({ paidForSegment: 100000, hoursBeforeDeparture: 1, rules, hasFlexCancel: false, operatorCancelled: true, serviceFee: 30000 }).amount).toBe(130000);
  });
  it("formats naira", () => {
    expect(formatMoney(1_250_000)).toBe("₦12,500");
    expect(formatMoney(1_250_050)).toBe("₦12,500.50");
  });
});

describe("promo codes", () => {
  const base: Promotion = { id: "p", code: "TEST10", kind: "percent", value: 10, max_discount: 200000, min_subtotal: 500000, starts_at: new Date(Date.now() - 86400000), ends_at: new Date(Date.now() + 86400000), usage_limit: 100, per_user_limit: 1, first_booking_only: false, origin_city_id: null, destination_city_id: null, operator_id: null, active: true };
  const ctx = { now: new Date(), subtotal: 1_000_000, segments: [{ originCityId: "lagos", destinationCityId: "ibadan", operatorId: "x" }], totalRedemptions: 0, customerRedemptions: 0, customerPriorBookings: 0 };
  it("applies percent discounts with a cap", () => {
    expect(evaluatePromo(base, ctx)).toMatchObject({ ok: true, discount: 100000 });
    expect(evaluatePromo(base, { ...ctx, subtotal: 5_000_000 })).toMatchObject({ ok: true, discount: 200000 });
  });
  it("rejects expired, future, exhausted and reused codes", () => {
    expect(evaluatePromo({ ...base, ends_at: new Date(Date.now() - 1000) }, ctx)).toMatchObject({ ok: false, error: expect.stringContaining("expired") });
    expect(evaluatePromo({ ...base, starts_at: new Date(Date.now() + 100000) }, ctx)).toMatchObject({ ok: false });
    expect(evaluatePromo(base, { ...ctx, totalRedemptions: 100 })).toMatchObject({ ok: false, error: expect.stringContaining("limit") });
    expect(evaluatePromo(base, { ...ctx, customerRedemptions: 1 })).toMatchObject({ ok: false });
    expect(evaluatePromo({ ...base, active: false }, ctx)).toMatchObject({ ok: false });
    expect(evaluatePromo(null, ctx)).toMatchObject({ ok: false });
  });
  it("enforces minimum spend, first-booking and route restrictions", () => {
    expect(evaluatePromo(base, { ...ctx, subtotal: 100000 })).toMatchObject({ ok: false, error: expect.stringContaining("at least") });
    expect(evaluatePromo({ ...base, first_booking_only: true }, { ...ctx, customerPriorBookings: 2 })).toMatchObject({ ok: false });
    expect(evaluatePromo({ ...base, origin_city_id: "abuja" }, ctx)).toMatchObject({ ok: false });
    expect(evaluatePromo({ ...base, origin_city_id: "lagos", destination_city_id: "ibadan" }, ctx)).toMatchObject({ ok: true });
  });
  it("never discounts more than the subtotal for fixed codes", () => {
    expect(evaluatePromo({ ...base, kind: "fixed", value: 5_000_000, max_discount: null, min_subtotal: 0 }, ctx)).toMatchObject({ ok: true, discount: 1_000_000 });
  });
});

describe("seat layouts", () => {
  it("templates have the advertised capacities", () => {
    const expected: Record<string, number> = { "car-4": 4, "suv-6": 6, "minivan-7": 7, "bus-14": 14, "bus-18": 18, "bus-30": 30, "coach-exec-36": 36, "coach-std-44": 44 };
    for (const [id, n] of Object.entries(expected)) {
      expect(seatCount(LAYOUT_TEMPLATES[id].spec)).toBe(n);
      expect(validateLayout(LAYOUT_TEMPLATES[id].spec)).toEqual([]);
    }
  });
  it("numbers seats front-to-back, left-to-right and marks premium seats", () => {
    const p = parseLayout({ rows: ["D.P", "S_S"] });
    expect(p.seats.map((s) => [s.seatNo, s.premium])).toEqual([["1", true], ["2", false], ["3", false]]);
    expect(p.rows[0][0].kind).toBe("driver");
    expect(p.rows[1][1].kind).toBe("aisle");
  });
  it("rejects invalid custom layouts", () => {
    expect(validateLayout({ rows: ["SSS"] })).toContain("Layout must contain exactly one driver position.");
    expect(validateLayout({ rows: ["D.X"] }).join()).toContain("unsupported");
    expect(validateLayout({ rows: ["D..."] }).join()).toContain("at least one passenger seat");
  });
});

describe("validation", () => {
  it("normalises Nigerian phone numbers", () => {
    expect(normalizePhone("0803 123 4567")).toBe("+2348031234567");
    expect(normalizePhone("2348031234567")).toBe("+2348031234567");
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
    expect(normalizePhone("12345")).toBeNull();
  });
  it("requires an emergency contact for the lead passenger", () => {
    const r = passengersFormSchema.safeParse({ contact: { name: "Ada Obi", email: "ada@example.com", phone: "08031234567" }, passengers: [{ fullName: "Ada Obi" }] });
    expect(r.success).toBe(false);
    const ok = passengersFormSchema.safeParse({ contact: { name: "Ada Obi", email: "ada@example.com", phone: "08031234567" }, passengers: [{ fullName: "Ada Obi", nextOfKinName: "Ngozi Obi", nextOfKinPhone: "08051234567" }] });
    expect(ok.success).toBe(true);
  });
  it("rejects single-word names and invalid emails", () => {
    expect(passengersFormSchema.safeParse({ contact: { name: "Ada", email: "nope", phone: "0803" }, passengers: [{ fullName: "A" }] }).success).toBe(false);
  });
  it("validates ISO dates", () => {
    expect(isIsoDate("2026-12-01")).toBe(true);
    expect(isIsoDate("2026-13-45")).toBe(false);
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("journey status and access control", () => {
  const dep = new Date("2026-12-01T08:00:00Z");
  const arr = new Date("2026-12-01T14:00:00Z");
  it("derives traveller-facing statuses", () => {
    expect(deriveJourneyStatus({ booking: "confirmed", trip: "scheduled", departureAt: dep, arrivalAt: arr, now: new Date("2026-11-28T08:00:00Z") })).toBe("confirmed");
    expect(deriveJourneyStatus({ booking: "confirmed", trip: "scheduled", departureAt: dep, arrivalAt: arr, now: new Date("2026-12-01T07:00:00Z") })).toBe("ready_for_boarding");
    expect(deriveJourneyStatus({ booking: "confirmed", trip: "scheduled", departureAt: dep, arrivalAt: arr, ticketBoarded: true, now: new Date("2026-12-01T07:50:00Z") })).toBe("boarded");
    expect(deriveJourneyStatus({ booking: "confirmed", trip: "in_transit", departureAt: dep, arrivalAt: arr })).toBe("in_transit");
    expect(deriveJourneyStatus({ booking: "refund_pending", trip: "scheduled", departureAt: dep, arrivalAt: arr })).toBe("refund_pending");
  });
  it("grants admin areas by role only", () => {
    expect(canAccess(["finance_manager"], "refunds")).toBe(true);
    expect(canAccess(["finance_manager"], "operators")).toBe(false);
    expect(canAccess(["support_agent"], "payments")).toBe(false);
    expect(canAccess(["verification_officer"], "operators")).toBe(true);
    expect(canAccess(["super_admin"], "audit")).toBe(true);
    expect(canAccess(["operations_manager"], "users")).toBe(false);
  });
});
