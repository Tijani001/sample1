// Caches the app shell so the installed app opens instantly. API calls always go to the network.
const SHELL = "style-desk-v2";
const FILES = ["/", "/static/style.css", "/static/app.js", "/static/icons/icon-192.png", "/manifest.webmanifest"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  // Network first so new versions show up; fall back to the cached shell when offline.
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    if (r.ok && url.origin === location.origin) caches.open(SHELL).then((c) => c.put(url.pathname === "/" ? "/" : e.request, copy));
    return r;
  }).catch(() => caches.match(url.pathname === "/" || url.searchParams.has("share") ? "/" : e.request)));
});
