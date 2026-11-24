import type { Db } from "@/lib/db/client";
import { addDaysIso, todayIso } from "@/lib/domain/time";
import { ensureTrips, SALES_CUTOFF_MINUTES } from "./inventory";

export type Place = {
  id: string;
  kind: "city" | "terminal";
  cityId: string;
  name: string;
  cityName: string;
  region: string;
  address?: string;
  popularity: number;
};

export async function listPlaces(db: Db): Promise<Place[]> {
  const cities = await db.query<{ id: string; name: string; region: string; popularity: number }>(
    `select c.id, c.name, r.name region, c.popularity from cities c join regions r on r.id = c.region_id order by c.popularity desc`,
  );
  const terminals = await db.query<{ id: string; name: string; city_id: string; city_name: string; region: string; address: string; popularity: number }>(
    `select t.id, t.name, t.city_id, c.name city_name, r.name region, t.address, c.popularity
       from terminals t join cities c on c.id = t.city_id join regions r on r.id = c.region_id
      order by c.popularity desc, t.name`,
  );
  return [
    ...cities.map((c) => ({ id: c.id, kind: "city" as const, cityId: c.id, name: c.name, cityName: c.name, region: c.region, popularity: c.popularity })),
    ...terminals.map((t) => ({ id: t.id, kind: "terminal" as const, cityId: t.city_id, name: t.name, cityName: t.city_name, region: t.region, address: t.address, popularity: t.popularity })),
  ];
}

export type TripResult = {
  id: string;
  serviceDate: string;
  operator: { id: string; name: string; initials: string; color: string; rating: number | null; ratingCount: number; verified: boolean; isDemo: boolean };
  vehicle: { model: string; typeName: string; category: string; amenities: string[] };
  seatingMode: "assigned" | "open";
  departureAt: string;
  arrivalEstAt: string;
  durationMin: number;
  tz: string;
  origin: { cityId: string; cityName: string; terminalId: string; terminalName: string; address: string; lat: number | null; lng: number | null };
  destination: { cityId: string; cityName: string; terminalId: string; terminalName: string; address: string; lat: number | null; lng: number | null };
  stops: { name: string; kind: string; offsetMin: number; dwellMin: number }[];
  direct: boolean;
  fare: number;
  currency: string;
  seatsLeft: number;
  capacity: number;
  premiumSurcharge: number;
  policy: { id: string; name: string; summary: string; refundable: boolean; allowsReschedule: boolean; rescheduleFee: number; rules: { hours_before: number; refund_pct: number }[] };
  status: string;
  delayMin: number;
  bookable: boolean;
  routeId: string;
  distanceKm: number;
};

type TripRow = {
  id: string; service_date: string; departure_at: Date; arrival_est_at: Date; base_fare: number; currency: string; capacity: number; seating_mode: string;
  status: string; delay_min: number; route_id: string; distance_km: number; duration_min: number;
  op_id: string; op_name: string; op_initials: string; op_color: string; op_rating: string | null; op_rating_count: number; op_status: string; op_demo: boolean;
  v_model: string; vt_name: string; vt_category: string; amenities: string[]; premium_surcharge: number;
  o_city: string; o_city_name: string; o_term: string; o_term_name: string; o_addr: string; o_lat: number | null; o_lng: number | null; tz: string;
  d_city: string; d_city_name: string; d_term: string; d_term_name: string; d_addr: string; d_lat: number | null; d_lng: number | null;
  cp_id: string; cp_name: string; cp_summary: string; cp_refundable: boolean; cp_resched: boolean; cp_fee: number; cp_rules: { hours_before: number; refund_pct: number }[];
  seats_taken: number;
};

const TRIP_SELECT = `
  select t.id, to_char(t.service_date,'YYYY-MM-DD') service_date, t.departure_at, t.arrival_est_at, t.base_fare, t.currency, t.capacity, t.seating_mode,
         t.status, t.delay_min, r.id route_id, r.distance_km, r.duration_min,
         o.id op_id, o.name op_name, o.initials op_initials, o.brand_color op_color, o.rating_avg op_rating, o.rating_count op_rating_count, o.status op_status, o.is_demo op_demo,
         v.model v_model, vt.name vt_name, vt.category vt_category, v.amenities, l.premium_surcharge,
         oc.id o_city, oc.name o_city_name, ot.id o_term, ot.name o_term_name, ot.address o_addr, ot.lat o_lat, ot.lng o_lng, oc.tz,
         dc.id d_city, dc.name d_city_name, dt.id d_term, dt.name d_term_name, dt.address d_addr, dt.lat d_lat, dt.lng d_lng,
         cp.id cp_id, cp.name cp_name, cp.summary cp_summary, cp.refundable cp_refundable, cp.allows_reschedule cp_resched, cp.reschedule_fee cp_fee, cp.rules cp_rules,
         (select count(*) from seat_inventory si where si.trip_id = t.id and (si.status <> 'held' or si.held_until > now()))::int seats_taken
    from trips t
    join routes r on r.id = t.route_id
    join operators o on o.id = t.operator_id
    join vehicles v on v.id = t.vehicle_id
    join vehicle_types vt on vt.id = v.vehicle_type_id
    join vehicle_layouts l on l.id = t.layout_id
    join cities oc on oc.id = r.origin_city_id
    join cities dc on dc.id = r.destination_city_id
    join terminals ot on ot.id = r.origin_terminal_id
    join terminals dt on dt.id = r.destination_terminal_id
    left join schedules s on s.id = t.schedule_id
    left join cancellation_policies cp on cp.id = coalesce(s.cancellation_policy_id, 'standard')`;

