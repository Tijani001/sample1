import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-12 w-full rounded-lg border border-line-strong bg-white px-3.5 text-base text-ink outline-none transition-[border-color,box-shadow] duration-150",
        "hover:border-ink-4 focus:border-navy-500 focus:shadow-[0_0_0_3px_rgb(42_93_132/0.15)] focus-visible:outline-none",
        "disabled:bg-surface-2 disabled:text-ink-3",
        invalid && "border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgb(220_38_38/0.12)]",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "min-h-28 w-full rounded-lg border border-line-strong bg-white px-3.5 py-3 text-base text-ink outline-none transition-[border-color,box-shadow] duration-150",
        "hover:border-ink-4 focus:border-navy-500 focus:shadow-[0_0_0_3px_rgb(42_93_132/0.15)] focus-visible:outline-none",
        invalid && "border-danger",
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-12 w-full appearance-none rounded-lg border border-line-strong bg-white bg-[length:16px] bg-[right_12px_center] bg-no-repeat px-3.5 pr-10 text-base text-ink outline-none",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748B' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        "hover:border-ink-4 focus:border-navy-500 focus:shadow-[0_0_0_3px_rgb(42_93_132/0.15)] focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
});

export function Field({ label, htmlFor, error, hint, children, className, optional }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode; className?: string; optional?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-3">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="flex items-center gap-1.5 text-sm text-danger">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-surface-2 text-ink-2 ring-line",
  navy: "bg-navy-50 text-navy-700 ring-navy-100",
  coral: "bg-coral-50 text-coral-700 ring-coral-100",
  success: "bg-success-bg text-success ring-success-line",
  warning: "bg-warning-bg text-warning ring-warning-line",
  danger: "bg-danger-bg text-danger ring-danger-line",
  info: "bg-info-bg text-info ring-blue-100",
} as const;

export function Badge({ tone = "neutral", children, className, icon }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium ring-1 ring-inset", badgeTones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

const noticeTones = {
  info: { cls: "bg-info-bg text-navy-800 border-blue-100", Icon: Info },
  success: { cls: "bg-success-bg text-emerald-900 border-success-line", Icon: CheckCircle2 },
  warning: { cls: "bg-warning-bg text-amber-900 border-warning-line", Icon: TriangleAlert },
  danger: { cls: "bg-danger-bg text-red-900 border-danger-line", Icon: AlertCircle },
  neutral: { cls: "bg-surface-2 text-ink-2 border-line", Icon: Info },
} as const;

export function Notice({ tone = "info", title, children, className, action }: { tone?: keyof typeof noticeTones; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const { cls, Icon } = noticeTones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Card({ className, children, as: As = "div", ...rest }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" | "li" } & Record<string, unknown>) {
  return (
    <As className={cn("rounded-2xl border border-line bg-white", className)} {...rest}>
      {children}
    </As>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton h-4", className)} />;
}

export function SectionHeading({ title, subtitle, action, className, as: As = "h2" }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string; as?: "h1" | "h2" | "h3" }) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <As className="text-2xl font-semibold leading-tight text-ink sm:text-2xl">{title}</As>
        {subtitle && <p className="mt-1 text-base text-ink-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, children, action, className }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-white px-6 py-12 text-center", className)}>
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-navy-600">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-base text-ink-3">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line", className)} />;
}
