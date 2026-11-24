"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/server";
import { requireOperator } from "@/lib/auth/guards";
import { createLayout, createSchedule, createVehicle, setSeatBlocks, updateTripStatus } from "@/lib/services/operator";
import { verifyTicket } from "@/lib/services/tickets";
import { BookingError } from "@/lib/services/bookings";
import type { LayoutSpec } from "@/lib/domain/seat-layout";

type R<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
async function run<T>(fn: () => Promise<T>, message?: string): Promise<R<T>> {
  try {
    return { ok: true, data: await fn(), message };
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, error: e.message };
    throw e;
  }
}
const actorOf = (u: { id: string; operator: { name: string } }) => ({ userId: u.id, label: `operator:${u.operator.name}` });

export async function tripStatusAction(tripId: string, status: "boarding" | "departed" | "in_transit" | "delayed" | "arrived" | "cancelled", delayMin?: number, note?: string) {
  const u = await requireOperator();
  const r = await run(async () => updateTripStatus(await getDb(), u.operator.id, tripId, actorOf(u), { status, delayMin, note }));
  revalidatePath(`/operator/departures/${tripId}`);
  return r;
}

export async function seatBlocksAction(tripId: string, block: string[], unblock: string[]) {
  const u = await requireOperator();
  const r = await run(async () => setSeatBlocks(await getDb(), u.operator.id, tripId, actorOf(u), block.slice(0, 60), unblock.slice(0, 60)));
  revalidatePath(`/operator/departures/${tripId}`);
  return r;
}

export async function verifyTicketAction(code: string, commit: boolean) {
  const u = await requireOperator();
  return verifyTicket(await getDb(), code.slice(0, 120), u.operator.id, actorOf(u), commit);
}

export async function boardFromManifestAction(tripId: string, ticketNo: string) {
  const u = await requireOperator();
  const res = await verifyTicket(await getDb(), ticketNo, u.operator.id, actorOf(u), true);
  revalidatePath(`/operator/departures/${tripId}`);
  return res;
}

export async function createLayoutAction(name: string, rows: string[], premiumNaira: number) {
  const u = await requireOperator();
  const spec: LayoutSpec = { rows: rows.map((r) => r.toUpperCase().replace(/[^DSP_.]/g, "")).filter(Boolean), doors: [{ row: 1, side: "right" }] };
  const r = await run(async () => createLayout(await getDb(), u.operator.id, actorOf(u), { name, spec, premiumSurcharge: Math.round(Math.max(0, premiumNaira) * 100) }), "Layout saved");
  revalidatePath("/operator/fleet");
  return r;
}

export async function createVehicleAction(input: { typeId: string; layoutId: string; plate: string; model: string; year: number; amenities: string[] }) {
  const u = await requireOperator();
  if (!input.plate.trim() || !input.model.trim()) return { ok: false as const, error: "Enter the plate number and model." };
  const r = await run(async () => createVehicle(await getDb(), u.operator.id, actorOf(u), input), "Vehicle added");
  revalidatePath("/operator/fleet");
  return r;
}

export async function setVehicleStatusAction(vehicleId: string, status: "active" | "maintenance" | "retired") {
  const u = await requireOperator();
  await (await getDb()).query(`update vehicles set status = $3 where id = $1 and operator_id = $2`, [vehicleId, u.operator.id, status]);
  revalidatePath("/operator/fleet");
}

export async function createScheduleAction(input: { routeId: string; vehicleId: string; time: string; days: number[]; fareNaira: number; policyId: string }) {
  const u = await requireOperator();
  const r = await run(async () => createSchedule(await getDb(), u.operator.id, actorOf(u), { ...input, fare: Math.round(input.fareNaira * 100) }), "Schedule created and departures published");
  revalidatePath("/operator/routes");
  return r;
}

export async function toggleScheduleAction(scheduleId: string) {
  const u = await requireOperator();
  await (await getDb()).query(`update schedules set status = case when status = 'active' then 'paused' else 'active' end where id = $1 and operator_id = $2`, [scheduleId, u.operator.id]);
  revalidatePath("/operator/routes");
}
