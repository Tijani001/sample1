import { getDb } from "@/lib/server";
import { adminFor } from "../guard";
import { PageHeader } from "@/components/portal/shell";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { formatDate, formatTime } from "@/lib/domain/time";
import { Reply } from "./reply";
import { Headphones } from "lucide-react";

export const metadata = { title: "Support" };
export default async function AdminSupport() {
  await adminFor("support");
  const tickets = await (await getDb()).query<{ id: string; reference: string; category: string; subject: string; status: string; priority: string; contact_email: string; created_at: Date; booking: string | null; messages: { author_kind: string; body: string; created_at: string }[] }>(
    `select t.id, t.reference, t.category, t.subject, t.status, t.priority, t.contact_email, t.created_at, b.reference booking,
            coalesce((select json_agg(json_build_object('author_kind', m.author_kind, 'body', m.body, 'created_at', m.created_at) order by m.created_at) from support_messages m where m.ticket_id = t.id), '[]') messages
       from support_tickets t left join bookings b on b.id = t.booking_id order by case t.status when 'open' then 0 when 'pending' then 1 else 2 end, t.created_at desc limit 50`);
  return (
    <>
      <PageHeader title="Customer support" subtitle="Requests, disputes and lost property" />
      {tickets.length === 0 ? <EmptyState icon={<Headphones className="h-6 w-6" />} title="No support requests">New requests from the help centre appear here.</EmptyState> : (
        <ul className="space-y-4">
          {tickets.map((t) => (
            <li key={t.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm">{t.reference}</span><Badge tone={t.status === "open" ? "warning" : t.status === "resolved" ? "success" : "info"}>{t.status}</Badge><Badge>{t.category.replace("_", " ")}</Badge>{t.priority === "high" && <Badge tone="danger">high priority</Badge>}<span className="ml-auto text-xs text-ink-3">{formatDate(t.created_at)} {formatTime(t.created_at)}</span></div>
              <p className="mt-2 font-semibold">{t.subject}</p>
              <p className="text-xs text-ink-3">{t.contact_email}{t.booking && ` · booking ${t.booking}`}</p>
              <ul className="mt-3 space-y-2">{t.messages.map((m, i) => <li key={i} className={m.author_kind === "agent" ? "ml-8 rounded-xl bg-navy-50 p-3 text-sm" : "mr-8 rounded-xl bg-surface-2 p-3 text-sm"}><p className="text-xs font-medium text-ink-3">{m.author_kind === "agent" ? "Goroada" : "Customer"}</p>{m.body}</li>)}</ul>
              {t.status !== "resolved" && t.status !== "closed" && <Reply ticketId={t.id} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
