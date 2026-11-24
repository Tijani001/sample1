"use client";
import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Notice, Select } from "@/components/ui/primitives";
import { applyOperatorAction, type JoinState } from "./actions";

export function JoinForm({ cities }: { cities: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(applyOperatorAction, null);
  if (state?.ok) return <div className="py-6 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-success" /><h3 className="mt-3 text-xl font-semibold">Application received</h3><p className="mt-1 text-ink-3">Your operator account is pending verification. You can set up vehicles and routes in the portal meanwhile; you&apos;ll go live once verified.</p><Button asChild className="mt-5"><Link href="/operator">Open operator portal</Link></Button></div>;
  const fe = state?.fieldErrors ?? {};
  const file = "block w-full text-sm file:mr-3 file:h-10 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:font-medium";
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      {state?.error && <Notice tone="danger" className="sm:col-span-2">{state.error}</Notice>}
      <Field label="Registered company name" htmlFor="company" error={fe.company} className="sm:col-span-2"><Input id="company" name="company" invalid={!!fe.company} /></Field>
      <Field label="CAC registration number" htmlFor="rc" error={fe.rc}><Input id="rc" name="rc" placeholder="RC123456" invalid={!!fe.rc} /></Field>
      <Field label="Head office city" htmlFor="city"><Select id="city" name="city">{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <Field label="Business email" htmlFor="email" error={fe.email}><Input id="email" name="email" type="email" invalid={!!fe.email} /></Field>
      <Field label="Business phone" htmlFor="phone" error={fe.phone}><Input id="phone" name="phone" type="tel" invalid={!!fe.phone} /></Field>
      <Field label="Fleet size" htmlFor="fleet" error={fe.fleet}><Input id="fleet" name="fleet" type="number" min={1} defaultValue={5} invalid={!!fe.fleet} /></Field>
      <Field label="Seating" htmlFor="seating"><Select id="seating" name="seating"><option value="assigned">Assigned seat numbers</option><option value="open">Seats assigned at boarding</option></Select></Field>
      <Field label="How will you manage inventory?" htmlFor="integration" className="sm:col-span-2"><Select id="integration" name="integration"><option value="native">Goroada operator portal</option><option value="api">Our booking system has an API</option><option value="import">Bulk schedule imports (CSV)</option><option value="manual">Manually, with Goroada support</option></Select></Field>
      <fieldset className="space-y-3 sm:col-span-2"><legend className="mb-2 text-sm font-medium">Verification documents <span className="font-normal text-ink-3">(PDF, JPG or PNG, max 5 MB)</span></legend>
        <label className="block text-sm">CAC certificate<input type="file" name="cac_certificate" accept=".pdf,image/jpeg,image/png" className={file} /></label>
        <label className="block text-sm">Operating licence<input type="file" name="operating_licence" accept=".pdf,image/jpeg,image/png" className={file} /></label>
        <label className="block text-sm">Fleet insurance<input type="file" name="insurance" accept=".pdf,image/jpeg,image/png" className={file} /></label>
      </fieldset>
      <div className="sm:col-span-2"><Button type="submit" size="lg" loading={pending}>Submit application</Button></div>
    </form>
  );
}
