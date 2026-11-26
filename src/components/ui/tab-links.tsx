"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";

export function TabLinks({ tabs, active, className }: { tabs: { id: string; label: string; href: string; count?: number }[]; active: string; className?: string }) {
  return (
    <nav className={cn("no-scrollbar flex gap-6 overflow-x-auto border-b border-line", className)} aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} scroll={false} aria-current={active === t.id ? "page" : undefined}
          className={cn("relative flex h-11 shrink-0 items-center gap-2 text-base font-medium transition-colors", active === t.id ? "text-ink" : "text-ink-3 hover:text-ink")}>
          {t.label}
          {t.count != null && <span className={cn("rounded-full px-1.5 text-xs tabular", active === t.id ? "bg-navy-600 text-white" : "bg-surface-3 text-ink-3")}>{t.count}</span>}
          {active === t.id && <motion.span layoutId={`tab-underline-${tabs[0].id}`} className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-coral-600" />}
        </Link>
      ))}
    </nav>
  );
}
