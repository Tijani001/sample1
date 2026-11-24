import { getDb } from "@/lib/server";
import { requireOperator } from "@/lib/auth/guards";
import { PageHeader } from "@/components/portal/shell";
import type { LayoutSpec } from "@/lib/domain/seat-layout";
import { FleetClient } from "./client";

export const metadata = { title: "Fleet" };
export default async function FleetPage() {
  const u = await requireOperator();
  const db = await getDb();
  const vehicles = await db.query<{ id: string; plate_number: string; model: string; year: number; status: string; amenities: string[]; layout_name: string; seat_count: number; type_name: string }>(
    `select v.id, v.plate_number, v.model, v.year, v.status, v.amenities, l.name layout_name, l.seat_count, vt.name type_name from vehicles v join vehicle_layouts l on l.id = v.layout_id join vehicle_types vt on vt.id = v.vehicle_type_id where v.operator_id = $1 order by v.plate_number`, [u.operator.id]);
  const layouts = await db.query<{ id: string; name: string; spec: LayoutSpec; seat_count: number; premium_surcharge: number; custom: boolean }>(
    `select id, name, spec, seat_count, premium_surcharge, operator_id is not null custom from vehicle_layouts where operator_id is null or operator_id = $1 order by custom desc, seat_count`, [u.operator.id]);
  const types = await db.query<{ id: string; name: string }>(`select id, name from vehicle_types order by name`);
  return (<><PageHeader title="Fleet & seat layouts" subtitle="Vehicles, availability and configurable seat maps" /><FleetClient vehicles={vehicles} layouts={layouts} types={types} /></>);
}
