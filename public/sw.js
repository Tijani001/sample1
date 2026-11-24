/* Goroada service worker.
 * - App shell & static assets: stale-while-revalidate.
 * - Ticket pages (/trips/GR-…): network-first, cached copy shown offline so travellers can board without data.
 *   Only pages the traveller has opened on this device are cached; nothing else personal is stored.
 * - API, checkout and payment routes are never cached. */
const VERSION = "goroada-v1";
const STATIC = `${VERSION}-static`;
const TICKETS = `${VERSION}-tickets`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png", "/brand/icon.svg"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/book") || url.pathname.startsWith("/pay") || url.pathname.startsWith("/checkout") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/operator")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) {
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (req.mode === "navigate") {
    const isTicket = /^\/trips\/GR-[A-Z0-9]+$/i.test(url.pathname);
    e.respondWith(fetch(req).then((res) => {
      if (isTicket && res.ok) caches.open(TICKETS).then((c) => c.put(url.pathname, res.clone()));
      return res;
    }).catch(async () => (isTicket && (await caches.match(url.pathname))) || (await caches.match(OFFLINE_URL))));
  }
});
