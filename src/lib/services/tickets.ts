import QRCode from "qrcode";
import type { Db } from "@/lib/db/client";
import { audit, type Actor } from "./audit";

export const QR_PREFIX = "GOROADA:1:";
export const qrPayload = (token: string) => `${QR_PREFIX}${token}`;

export async function qrSvg(token: string) {
  return QRCode.toString(qrPayload(token), { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#102A43", light: "#FFFFFF00" } });
}
export async function qrPng(token: string) {
  return QRCode.toBuffer(qrPayload(token), { errorCorrectionLevel: "M", margin: 1, width: 360, color: { dark: "#102A43", light: "#FFFFFF" } });
}

export function parseScanned(input: string) {
  const v = input.trim();
  if (v.startsWith(QR_PREFIX)) return { token: v.slice(QR_PREFIX.length) };
  if (/^TKT-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(v)) return { ticketNo: v.toUpperCase() };
  if (/^[A-Za-z0-9_-]{20,30}$/.test(v)) return { token: v };
  return null;
}

export type VerifyTicketResult =
  | { ok: true; status: "valid" | "boarded_now"; ticket: TicketInfo }
  | { ok: false; reason: "not_found" | "wrong_operator" | "already_boarded" | "void" | "not_confirmed" | "wrong_day"; message: string; ticket?: TicketInfo };

type TicketInfo = { ticketNo: string; passenger: string; seat: string | null; reference: string; route: string; departureAt: string; boardedAt: string | null; tripId: string };

/**
 * Operator ticket check. With `commit`, atomically marks the ticket boarded; a second scan is rejected,
 * which prevents the same ticket being used twice.
 */
export async function verifyTicket(db: Db, input: string, operatorId: string | null, actor: Actor, commit: boolean): Promise<VerifyTicketResult> {
  const parsed = parseScanned(input);
  if (!parsed) return { ok: false, reason: "not_found", message: "That code isn't a Goroada ticket." };
  const [t] = await db.query<{ id: string; ticket_no: string; status: string; boarded_at: Date | null; full_name: string; seat_no: string | null; reference: string; booking_status: string; operator_id: string; o: string; d: string; departure_at: Date; trip_id: string }>(
    `select tk.id, tk.ticket_no, tk.status, tk.boarded_at, bp.full_name, bst.seat_no, b.reference, b.status booking_status, t.operator_id, oc.name o, dc.name d, t.departure_at, t.id trip_id
       from tickets tk join bookings b on b.id = tk.booking_id
       join booking_segments bs on bs.id = tk.segment_id join trips t on t.id = bs.trip_id join routes r on r.id = t.route_id
       join cities oc on oc.id = r.origin_city_id join cities dc on dc.id = r.destination_city_id
       join booking_passengers bp on bp.booking_id = b.id and bp.seq = tk.passenger_seq
       left join booking_seats bst on bst.segment_id = tk.segment_id and bst.passenger_seq = tk.passenger_seq
      where ${parsed.token ? "tk.verification_token = $1" : "tk.ticket_no = $1"}`,
    [parsed.token ?? parsed.ticketNo],
  );
  if (!t) return { ok: false, reason: "not_found", message: "No ticket matches this code." };
  const info: TicketInfo = { ticketNo: t.ticket_no, passenger: t.full_name, seat: t.seat_no, reference: t.reference, route: `${t.o} → ${t.d}`, departureAt: new Date(t.departure_at).toISOString(), boardedAt: t.boarded_at ? new Date(t.boarded_at).toISOString() : null, tripId: t.trip_id };
  if (operatorId && t.operator_id !== operatorId) return { ok: false, reason: "wrong_operator", message: "This ticket is for another operator's departure." };
  if (t.booking_status !== "confirmed") return { ok: false, reason: "not_confirmed", message: "This booking is not confirmed (it may be cancelled or refunded).", ticket: info };
  if (t.status === "void") return { ok: false, reason: "void", message: "This ticket has been cancelled.", ticket: info };
  if (t.status === "boarded") return { ok: false, reason: "already_boarded", message: `Already boarded at ${new Date(t.boarded_at!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}.`, ticket: info };
  const hours = (new Date(t.departure_at).getTime() - Date.now()) / 3600_000;
  if (hours > 24 || hours < -12) return { ok: false, reason: "wrong_day", message: `This ticket is for ${new Date(t.departure_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}.`, ticket: info };
  if (!commit) return { ok: true, status: "valid", ticket: info };
  const updated = await db.query<{ boarded_at: Date }>(`update tickets set status = 'boarded', boarded_at = now(), boarded_by = $2 where id = $1 and status = 'valid' returning boarded_at`, [t.id, actor.userId]);
  if (!updated.length) return { ok: false, reason: "already_boarded", message: "Already boarded.", ticket: info };
  await audit(db, actor, "ticket.boarded", "ticket", t.id, { ticket: t.ticket_no });
  return { ok: true, status: "boarded_now", ticket: { ...info, boardedAt: new Date(updated[0].boarded_at).toISOString() } };
}
