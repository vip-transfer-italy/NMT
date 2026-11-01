const CACHE = "nmt-legko-v3";
const FILES = ["./", "index.html", "css/app.css", "js/app.js", "js/data/ukr.js", "js/data/math.js", "js/data/history.js", "js/data/geo.js", "js/data/_helpers.js", "js/data/ukr-2.js", "js/data/math-2.js", "js/data/history-2.js", "js/data/geo-2.js", "icon.svg", "manifest.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
// network first (fresh content), fall back to cache offline
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
