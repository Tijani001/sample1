import type { Metadata } from "next";
import { getSessionUser } from "@/lib/server";
import { ContactForm } from "./form";

export const metadata: Metadata = { title: "Contact support" };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ booking?: string; topic?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const topic = sp.topic === "reschedule" ? "booking" : sp.topic;
  const subject = sp.topic === "reschedule" ? `Date change request for ${sp.booking ?? "my booking"}` : sp.topic === "lost_property" ? "Lost property" : "";
  return (
    <div className="container-page max-w-2xl py-6 sm:py-10">
      <h1 className="text-2xl font-semibold sm:text-3xl">Contact support</h1>
      <p className="mt-1 text-[15px] text-ink-3">Tell us what you need. Include your booking reference so we can help faster.</p>
      <div className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6"><ContactForm email={user?.email ?? ""} booking={sp.booking ?? ""} topic={topic ?? "booking"} subject={subject} /></div>
    </div>
  );
}
