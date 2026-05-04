// Entry point. Boots the platform, registers the games, registers the
// service worker for offline support, and renders the launcher.

import { Platform } from './platform/Platform.js';
import games from './games/index.js';

const platform = new Platform();
platform.registerGames(games);
platform.showHome();

// Register the service worker only when served over http(s) — `file://` doesn't
// support service workers and would log a noisy error during local dev.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
