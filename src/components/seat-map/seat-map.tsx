"use client";
import { motion } from "motion/react";
import { Check, Crown, DoorOpen, Lock, X } from "lucide-react";
import { parseLayout, type LayoutSpec } from "@/lib/domain/seat-layout";
import type { SeatState } from "@/lib/services/inventory";
import { formatMoney } from "@/lib/domain/money";
import { cn } from "@/lib/cn";

export type SeatMapData = {
  spec: LayoutSpec;
  premiumSurcharge: number;
  seatingMode: "assigned" | "open";
  states: Record<string, { state: SeatState; mine: boolean }>;
  available: number;
  capacity: number;
};

function SteeringWheel() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 14.5V21M9.6 11.2 3.4 10M14.4 11.2l6.2-1.2" />
    </svg>
  );
}

/**
 * Data-driven vehicle seat map. The layout comes from the operator's configuration (grammar in
 * seat-layout.ts), never from an image. States are conveyed with colour *and* icon/pattern and are
 * fully keyboard and screen-reader accessible.
 */
export function SeatMap({
  data, selected, onToggle, passengerLabels, disabled,
}: {
  data: SeatMapData;
  selected: string[]; // seat per passenger index
  onToggle: (seatNo: string) => void;
  passengerLabels?: string[];
  disabled?: boolean;
}) {
  const layout = parseLayout(data.spec);
  const cell = layout.width >= 5 ? "w-[44px] h-[46px] sm:w-12 sm:h-[50px]" : "w-12 h-[50px] sm:w-[52px] sm:h-[54px]";
  const doorsLeft = new Set(layout.doors.filter((d) => d.side === "left").map((d) => d.row));
  const doorsRight = new Set(layout.doors.filter((d) => d.side === "right").map((d) => d.row));

  return (
    <div className="flex justify-center">
      <div className="relative rounded-[36px] border-2 border-line-strong bg-white px-4 pb-6 pt-3 shadow-[inset_0_0_0_6px_var(--color-surface-2)] sm:px-6">
        {/* Front of vehicle */}
        <div className="mx-auto mb-3 flex h-7 items-center justify-center rounded-t-[28px] border-b border-dashed border-line-strong px-10 text-xs font-medium uppercase tracking-[0.12em] text-ink-3" aria-hidden>
          Front
        </div>
        <div role="grid" aria-label="Seat map, front of vehicle at the top" className="flex flex-col gap-2">
          {layout.rows.map((row, r) => (
            <div role="row" key={r} className="relative flex items-center gap-1.5 sm:gap-2">
              {doorsLeft.has(r) && <DoorMark side="left" />}
              {row.map((c) => {
                const key = `${c.row}-${c.col}`;
                if (c.kind === "driver") {
                  return (
                    <div role="gridcell" key={key} className={cn(cell, "grid place-items-center rounded-xl bg-surface-2")} aria-label="Driver">
                      <SteeringWheel />
                    </div>
                  );
                }
                if (c.kind === "aisle") return <div role="gridcell" key={key} aria-hidden className={cn(cell, "w-6 sm:w-7")} />;
                if (c.kind === "empty") return <div role="gridcell" key={key} aria-hidden className={cell} />;
                const st = data.states[c.seatNo];
                const pIndex = selected.indexOf(c.seatNo);
                const isSelected = pIndex >= 0;
                const taken = st && !st.mine && (st.state === "sold" || st.state === "blocked");
                const held = st && !st.mine && st.state === "held";
                const unavailable = taken || held;
                const label = `Seat ${c.seatNo}${c.premium ? ", premium" : ""}${isSelected ? `, selected for ${passengerLabels?.[pIndex] ?? `passenger ${pIndex + 1}`}` : unavailable ? (held ? ", temporarily held by another traveller" : ", taken") : ", available"}${c.premium && data.premiumSurcharge ? `, plus ${formatMoney(data.premiumSurcharge)}` : ""}`;
                return (
                  <div role="gridcell" key={key}>
                    <motion.button
                      type="button"
                      disabled={unavailable || disabled}
                      aria-pressed={isSelected}
                      aria-label={label}
                      onClick={() => onToggle(c.seatNo)}
                      whileTap={unavailable ? undefined : { scale: 0.9 }}
                      animate={isSelected ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                      transition={{ duration: 0.25 }}
                      className={cn(
                        cell,
                        "relative flex flex-col items-center justify-center rounded-t-[14px] rounded-b-[8px] border text-sm font-semibold tabular transition-colors",
                        "after:absolute after:inset-x-1.5 after:bottom-1 after:h-1 after:rounded-full",
                        isSelected
                          ? "border-coral-600 bg-coral-600 text-white after:bg-white/30"
                          : taken
                            ? "cursor-not-allowed border-surface-3 bg-surface-3 text-ink-4 after:bg-line-strong"
                            : held
                              ? "cursor-not-allowed border-warning-line bg-[repeating-linear-gradient(135deg,#fffbeb_0_5px,#fef3c7_5px_10px)] text-warning after:bg-warning-line"
                              : c.premium
                                ? "border-amber-300 bg-amber-50 text-ink hover:border-amber-500 hover:bg-amber-100 after:bg-amber-200"
                                : "border-navy-200 bg-white text-navy-700 hover:border-navy-500 hover:bg-navy-50 after:bg-navy-100",
                      )}
                    >
                      {isSelected ? (
                        <>
                          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                          <span className="text-[10px] leading-none opacity-90">P{pIndex + 1}</span>
                        </>
                      ) : taken ? (
                        <X className="h-4 w-4" aria-hidden />
                      ) : held ? (
                        <Lock className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <>
                          {c.premium && <Crown className="absolute -top-1.5 right-0.5 h-3 w-3 fill-amber-400 text-amber-500" aria-hidden />}
                          {c.seatNo}
                        </>
                      )}
                    </motion.button>
                  </div>
                );
              })}
              {doorsRight.has(r) && <DoorMark side="right" />}
            </div>
          ))}
        </div>
        <div className="mx-auto mt-4 h-1.5 w-16 rounded-full bg-line" aria-hidden />
        <p className="mt-1 text-center text-xs font-medium uppercase tracking-[0.12em] text-ink-3" aria-hidden>Rear</p>
      </div>
    </div>
  );
}

function DoorMark({ side }: { side: "left" | "right" }) {
  return (
    <span className={cn("absolute top-1/2 flex -translate-y-1/2 items-center", side === "left" ? "-left-[22px] sm:-left-[30px]" : "-right-[22px] sm:-right-[30px]")} aria-label={`Door on the ${side}`}>
      <span className="flex h-11 w-2.5 items-center justify-center rounded-full bg-navy-100" title="Door">
        <DoorOpen className="sr-only" />
      </span>
    </span>
  );
}

export function SeatLegend({ premium }: { premium?: number }) {
  const item = "flex items-center gap-2 text-sm text-ink-2";
  const box = "h-5 w-5 rounded-t-[6px] rounded-b-[4px] border grid place-items-center";
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Seat legend">
      <li className={item}><span className={cn(box, "border-navy-200 bg-white")} />Available</li>
      <li className={item}><span className={cn(box, "border-coral-600 bg-coral-600 text-white")}><Check className="h-3 w-3" strokeWidth={3} /></span>Your selection</li>
      <li className={item}><span className={cn(box, "border-surface-3 bg-surface-3 text-ink-4")}><X className="h-3 w-3" /></span>Taken</li>
      <li className={item}><span className={cn(box, "border-warning-line bg-warning-bg text-warning")}><Lock className="h-2.5 w-2.5" /></span>On hold</li>
      {premium ? <li className={item}><span className={cn(box, "border-amber-300 bg-amber-50")}><Crown className="h-2.5 w-2.5 fill-amber-400 text-amber-500" /></span>Premium +{formatMoney(premium)}</li> : null}
      <li className={item}><span className="h-4 w-1.5 rounded-full bg-navy-100" />Door</li>
    </ul>
  );
}
