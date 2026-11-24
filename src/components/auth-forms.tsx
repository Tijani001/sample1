"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input, Notice } from "@/components/ui/primitives";
import { registerAction, signInAction, type FormState } from "@/app/(consumer)/account/actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, null);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <input type="hidden" name="next" value={next ?? "/trips"} />
      <Field label="Email or phone number" htmlFor="identifier"><Input id="identifier" name="identifier" autoComplete="username" required /></Field>
      <Field label="Password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>Sign in</Button>
      <p className="text-center text-sm text-ink-3">New to Goroada? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-coral-700">Create an account</Link></p>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <input type="hidden" name="next" value={next ?? "/trips"} />
      <Field label="Full name" htmlFor="name" error={fe.name}><Input id="name" name="name" autoComplete="name" invalid={!!fe.name} required /></Field>
      <Field label="Email" htmlFor="email" error={fe.email}><Input id="email" name="email" type="email" autoComplete="email" invalid={!!fe.email} required /></Field>
      <Field label="Phone number" htmlFor="phone" error={fe.phone}><Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="0803 123 4567" invalid={!!fe.phone} required /></Field>
      <Field label="Password" htmlFor="password" error={fe.password} hint="At least 8 characters"><Input id="password" name="password" type="password" autoComplete="new-password" invalid={!!fe.password} required /></Field>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="consent" className="mt-0.5 h-5 w-5 accent-[var(--color-navy-600)]" /><span>I agree to the <Link href="/legal/terms" className="underline">terms</Link> and have read the <Link href="/legal/privacy" className="underline">privacy notice</Link>.</span></label>
      {fe.consent && <p role="alert" className="text-[13px] text-danger">{fe.consent}</p>}
      <label className="flex items-start gap-3 text-sm text-ink-3"><input type="checkbox" name="marketing" className="mt-0.5 h-5 w-5 accent-[var(--color-navy-600)]" />Send me occasional offers (optional, you can unsubscribe any time).</label>
      <Button type="submit" size="lg" className="w-full" loading={pending}>Create account</Button>
      <p className="text-center text-sm text-ink-3">Already have an account? <Link href={`/signin${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-coral-700">Sign in</Link></p>
    </form>
  );
}
