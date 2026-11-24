"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return <p className="mt-4 text-xs text-ink-3" aria-live="polite">Checking automatically every {seconds} seconds…</p>;
}
