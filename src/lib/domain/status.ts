export type BookingStatus =
  | "awaiting_payment" | "payment_processing" | "confirmed" | "cancelled" | "refund_pending" | "refunded" | "expired" | "needs_reconciliation";

export type TripStatus = "scheduled" | "boarding" | "departed" | "in_transit" | "delayed" | "arrived" | "cancelled";

/** The traveller-facing status combines booking state, trip state and ticket state. */
export type JourneyStatus =
  | "awaiting_payment" | "payment_processing" | "confirmed" | "ready_for_boarding" | "boarded" | "departed" | "in_transit"
  | "arrived" | "cancelled" | "refund_pending" | "refunded" | "expired" | "delayed" | "needs_reconciliation";

export const JOURNEY_STATUS_META: Record<JourneyStatus, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  awaiting_payment: { label: "Awaiting payment", tone: "warning" },
  payment_processing: { label: "Payment processing", tone: "info" },
  confirmed: { label: "Confirmed", tone: "success" },
  ready_for_boarding: { label: "Ready for boarding", tone: "success" },
  boarded: { label: "Boarded", tone: "info" },
  departed: { label: "Departed", tone: "info" },
  in_transit: { label: "In transit", tone: "info" },
  delayed: { label: "Delayed", tone: "warning" },
  arrived: { label: "Arrived", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
  refund_pending: { label: "Refund pending", tone: "warning" },
  refunded: { label: "Refunded", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  needs_reconciliation: { label: "Under review", tone: "warning" },
};

export function deriveJourneyStatus(args: {
  booking: BookingStatus;
  trip: TripStatus;
  departureAt: Date;
  arrivalAt: Date;
  ticketBoarded?: boolean;
  now?: Date;
}): JourneyStatus {
  const now = args.now ?? new Date();
  if (args.booking !== "confirmed") return args.booking as JourneyStatus;
  if (args.trip === "cancelled") return "cancelled";
  if (args.trip === "arrived" || (args.trip === "scheduled" && now > new Date(args.arrivalAt.getTime() + 3 * 3600_000))) return "arrived";
  if (args.trip === "in_transit" || args.trip === "departed") return args.trip;
  if (args.trip === "delayed") return "delayed";
  if (args.ticketBoarded) return "boarded";
  const hoursToGo = (args.departureAt.getTime() - now.getTime()) / 3600_000;
  if (args.trip === "boarding" || (hoursToGo <= 2 && hoursToGo > -1)) return "ready_for_boarding";
  return "confirmed";
}
