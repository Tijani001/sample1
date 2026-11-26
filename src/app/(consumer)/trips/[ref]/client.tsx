"use client";
import { useState } from "react";
import { useNow } from "@/hooks/use-now";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { CalendarPlus, Copy, Download, Navigation, Printer, Share2, Radio, Star, XCircle, CalendarClock, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Overlay } from "@/components/ui/overlay";
import { Textarea, Notice } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/money";
import { cn } from "@/lib/cn";

export function CopyRef({ reference }: { reference: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(reference); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 font-mono text-sm hover:bg-surface-3" aria-label={`Copy booking reference ${reference}`}>
      {reference}{done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-ink-3" />}
    </button>
  );
}

export function DepartureCountdown({ iso }: { iso: string }) {
  const now = useNow();
  if (now == null) return null;
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3 text-right">
      <p className="text-xs text-ink-3">Departs in</p>
      <p className="text-xl font-semibold tabular">{d > 0 && `${d}d `}{h}h {m}m</p>
    </div>
  );
}

export function ConfirmedHero({ destination, email, isGuest, sandbox }: { destination: string; email: string | null; isGuest: boolean; sandbox: boolean }) {
  return (
    <section className="border-b border-line bg-[radial-gradient(ellipse_at_top,var(--color-success-bg),transparent_70%)] py-10 text-center no-print">
      <motion.svg viewBox="0 0 52 52" className="mx-auto h-16 w-16" initial="hidden" animate="visible">
        <motion.circle cx="26" cy="26" r="24" fill="none" stroke="var(--color-success)" strokeWidth="3" variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1, transition: { duration: 0.5 } } }} />
        <motion.path d="M15 27l7 7 15-16" fill="none" stroke="var(--color-success)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1, transition: { delay: 0.4, duration: 0.35 } } }} />
      </motion.svg>
      <motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-4 text-2xl font-semibold">You&apos;re going to {destination}!</motion.h2>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }} className="mx-auto mt-1.5 max-w-md px-4 text-base text-ink-3">
        Booking confirmed{email && <> and tickets sent to <b className="text-ink">{email}</b></>}.{sandbox && " (Sandbox payment: no money was charged.)"}
      </motion.p>
      {isGuest && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mx-auto mt-5 flex max-w-md flex-col items-center gap-2 px-4 sm:flex-row sm:justify-center">
          <Button asChild variant="navy" size="sm"><Link href="/register?next=/trips">Create an account</Link></Button>
          <span className="text-sm text-ink-3">to keep all your trips in one place. Optional.</span>
        </motion.div>
      )}
    </section>
  );
}

