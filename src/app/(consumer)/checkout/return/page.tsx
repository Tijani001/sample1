import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Hourglass, XCircle } from "lucide-react";
import { getDb } from "@/lib/server";
import { verifyPayment, type VerifyOutcome } from "@/lib/services/payments";
import { Button } from "@/components/ui/button";
import { AutoRefresh } from "./auto-refresh";
import { log } from "@/lib/log";

export const metadata: Metadata = { title: "Confirming payment", robots: { index: false } };

/** Return URL from the payment provider. We never trust the redirect itself: the payment is verified server-side. */
export default async function ReturnPage({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string; tx_ref?: string }> }) {
  const sp = await searchParams;
  const reference = (sp.reference ?? sp.trxref ?? sp.tx_ref ?? "").slice(0, 80);
  if (!reference) redirect("/trips");
  const db = await getDb();
  let outcome: VerifyOutcome | null = null;
  try {
    outcome = await verifyPayment(db, reference, { userId: null, label: "checkout_return" });
  } catch (e) {
    log.error("checkout.verify_failed", { reference, error: (e as Error).message });
  }
  if (outcome?.state === "confirmed") redirect(`/trips/${outcome.reference}?confirmed=1`);
  const [b] = outcome ? await db.query<{ id: string }>(`select id from bookings where reference = $1`, [outcome.reference]) : [];
  const box = "container-page flex min-h-[60vh] flex-col items-center justify-center py-16 text-center";
  if (!outcome) {
    return (
      <div className={box}>
        <AlertTriangle className="h-12 w-12 text-warning" />
        <h1 className="mt-4 text-2xl font-semibold">We couldn&apos;t confirm your payment yet</h1>
        <p className="mt-2 max-w-md text-ink-3">The payment provider didn&apos;t respond. If you were charged, your booking will be confirmed automatically once we receive confirmation. You won&apos;t be charged twice.</p>
        <AutoRefresh seconds={8} />
        <Button asChild variant="outline" className="mt-6"><Link href="/help/contact">Contact support</Link></Button>
      </div>
    );
  }
  if (outcome.state === "pending") {
    return (
      <div className={box}>
        <span className="grid h-16 w-16 place-items-center rounded-full bg-info-bg text-info"><Hourglass className="h-8 w-8 animate-pulse" /></span>
        <h1 className="mt-5 text-2xl font-semibold">Payment processing</h1>
        <p className="mt-2 max-w-md text-ink-3">Bank transfers can take a few minutes. Your seats stay reserved while we wait, and we&apos;ll confirm your booking {outcome.reference} as soon as the bank confirms.</p>
        <AutoRefresh seconds={6} />
        <Button asChild variant="outline" className="mt-6"><Link href={`/trips/${outcome.reference}`}>View booking status</Link></Button>
      </div>
    );
  }
  if (outcome.state === "failed") {
    return (
      <div className={box}>
        <span className="grid h-16 w-16 place-items-center rounded-full bg-danger-bg text-danger"><XCircle className="h-8 w-8" /></span>
        <h1 className="mt-5 text-2xl font-semibold">Payment not completed</h1>
        <p className="mt-2 max-w-md text-ink-3">{outcome.message} Your seats are still held for a short time.</p>
        {b && <Button asChild size="lg" className="mt-6"><Link href={`/book/${b.id}?step=pay`}>Try again</Link></Button>}
      </div>
    );
  }
  return (
    <div className={box}>
      <AlertTriangle className="h-12 w-12 text-warning" />
      <h1 className="mt-4 text-2xl font-semibold">We&apos;re reviewing your payment</h1>
      <p className="mt-2 max-w-md text-ink-3">{outcome.message}</p>
      <Button asChild variant="outline" className="mt-6"><Link href={`/trips/${outcome.reference}`}>View booking</Link></Button>
    </div>
  );
}
