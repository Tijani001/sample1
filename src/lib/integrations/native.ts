import type { InventoryAdapter } from "./types";

/**
 * Native adapter: inventory lives in Goroada's own database, so holds and sales are already handled
 * transactionally by the booking engine (seat_inventory). The methods are no-ops that succeed.
 */
export const nativeAdapter: InventoryAdapter = {
  kind: "native",
  async syncTrips() { return { upserted: 0 }; },
  async fetchUnavailableSeats() { return []; },
  async hold(_op, _trip, _seats, ttl) { return { ok: true, externalHoldId: "native", expiresAt: new Date(Date.now() + ttl * 1000).toISOString() }; },
  async confirm() { return { ok: true }; },
  async release() { return { ok: true }; },
};

export function adapterFor(integrationType: string): InventoryAdapter {
  if (integrationType === "native" || integrationType === "manual" || integrationType === "import") return nativeAdapter;
  // API adapters are registered per operator once a real integration agreement and credentials exist.
  throw new Error(`No ${integrationType} adapter is configured for this operator yet.`);
}
