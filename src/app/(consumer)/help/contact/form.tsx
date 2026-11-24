"use client";
import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Notice, Select, Textarea } from "@/components/ui/primitives";
import { createTicketAction, type ContactState } from "./actions";

export function ContactForm({ email, booking, topic, subject }: { email: string; booking: string; topic: string; subject: string }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(createTicketAction, null);
  if (state?.reference) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <h2 className="mt-3 text-xl font-semibold">Request received</h2>
        <p className="mt-1 text-ink-3">Your reference is <b className="font-mono text-ink">{state.reference}</b>. We&apos;ll reply by email, usually within a few hours.</p>
        <Button asChild variant="outline" className="mt-5"><Link href="/help">Back to help centre</Link></Button>
      </div>
    );
  }
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your email" htmlFor="email" error={fe.email}><Input id="email" name="email" type="email" defaultValue={email} invalid={!!fe.email} required /></Field>
        <Field label="Booking reference" htmlFor="booking" optional><Input id="booking" name="booking" defaultValue={booking} placeholder="GR-XXXXXX" className="font-mono uppercase" /></Field>
      </div>
      <Field label="Topic" htmlFor="category">
        <Select id="category" name="category" defaultValue={topic}>
          <option value="booking">Booking or date change</option><option value="payment">Payment</option><option value="cancellation">Cancellation or refund</option>
          <option value="lost_property">Lost property</option><option value="operator">Operator or journey issue</option><option value="technical">Problem with the app</option><option value="other">Something else</option>
        </Select>
      </Field>
      <Field label="Subject" htmlFor="subject" error={fe.subject}><Input id="subject" name="subject" defaultValue={subject} invalid={!!fe.subject} required /></Field>
      <Field label="How can we help?" htmlFor="message" error={fe.message}><Textarea id="message" name="message" rows={6} invalid={!!fe.message} required /></Field>
      <p className="text-xs text-ink-3">Please don&apos;t include card numbers or passwords.</p>
      <Button type="submit" size="lg" loading={pending}>Send request</Button>
    </form>
  );
}
