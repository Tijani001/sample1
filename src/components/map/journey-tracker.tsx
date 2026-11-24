import { AlertTriangle, CheckCircle2, Circle, Clock, Phone, Radio, ShieldAlert } from "lucide-react";
import type { JourneyState } from "@/lib/services/journey";
import { RouteMap } from "./route-map";
import { formatTime, formatDate } from "@/lib/domain/time";
import { Badge, Notice } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const STATUS_LABEL: Record<string, string> = { scheduled: "Scheduled", boarding: "Boarding", departed: "Departed", in_transit: "In transit", delayed: "Delayed", arrived: "Arrived", cancelled: "Cancelled" };

export function JourneyTracker({ state, shared }: { state: JourneyState; shared?: boolean }) {
  const { trip } = state;
  const tz = trip.tz;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <RouteMap className="aspect-[16/10]" origin={{ name: trip.origin.cityName, lat: trip.origin.lat ?? 0, lng: trip.origin.lng ?? 0 }} destination={{ name: trip.destination.cityName, lat: trip.destination.lat ?? 0, lng: trip.destination.lng ?? 0 }} stops={state.stops} estimate={state.estimateProgress} />
        {!state.hasLiveGps && (
          <Notice tone="neutral" title="Live GPS isn't available for this vehicle">
            You&apos;re seeing the latest status reported by {trip.operator.name}{state.estimateProgress != null ? ", plus an estimated position calculated from the schedule" : ""}. We never show simulated GPS as live tracking.
          </Notice>
        )}
      </div>
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <Badge tone={trip.status === "delayed" ? "warning" : trip.status === "cancelled" ? "danger" : trip.status === "arrived" ? "neutral" : "info"} icon={<Radio className="h-3 w-3" />}>{STATUS_LABEL[trip.status] ?? trip.status}</Badge>
            <span className="text-xs text-ink-3">{state.lastUpdate ? `Updated ${formatTime(state.lastUpdate, tz)}, ${formatDate(state.lastUpdate, tz, "weekday")}` : "No operator updates yet"}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-ink-3">Departure (scheduled)</p><p className="text-xl font-semibold tabular">{formatTime(trip.departureAt, tz)}</p><p className="truncate text-[13px] text-ink-3">{trip.origin.terminalName}</p></div>
            <div className="text-right"><p className="text-xs text-ink-3">Arrival ({state.etaSource === "operator" ? "operator estimate" : "scheduled estimate"})</p><p className={cn("text-xl font-semibold tabular", trip.status === "delayed" && "text-warning")}>~{formatTime(state.eta, tz)}</p><p className="truncate text-[13px] text-ink-3">{trip.destination.terminalName}</p></div>
          </div>
          {trip.status === "delayed" && <p className="mt-3 flex items-center gap-2 rounded-lg bg-warning-bg px-3 py-2 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" />Delayed by about {trip.delayMin} minutes, as reported by the operator.</p>}
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="text-sm font-semibold">Journey progress</h3>
          <ol className="mt-4">
            {state.timeline.map((t, i) => (
              <li key={t.key} className="relative flex gap-3 pb-5 last:pb-0">
                {i < state.timeline.length - 1 && <span className={cn("absolute left-[9px] top-5 h-full w-[2px]", t.state === "done" ? "bg-navy-600" : "bg-line")} aria-hidden />}
                {t.state === "done" ? <CheckCircle2 className="relative h-5 w-5 shrink-0 fill-navy-600 text-white" /> : t.state === "current" ? <span className="relative grid h-5 w-5 place-items-center"><span className="absolute h-5 w-5 animate-ping rounded-full bg-coral-400 opacity-40" /><span className="h-3 w-3 rounded-full bg-coral-600" /></span> : <Circle className="h-5 w-5 shrink-0 text-line-strong" />}
                <div className="-mt-0.5">
                  <p className={cn("text-[15px] font-medium", t.state === "upcoming" && "text-ink-3")}>{t.label}</p>
                  {t.time && <p className="text-xs text-ink-3 tabular">{formatTime(t.time, tz)} · {formatDate(t.time, tz, "weekday")}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
        {state.events.length > 0 && (
          <div className="rounded-2xl border border-line bg-white p-5">
            <h3 className="text-sm font-semibold">Operator updates</h3>
            <ul className="mt-3 space-y-3">
              {state.events.slice(0, 6).map((e) => (
                <li key={e.id} className="text-[14px]"><p className="text-ink">{e.message}</p><p className="text-xs text-ink-3">{formatTime(e.createdAt, tz)} · {e.source === "gps" ? "GPS" : "Reported by operator"}</p></li>
              ))}
            </ul>
          </div>
        )}
        <div className="rounded-2xl border border-danger-line bg-danger-bg/50 p-5 text-[14px]">
          <h3 className="flex items-center gap-2 font-semibold text-red-900"><ShieldAlert className="h-4 w-4" />Emergency</h3>
          <p className="mt-1 text-red-900/80">In an emergency call <a href="tel:112" className="font-semibold underline">112</a> (Nigeria emergency number).</p>
          {!shared && <p className="mt-2 flex items-center gap-2 text-red-900/80"><Phone className="h-4 w-4" />Goroada support: +234 201 000 0000 (demo)</p>}
          <p className="mt-2 flex items-center gap-2 text-xs text-red-900/70"><Clock className="h-3.5 w-3.5" />Times are shown in Nigeria time (WAT).</p>
        </div>
      </div>
    </div>
  );
}
