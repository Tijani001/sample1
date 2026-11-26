import { Slot } from "./slot";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-coral-600 text-white hover:bg-coral-700 active:bg-coral-800 shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_1px_2px_rgb(146_42_22/0.3)] disabled:bg-coral-300",
  navy: "bg-navy-600 text-white hover:bg-navy-700 active:bg-navy-800 disabled:bg-navy-300",
  outline: "border border-line-strong bg-white text-ink hover:bg-surface-2 hover:border-ink-4 active:bg-surface-3 disabled:text-ink-4",
  ghost: "text-ink hover:bg-surface-2 active:bg-surface-3 disabled:text-ink-4",
  subtle: "bg-surface-2 text-ink hover:bg-surface-3 active:bg-line disabled:text-ink-4",
  link: "text-coral-700 hover:text-coral-800 underline-offset-4 hover:underline px-0 h-auto",
  danger: "bg-white border border-danger-line text-danger hover:bg-danger-bg",
} as const;

const sizes = {
  sm: "h-9 px-3 text-sm gap-1.5 rounded-md",
  md: "h-11 px-4 text-base gap-2 rounded-lg",
  lg: "h-12 px-5 text-base gap-2 rounded-lg",
  xl: "h-14 px-6 text-base gap-2.5 rounded-xl",
  icon: "h-10 w-10 rounded-full",
  "icon-sm": "h-8 w-8 rounded-full",
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  asChild?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, asChild, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      className={cn(
        "relative inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out",
        "active:scale-[0.98] disabled:pointer-events-none disabled:active:scale-100",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className="invisible inline-flex items-center gap-2">{children}</span>
          <Loader2 className="absolute h-5 w-5 animate-spin" aria-hidden />
          <span className="sr-only">Loading</span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
});
