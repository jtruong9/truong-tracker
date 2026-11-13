// Offline support. Keeps a copy of every app file so the tracker opens with no internet.
// Your items are NOT stored here: they stay in your Google Drive folder.
//
// When you change any app file, bump VERSION (and the ?v=N numbers in index.html). tests/offline.test.js checks this.
const VERSION = "v6";
const CACHE = `truong-tracker-${VERSION}`;
const FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./apple-touch-icon.png",
  "./css/app.css?v=6",
  "./js/config.js?v=6", "./js/icons.js?v=6", "./js/model.js?v=6", "./js/drive.js?v=6", "./js/store.js?v=6", "./js/app.js?v=6", "./js/drag.js?v=6", "./js/offline.js?v=6",
  "./vendor/fonts/inter-400.woff2", "./vendor/fonts/inter-500.woff2", "./vendor/fonts/inter-600.woff2", "./vendor/fonts/inter-700.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("truong-tracker-") && k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("message", (e) => { if (e.data === "activate-now") self.skipWaiting(); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("./index.html", { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
