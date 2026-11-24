import type { Metadata } from "next";
import Link from "next/link";
import { FindBookingForm } from "./form";

export const metadata: Metadata = { title: "Find a booking" };

export default function FindPage() {
  return (
    <div className="container-page max-w-lg py-10 sm:py-16">
      <h1 className="text-2xl font-semibold sm:text-3xl">Find your booking</h1>
      <p className="mt-2 text-[15px] text-ink-3">Booked as a guest? Enter your reference and the email or phone number you used. Your details stay private.</p>
      <div className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6"><FindBookingForm /></div>
      <p className="mt-4 text-center text-sm text-ink-3">Have an account? <Link href="/signin?next=/trips" className="font-semibold text-coral-700">Sign in</Link> to see all your trips.</p>
    </div>
  );
}
