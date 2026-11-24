"use client";
import { useActionState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Notice } from "@/components/ui/primitives";
import { findBookingAction, type FindState } from "./actions";

export function FindBookingForm({ defaultReference }: { defaultReference?: string }) {
  const [state, action, pending] = useActionState<FindState, FormData>(findBookingAction, null);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Booking reference" htmlFor="reference" hint="Found in your confirmation email or SMS">
        <Input id="reference" name="reference" defaultValue={defaultReference} placeholder="GR-7K2QXM" autoCapitalize="characters" className="font-mono uppercase" required />
      </Field>
      <Field label="Email or phone number used for booking" htmlFor="contact">
        <Input id="contact" name="contact" autoComplete="email" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}><Search className="h-4 w-4" />Find my booking</Button>
    </form>
  );
}
