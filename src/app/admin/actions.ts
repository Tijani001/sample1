"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/server";
import { adminFor } from "./guard";
import { audit } from "@/lib/services/audit";
import { processRefund } from "@/lib/services/payments";
import { cancelBooking, BookingError } from "@/lib/services/bookings";
import { notify } from "@/lib/services/notifications";

type R = { ok: boolean; error?: string; message?: string };
const fail = (e: unknown): R => ({ ok: false, error: e instanceof BookingError ? e.message : "Action failed. Please try again." });

export async function setOperatorStatusAction(operatorId: string, status: "verified" | "suspended" | "rejected" | "pending"): Promise<R> {
  const { actor } = await adminFor("operators");
  const db = await getDb();
  await db.tx(async (q) => {
    await q.query(`update operators set status = $2 where id = $1`, [operatorId, status]);
    if (status === "verified") await q.query(`update operator_documents set status = 'approved', reviewed_by = $2, reviewed_at = now() where operator_id = $1 and status = 'submitted'`, [operatorId, actor.userId]);
    await audit(q, actor, `operator.${status}`, "operator", operatorId);
  });
  revalidatePath("/admin/operators");
  return { ok: true, message: `Operator ${status}` };
}

export async function setCommissionAction(operatorId: string, percent: number): Promise<R> {
  const { actor } = await adminFor("operators");
  if (!(percent >= 0 && percent <= 30)) return { ok: false, error: "Commission must be between 0% and 30%." };
  const db = await getDb();
  await db.query(`update operators set commission_bps = $2 where id = $1`, [operatorId, Math.round(percent * 100)]);
  await audit(db, actor, "operator.commission_changed", "operator", operatorId, { percent });
  revalidatePath("/admin/operators");
  return { ok: true, message: "Commission updated" };
}

export async function processRefundAction(refundId: string): Promise<R> {
  const { actor } = await adminFor("refunds");
  try { await processRefund(await getDb(), refundId, actor); } catch (e) { return fail(e); }
  revalidatePath("/admin/refunds");
  return { ok: true, message: "Refund processed" };
}

export async function rejectRefundAction(refundId: string): Promise<R> {
  const { actor } = await adminFor("refunds");
  const db = await getDb();
  await db.query(`update refunds set status = 'rejected', processed_by = $2, processed_at = now() where id = $1 and status in ('pending','approved')`, [refundId, actor.userId]);
  await audit(db, actor, "refund.rejected", "refund", refundId);
  revalidatePath("/admin/refunds");
  return { ok: true, message: "Refund rejected" };
}

export async function adminCancelBookingAction(bookingId: string, reason: string): Promise<R> {
  const { actor } = await adminFor("bookings");
  try { await cancelBooking(await getDb(), bookingId, actor, `Cancelled by Goroada: ${reason}`.slice(0, 300)); } catch (e) { return fail(e); }
  revalidatePath("/admin/bookings");
  return { ok: true, message: "Booking cancelled and refund requested" };
}

export async function runSettlementAction(): Promise<R> {
  const { actor } = await adminFor("settlements");
  const db = await getDb();
  const rows = await db.tx(async (q) => {
    const r = await q.query<{ operator_id: string }>(
      `insert into operator_settlements (operator_id, period_start, period_end, gross, commission, refunds, net, status)
       select pc.operator_id, (current_date - 7), (current_date - 1), sum(pc.gross)::int, sum(pc.amount)::int, 0, (sum(pc.gross) - sum(pc.amount))::int, 'pending'
         from platform_commissions pc join bookings b on b.id = pc.booking_id
        where b.status = 'confirmed' and pc.created_at::date between current_date - 7 and current_date - 1
        group by pc.operator_id
       on conflict (operator_id, period_start, period_end) do nothing returning operator_id`);
    await audit(q, actor, "settlement.run", "settlement", null, { operators: r.length });
    return r;
  });
  revalidatePath("/admin/settlements");
  return { ok: true, message: rows.length ? `Created ${rows.length} settlement(s) for last week` : "Nothing new to settle for last week" };
}

export async function markSettlementPaidAction(id: string): Promise<R> {
  const { actor } = await adminFor("settlements");
  const db = await getDb();
  await db.query(`update operator_settlements set status = 'paid', paid_at = now() where id = $1 and status <> 'paid'`, [id]);
  await audit(db, actor, "settlement.paid", "settlement", id);
  revalidatePath("/admin/settlements");
  return { ok: true, message: "Marked as paid" };
}

