import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function SiteFooter() {
  const col = "flex flex-col gap-2.5 text-sm";
  const a = "text-ink-3 hover:text-ink";
  return (
    <footer className="mt-20 border-t border-line bg-surface-2/60 pb-24 pt-12 md:pb-12 no-print">
      <div className="container-page grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo height={30} />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-3">Every road. One app. Search, compare and book intercity road trips from trusted transport operators.</p>
          <p className="mt-4 text-xs text-ink-3">Goroada is a booking platform. Journeys are operated by independent transport companies.</p>
        </div>
        <div className={col}>
          <p className="font-semibold text-ink">Travel</p>
          <Link className={a} href="/">Book a trip</Link>
          <Link className={a} href="/explore">Explore destinations</Link>
          <Link className={a} href="/offers">Offers</Link>
          <Link className={a} href="/trips/find">Find a booking</Link>
        </div>
        <div className={col}>
          <p className="font-semibold text-ink">Support</p>
          <Link className={a} href="/help">Help centre</Link>
          <Link className={a} href="/help/contact">Contact support</Link>
          <Link className={a} href="/operators/join">For transport operators</Link>
          <Link className={a} href="/operator">Operator portal</Link>
        </div>
        <div className={col}>
          <p className="font-semibold text-ink">Legal</p>
          <Link className={a} href="/legal/terms">Terms of service</Link>
          <Link className={a} href="/legal/privacy">Privacy notice</Link>
          <Link className={a} href="/legal/cookies">Cookie preferences</Link>
          <Link className={a} href="/legal/credits">Photo credits</Link>
        </div>
      </div>
      <div className="container-page mt-10 flex flex-col gap-2 border-t border-line pt-6 text-xs text-ink-3 sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} Goroada. All prices in Nigerian naira.</p>
        <p>Development build: operators, fares, schedules and reviews are demonstration data.</p>
      </div>
    </footer>
  );
}
