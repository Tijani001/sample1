import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, LifeBuoy, PackageSearch, RotateCcw, Ticket, Building2, MessageSquare, Phone, Mail } from "lucide-react";
import { FaqList, CORE_FAQS, type Faq } from "@/components/faq";
import { getDb } from "@/lib/server";

export const metadata: Metadata = { title: "Help and support" };

const TOPICS: { id: string; title: string; icon: typeof Ticket; faqs: Faq[] }[] = [
  { id: "booking", title: "Booking assistance", icon: Ticket, faqs: [
    { q: "I didn't receive my ticket", a: <>Open <Link className="underline" href="/trips">My Trips</Link> or <Link className="underline" href="/trips/find">find your booking</Link> with your reference and email. You can download the ticket as a PDF there.</> },
    { q: "Can I book for someone else?", a: "Yes. Enter their name as the passenger and your own details as the contact. They'll need a valid ID matching the name at boarding." },
    { q: "Do children need a ticket?", a: "Every passenger who occupies a seat needs a ticket. Operators set their own rules for infants on laps; check with the operator before travelling." },
  ] },
  { id: "payment", title: "Payment assistance", icon: CreditCard, faqs: [
    { q: "I was charged but my booking isn't confirmed", a: "Bank transfers can take a few minutes. We confirm automatically once your bank does. If it arrives after your seat hold ends, we'll re-secure seats or refund you in full. You will never be charged twice." },
    { q: "Is it safe to pay on Goroada?", a: "Payments are processed by licensed providers such as Paystack and Flutterwave. Goroada never sees or stores your card number." },
  ] },
  { id: "cancellation", title: "Cancellations and refunds", icon: RotateCcw, faqs: [
    { q: "How do I cancel?", a: "Open the trip in My Trips and choose Cancel booking. You'll see the exact refund before you confirm." },
    { q: "How long do refunds take?", a: "Refunds are sent to your original payment method. Banks usually take 5–10 working days to show them." },
    { q: "What if the operator cancels my trip?", a: "You get a full refund including the booking fee, or you can choose another departure." },
  ] },
  { id: "lost_property", title: "Lost property", icon: PackageSearch, faqs: [
    { q: "I left something in the vehicle", a: <>Report it from <Link className="underline" href="/help/contact?topic=lost_property">Contact support</Link> with your booking reference and a description. We&apos;ll contact the operator for you.</> },
  ] },
  { id: "operator", title: "Transport operators", icon: Building2, faqs: [
    { q: "How do I contact my operator?", a: "Operator contact details are on your booking page. You can also ask Goroada support to contact them for you." },
  ] },
];

export default async function HelpPage() {
  const db = await getDb();
  const ops = await db.query<{ name: string; support_phone: string; support_email: string }>(`select name, support_phone, support_email from operators where status = 'verified' order by name`);
  return (
    <div className="container-page py-6 sm:py-10">
      <div className="rounded-3xl bg-navy-600 px-6 py-10 text-white sm:px-10">
        <LifeBuoy className="h-8 w-8 text-coral-400" />
        <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">How can we help?</h1>
        <p className="mt-1 max-w-xl text-white/80">Answers to common questions, or talk to our team about bookings, payments and anything on the road.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/help/contact" className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-4 font-semibold text-navy-700 hover:bg-navy-50"><MessageSquare className="h-4 w-4" />Contact support</Link>
          <Link href="/help/contact?topic=technical" className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/30 px-4 font-semibold text-white hover:bg-white/10">Report a problem</Link>
          <Link href="/trips/find" className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/30 px-4 font-semibold text-white hover:bg-white/10">Find a booking</Link>
        </div>
      </div>
      <nav className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4" aria-label="Help topics">
        {TOPICS.map((t) => <a key={t.id} href={`#${t.id}`} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line-strong bg-white px-4 text-sm font-medium hover:border-navy-500"><t.icon className="h-4 w-4 text-navy-500" />{t.title}</a>)}
      </nav>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="space-y-10">
          <section><h2 className="mb-3 text-lg font-semibold">Popular questions</h2><FaqList items={CORE_FAQS} /></section>
          {TOPICS.map((t) => <section key={t.id} id={t.id} className="scroll-mt-24"><h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><t.icon className="h-5 w-5 text-navy-500" />{t.title}</h2><FaqList items={t.faqs} /></section>)}
        </div>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-line bg-white p-5 text-[14px]">
            <h2 className="font-semibold">Goroada support</h2>
            <p className="mt-2 flex items-center gap-2"><Phone className="h-4 w-4 text-ink-3" />+234 201 000 0000 <span className="text-ink-3">(demo)</span></p>
            <p className="mt-1 flex items-center gap-2"><Mail className="h-4 w-4 text-ink-3" />support@goroada.app</p>
            <p className="mt-2 text-ink-3">Every day, 6am – 10pm WAT. Emergencies: call 112.</p>
          </div>
          <div className="rounded-2xl border border-line bg-white p-5 text-[14px]">
            <h2 className="font-semibold">Operator contacts</h2>
            <ul className="mt-3 space-y-2.5">{ops.map((o) => <li key={o.name}><p className="font-medium">{o.name}</p><p className="text-ink-3">{o.support_phone} · {o.support_email}</p></li>)}</ul>
            <p className="mt-3 text-xs text-ink-3">Demonstration operators and contact details.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
