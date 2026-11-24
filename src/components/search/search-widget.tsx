"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeftRight, ArrowUpDown, CalendarDays, Car, ChevronDown, Minus, Plus, Search, Users } from "lucide-react";
import type { Place } from "@/lib/services/search";
import { Overlay } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { PlacePicker } from "./place-picker";
import { Calendar } from "./calendar";
import { pushRecent, searchHref } from "./recent";

export type SearchInitial = {
  from?: string | null; to?: string | null; fromTerminal?: string | null; toTerminal?: string | null;
  date?: string | null; returnDate?: string | null; pax?: number; vehicle?: string | null;
};

const VEHICLES = [
  { id: "any", label: "Any vehicle" },
  { id: "car", label: "Car / SUV" },
  { id: "minivan", label: "Minivan" },
  { id: "bus", label: "Bus" },
  { id: "coach", label: "Coach" },
];

const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

type Panel = "from" | "to" | "date" | "return" | "pax" | null;

function Picker({ open, onOpenChange, title, trigger, children, width = 420, full, footer }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; trigger: ReactNode; children: ReactNode; width?: number; full?: boolean; footer?: ReactNode }) {
  const desktop = useIsDesktop();
  if (desktop) {
    return (
      <Popover.Root open={open} onOpenChange={onOpenChange}>
        <Popover.Anchor asChild>{trigger}</Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={10}
            collisionPadding={16}
            onOpenAutoFocus={(e) => e.preventDefault()}
            style={{ width }}
            className="z-50 rounded-2xl border border-line bg-white p-3 shadow-pop outline-none data-[state=open]:animate-[pop-in_180ms_cubic-bezier(0.22,1,0.36,1)]"
            aria-label={title}
          >
            {children}
            {footer && <div className="mt-2 border-t border-line pt-3">{footer}</div>}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }
  return (
    <>
      {trigger}
      <Overlay open={open} onOpenChange={onOpenChange} title={title} full={full} sheetOnly footer={footer}>
        {children}
      </Overlay>
    </>
  );
}

export function SearchWidget({ places, initial, today, variant = "hero", onSubmitted }: { places: Place[]; initial?: SearchInitial; today: string; variant?: "hero" | "compact"; onSubmitted?: () => void }) {
  const router = useRouter();
  const find = (id?: string | null) => (id ? places.find((p) => p.id === id) ?? null : null);
  const [tripType, setTripType] = useState<"one_way" | "round_trip">(initial?.returnDate ? "round_trip" : "one_way");
  const [from, setFrom] = useState<Place | null>(find(initial?.fromTerminal) ?? find(initial?.from));
  const [to, setTo] = useState<Place | null>(find(initial?.toTerminal) ?? find(initial?.to));
  const [date, setDate] = useState<string>(initial?.date && initial.date >= today ? initial.date : addDays(today, 1));
  const [returnDate, setReturnDate] = useState<string | null>(initial?.returnDate ?? null);
  const [pax, setPax] = useState(initial?.pax ?? 1);
  const [vehicle, setVehicle] = useState(initial?.vehicle ?? "any");
  const [panel, setPanel] = useState<Panel>(null);
  const [swapTurns, setSwapTurns] = useState(0);
  const [errors, setErrors] = useState<{ from?: string; to?: string; return?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const maxDate = useMemo(() => addDays(today, 120), [today]);


  const swap = () => {
    setSwapTurns((t) => t + 1);
    setFrom(to);
    setTo(from);
    setErrors({});
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const errs: typeof errors = {};
    if (!from) errs.from = "Choose where you're leaving from";
    if (!to) errs.to = "Choose your destination";
    if (from && to && from.cityId === to.cityId) errs.to = "Destination must be a different city";
    if (tripType === "round_trip" && !returnDate) errs.return = "Choose a return date";
    setErrors(errs);
    if (Object.keys(errs).length) {
      if (errs.from) setPanel("from");
      else if (errs.to) setPanel("to");
      else if (errs.return) setPanel("return");
      return;
    }
    const s = {
      from: from!.cityId, to: to!.cityId, date, pax,
      returnDate: tripType === "round_trip" ? returnDate ?? undefined : undefined,
      fromTerminal: from!.kind === "terminal" ? from!.id : undefined,
      toTerminal: to!.kind === "terminal" ? to!.id : undefined,
      vehicle,
    };
    pushRecent({ ...s, fromName: from!.cityName, toName: to!.cityName, tripType });
    setSubmitting(true);
    router.push(searchHref(s));
    onSubmitted?.();
    setTimeout(() => setSubmitting(false), 4000);
  };

  const compact = variant === "compact";
  const fieldBase = "group relative flex h-full w-full flex-col justify-center rounded-xl px-4 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2";

  const placeField = (side: "from" | "to") => {
    const value = side === "from" ? from : to;
    const err = errors[side];
    return (
      <Picker
        open={panel === side}
        onOpenChange={(o) => setPanel(o ? side : null)}
        title={side === "from" ? "Leaving from" : "Going to"}
        full
        trigger={
          <button type="button" onClick={() => setPanel(side)} aria-haspopup="dialog" aria-expanded={panel === side}
            aria-describedby={err ? `err-${side}` : undefined}
            className={cn(fieldBase, "min-h-[64px] py-2.5", err && "bg-danger-bg/60")}>
            <span className="text-xs font-medium text-ink-3">{side === "from" ? "From" : "To"}</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={`${value?.id ?? "none"}-${swapTurns}`} initial={{ opacity: 0, y: side === "from" ? 8 : -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: side === "from" ? -8 : 8 }} transition={{ duration: 0.18 }}
                className={cn("block truncate text-[17px] font-semibold leading-tight", value ? "text-ink" : "text-ink-4")}>
                {value ? value.cityName : side === "from" ? "Departure city" : "Destination city"}
              </motion.span>
            </AnimatePresence>
            <span className="block truncate text-[13px] text-ink-3">{value ? (value.kind === "terminal" ? value.name : "All terminals") : "City or terminal"}</span>
            {err && <span id={`err-${side}`} className="sr-only">{err}</span>}
          </button>
        }
      >
        <PlacePicker places={places} value={value} side={side} excludeCityId={(side === "from" ? to : from)?.cityId}
          onSelect={(p) => {
            if (side === "from") setFrom(p); else setTo(p);
            setErrors((e) => ({ ...e, [side]: undefined }));
            setPanel(side === "from" && !to ? "to" : null);
          }} />
      </Picker>
    );
  };

  const dateField = (which: "date" | "return") => {
    const value = which === "date" ? date : returnDate;
    const disabledReturn = which === "return" && tripType === "one_way";
    return (
      <Picker
        open={panel === which}
        onOpenChange={(o) => setPanel(o ? which : null)}
        title={which === "date" ? "Departure date" : "Return date"}
        width={660}
        trigger={
          <button type="button"
            onClick={() => { if (disabledReturn) setTripType("round_trip"); setPanel(which); }}
            aria-haspopup="dialog"
            className={cn(fieldBase, "min-h-[64px] py-2.5", which === "return" && errors.return && "bg-danger-bg/60")}>
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-3"><CalendarDays className="h-3.5 w-3.5" />{which === "date" ? "Departure" : "Return"}</span>
            <span className={cn("block truncate text-[17px] font-semibold leading-tight tabular", value ? "text-ink" : "text-ink-4")}>
              {value ? fmtDate(value) : disabledReturn ? "Add return" : "Choose date"}
            </span>
            <span className="block truncate text-[13px] text-ink-3">{value === today ? "Today" : value === addDays(today, 1) ? "Tomorrow" : disabledReturn ? "Optional" : value ? new Date(`${value}T12:00:00Z`).getUTCFullYear() : "Required"}</span>
          </button>
        }
        footer={
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-3">
              {tripType === "round_trip" ? <>Depart <b className="text-ink tabular">{fmtDate(date)}</b>{returnDate && <> · Return <b className="text-ink tabular">{fmtDate(returnDate)}</b></>}</> : <>Departing <b className="text-ink tabular">{fmtDate(date)}</b></>}
            </p>
            <div className="flex gap-2">
              {which === "return" && returnDate && <Button type="button" variant="ghost" size="sm" onClick={() => { setReturnDate(null); setTripType("one_way"); setPanel(null); }}>Remove return</Button>}
              <Button type="button" size="sm" variant="navy" onClick={() => setPanel(null)}>Done</Button>
            </div>
          </div>
        }
      >
        <Calendar
          label={which === "date" ? "Choose departure date" : "Choose return date"}
          months={2}
          today={today}
          rangeMode={tripType === "round_trip"}
          start={date}
          end={tripType === "round_trip" ? returnDate : null}
          minDate={which === "date" ? today : date}
          maxDate={maxDate}
          onSelect={(d) => {
            if (which === "date") {
              setDate(d);
              if (tripType === "round_trip") {
                if (returnDate && returnDate < d) setReturnDate(null);
                setPanel("return");
              } else setPanel(null);
            } else {
              setReturnDate(d);
              setErrors((e) => ({ ...e, return: undefined }));
              setPanel(null);
            }
          }}
        />
      </Picker>
    );
  };

  const paxField = (
    <Picker
      open={panel === "pax"}
      onOpenChange={(o) => setPanel(o ? "pax" : null)}
      title="Passengers"
      width={340}
      trigger={
        <button type="button" onClick={() => setPanel("pax")} aria-haspopup="dialog" className={cn(fieldBase, "min-h-[64px] py-2.5")}>
          <span className="flex items-center gap-1.5 text-xs font-medium text-ink-3"><Users className="h-3.5 w-3.5" />Passengers</span>
          <span className="block text-[17px] font-semibold leading-tight tabular">{pax} {pax === 1 ? "passenger" : "passengers"}</span>
          <span className="block truncate text-[13px] text-ink-3">{VEHICLES.find((v) => v.id === vehicle)?.label}</span>
        </button>
      }
      footer={<Button type="button" variant="navy" className="w-full" onClick={() => setPanel(null)}>Done</Button>}
    >
      <PassengerStepper value={pax} onChange={setPax} />
      <div className="mt-4 border-t border-line pt-4">
        <p className="mb-2 text-sm font-medium">Vehicle preference <span className="font-normal text-ink-3">(optional)</span></p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Vehicle preference">
          {VEHICLES.map((v) => (
            <button key={v.id} type="button" role="radio" aria-checked={vehicle === v.id} onClick={() => setVehicle(v.id)}
              className={cn("h-9 rounded-full border px-3.5 text-sm transition-colors", vehicle === v.id ? "border-navy-600 bg-navy-600 text-white" : "border-line-strong text-ink hover:border-ink-4")}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </Picker>
  );

  return (
    <form onSubmit={submit} noValidate aria-label="Search trips" className={cn("w-full", !compact && "rounded-[22px] border border-line bg-white p-3 shadow-lg sm:p-4")}>
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <TripTypeToggle value={tripType} onChange={(t) => { setTripType(t); if (t === "one_way") setReturnDate(null); else if (!returnDate) setPanel("return"); }} />
        <div className="hidden items-center gap-1.5 text-sm text-ink-3 md:flex">
          <Car className="h-4 w-4" />
          <label htmlFor="vehicle-pref" className="sr-only">Vehicle preference</label>
          <div className="relative">
            <select id="vehicle-pref" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="h-8 appearance-none rounded-lg bg-transparent pl-1 pr-6 text-sm font-medium text-ink outline-none hover:bg-surface-2">
              {VEHICLES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          </div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-stretch md:gap-0 md:rounded-2xl md:border md:border-line">
        {/* From / To with swap */}
        <div className="relative grid rounded-2xl border border-line md:col-span-2 md:grid-cols-2 md:rounded-none md:border-0">
          <div className="border-b border-line md:border-b-0 md:border-r">{placeField("from")}</div>
          <div>{placeField("to")}</div>
          <motion.button
            type="button"
            onClick={swap}
            aria-label="Swap departure and destination"
            animate={{ rotate: swapTurns * 180 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            whileTap={{ scale: 0.9 }}
            className="absolute right-4 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-navy-600 shadow-sm hover:border-navy-300 md:left-1/2 md:right-auto md:h-9 md:w-9 md:-translate-x-1/2"
          >
            <ArrowUpDown className="h-[18px] w-[18px] md:hidden" />
            <ArrowLeftRight className="hidden h-4 w-4 md:block" />
          </motion.button>
        </div>
        <div className="grid grid-cols-2 rounded-2xl border border-line md:contents">
          <div className="border-r border-line md:border-l">{dateField("date")}</div>
          <div className="md:border-r md:border-line">{dateField("return")}</div>
        </div>
        <div className="rounded-2xl border border-line md:rounded-none md:border-0">{paxField}</div>
        <div className="pt-1 md:p-2">
          <Button type="submit" size="xl" loading={submitting} className="w-full md:h-full md:min-h-[56px] md:px-6">
            <Search className="h-5 w-5" />
            <span>Search trips</span>
          </Button>
        </div>
      </div>
      <AnimatePresence>
        {(errors.from || errors.to || errors.return) && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="alert" className="px-2 pt-2 text-sm text-danger">
            {errors.from ?? errors.to ?? errors.return}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}

function TripTypeToggle({ value, onChange }: { value: "one_way" | "round_trip"; onChange: (v: "one_way" | "round_trip") => void }) {
  return (
    <div role="radiogroup" aria-label="Trip type" className="relative inline-flex rounded-full bg-surface-2 p-1">
      {(["one_way", "round_trip"] as const).map((t) => (
        <button key={t} type="button" role="radio" aria-checked={value === t} onClick={() => onChange(t)}
          className={cn("relative z-10 h-8 rounded-full px-3.5 text-sm font-medium transition-colors", value === t ? "text-ink" : "text-ink-3 hover:text-ink")}>
          {value === t && <motion.span layoutId="trip-type-pill" className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
          {t === "one_way" ? "One-way" : "Round trip"}
        </button>
      ))}
    </div>
  );
}

export function PassengerStepper({ value, onChange, min = 1, max = 10 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[15px] font-medium">Passengers</p>
        <p className="text-[13px] text-ink-3">Everyone needs a seat, including children</p>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Remove a passenger" className="grid h-10 w-10 place-items-center rounded-full border border-line-strong text-ink transition hover:border-ink-3 disabled:opacity-30">
          <Minus className="h-4 w-4" />
        </button>
        <span className="relative w-6 overflow-hidden text-center text-lg font-semibold tabular" aria-live="polite" aria-label={`${value} passengers`}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={value} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.15 }} className="block">{value}</motion.span>
          </AnimatePresence>
        </span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Add a passenger" className="grid h-10 w-10 place-items-center rounded-full border border-line-strong text-ink transition hover:border-ink-3 disabled:opacity-30">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
