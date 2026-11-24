"use client";
import { useState } from "react";
import Link from "next/link";
import { CreditCard, FlaskConical, Landmark, Smartphone, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/money";
import { cn } from "@/lib/cn";

type Channel = "card" | "bank_transfer" | "ussd";

export function SandboxCheckout({ reference, amount, bookingRef, email, status }: { reference: string; amount: number; bookingRef: string; email: string | null; status: string }) {
  const [channel, setChannel] = useState<Channel>("card");
  const [busy, setBusy] = useState<string | null>(null);
  const complete = async (outcome: "success" | "failed" | "pending") => {
    setBusy(outcome);
    const res = await fetch("/api/payments/sandbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference, outcome, channel }) });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error?.message ?? "Couldn't complete the sandbox payment");
      setBusy(null);
      return;
    }
    window.location.href = data.returnUrl;
  };
  const tabs: { id: Channel; label: string; icon: React.ReactNode }[] = [
    { id: "card", label: "Card", icon: <CreditCard className="h-4 w-4" /> },
    { id: "bank_transfer", label: "Bank transfer", icon: <Landmark className="h-4 w-4" /> },
    { id: "ussd", label: "USSD", icon: <Smartphone className="h-4 w-4" /> },
  ];
  return (
    <div className="min-h-[70vh] bg-surface-2 py-8">
      <div className="mx-auto w-full max-w-md px-4">
        <div className="mb-4 flex items-center gap-2 rounded-xl border-2 border-dashed border-warning bg-warning-bg px-4 py-3 text-sm text-amber-900">
          <FlaskConical className="h-5 w-5 shrink-0" />
          <p><b>Sandbox payment gateway.</b> This is a development simulation. No money moves and nothing is charged.</p>
        </div>
        <div className="rounded-2xl border border-line bg-white shadow-lg">
          <div className="border-b border-line p-5">
            <p className="text-sm text-ink-3">Goroada booking {bookingRef}</p>
            <p className="mt-1 text-3xl font-semibold tabular">{formatMoney(amount)}</p>
            {email && <p className="mt-1 text-sm text-ink-3">{email}</p>}
          </div>
          {status !== "pending" ? (
            <div className="p-5"><Notice tone="info" title="This sandbox transaction is already complete." /><Button asChild className="mt-4 w-full"><Link href={`/checkout/return?reference=${encodeURIComponent(reference)}`}>Return to Goroada</Link></Button></div>
          ) : (
            <div className="p-5">
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
                {tabs.map((t) => (
                  <button key={t.id} role="tab" aria-selected={channel === t.id} onClick={() => setChannel(t.id)} className={cn("flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-medium", channel === t.id ? "bg-white shadow-sm" : "text-ink-3")}>{t.icon}{t.label}</button>
                ))}
              </div>
              <div className="mt-5 text-sm">
                {channel === "card" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-line p-3 font-mono tabular text-ink-2">4084 0840 8408 4081 <span className="float-right">12/30 · 408</span></div>
                    <p className="text-ink-3">Sandbox test card. Real card details are never entered on Goroada; live payments use the provider&apos;s secure page.</p>
                  </div>
                )}
                {channel === "bank_transfer" && (
                  <div className="space-y-2 rounded-xl border border-line p-4">
                    <p className="text-ink-3">Transfer exactly <b className="text-ink">{formatMoney(amount)}</b> to:</p>
                    <p className="flex items-center justify-between font-mono text-lg">9900 123 456 <button onClick={() => { navigator.clipboard?.writeText("9900123456"); toast.success("Copied"); }} aria-label="Copy account number" className="text-ink-3"><Copy className="h-4 w-4" /></button></p>
                    <p className="text-ink-3">Sandbox Bank · Goroada Checkout</p>
                    <p className="pt-1 text-xs text-ink-3">Use “Simulate delayed transfer” to test a payment that is still processing.</p>
                  </div>
                )}
                {channel === "ussd" && (
                  <div className="rounded-xl border border-line p-4">
                    <p className="text-ink-3">Dial on your phone:</p>
                    <p className="mt-1 font-mono text-lg">*000*000*{amount / 100}#</p>
                    <p className="mt-2 text-xs text-ink-3">Sandbox USSD code (not a real bank code).</p>
                  </div>
                )}
              </div>
              <div className="mt-6 space-y-2">
                <Button className="w-full" size="lg" loading={busy === "success"} disabled={!!busy} onClick={() => complete("success")}>Simulate successful payment</Button>
                {channel === "bank_transfer" && <Button variant="outline" className="w-full" loading={busy === "pending"} disabled={!!busy} onClick={() => complete("pending")}>Simulate delayed transfer</Button>}
                <Button variant="ghost" className="w-full text-danger" loading={busy === "failed"} disabled={!!busy} onClick={() => complete("failed")}>Simulate failed payment</Button>
              </div>
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-ink-3">Reference {reference}</p>
      </div>
    </div>
  );
}
