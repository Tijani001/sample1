import { z } from "zod";
import { json, readJson, route } from "@/lib/api";
import { getDb } from "@/lib/server";
import { BookingError } from "@/lib/services/bookings";
import { completeDemoTransaction, demoProvider } from "@/lib/services/payments/demo";

const schema = z.object({ reference: z.string().max(60), outcome: z.enum(["success", "failed", "pending"]), channel: z.enum(["card", "bank_transfer", "ussd"]) });

/** Sandbox gateway endpoint. Only exists while the demo provider is enabled; it never touches real money. */
export const POST = route(async (req: Request) => {
  if (!demoProvider.configured()) throw new BookingError("not_found", "Not found.", 404);
  const body = schema.safeParse(await readJson(req));
  if (!body.success) throw new BookingError("bad_request", "Invalid request.", 400);
  const ok = await completeDemoTransaction(await getDb(), body.data.reference, body.data.outcome, body.data.channel);
  if (!ok) throw new BookingError("already_completed", "This sandbox transaction was already completed.", 409);
  return json({ ok: true, returnUrl: `/checkout/return?reference=${encodeURIComponent(body.data.reference)}` });
});
