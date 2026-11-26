"use client";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
};

function monthGrid(y: number, m: number) {
  const first = new Date(Date.UTC(y, m, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday-first
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= days; d++) cells.push(iso(y, m, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function Calendar({
  start, end, onSelect, minDate, maxDate, months = 1, today, rangeMode = false, label,
}: {
  start?: string | null; end?: string | null; onSelect: (iso: string) => void; minDate: string; maxDate: string; months?: 1 | 2;
  today: string; rangeMode?: boolean; label: string;
}) {
  const anchor = parse(start ?? minDate);
  const [view, setView] = useState({ y: anchor.y, m: anchor.m });
  const [dir, setDir] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState<string>(start ?? minDate);
  const gridRef = useRef<HTMLDivElement>(null);

  const min = parse(minDate);
  const max = parse(maxDate);
  const canPrev = view.y > min.y || (view.y === min.y && view.m > min.m);
  const lastShown = { y: view.m + months - 1 > 11 ? view.y + 1 : view.y, m: (view.m + months - 1) % 12 };
  const canNext = lastShown.y < max.y || (lastShown.y === max.y && lastShown.m < max.m);

  const shift = (n: number) => {
    setDir(n);
    setView((v) => {
      const t = v.m + n;
      return { y: v.y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
    });
  };

  const shown = useMemo(() => Array.from({ length: months }, (_, i) => {
    const t = view.m + i;
    return { y: view.y + Math.floor(t / 12), m: t % 12 };
  }), [view, months]);

  const rangeEnd = end ?? (rangeMode && start && hover && hover > start ? hover : null);

  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in map) {
      e.preventDefault();
      const d = new Date(`${focusDate}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + map[e.key]);
      const next = d.toISOString().slice(0, 10);
      if (next < minDate || next > maxDate) return;
      setFocusDate(next);
      const p = parse(next);
      const firstShown = shown[0];
      const lastS = shown[shown.length - 1];
      if (p.y * 12 + p.m < firstShown.y * 12 + firstShown.m) shift(-1);
      if (p.y * 12 + p.m > lastS.y * 12 + lastS.m) shift(1);
      requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(focusDate);
    }
  };

  return (
    <div className="select-none" aria-label={label} role="group">
      <div className="relative flex items-center justify-between pb-2">
        <button type="button" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month" className="grid h-9 w-9 place-items-center rounded-full text-ink hover:bg-surface-2 disabled:opacity-30">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => shift(1)} disabled={!canNext} aria-label="Next month" className="grid h-9 w-9 place-items-center rounded-full text-ink hover:bg-surface-2 disabled:opacity-30">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div ref={gridRef} className={cn("relative -mt-11 grid gap-6 overflow-hidden", months === 2 && "md:grid-cols-2")} onKeyDown={onKey}>
        <AnimatePresence initial={false} mode="popLayout" custom={dir}>
          {shown.map(({ y, m }) => (
            <motion.div
              key={`${y}-${m}`}
              custom={dir}
              initial={{ opacity: 0, x: dir * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -24 }}
              transition={{ duration: 0.2 }}
            >
              <p className="mb-3 text-center text-base font-semibold" aria-live="polite">{MONTHS[m]} {y}</p>
              <div className="grid grid-cols-7 text-center text-xs font-medium text-ink-3">
                {WEEKDAYS.map((w) => <span key={w} className="pb-2">{w}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-y-1" role="grid">
                {monthGrid(y, m).map((d, i) => {
                  if (!d) return <span key={`e${i}`} />;
                  const disabled = d < minDate || d > maxDate;
                  const isStart = d === start;
                  const isEnd = d === end;
                  const inRange = !!start && !!rangeEnd && d > start && d < rangeEnd;
                  const isHoverEnd = rangeMode && !end && d === rangeEnd;
                  const isToday = d === today;
                  return (
                    <div key={d} className={cn("relative flex justify-center", inRange && "bg-coral-50", (isStart && rangeEnd) && "bg-gradient-to-r from-transparent from-50% to-coral-50 to-50%", (isEnd || isHoverEnd) && start && "bg-gradient-to-l from-transparent from-50% to-coral-50 to-50%")}>
                      <button
                        type="button"
                        data-date={d}
                        disabled={disabled}
                        tabIndex={d === focusDate ? 0 : -1}
                        onClick={() => onSelect(d)}
                        onMouseEnter={() => setHover(d)}
                        onMouseLeave={() => setHover(null)}
                        aria-pressed={isStart || isEnd}
                        aria-label={`${new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}${isToday ? ", today" : ""}${disabled ? ", unavailable" : ""}`}
                        className={cn(
                          "relative grid h-10 w-10 place-items-center rounded-full text-sm tabular transition-colors duration-100",
                          disabled ? "cursor-not-allowed text-ink-4 line-through decoration-ink-4/40" : "text-ink hover:bg-surface-3",
                          (isStart || isEnd) && "bg-coral-600 font-semibold text-white hover:bg-coral-700",
                          isHoverEnd && "ring-2 ring-coral-300",
                        )}
                      >
                        {Number(d.slice(8))}
                        {isToday && !(isStart || isEnd) && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-coral-500" aria-hidden />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
