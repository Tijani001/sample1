"use client";
import { useEffect, useState } from "react";

/** Seconds remaining until `iso`, updated every second. Null before hydration. */
export function useCountdown(iso: string | null | undefined) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!iso) return;
    const target = new Date(iso).getTime();
    const tick = () => setLeft(Math.max(0, Math.round((target - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);
  return left;
}

export function formatCountdown(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
