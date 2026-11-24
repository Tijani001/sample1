"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Field, Input, Select } from "@/components/ui/primitives";
import { Table } from "@/components/portal/shell";
import { formatMoney } from "@/lib/domain/money";
import { formatDuration } from "@/lib/domain/time";
import { createScheduleAction, toggleScheduleAction } from "../actions";
import { cn } from "@/lib/cn";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type S = { id: string; route: string; departure_time: string; days_of_week: number[]; base_fare: number; status: string; plate: string; policy: string; duration_min: number; stops: number; o_term: string; d_term: string };

export function RoutesClient({ schedules, routes, vehicles, policies }: { schedules: S[]; routes: { id: string; label: string }[]; vehicles: { id: string; label: string }[]; policies: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [f, setF] = useState({ routeId: routes[0]?.id ?? "", vehicleId: vehicles[0]?.id ?? "", time: "08:00", days: [0, 1, 2, 3, 4, 5, 6], fareNaira: 15000, policyId: "standard" });
  return (
    <div className="space-y-8">
      <Table head={["Route", "Departs", "Days", "Vehicle", "Fare", "Policy", "Status"]}>
        {schedules.map((s) => (
          <tr key={s.id}>
            <td className="font-medium">{s.route}<span className="block text-xs text-ink-3">{s.o_term} → {s.d_term} · {formatDuration(s.duration_min)}{s.stops ? ` · ${s.stops} stop${s.stops > 1 ? "s" : ""}` : ""}</span></td>
            <td className="font-semibold tabular">{s.departure_time}</td>
            <td className="text-xs">{s.days_of_week.length === 7 ? "Daily" : s.days_of_week.map((d) => DAYS[d]).join(" ")}</td>
            <td className="font-mono text-xs">{s.plate}</td>
            <td className="tabular">{formatMoney(s.base_fare)}</td>
            <td>{s.policy}</td>
            <td><button onClick={() => start(async () => { await toggleScheduleAction(s.id); toast.success("Schedule updated"); })} disabled={pending}><Badge tone={s.status === "active" ? "success" : "neutral"}>{s.status}</Badge></button></td>
          </tr>
        ))}
      </Table>
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Create a recurring departure</h2>
        <p className="mt-1 text-sm text-ink-3">Departures are published immediately for every date already open for sale.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Route" htmlFor="r"><Select id="r" value={f.routeId} onChange={(e) => setF({ ...f, routeId: e.target.value })}>{routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
          <Field label="Vehicle" htmlFor="v"><Select id="v" value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</Select></Field>
          <Field label="Departure time (local)" htmlFor="t"><Input id="t" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
          <Field label="Fare per seat (₦)" htmlFor="fare"><Input id="fare" type="number" min={500} step={500} value={f.fareNaira} onChange={(e) => setF({ ...f, fareNaira: Number(e.target.value) })} /></Field>
          <Field label="Cancellation policy" htmlFor="p"><Select id="p" value={f.policyId} onChange={(e) => setF({ ...f, policyId: e.target.value })}>{policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <fieldset><legend className="mb-1.5 text-sm font-medium">Days</legend><div className="flex flex-wrap gap-1">{DAYS.map((d, i) => <button key={d} type="button" aria-pressed={f.days.includes(i)} onClick={() => setF({ ...f, days: f.days.includes(i) ? f.days.filter((x) => x !== i) : [...f.days, i].sort() })} className={cn("h-10 w-11 rounded-lg border text-xs font-medium", f.days.includes(i) ? "border-navy-600 bg-navy-600 text-white" : "border-line-strong")}>{d}</button>)}</div></fieldset>
        </div>
        <Button className="mt-5" variant="navy" loading={pending} onClick={() => start(async () => { const r = await createScheduleAction(f); if (r.ok) toast.success(r.message ?? "Created"); else toast.error(r.error); })}>Create schedule</Button>
      </section>
    </div>
  );
}
