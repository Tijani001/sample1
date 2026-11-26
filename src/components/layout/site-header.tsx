"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { motion } from "motion/react";
import { Bell, Building2, Check, ChevronDown, LifeBuoy, LogOut, Shield, Ticket, User } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { signOutAction } from "@/app/(consumer)/account/actions";

export type HeaderUser = { name: string; email: string | null; isAdmin: boolean; operatorName: string | null } | null;

const NAV = [
  { href: "/", label: "Book a trip", match: (p: string) => p === "/" || p.startsWith("/search") || p.startsWith("/trip/") || p.startsWith("/book") },
  { href: "/explore", label: "Explore", match: (p: string) => p.startsWith("/explore") },
  { href: "/trips", label: "My Trips", match: (p: string) => p.startsWith("/trips") },
  { href: "/offers", label: "Offers", match: (p: string) => p.startsWith("/offers") },
  { href: "/help", label: "Help", match: (p: string) => p.startsWith("/help") },
];

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function SiteHeader({ user, unread }: { user: HeaderUser; unread: number }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 pt-safe no-print">
      <div className="container-page flex h-14 items-center gap-6 md:h-16">
        <Link href="/" aria-label="Goroada home" className="-ml-1 rounded-lg p-1">
          <Logo height={26} priority className="md:hidden" />
          <Logo height={30} priority className="hidden md:block" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                className={cn("relative rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "text-ink" : "text-ink-3 hover:text-ink")}>
                {item.label}
                {active && <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-coral-500" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:gap-2">
          <CurrencySelector />
          {user && (
            <Link href="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative grid h-10 w-10 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
              <Bell className="h-[20px] w-[20px]" />
              {unread > 0 && <span className="absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-coral-600 px-1 text-[10px] font-semibold text-white ring-2 ring-white tabular">{unread > 9 ? "9+" : unread}</span>}
            </Link>
          )}
          {user ? (
            <AccountMenu user={user} />
          ) : (
            <>
              <Link href="/signin" className="hidden h-10 items-center rounded-lg px-3 text-sm font-medium text-ink hover:bg-surface-2 md:inline-flex">Sign in</Link>
              <Link href="/register" className="hidden h-10 items-center rounded-lg bg-navy-600 px-4 text-sm font-semibold text-white hover:bg-navy-700 md:inline-flex">Register</Link>
              <Link href="/signin" aria-label="Sign in" className="grid h-10 w-10 place-items-center rounded-full text-ink-2 hover:bg-surface-2 md:hidden"><User className="h-5 w-5" /></Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function CurrencySelector() {
  return (
    <Popover.Root>
      <Popover.Trigger className="hidden h-10 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-ink-2 hover:bg-surface-2 md:inline-flex" aria-label="Currency: Nigerian naira">
        <span className="tabular">₦ NGN</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-64 rounded-xl border border-line bg-white p-1.5 shadow-lg data-[state=open]:animate-[pop-in_160ms_ease-out]">
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-ink-3">Display currency</p>
          <button className="flex w-full items-center justify-between rounded-lg bg-surface-2 px-2.5 py-2 text-left text-sm" aria-pressed="true">
            <span><span className="font-medium">NGN</span> · Nigerian naira</span>
            <Check className="h-4 w-4 text-coral-600" />
          </button>
          <p className="px-2.5 pb-1.5 pt-2 text-xs leading-relaxed text-ink-3">Fares are set and charged in naira. More currencies will be added as Goroada expands across Africa.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AccountMenu({ user }: { user: NonNullable<HeaderUser> }) {
  const item = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink hover:bg-surface-2";
  return (
    <Popover.Root>
      <Popover.Trigger className="flex h-10 items-center gap-2 rounded-full pl-1 pr-1 hover:bg-surface-2 md:pr-2.5" aria-label="Account menu">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-600 text-xs font-semibold text-white">{initials(user.name)}</span>
        <span className="hidden max-w-[120px] truncate text-sm font-medium md:inline">{user.name.split(" ")[0]}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-64 rounded-xl border border-line bg-white p-1.5 shadow-lg data-[state=open]:animate-[pop-in_160ms_ease-out]">
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            {user.email && <p className="truncate text-xs text-ink-3">{user.email}</p>}
          </div>
          <Link href="/account" className={item}><User className="h-4 w-4 text-ink-3" />Account</Link>
          <Link href="/trips" className={item}><Ticket className="h-4 w-4 text-ink-3" />My Trips</Link>
          <Link href="/help" className={item}><LifeBuoy className="h-4 w-4 text-ink-3" />Help and support</Link>
          {user.operatorName && <Link href="/operator" className={item}><Building2 className="h-4 w-4 text-ink-3" />Operator portal</Link>}
          {user.isAdmin && <Link href="/admin" className={item}><Shield className="h-4 w-4 text-ink-3" />Admin portal</Link>}
          {(user.operatorName || user.isAdmin) && <div className="my-1 border-t border-line" />}
          <form action={signOutAction}>
            <button className={item}><LogOut className="h-4 w-4 text-ink-3" />Sign out</button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Home", icon: HomeIcon, match: (p: string) => p === "/" || p.startsWith("/search") },
    { href: "/explore", label: "Explore", icon: CompassIcon, match: (p: string) => p.startsWith("/explore") || p.startsWith("/offers") },
    { href: "/trips", label: "Trips", icon: TicketIcon, match: (p: string) => p.startsWith("/trips") },
    { href: "/account", label: "Account", icon: UserIcon, match: (p: string) => p.startsWith("/account") || p.startsWith("/signin") || p.startsWith("/register") || p.startsWith("/help") || p.startsWith("/notifications") },
  ];
  if (pathname.startsWith("/book") || pathname.startsWith("/pay") || pathname.startsWith("/checkout")) return null;
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-safe backdrop-blur md:hidden no-print">
      <ul className="mx-auto grid h-16 max-w-md grid-cols-4">
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} className="relative flex h-full flex-col items-center justify-center gap-1 text-xs font-medium">
                {active && <motion.span layoutId="bottom-pill" className="absolute top-1.5 h-8 w-14 rounded-full bg-coral-50" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <Icon active={active} />
                <span className={cn("relative", active ? "text-ink" : "text-ink-3")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const iconCls = (active: boolean) => cn("relative h-[22px] w-[22px] transition-colors", active ? "text-coral-600" : "text-ink-3");
function HomeIcon({ active }: { active: boolean }) {
  return <svg viewBox="0 0 24 24" className={iconCls(active)} fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19Z" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.12 : 0} /></svg>;
}
function CompassIcon({ active }: { active: boolean }) {
  return <svg viewBox="0 0 24 24" className={iconCls(active)} fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9.5" /><path d="m15.8 8.2-2.1 5.5-5.5 2.1 2.1-5.5z" fill={active ? "currentColor" : "none"} /></svg>;
}
function TicketIcon({ active }: { active: boolean }) {
  return <svg viewBox="0 0 24 24" className={iconCls(active)} fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 8.5V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3.5a2.5 2.5 0 0 0 0-5Z" /><path d="M14.5 5v2M14.5 11v2M14.5 17v2" /></svg>;
}
function UserIcon({ active }: { active: boolean }) {
  return <svg viewBox="0 0 24 24" className={iconCls(active)} fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 20.5c1.6-3.6 4.5-5.5 8-5.5s6.4 1.9 8 5.5" /></svg>;
}
