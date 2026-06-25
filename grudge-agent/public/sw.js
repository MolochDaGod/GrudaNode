/**
 * GRUDA Agent — service worker (app shell cache)
 */
const CACHE = "gruda-agent-v2";
const SHELL = [
  "/",
  "/index.html",
  "/local-store.js",
  "/ollama-client.js",
  "/treaty-chat.js",
  "/pwa-install.js",
  "/appdata.js",
  "/auto-mode.js",
  "/terminal-panel.js",
  "/orchestrator-panel.js",
  "/gruda-king.png",
  "/gruda-king.svg",
  "/favicon.ico",
  "/manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const net = fetch(e.request).then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});