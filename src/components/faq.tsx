import { ChevronDown } from "lucide-react";

export type Faq = { q: string; a: React.ReactNode };

export const CORE_FAQS: Faq[] = [
  { q: "Is Goroada a transport company?", a: "No. Goroada is a booking platform. Your journey is operated by the transport company shown on your ticket. We help you compare departures, book a seat, pay securely and keep your ticket in one place." },
  { q: "Do I need an account to book?", a: "No. You can book as a guest with just your name, phone number and email. Create an account afterwards if you'd like to save passengers and see all your trips in one place." },
  { q: "How do I board with my Goroada ticket?", a: "Arrive at the departure terminal at least 45 minutes before departure and show the QR code on your ticket at the operator's desk. Your ticket works offline once it has been opened on your phone." },
  { q: "Are there any hidden charges?", a: "No. Every fare shows the price per passenger, and before you pay you see the full breakdown: fare, any seat charges, add-ons you chose, the Goroada booking fee and any discount." },
  { q: "Can I cancel or change my trip?", a: "Yes, according to the operator's fare rules shown before you book. Open the trip in My Trips to see your refund amount and cancel or request a change in a few taps." },
  { q: "Which payment methods can I use?", a: "Debit and credit cards, bank transfer and USSD through licensed payment providers. Goroada never stores your card details." },
];

export function FaqList({ items }: { items: Faq[] }) {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-white">
      {items.map((f) => (
        <details key={f.q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15.5px] font-medium">
            {f.q}
            <ChevronDown className="h-5 w-5 shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-180" aria-hidden />
          </summary>
          <div className="pb-5 pr-8 text-[15px] leading-relaxed text-ink-3">{f.a}</div>
        </details>
      ))}
    </div>
  );
}
