import { Logo } from "@/components/brand/logo";
import { formatDate, formatTime, dayOffsetLabel } from "@/lib/domain/time";
import type { TripResult } from "@/lib/services/search";
import { cn } from "@/lib/cn";

/** Airline-style boarding pass adapted for road travel. */
export function BoardingPass({ trip, passenger, seat, ticketNo, reference, qr, status, direction, demo }: {
  trip: TripResult; passenger: string; seat: string | null; ticketNo: string; reference: string; qr: string; status: string; direction: "outbound" | "return"; demo: boolean;
}) {
  const boarded = status === "boarded";
  const voided = status === "void";
  const plus = dayOffsetLabel(new Date(trip.departureAt), new Date(trip.arrivalEstAt), trip.tz);
  return (
    <article className={cn("relative w-full overflow-hidden rounded-[22px] border border-line bg-white shadow-md print:break-inside-avoid print:shadow-none", voided && "opacity-60")} aria-label={`Ticket for ${passenger}`}>
      <header className="flex items-center justify-between bg-navy-600 px-5 py-3.5 text-white">
        <Logo inverted height={24} />
        <span className="text-right text-xs font-medium uppercase tracking-[0.14em] text-white/80">
          Boarding pass<br /><span className="text-white">{direction === "outbound" ? "Outbound" : "Return"}</span>
        </span>
      </header>
      <div className="px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[26px] font-semibold leading-none tracking-tight">{trip.origin.cityName}</p>
            <p className="mt-1.5 truncate text-sm text-ink-3">{trip.origin.terminalName}</p>
          </div>
          <svg viewBox="0 0 60 12" className="mt-2 h-3 w-14 shrink-0 text-coral-500" aria-hidden><path d="M0 6h52" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" /><path d="m50 1 6 5-6 5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          <div className="min-w-0 text-right">
            <p className="text-[26px] font-semibold leading-none tracking-tight">{trip.destination.cityName}</p>
            <p className="mt-1.5 truncate text-sm text-ink-3">{trip.destination.terminalName}</p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-x-3 gap-y-4 text-sm">
          <div className="col-span-2"><dt className="text-xs uppercase tracking-wide text-ink-3">Passenger</dt><dd className="mt-0.5 truncate text-base font-semibold">{passenger}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-ink-3">Seat</dt><dd className="mt-0.5 text-base font-semibold tabular">{trip.seatingMode === "open" ? "At boarding" : seat ?? "—"}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-ink-3">Date</dt><dd className="mt-0.5 text-base font-semibold tabular">{formatDate(trip.departureAt, trip.tz, "weekday")}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-ink-3">Departs</dt><dd className="mt-0.5 text-base font-semibold tabular">{formatTime(trip.departureAt, trip.tz)}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-ink-3">Arrives (est.)</dt><dd className="mt-0.5 text-base font-semibold tabular">~{formatTime(trip.arrivalEstAt, trip.tz)}{plus && <sup className="text-[10px] text-coral-700">{plus}</sup>}</dd></div>
          <div className="col-span-2"><dt className="text-xs uppercase tracking-wide text-ink-3">Operator</dt><dd className="mt-0.5 truncate font-medium">{trip.operator.name} · {trip.vehicle.typeName}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-ink-3">Booking</dt><dd className="mt-0.5 font-mono font-medium">{reference}</dd></div>
        </dl>
      </div>
      <div className="relative my-5 h-0 border-t-2 border-dashed border-line" aria-hidden>
        <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full border border-line bg-surface-2" />
        <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full border border-line bg-surface-2" />
      </div>
      <div className="flex items-center gap-5 px-5 pb-5">
        <div className={cn("relative h-[132px] w-[132px] shrink-0 rounded-xl bg-white p-1.5 ring-1 ring-line", (boarded || voided) && "opacity-30")}>
          <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label={`QR code for ticket ${ticketNo}`} />
        </div>
        <div className="min-w-0 text-sm">
          {voided ? <p className="font-semibold text-danger">Cancelled ticket</p> : boarded ? <p className="font-semibold text-info">Boarded</p> : <p className="font-semibold text-success">Valid for boarding</p>}
          <p className="mt-1 font-mono text-ink-2">{ticketNo}</p>
          <p className="mt-2 text-ink-3">Show this code at the {trip.operator.name} desk. Arrive 45 minutes early with a valid photo ID.</p>
          {demo && <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-coral-700">Demo ticket · not valid for travel</p>}
        </div>
      </div>
    </article>
  );
}
