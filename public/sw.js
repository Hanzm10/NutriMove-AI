// NutriMove AI service worker (PRD §8.6 offline, P1). Plain JS, no build step.
// - Immutable assets (Next static chunks, icons, ORT runtime, bundled models): cache-first.
// - Page navigations: network-first; the last copy of each visited page is shown offline.
// - Everything else (Supabase, Server Actions, APIs): network only, never cached.
const VERSION = "v1";
const STATIC = `nm-static-${VERSION}`;
const PAGES = `nm-pages-${VERSION}`;
const OFFLINE = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("nm-") && ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) => /^\/(_next\/static|icons|ort|models)\//.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Signing out (a POST form) wipes cached pages so the next person on this device can't see them.
  if (url.pathname.startsWith("/auth/signout")) {
    event.waitUntil(caches.delete(PAGES));
    return;
  }
  if (req.method !== "GET") return;

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic" && !url.pathname.startsWith("/auth")) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) ?? (await caches.match(OFFLINE)) ?? Response.error()),
    );
  }
});
