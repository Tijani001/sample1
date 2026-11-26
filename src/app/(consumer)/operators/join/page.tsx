import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ShieldCheck, Ticket, Wallet } from "lucide-react";
import { getDb, getSessionUser } from "@/lib/server";
import { JoinForm } from "./form";

export const metadata: Metadata = { title: "Sell your trips on Goroada" };

export default async function JoinPage() {
  const user = await getSessionUser();
  const cities = await (await getDb()).query<{ id: string; name: string }>(`select id, name from cities order by name`);
  return (
    <div className="container-page py-6 sm:py-10">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-sm font-semibold text-coral-700">For transport operators</p>
          <h1 className="mt-2 text-3xl font-semibold">Fill more seats with Goroada</h1>
          <p className="mt-3 text-base text-ink-3">Sell seats online, manage departures and manifests, verify tickets with a QR scan and get transparent settlements.</p>
          <ul className="mt-6 space-y-4 text-base">
            {[[Ticket, "Digital tickets and QR boarding", "Passengers arrive with verified tickets; duplicate boarding is blocked."], [BarChart3, "Operations dashboard", "Departures, occupancy, revenue and cancellations at a glance."], [Wallet, "Clear settlements", "See every booking, commission and payout. Commission is agreed in your contract."], [ShieldCheck, "Verified marketplace", "We verify every operator before they can accept bookings."]].map(([Icon, t, d]) => {
              const I = Icon as typeof Ticket;
              return <li key={t as string} className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-600"><I className="h-5 w-5" /></span><span><b className="font-semibold">{t as string}</b><span className="block text-ink-3">{d as string}</span></span></li>;
            })}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Apply to join</h2>
          <p className="mt-1 text-sm text-ink-3">Takes about 5 minutes. Verification usually takes 2–3 working days.</p>
          {!user ? <p className="mt-6 rounded-xl bg-surface-2 p-4 text-base"><Link href="/register?next=/operators/join" className="font-semibold text-coral-700">Create an account</Link> or <Link href="/signin?next=/operators/join" className="font-semibold text-coral-700">sign in</Link> to start your application.</p> : <div className="mt-5"><JoinForm cities={cities} /></div>}
        </div>
      </div>
    </div>
  );
}
