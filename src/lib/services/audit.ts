import type { Queryable } from "@/lib/db/client";

export type Actor = { userId: string | null; label: string; ip?: string | null };
export const SYSTEM_ACTOR: Actor = { userId: null, label: "system" };

/** Records an important action. Keep `data` free of raw personal or payment details. */
export async function audit(q: Queryable, actor: Actor, action: string, entityType: string, entityId: string | null, data: Record<string, unknown> = {}) {
  await q.query(
    `insert into audit_logs (actor_user_id, actor_label, action, entity_type, entity_id, data, ip) values ($1,$2,$3,$4,$5,$6,$7)`,
    [actor.userId, actor.label, action, entityType, entityId, JSON.stringify(data), actor.ip ?? null],
  );
}
