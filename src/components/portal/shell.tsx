"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LogOut, BadgePercent, Banknote, BarChart3, BookOpen, Building2, Bus, CalendarClock, CreditCard, FileClock, Headphones, LayoutDashboard, Map, Route, RotateCcw, ScanLine, Users } from "lucide-react";

const ICONS = { BadgePercent, Banknote, BarChart3, BookOpen, Building2, Bus, CalendarClock, CreditCard, FileClock, Headphones, LayoutDashboard, Map, Route, RotateCcw, ScanLine, Users };
export type IconName = keyof typeof ICONS;
import { Logo, LogoMark } from "@/components/brand/logo";
import { signOutAction } from "@/app/(consumer)/account/actions";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };
function NavIcon({ name, className }: { name: IconName; className: string }) {
  const I = ICONS[name];
  return <I className={className} />;
}

export function PortalShell({ kind, orgName, userName, nav, children, banner }: { kind: "Operator" | "Admin"; orgName: string; userName: string; nav: NavItem[]; children: React.ReactNode; banner?: React.ReactNode }) {
  const p = usePathname();
  const isActive = (i: NavItem) => (i.exact ? p === i.href : p === i.href || p.startsWith(`${i.href}/`));
  return (
    <div className="min-h-dvh bg-surface-2 lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-line bg-white lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
          <Link href={kind === "Admin" ? "/admin" : "/operator"} aria-label={`${kind} portal home`} className="flex flex-col gap-1">
            <Logo height={24} />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{kind} portal</span>
          </Link>
        </div>
        <div className="border-b border-line px-5 py-3"><p className="truncate text-sm font-semibold">{orgName}</p><p className="truncate text-xs text-ink-3">{userName}</p></div>
        <nav className="flex-1 space-y-0.5 p-3" aria-label={`${kind} navigation`}>
          {nav.map((i) => (
            <Link key={i.href} href={i.href} aria-current={isActive(i) ? "page" : undefined}
              className={cn("flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors", isActive(i) ? "bg-navy-600 text-white" : "text-ink-2 hover:bg-surface-2")}>
              <NavIcon name={i.icon} className="h-[18px] w-[18px]" />{i.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-1 border-t border-line p-3">
          <Link href="/" className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-ink-3 hover:bg-surface-2"><ArrowLeft className="h-4 w-4" />Goroada site</Link>
          <form action={signOutAction}><button className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm text-ink-3 hover:bg-surface-2"><LogOut className="h-4 w-4" />Sign out</button></form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-white lg:hidden">
          <div className="flex h-14 items-center gap-2 px-4"><LogoMark className="h-7 w-7" title="Goroada" /><p className="font-semibold">{kind} portal</p><p className="ml-auto max-w-[50%] truncate text-sm text-ink-3">{orgName}</p></div>
          <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2" aria-label={`${kind} navigation`}>
            {nav.map((i) => <Link key={i.href} href={i.href} className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium", isActive(i) ? "bg-navy-600 text-white" : "bg-surface-2 text-ink-2")}><NavIcon name={i.icon} className="h-4 w-4" />{i.label}</Link>)}
          </nav>
        </header>
        {banner}
        <main id="main" className="mx-auto max-w-[1280px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">{title}</h1>{subtitle && <p className="mt-1 text-base text-ink-3">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "warning" | "success" }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-sm text-ink-3">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular", tone === "warning" && "text-warning", tone === "success" && "text-success")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line bg-surface-2/60 text-xs uppercase tracking-wide text-ink-3"><tr>{head.map((h) => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line [&_td]:px-4 [&_td]:py-3">{children}</tbody>
      </table>
      {empty && <p className="p-6 text-center text-sm text-ink-3">{empty}</p>}
    </div>
  );
}
