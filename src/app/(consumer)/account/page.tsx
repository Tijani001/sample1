import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bell, CreditCard, Heart, LifeBuoy, LogOut, Lock, ShieldCheck, Ticket, User, Users, Wallet } from "lucide-react";
import { getDb, getSessionUser } from "@/lib/server";
import { signOutAction } from "./actions";
import { formatMoney } from "@/lib/domain/money";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = (await getSessionUser())!;
  const db = await getDb();
  const [[{ trips }], [{ pax }]] = await Promise.all([
    db.query<{ trips: number }>(`select count(*)::int trips from bookings where user_id = $1 and status = 'confirmed'`, [user.id]),
    db.query<{ pax: number }>(`select count(*)::int pax from saved_passengers where user_id = $1`, [user.id]),
  ]);
  const links = [
    { href: "/account/profile", icon: User, t: "Personal info", d: "Name, phone and home city" },
    { href: "/trips", icon: Ticket, t: "Booking history", d: `${trips} confirmed booking${trips === 1 ? "" : "s"}` },
    { href: "/account/passengers", icon: Users, t: "Saved passengers", d: `${pax} saved for faster checkout` },
    { href: "/account/favourites", icon: Heart, t: "Favourite routes and operators", d: "Quick access to trips you take often" },
    { href: "/account/notifications", icon: Bell, t: "Notification preferences", d: "Email, SMS, push and WhatsApp" },
    { href: "/account/security", icon: Lock, t: "Security", d: "Password and signed-in devices" },
    { href: "/account/privacy", icon: ShieldCheck, t: "Privacy", d: "Your data rights under the NDPA" },
    { href: "/help", icon: LifeBuoy, t: "Help and support", d: "FAQs and contact" },
  ];
  return (
    <div>
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-navy-600 text-lg font-semibold text-white">{user.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
        <div><h1 className="text-2xl font-semibold">{user.name}</h1><p className="text-[15px] text-ink-3">{user.email}</p></div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4"><Wallet className="h-5 w-5 text-navy-500" /><div><p className="text-sm text-ink-3">Travel credit</p><p className="font-semibold tabular">{formatMoney(0)}</p></div><p className="ml-auto max-w-[150px] text-right text-xs text-ink-3">Credits from goodwill gestures or referrals appear here.</p></div>
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4"><CreditCard className="h-5 w-5 text-navy-500" /><div><p className="text-sm text-ink-3">Payment preferences</p><p className="font-semibold">Pay at checkout</p></div><p className="ml-auto max-w-[150px] text-right text-xs text-ink-3">We don&apos;t store cards. Providers may offer saved cards securely.</p></div>
      </div>
      <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white">
        {links.map(({ href, icon: Icon, t, d }) => (
          <li key={href}><Link href={href} className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-2"><span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-navy-600"><Icon className="h-5 w-5" /></span><span className="flex-1"><span className="block font-medium">{t}</span><span className="block text-[13px] text-ink-3">{d}</span></span><ArrowRight className="h-4 w-4 text-ink-3" /></Link></li>
        ))}
      </ul>
      {(user.operator || user.adminRoles.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {user.operator && <Link href="/operator" className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium hover:bg-surface-2">Operator portal · {user.operator.name}</Link>}
          {user.adminRoles.length > 0 && <Link href="/admin" className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium hover:bg-surface-2">Admin portal</Link>}
        </div>
      )}
      <form action={signOutAction} className="mt-6"><button className="inline-flex h-11 items-center gap-2 rounded-lg px-3 font-medium text-danger hover:bg-danger-bg"><LogOut className="h-4 w-4" />Sign out</button></form>
    </div>
  );
}
