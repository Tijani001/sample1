import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Bell, BellRing, Settings } from "lucide-react";
import { getDb, getSessionUser } from "@/lib/server";
import { EmptyState, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/domain/time";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Notifications" };

async function markAllRead() {
  "use server";
  const u = await getSessionUser();
  if (!u) return;
  await (await getDb()).query(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [u.id]);
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/notifications");
  const rows = await (await getDb()).query<{ id: string; category: string; kind: string; title: string; body: string; href: string | null; read_at: Date | null; created_at: Date }>(
    `select id, category, kind, title, body, href, read_at, created_at from notifications where user_id = $1 order by created_at desc limit 50`, [user.id]);
  return (
    <div className="container-page max-w-2xl py-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <div className="flex gap-2">
          {rows.some((r) => !r.read_at) && <form action={markAllRead}><Button variant="ghost" size="sm">Mark all read</Button></form>}
          <Button asChild variant="outline" size="sm"><Link href="/account/notifications"><Settings className="h-4 w-4" />Preferences</Link></Button>
        </div>
      </div>
      {rows.length === 0 ? <EmptyState className="mt-6" icon={<Bell className="h-6 w-6" />} title="You're all caught up">Booking confirmations, trip reminders and journey updates will appear here.</EmptyState> : (
        <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white">
          {rows.map((n) => (
            <li key={n.id}>
              <Link href={n.href ?? "#"} className={cn("flex gap-3 p-4 hover:bg-surface-2", !n.read_at && "bg-coral-50/40")}>
                <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full", n.read_at ? "bg-surface-2 text-ink-3" : "bg-coral-100 text-coral-700")}><BellRing className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium">{n.title}{n.category === "marketing" && <Badge>Offer</Badge>}{!n.read_at && <span className="h-2 w-2 rounded-full bg-coral-600" aria-label="Unread" />}</span>
                  <span className="mt-0.5 block text-sm text-ink-3">{n.body}</span>
                  <span className="mt-1 block text-xs text-ink-3">{formatDate(n.created_at, undefined, "weekday")} · {formatTime(n.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
