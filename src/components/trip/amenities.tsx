import { Armchair, Coffee, MoveVertical, PlugZap, Snowflake, Tv, Wifi, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export const AMENITIES: Record<string, { label: string; icon: LucideIcon }> = {
  ac: { label: "Air conditioning", icon: Snowflake },
  wifi: { label: "Wi-Fi", icon: Wifi },
  charging: { label: "Charging ports", icon: PlugZap },
  reclining: { label: "Reclining seats", icon: Armchair },
  legroom: { label: "Extra legroom", icon: MoveVertical },
  entertainment: { label: "Entertainment", icon: Tv },
  refreshments: { label: "Refreshments", icon: Coffee },
};

export function AmenityIcons({ items, className, max = 7 }: { items: string[]; className?: string; max?: number }) {
  const list = items.filter((a) => AMENITIES[a]).slice(0, max);
  if (!list.length) return <span className={cn("text-sm text-ink-3", className)}>No listed amenities</span>;
  return (
    <ul className={cn("flex items-center gap-2.5 text-ink-3", className)} aria-label="Amenities">
      {list.map((a) => {
        const { icon: Icon, label } = AMENITIES[a];
        return (
          <li key={a} title={label} className="flex items-center">
            <Icon className="h-4 w-4" aria-hidden />
            <span className="sr-only">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function AmenityList({ items }: { items: string[] }) {
  const list = items.filter((a) => AMENITIES[a]);
  if (!list.length) return <p className="text-base text-ink-3">The operator hasn&apos;t listed any on-board amenities for this vehicle.</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {list.map((a) => {
        const { icon: Icon, label } = AMENITIES[a];
        return (
          <li key={a} className="flex items-center gap-2.5 text-base">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-navy-600"><Icon className="h-[18px] w-[18px]" /></span>
            {label}
          </li>
        );
      })}
    </ul>
  );
}
