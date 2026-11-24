import { requireUser } from "@/lib/auth/guards";
import Link from "next/link";

import { DataRequestForm } from "../forms";

export const metadata = { title: "Privacy" };
export default async function Privacy() {
  const user = await requireUser("/account/privacy");
  return (
    <div>
      <h1 className="text-2xl font-semibold">Privacy</h1>
      <p className="mt-1 max-w-2xl text-[15px] text-ink-3">Under the Nigeria Data Protection Act 2023 you can access, correct, export or delete your personal data, and object to marketing. We respond within 30 days. Booking records needed for tax, fraud prevention or legal claims may be retained for the period the law requires.</p>
      <div className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6"><DataRequestForm email={user.email} /></div>
      <p className="mt-4 text-sm text-ink-3">Read the full <Link href="/legal/privacy" className="underline">privacy notice</Link> or manage <Link href="/legal/cookies" className="underline">cookie preferences</Link>.</p>
    </div>
  );
}
