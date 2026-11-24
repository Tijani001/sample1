"use client";
import { useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ShareJourney({ bookingId }: { bookingId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="outline" loading={busy} onClick={async () => {
      setBusy(true);
      const res = await fetch(`/api/bookings/${bookingId}/track`, { method: "POST" });
      const data = await res.json();
      setBusy(false);
      if (!res.ok) return toast.error(data?.error?.message ?? "Couldn't create link");
      if (navigator.share) { try { await navigator.share({ title: "Follow my journey on Goroada", url: data.url }); return; } catch {} }
      await navigator.clipboard?.writeText(data.url);
      toast.success("Link copied", { description: `Expires ${new Date(data.expiresAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. No personal details are shown.` });
    }}><Share2 className="h-4 w-4" />Share journey</Button>
  );
}
