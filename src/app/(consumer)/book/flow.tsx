"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronUp, Clock, CreditCard, HelpCircle, Landmark, Lock, ShieldCheck, Smartphone, Tag, TimerReset, Users, Luggage, Shield, Coffee, Info, UserRound, Minus, Plus, X, LifeBuoy, Phone, Mail } from "lucide-react";
import type { TripResult } from "@/lib/services/search";
import type { BookingView } from "@/lib/services/bookings";
import { computeQuote, ADDONS, addonQuantityLimits, type AddonCode, type Quote } from "@/lib/domain/pricing";
import { formatMoney } from "@/lib/domain/money";
import { formatDate, formatTime, formatDuration } from "@/lib/domain/time";
import { passengersFormSchema, type PassengersForm } from "@/lib/validation";
import { SeatMap, SeatLegend, type SeatMapData } from "@/components/seat-map/seat-map";
import { JourneyLine } from "@/components/trip/trip-card";
import { OperatorLogo } from "@/components/operator-badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Notice, Badge } from "@/components/ui/primitives";
import { Overlay } from "@/components/ui/overlay";
import { useCountdown, formatCountdown } from "@/hooks/use-countdown";
import { cn } from "@/lib/cn";

export type Step = "seats" | "details" | "extras" | "pay";
const STEPS: { id: Step; label: string }[] = [
  { id: "seats", label: "Seats" },
  { id: "details", label: "Passengers" },
  { id: "extras", label: "Extras" },
  { id: "pay", label: "Payment" },
];

type Segment = { direction: "outbound" | "return"; trip: TripResult; seatMap: SeatMapData; seats: string[] };
type SavedPassenger = { id: string; full_name: string; phone: string | null; email: string | null; next_of_kin_name: string | null; next_of_kin_phone: string | null };
type Provider = { id: "demo" | "paystack" | "flutterwave"; label: string; live: boolean };

