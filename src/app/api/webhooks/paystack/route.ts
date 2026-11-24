import { getDb } from "@/lib/server";
import { handleWebhook } from "@/lib/services/payments";

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 200_000) return new Response("Payload too large", { status: 413 });
  const res = await handleWebhook(await getDb(), "paystack", raw, req.headers);
  return new Response(null, { status: res.status });
}
