import { requireUser } from "@/lib/auth/guards";
import { getDb } from "@/lib/server";
import { updateNotificationPrefsAction } from "../actions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Notification preferences" };
export default async function NotificationPrefs() {
  const user = await requireUser("/account/notifications");
  const [p] = await (await getDb()).query<{ notification_prefs: Record<string, boolean> }>(`select notification_prefs from user_profiles where user_id = $1`, [user.id]);
  const prefs = p.notification_prefs;
  const row = (name: string, label: string, desc: string) => (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-4">
      <span><span className="block font-medium">{label}</span><span className="block text-sm text-ink-3">{desc}</span></span>
      <input type="checkbox" name={name} defaultChecked={!!prefs[name]} className="mt-1 h-5 w-5 accent-[var(--color-navy-600)]" />
    </label>
  );
  return (
    <div>
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <p className="mt-1 text-base text-ink-3">Booking confirmations, payment receipts, cancellations and safety-critical journey changes are always sent. Choose the channels you prefer.</p>
      <form action={updateNotificationPrefsAction} className="mt-6 rounded-2xl border border-line bg-white px-5">
        <div className="divide-y divide-line">
          {row("email", "Email", "Tickets, receipts and trip reminders")}
          {row("sms", "SMS", "Departure reminders and delay alerts")}
          {row("push", "Push notifications", "Real-time journey updates on this device")}
          {row("whatsapp", "WhatsApp", "Available once Goroada's WhatsApp Business channel is connected")}
          {row("marketing", "Offers and promotions", "Occasional deals. Never more than once a week.")}
        </div>
        <div className="py-4"><Button variant="navy">Save preferences</Button></div>
      </form>
    </div>
  );
}
