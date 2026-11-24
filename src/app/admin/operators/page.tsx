import { getDb } from "@/lib/server";
import { adminFor } from "../guard";
import { PageHeader, Table } from "@/components/portal/shell";
import { Badge } from "@/components/ui/primitives";
import { ActionButton } from "@/components/portal/action-button";
import { setCommissionAction, setOperatorStatusAction } from "../actions";
import { CommissionInput } from "./commission";

export const metadata = { title: "Operators" };
export default async function AdminOperators() {
  await adminFor("operators");
  const ops = await (await getDb()).query<{ id: string; name: string; status: string; is_demo: boolean; rc_number: string | null; integration_type: string; commission_bps: number; created_at: Date; docs: { kind: string; file_name: string; status: string }[]; vehicles: number; routes: number }>(
    `select o.id, o.name, o.status, o.is_demo, o.rc_number, o.integration_type, o.commission_bps, o.created_at,
            coalesce((select json_agg(json_build_object('kind', d.kind, 'file_name', d.file_name, 'status', d.status)) from operator_documents d where d.operator_id = o.id), '[]') docs,
            (select count(*) from vehicles v where v.operator_id = o.id)::int vehicles, (select count(*) from routes r where r.operator_id = o.id)::int routes
       from operators o order by case o.status when 'pending' then 0 else 1 end, o.name`);
  return (
    <>
      <PageHeader title="Operators" subtitle="Verification, status and commission" />
      <Table head={["Operator", "Verification documents", "Integration", "Commission", "Status", "Actions"]}>
        {ops.map((o) => (
          <tr key={o.id} className="align-top">
            <td className="font-medium">{o.name}{o.is_demo && <Badge className="ml-2">Demo</Badge>}<span className="block text-xs text-ink-3">{o.rc_number ?? "No RC number"} · {o.vehicles} vehicles · {o.routes} routes</span></td>
            <td className="text-xs">{o.docs.length ? o.docs.map((d) => <span key={d.kind} className="block">{d.kind.replace(/_/g, " ")}: <span className={d.status === "approved" ? "text-success" : "text-warning"}>{d.status}</span></span>) : <span className="text-danger">None uploaded</span>}</td>
            <td className="text-xs capitalize">{o.integration_type}</td>
            <td><CommissionInput id={o.id} value={o.commission_bps / 100} action={setCommissionAction} /></td>
            <td><Badge tone={o.status === "verified" ? "success" : o.status === "pending" ? "warning" : "danger"}>{o.status}</Badge></td>
            <td className="space-x-1 whitespace-nowrap">
              {o.status !== "verified" && <ActionButton size="sm" variant="navy" action={setOperatorStatusAction.bind(null, o.id, "verified")} confirmText={`Verify ${o.name}? They will be able to accept live bookings.`}>Verify</ActionButton>}
              {o.status === "verified" && <ActionButton size="sm" variant="danger" action={setOperatorStatusAction.bind(null, o.id, "suspended")} confirmText={`Suspend ${o.name}? Their departures will be hidden from search.`}>Suspend</ActionButton>}
              {o.status === "pending" && <ActionButton size="sm" variant="ghost" action={setOperatorStatusAction.bind(null, o.id, "rejected")}>Reject</ActionButton>}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