async function attachStops(db: Db, rows: TripRow[]): Promise<TripResult[]> {
  const routeIds = [...new Set(rows.map((r) => r.route_id))];
  const stops = routeIds.length
    ? await db.query<{ route_id: string; name: string; kind: string; offset_min: number; dwell_min: number }>(
        `select route_id, name, kind, offset_min, dwell_min from route_stops where route_id = any($1::text[]) order by route_id, seq`,
        [routeIds],
      )
    : [];
  const cutoff = Date.now() + SALES_CUTOFF_MINUTES * 60_000;
  return rows.map((r) => {
    const s = stops.filter((x) => x.route_id === r.route_id).map((x) => ({ name: x.name, kind: x.kind, offsetMin: x.offset_min, dwellMin: x.dwell_min }));
    const seatsLeft = Math.max(0, r.capacity - r.seats_taken);
    const departure = new Date(r.departure_at);
    return {
      id: r.id,
      serviceDate: r.service_date,
      routeId: r.route_id,
      distanceKm: r.distance_km,
      operator: { id: r.op_id, name: r.op_name, initials: r.op_initials, color: r.op_color, rating: r.op_rating ? Number(r.op_rating) : null, ratingCount: r.op_rating_count, verified: r.op_status === "verified", isDemo: r.op_demo },
      vehicle: { model: r.v_model, typeName: r.vt_name, category: r.vt_category, amenities: r.amenities ?? [] },
      seatingMode: r.seating_mode as "assigned" | "open",
      departureAt: departure.toISOString(),
      arrivalEstAt: new Date(r.arrival_est_at).toISOString(),
      durationMin: Math.round((new Date(r.arrival_est_at).getTime() - departure.getTime()) / 60000),
      tz: r.tz,
      origin: { cityId: r.o_city, cityName: r.o_city_name, terminalId: r.o_term, terminalName: r.o_term_name, address: r.o_addr, lat: r.o_lat, lng: r.o_lng },
      destination: { cityId: r.d_city, cityName: r.d_city_name, terminalId: r.d_term, terminalName: r.d_term_name, address: r.d_addr, lat: r.d_lat, lng: r.d_lng },
      stops: s,
      direct: !s.some((x) => x.kind === "pickup"),
      fare: r.base_fare,
      currency: r.currency,
      seatsLeft,
      capacity: r.capacity,
      premiumSurcharge: r.premium_surcharge,
      policy: { id: r.cp_id, name: r.cp_name, summary: r.cp_summary, refundable: r.cp_refundable, allowsReschedule: r.cp_resched, rescheduleFee: r.cp_fee, rules: r.cp_rules },
      status: r.status,
      delayMin: r.delay_min,
      bookable: r.op_status === "verified" && !["cancelled", "departed", "in_transit", "arrived"].includes(r.status) && departure.getTime() > cutoff && seatsLeft > 0,
    };
  });
}

export async function searchTrips(db: Db, args: { from: string; to: string; date: string }) {
  await ensureTrips(db, [args.date]);
  const rows = await db.query<TripRow>(
    `${TRIP_SELECT}
      where r.origin_city_id = $1 and r.destination_city_id = $2 and t.service_date = $3::date
        and o.status = 'verified' and t.status <> 'cancelled'
      order by t.departure_at`,
    [args.from, args.to, args.date],
  );
  const trips = await attachStops(db, rows);
  // Hide departures that have already left; keep sold-out trips so travellers see the full picture.
  return trips.filter((t) => new Date(t.departureAt).getTime() > Date.now() - 5 * 60_000 || t.serviceDate > todayIso(t.tz));
}

export async function getTrip(db: Db, tripId: string): Promise<TripResult | null> {
  if (!/^[0-9a-f-]{36}$/i.test(tripId)) return null;
  const rows = await db.query<TripRow>(`${TRIP_SELECT} where t.id = $1`, [tripId]);
  const [trip] = await attachStops(db, rows);
  return trip ?? null;
}

