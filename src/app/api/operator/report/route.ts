import { getDb, getSessionUser } from "@/lib/server";
import { financeSummary } from "@/lib/services/operator";

export async function GET() {
  const u = await getSessionUser();
  if (!u?.operator) return new Response("Forbidden", { status: 403 });
  const f = await financeSummary(await getDb(), u.operator.id, 365);
  const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["booking_reference", "date", "route", "gross_ngn", "commission_ngn", "net_ngn", "status"].join(",")];
  for (const t of f.transactions) lines.push([t.reference, new Date(t.created_at).toISOString(), t.route, t.gross / 100, t.commission / 100, (t.gross - t.commission) / 100, t.status].map(esc).join(","));
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="goroada-${u.operator.id}-transactions.csv"` } });
}
