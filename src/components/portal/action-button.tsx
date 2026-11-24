"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Runs a server action and reports the result as a toast. */
export function ActionButton({ action, confirmText, children, ...props }: Omit<ButtonProps, "onClick" | "action"> & { action: () => Promise<{ ok: boolean; error?: string; message?: string } | void>; confirmText?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button {...props} loading={pending} onClick={() => {
      if (confirmText && !confirm(confirmText)) return;
      start(async () => {
        const r = await action();
        if (r && !r.ok) toast.error(r.error ?? "Failed");
        else if (r?.message) toast.success(r.message);
      });
    }}>{children}</Button>
  );
}

export function ActionForm({ action, children, className }: { action: (f: FormData) => Promise<{ ok: boolean; error?: string; message?: string }>; children: React.ReactNode; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <form className={className} aria-busy={pending} onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      start(async () => { const r = await action(fd); if (!r.ok) toast.error(r.error ?? "Failed"); else { toast.success(r.message ?? "Saved"); form.reset(); } });
    }}>{children}</form>
  );
}
