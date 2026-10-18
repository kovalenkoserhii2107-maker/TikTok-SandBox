// Service worker: игра работает офлайн. Меняй VERSION при каждом обновлении.
const VERSION = 'kaboom-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/lib/planck.min.js',
  './js/main.js',
  './js/ui.js',
  './js/pwa.js',
  './js/sim.js',
  './js/render.js',
  './js/effects.js',
  './js/worlds.js',
  './js/audio.js',
  './js/util.js',
  './js/catalog.js',
  './js/scene.js',
  './js/textures.js',
  './js/links.js',
  './js/entities/machines.js',
  './js/entities/water.js',
  './js/entities/base.js',
  './js/entities/ragdoll.js',
  './js/entities/props.js',
  './js/entities/weapons.js',
  './js/entities/explosives.js',
  './js/entities/vehicles.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Сначала кэш (мгновенный запуск), параллельно обновляем файл из сети.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        e.waitUntil(net);
        return cached;
      }
      const res = await net;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('./index.html');
      return new Response('', { status: 504 });
    }),
  );
});
