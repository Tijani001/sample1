"use client";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Minus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Field, Input, Select } from "@/components/ui/primitives";
import { Table } from "@/components/portal/shell";
import { SeatMap } from "@/components/seat-map/seat-map";
import { AMENITIES } from "@/components/trip/amenities";
import { validateLayout, type LayoutSpec } from "@/lib/domain/seat-layout";
import { formatMoney } from "@/lib/domain/money";
import { createLayoutAction, createVehicleAction, setVehicleStatusAction } from "../actions";
import { cn } from "@/lib/cn";

type Vehicle = { id: string; plate_number: string; model: string; year: number; status: string; amenities: string[]; layout_name: string; seat_count: number; type_name: string };
type Layout = { id: string; name: string; spec: LayoutSpec; seat_count: number; premium_surcharge: number; custom: boolean };

const CYCLE = ["S", "P", "_", "."] as const;
const CELL_LABEL: Record<string, string> = { S: "Seat", P: "Premium", _: "Aisle", ".": "Empty", D: "Driver" };

export function FleetClient({ vehicles, layouts, types }: { vehicles: Vehicle[]; layouts: Layout[]; types: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState(layouts[0]?.id);
  const [form, setForm] = useState({ typeId: types[0]?.id ?? "", layoutId: layouts[0]?.id ?? "", plate: "", model: "", year: 2024, amenities: [] as string[] });
  const pl = layouts.find((l) => l.id === preview);
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Vehicles</h2>
        <Table head={["Plate", "Model", "Type & layout", "Amenities", "Status"]}>
          {vehicles.map((v) => (
            <tr key={v.id}>
              <td className="font-mono font-semibold">{v.plate_number}</td><td>{v.model}<span className="block text-xs text-ink-3">{v.year}</span></td>
              <td>{v.type_name}<span className="block text-xs text-ink-3">{v.layout_name} · {v.seat_count} seats</span></td>
              <td className="text-xs text-ink-3">{v.amenities.map((a) => AMENITIES[a]?.label).join(", ") || "None listed"}</td>
              <td><select aria-label={`Status of ${v.plate_number}`} defaultValue={v.status} onChange={(e) => start(async () => { await setVehicleStatusAction(v.id, e.target.value as "active"); toast.success("Vehicle updated"); })} className="h-9 rounded-lg border border-line-strong bg-white px-2 text-sm"><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></select></td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-lg font-semibold">Add a vehicle</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Plate number" htmlFor="plate"><Input id="plate" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="ABC-123-XY" className="font-mono uppercase" /></Field>
            <Field label="Model" htmlFor="model"><Input id="model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Toyota HiAce" /></Field>
            <Field label="Vehicle type" htmlFor="type"><Select id="type" value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Seat layout" htmlFor="layout"><Select id="layout" value={form.layoutId} onChange={(e) => { setForm({ ...form, layoutId: e.target.value }); setPreview(e.target.value); }}>{layouts.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.seat_count}){l.custom ? " · custom" : ""}</option>)}</Select></Field>
            <Field label="Year" htmlFor="year"><Input id="year" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} /></Field>
          </div>
          <fieldset className="mt-4"><legend className="mb-2 text-sm font-medium">Amenities (only list what passengers will actually get)</legend>
            <div className="flex flex-wrap gap-2">{Object.entries(AMENITIES).map(([k, a]) => <button key={k} type="button" aria-pressed={form.amenities.includes(k)} onClick={() => setForm({ ...form, amenities: form.amenities.includes(k) ? form.amenities.filter((x) => x !== k) : [...form.amenities, k] })} className={cn("h-9 rounded-full border px-3 text-sm", form.amenities.includes(k) ? "border-navy-600 bg-navy-600 text-white" : "border-line-strong")}>{a.label}</button>)}</div>
          </fieldset>
          <Button className="mt-5" variant="navy" loading={pending} onClick={() => start(async () => { const r = await createVehicleAction(form); if (r.ok) { toast.success("Vehicle added"); setForm({ ...form, plate: "", model: "" }); } else toast.error(r.error); })}>Add vehicle</Button>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Layout preview</h2>
            <select value={preview} onChange={(e) => setPreview(e.target.value)} aria-label="Layout to preview" className="h-9 rounded-lg border border-line-strong px-2 text-sm">{layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          {pl && <><p className="mt-1 text-sm text-ink-3">{pl.seat_count} seats{pl.premium_surcharge ? ` · premium +${formatMoney(pl.premium_surcharge)}` : ""}{pl.custom && " · custom layout"}</p>
            <div className="mt-4 overflow-x-auto"><SeatMap data={{ spec: pl.spec, premiumSurcharge: pl.premium_surcharge, seatingMode: "assigned", states: {}, available: pl.seat_count, capacity: pl.seat_count }} selected={[]} onToggle={() => {}} /></div></>}
        </div>
      </section>
      <LayoutBuilder />
    </div>
  );
}

function LayoutBuilder() {
  const [name, setName] = useState("Custom 16-seater");
  const [premium, setPremium] = useState(0);
  const [rows, setRows] = useState<string[]>(["D.SS", "SS_S", "SS_S", "SS_S", "SS_S", "SSS."]);
  const [pending, start] = useTransition();
  const width = Math.max(...rows.map((r) => r.length));
  const errors = useMemo(() => validateLayout({ rows }), [rows]);
  const seats = rows.join("").replace(/[^SP]/g, "").length;
  const cycle = (r: number, c: number) => setRows((rs) => rs.map((row, i) => {
    if (i !== r) return row;
    const chars = row.padEnd(width, ".").split("");
    if (chars[c] === "D") return row;
    chars[c] = CYCLE[(CYCLE.indexOf(chars[c] as (typeof CYCLE)[number]) + 1) % CYCLE.length];
    return chars.join("");
  }));
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-lg font-semibold">Custom layout builder</h2>
      <p className="mt-1 text-sm text-ink-3">Click a cell to cycle seat → premium → aisle → empty. The driver stays at the front. Seat numbers are assigned front to back.</p>
      <div className="mt-4 grid gap-6 lg:grid-cols-[auto_1fr]">
        <div>
          <div className="inline-flex flex-col gap-1.5 rounded-2xl bg-surface-2 p-3" role="grid" aria-label="Layout editor">
            {rows.map((row, r) => (
              <div key={r} className="flex gap-1.5" role="row">
                {row.padEnd(width, ".").split("").map((ch, c) => (
                  <button key={c} type="button" role="gridcell" onClick={() => cycle(r, c)} aria-label={`Row ${r + 1}, position ${c + 1}: ${CELL_LABEL[ch]}`}
                    className={cn("h-10 w-10 rounded-lg border text-xs font-semibold", ch === "S" ? "border-navy-300 bg-white text-navy-700" : ch === "P" ? "border-amber-300 bg-amber-50 text-amber-700" : ch === "D" ? "border-transparent bg-navy-600 text-white" : ch === "_" ? "border-dashed border-line-strong bg-transparent text-ink-4" : "border-transparent bg-transparent text-ink-4")}>
                    {ch === "_" ? "aisle" : ch === "." ? "" : ch}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, "SS_S".slice(0, Math.max(3, width)).padEnd(width, "S")])} disabled={rows.length >= 20}><Plus className="h-4 w-4" />Row</Button>
            <Button size="sm" variant="outline" onClick={() => setRows((rs) => rs.slice(0, -1))} disabled={rows.length <= 2}><Minus className="h-4 w-4" />Row</Button>
            <Button size="sm" variant="outline" onClick={() => setRows((rs) => rs.map((r) => (r.length < 6 ? r + "." : r)))} disabled={width >= 6}><Plus className="h-4 w-4" />Column</Button>
          </div>
        </div>
        <div className="space-y-4">
          <Field label="Layout name" htmlFor="lname"><Input id="lname" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Premium seat surcharge (₦)" htmlFor="prem"><Input id="prem" type="number" min={0} value={premium} onChange={(e) => setPremium(Number(e.target.value))} /></Field>
          <p className="text-sm"><Badge tone="navy">{seats} seats</Badge></p>
          {errors.length > 0 && <ul className="text-sm text-danger">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <Button variant="navy" disabled={errors.length > 0} loading={pending} onClick={() => start(async () => { const r = await createLayoutAction(name, rows, premium); if (r.ok) toast.success("Layout saved", { description: "Assign it to a vehicle above." }); else toast.error(r.error); })}><Save className="h-4 w-4" />Save layout</Button>
        </div>
      </div>
    </section>
  );
}
