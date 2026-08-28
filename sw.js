// Service worker for devxkapoor-learning.
//
// Deliberately has no precache list. Stylesheet and script URLs already carry a
// content hash (bump-assets.py), so they can be cached hard and forever — the
// URL changes precisely when the file does. Everything else is decided at
// request time, which means this file does not have to be regenerated on every
// deploy the way a precache manifest would.
const CACHE = "dk-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

// Topic data is not content-hashed and changes as topics are built, so the
// network wins when it can and the cache is the safety net.
async function networkFirst(req, fallbackToIndex) {
  try {
    const res = await fetch(req);
    if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await caches.match(req);
    if (hit) return hit;
    if (fallbackToIndex) {
      const index = await caches.match(new URL("index.html", self.registration.scope).href);
      if (index) return index;
    }
    throw e;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Fonts and anything else off-origin are left entirely alone.
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req, true));
    return;
  }
  if (/\.(css|js)$/.test(url.pathname) && url.search.startsWith("?v=")) {
    e.respondWith(cacheFirst(req));
    return;
  }
  if (/\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(cacheFirst(req));
    return;
  }
  e.respondWith(networkFirst(req, false));
});
