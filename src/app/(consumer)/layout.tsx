import { SiteHeader, BottomNav } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getDb, getSessionUser } from "@/lib/server";

export default async function ConsumerLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  let unread = 0;
  if (user) {
    const db = await getDb();
    const [r] = await db.query<{ n: number }>(`select count(*)::int n from notifications where user_id = $1 and read_at is null`, [user.id]);
    unread = r.n;
  }
  return (
    <>
      <SiteHeader user={user ? { name: user.name, email: user.email, isAdmin: user.adminRoles.length > 0, operatorName: user.operator?.name ?? null } : null} unread={unread} />
      <main id="main" className="min-h-[60vh]">{children}</main>
      <SiteFooter />
      <BottomNav />
    </>
  );
}
