import { getDb } from "@/lib/server";
import { adminFor } from "../guard";
import { PageHeader, Stat, Table } from "@/components/portal/shell";
import { Field, Input, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/portal/action-button";
import { addTerminalAction } from "../actions";

export const metadata = { title: "Network" };
export default async function Network() {
  await adminFor("network");
  const db = await getDb();
  const [c] = await db.query<{ cities: number; terminals: number; routes: number; vehicles: number; schedules: number }>(`select (select count(*) from cities)::int cities, (select count(*) from terminals)::int terminals, (select count(*) from routes)::int routes, (select count(*) from vehicles)::int vehicles, (select count(*) from schedules where status='active')::int schedules`);
  const terminals = await db.query<{ id: string; name: string; address: string; city: string; routes: number }>(`select t.id, t.name, t.address, c.name city, (select count(*) from routes r where r.origin_terminal_id = t.id or r.destination_terminal_id = t.id)::int routes from terminals t join cities c on c.id = t.city_id order by c.name, t.name`);
  const cities = await db.query<{ id: string; name: string }>(`select id, name from cities order by name`);
  return (
    <>
      <PageHeader title="Network" subtitle="Cities, terminals, routes and fleet across operators" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Stat label="Cities" value={c.cities} /><Stat label="Terminals" value={c.terminals} /><Stat label="Routes" value={c.routes} /><Stat label="Active schedules" value={c.schedules} /><Stat label="Vehicles" value={c.vehicles} /></div>
      <section className="mt-6 rounded-2xl border border-line bg-white p-5"><h2 className="font-semibold">Add terminal</h2>
        <ActionForm action={addTerminalAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
          <Field label="City" htmlFor="city"><Select id="city" name="city">{cities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          <Field label="Name" htmlFor="tname"><Input id="tname" name="name" placeholder="e.g. Berger Terminal" /></Field>
          <Field label="Address" htmlFor="addr"><Input id="addr" name="address" /></Field>
          <Button variant="navy" className="h-12">Add</Button>
        </ActionForm></section>
      <h2 className="mb-3 mt-6 text-lg font-semibold">Terminals</h2>
      <Table head={["Terminal", "City", "Address", "Routes"]}>{terminals.map((t) => <tr key={t.id}><td className="font-medium">{t.name}</td><td>{t.city}</td><td className="text-xs text-ink-3">{t.address}</td><td className="tabular">{t.routes}</td></tr>)}</Table>
    </>
  );
}
