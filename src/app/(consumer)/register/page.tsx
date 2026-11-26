import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="container-page max-w-md py-10 sm:py-16">
      <h1 className="text-2xl font-semibold sm:text-3xl">Create your account</h1>
      <p className="mt-1 text-base text-ink-3">Keep every trip in one place, save passengers and get trip updates. Bookings you made as a guest in this browser are added automatically.</p>
      <div className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6"><RegisterForm next={next} /></div>
    </div>
  );
}
