import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, hasAdminRole, type AdminRole, type SessionUser } from "./session";

export async function requireOperator(): Promise<SessionUser & { operator: NonNullable<SessionUser["operator"]> }> {
  const u = await getSessionUser();
  if (!u) redirect("/signin?next=/operator");
  if (!u.operator) redirect("/operators/join");
  return u as SessionUser & { operator: NonNullable<SessionUser["operator"]> };
}

/** Role-based access for the admin portal. super_admin implicitly has every role. */
export async function requireAdmin(...roles: AdminRole[]): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/signin?next=/admin");
  if (!u.adminRoles.length) redirect("/");
  if (roles.length && !hasAdminRole(u, ...roles)) redirect("/admin?denied=1");
  return u;
}
