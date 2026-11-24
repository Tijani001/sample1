import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies, headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { secureToken, sha256 } from "@/lib/domain/ids";

export const SESSION_COOKIE = "gr_session";
const ACCESS_COOKIE = "gr_access";
const SESSION_DAYS = 30;

export type AdminRole = "super_admin" | "operations_manager" | "finance_manager" | "support_agent" | "verification_officer";

export type SessionUser = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  adminRoles: AdminRole[];
  operator: { id: string; name: string; role: string } | null;
};

let cachedSecret: string | null = null;
/** Server secret for signing cookies. Set APP_SECRET in production; a random one is generated for local dev. */
export function appSecret() {
  if (cachedSecret) return cachedSecret;
  if (process.env.APP_SECRET) return (cachedSecret = process.env.APP_SECRET);
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEV_SECRET) throw new Error("APP_SECRET must be set in production");
  const file = path.join(process.cwd(), ".data", "dev-secret");
  try {
    cachedSecret = fs.readFileSync(file, "utf8").trim();
  } catch {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    cachedSecret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

const secureCookies = () => process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true";

export async function createSession(userId: string) {
  const db = await getDb();
  const token = secureToken(32);
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await db.query(`insert into sessions (token_hash, user_id, expires_at, user_agent) values ($1,$2, now() + make_interval(days => $3), $4)`, [sha256(token), userId, SESSION_DAYS, ua]);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: SESSION_DAYS * 86400 });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.query(`delete from sessions where token_hash = $1`, [sha256(token)]);
  }
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const db = await getDb();
  const [u] = await db.query<{ id: string; email: string | null; phone: string | null; full_name: string; roles: AdminRole[] | null; op_id: string | null; op_name: string | null; op_role: string | null }>(
    `select u.id, u.email, u.phone, p.full_name,
            (select array_agg(role) from admin_roles ar where ar.user_id = u.id) roles,
            os.operator_id op_id, o.name op_name, os.role op_role
       from sessions s join users u on u.id = s.user_id and u.status = 'active'
       join user_profiles p on p.user_id = u.id
       left join operator_staff os on os.user_id = u.id
       left join operators o on o.id = os.operator_id
      where s.token_hash = $1 and s.expires_at > now() limit 1`,
    [sha256(token)],
  );
  if (!u) return null;
  return { id: u.id, email: u.email, phone: u.phone, name: u.full_name, adminRoles: u.roles ?? [], operator: u.op_id ? { id: u.op_id, name: u.op_name!, role: u.op_role! } : null };
}

// ───────────────────────── Guest booking access grants ─────────────────────────
// Guests (no account) get a signed, httpOnly cookie listing the bookings this browser may view.

type Grant = { b: string; e: number };

function sign(payload: string) {
  return crypto.createHmac("sha256", appSecret()).update(payload).digest("base64url");
}

async function readGrants(): Promise<Grant[]> {
  const raw = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!raw) return [];
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return [];
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return [];
  try {
    const grants = JSON.parse(Buffer.from(payload, "base64url").toString()) as Grant[];
    return grants.filter((g) => g.e > Date.now());
  } catch {
    return [];
  }
}

export async function grantBookingAccess(bookingId: string, days = 120) {
  const grants = (await readGrants()).filter((g) => g.b !== bookingId);
  grants.unshift({ b: bookingId, e: Date.now() + days * 86400_000 });
  const payload = Buffer.from(JSON.stringify(grants.slice(0, 12))).toString("base64url");
  (await cookies()).set(ACCESS_COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: days * 86400 });
}

export async function grantedBookingIds() {
  return (await readGrants()).map((g) => g.b);
}

/** Whether the current visitor may view/manage a booking. */
export async function canAccessBooking(booking: { id: string; userId: string | null }, user?: SessionUser | null) {
  const u = user === undefined ? await getSessionUser() : user;
  if (u && booking.userId && booking.userId === u.id) return true;
  if (u && u.adminRoles.length) return true;
  return (await grantedBookingIds()).includes(booking.id);
}

export function hasAdminRole(user: SessionUser | null, ...roles: AdminRole[]) {
  if (!user) return false;
  return user.adminRoles.includes("super_admin") || roles.some((r) => user.adminRoles.includes(r));
}
