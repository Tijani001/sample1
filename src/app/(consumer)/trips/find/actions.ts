"use server";
import { redirect } from "next/navigation";
import { getDb, clientIp } from "@/lib/server";
import { grantBookingAccess } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/validation";
import { audit } from "@/lib/services/audit";

export type FindState = { error?: string } | null;

/**
 * Guest booking retrieval: booking reference + the email or phone used at checkout.
 * Rate-limited per network and per reference to prevent enumeration.
 */
export async function findBookingAction(_: FindState, form: FormData): Promise<FindState> {
  const reference = String(form.get("reference") ?? "").trim().toUpperCase();
  const contact = String(form.get("contact") ?? "").trim();
  if (!/^GR-[A-Z0-9]{6}$/.test(reference)) return { error: "Enter your booking reference, e.g. GR-7K2QXM." };
  if (!contact) return { error: "Enter the email or phone number used for the booking." };
  const db = await getDb();
  const ip = await clientIp();
  const a = await rateLimit(db, `find:${ip}`, 10, 900);
  const b = await rateLimit(db, `find-ref:${reference}`, 5, 900);
  if (!a.ok || !b.ok) return { error: "Too many attempts. Please wait 15 minutes and try again." };
  const phone = normalizePhone(contact);
  const [row] = await db.query<{ id: string; reference: string }>(
    `select id, reference from bookings where reference = $1 and (lower(contact_email) = lower($2) or contact_phone = $3)`,
    [reference, contact, phone ?? "__none__"],
  );
  if (!row) return { error: "We couldn't find a booking with those details. Check the reference and contact details." };
  await grantBookingAccess(row.id);
  await audit(db, { userId: null, label: "guest", ip }, "booking.retrieved", "booking", row.id, {});
  redirect(`/trips/${row.reference}`);
}
