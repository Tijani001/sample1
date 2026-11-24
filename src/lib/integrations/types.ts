/**
 * Operator inventory integration contract.
 *
 * Goroada's consumer app only talks to its own internal model (routes, trips, seat_inventory, bookings).
 * Each inventory source implements this adapter so new operators can be connected without changing the
 * frontend or booking engine:
 *   - native:  operator manages inventory in the Goroada operator portal (implemented)
 *   - import:  authorised bulk schedule imports from CSV (implemented: see csv-import.ts)
 *   - api:     operator's own booking system exposes an API (adapter per operator, not yet connected)
 *   - manual:  Goroada staff manage inventory on the operator's behalf (uses the native adapter)
 */
export type ExternalTrip = {
  externalId: string;
  originCityId: string;
  destinationCityId: string;
  departureAt: string; // ISO timestamp
  arrivalEstAt: string;
  fareMinor: number;
  currency: string;
  capacity: number;
  vehicleLayoutId?: string;
};

export type HoldResult = { ok: true; externalHoldId: string; expiresAt: string } | { ok: false; reason: "unavailable" | "error"; seats?: string[] };

export interface InventoryAdapter {
  readonly kind: "native" | "api" | "import" | "manual";
  /** Pull schedules/trips for a date range into Goroada's model. */
  syncTrips(operatorId: string, from: string, to: string): Promise<{ upserted: number }>;
  /** Seats already sold through the operator's other channels, to prevent double booking. */
  fetchUnavailableSeats(operatorId: string, tripId: string): Promise<string[]>;
  /** Reserve seats in the operator's system before Goroada takes payment. */
  hold(operatorId: string, tripId: string, seats: string[], ttlSeconds: number): Promise<HoldResult>;
  /** Convert a hold into a sale after Goroada has verified payment. Must be idempotent on bookingRef. */
  confirm(operatorId: string, tripId: string, bookingRef: string, externalHoldId: string): Promise<{ ok: boolean }>;
  /** Release seats on cancellation or hold expiry. */
  release(operatorId: string, tripId: string, bookingRef: string): Promise<{ ok: boolean }>;
}
