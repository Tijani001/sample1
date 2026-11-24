"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function CommissionInput({ id, value, action }: { id: string; value: number; action: (id: string, p: number) => Promise<{ ok: boolean; error?: string; message?: string }> }) {
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1">
      <input type="number" step={0.5} min={0} max={30} value={v} onChange={(e) => setV(Number(e.target.value))} aria-label="Commission percent" className="h-9 w-16 rounded-lg border border-line-strong px-2 text-sm tabular" />%
      {v !== value && <button disabled={pending} onClick={() => start(async () => { const r = await action(id, v); if (r.ok) toast.success(r.message); else toast.error(r.error); })} className="ml-1 text-xs font-semibold text-coral-700">Save</button>}
    </span>
  );
}
