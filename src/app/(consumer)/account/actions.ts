"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, getSessionUser, clientIp } from "@/lib/server";
import { createSession, destroySession, grantedBookingIds } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { rateLimit } from "@/lib/rate-limit";
import { emailSchema, nameSchema, normalizePhone, passwordSchema, phoneSchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean; message?: string } | null;

function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/trips";
}

/** Links bookings made as a guest in this browser to the account that just signed in. */
async function claimGuestBookings(userId: string) {
  const ids = await grantedBookingIds();
  if (!ids.length) return;
  const db = await getDb();
  await db.query(`update bookings set user_id = $1 where id = any($2::uuid[]) and user_id is null`, [userId, ids]);
}

export async function signInAction(_: FormState, form: FormData): Promise<FormState> {
  const identifier = String(form.get("identifier") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!identifier || !password) return { error: "Enter your email or phone number and password." };
  const db = await getDb();
  const rl = await rateLimit(db, `signin:${await clientIp()}`, 10, 600);
  if (!rl.ok) return { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minutes.` };
  const phone = normalizePhone(identifier);
  const [u] = await db.query<{ id: string; password_hash: string; status: string }>(
    `select id, password_hash, status from users where lower(email) = lower($1) or phone = $2 limit 1`, [identifier, phone ?? "__none__"]);
  if (!u || !verifyPassword(password, u.password_hash)) return { error: "That email/phone and password don't match." };
  if (u.status !== "active") return { error: "This account is not active. Contact support." };
  await createSession(u.id);
  await claimGuestBookings(u.id);
  redirect(safeNext(form.get("next")));
}

const registerSchema = z.object({ name: nameSchema, email: emailSchema, phone: phoneSchema, password: passwordSchema, consent: z.literal("on", { message: "Please accept the terms to continue" }) });

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  const db = await getDb();
  const rl = await rateLimit(db, `register:${await clientIp()}`, 5, 3600);
  if (!rl.ok) return { error: "Too many sign-ups from this network. Please try again later." };
  const { name, email, phone, password } = parsed.data;
  const [exists] = await db.query(`select 1 from users where lower(email) = lower($1) or phone = $2`, [email, phone]);
  if (exists) return { error: "An account with this email or phone number already exists. Try signing in." };
  const userId = await db.tx(async (q) => {
    const [u] = await q.query<{ id: string }>(`insert into users (email, phone, password_hash) values ($1,$2,$3) returning id`, [email, phone, hashPassword(password)]);
    await q.query(`insert into user_profiles (user_id, full_name, marketing_opt_in) values ($1,$2,$3)`, [u.id, name, form.get("marketing") === "on"]);
    await audit(q, { userId: u.id, label: "user" }, "user.registered", "user", u.id);
    return u.id;
  });
  await createSession(userId);
  await claimGuestBookings(userId);
  redirect(safeNext(form.get("next")));
}

export async function signOutAction() {
  await destroySession();
  redirect("/");
}

const profileSchema = z.object({ name: nameSchema, phone: phoneSchema, homeCity: z.string().max(40).optional() });

export async function updateProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/account");
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const db = await getDb();
  const [clash] = await db.query(`select 1 from users where phone = $1 and id <> $2`, [parsed.data.phone, user.id]);
  if (clash) return { fieldErrors: { phone: "This phone number is linked to another account." } };
  await db.query(`update users set phone = $2 where id = $1`, [user.id, parsed.data.phone]);
  await db.query(`update user_profiles set full_name = $2, home_city_id = nullif($3,''), updated_at = now() where user_id = $1`, [user.id, parsed.data.name, parsed.data.homeCity ?? ""]);
  revalidatePath("/account");
  return { ok: true, message: "Profile updated" };
}

export async function updateNotificationPrefsAction(form: FormData) {
  const user = await getSessionUser();
  if (!user) return;
  const prefs = { email: form.get("email") === "on", sms: form.get("sms") === "on", push: form.get("push") === "on", whatsapp: form.get("whatsapp") === "on", marketing: form.get("marketing") === "on" };
  const db = await getDb();
  await db.query(`update user_profiles set notification_prefs = $2, marketing_opt_in = $3 where user_id = $1`, [user.id, JSON.stringify(prefs), prefs.marketing]);
  revalidatePath("/account/notifications");
}

const passengerSchema = z.object({ fullName: nameSchema, phone: z.union([phoneSchema, z.literal("")]).optional(), email: z.union([emailSchema, z.literal("")]).optional(), nokName: z.string().max(80).optional(), nokPhone: z.union([phoneSchema, z.literal("")]).optional() });

export async function savePassengerAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/account/passengers");
  const parsed = passengerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const db = await getDb();
  const [{ n }] = await db.query<{ n: number }>(`select count(*)::int n from saved_passengers where user_id = $1`, [user.id]);
  if (n >= 20) return { error: "You can save up to 20 passengers." };
  const d = parsed.data;
  await db.query(`insert into saved_passengers (user_id, full_name, phone, email, next_of_kin_name, next_of_kin_phone) values ($1,$2,nullif($3,''),nullif($4,''),nullif($5,''),nullif($6,''))`,
    [user.id, d.fullName, d.phone ?? "", d.email ?? "", d.nokName ?? "", d.nokPhone ?? ""]);
  revalidatePath("/account/passengers");
  return { ok: true, message: "Passenger saved" };
}

export async function deletePassengerAction(form: FormData) {
  const user = await getSessionUser();
  if (!user) return;
  const db = await getDb();
  await db.query(`delete from saved_passengers where id = $1 and user_id = $2`, [String(form.get("id")), user.id]);
  revalidatePath("/account/passengers");
}

export async function toggleFavouriteRouteAction(form: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  const from = String(form.get("from"));
  const to = String(form.get("to"));
  const db = await getDb();
  const del = await db.query(`delete from favourite_routes where user_id = $1 and origin_city_id = $2 and destination_city_id = $3 returning 1`, [user.id, from, to]);
  if (!del.length) await db.query(`insert into favourite_routes (user_id, origin_city_id, destination_city_id) values ($1,$2,$3) on conflict do nothing`, [user.id, from, to]);
  revalidatePath("/account/favourites");
  revalidatePath("/search");
}

export async function toggleFavouriteOperatorAction(form: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  const op = String(form.get("operator"));
  const db = await getDb();
  const del = await db.query(`delete from favourite_operators where user_id = $1 and operator_id = $2 returning 1`, [user.id, op]);
  if (!del.length) await db.query(`insert into favourite_operators (user_id, operator_id) values ($1,$2) on conflict do nothing`, [user.id, op]);
  revalidatePath("/account/favourites");
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  const current = String(form.get("current") ?? "");
  const next = passwordSchema.safeParse(String(form.get("next") ?? ""));
  if (!next.success) return { fieldErrors: { next: next.error.issues[0].message } };
  const db = await getDb();
  const [u] = await db.query<{ password_hash: string }>(`select password_hash from users where id = $1`, [user.id]);
  if (!verifyPassword(current, u.password_hash)) return { fieldErrors: { current: "Current password is incorrect." } };
  await db.tx(async (q) => {
    await q.query(`update users set password_hash = $2 where id = $1`, [user.id, hashPassword(next.data)]);
    await q.query(`delete from sessions where user_id = $1`, [user.id]);
    await audit(q, { userId: user.id, label: "user" }, "user.password_changed", "user", user.id);
  });
  await createSession(user.id);
  return { ok: true, message: "Password changed. Other devices have been signed out." };
}

export async function dataRequestAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  const kind = String(form.get("kind"));
  const email = user?.email ?? String(form.get("email") ?? "");
  if (!["access", "correction", "deletion", "portability", "objection"].includes(kind)) return { error: "Choose a request type." };
  if (!emailSchema.safeParse(email).success) return { fieldErrors: { email: "Enter a valid email address." } };
  const db = await getDb();
  await db.query(`insert into data_requests (user_id, email, kind, details) values ($1,$2,$3,$4)`, [user?.id ?? null, email, kind, String(form.get("details") ?? "").slice(0, 2000)]);
  return { ok: true, message: "Request received. We'll respond within 30 days as required by the Nigeria Data Protection Act." };
}
