import { cn } from "@/lib/cn";

/** Operator monogram. Real operators can supply a logo; demo operators use initials in their brand colour. */
export function OperatorLogo({ initials, color, className, size = "md" }: { initials: string; color: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-8 w-8 text-xs rounded-lg" : size === "lg" ? "h-14 w-14 text-base rounded-2xl" : "h-10 w-10 text-xs rounded-xl";
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center font-bold tracking-tight text-white", s, className)} style={{ background: `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 70%, #000))` }}>
      {initials}
    </span>
  );
}
