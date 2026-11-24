"use client";
import { useEffect } from "react";

/** Registers the service worker (offline ticket access, app shell caching). Disabled on localhost dev. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (location.hostname === "localhost" && process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
