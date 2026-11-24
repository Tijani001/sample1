import { getDb } from "@/lib/server";
import { adminFor } from "../guard";
import { PageHeader, Table } from "@/components/portal/shell";
import { Badge } from "@/components/ui/primitives";
import { ActionButton } from "@/components/portal/action-button";
import { grantRoleAction, setUserStatusAction } from "../actions";
import { formatDate } from "@/lib/domain/time";
import { ADMIN_ACCESS } from "@/lib/auth/rbac";

export const metadata = { title: "Users & roles" };
const ROLES = ["super_admin", "operations_manager", "finance_manager", "support_agent", "verification_officer"];

export default async function AdminUsers() {
  await adminFor("users");
  const users = await (await getDb()).query<{ id: string; email: string; phone: string; status: string; created_at: Date; name: string; roles: string[] | null; operator: string | null; bookings: number }>(
    `select u.id, u.email, u.phone, u.status, u.created_at, p.full_name name, (select array_agg(role) from admin_roles a where a.user_id = u.id) roles,
            (select o.name from operator_staff s join operators o on o.id = s.operator_id where s.user_id = u.id limit 1) operator, (select count(*) from bookings b where b.user_id = u.id)::int bookings
       from users u join user_profiles p on p.user_id = u.id order by u.created_at desc limit 200`);
  return (
    <>
      <PageHeader title="Users & roles" subtitle="Role-based access: each role sees only what it needs" />
      <div className="mb-5 grid gap-2 rounded-2xl border border-line bg-white p-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.filter((r) => r !== "super_admin").map((r) => <p key={r}><b className="capitalize">{r.replace(/_/g, " ")}</b>: {Object.entries(ADMIN_ACCESS).filter(([, roles]) => (roles as readonly string[]).includes(r)).map(([a]) => a).join(", ")}</p>)}
        <p><b>Super admin</b>: everything, including users, roles and audit log</p>
      </div>
      <Table head={["User", "Type", "Roles", "Bookings", "Status", ""]}>
        {users.map((u) => (
          <tr key={u.id} className="align-top">
            <td className="font-medium">{u.name}<span className="block text-xs text-ink-3">{u.email} · joined {formatDate(u.created_at)}</span></td>
            <td className="text-xs">{u.operator ? `Operator · ${u.operator}` : u.roles?.length ? "Staff" : "Traveller"}</td>
            <td><div className="flex max-w-xs flex-wrap gap-1">{ROLES.map((r) => { const has = u.roles?.includes(r); return <ActionButton key={r} size="sm" variant={has ? "navy" : "outline"} className="h-7 px-2 text-[11px]" action={grantRoleAction.bind(null, u.id, r, !has)} confirmText={`${has ? "Remove" : "Grant"} ${r.replace(/_/g, " ")} for ${u.name}?`}>{r.replace(/_/g, " ")}</ActionButton>; })}</div></td>
            <td className="tabular">{u.bookings}</td>
            <td><Badge tone={u.status === "active" ? "success" : "danger"}>{u.status}</Badge></td>
            <td><ActionButton size="sm" variant="ghost" action={setUserStatusAction.bind(null, u.id, u.status === "active" ? "suspended" : "active")} confirmText={`${u.status === "active" ? "Suspend" : "Reactivate"} ${u.name}?`}>{u.status === "active" ? "Suspend" : "Reactivate"}</ActionButton></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
