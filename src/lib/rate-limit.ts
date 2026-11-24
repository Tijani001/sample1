import type { Db } from "@/lib/db/client";

/** Fixed-window rate limiter backed by the database so it works across server instances. */
export async function rateLimit(db: Db, key: string, limit: number, windowSeconds: number) {
  const [row] = await db.query<{ count: number; window_start: Date }>(
    `insert into rate_limits (key, window_start, count) values ($1, now(), 1)
     on conflict (key) do update set
       count = case when rate_limits.window_start < now() - make_interval(secs => $2) then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - make_interval(secs => $2) then now() else rate_limits.window_start end
     returning count, window_start`,
    [key, windowSeconds],
  );
  const retryAfter = Math.max(0, Math.ceil((new Date(row.window_start).getTime() + windowSeconds * 1000 - Date.now()) / 1000));
  return { ok: row.count <= limit, remaining: Math.max(0, limit - row.count), retryAfter };
}
