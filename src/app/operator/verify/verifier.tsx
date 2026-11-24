"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Camera, CameraOff, CheckCircle2, ScanLine, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Notice } from "@/components/ui/primitives";
import { verifyTicketAction } from "../actions";
import type { VerifyTicketResult } from "@/lib/services/tickets";
import { cn } from "@/lib/cn";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function Verifier() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<VerifyTicketResult | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [camera, setCamera] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const check = (value: string, commit = false) => start(async () => {
    const r = await verifyTicketAction(value, commit);
    setResult(r);
    setChecked(value);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(r.ok ? 60 : [80, 60, 80]);
  });

  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      if (!BD) { setCamError("Camera scanning isn't supported in this browser. Type the ticket number instead, or use Chrome on Android."); setCamera(false); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const det = new BD({ formats: ["qr_code"] });
        const loop = async () => {
          if (stop || !videoRef.current) return;
          try {
            const codes = await det.detect(videoRef.current);
            if (codes[0]?.rawValue) { setCode(codes[0].rawValue); check(codes[0].rawValue); setCamera(false); return; }
          } catch {}
          setTimeout(loop, 350);
        };
        loop();
      } catch { setCamError("Camera access was blocked. Allow camera access or type the ticket number."); setCamera(false); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [camera]);

  const t = result && "ticket" in result ? result.ticket : undefined;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl bg-navy-950 text-white/70">
          {camera ? <video ref={videoRef} className="h-full w-full object-cover" playsInline muted /> : <div className="text-center"><ScanLine className="mx-auto h-10 w-10" /><p className="mt-2 text-sm">Camera off</p></div>}
          {camera && <div className="pointer-events-none absolute inset-10 rounded-2xl border-2 border-coral-400" />}
        </div>
        <Button className="mt-3 w-full" variant={camera ? "outline" : "navy"} onClick={() => { setCamError(null); setCamera((c) => !c); }}>{camera ? <><CameraOff className="h-4 w-4" />Stop camera</> : <><Camera className="h-4 w-4" />Scan QR code</>}</Button>
        {camError && <Notice tone="warning" className="mt-3">{camError}</Notice>}
        <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) check(code.trim()); }}>
          <label htmlFor="code" className="sr-only">Ticket number or code</label>
          <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="TKT-XXXX-XXXX" className="font-mono uppercase" autoComplete="off" />
          <Button type="submit" variant="outline" loading={pending}>Check</Button>
        </form>
      </div>
      <div aria-live="polite">
        <AnimatePresence mode="wait">
          {result && (
            <motion.div key={JSON.stringify(result)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={cn("rounded-2xl border-2 p-6", result.ok ? "border-success bg-success-bg" : result.reason === "already_boarded" ? "border-warning bg-warning-bg" : "border-danger bg-danger-bg")}>
              <div className="flex items-center gap-3">
                {result.ok ? <CheckCircle2 className="h-10 w-10 text-success" /> : result.reason === "already_boarded" ? <AlertTriangle className="h-10 w-10 text-warning" /> : <XCircle className="h-10 w-10 text-danger" />}
                <div><p className="text-xl font-semibold">{result.ok ? (result.status === "boarded_now" ? "Boarded" : "Valid ticket") : result.reason === "already_boarded" ? "Already used" : "Not valid"}</p>{!result.ok && <p className="text-[15px]">{result.message}</p>}</div>
              </div>
              {t && (
                <dl className="mt-5 grid grid-cols-2 gap-3 text-[15px]">
                  <div className="col-span-2"><dt className="text-xs uppercase text-ink-3">Passenger</dt><dd className="text-lg font-semibold">{t.passenger}</dd></div>
                  <div><dt className="text-xs uppercase text-ink-3">Seat</dt><dd className="text-lg font-semibold">{t.seat ?? "Open"}</dd></div>
                  <div><dt className="text-xs uppercase text-ink-3">Booking</dt><dd className="font-mono">{t.reference}</dd></div>
                  <div className="col-span-2"><dt className="text-xs uppercase text-ink-3">Journey</dt><dd>{t.route} · {new Date(t.departureAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}</dd></div>
                </dl>
              )}
              {result.ok && result.status === "valid" && <Button size="lg" className="mt-5 w-full" loading={pending} onClick={() => checked && check(checked, true)}>Confirm boarding</Button>}
              {(result.ok && result.status === "boarded_now") || !result.ok ? <Button variant="outline" className="mt-5 w-full bg-white" onClick={() => { setResult(null); setCode(""); }}>Next passenger</Button> : null}
            </motion.div>
          )}
        </AnimatePresence>
        {!result && <div className="grid h-full min-h-48 place-items-center rounded-2xl border border-dashed border-line-strong bg-white p-6 text-center text-ink-3">Scan or enter a ticket to check it. Confirm boarding once you&apos;ve matched the passenger&apos;s ID.</div>}
      </div>
    </div>
  );
}
