import type { Db } from "@/lib/db/client";
import { getTrip, type TripResult } from "./search";

export type JourneyEvent = { id: string; kind: string; status: string | null; message: string; eta: string | null; source: string; createdAt: string; lat: number | null; lng: number | null };

export type JourneyState = {
  trip: TripResult;
  events: JourneyEvent[];
  eta: string;
  etaSource: "operator" | "schedule";
  lastUpdate: string | null;
  hasLiveGps: boolean;
  gps: { lat: number; lng: number; at: string } | null;
  estimateProgress: number | null;
  stops: { name: string; lat: number; lng: number }[];
  timeline: { key: string; label: string; state: "done" | "current" | "upcoming"; time: string | null }[];
};

export async function getJourneyState(db: Db, tripId: string, bookingConfirmedAt: string | null): Promise<JourneyState | null> {
  const trip = await getTrip(db, tripId);
  if (!trip) return null;
  const rows = await db.query<{ id: string; kind: string; status: string | null; message: string; eta: Date | null; source: string; created_at: Date; lat: number | null; lng: number | null }>(
    `select id, kind, status, message, eta, source, created_at, lat, lng from journey_events where trip_id = $1 order by created_at desc limit 50`, [tripId]);
  const events = rows.map((r) => ({ id: r.id, kind: r.kind, status: r.status, message: r.message, eta: r.eta ? new Date(r.eta).toISOString() : null, source: r.source, createdAt: new Date(r.created_at).toISOString(), lat: r.lat, lng: r.lng }));
  const etaEvent = events.find((e) => e.eta);
  const baseEta = new Date(new Date(trip.arrivalEstAt).getTime() + trip.delayMin * 60000).toISOString();
  const gpsEvent = events.find((e) => e.source === "gps" && e.lat != null);
  const stopsRaw = await db.query<{ name: string; lat: number | null; lng: number | null }>(
    `select rs.name, c.lat, c.lng from route_stops rs left join cities c on c.id = rs.city_id where rs.route_id = $1 order by rs.seq`, [trip.routeId]);
  const s = trip.status;
  const now = Date.now();
  const dep = new Date(trip.departureAt).getTime();
  const arr = new Date(etaEvent?.eta ?? baseEta).getTime();
  const inMotion = ["departed", "in_transit", "delayed"].includes(s) && now > dep;
  const estimateProgress = inMotion && !gpsEvent ? Math.min(0.97, Math.max(0.02, (now - dep) / (arr - dep))) : null;
  const evTime = (st: string) => events.filter((e) => e.status === st).at(-1)?.createdAt ?? null;
  const order = ["confirmed", "boarding", "departed", "in_transit", "arrived"];
  const currentIdx = s === "arrived" ? 4 : s === "in_transit" || s === "delayed" && evTime("departed") ? 3 : s === "departed" ? 2 : s === "boarding" ? 1 : 0;
  const labels: Record<string, string> = { confirmed: "Booking confirmed", boarding: "Boarding", departed: "Departed", in_transit: "In transit", arrived: "Arrived" };
  const timeline = order.map((k, i) => ({
    key: k, label: labels[k],
    state: (i < currentIdx ? "done" : i === currentIdx ? (k === "arrived" || k === "confirmed" ? "done" : "current") : "upcoming") as "done" | "current" | "upcoming",
    time: k === "confirmed" ? bookingConfirmedAt : evTime(k),
  }));
  return {
    trip, events, eta: etaEvent?.eta ?? baseEta, etaSource: etaEvent ? "operator" : "schedule",
    lastUpdate: events[0]?.createdAt ?? null, hasLiveGps: !!gpsEvent,
    gps: gpsEvent ? { lat: gpsEvent.lat!, lng: gpsEvent.lng!, at: gpsEvent.createdAt } : null,
    estimateProgress,
    stops: stopsRaw.filter((x) => x.lat != null).map((x) => ({ name: x.name, lat: x.lat!, lng: x.lng! })),
    timeline,
  };
}
