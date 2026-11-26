import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server";
import { SignInForm } from "@/components/auth-forms";
import { DEMO_PASSWORD } from "@/lib/db/seed-data";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSessionUser()) redirect(next?.startsWith("/") ? next : "/trips");
  return (
    <div className="container-page max-w-md py-10 sm:py-16">
      <h1 className="text-2xl font-semibold sm:text-3xl">Welcome back</h1>
      <p className="mt-1 text-base text-ink-3">Sign in to see your trips and travel faster with saved passengers.</p>
      <div className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6"><SignInForm next={next} /></div>
      <p className="mt-3 text-center text-xs text-ink-3">Google sign-in appears here once configured (GOOGLE_CLIENT_ID).</p>
      {process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_ACCOUNTS === "true" ? (
        <div className="mt-6 rounded-xl border border-dashed border-line-strong p-4 text-sm text-ink-3">
          <p className="font-semibold text-ink">Demo accounts (development only)</p>
          <p className="mt-1">Password for all: <code className="font-mono text-ink">{DEMO_PASSWORD}</code></p>
          <ul className="mt-2 space-y-0.5 font-mono">
            <li>traveller@demo.goroada.app</li><li>operator@demo.goroada.app <span className="font-sans">(Savannah Line)</span></li>
            <li>admin@demo.goroada.app <span className="font-sans">(super admin)</span></li><li>finance@demo.goroada.app · support@demo.goroada.app</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
