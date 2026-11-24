"use client";
import { useState } from "react";
import { useClientValue } from "@/hooks/use-now";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CookiePrefs() {
  const stored = useClientValue(() => { try { return localStorage.getItem("gr_consent_analytics") === "1"; } catch { return false; } }, false);
  const [choice, setAnalytics] = useState<boolean | null>(null);
  const analytics = choice ?? stored;
  return (
    <div className="mt-6 rounded-2xl border border-line bg-white p-5">
      <label className="flex items-center justify-between gap-4 py-2"><span><b className="font-medium">Essential</b><span className="block text-sm text-ink-3">Sign-in, booking access and security</span></span><input type="checkbox" checked disabled className="h-5 w-5" aria-label="Essential cookies, always on" /></label>
      <label className="flex items-center justify-between gap-4 border-t border-line py-2"><span><b className="font-medium">Anonymous analytics</b><span className="block text-sm text-ink-3">Helps us improve search and checkout. Off by default.</span></span><input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} className="h-5 w-5 accent-[var(--color-navy-600)]" /></label>
      <Button className="mt-3" variant="navy" onClick={() => { try { localStorage.setItem("gr_consent_analytics", analytics ? "1" : "0"); } catch {} toast.success("Preferences saved"); }}>Save preferences</Button>
    </div>
  );
}
