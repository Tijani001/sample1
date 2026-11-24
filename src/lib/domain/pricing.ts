import type { Minor } from "./money";

/** Goroada booking fee, charged per passenger per journey and shown on every quote before payment. */
export const SERVICE_FEE_PER_PASSENGER_JOURNEY: Minor = 30000; // ₦300

export type AddonCode = "extra_luggage" | "flex_cancel" | "meal_pack";

export type AddonDefinition = {
  code: AddonCode;
  label: string;
  description: string;
  /** How the price scales. */
  per: "item_per_journey" | "passenger_per_journey" | "passenger";
  maxPerPassenger: number;
  /** Price in minor units, or a function of the fare per seat. */
  price: (farePerSeat: Minor) => Minor;
  /** Only offered when the operator provides it. */
  requiresOperatorAmenity?: string;
};

export const ADDONS: Record<AddonCode, AddonDefinition> = {
  extra_luggage: {
    code: "extra_luggage",
    label: "Extra luggage",
    description: "One additional bag up to 20 kg, per journey.",
    per: "item_per_journey",
    maxPerPassenger: 2,
    price: () => 150000,
  },
  flex_cancel: {
    code: "flex_cancel",
    label: "Flexible cancellation",
    description: "Full fare refund if you cancel up to 6 hours before departure.",
    per: "passenger",
    maxPerPassenger: 1,
    price: (fare) => Math.max(80000, Math.round((fare * 8) / 100)),
  },
  meal_pack: {
    code: "meal_pack",
    label: "Meal pack",
    description: "Packed meal and bottled water served on board.",
    per: "passenger_per_journey",
    maxPerPassenger: 1,
    price: () => 200000,
    requiresOperatorAmenity: "refreshments",
  },
};

export type QuoteSegment = {
  farePerSeat: Minor;
  seatCharges: Minor[]; // one per passenger (0 for standard seats)
  offersMeal?: boolean;
};

export type QuoteInput = {
  passengers: number;
  segments: QuoteSegment[];
  /** Selected add-on quantities. flex_cancel / meal_pack are 0 or 1 (applies to all passengers). */
  addons: Partial<Record<AddonCode, number>>;
  discount?: Minor;
};

export type QuoteLine = { code: string; label: string; amount: Minor; detail?: string };

export type Quote = {
  fareTotal: Minor;
  seatCharges: Minor;
  addonsTotal: Minor;
  addonLines: (QuoteLine & { quantity: number; unitPrice: Minor })[];
  serviceFee: Minor;
  discount: Minor;
  total: Minor;
  /** fares + seat charges: the amount promotions apply to */
  discountableSubtotal: Minor;
};

export function addonQuantityLimits(code: AddonCode, passengers: number) {
  const def = ADDONS[code];
  return { min: 0, max: def.per === "item_per_journey" ? def.maxPerPassenger * passengers : 1 };
}

export function computeQuote(input: QuoteInput): Quote {
  const { passengers, segments } = input;
  if (passengers < 1) throw new Error("At least one passenger is required");
  const fareTotal = segments.reduce((s, seg) => s + seg.farePerSeat * passengers, 0);
  const seatCharges = segments.reduce((s, seg) => s + seg.seatCharges.reduce((a, b) => a + b, 0), 0);
  const journeys = segments.length;

  const addonLines: Quote["addonLines"] = [];
  for (const [code, qtyRaw] of Object.entries(input.addons) as [AddonCode, number][]) {
    const def = ADDONS[code];
    if (!def || !qtyRaw || qtyRaw <= 0) continue;
    const { max } = addonQuantityLimits(code, passengers);
    const qty = Math.min(Math.floor(qtyRaw), max);
    if (code === "extra_luggage") {
      const unit = def.price(0);
      addonLines.push({ code, label: def.label, quantity: qty, unitPrice: unit, amount: unit * qty * journeys, detail: `${qty} bag${qty > 1 ? "s" : ""} × ${journeys} journey${journeys > 1 ? "s" : ""}` });
    } else if (code === "flex_cancel") {
      const amount = segments.reduce((s, seg) => s + def.price(seg.farePerSeat) * passengers, 0);
      addonLines.push({ code, label: def.label, quantity: passengers, unitPrice: Math.round(amount / passengers), amount, detail: `${passengers} passenger${passengers > 1 ? "s" : ""}` });
    } else if (code === "meal_pack") {
      const eligible = segments.filter((s) => s.offersMeal).length;
      if (eligible === 0) continue;
      const unit = def.price(0);
      addonLines.push({ code, label: def.label, quantity: passengers, unitPrice: unit, amount: unit * passengers * eligible, detail: `${passengers} × ${eligible} journey${eligible > 1 ? "s" : ""}` });
    }
  }
  const addonsTotal = addonLines.reduce((s, l) => s + l.amount, 0);
  const serviceFee = SERVICE_FEE_PER_PASSENGER_JOURNEY * passengers * journeys;
  const discountableSubtotal = fareTotal + seatCharges;
  const discount = Math.max(0, Math.min(input.discount ?? 0, discountableSubtotal));
  const total = fareTotal + seatCharges + addonsTotal + serviceFee - discount;
  return { fareTotal, seatCharges, addonsTotal, addonLines, serviceFee, discount, total, discountableSubtotal };
}

/** Refund owed when a traveller cancels. Booking fees are non-refundable unless the operator cancels. */
export function computeRefund(args: {
  paidForSegment: Minor; // fare + seat charges + add-ons attributable to the segment (excludes service fee)
  hoursBeforeDeparture: number;
  rules: { hours_before: number; refund_pct: number }[];
  hasFlexCancel: boolean;
  operatorCancelled?: boolean;
  serviceFee?: Minor;
}): { amount: Minor; pct: number; reason: string } {
  if (args.operatorCancelled) {
    return { amount: args.paidForSegment + (args.serviceFee ?? 0), pct: 100, reason: "Trip cancelled by operator: full refund including fees." };
  }
  if (args.hoursBeforeDeparture <= 0) return { amount: 0, pct: 0, reason: "The trip has already departed." };
  if (args.hasFlexCancel && args.hoursBeforeDeparture >= 6) {
    return { amount: args.paidForSegment, pct: 100, reason: "Flexible cancellation: full fare refund." };
  }
  const sorted = [...args.rules].sort((a, b) => b.hours_before - a.hours_before);
  const rule = sorted.find((r) => args.hoursBeforeDeparture >= r.hours_before);
  const pct = rule?.refund_pct ?? 0;
  return {
    amount: Math.round((args.paidForSegment * pct) / 100),
    pct,
    reason: rule ? `${pct}% refund when cancelled at least ${rule.hours_before} hours before departure.` : "No refund this close to departure.",
  };
}
