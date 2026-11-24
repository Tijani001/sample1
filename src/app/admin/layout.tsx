import type { Metadata } from "next";
import { PortalShell, type NavItem } from "@/components/portal/shell";
import { requireAdmin } from "@/lib/auth/guards";
import { canAccess, type AdminArea } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · Goroada" }, robots: { index: false } };

const NAV: (NavItem & { area: AdminArea })[] = [
  { href: "/admin", label: "Overview", icon: "LayoutDashboard", exact: true, area: "overview" },
  { href: "/admin/operators", label: "Operators", icon: "Building2", area: "operators" },
  { href: "/admin/network", label: "Network", icon: "Map", area: "network" },
  { href: "/admin/bookings", label: "Bookings", icon: "BookOpen", area: "bookings" },
  { href: "/admin/payments", label: "Payments", icon: "CreditCard", area: "payments" },
  { href: "/admin/refunds", label: "Refunds", icon: "RotateCcw", area: "refunds" },
  { href: "/admin/settlements", label: "Settlements", icon: "Banknote", area: "settlements" },
  { href: "/admin/promotions", label: "Promotions", icon: "BadgePercent", area: "promotions" },
  { href: "/admin/support", label: "Support", icon: "Headphones", area: "support" },
  { href: "/admin/users", label: "Users & roles", icon: "Users", area: "users" },
  { href: "/admin/audit", label: "Audit log", icon: "FileClock", area: "audit" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireAdmin();
  const nav = NAV.filter((n) => canAccess(u.adminRoles, n.area)).map(({ area, ...n }) => { void area; return n; });
  return <PortalShell kind="Admin" orgName="Goroada platform" userName={`${u.name} · ${u.adminRoles.map((r) => r.replace("_", " ")).join(", ")}`} nav={nav}>{children}</PortalShell>;
}
