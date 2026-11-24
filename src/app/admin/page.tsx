import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getDb } from "@/lib/server";
import { adminFor } from "./guard";
import { PageHeader, Stat, Table } from "@/components/portal/shell";
import { Notice } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/money";
import { addDaysIso, formatDate, todayIso } from "@/lib/domain/time";

export const metadata = { title: "Overview" };

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { user } = await adminFor("overview");
  const { denied } = await searchParams;
  const db = await getDb();
  const [k] = await db.query<{ gmv30: number; commission30: number; bookings30: number; users: number; operators: number; pending_ops: number; refunds_pending: number; recon: number; open_tickets: number; failed_payments24: number }>(
    `select (select coalesce(sum(total),0) from bookings where status = 'confirmed' and confirmed_at > now() - interval '30 days')::int gmv30,
            (select coalesce(sum(amount),0) from platform_commissions where created_at > now() - interval '30 days')::int commission30,
            (select count(*) from bookings where confirmed_at > now() - interval '30 days')::int bookings30,
            (select count(*) from users)::int users,
            (select count(*) from operators where status = 'verified')::int operators,
            (select count(*) from operators where status = 'pending')::int pending_ops,
            (select count(*) from refunds where status in ('pending','approved'))::int refunds_pending,
            (select count(*) from bookings where status = 'needs_reconciliation')::int recon,
            (select count(*) from support_tickets where status in ('open','pending'))::int open_tickets,
            (select count(*) from payments where status = 'failed' and created_at > now() - interval '24 hours')::int failed_payments24`);
  const daily = await db.query<{ d: string; n: number; gmv: number }>(`select to_char(confirmed_at at time zone 'Africa/Lagos','YYYY-MM-DD') d, count(*)::int n, sum(total)::int gmv from bookings where confirmed_at > now() - interval '14 days' group by 1`);
  const series = Array.from({ length: 14 }, (_, i) => { const d = addDaysIso(todayIso(), i - 13); const r = daily.find((x) => x.d === d); return { d, n: r?.n ?? 0, gmv: r?.gmv ?? 0 }; });
  const max = Math.max(1, ...series.map((s) => s.n));
  const topRoutes = await db.query<{ route: string; n: number; gmv: number }>(
    `select oc.name || ' → ' || dc.name route, count(*)::int n, sum(pc.gross)::int gmv from platform_commissions pc join booking_segments bs on bs.id = pc.segment_id join trips t on t.id = bs.trip_id join routes r on r.id = t.route_id
       join cities oc on oc.id = r.origin_city_id join cities dc on dc.id = r.destination_city_id group by 1 order by 2 desc limit 6`);
  const fraud = await db.query<{ signal: string; subject: string; count: number }>(
    `select 'Repeated failed payments' signal, b.contact_email subject, count(*)::int count from payments p join bookings b on b.id = p.booking_id where p.status = 'failed' and p.created_at > now() - interval '24 hours' group by b.contact_email having count(*) >= 3
     union all
     select 'High booking velocity', contact_email, count(*)::int from bookings where created_at > now() - interval '24 hours' and contact_email is not null group by contact_email having count(*) >= 6
     union all
     select 'Payment amount mismatch', reference, 1 from payments where failure_reason = 'mismatch'`);
  return (
    <>
      <PageHeader title="Platform overview" subtitle={`Signed in as ${user.name}`} />
      {denied && <Notice tone="warning" className="mb-5">Your role doesn&apos;t include access to that area.</Notice>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="GMV (30 days)" value={formatMoney(k.gmv30)} />
        <Stat label="Commission (30 days)" value={formatMoney(k.commission30)} />
        <Stat label="Bookings (30 days)" value={k.bookings30} />
        <Stat label="Registered users" value={k.users} />
        <Stat label="Verified operators" value={k.operators} sub={<Link href="/admin/operators" className="underline">{k.pending_ops} pending</Link>} />
        <Stat label="Refunds to process" value={k.refunds_pending} tone={k.refunds_pending ? "warning" : undefined} />
        <Stat label="Needs reconciliation" value={k.recon} tone={k.recon ? "warning" : undefined} />
        <Stat label="Open support tickets" value={k.open_tickets} />
        <Stat label="Failed payments (24h)" value={k.failed_payments24} />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2 [&>section]:min-w-0">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">Confirmed bookings · 14 days</h2>
          <div className="mt-4 flex h-40 items-end gap-1.5" role="img" aria-label="Bookings per day">
            {series.map((s) => <div key={s.d} className="group relative flex-1"><div className="rounded-t-md bg-navy-600 group-hover:bg-coral-600" style={{ height: `${Math.max(2, (s.n / max) * 150)}px` }} /><span className="absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[11px] text-white group-hover:block">{s.n} · {formatMoney(s.gmv)}</span></div>)}
          </div>
          <p className="mt-1 text-xs text-ink-3">{formatDate(`${series[0].d}T12:00:00Z`, "UTC", "weekday")} – today</p>
        </section>
        <section><h2 className="mb-3 text-lg font-semibold">Top routes</h2>
          <Table head={["Route", "Bookings", "Gross"]}>{topRoutes.map((r) => <tr key={r.route}><td>{r.route}</td><td className="tabular">{r.n}</td><td className="tabular">{formatMoney(r.gmv)}</td></tr>)}</Table></section>
      </div>
      <section className="mt-6"><h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><ShieldAlert className="h-5 w-5 text-coral-600" />Fraud monitoring</h2>
        <Table head={["Signal", "Subject", "Count"]} empty={fraud.length ? undefined : "No fraud signals in the last 24 hours."}>{fraud.map((f, i) => <tr key={i}><td>{f.signal}</td><td className="font-mono text-xs">{f.subject}</td><td>{f.count}</td></tr>)}</Table></section>
    </>
  );
}
