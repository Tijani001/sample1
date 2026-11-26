"use client";
import { useEffect, useState } from "react";
import { useClientValue } from "@/hooks/use-now";
import { Download, Share, Smartphone, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallApp() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [justInstalled, setInstalled] = useState(false);
  const standalone = useClientValue(() => window.matchMedia("(display-mode: standalone)").matches, false);
  const ios = useClientValue(() => /iphone|ipad|ipod/i.test(navigator.userAgent), false);
  const installed = justInstalled || standalone;
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (installed) return null;
  return (
    <section aria-labelledby="app-heading" className="container-page mt-16">
      <div className="flex flex-col gap-6 rounded-3xl border border-line bg-surface-2/70 p-6 sm:flex-row sm:items-center sm:p-8">
        <LogoMark className="h-14 w-14 rounded-2xl bg-white p-2 shadow-sm" />
        <div className="flex-1">
          <h2 id="app-heading" className="text-xl font-semibold">Goroada on your home screen</h2>
          <p className="mt-1 max-w-xl text-base text-ink-3">Install the app for one-tap access to your tickets, even when you&apos;re offline at the terminal. It&apos;s light on data and storage.</p>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2">
            <li className="flex items-center gap-1.5"><WifiOff className="h-4 w-4 text-navy-500" />Offline tickets</li>
            <li className="flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-navy-500" />Under 1 MB to install</li>
          </ul>
        </div>
        {evt ? (
          <Button variant="navy" size="lg" onClick={async () => { await evt.prompt(); const c = await evt.userChoice; if (c.outcome === "accepted") setInstalled(true); setEvt(null); }}>
            <Download className="h-4 w-4" />Install app
          </Button>
        ) : (
          <p className="max-w-[260px] text-sm text-ink-3">
            {ios ? <>Tap <Share className="inline h-4 w-4 align-text-bottom" /> Share, then <b className="text-ink">Add to Home Screen</b>.</> : <>Open your browser menu and choose <b className="text-ink">Install app</b> or <b className="text-ink">Add to Home screen</b>.</>}
          </p>
        )}
      </div>
    </section>
  );
}
