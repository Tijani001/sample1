"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Ban, CheckCircle2, Printer, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Input } from "@/components/ui/primitives";
import { SeatMap, SeatLegend, type SeatMapData } from "@/components/seat-map/seat-map";
import { Table } from "@/components/portal/shell";
import { boardFromManifestAction, seatBlocksAction, tripStatusAction } from "../../actions";
import { cn } from "@/lib/cn";

type Row = { ticket_id: string; ticket_no: string; ticket_status: string; boarded_at: string | null; full_name: string; phone: string | null; nok_name: string | null; nok_phone: string | null; seat_no: string | null; reference: string; booking_status: string };

export function Manifest({ tripId, rows }: { tripId: string; rows: Row[] }) {
  const [pending, start] = useTransition();
  const boarded = rows.filter((r) => r.ticket_status === "boarded").length;
  const active = rows.filter((r) => r.ticket_status !== "void");
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Passenger manifest <span className="text-sm font-normal text-ink-3">· {boarded}/{active.length} boarded</span></h2>
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" />Print manifest</Button>
      </div>
      <Table head={["Seat", "Passenger", "Contact", "Emergency contact", "Booking", "Check-in"]} empty={rows.length ? undefined : "No Goroada passengers on this departure yet."}>
        {rows.map((r) => (
          <tr key={r.ticket_id} className={cn(r.ticket_status === "void" && "opacity-50")}>
            <td className="font-semibold tabular">{r.seat_no ?? "—"}</td>
            <td className="font-medium">{r.full_name}<span className="block font-mono text-xs text-ink-3">{r.ticket_no}</span></td>
            <td className="tabular">{r.phone ?? "—"}</td>
            <td>{r.nok_name ?? "—"}<span className="block text-xs text-ink-3 tabular">{r.nok_phone ?? ""}</span></td>
            <td className="font-mono text-xs">{r.reference}</td>
            <td>
              {r.ticket_status === "boarded" ? <Badge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>Boarded</Badge>
                : r.ticket_status === "void" ? <Badge tone="danger">Cancelled</Badge>
                : <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const res = await boardFromManifestAction(tripId, r.ticket_no); if (res.ok) toast.success(`${r.full_name} checked in`); else toast.error(res.message); })}>Check in</Button>}
            </td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

export function InventoryEditor({ tripId, map, releasable }: { tripId: string; map: SeatMapData; releasable: string[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const [pending, start] = useTransition();
  // Operators can select available seats (to block) and blocked/other-channel seats (to release).
  const editable: SeatMapData = { ...map, states: Object.fromEntries(Object.entries(map.states).map(([k, v]) => [k, { ...v, mine: releasable.includes(k) }])) };
  const toBlock = sel.filter((s) => !map.states[s]);
  const toRelease = sel.filter((s) => map.states[s]);
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-lg font-semibold">Seat inventory</h2>
      <p className="mt-1 text-sm text-ink-3">Select free seats to block them (offline sales, crew, maintenance) or select blocked seats to release them. Goroada-sold seats can&apos;t be changed here.</p>
      <div className="mt-5 overflow-x-auto"><SeatMap data={editable} selected={sel} onToggle={(no) => setSel((s) => (s.includes(no) ? s.filter((x) => x !== no) : [...s, no]))} /></div>
      <div className="mt-4"><SeatLegend /></div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="navy" disabled={!toBlock.length || pending} onClick={() => start(async () => { const r = await seatBlocksAction(tripId, toBlock, []); if (r.ok) { toast.success(`${(r.data as { blocked: number }).blocked} seat(s) blocked`); setSel([]); } else toast.error(r.error); })}><Lock className="h-4 w-4" />Block {toBlock.length || ""}</Button>
        <Button size="sm" variant="outline" disabled={!toRelease.length || pending} onClick={() => start(async () => { const r = await seatBlocksAction(tripId, [], toRelease); if (r.ok) { toast.success(`${(r.data as { released: number }).released} seat(s) released`); setSel([]); } else toast.error(r.error); })}><Unlock className="h-4 w-4" />Release {toRelease.length || ""}</Button>
      </div>
    </section>
  );
}

const ACTIONS: { status: "boarding" | "departed" | "in_transit" | "arrived"; label: string }[] = [
  { status: "boarding", label: "Start boarding" }, { status: "departed", label: "Mark departed" }, { status: "in_transit", label: "In transit" }, { status: "arrived", label: "Mark arrived" },
];

export function DepartureControls({ tripId, status, delayMin }: { tripId: string; status: string; delayMin: number }) {
  const [pending, start] = useTransition();
  const [delay, setDelay] = useState(30);
  const [note, setNote] = useState("");
  const done = status === "arrived" || status === "cancelled";
  const act = (s: Parameters<typeof tripStatusAction>[1], d?: number) => start(async () => {
    const r = await tripStatusAction(tripId, s, d, note || undefined);
    if (r.ok) { toast.success("Update posted", { description: `${(r.data as { notified: number }).notified} booking(s) notified.` }); setNote(""); } else toast.error(r.error);
  });
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Journey status</h2><Badge tone={status === "delayed" ? "warning" : status === "cancelled" ? "danger" : "info"}>{status.replace("_", " ")}{status === "delayed" && ` +${delayMin}m`}</Badge></div>
      {done ? <p className="mt-3 text-sm text-ink-3">This departure is {status}. No further updates are possible.</p> : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">{ACTIONS.map((a) => <Button key={a.status} size="sm" variant={status === a.status ? "navy" : "outline"} disabled={pending} onClick={() => act(a.status)}>{a.label}</Button>)}</div>
          <label className="mt-4 block text-sm font-medium" htmlFor="note">Message to passengers <span className="font-normal text-ink-3">(optional)</span></label>
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Heavy traffic at Lokoja" className="mt-1 h-10" />
          <div className="mt-4 flex items-end gap-2">
            <label className="flex-1 text-sm font-medium">Report delay (minutes)<Input type="number" min={5} max={600} value={delay} onChange={(e) => setDelay(Number(e.target.value))} className="mt-1 h-10" /></label>
            <Button size="sm" variant="outline" className="h-10" disabled={pending} onClick={() => act("delayed", delay)}>Report delay</Button>
          </div>
          <Button size="sm" variant="danger" className="mt-4 w-full" disabled={pending} onClick={() => { if (confirm("Cancel this departure? Every passenger will be notified and refunded in full.")) act("cancelled"); }}><Ban className="h-4 w-4" />Cancel departure</Button>
        </>
      )}
      <p className="mt-3 text-xs text-ink-3">Updates are shown to passengers as operator-reported status and sent by SMS/push.</p>
    </section>
  );
}
