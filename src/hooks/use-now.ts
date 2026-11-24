"use client";
import { useSyncExternalStore } from "react";

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) timer = setInterval(() => { now = Date.now(); listeners.forEach((l) => l()); }, 15000);
  now = Date.now();
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) { clearInterval(timer); timer = null; }
  };
}

/** Wall-clock time that updates every 15s on the client; null during server render. */
export function useNow() {
  return useSyncExternalStore(subscribe, () => now, () => null);
}

const noop = () => () => {};
/** Reads a browser-only value without causing hydration mismatches. */
export function useClientValue<T>(read: () => T, server: T) {
  return useSyncExternalStore(noop, read, () => server);
}
