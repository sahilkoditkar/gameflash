// GameFlash service worker.
// Strategy:
//   - Precache the app shell on install.
//   - Cache-first for same-origin GET requests, network fallback writes to cache.
//   - Network-only for non-GET and cross-origin requests.
// The cache name is versioned; bumping the version invalidates the old shell.

const CACHE_VERSION = 'gameflash-v2';
const SHELL_PATHS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/main.css',
  './src/main.js',
  './src/platform/Platform.js',
  './src/platform/GameRegistry.js',
  './src/platform/GameLoader.js',
  './src/platform/Launcher.js',
  './src/engine/Engine.js',
  './src/engine/Scene.js',
  './src/engine/render/Renderer.js',
  './src/engine/render/Camera.js',
  './src/engine/input/InputManager.js',
  './src/engine/input/KeyboardSource.js',
  './src/engine/input/GamepadSource.js',
  './src/engine/physics/Body.js',
  './src/engine/physics/Collision.js',
  './src/engine/assets/AssetManager.js',
  './src/engine/audio/AudioManager.js',
  './src/engine/utils/math.js',
  './src/engine/utils/rng.js',
  './src/games/index.js',
  './src/games/rural-racing/index.js',
  './src/games/rural-racing/RacingGame.js',
  './src/games/rural-racing/Vehicle.js',
  './src/games/rural-racing/Track.js',
  './src/games/rural-racing/AIDriver.js',
  './src/games/rural-racing/HUD.js',
  './src/games/rural-racing/tracks/countryside.js',
  './src/games/arena-brawl/index.js',
  './src/games/arena-brawl/BrawlGame.js',
  './src/games/arena-brawl/Fighter.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_PATHS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
