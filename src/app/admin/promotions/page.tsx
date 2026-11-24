import { getDb } from "@/lib/server";
import { adminFor } from "../guard";
import { PageHeader, Table } from "@/components/portal/shell";
import { Badge, Field, Input, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ActionButton, ActionForm } from "@/components/portal/action-button";
import { createPromotionAction, togglePromotionAction } from "../actions";
import { formatMoney } from "@/lib/domain/money";
import { formatDate } from "@/lib/domain/time";

export const metadata = { title: "Promotions" };
export default async function AdminPromotions() {
  await adminFor("promotions");
  const rows = await (await getDb()).query<{ code: string; title: string; kind: string; value: number; active: boolean; starts_at: Date; ends_at: Date; usage_limit: number | null; used: number; discount: number }>(
    `select p.code, p.title, p.kind, p.value, p.active, p.starts_at, p.ends_at, p.usage_limit, count(r.id)::int used, coalesce(sum(r.amount),0)::int discount from promotions p left join promo_redemptions r on r.promotion_id = p.id group by p.id order by p.created_at desc`);
  return (
    <>
      <PageHeader title="Promotions" subtitle="Campaigns, codes and redemptions" />
      <Table head={["Code", "Offer", "Validity", "Redemptions", "Discount given", "Status"]}>
        {rows.map((p) => { const expired = new Date(p.ends_at) < new Date(); return (
          <tr key={p.code}><td className="font-mono font-semibold">{p.code}</td><td>{p.title}<span className="block text-xs text-ink-3">{p.kind === "percent" ? `${p.value}%` : formatMoney(p.value)} off</span></td><td className="text-xs">{formatDate(p.starts_at)} – {formatDate(p.ends_at)}</td><td className="tabular">{p.used}{p.usage_limit ? ` / ${p.usage_limit}` : ""}</td><td className="tabular">{formatMoney(p.discount)}</td>
            <td><ActionButton size="sm" variant="ghost" action={togglePromotionAction.bind(null, p.code)}><Badge tone={expired ? "neutral" : p.active ? "success" : "warning"}>{expired ? "expired" : p.active ? "active" : "paused"}</Badge></ActionButton></td></tr>); })}
      </Table>
      <section className="mt-8 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">New promotion</h2>
        <ActionForm action={createPromotionAction} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Code" htmlFor="code"><Input id="code" name="code" className="font-mono uppercase" required /></Field>
          <Field label="Title" htmlFor="title"><Input id="title" name="title" required /></Field>
          <Field label="Type" htmlFor="kind"><Select id="kind" name="kind"><option value="percent">Percent off</option><option value="fixed">Fixed amount (₦)</option></Select></Field>
          <Field label="Value" htmlFor="value"><Input id="value" name="value" type="number" min={1} required /></Field>
          <Field label="Max discount (₦)" htmlFor="max" optional><Input id="max" name="max" type="number" /></Field>
          <Field label="Min fare spend (₦)" htmlFor="min" optional><Input id="min" name="min" type="number" defaultValue={0} /></Field>
          <Field label="Valid for (days)" htmlFor="days"><Input id="days" name="days" type="number" defaultValue={30} min={1} max={365} /></Field>
          <Field label="Total usage limit" htmlFor="limit" optional><Input id="limit" name="limit" type="number" /></Field>
          <Field label="Description" htmlFor="description" className="sm:col-span-2 lg:col-span-3"><Input id="description" name="description" /></Field>
          <div className="flex items-end"><Button variant="navy" className="w-full">Create</Button></div>
        </ActionForm>
      </section>
    </>
  );
}
