// Platform: ties together the Engine, GameRegistry, GameLoader, and Launcher.
// Owns the visible mode (home vs game) and the small in-game "back to menu"
// button. Games and engine code stay DOM-agnostic except for HUD/overlay
// roots passed in.

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
    this.menuButton = document.getElementById('menu-button');

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
  }

  async launch(id) {
    try {
      this.launcherEl.hidden = true;
      this.gameHostEl.hidden = false;
      this.canvas.focus({ preventScroll: true });
      // Unlock audio on first user gesture (the click that triggered launch).
      this.engine.audio.unlock().catch(() => {});
      this.engine.start();
      const manifest = await this.loader.launch(id);
      this._currentGameId = id;
      document.title = `${manifest.title} — GameFlash`;
    } catch (err) {
      console.error(err);
      this._showLaunchError(err);
      this.showHome();
    }
  }

  _wireChrome() {
    this.menuButton.addEventListener('click', () => this.showHome());
    // Esc returns to launcher when in a game.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this._currentGameId) this.showHome();
    });
  }

  _showLaunchError(err) {
    // Non-fatal error UI: render a card on the launcher briefly.
    const card = document.createElement('div');
    card.className = 'game-card';
    card.style.borderColor = 'var(--danger)';
    card.style.cursor = 'default';
    card.innerHTML = `<h2 style="color: var(--danger)">Launch failed</h2><p></p>`;
    card.querySelector('p').textContent = err.message || String(err);
    this.gridEl.prepend(card);
    setTimeout(() => card.remove(), 6000);
  }
}