async function api<T>(url: string, method: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message ?? "Something went wrong. Please try again.") as Error & { code?: string; details?: unknown; status?: number };
    err.code = data?.error?.code;
    err.details = data?.error?.details;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export function BookingFlow(props: {
  pax: number;
  segments: Segment[];
  booking: BookingView | null;
  initialStep: Step;
  user: { name: string; email: string | null; phone: string | null } | null;
  savedPassengers: SavedPassenger[];
  providers: Provider[];
  restartHref: string;
}) {
  const router = useRouter();
  const { pax, booking } = props;
  const [step, setStep] = useState<Step>(booking ? props.initialStep : "seats");
  const [segments, setSegments] = useState<Segment[]>(props.segments);
  const [active, setActive] = useState(0); // segment index
  const [activePax, setActivePax] = useState(0);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(booking ? (fromView(booking) as Quote) : null);
  const [addons, setAddons] = useState<Partial<Record<AddonCode, number>>>(() => Object.fromEntries((booking?.addons ?? []).map((a) => [a.code, a.code === "extra_luggage" ? a.quantity : 1])));
  const [promo, setPromo] = useState<string>(booking?.promoCode ?? "");
  const [promoState, setPromoState] = useState<{ ok: boolean; message: string } | null>(booking?.promoCode ? { ok: true, message: `${booking.promoCode} applied` } : null);
  const [expired, setExpired] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const left = useCountdown(booking?.status === "awaiting_payment" ? booking.holdExpiresAt : null);
  const dirty = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (left === 0) setExpired(true);
  }, [left]);

  const goto = useCallback((s: Step, id?: string) => {
    setStep(s);
    const bid = id ?? booking?.id;
    if (bid) router.replace(`/book/${bid}?step=${s}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [booking?.id, router]);

  // Client-side live estimate (mirrors the server's pricing; the server recomputes before payment).
  const liveQuote = useMemo(() => computeQuote({
    passengers: pax,
    segments: segments.map((s) => ({
      farePerSeat: s.trip.fare,
      seatCharges: s.seats.map((no) => (parseLayoutPremium(s.seatMap, no) ? s.seatMap.premiumSurcharge : 0)),
      offersMeal: s.trip.vehicle.amenities.includes("refreshments"),
    })),
    addons,
    discount: quote?.discount ?? 0,
  }), [segments, addons, pax, quote?.discount]);
  const shownQuote = step === "seats" || !quote ? liveQuote : { ...liveQuote, ...quote, addonLines: liveQuote.addonLines.length && step === "extras" ? liveQuote.addonLines : quote.addonLines };

  // Keep seat availability fresh while choosing seats.
  useEffect(() => {
    if (step !== "seats") return;
    const id = setInterval(async () => {
      const next = await Promise.all(segments.map(async (s) => {
        try {
          const r = await fetch(`/api/trips/${s.trip.id}/seats${booking ? `?booking=${booking.id}` : ""}`, { cache: "no-store" });
          if (!r.ok) return s;
          const map = (await r.json()) as SeatMapData;
          const lost = s.seats.filter((no) => map.states[no] && !map.states[no].mine);
          if (lost.length) toast.warning(`Seat ${lost.join(", ")} was just taken`, { description: "Please choose another seat." });
          return { ...s, seatMap: map, seats: s.seats.map((no) => (lost.includes(no) ? "" : no)) };
        } catch {
          return s;
        }
      }));
      setSegments(next);
    }, 20000);
    return () => clearInterval(id);
  }, [step, segments, booking]);

  const seg = segments[active];
  const assigned = seg?.seatMap.seatingMode === "assigned";
  const segmentComplete = (s: Segment) => s.seatMap.seatingMode === "open" || (s.seats.filter(Boolean).length === pax);
  const allSeatsChosen = segments.every(segmentComplete);

  const toggleSeat = (no: string) => {
    setSegments((prev) => prev.map((s, i) => {
      if (i !== active) return s;
      const seats = [...s.seats];
      while (seats.length < pax) seats.push("");
      const existing = seats.indexOf(no);
      if (existing >= 0) {
        seats[existing] = "";
        setActivePax(existing);
      } else {
        let target = activePax;
        if (seats[target]) {
          const empty = seats.indexOf("");
          target = empty >= 0 ? empty : activePax;
        }
        seats[target] = no;
        const nextEmpty = seats.findIndex((x, idx) => !x && idx !== target);
        if (nextEmpty >= 0) setActivePax(nextEmpty);
        else if (active < segments.length - 1 && prev[active + 1].seats.filter(Boolean).length < pax) {
          setTimeout(() => { setActive(active + 1); setActivePax(0); }, 450);
        }
      }
      dirty.current.add(i);
      return { ...s, seats };
    }));
  };

  const continueFromSeats = async () => {
    if (!allSeatsChosen) {
      const idx = segments.findIndex((s) => !segmentComplete(s));
      setActive(idx);
      toast.error(`Choose ${pax} seat${pax > 1 ? "s" : ""} for your ${segments[idx].direction} journey`);
      return;
    }
    setBusy(true);
    try {
      if (!booking) {
        const res = await api<{ bookingId: string }>("/api/bookings", "POST", {
          passengers: pax,
          segments: segments.map((s) => ({ tripId: s.trip.id, direction: s.direction, seats: s.seatMap.seatingMode === "assigned" ? s.seats : undefined })),
        }, { "Idempotency-Key": idemKey(segments, pax) });
        router.replace(`/book/${res.bookingId}?step=details`);
        router.refresh();
        return;
      }
      for (const i of dirty.current) {
        const s = segments[i];
        if (s.seatMap.seatingMode !== "assigned") continue;
        const r = await api<{ quote: Quote }>(`/api/bookings/${booking.id}/seats`, "PATCH", { direction: s.direction, seats: s.seats });
        setQuote(r.quote);
      }
      dirty.current.clear();
      goto("details");
    } catch (e) {
      handleSeatError(e as Error & { code?: string; details?: { seats?: string[]; tripId?: string } });
    } finally {
      setBusy(false);
    }
  };

  const handleSeatError = (e: Error & { code?: string; details?: { seats?: string[]; tripId?: string } }) => {
    if (e.code === "seat_unavailable" && e.details?.seats) {
      const taken = e.details.seats;
      setSegments((prev) => prev.map((s) => s.trip.id === e.details!.tripId ? {
        ...s, seats: s.seats.map((no) => (taken.includes(no) ? "" : no)),
        seatMap: { ...s.seatMap, states: { ...s.seatMap.states, ...Object.fromEntries(taken.map((no) => [no, { state: "held" as const, mine: false }])) } },
      } : s));
      toast.error(e.message, { description: "Someone else reserved it moments ago. Please pick another seat." });
    } else if (e.code === "hold_expired") setExpired(true);
    else toast.error(e.message);
  };

  const passengerLabels = useMemo(() => Array.from({ length: pax }, (_, i) => booking?.passengers[i]?.fullName?.split(" ")[0] || `Passenger ${i + 1}`), [pax, booking]);

  // ───────── Details form ─────────
  const defaults: PassengersForm = useMemo(() => ({
    contact: {
      name: booking?.contact.name ?? props.user?.name ?? "",
      email: booking?.contact.email ?? props.user?.email ?? "",
      phone: booking?.contact.phone ?? props.user?.phone ?? "",
    },
    passengers: Array.from({ length: pax }, (_, i) => {
      const p = booking?.passengers[i];
      return { fullName: p?.fullName ?? (i === 0 ? props.user?.name ?? "" : ""), phone: p?.phone ?? "", email: p?.email ?? "", nextOfKinName: p?.nextOfKinName ?? "", nextOfKinPhone: p?.nextOfKinPhone ?? "" };
    }),
  }), [booking, pax, props.user]);
  const form = useForm<PassengersForm>({ resolver: zodResolver(passengersFormSchema) as never, defaultValues: defaults, mode: "onTouched" });
  const { fields } = useFieldArray({ control: form.control, name: "passengers" });
  const errs = form.formState.errors;

  const submitDetails = form.handleSubmit(async (values) => {
    if (!booking) return;
    setBusy(true);
    try {
      await api(`/api/bookings/${booking.id}/passengers`, "PUT", values);
      goto("extras");
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "hold_expired") setExpired(true);
      else toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }, () => {
    toast.error("Please check the highlighted fields");
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
  });

  const fillSaved = (index: number, p: SavedPassenger) => {
    form.setValue(`passengers.${index}.fullName`, p.full_name, { shouldValidate: true });
    form.setValue(`passengers.${index}.phone`, p.phone ?? "");
    form.setValue(`passengers.${index}.email`, p.email ?? "");
    form.setValue(`passengers.${index}.nextOfKinName`, p.next_of_kin_name ?? "");
    form.setValue(`passengers.${index}.nextOfKinPhone`, p.next_of_kin_phone ?? "");
  };

  // ───────── Extras ─────────
  const saveExtras = async (next: { addons?: Partial<Record<AddonCode, number>>; promoCode?: string | null }) => {
    if (!booking) return;
    try {
      const r = await api<{ quote: Quote & { promo?: { code: string; ok: boolean; message: string } }; promoError: string | null }>(`/api/bookings/${booking.id}/extras`, "PUT", next);
      setQuote(r.quote);
      if (next.promoCode !== undefined) {
        if (r.promoError) setPromoState({ ok: false, message: r.promoError });
        else if (next.promoCode) {
          setPromoState({ ok: true, message: `${next.promoCode.toUpperCase()} applied · you save ${formatMoney(r.quote.discount)}` });
          toast.success("Promo code applied", { description: `You save ${formatMoney(r.quote.discount)}` });
        } else setPromoState(null);
      } else if (r.quote.promo && !r.quote.promo.ok) {
        setPromoState({ ok: false, message: r.quote.promo.message });
      }
      return r;
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "hold_expired") setExpired(true);
      else toast.error(err.message);
    }
  };
  const setAddon = (code: AddonCode, qty: number) => {
    const next = { ...addons, [code]: qty };
    setAddons(next);
    void saveExtras({ addons: next });
  };

  // ───────── Pay ─────────
  const [provider, setProvider] = useState<Provider["id"]>(props.providers[0]?.id ?? "demo");
  const [agree, setAgree] = useState(false);
  const pay = async () => {
    if (!booking) return;
    if (!agree) {
      toast.error("Please accept the fare rules and terms to continue");
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ redirectUrl: string }>(`/api/bookings/${booking.id}/pay`, "POST", { provider });
      window.location.href = r.redirectUrl;
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "hold_expired") setExpired(true);
      else toast.error(err.message);
      setBusy(false);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const back = () => {
    if (stepIndex === 0) router.back();
    else goto(STEPS[stepIndex - 1].id);
  };

  const primary = {
    seats: { label: booking ? "Continue" : "Reserve seats & continue", onClick: continueFromSeats, disabled: !allSeatsChosen },
    details: { label: "Continue to extras", onClick: () => submitDetails(), disabled: false },
    extras: { label: "Continue to payment", onClick: () => goto("pay"), disabled: false },
    pay: { label: `Pay ${formatMoney(shownQuote.total)}`, onClick: pay, disabled: false },
  }[step];

  return (
    <div className="pb-40 md:pb-16">
      {/* Top bar: progress + hold timer */}
      <div className="sticky top-14 z-30 border-b border-line bg-white/95 backdrop-blur md:top-16">
        <div className="container-page flex items-center gap-3 py-2.5">
          <button onClick={back} aria-label="Back" className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-surface-2"><ArrowLeft className="h-5 w-5" /></button>
          <ol className="flex flex-1 items-center gap-1.5 sm:gap-3" aria-label="Booking progress">
            {STEPS.map((s, i) => {
              const done = i < stepIndex;
              const current = i === stepIndex;
              return (
                <li key={s.id} className="flex flex-1 items-center gap-2 last:flex-none sm:flex-none" aria-current={current ? "step" : undefined}>
                  <span className={cn("relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors", done ? "bg-navy-600 text-white" : current ? "bg-coral-600 text-white" : "bg-surface-3 text-ink-3")}>
                    {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={cn("hidden text-sm font-medium sm:inline", current ? "text-ink" : "text-ink-3")}>{s.label}</span>
                  {i < STEPS.length - 1 && (
                    <span className="relative h-[2px] flex-1 overflow-hidden rounded bg-surface-3 sm:w-10 sm:flex-none">
                      <motion.span className="absolute inset-y-0 left-0 bg-navy-600" initial={false} animate={{ width: done ? "100%" : "0%" }} transition={{ duration: 0.3 }} />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {left != null && booking && (
            <div role="timer" aria-live={left < 120 ? "assertive" : "off"} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold tabular", left < 120 ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning")}>
              <Clock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Seats held for</span> {formatCountdown(left)}
            </div>
          )}
          <button onClick={() => setHelpOpen(true)} className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-3 hover:bg-surface-2 hover:text-ink md:inline-flex"><HelpCircle className="h-4 w-4" />Help</button>
        </div>
      </div>

      <div className="container-page mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
              {step === "seats" && (
                <section aria-labelledby="seats-h">
                  <h1 id="seats-h" className="text-2xl font-semibold">Choose your seats</h1>
                  <p className="mt-1 text-[15px] text-ink-3">Select {pax} seat{pax > 1 ? "s" : ""}{segments.length > 1 ? " for each journey" : ""}. We&apos;ll hold them for 12 minutes while you finish booking.</p>
                  {segments.length > 1 && (
                    <div className="mt-5 grid grid-cols-2 gap-2" role="tablist" aria-label="Journeys">
                      {segments.map((s, i) => (
                        <button key={s.direction} role="tab" aria-selected={active === i} onClick={() => { setActive(i); setActivePax(Math.max(0, s.seats.findIndex((x) => !x))); }}
                          className={cn("rounded-xl border px-3 py-2.5 text-left transition-colors", active === i ? "border-navy-600 bg-navy-50" : "border-line hover:border-line-strong")}>
                          <span className="flex items-center justify-between text-xs font-medium text-ink-3">{s.direction === "outbound" ? "Outbound" : "Return"}{segmentComplete(s) && <Check className="h-4 w-4 text-success" />}</span>
                          <span className="block truncate text-sm font-semibold">{s.trip.origin.cityName} → {s.trip.destination.cityName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-5 rounded-2xl border border-line bg-white p-4 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <OperatorLogo initials={seg.trip.operator.initials} color={seg.trip.operator.color} size="sm" />
                        <div>
                          <p className="text-sm font-semibold">{seg.trip.operator.name} · {seg.trip.vehicle.typeName}</p>
                          <p className="text-[13px] text-ink-3 tabular">{formatDate(seg.trip.departureAt, seg.trip.tz, "weekday")} · {formatTime(seg.trip.departureAt, seg.trip.tz)} from {seg.trip.origin.terminalName}</p>
                        </div>
                      </div>
                      <Badge tone="navy" className="tabular">{seg.seatMap.available} of {seg.seatMap.capacity} seats free</Badge>
                    </div>
                    {assigned ? (
                      <>
                        {pax > 1 && (
                          <div className="no-scrollbar -mx-1 mt-5 flex gap-2 overflow-x-auto px-1" role="radiogroup" aria-label="Assign seat for">
                            {Array.from({ length: pax }, (_, i) => (
                              <button key={i} role="radio" aria-checked={activePax === i} onClick={() => setActivePax(i)}
                                className={cn("flex h-10 shrink-0 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-sm transition-colors", activePax === i ? "border-coral-600 bg-coral-50 text-ink" : "border-line-strong")}>
                                <span className={cn("grid h-7 w-7 place-items-center rounded-full text-xs font-semibold", seg.seats[i] ? "bg-coral-600 text-white" : "bg-surface-3 text-ink-3")}>{seg.seats[i] || <UserRound className="h-3.5 w-3.5" />}</span>
                                {passengerLabels[i]}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mt-6 overflow-x-auto pb-2"><SeatMap data={seg.seatMap} selected={Array.from({ length: pax }, (_, i) => seg.seats[i] ?? "")} onToggle={toggleSeat} passengerLabels={passengerLabels} /></div>
                        <div className="mt-5 border-t border-line pt-4"><SeatLegend premium={seg.seatMap.premiumSurcharge} /></div>
                      </>
                    ) : (
                      <div className="mt-5 rounded-xl bg-surface-2 p-5">
                        <p className="flex items-center gap-2 font-semibold"><Users className="h-5 w-5 text-navy-600" />Seats are assigned at boarding</p>
                        <p className="mt-1.5 text-[15px] text-ink-3">{seg.trip.operator.name} doesn&apos;t use reserved seat numbers. Your booking guarantees {pax} seat{pax > 1 ? "s" : ""} on this departure; the operator assigns seat numbers when you check in at the terminal.</p>
                        <p className="mt-3 text-sm font-medium text-success tabular">{seg.seatMap.available} seats currently available</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {step === "details" && (
                <form onSubmit={submitDetails} noValidate aria-labelledby="details-h">
                  <h1 id="details-h" className="text-2xl font-semibold">Passenger details</h1>
                  <p className="mt-1 text-[15px] text-ink-3">Enter names exactly as on a valid ID. Operators check IDs at boarding.</p>
                  {!props.user && (
                    <Notice tone="neutral" className="mt-4">
                      Booking as a guest. <Link href={`/signin?next=/book/${booking?.id}?step=details`} className="font-semibold text-coral-700 underline-offset-2 hover:underline">Sign in</Link> to use saved passengers.
                    </Notice>
                  )}
                  <fieldset className="mt-5 rounded-2xl border border-line bg-white p-4 sm:p-6">
                    <legend className="px-1 text-[15px] font-semibold">Contact details</legend>
                    <p className="mb-4 text-[13px] text-ink-3">We&apos;ll send your tickets and trip updates here.</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Full name" htmlFor="c-name" error={errs.contact?.name?.message} className="sm:col-span-2">
                        <Input id="c-name" autoComplete="name" invalid={!!errs.contact?.name} {...form.register("contact.name")} />
                      </Field>
                      <Field label="Email" htmlFor="c-email" error={errs.contact?.email?.message}>
                        <Input id="c-email" type="email" inputMode="email" autoComplete="email" invalid={!!errs.contact?.email} {...form.register("contact.email")} />
                      </Field>
                      <Field label="Phone number" htmlFor="c-phone" error={errs.contact?.phone?.message} hint="Nigerian or international number">
                        <Input id="c-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" invalid={!!errs.contact?.phone} {...form.register("contact.phone")} />
                      </Field>
                    </div>
                  </fieldset>
                  {fields.map((f, i) => {
                    const pe = errs.passengers?.[i];
                    return (
                      <fieldset key={f.id} className="mt-4 rounded-2xl border border-line bg-white p-4 sm:p-6">
                        <legend className="flex items-center gap-2 px-1 text-[15px] font-semibold">
                          Passenger {i + 1}{i === 0 && <Badge tone="navy">Lead passenger</Badge>}
                          {segments.map((s) => s.seats[i] && <Badge key={s.direction} tone="coral">{segments.length > 1 ? (s.direction === "outbound" ? "Out" : "Return") + " " : ""}Seat {s.seats[i]}</Badge>)}
                        </legend>
                        {props.savedPassengers.length > 0 && (
                          <div className="no-scrollbar -mx-1 mb-4 mt-1 flex gap-2 overflow-x-auto px-1">
                            {props.savedPassengers.map((p) => (
                              <button type="button" key={p.id} onClick={() => fillSaved(i, p)} className="h-8 shrink-0 rounded-full border border-line-strong px-3 text-[13px] hover:border-navy-500 hover:bg-navy-50">
                                {p.full_name}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Full name" htmlFor={`p${i}-name`} error={pe?.fullName?.message} className="sm:col-span-2">
                            <Input id={`p${i}-name`} autoComplete={i === 0 ? "name" : "off"} invalid={!!pe?.fullName} {...form.register(`passengers.${i}.fullName`)} />
                          </Field>
                          {i > 0 && (
                            <Field label="Phone number" htmlFor={`p${i}-phone`} error={pe?.phone?.message} optional>
                              <Input id={`p${i}-phone`} type="tel" inputMode="tel" invalid={!!pe?.phone} {...form.register(`passengers.${i}.phone`)} />
                            </Field>
                          )}
                          {i === 0 && (
                            <>
                              <Field label="Emergency contact name" htmlFor={`p${i}-nok`} error={pe?.nextOfKinName?.message} hint="Required by operators for the passenger manifest">
                                <Input id={`p${i}-nok`} invalid={!!pe?.nextOfKinName} {...form.register(`passengers.${i}.nextOfKinName`)} />
                              </Field>
                              <Field label="Emergency contact phone" htmlFor={`p${i}-nokp`} error={pe?.nextOfKinPhone?.message}>
                                <Input id={`p${i}-nokp`} type="tel" inputMode="tel" invalid={!!pe?.nextOfKinPhone} {...form.register(`passengers.${i}.nextOfKinPhone`)} />
                              </Field>
                            </>
                          )}
                        </div>
                      </fieldset>
                    );
                  })}
                  <p className="mt-4 flex items-start gap-2 text-[13px] text-ink-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />We share passenger names and the emergency contact only with your operator, for the manifest. See our <Link href="/legal/privacy" className="underline">privacy notice</Link>.</p>
                  <button type="submit" className="sr-only">Continue</button>
                </form>
              )}

              {step === "extras" && (
                <section aria-labelledby="extras-h">
                  <h1 id="extras-h" className="text-2xl font-semibold">Extras and review</h1>
                  <p className="mt-1 text-[15px] text-ink-3">Optional add-ons. Nothing is pre-selected.</p>
                  <div className="mt-5 space-y-3">
                    <AddonRow icon={<Luggage className="h-5 w-5" />} title={ADDONS.extra_luggage.label} desc={ADDONS.extra_luggage.description} price={`${formatMoney(ADDONS.extra_luggage.price(0))} per bag, per journey`}
                      control={<Qty value={addons.extra_luggage ?? 0} max={addonQuantityLimits("extra_luggage", pax).max} onChange={(q) => setAddon("extra_luggage", q)} label="extra bags" />} />
                    <AddonRow icon={<Shield className="h-5 w-5" />} title={ADDONS.flex_cancel.label} desc={ADDONS.flex_cancel.description} price={`${formatMoney(segments.reduce((a, s) => a + ADDONS.flex_cancel.price(s.trip.fare), 0) * pax)} for ${pax > 1 ? "all passengers" : "this booking"}`}
                      control={<Toggle checked={!!addons.flex_cancel} onChange={(v) => setAddon("flex_cancel", v ? 1 : 0)} label="Add flexible cancellation" />} />
                    {segments.some((s) => s.trip.vehicle.amenities.includes("refreshments")) && (
                      <AddonRow icon={<Coffee className="h-5 w-5" />} title={ADDONS.meal_pack.label} desc={`${ADDONS.meal_pack.description} Provided by ${segments.find((s) => s.trip.vehicle.amenities.includes("refreshments"))!.trip.operator.name}.`} price={`${formatMoney(ADDONS.meal_pack.price(0))} per passenger, per journey`}
                        control={<Toggle checked={!!addons.meal_pack} onChange={(v) => setAddon("meal_pack", v ? 1 : 0)} label="Add meal pack" />} />
                    )}
                  </div>
                  <div className="mt-6 rounded-2xl border border-line bg-white p-4 sm:p-5">
                    <label htmlFor="promo" className="flex items-center gap-2 text-[15px] font-semibold"><Tag className="h-4 w-4 text-coral-600" />Promo code</label>
                    <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!promo.trim()) return; setBusy(true); await saveExtras({ promoCode: promo.trim() }); setBusy(false); }}>
                      <Input id="promo" value={promo} onChange={(e) => { setPromo(e.target.value.toUpperCase()); if (promoState && !promoState.ok) setPromoState(null); }} placeholder="e.g. FIRSTTRIP" className="font-mono uppercase" autoCapitalize="characters" autoComplete="off" invalid={promoState?.ok === false} aria-describedby="promo-msg" disabled={promoState?.ok} />
                      {promoState?.ok ? (
                        <Button type="button" variant="outline" onClick={async () => { setPromo(""); await saveExtras({ promoCode: null }); }}><X className="h-4 w-4" />Remove</Button>
                      ) : (
                        <Button type="submit" variant="navy" loading={busy} disabled={!promo.trim()}>Apply</Button>
                      )}
                    </form>
                    <AnimatePresence>
                      {promoState && (
                        <motion.p id="promo-msg" role="status" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn("mt-2 flex items-center gap-1.5 text-sm", promoState.ok ? "text-success" : "text-danger")}>
                          {promoState.ok ? <Check className="h-4 w-4" /> : <Info className="h-4 w-4" />}{promoState.message}
                        </motion.p>
                      )}
                    </AnimatePresence>
                    <Link href="/offers" target="_blank" className="mt-2 inline-block text-[13px] text-ink-3 underline-offset-2 hover:underline">See available offers</Link>
                  </div>
                  <ReviewTrips segments={segments} booking={booking} />
                </section>
              )}

              {step === "pay" && (
                <section aria-labelledby="pay-h">
                  <h1 id="pay-h" className="text-2xl font-semibold">Payment</h1>
                  <p className="mt-1 text-[15px] text-ink-3">Your booking is confirmed only after we verify your payment with the payment provider.</p>
                  <div className="mt-5 space-y-3" role="radiogroup" aria-label="Payment method">
                    {props.providers.map((p) => (
                      <button key={p.id} type="button" role="radio" aria-checked={provider === p.id} onClick={() => setProvider(p.id)}
                        className={cn("flex w-full items-start gap-4 rounded-2xl border bg-white p-4 text-left transition-colors", provider === p.id ? "border-coral-600 ring-1 ring-coral-600" : "border-line hover:border-line-strong")}>
                        <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", provider === p.id ? "border-coral-600" : "border-line-strong")}>{provider === p.id && <span className="h-2.5 w-2.5 rounded-full bg-coral-600" />}</span>
                        <span className="flex-1">
                          <span className="flex flex-wrap items-center gap-2 font-semibold">{p.id === "demo" ? "Sandbox payment" : p.label}{!p.live && <Badge tone="warning">Demo · no real money</Badge>}</span>
                          <span className="mt-1 block text-sm text-ink-3">{p.id === "demo" ? "Simulates card, bank transfer and USSD payments for testing. You won't be charged." : "Card, bank transfer or USSD. You'll be redirected to complete payment securely."}</span>
                          <span className="mt-3 flex gap-3 text-ink-3"><CreditCard className="h-5 w-5" /><Landmark className="h-5 w-5" /><Smartphone className="h-5 w-5" /></span>
                        </span>
                      </button>
                    ))}
                    {props.providers.length === 0 && <Notice tone="warning" title="Payments unavailable">No payment provider is configured. Please try again later.</Notice>}
                  </div>
                  <label className="mt-5 flex cursor-pointer items-start gap-3 text-[14px]">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-navy-600)]" />
                    <span className="text-ink-2">I accept the operator&apos;s fare rules ({segments.map((s) => s.trip.policy.name).join(" / ")}) and Goroada&apos;s <Link href="/legal/terms" target="_blank" className="underline">terms of service</Link>.</span>
                  </label>
                  <p className="mt-4 flex items-center gap-2 text-[13px] text-ink-3"><Lock className="h-4 w-4" />Payments are processed by licensed providers. Goroada never sees or stores your card details.</p>
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Summary (desktop) */}
        <aside className="hidden lg:block" aria-label="Booking summary">
          <div className="sticky top-36 space-y-4">
            <Summary segments={segments} pax={pax} quote={shownQuote} step={step} />
            <Button size="lg" className="w-full" onClick={primary.onClick} loading={busy}>{primary.label}</Button>
            {step === "seats" && !allSeatsChosen && <p className="text-center text-[13px] text-ink-3">Select {pax} seat{pax > 1 ? "s" : ""} per journey to continue</p>}
            <button onClick={() => setHelpOpen(true)} className="flex w-full items-center justify-center gap-1.5 text-sm text-ink-3 hover:text-ink"><LifeBuoy className="h-4 w-4" />Questions? Get help without leaving checkout</button>
          </div>
        </aside>
      </div>

      {/* Sticky action (mobile/tablet) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-safe shadow-[0_-8px_24px_rgb(16_42_67/0.06)] lg:hidden">
        <div className="container-page flex items-center gap-3 py-3">
          <button onClick={() => setSummaryOpen(true)} className="flex min-w-0 flex-1 flex-col items-start" aria-label="View price breakdown">
            <span className="flex items-center gap-1 text-xs text-ink-3">Total for {pax} <ChevronUp className="h-3.5 w-3.5" /></span>
            <AnimatedAmount value={shownQuote.total} className="text-xl font-semibold" />
          </button>
          <Button size="lg" onClick={primary.onClick} loading={busy} className="flex-[1.4]">{step === "pay" ? "Pay now" : step === "seats" && !booking ? "Continue" : "Continue"}</Button>
        </div>
      </div>
      <Overlay open={summaryOpen} onOpenChange={setSummaryOpen} title="Price breakdown" sheetOnly>
        <Summary segments={segments} pax={pax} quote={shownQuote} step={step} bare />
      </Overlay>

      <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} />

      <Overlay open={expired} onOpenChange={() => {}} title="Your seat reservation expired" size="sm" sheetOnly={false}>
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-warning-bg text-warning"><TimerReset className="h-7 w-7" /></span>
          <p className="mt-4 text-[15px] text-ink-3">We held your seats for 12 minutes so other travellers can book too. Seats may still be available, so start again and we&apos;ll keep the same journey.</p>
          <Button className="mt-5 w-full" size="lg" onClick={() => router.push(props.restartHref)}>Choose seats again</Button>
          <Link href="/" className="mt-3 inline-block text-sm text-ink-3 hover:text-ink">Start a new search</Link>
        </div>
      </Overlay>
    </div>
  );
}

function fromView(b: BookingView) {
  return { fareTotal: b.amounts.fareTotal, seatCharges: b.amounts.seatCharges, addonsTotal: b.amounts.addonsTotal, serviceFee: b.amounts.serviceFee, discount: b.amounts.discount, total: b.amounts.total, discountableSubtotal: b.amounts.fareTotal + b.amounts.seatCharges, addonLines: b.addons.map((a) => ({ code: a.code, label: a.label, quantity: a.quantity, unitPrice: a.unit_price, amount: a.total })) };
}

function parseLayoutPremium(map: SeatMapData, seatNo: string) {
  if (!seatNo) return false;
  let n = 0;
  for (const row of map.spec.rows) for (const ch of row) if (ch === "S" || ch === "P") { n++; if (String(n) === seatNo) return ch === "P"; }
  return false;
}

function idemKey(segments: Segment[], pax: number) {
  const key = `${segments.map((s) => `${s.trip.id}:${s.seats.join(",")}`).join("|")}|${pax}`;
  if (typeof window === "undefined") return key;
  const stored = sessionStorage.getItem(`idem:${key}`);
  if (stored) return stored;
  const v = `${crypto.randomUUID()}`;
  try { sessionStorage.setItem(`idem:${key}`, v); } catch {}
  return v;
}

export function AnimatedAmount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("relative inline-flex overflow-hidden tabular", className)} aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.2 }}>{formatMoney(value)}</motion.span>
      </AnimatePresence>
    </span>
  );
}

function Summary({ segments, pax, quote, step, bare }: { segments: Segment[]; pax: number; quote: Quote; step: Step; bare?: boolean }) {
  const row = "flex items-baseline justify-between gap-4 text-[14px]";
  return (
    <div className={cn(!bare && "rounded-2xl border border-line bg-white p-5")}>
      {!bare && <h2 className="text-[15px] font-semibold">Your trip</h2>}
      <ul className={cn("space-y-3", !bare && "mt-3")}>
        {segments.map((s) => (
          <li key={s.direction} className="rounded-xl bg-surface-2/70 p-3">
            <p className="text-xs font-medium text-ink-3">{s.direction === "outbound" ? "Outbound" : "Return"} · {formatDate(s.trip.departureAt, s.trip.tz, "weekday")}</p>
            <p className="mt-0.5 text-sm font-semibold">{s.trip.origin.cityName} → {s.trip.destination.cityName}</p>
            <p className="text-[13px] text-ink-3 tabular">{formatTime(s.trip.departureAt, s.trip.tz)} – ~{formatTime(s.trip.arrivalEstAt, s.trip.tz)} · {s.trip.operator.name}</p>
            <p className="mt-1 text-[13px] tabular">
              {s.seatMap.seatingMode === "open" ? <span className="text-ink-3">Seats assigned at boarding</span> : s.seats.filter(Boolean).length ? <>Seat{s.seats.filter(Boolean).length > 1 ? "s" : ""} <b>{s.seats.filter(Boolean).join(", ")}</b></> : <span className="text-ink-3">No seats selected yet</span>}
            </p>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-2 border-t border-line pt-4">
        {segments.map((s) => (
          <div key={s.direction} className={row}><dt className="text-ink-3">{segments.length > 1 ? (s.direction === "outbound" ? "Outbound fare" : "Return fare") : "Fare"} × {pax}</dt><dd className="tabular">{formatMoney(s.trip.fare * pax)}</dd></div>
        ))}
        {quote.seatCharges > 0 && <div className={row}><dt className="text-ink-3">Premium seats</dt><dd className="tabular">{formatMoney(quote.seatCharges)}</dd></div>}
        {quote.addonLines.map((l) => <div key={l.code} className={row}><dt className="text-ink-3">{l.label} <span className="text-xs">({l.detail ?? `×${l.quantity}`})</span></dt><dd className="tabular">{formatMoney(l.amount)}</dd></div>)}
        <div className={row}><dt className="text-ink-3">Goroada booking fee</dt><dd className="tabular">{formatMoney(quote.serviceFee)}</dd></div>
        {quote.discount > 0 && <div className={cn(row, "text-success")}><dt>Discount</dt><dd className="tabular">−{formatMoney(quote.discount)}</dd></div>}
        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
          <dt className="font-semibold">Total</dt>
          <dd><AnimatedAmount value={quote.total} className="text-xl font-semibold" /></dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-ink-3">{step === "seats" ? "Includes all fees. Add-ons are optional." : "No hidden charges. This is the amount you'll pay."}</p>
    </div>
  );
}

function ReviewTrips({ segments, booking }: { segments: Segment[]; booking: BookingView | null }) {
  return (
    <div className="mt-6 space-y-3">
      <h2 className="text-[17px] font-semibold">Review your journey{segments.length > 1 ? "s" : ""}</h2>
      {segments.map((s) => (
        <div key={s.direction} className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{s.direction === "outbound" ? "Outbound" : "Return"} · {formatDate(s.trip.departureAt, s.trip.tz, "long")}</p>
            <span className="text-[13px] text-ink-3">{formatDuration(s.trip.durationMin)}</span>
          </div>
          <div className="mt-4"><JourneyLine trip={s.trip} compact /></div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed border-line pt-3 text-[13px] text-ink-3">
            <span>{s.trip.operator.name} · {s.trip.vehicle.model}</span>
            <span>{s.trip.policy.name}: {s.trip.policy.summary}</span>
          </div>
        </div>
      ))}
      {booking && (
        <div className="rounded-2xl border border-line bg-white p-4 text-sm sm:p-5">
          <p className="font-semibold">Passengers</p>
          <ul className="mt-2 space-y-1 text-ink-2">{booking.passengers.map((p) => <li key={p.seq}>{p.seq}. {p.fullName || <span className="text-ink-3">Not entered</span>}</li>)}</ul>
          <p className="mt-3 text-ink-3">Tickets will be sent to {booking.contact.email}.</p>
        </div>
      )}
    </div>
  );
}

function AddonRow({ icon, title, desc, price, control }: { icon: React.ReactNode; title: string; desc: string; price: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-600">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-[13.5px] text-ink-3">{desc}</p>
        <p className="mt-1 text-[13px] font-medium text-ink-2 tabular">{price}</p>
      </div>
      {control}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-navy-600" : "bg-line-strong")}>
      <motion.span className="absolute top-1 h-5 w-5 rounded-full bg-white shadow" animate={{ left: checked ? 24 : 4 }} transition={{ type: "spring", stiffness: 600, damping: 35 }} />
    </button>
  );
}

function Qty({ value, max, onChange, label }: { value: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`Remove one of ${label}`} className="grid h-9 w-9 place-items-center rounded-full border border-line-strong disabled:opacity-30"><Minus className="h-4 w-4" /></button>
      <span className="w-5 text-center font-semibold tabular" aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Add one of ${label}`} className="grid h-9 w-9 place-items-center rounded-full border border-line-strong disabled:opacity-30"><Plus className="h-4 w-4" /></button>
    </div>
  );
}

function HelpSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Overlay open={open} onOpenChange={onOpenChange} title="Help with your booking" description="Your progress is saved while you read.">
      <div className="space-y-4 text-[15px]">
        {[
          ["How long are my seats held?", "12 minutes from when you reserve them. The timer at the top shows the time left. If it runs out, you can pick seats again."],
          ["When am I charged?", "Only when you complete payment with the provider. Your booking is confirmed after we verify the payment."],
          ["What if the payment fails?", "You won't be charged and you can try again while your seats are held. Bank transfers can take a few minutes to confirm."],
          ["Can I change my seat later?", "Seat changes after booking depend on the operator. Contact support from My Trips."],
        ].map(([q, a]) => (
          <div key={q}><p className="font-semibold">{q}</p><p className="mt-1 text-ink-3">{a}</p></div>
        ))}
        <div className="rounded-xl bg-surface-2 p-4">
          <p className="font-semibold">Talk to us</p>
          <p className="mt-2 flex items-center gap-2 text-ink-2"><Phone className="h-4 w-4" />+234 201 000 0000 (demo number)</p>
          <p className="mt-1 flex items-center gap-2 text-ink-2"><Mail className="h-4 w-4" />support@goroada.app</p>
          <Link href="/help/contact" target="_blank" className="mt-3 inline-block text-sm font-semibold text-coral-700">Open a support request in a new tab →</Link>
        </div>
      </div>
    </Overlay>
  );
}
