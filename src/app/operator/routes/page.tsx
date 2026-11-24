import { getDb } from "@/lib/server";
import { requireOperator } from "@/lib/auth/guards";
import { PageHeader } from "@/components/portal/shell";
import { RoutesClient } from "./client";

export const metadata = { title: "Routes & schedules" };
export default async function RoutesPage() {
  const u = await requireOperator();
  const db = await getDb();
  const schedules = await db.query<{ id: string; route_id: string; route: string; departure_time: string; days_of_week: number[]; base_fare: number; status: string; plate: string; policy: string; duration_min: number; stops: number; o_term: string; d_term: string }>(
    `select s.id, s.route_id, oc.name || ' → ' || dc.name route, to_char(s.departure_time,'HH24:MI') departure_time, s.days_of_week, s.base_fare, s.status, v.plate_number plate, cp.name policy, r.duration_min,
            (select count(*) from route_stops rs where rs.route_id = r.id)::int stops, ot.name o_term, dt.name d_term
       from schedules s join routes r on r.id = s.route_id join cities oc on oc.id = r.origin_city_id join cities dc on dc.id = r.destination_city_id
       join vehicles v on v.id = s.vehicle_id join cancellation_policies cp on cp.id = s.cancellation_policy_id
       join terminals ot on ot.id = r.origin_terminal_id join terminals dt on dt.id = r.destination_terminal_id
      where s.operator_id = $1 order by oc.name, dc.name, s.departure_time`, [u.operator.id]);
  const routes = await db.query<{ id: string; label: string }>(`select r.id, oc.name || ' → ' || dc.name label from routes r join cities oc on oc.id = r.origin_city_id join cities dc on dc.id = r.destination_city_id where r.operator_id = $1 order by 2`, [u.operator.id]);
  const vehicles = await db.query<{ id: string; label: string }>(`select id, plate_number || ' · ' || model label from vehicles where operator_id = $1 and status = 'active'`, [u.operator.id]);
  const policies = await db.query<{ id: string; name: string }>(`select id, name from cancellation_policies`);
  return (<><PageHeader title="Routes & schedules" subtitle="Recurring departures, fares and cancellation policies" /><RoutesClient schedules={schedules} routes={routes} vehicles={vehicles} policies={policies} /></>);
}
