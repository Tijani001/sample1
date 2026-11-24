import { cn } from "@/lib/cn";

/**
 * Official Goroada brand assets, traced to vector from the supplied logo (public/brand/goroada-logo-original.jpg).
 *   logo.svg            full colour wordmark: navy road + coral pin, "go" and "a" in brand orange, "road" in navy
 *   logo-inverted.svg   for dark backgrounds (navy parts become white)
 *   icon.svg            standalone road + pin mark (app icon, favicon, compact placements)
 * Do not recolour or redraw the mark; use these files.
 */
export const BRAND = { navy: "#194466", pin: "#F96B4F", orange: "#E1560A" } as const;

/** Intrinsic aspect ratio of the wordmark artwork (width / height). */
export const LOGO_RATIO = 602 / 135;

export function Logo({ className, inverted, height = 32, priority }: { className?: string; inverted?: boolean; height?: number; priority?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={inverted ? "/brand/logo-inverted.svg" : "/brand/logo.svg"}
      alt="Goroada"
      width={Math.round(height * LOGO_RATIO)}
      height={height}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={cn("block h-auto select-none", className)}
      style={{ height, width: "auto" }}
      draggable={false}
    />
  );
}

export function LogoMark({ className, title = "Goroada", inverted }: { className?: string; title?: string; inverted?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={inverted ? "/brand/icon-inverted.svg" : "/brand/icon.svg"} alt={title} width={32} height={32} decoding="async" className={cn("shrink-0 select-none", className)} draggable={false} />
  );
}
