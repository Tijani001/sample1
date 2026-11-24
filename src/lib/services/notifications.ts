import type { Queryable } from "@/lib/db/client";

export type NotifyInput = {
  userId?: string | null;
  bookingId?: string | null;
  category: "transactional" | "marketing";
  kind: string;
  title: string;
  body: string;
  href?: string;
  /** Out-of-app channels; delivered by the outbox worker once providers are configured. */
  channels?: { email?: string | null; sms?: string | null; whatsapp?: string | null };
  template?: string;
};

/**
 * Creates an in-app notification and queues email / SMS / push / WhatsApp deliveries in the outbox.
 * Marketing messages respect the user's opt-in; transactional messages are always sent.
 */
export async function notify(q: Queryable, n: NotifyInput) {
  let prefs: Record<string, boolean> = { email: true, sms: true, push: true, whatsapp: false, marketing: false };
  if (n.userId) {
    const [p] = await q.query<{ notification_prefs: Record<string, boolean> }>(`select notification_prefs from user_profiles where user_id = $1`, [n.userId]);
    if (p) prefs = { ...prefs, ...p.notification_prefs };
  }
  if (n.category === "marketing" && !prefs.marketing) return;
  await q.query(
    `insert into notifications (user_id, booking_id, category, kind, title, body, href) values ($1,$2,$3,$4,$5,$6,$7)`,
    [n.userId ?? null, n.bookingId ?? null, n.category, n.kind, n.title, n.body, n.href ?? null],
  );
  const payload = JSON.stringify({ title: n.title, body: n.body, href: n.href ?? null, bookingId: n.bookingId ?? null });
  const providersConfigured = { email: !!process.env.EMAIL_PROVIDER_API_KEY, sms: !!process.env.SMS_PROVIDER_API_KEY, whatsapp: !!process.env.WHATSAPP_PROVIDER_TOKEN, push: !!process.env.WEB_PUSH_PRIVATE_KEY };
  const queue = async (channel: "email" | "sms" | "whatsapp" | "push", recipient: string | null | undefined) => {
    if (!recipient) return;
    if (n.category === "transactional" || prefs[channel]) {
      if (n.userId && prefs[channel] === false && n.category === "marketing") return;
      await q.query(
        `insert into notification_outbox (channel, recipient, template, payload, category, status) values ($1,$2,$3,$4,$5,$6)`,
        [channel, recipient, n.template ?? n.kind, payload, n.category, providersConfigured[channel] ? "queued" : "skipped_no_provider"],
      );
    }
  };
  await queue("email", n.channels?.email);
  await queue("sms", n.channels?.sms);
  if (prefs.whatsapp) await queue("whatsapp", n.channels?.whatsapp);
  if (n.userId && prefs.push) await queue("push", n.userId);
}
