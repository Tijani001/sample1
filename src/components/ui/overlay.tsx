"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useIsDesktop } from "@/hooks/use-media-query";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Mobile: occupy (almost) the full screen, e.g. for searchable lists. */
  full?: boolean;
  className?: string;
  /** Force bottom sheet even on desktop. */
  sheetOnly?: boolean;
  size?: "sm" | "md" | "lg";
};

/**
 * Accessible overlay that is a bottom sheet on phones (thumb-reachable, swipe to dismiss)
 * and a centred dialog on larger screens. Focus is trapped and restored by Radix/Vaul.
 */
export function Overlay({ open, onOpenChange, title, description, children, footer, full, className, sheetOnly, size = "md" }: Props) {
  const desktop = useIsDesktop();
  if (desktop && !sheetOnly) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-navy-950/40 data-[state=open]:animate-[fade-in_180ms_ease-out]" />
          <Dialog.Content
            className={cn(
              "fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-pop outline-none",
              "data-[state=open]:animate-[dialog-in_220ms_cubic-bezier(0.22,1,0.36,1)]",
              size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl",
              className,
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div>
                <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
                {description ? <Dialog.Description className="mt-0.5 text-sm text-ink-3">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
              </div>
              <Dialog.Close className="-mr-2 grid h-9 w-9 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="border-t border-line px-6 py-4">{footer}</div>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-navy-950/40" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[22px] bg-white shadow-pop outline-none",
            full ? "h-[94dvh]" : "max-h-[90dvh]",
            className,
          )}
          aria-describedby={undefined}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />
          <div className="flex items-center justify-between gap-4 px-5 pb-3 pt-3">
            <div>
              <Drawer.Title className="text-lg font-semibold">{title}</Drawer.Title>
              {description && <Drawer.Description className="mt-0.5 text-sm text-ink-3">{description}</Drawer.Description>}
            </div>
            <Drawer.Close className="-mr-2 grid h-10 w-10 place-items-center rounded-full text-ink-3 hover:bg-surface-2" aria-label="Close">
              <X className="h-5 w-5" />
            </Drawer.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
          {footer && <div className="border-t border-line bg-white px-5 pb-safe pt-3 [&>*]:mb-3">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
