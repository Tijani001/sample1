"use server";
import { z } from "zod";
import { getDb, getSessionUser, clientIp } from "@/lib/server";
import { rateLimit } from "@/lib/rate-limit";
import { emailSchema, phoneSchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";

export type JoinState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean } | null;
const schema = z.object({
  company: z.string().trim().min(3, "Enter the company name").max(100),
  rc: z.string().trim().regex(/^(RC|BN)?-?\d{4,8}$/i, "Enter a valid CAC registration number, e.g. RC123456"),
  city: z.string().min(2),
  email: emailSchema,
  phone: phoneSchema,
  fleet: z.coerce.number().int().min(1, "Fleet size must be at least 1").max(5000),
  seating: z.enum(["assigned", "open"]),
  integration: z.enum(["native", "api", "manual", "import"]),
});

/** Operator onboarding: creates a pending operator that cannot sell until verified by Goroada. */
export async function applyOperatorAction(_: JoinState, form: FormData): Promise<JoinState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in or create an account first, so you can manage your operator portal." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const db = await getDb();
  if (!(await rateLimit(db, `opjoin:${await clientIp()}`, 3, 86400)).ok) return { error: "Too many applications from this network today." };
  if (user.operator) return { error: `Your account already manages ${user.operator.name}.` };
  const d = parsed.data;
  const id = `${d.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
  await db.tx(async (q) => {
    await q.query(`insert into operators (id, name, legal_name, status, description, initials, support_phone, support_email, hq_city_id, seating_mode, integration_type, rc_number)
                   values ($1,$2,$2,'pending','',$3,$4,$5,$6,$7,$8,$9)`,
      [id, d.company, d.company.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(), d.phone, d.email, d.city, d.seating, d.integration, d.rc.toUpperCase()]);
    await q.query(`insert into operator_staff (user_id, operator_id, role) values ($1,$2,'owner')`, [user.id, id]);
    for (const kind of ["cac_certificate", "operating_licence", "insurance"]) {
      const file = form.get(kind);
      if (file instanceof File && file.size > 0) {
        if (file.size > 5_000_000 || !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) throw new Error("Documents must be PDF, JPG or PNG under 5 MB.");
        // Production: stream to private object storage (e.g. Supabase Storage) with malware scanning. We record metadata only.
        await q.query(`insert into operator_documents (operator_id, kind, file_name) values ($1,$2,$3)`, [id, kind, file.name.slice(0, 120)]);
      }
    }
    await audit(q, { userId: user.id, label: "operator_applicant" }, "operator.applied", "operator", id, { fleet: d.fleet });
  });
  return { ok: true };
}
