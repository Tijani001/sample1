import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/shell";
import { requireOperator } from "@/lib/auth/guards";
import { getDb } from "@/lib/server";

export const metadata: Metadata = { title: { default: "Operator portal", template: "%s · Operator · Goroada" }, robots: { index: false } };

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const u = await requireOperator();
  const [op] = await (await getDb()).query<{ status: string; is_demo: boolean }>(`select status, is_demo from operators where id = $1`, [u.operator.id]);
  const nav = [
    { href: "/operator", label: "Dashboard", icon: "LayoutDashboard" as const, exact: true },
    { href: "/operator/departures", label: "Departures", icon: "CalendarClock" as const },
    { href: "/operator/verify", label: "Verify tickets", icon: "ScanLine" as const },
    { href: "/operator/fleet", label: "Fleet & layouts", icon: "Bus" as const },
    { href: "/operator/routes", label: "Routes & schedules", icon: "Route" as const },
    { href: "/operator/finance", label: "Finance", icon: "BarChart3" as const },
  ];
  const banner = op.status !== "verified"
    ? <div className="border-b border-warning-line bg-warning-bg px-6 py-2.5 text-sm text-amber-900"><b>Verification {op.status}.</b> You can configure your fleet and schedules, but departures won&apos;t be bookable until Goroada verifies your documents.</div>
    : op.is_demo ? <div className="border-b border-line bg-white px-6 py-2 text-xs text-ink-3">Demo operator · all figures are demonstration data</div> : null;
  return <PortalShell kind="Operator" orgName={u.operator.name} userName={`${u.name} · ${u.operator.role}`} nav={nav} banner={banner}>{children}</PortalShell>;
}