export async function createPromotionAction(form: FormData): Promise<R> {
  const { actor } = await adminFor("promotions");
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const kind = String(form.get("kind"));
  const value = Number(form.get("value"));
  const days = Number(form.get("days") ?? 30);
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return { ok: false, error: "Code must be 4–16 letters or numbers." };
  if (!["percent", "fixed"].includes(kind) || !(value > 0) || (kind === "percent" && value > 50)) return { ok: false, error: "Enter a valid discount (percent up to 50, or a fixed naira amount)." };
  const db = await getDb();
  try {
    await db.query(
      `insert into promotions (code, title, description, kind, value, max_discount, min_subtotal, starts_at, ends_at, usage_limit, per_user_limit, category, terms)
       values ($1,$2,$3,$4,$5,$6,$7, now(), now() + make_interval(days => $8), $9, 1, 'seasonal', $10)`,
      [code, String(form.get("title") || code), String(form.get("description") || ""), kind, kind === "percent" ? value : Math.round(value * 100), form.get("max") ? Math.round(Number(form.get("max")) * 100) : null, Math.round(Number(form.get("min") ?? 0) * 100), days, form.get("limit") ? Number(form.get("limit")) : null, "Discount applies to fares and seat charges only. One use per customer."]);
  } catch { return { ok: false, error: "That code already exists." }; }
  await audit(db, actor, "promotion.created", "promotion", code, { kind, value });
  revalidatePath("/admin/promotions");
  return { ok: true, message: "Promotion created" };
}

export async function togglePromotionAction(code: string): Promise<R> {
  const { actor } = await adminFor("promotions");
  const db = await getDb();
  await db.query(`update promotions set active = not active where code = $1`, [code]);
  await audit(db, actor, "promotion.toggled", "promotion", code);
  revalidatePath("/admin/promotions");
  return { ok: true };
}

export async function replySupportAction(ticketId: string, body: string, resolve: boolean): Promise<R> {
  const { actor } = await adminFor("support");
  if (body.trim().length < 2 && !resolve) return { ok: false, error: "Write a reply." };
  const db = await getDb();
  await db.tx(async (q) => {
    if (body.trim()) await q.query(`insert into support_messages (ticket_id, author_kind, author_user_id, body) values ($1,'agent',$2,$3)`, [ticketId, actor.userId, body.trim().slice(0, 4000)]);
    const [t] = await q.query<{ reference: string; user_id: string | null; contact_email: string }>(`update support_tickets set status = $2, updated_at = now() where id = $1 returning reference, user_id, contact_email`, [ticketId, resolve ? "resolved" : "pending"]);
    await notify(q, { userId: t.user_id, category: "transactional", kind: "support_reply", title: `Update on ${t.reference}`, body: body.trim().slice(0, 140) || "Your request was resolved.", href: "/help", channels: { email: t.contact_email } });
    await audit(q, actor, resolve ? "support.resolved" : "support.replied", "support_ticket", ticketId);
  });
  revalidatePath("/admin/support");
  return { ok: true, message: resolve ? "Resolved" : "Reply sent" };
}

export async function setUserStatusAction(userId: string, status: "active" | "suspended"): Promise<R> {
  const { actor } = await adminFor("users");
  if (userId === actor.userId) return { ok: false, error: "You can't change your own account status." };
  const db = await getDb();
  await db.tx(async (q) => {
    await q.query(`update users set status = $2 where id = $1`, [userId, status]);
    if (status === "suspended") await q.query(`delete from sessions where user_id = $1`, [userId]);
    await audit(q, actor, `user.${status}`, "user", userId);
  });
  revalidatePath("/admin/users");
  return { ok: true, message: `User ${status}` };
}

export async function grantRoleAction(userId: string, role: string, grant: boolean): Promise<R> {
  const { actor } = await adminFor("users");
  if (!["super_admin", "operations_manager", "finance_manager", "support_agent", "verification_officer"].includes(role)) return { ok: false, error: "Unknown role" };
  if (userId === actor.userId && !grant && role === "super_admin") return { ok: false, error: "You can't remove your own super admin role." };
  const db = await getDb();
  if (grant) await db.query(`insert into admin_roles (user_id, role) values ($1,$2) on conflict do nothing`, [userId, role]);
  else await db.query(`delete from admin_roles where user_id = $1 and role = $2`, [userId, role]);
  await audit(db, actor, grant ? "role.granted" : "role.revoked", "user", userId, { role });
  revalidatePath("/admin/users");
  return { ok: true, message: grant ? "Role granted" : "Role revoked" };
}

export async function addTerminalAction(form: FormData): Promise<R> {
  const { actor } = await adminFor("network");
  const city = String(form.get("city"));
  const name = String(form.get("name") ?? "").trim();
  const address = String(form.get("address") ?? "").trim();
  if (name.length < 3 || address.length < 5) return { ok: false, error: "Enter a terminal name and full address." };
  const id = `${city}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
  const db = await getDb();
  try { await db.query(`insert into terminals (id, city_id, name, address, lat, lng) select $1, $2, $3, $4, lat, lng from cities where id = $2`, [id, city, name, address]); } catch { return { ok: false, error: "A terminal with that name already exists in this city." }; }
  await audit(db, actor, "terminal.created", "terminal", id);
  revalidatePath("/admin/network");
  return { ok: true, message: "Terminal added" };
}
