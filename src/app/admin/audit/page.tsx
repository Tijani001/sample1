import { getDb } from "@/lib/server";
import { adminFor } from "../guard";
import { PageHeader, Table } from "@/components/portal/shell";
import { formatDate, formatTime } from "@/lib/domain/time";

export const metadata = { title: "Audit log" };
export default async function AuditLog({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await adminFor("audit");
  const { q = "" } = await searchParams;
  const rows = await (await getDb()).query<{ id: number; actor_label: string; action: string; entity_type: string; entity_id: string | null; data: Record<string, unknown>; created_at: Date; ip: string | null }>(
    `select id, actor_label, action, entity_type, entity_id, data, created_at, ip from audit_logs where $1 = '' or action ilike '%' || $1 || '%' or entity_id ilike '%' || $1 || '%' order by id desc limit 200`, [q]);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Immutable record of important actions" />
      <form className="mb-4"><input name="q" defaultValue={q} placeholder="Filter by action or entity" aria-label="Filter" className="h-10 w-72 rounded-lg border border-line-strong px-3 text-sm" /></form>
      <Table head={["When", "Actor", "Action", "Entity", "Details"]}>
        {rows.map((r) => <tr key={r.id}><td className="whitespace-nowrap text-xs">{formatDate(r.created_at)} {formatTime(r.created_at)}</td><td className="text-xs">{r.actor_label}</td><td className="font-mono text-xs">{r.action}</td><td className="text-xs">{r.entity_type}<span className="block font-mono text-ink-3">{r.entity_id?.slice(0, 36)}</span></td><td className="max-w-xs truncate font-mono text-[11px] text-ink-3">{JSON.stringify(r.data)}</td></tr>)}
      </Table>
    </>
  );
}
