// Service worker：讓網站斷網也能玩。快取名稱帶版本號（js/version.js），版本一改就是新快取。
importScripts("./js/version.js");

const CACHE = `kids-learning-${self.APP_VERSION}`;
const FILES = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/version.js",
  "./js/app.js",
  "./js/content.js",
  "./js/engine.js",
  "./js/speech.js",
  "./js/storage.js",
  "./content/items.csv",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // 不自動 skipWaiting：讓頁面顯示「有新版本」，使用者點了才換（避免玩到一半換版）
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("kids-learning-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === "navigate") return (await cache.match("./index.html")) || Response.error();
      return Response.error();
    }
  })());
});
