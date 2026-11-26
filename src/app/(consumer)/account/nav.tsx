"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Heart, Lock, ShieldCheck, User, Users, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/account", label: "Overview", icon: LayoutGrid },
  { href: "/account/profile", label: "Personal info", icon: User },
  { href: "/account/passengers", label: "Saved passengers", icon: Users },
  { href: "/account/favourites", label: "Favourites", icon: Heart },
  { href: "/account/notifications", label: "Notifications", icon: Bell },
  { href: "/account/security", label: "Security", icon: Lock },
  { href: "/account/privacy", label: "Privacy", icon: ShieldCheck },
];

export function AccountNav() {
  const p = usePathname();
  return (
    <nav aria-label="Account" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = p === href;
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm font-medium", active ? "bg-navy-50 text-navy-700" : "text-ink-3 hover:bg-surface-2 hover:text-ink")}><Icon className="h-4 w-4" />{label}</Link>;
      })}
    </nav>
  );
}