export function BookingActions({ bookingId, reference, upcoming, terminal }: { bookingId: string; reference: string; upcoming: boolean; terminal: { name: string; lat: number | null; lng: number | null; address: string } }) {
  const [busy, setBusy] = useState(false);
  const share = async () => {
    const url = `${location.origin}/trips/${reference}`;
    const data = { title: `Goroada booking ${reference}`, text: `My Goroada trip ${reference}`, url };
    if (navigator.share) {
      try { await navigator.share(data); } catch {}
    } else {
      await navigator.clipboard?.writeText(url);
      toast.success("Link copied", { description: "Recipients will need to verify the booking email or phone to view it." });
    }
  };
  const track = async () => {
    setBusy(true);
    const res = await fetch(`/api/bookings/${bookingId}/track`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return toast.error(data?.error?.message ?? "Couldn't create a tracking link");
    if (navigator.share) {
      try { await navigator.share({ title: "Follow my Goroada journey", url: data.url }); return; } catch {}
    }
    await navigator.clipboard?.writeText(data.url);
    toast.success("Tracking link copied", { description: `Anyone with the link can follow this journey until ${new Date(data.expiresAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.` });
  };
  const directions = terminal.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${terminal.lat},${terminal.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(terminal.address)}`;
  const item = "flex min-w-[88px] flex-col items-center gap-1.5 rounded-2xl border border-line bg-white px-3 py-3 text-sm font-medium text-ink transition hover:border-line-strong hover:shadow-sm";
  const icon = "grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-navy-600";
  return (
    <div className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 no-print">
      <a href={`/api/bookings/${bookingId}/tickets`} className={item}><span className={icon}><Download className="h-4 w-4" /></span>Download</a>
      <button onClick={share} className={item}><span className={icon}><Share2 className="h-4 w-4" /></span>Share</button>
      <button onClick={() => window.print()} className={item}><span className={icon}><Printer className="h-4 w-4" /></span>Print</button>
      <a href={`/api/bookings/${bookingId}/calendar`} className={item}><span className={icon}><CalendarPlus className="h-4 w-4" /></span>Calendar</a>
      <a href={directions} target="_blank" rel="noopener noreferrer" className={item}><span className={icon}><Navigation className="h-4 w-4" /></span>Directions</a>
      {upcoming && <Link href={`/trips/${reference}/track`} className={item}><span className={icon}><Radio className="h-4 w-4" /></span>Track</Link>}
      {upcoming && <button onClick={track} disabled={busy} className={cn(item, "disabled:opacity-60")}><span className={icon}><Share2 className="h-4 w-4" /></span>Share journey</button>}
    </div>
  );
}

type CancelQuote = { allowed: boolean; reason: string | null; refund: number; lines: { direction: string; label: string; amount: number; pct: number; reason: string }[] };

export function ManageBooking({ bookingId, reference, upcoming, completed, review, allowsReschedule, rebookHref }: {
  bookingId: string; reference: string; upcoming: boolean; completed: boolean; review: { rating: number; comment: string | null } | null; allowsReschedule: boolean; rebookHref: string;
}) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [quote, setQuote] = useState<CancelQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [comment, setComment] = useState(review?.comment ?? "");
  const openCancel = async () => {
    setCancelOpen(true);
    setQuote(null);
    const r = await fetch(`/api/bookings/${bookingId}/cancel`);
    setQuote(await r.json());
  };
  const confirmCancel = async () => {
    setBusy(true);
    const r = await fetch(`/api/bookings/${bookingId}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Cancelled by traveller" }) });
    const data = await r.json();
    setBusy(false);
    if (!r.ok) return toast.error(data?.error?.message ?? "Couldn't cancel");
    toast.success("Booking cancelled", { description: data.refund > 0 ? `Refund of ${formatMoney(data.refund)} requested.` : undefined });
    setCancelOpen(false);
    router.refresh();
  };
  const sendReview = async () => {
    setBusy(true);
    const r = await fetch(`/api/bookings/${bookingId}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, comment }) });
    const data = await r.json();
    setBusy(false);
    if (!r.ok) return toast.error(data?.error?.message ?? "Couldn't save your review");
    toast.success("Thanks for rating your trip");
    router.refresh();
  };
  return (
    <section aria-labelledby="manage-h" className="rounded-2xl border border-line bg-white p-5 sm:p-6 no-print">
      <h2 id="manage-h" className="text-lg font-semibold">Manage booking</h2>
      {completed && (
        <div className="mt-4 rounded-xl bg-surface-2 p-4">
          <p className="font-semibold">{review ? "Your rating" : "How was your trip?"}</p>
          <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className="p-1">
                <Star className={cn("h-7 w-7 transition-colors", n <= rating ? "fill-amber-400 text-amber-400" : "text-line-strong")} />
              </button>
            ))}
          </div>
          <Textarea className="mt-3 min-h-20 bg-white" placeholder="Tell other travellers about the vehicle, punctuality and staff (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} aria-label="Review" />
          <Button className="mt-3" size="sm" variant="navy" disabled={!rating} loading={busy} onClick={sendReview}>{review ? "Update review" : "Submit review"}</Button>
        </div>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {upcoming && <Button variant="outline" onClick={openCancel}><XCircle className="h-4 w-4" />Cancel booking</Button>}
        {upcoming && allowsReschedule && <Button asChild variant="outline"><Link href={`/help/contact?booking=${reference}&topic=reschedule`}><CalendarClock className="h-4 w-4" />Request a date change</Link></Button>}
        <Button asChild variant="outline"><Link href={rebookHref}><RotateCcw className="h-4 w-4" />Book this route again</Link></Button>
      </div>
      <Overlay open={cancelOpen} onOpenChange={setCancelOpen} title="Cancel this booking?" size="sm"
        footer={quote?.allowed ? <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setCancelOpen(false)}>Keep booking</Button><Button variant="primary" className="flex-1" loading={busy} onClick={confirmCancel}>Cancel booking</Button></div> : undefined}>
        {!quote ? <div className="space-y-2 py-4"><div className="skeleton h-4" /><div className="skeleton h-4 w-2/3" /></div> : !quote.allowed ? (
          <Notice tone="warning">{quote.reason}</Notice>
        ) : (
          <div className="space-y-3 text-base">
            {quote.lines.map((l) => (
              <div key={l.direction} className="flex justify-between gap-4 rounded-xl bg-surface-2 p-3">
                <div><p className="font-medium">{l.label}</p><p className="text-sm text-ink-3">{l.reason}</p></div>
                <p className="shrink-0 font-semibold tabular">{formatMoney(l.amount)}</p>
              </div>
            ))}
            <div className="flex justify-between border-t border-line pt-3 font-semibold"><span>Refund</span><span className="tabular">{formatMoney(quote.refund)}</span></div>
            <p className="text-sm text-ink-3">The Goroada booking fee is non-refundable. Refunds go back to your original payment method, usually within 5–10 working days. Your seats will be released.</p>
          </div>
        )}
      </Overlay>
    </section>
  );
}
