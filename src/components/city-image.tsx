"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Destination photo with a designed fallback (brand gradient + city name) when no photo is available
 * or it fails to load, e.g. on very slow connections. Images are lazy-loaded and size-appropriate.
 */
export function CityImage({ src, alt, name, className, sizes = "(max-width: 768px) 70vw, 300px", priority, width = 640 }: { src: string | null | undefined; alt: string; name: string; className?: string; sizes?: string; priority?: boolean; width?: number }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // The image may fail before hydration attaches onError; detect that case on mount.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  const show = src && !failed;
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 3;
  return (
    <div className={cn("relative overflow-hidden bg-navy-700", className)}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={`${src}?width=${width}`}
          srcSet={`${src}?width=${Math.round(width / 2)} ${Math.round(width / 2)}w, ${src}?width=${width} ${width}w, ${src}?width=${width * 2} ${width * 2}w`}
          sizes={sizes}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div aria-hidden className={cn("absolute inset-0", hue === 0 ? "bg-[linear-gradient(135deg,#174363_0%,#2a5d84_100%)]" : hue === 1 ? "bg-[linear-gradient(135deg,#123651_0%,#174363_60%,#4d7fa6_130%)]" : "bg-[linear-gradient(160deg,#0e2a40_0%,#174363_70%)]")}>
          <svg className="absolute inset-0 h-full w-full opacity-[0.12]" preserveAspectRatio="none" viewBox="0 0 200 120">
            <path d="M-10 110 C 40 80, 80 95, 120 60 S 190 20, 220 10" stroke="#fff" strokeWidth="0.8" fill="none" />
            <path d="M-10 118 C 50 95, 90 105, 130 75 S 200 35, 220 28" stroke="#fff" strokeWidth="0.5" fill="none" strokeDasharray="3 3" />
          </svg>
          <span className="absolute bottom-[-0.18em] right-2 select-none text-[64px] font-bold leading-none tracking-[-0.06em] text-white/10">{name}</span>
        </div>
      )}
    </div>
  );
}
