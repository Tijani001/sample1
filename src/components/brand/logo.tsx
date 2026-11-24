import { cn } from "@/lib/cn";

/**
 * Goroada brand mark: a coral location pin above a navy road, with the lowercase "goroada" wordmark.
 *
 * NOTE: The official logo file was not present in the repository, so this is a faithful vector
 * reconstruction from the brand description. To use the official artwork, drop the supplied files into
 * /public/brand (logo.svg, icon.svg) and set NEXT_PUBLIC_BRAND_ASSETS=official — every placement in the
 * product (navigation, tickets, emails, portals, PWA icons) reads from this component or those files.
 */
export const BRAND = { navy: "#174363", coral: "#FF6347" } as const;

export function LogoMark({ className, title = "Goroada" }: { className?: string; title?: string }) {
  if (process.env.NEXT_PUBLIC_BRAND_ASSETS === "official") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/brand/icon.svg" alt={title} className={className} />;
  }
  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0", className)} role="img" aria-label={title}>
      <path d="M13 63 27.6 35.5h8.8L51 63Z" fill={BRAND.navy} />
      <path d="M31.1 40h1.8l.35 5h-2.5zM30.6 49h2.8l.5 6.5h-3.8zM30 59h4l.4 4h-4.8z" fill="#fff" />
      <path d="M32 33.5s-12.5-11.6-12.5-19a12.5 12.5 0 0 1 25 0c0 7.4-12.5 19-12.5 19Z" fill={BRAND.coral} />
      <circle cx="32" cy="14.6" r="4.6" fill="#fff" />
    </svg>
  );
}

export function Logo({ className, markClassName, inverted }: { className?: string; markClassName?: string; inverted?: boolean }) {
  if (process.env.NEXT_PUBLIC_BRAND_ASSETS === "official") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={inverted ? "/brand/logo-inverted.svg" : "/brand/logo.svg"} alt="Goroada" className={cn("h-8 w-auto", className)} />;
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} aria-label="Goroada">
      <LogoMark className={cn("h-8 w-8", markClassName)} title="" />
      <span aria-hidden className={cn("text-[23px] font-semibold leading-none tracking-[-0.045em]", inverted ? "text-white" : "text-navy-600")}>
        goroada
      </span>
    </span>
  );
}
