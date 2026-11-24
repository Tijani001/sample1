import "server-only";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { canAccess, type AdminArea } from "@/lib/auth/rbac";

export async function adminFor(area: AdminArea) {
  const u = await requireAdmin();
  if (!canAccess(u.adminRoles, area)) redirect("/admin?denied=1");
  return { user: u, actor: { userId: u.id, label: `admin:${u.adminRoles.join("+")}` } };
}
