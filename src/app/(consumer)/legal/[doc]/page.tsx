import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/server";
import { CookiePrefs } from "./cookie-prefs";

const DOCS: Record<string, { title: string; body: React.ReactNode }> = {
  terms: { title: "Terms of service", body: (<>
    <p>These terms govern your use of Goroada, a marketplace that lets you book road journeys operated by independent transport companies (&ldquo;operators&rdquo;).</p>
    <h2>Our role</h2><p>Goroada is not a transport operator. Your contract for carriage is with the operator named on your ticket, subject to their fare rules, which we show before you pay.</p>
    <h2>Prices and payment</h2><p>All prices are in Nigerian naira and include every mandatory charge. Your booking is confirmed only after we verify payment with a licensed payment provider. Booking fees are non-refundable unless the operator cancels.</p>
    <h2>Cancellations and changes</h2><p>Refunds follow the fare rules of your booking, shown at checkout and in My Trips. If an operator cancels, you receive a full refund including fees.</p>
    <h2>Your responsibilities</h2><p>Provide accurate passenger details, carry valid ID and arrive at least 45 minutes before departure.</p>
    <h2>Development build</h2><p>This build contains demonstration operators, fares and a sandbox payment provider. No real travel is sold.</p></>) },
  privacy: { title: "Privacy notice", body: (<>
    <p>We process personal data in line with the Nigeria Data Protection Act 2023 (NDPA) and the GAID 2025 implementation directive.</p>
    <h2>What we collect</h2><p>Contact details, passenger names, an emergency contact for the lead passenger (required by operators for manifests), booking and payment status. We do not receive or store card numbers.</p>
    <h2>Why</h2><p>To provide bookings (contract), meet transport safety and tax obligations (legal obligation), prevent fraud (legitimate interest) and, only with consent, send offers.</p>
    <h2>Who we share with</h2><p>Your operator (passenger manifest), payment providers, and messaging providers that deliver your tickets. We never sell personal data.</p>
    <h2>Retention</h2><p>Booking and payment records are kept for 6 years for tax and dispute purposes; marketing data until you withdraw consent; account data until you delete your account.</p>
    <h2>Your rights</h2><p>Access, correction, deletion, portability and objection. Use Account → Privacy or email privacy@goroada.app. You may also complain to the Nigeria Data Protection Commission.</p></>) },
  cookies: { title: "Cookie preferences", body: (<>
    <p>We use a small number of cookies. Essential cookies keep you signed in, remember bookings made in this browser and protect checkout; they can&apos;t be switched off. We don&apos;t use advertising cookies.</p></>) },
  credits: { title: "Photo credits", body: null },
};

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  return { title: DOCS[(await params).doc]?.title ?? "Legal" };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = DOCS[doc];
  if (!d) notFound();
  const credits = doc === "credits" ? await (await getDb()).query<{ name: string; image_source_url: string }>(`select name, image_source_url from cities where image_source_url is not null order by name`) : [];
  return (
    <article className="container-page max-w-3xl py-8 sm:py-12 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-[15.5px] [&_p]:leading-relaxed [&_p]:text-ink-2">
      <h1 className="text-3xl font-semibold">{d.title}</h1>
      <p className="!text-sm !text-ink-3">Last updated November 2026</p>
      {d.body}
      {doc === "cookies" && <CookiePrefs />}
      {doc === "credits" && (<>
        <p>Destination photographs are from Wikimedia Commons and are used under their respective free licences (mostly CC BY-SA). Each source page lists the author and licence.</p>
        <ul className="mt-4 list-disc pl-5 text-[15px]">{credits.map((c) => <li key={c.name} className="mt-1"><a className="underline" href={c.image_source_url} target="_blank" rel="noopener noreferrer">{c.name}</a></li>)}</ul>
      </>)}
    </article>
  );
}