/** Lowest available fare per day around `date` for the interactive date strip. */
export async function fareCalendar(db: Db, args: { from: string; to: string; date: string; before?: number; after?: number }) {
  const today = todayIso();
  const dates: string[] = [];
  for (let i = -(args.before ?? 3); i <= (args.after ?? 10); i++) {
    const d = addDaysIso(args.date, i);
    if (d >= today && d <= addDaysIso(today, 120)) dates.push(d);
  }
  await ensureTrips(db, dates);
  const rows = await db.query<{ d: string; min_fare: number | null; trips: number }>(
    `select to_char(t.service_date,'YYYY-MM-DD') d, min(t.base_fare) filter (where t.capacity > (select count(*) from seat_inventory si where si.trip_id = t.id and (si.status <> 'held' or si.held_until > now())) and t.departure_at > now() + interval '${SALES_CUTOFF_MINUTES} minutes')::int min_fare, count(*)::int trips
       from trips t join routes r on r.id = t.route_id join operators o on o.id = t.operator_id
      where r.origin_city_id = $1 and r.destination_city_id = $2 and t.service_date = any($3::date[]) and o.status = 'verified' and t.status <> 'cancelled'
      group by t.service_date`,
    [args.from, args.to, dates],
  );
  return dates.map((d) => {
    const r = rows.find((x) => x.d === d);
    return { date: d, minFare: r?.min_fare ?? null, trips: r?.trips ?? 0 };
  });
}

export type RouteSummary = {
  from: string; fromName: string; to: string; toName: string; minFare: number; minDuration: number; operators: number; operatorNames: string[];
  image: string | null; distanceKm: number;
};

export async function routeSummaries(db: Db, pairs?: [string, string][], originCityId?: string): Promise<RouteSummary[]> {
  const rows = await db.query<{ o: string; oname: string; d: string; dname: string; min_fare: number; min_dur: number; ops: number; op_names: string[]; img: string | null; km: number }>(
    `select r.origin_city_id o, oc.name oname, r.destination_city_id d, dc.name dname, min(s.base_fare)::int min_fare, min(r.duration_min)::int min_dur,
            count(distinct r.operator_id)::int ops, array_agg(distinct op.name) op_names, dc.image_url img, min(r.distance_km)::int km
       from routes r join schedules s on s.route_id = r.id and s.status = 'active'
       join cities oc on oc.id = r.origin_city_id join cities dc on dc.id = r.destination_city_id
       join operators op on op.id = r.operator_id and op.status = 'verified'
      where r.status = 'active' and ($1::text is null or r.origin_city_id = $1)
      group by r.origin_city_id, oc.name, r.destination_city_id, dc.name, dc.image_url, dc.popularity, oc.popularity
      order by (oc.popularity + dc.popularity) desc`,
    [originCityId ?? null],
  );
  const all = rows.map((r) => ({ from: r.o, fromName: r.oname, to: r.d, toName: r.dname, minFare: r.min_fare, minDuration: r.min_dur, operators: r.ops, operatorNames: r.op_names, image: r.img, distanceKm: r.km }));
  if (!pairs) return all;
  return pairs.map(([a, b]) => all.find((r) => r.from === a && r.to === b)).filter(Boolean) as RouteSummary[];
}

export async function listDestinations(db: Db) {
  return db.query<{ id: string; name: string; region: string; blurb: string; image_url: string | null; image_source_url: string | null; popularity: number; min_fare: number | null; routes: number; operators: number }>(
    `select c.id, c.name, rg.name region, c.blurb, c.image_url, c.image_source_url, c.popularity,
            min(s.base_fare)::int min_fare, count(distinct r.origin_city_id)::int routes, count(distinct r.operator_id)::int operators
       from cities c join regions rg on rg.id = c.region_id
       left join routes r on r.destination_city_id = c.id and r.status = 'active'
       left join schedules s on s.route_id = r.id and s.status = 'active'
      group by c.id, c.name, rg.name, c.blurb, c.image_url, c.image_source_url, c.popularity
      order by c.popularity desc`,
  );
}

export async function listOperators(db: Db) {
  return db.query<{ id: string; name: string; initials: string; brand_color: string; description: string; rating_avg: string | null; rating_count: number; is_demo: boolean; seating_mode: string; routes: number }>(
    `select o.id, o.name, o.initials, o.brand_color, o.description, o.rating_avg, o.rating_count, o.is_demo, o.seating_mode, count(r.id)::int routes
       from operators o left join routes r on r.operator_id = o.id and r.status = 'active'
      where o.status = 'verified' group by o.id order by o.rating_count desc`,
  );
}
