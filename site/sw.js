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
  "./js/mascot.js",
  "./js/speech.js",
  "./js/storage.js",
  "./content/items.csv",
  "./content/units.csv",
  "./audio/index.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

async function photoFiles() {
  // 照片清單取自 credits.json（tools/pick_images.py build 產生）
  try {
    const res = await fetch("./content/credits.json", { cache: "no-store" });
    return Object.keys(await res.json()).map((id) => `./content/images/${id}.webp`);
  } catch (e) {
    return [];
  }
}

async function audioFiles() {
  // 音檔清單由 tools/make_audio.py 產生；全部預先快取，斷網也有聲音（約 2 MB）
  try {
    const res = await fetch("./audio/index.json", { cache: "no-store" });
    const { texts } = await res.json();
    return Object.keys(texts).map((name) => `./audio/en/${name}.mp3`);
  } catch (e) {
    return [];
  }
}

self.addEventListener("install", (event) => {
  // 不自動 skipWaiting：讓頁面顯示「有新版本」，使用者點了才換（避免玩到一半換版）
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES);
    const media = [...await audioFiles(), ...await photoFiles(), "./content/credits.json"];
    // 音檔與照片分批加，個別失敗不影響安裝（播放時會退回瀏覽器語音、照片之後用到再抓）
    for (let i = 0; i < media.length; i += 40) {
      await Promise.all(media.slice(i, i + 40).map((u) => cache.add(u).catch(() => {})));
    }
  })());
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
