"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(code); setDone(true); setTimeout(() => setDone(false), 1600); }}
      className="flex h-11 w-full items-center justify-between rounded-xl border border-dashed border-coral-300 bg-coral-50/50 px-4 font-mono text-base font-semibold text-coral-700 hover:bg-coral-50" aria-label={`Copy code ${code}`}>
      {code}<span className="flex items-center gap-1.5 font-sans text-sm">{done ? <><Check className="h-4 w-4" />Copied</> : <><Copy className="h-4 w-4" />Copy</>}</span>
    </button>
  );
}
