"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/primitives";
import { replySupportAction } from "../actions";

export function Reply({ ticketId }: { ticketId: string }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const send = (resolve: boolean) => start(async () => { const r = await replySupportAction(ticketId, body, resolve); if (r.ok) { toast.success(r.message); setBody(""); } else toast.error(r.error); });
  return (
    <div className="mt-3">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply to the customer" className="min-h-20" aria-label="Reply" />
      <div className="mt-2 flex gap-2"><Button size="sm" variant="navy" loading={pending} onClick={() => send(false)}>Send reply</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => send(true)}>Reply & resolve</Button></div>
    </div>
  );
}
