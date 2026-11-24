import type { Minor } from "./money";

export type Promotion = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  max_discount: Minor | null;
  min_subtotal: Minor;
  starts_at: Date | string;
  ends_at: Date | string;
  usage_limit: number | null;
  per_user_limit: number;
  first_booking_only: boolean;
  origin_city_id: string | null;
  destination_city_id: string | null;
  operator_id: string | null;
  active: boolean;
};

export type PromoContext = {
  now: Date;
  subtotal: Minor; // fares + seat charges
  segments: { originCityId: string; destinationCityId: string; operatorId: string }[];
  totalRedemptions: number;
  customerRedemptions: number;
  customerPriorBookings: number;
};

export type PromoResult = { ok: true; discount: Minor; message: string } | { ok: false; error: string };

export function evaluatePromo(p: Promotion | null, ctx: PromoContext): PromoResult {
  if (!p || !p.active) return { ok: false, error: "This promo code isn't valid." };
  const starts = new Date(p.starts_at);
  const ends = new Date(p.ends_at);
  if (ctx.now < starts) return { ok: false, error: "This promo code isn't active yet." };
  if (ctx.now > ends) return { ok: false, error: "This promo code has expired." };
  if (p.usage_limit != null && ctx.totalRedemptions >= p.usage_limit) return { ok: false, error: "This promo code has reached its usage limit." };
  if (ctx.customerRedemptions >= p.per_user_limit) return { ok: false, error: "You've already used this promo code." };
  if (p.first_booking_only && ctx.customerPriorBookings > 0) return { ok: false, error: "This promo code is only for your first booking." };
  if (ctx.subtotal < p.min_subtotal) {
    return { ok: false, error: `Spend at least ₦${(p.min_subtotal / 100).toLocaleString("en-NG")} on fares to use this code.` };
  }
  const eligible = ctx.segments.some(
    (s) =>
      (!p.origin_city_id || s.originCityId === p.origin_city_id) &&
      (!p.destination_city_id || s.destinationCityId === p.destination_city_id) &&
      (!p.operator_id || s.operatorId === p.operator_id),
  );
  if (!eligible) return { ok: false, error: "This promo code doesn't apply to the selected journey." };
  let discount = p.kind === "percent" ? Math.round((ctx.subtotal * p.value) / 100) : p.value;
  if (p.max_discount != null) discount = Math.min(discount, p.max_discount);
  discount = Math.min(discount, ctx.subtotal);
  return { ok: true, discount, message: p.kind === "percent" ? `${p.value}% off applied` : "Discount applied" };
}
