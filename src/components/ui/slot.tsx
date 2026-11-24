import { cloneElement, forwardRef, isValidElement, type HTMLAttributes, type ReactElement } from "react";
import { cn } from "@/lib/cn";

/** Minimal Slot: merges props/className onto its single child (for `asChild` links). */
export const Slot = forwardRef<HTMLElement, HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>(function Slot({ children, className, ...props }, ref) {
  if (!isValidElement(children)) return null;
  const child = children as ReactElement<{ className?: string; ref?: unknown }>;
  return cloneElement(child, { ...props, ref, className: cn(className, child.props.className) } as never);
});
