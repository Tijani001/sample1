import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock, CreditCard, Info, MapPin, Phone, Building2, ReceiptText, ShieldCheck, Ticket } from "lucide-react";
import { getDb, getSessionUser } from "@/lib/server";
import { canAccessBooking } from "@/lib/auth/session";
import { findBookingIdByReference, getBookingView } from "@/lib/services/bookings";
import { qrSvg } from "@/lib/services/tickets";
import { BoardingPass } from "@/components/ticket/boarding-pass";
import { JourneyLine } from "@/components/trip/trip-card";
import { Badge, Notice, Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { OperatorLogo } from "@/components/operator-badge";
import { JOURNEY_STATUS_META } from "@/lib/domain/status";
import { formatMoney } from "@/lib/domain/money";
import { formatDate, formatTime, nowMs } from "@/lib/domain/time";
import { BookingActions, ConfirmedHero, ManageBooking, DepartureCountdown, CopyRef } from "./client";
import { FindBookingForm } from "../find/form";
import { AutoRefresh } from "../../checkout/return/auto-refresh";

export const metadata: Metadata = { title: "Your trip", robots: { index: false } };

export default async function TripPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ confirmed?: string }> }) {
  const { ref } = await params;
  const { confirmed } = await searchParams;
  const db = await getDb();
  const id = await findBookingIdByReference(db, decodeURIComponent(ref));
  if (!id) notFound();
  const user = await getSessionUser();
  const b = await getBookingView(db, id);
  if (!b) notFound();
  if (!(await canAccessBooking({ id: b.id, userId: b.userId }, user))) {
    return (
      <div className="container-page max-w-lg py-12">
        <h1 className="text-2xl font-semibold">Verify it&apos;s your booking</h1>
        <p className="mt-2 text-base text-ink-3">For your privacy, confirm the email or phone number used for booking {b.reference}.</p>
        <div className="mt-6"><FindBookingForm defaultReference={b.reference} /></div>
      </div>
    );
  }
  const seg0 = b.segments[0];
  const status = seg0.journeyStatus;
  const meta = JOURNEY_STATUS_META[status];
  const isConfirmed = b.status === "confirmed";
  const sandbox = b.paidPayment?.provider === "demo";
  const demo = sandbox || b.segments.some((s) => s.trip.operator.isDemo);
  const qrs: Record<string, string> = {};
  for (const s of b.segments) for (const t of s.tickets) qrs[t.id] = await qrSvg(t.verification_token);
  const now = nowMs();
  const upcoming = isConfirmed && new Date(seg0.trip.departureAt).getTime() > now;
  const completed = isConfirmed && status === "arrived";

  return (
    <div className="pb-16">
      {confirmed && isConfirmed && <ConfirmedHero destination={seg0.trip.destination.cityName} email={b.contact.email} isGuest={!user} sandbox={sandbox} />}
      <div className="container-page mt-6">
        <Link href="/trips" className="text-sm text-ink-3 hover:text-ink">← My Trips</Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={meta.tone === "neutral" ? "neutral" : meta.tone === "danger" ? "danger" : meta.tone === "warning" ? "warning" : meta.tone === "info" ? "info" : "success"}>{meta.label}</Badge>
              {b.tripType === "round_trip" && <Badge tone="navy">Round trip</Badge>}
              {sandbox && <Badge tone="warning">Sandbox payment</Badge>}
            </div>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold sm:text-3xl">{seg0.trip.origin.cityName}<ArrowRight className="h-6 w-6 text-ink-3" />{seg0.trip.destination.cityName}</h1>
            <p className="mt-1 text-base text-ink-3 tabular">{formatDate(seg0.trip.departureAt, seg0.trip.tz, "long")} · {formatTime(seg0.trip.departureAt, seg0.trip.tz)} · {b.passengerCount} passenger{b.passengerCount > 1 ? "s" : ""}</p>
            <CopyRef reference={b.reference} />
          </div>
          {upcoming && <DepartureCountdown iso={seg0.trip.departureAt} />}
        </div>

        {b.status === "awaiting_payment" && <Notice tone="warning" className="mt-5" title="Payment not completed" action={<Button asChild size="sm"><Link href={`/book/${b.id}?step=pay`}>Complete payment</Link></Button>}>Your seats are held until {formatTime(b.holdExpiresAt)}. The booking is confirmed once payment is verified.</Notice>}
        {b.status === "payment_processing" && <Notice tone="info" className="mt-5" title="Payment processing">We&apos;re waiting for your bank to confirm. Your seats remain reserved. <AutoRefresh seconds={8} /></Notice>}
        {b.status === "expired" && <Notice tone="neutral" className="mt-5" title="Reservation expired">This booking wasn&apos;t paid in time and the seats were released. You were not charged.</Notice>}
        {b.status === "needs_reconciliation" && <Notice tone="warning" className="mt-5" title="We're reviewing this booking">Your payment arrived after your seats were released. {b.refunds[0] ? `A refund of ${formatMoney(b.refunds[0].amount)} is ${b.refunds[0].status}.` : "Our team will contact you."}</Notice>}
        {(b.status === "refund_pending" || b.status === "refunded" || b.status === "cancelled") && (
          <Notice tone={b.status === "refunded" ? "success" : "neutral"} className="mt-5" title={b.status === "refunded" ? "Refund sent" : b.status === "refund_pending" ? "Refund in progress" : "Booking cancelled"}>
            {b.refunds[0] ? <>Refund of <b className="tabular">{formatMoney(b.refunds[0].amount)}</b> · {b.refunds[0].status === "processed" ? `processed ${formatDate(b.refunds[0].processed_at!)}` : "usually reaches your account in 5–10 working days"}.</> : "No refund was due under the fare rules."}
            {b.cancelReason && <> Reason: {b.cancelReason}.</>}
          </Notice>
        )}

        {isConfirmed && (
          <BookingActions bookingId={b.id} reference={b.reference} upcoming={upcoming}
            terminal={{ name: seg0.trip.origin.terminalName, lat: seg0.trip.origin.lat, lng: seg0.trip.origin.lng, address: seg0.trip.origin.address }} />
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-8">
            {isConfirmed && b.segments.map((s) => (
              <section key={s.id} aria-labelledby={`tickets-${s.direction}`}>
                <h2 id={`tickets-${s.direction}`} className="flex items-center gap-2 text-lg font-semibold"><Ticket className="h-5 w-5 text-coral-600" />{b.segments.length > 1 ? (s.direction === "outbound" ? "Outbound tickets" : "Return tickets") : `Ticket${s.tickets.length > 1 ? "s" : ""}`}</h2>
                <div className="no-scrollbar -mx-4 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
                  {s.tickets.map((t) => (
                    <div key={t.id} className="w-[88%] max-w-[420px] shrink-0 snap-center sm:w-auto">
                      <BoardingPass trip={s.trip} direction={s.direction} passenger={b.passengers.find((p) => p.seq === t.passenger_seq)?.fullName ?? ""} seat={s.seats.find((x) => x.passengerSeq === t.passenger_seq)?.seatNo ?? null}
                        ticketNo={t.ticket_no} reference={b.reference} qr={qrs[t.id]} status={t.status} demo={demo} />
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {b.segments.map((s) => (
              <Card as="section" key={`d-${s.id}`} className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <OperatorLogo initials={s.trip.operator.initials} color={s.trip.operator.color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-ink-3">{s.direction === "outbound" ? "Outbound" : "Return"} · {formatDate(s.trip.departureAt, s.trip.tz, "long")}</p>
                    <p className="font-semibold">{s.trip.operator.name} · {s.trip.vehicle.model}</p>
                  </div>
                  <Link href={`/trip/${s.trip.id}`} className="hidden text-sm font-semibold text-coral-700 sm:block">Trip details</Link>
                </div>
                <div className="mt-5"><JourneyLine trip={s.trip} /></div>
                <div className="mt-5 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-2">
                  <div className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" /><div><p className="font-medium">{s.trip.origin.terminalName}</p><p className="text-ink-3">{s.trip.origin.address}</p></div></div>
                  <div className="flex gap-3"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" /><div><p className="font-medium">Boarding</p><p className="text-ink-3">Check in at the operator desk from {formatTime(new Date(new Date(s.trip.departureAt).getTime() - 45 * 60000), s.trip.tz)}. Departure is at {formatTime(s.trip.departureAt, s.trip.tz)}.</p></div></div>
                  <div className="flex gap-3"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" /><div><p className="font-medium">Operator contact</p><p className="text-ink-3">{s.trip.operator.name} support line (demo)</p></div></div>
                  <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" /><div><p className="font-medium">{s.trip.policy.name} fare</p><p className="text-ink-3">{s.trip.policy.summary}</p></div></div>
                </div>
              </Card>
            ))}

            {isConfirmed && (
              <ManageBooking bookingId={b.id} reference={b.reference} upcoming={upcoming} completed={completed} review={b.review}
                allowsReschedule={seg0.trip.policy.allowsReschedule} rebookHref={`/search?from=${seg0.trip.origin.cityId}&to=${seg0.trip.destination.cityId}&date=${new Date(now + 86400000).toISOString().slice(0, 10)}&pax=${b.passengerCount}`} />
            )}
          </div>

          <aside className="space-y-4">
            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold"><ReceiptText className="h-4 w-4 text-ink-3" />Payment summary</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink-3">Fares</dt><dd className="tabular">{formatMoney(b.amounts.fareTotal)}</dd></div>
                {b.amounts.seatCharges > 0 && <div className="flex justify-between"><dt className="text-ink-3">Premium seats</dt><dd className="tabular">{formatMoney(b.amounts.seatCharges)}</dd></div>}
                {b.addons.map((a) => <div key={a.code} className="flex justify-between"><dt className="text-ink-3">{a.label}</dt><dd className="tabular">{formatMoney(a.total)}</dd></div>)}
                <div className="flex justify-between"><dt className="text-ink-3">Booking fee</dt><dd className="tabular">{formatMoney(b.amounts.serviceFee)}</dd></div>
                {b.amounts.discount > 0 && <div className="flex justify-between text-success"><dt>Discount {b.promoCode && `(${b.promoCode})`}</dt><dd className="tabular">−{formatMoney(b.amounts.discount)}</dd></div>}
                <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Total</dt><dd className="tabular">{formatMoney(b.amounts.total)}</dd></div>
              </dl>
              {b.paidPayment && (
                <p className="mt-3 flex items-center gap-2 text-sm text-ink-3"><CreditCard className="h-4 w-4" />{b.paidPayment.provider === "demo" ? "Sandbox" : b.paidPayment.provider} · {b.paidPayment.channel?.replace("_", " ") ?? "card"} · verified {b.paidPayment.verifiedAt && formatDate(b.paidPayment.verifiedAt)}</p>
              )}
            </Card>
            <Card className="p-5">
              <h2 className="text-base font-semibold">Passengers</h2>
              <ul className="mt-3 space-y-2.5 text-sm">
                {b.passengers.map((p) => (
                  <li key={p.seq} className="flex justify-between gap-3">
                    <span className="truncate">{p.fullName}</span>
                    <span className="shrink-0 text-ink-3 tabular">{b.segments.map((s) => s.seats.find((x) => x.passengerSeq === p.seq)?.seatNo).filter(Boolean).map((x) => `Seat ${x}`).join(" · ")}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-ink-3">Contact: {b.contact.email}</p>
            </Card>
            <Card className="p-5 text-sm">
              <h2 className="text-base font-semibold">Need help?</h2>
              <p className="mt-1 text-ink-3">Goroada support can help with changes, refunds and anything on the road.</p>
              <div className="mt-3 flex flex-col gap-2">
                <Button asChild variant="outline" size="sm"><Link href={`/help/contact?booking=${b.reference}`}>Contact Goroada support</Link></Button>
                <Button asChild variant="ghost" size="sm"><Link href={`/operators/${seg0.trip.operator.id}`}><Building2 className="h-4 w-4" />About {seg0.trip.operator.name}</Link></Button>
              </div>
            </Card>
            {demo && <p className="flex gap-2 px-1 text-xs text-ink-3"><Info className="h-3.5 w-3.5 shrink-0" />Demonstration booking: operator, schedule and payment are not real.</p>}
          </aside>
        </div>
      </div>
    </div>
  );
}
