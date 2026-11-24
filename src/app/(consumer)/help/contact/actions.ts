"use server";
import { z } from "zod";
import { getDb, getSessionUser, clientIp } from "@/lib/server";
import { rateLimit } from "@/lib/rate-limit";
import { supportReference } from "@/lib/domain/ids";
import { emailSchema } from "@/lib/validation";
import { notify } from "@/lib/services/notifications";

export type ContactState = { error?: string; fieldErrors?: Record<string, string>; reference?: string } | null;
const schema = z.object({
  email: emailSchema,
  category: z.enum(["booking", "payment", "cancellation", "lost_property", "operator", "technical", "other"]),
  booking: z.string().trim().max(12).optional(),
  subject: z.string().trim().min(4, "Add a short subject").max(120),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(4000),
});

export async function createTicketAction(_: ContactState, form: FormData): Promise<ContactState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const db = await getDb();
  const rl = await rateLimit(db, `support:${await clientIp()}`, 8, 3600);
  if (!rl.ok) return { error: "You've sent several requests recently. Please wait before sending another." };
  const user = await getSessionUser();
  const d = parsed.data;
  const [b] = d.booking ? await db.query<{ id: string }>(`select id from bookings where upper(reference) = upper($1)`, [d.booking]) : [];
  const ref = supportReference();
  await db.tx(async (q) => {
    const [t] = await q.query<{ id: string }>(
      `insert into support_tickets (reference, user_id, booking_id, contact_email, category, subject, priority) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [ref, user?.id ?? null, b?.id ?? null, d.email, d.category, d.subject, d.category === "payment" ? "high" : "normal"]);
    await q.query(`insert into support_messages (ticket_id, author_kind, author_user_id, body) values ($1,'customer',$2,$3)`, [t.id, user?.id ?? null, d.message]);
    await notify(q, { userId: user?.id, category: "transactional", kind: "support_ticket_created", title: `Support request ${ref} received`, body: "We usually reply within a few hours.", href: "/help", channels: { email: d.email } });
  });
  return { reference: ref };
}
