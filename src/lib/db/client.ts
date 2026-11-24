import "server-only";
import fs from "node:fs";
import path from "node:path";
import { log } from "@/lib/log";

/**
 * Database access layer.
 *
 * - With DATABASE_URL set (e.g. Supabase Postgres), queries go through `postgres` (porsager/postgres).
 * - Without it, Goroada runs an embedded PostgreSQL (PGlite) persisted under `.data/pglite` so the whole
 *   platform works locally with zero infrastructure. Both paths execute the same SQL and migrations.
 */

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  /** Runs `fn` inside a single transaction. Throwing rolls it back. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly kind: "pglite" | "postgres";
}

async function createPglite(dataDir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (!dataDir.startsWith("memory://")) fs.mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  const wrap = (exec: { query: typeof pg.query }): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await exec.query<T>(sql, params as never[]);
      return res.rows as T[];
    },
  });
  return {
    kind: "pglite",
    ...wrap(pg),
    tx: (fn) => pg.transaction((tx) => fn(wrap(tx as unknown as { query: typeof pg.query }))),
    close: () => pg.close(),
  };
}

async function createPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  type PgTx = import("postgres").TransactionSql;
  const sql = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 10), prepare: false, onnotice: () => {} });
  const wrap = (exec: typeof sql | PgTx): Queryable => ({
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await exec.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
  });
  return {
    kind: "postgres",
    ...wrap(sql),
    tx: (fn) => sql.begin((tx) => fn(wrap(tx))) as never,
    close: () => sql.end(),
  };
}

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

export async function migrate(db: Db) {
  await db.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await db.query<{ name: string }>(`select name from schema_migrations`)).map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await db.tx(async (q) => {
      await execScript(q, sql);
      await q.query(`insert into schema_migrations (name) values ($1)`, [file]);
    });
    log.info("db.migration.applied", { file });
  }
}

/** Executes a multi-statement SQL script. Splits on semicolons that are not inside $$ blocks or quotes. */
async function execScript(q: Queryable, script: string) {
  for (const stmt of splitSql(script)) await q.query(stmt);
}

export function splitSql(script: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inDollar = false;
  let inQuote = false;
  let inLineComment = false;
  for (let i = 0; i < script.length; i++) {
    const c = script[i];
    const next = script[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (!inQuote && !inDollar && c === "-" && next === "-") {
      inLineComment = true;
      continue;
    }
    if (!inQuote && c === "$" && next === "$") {
      inDollar = !inDollar;
      buf += "$$";
      i++;
      continue;
    }
    if (!inDollar && c === "'") inQuote = !inQuote;
    if (!inQuote && !inDollar && c === ";") {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

type GlobalDb = { __goroadaDb?: Promise<Db> };
const g = globalThis as unknown as GlobalDb;

export function getDb(): Promise<Db> {
  if (!g.__goroadaDb) {
    g.__goroadaDb = (async () => {
      const url = process.env.DATABASE_URL;
      const db = url ? await createPostgres(url) : await createPglite(process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite"));
      await migrate(db);
      if (process.env.SEED_DEMO_DATA !== "false") {
        const { seedIfEmpty } = await import("./seed");
        await seedIfEmpty(db);
      }
      return db;
    })().catch((err) => {
      g.__goroadaDb = undefined;
      throw err;
    });
  }
  return g.__goroadaDb;
}

/** For tests: create an isolated, migrated + seeded in-memory database. */
export async function createTestDb(): Promise<Db> {
  const db = await createPglite("memory://");
  await migrate(db);
  const { seedIfEmpty } = await import("./seed");
  await seedIfEmpty(db);
  return db;
}
