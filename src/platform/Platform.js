// Platform: ties together the Engine, GameRegistry, GameLoader, and Launcher.
// Owns the visible mode (home vs game) and the chrome (top-bar buttons, FPS).
//
// The Platform is the single component aware of both DOM chrome and the engine;
// games and engine code stay DOM-agnostic except for HUD/overlay roots passed in.

import { Engine } from '../engine/Engine.js';
import { GameRegistry } from './GameRegistry.js';
import { GameLoader } from './GameLoader.js';
import { Launcher } from './Launcher.js';

export class Platform {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.hudRoot = document.getElementById('hud-layer');
    this.overlayRoot = document.getElementById('overlay-layer');
    this.launcherEl = document.getElementById('launcher');
    this.gameHostEl = document.getElementById('game-host');
    this.gridEl = document.getElementById('game-grid');
    this.statusEl = document.getElementById('status-text');
    this.fpsEl = document.getElementById('fps-text');

    this.registry = new GameRegistry();
    this.engine = new Engine({
      canvas: this.canvas,
      hudRoot: this.hudRoot,
      overlayRoot: this.overlayRoot
    });
    this.loader = new GameLoader(this.engine, this.registry);
    this.launcher = new Launcher({
      root: this.gridEl,
      registry: this.registry,
      onLaunch: (id) => this.launch(id)
    });

    this._currentGameId = null;
    this._wireChrome();
    this.engine.onFps((fps) => { this.fpsEl.textContent = `${fps} fps`; });
  }

  registerGames(manifests) {
    for (const m of manifests) this.registry.register(m);
    this.launcher.render();
  }

  showHome() {
    this.engine.stop();
    this._currentGameId = null;
    this.gameHostEl.hidden = true;
    this.launcherEl.hidden = false;
    this.fpsEl.textContent = '—';
    this.statusEl.textContent = 'Ready.';
  }

  async launch(id) {
    try {
      this.statusEl.textContent = `Loading: ${id}...`;
      this.launcherEl.hidden = true;
      this.gameHostEl.hidden = false;
      // Resize canvas before scene init so renderer has correct size.
      this.canvas.focus({ preventScroll: true });
      // Unlock audio on first user gesture.
      this.engine.audio.unlock().catch(() => {});
      this.engine.start();
      const manifest = await this.loader.launch(id);
      this._currentGameId = id;
      this.statusEl.textContent = `Playing: ${manifest.title}`;
    } catch (err) {
      console.error(err);
      this.statusEl.textContent = `Error: ${err.message}`;
      this.showHome();
    }
  }

  _wireChrome() {
    document.querySelector('[data-action="home"]').addEventListener('click', () => this.showHome());
    document.querySelector('[data-action="fullscreen"]').addEventListener('click', () => {
      const el = document.documentElement;
      if (!document.fullscreenElement) {
        el.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });
    // Esc returns to launcher when in a game.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this._currentGameId) this.showHome();
    });
  }
}
