"use client";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Notice, Select, Textarea } from "@/components/ui/primitives";
import { changePasswordAction, dataRequestAction, savePassengerAction, updateProfileAction, type FormState } from "./actions";

function useToast(state: FormState) {
  useEffect(() => { if (state?.ok && state.message) toast.success(state.message); }, [state]);
}

export function ProfileForm({ name, phone, email, homeCity, cities }: { name: string; phone: string; email: string; homeCity: string; cities: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfileAction, null);
  useToast(state);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" htmlFor="name" error={fe.name} className="sm:col-span-2"><Input id="name" name="name" defaultValue={name} invalid={!!fe.name} /></Field>
      <Field label="Email" htmlFor="email" hint="Contact support to change your sign-in email"><Input id="email" value={email} disabled /></Field>
      <Field label="Phone number" htmlFor="phone" error={fe.phone}><Input id="phone" name="phone" type="tel" defaultValue={phone} invalid={!!fe.phone} /></Field>
      <Field label="Home city" htmlFor="homeCity" hint="Used to suggest routes in Explore"><Select id="homeCity" name="homeCity" defaultValue={homeCity}><option value="">Not set</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <div className="sm:col-span-2"><Button type="submit" variant="navy" loading={pending}>Save changes</Button></div>
    </form>
  );
}

export function PassengerForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(savePassengerAction, null);
  useToast(state);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  const fe = state?.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="grid gap-4 sm:grid-cols-2">
      {state?.error && <Notice tone="danger" className="sm:col-span-2">{state.error}</Notice>}
      <Field label="Full name" htmlFor="fullName" error={fe.fullName} className="sm:col-span-2"><Input id="fullName" name="fullName" invalid={!!fe.fullName} /></Field>
      <Field label="Phone" htmlFor="pphone" error={fe.phone} optional><Input id="pphone" name="phone" type="tel" invalid={!!fe.phone} /></Field>
      <Field label="Email" htmlFor="pemail" error={fe.email} optional><Input id="pemail" name="email" type="email" invalid={!!fe.email} /></Field>
      <Field label="Emergency contact name" htmlFor="nokName" optional><Input id="nokName" name="nokName" /></Field>
      <Field label="Emergency contact phone" htmlFor="nokPhone" error={fe.nokPhone} optional><Input id="nokPhone" name="nokPhone" type="tel" invalid={!!fe.nokPhone} /></Field>
      <div className="sm:col-span-2"><Button type="submit" variant="navy" loading={pending}>Save passenger</Button></div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, null);
  useToast(state);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid max-w-md gap-4">
      <Field label="Current password" htmlFor="current" error={fe.current}><Input id="current" name="current" type="password" autoComplete="current-password" invalid={!!fe.current} /></Field>
      <Field label="New password" htmlFor="next" error={fe.next} hint="At least 8 characters"><Input id="next" name="next" type="password" autoComplete="new-password" invalid={!!fe.next} /></Field>
      <div><Button type="submit" variant="navy" loading={pending}>Change password</Button></div>
    </form>
  );
}

export function DataRequestForm({ email }: { email: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(dataRequestAction, null);
  if (state?.ok) return <Notice tone="success" title="Request received">{state.message}</Notice>;
  return (
    <form action={action} className="grid gap-4">
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      {!email && <Field label="Email" htmlFor="dr-email" error={state?.fieldErrors?.email}><Input id="dr-email" name="email" type="email" /></Field>}
      <Field label="Request" htmlFor="kind"><Select id="kind" name="kind"><option value="access">Get a copy of my data</option><option value="correction">Correct my data</option><option value="deletion">Delete my account and data</option><option value="portability">Export my data</option><option value="objection">Object to processing (e.g. marketing)</option></Select></Field>
      <Field label="Details" htmlFor="details" optional><Textarea id="details" name="details" rows={3} /></Field>
      <div><Button type="submit" variant="outline" loading={pending}>Submit request</Button></div>
    </form>
  );
}
