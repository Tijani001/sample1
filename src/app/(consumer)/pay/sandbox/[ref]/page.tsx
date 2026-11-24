import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/server";
import { demoProvider } from "@/lib/services/payments/demo";
import { SandboxCheckout } from "./sandbox";

export const metadata: Metadata = { title: "Sandbox payment", robots: { index: false } };

export default async function SandboxPage({ params }: { params: Promise<{ ref: string }> }) {
  if (!demoProvider.configured()) notFound();
  const { ref } = await params;
  const reference = decodeURIComponent(ref);
  const db = await getDb();
  const [t] = await db.query<{ reference: string; amount: number; currency: string; status: string; booking_ref: string; email: string | null }>(
    `select g.reference, g.amount, g.currency, g.status, b.reference booking_ref, b.contact_email email
       from demo_gateway_transactions g join payments p on p.reference = g.reference join bookings b on b.id = p.booking_id where g.reference = $1`, [reference]);
  if (!t) notFound();
  return <SandboxCheckout reference={t.reference} amount={t.amount} bookingRef={t.booking_ref} email={t.email} status={t.status} />;
}
