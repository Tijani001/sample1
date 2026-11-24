import type { AdminRole } from "./session";

/** Which admin roles may use each admin area. super_admin can access everything. */
export const ADMIN_ACCESS = {
  overview: ["operations_manager", "finance_manager", "support_agent", "verification_officer"],
  operators: ["verification_officer", "operations_manager"],
  network: ["operations_manager"],
  bookings: ["support_agent", "operations_manager", "finance_manager"],
  payments: ["finance_manager"],
  refunds: ["finance_manager"],
  settlements: ["finance_manager"],
  promotions: ["operations_manager"],
  support: ["support_agent", "operations_manager"],
  users: [],
  audit: [],
} as const satisfies Record<string, readonly AdminRole[]>;

export type AdminArea = keyof typeof ADMIN_ACCESS;

export function canAccess(roles: AdminRole[], area: AdminArea) {
  return roles.includes("super_admin") || (ADMIN_ACCESS[area] as readonly AdminRole[]).some((r) => roles.includes(r));
}
