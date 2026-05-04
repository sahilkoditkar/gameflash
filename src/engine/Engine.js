// Engine: the deterministic fixed-timestep loop and lifecycle.
// The engine is intentionally agnostic about what is being rendered.
// It owns: time, the active Scene, the Renderer, and the InputManager.
// Games receive these via Scene.context and never reach into the engine internals.

import { Renderer } from './render/Renderer.js';
import { InputManager } from './input/InputManager.js';
import { AssetManager } from './assets/AssetManager.js';
import { AudioManager } from './audio/AudioManager.js';

const FIXED_DT = 1 / 60;          // 60 Hz logic
const MAX_FRAME_DT = 0.25;        // clamp huge stalls (tab unfocus)
const MAX_STEPS_PER_FRAME = 5;    // avoid spiral-of-death

export class Engine {
  constructor({ canvas, hudRoot, overlayRoot }) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.input = new InputManager();
    this.assets = new AssetManager();
    this.audio = new AudioManager();
    this.hudRoot = hudRoot;
    this.overlayRoot = overlayRoot;

    this.scene = null;
    this._running = false;
    this._rafId = 0;
    this._accumulator = 0;
    this._lastTime = 0;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._fps = 0;
    this._onFps = null;

    this._loop = this._loop.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
  }

  context() {
    return {
      canvas: this.canvas,
      renderer: this.renderer,
      input: this.input,
      assets: this.assets,
      audio: this.audio,
      hudRoot: this.hudRoot,
      overlayRoot: this.overlayRoot,
      width: () => this.renderer.width,
      height: () => this.renderer.height
    };
  }

  onFps(cb) { this._onFps = cb; }

  async setScene(scene) {
    if (this.scene) {
      try { this.scene.destroy?.(); } catch (e) { console.error(e); }
    }
    this.scene = scene;
    if (scene) {
      scene.engine = this;
      scene.ctx = this.context();
      await scene.init?.();
    }
  }

  start() {
    if (this._running) return;
    this._running = true;
    this.input.attach();
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);
    this._onResize();
    this._lastTime = performance.now();
    this._accumulator = 0;
    this._rafId = requestAnimationFrame(this._loop);
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    cancelAnimationFrame(this._rafId);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.input.detach();
    if (this.scene) {
      try { this.scene.destroy?.(); } catch (e) { console.error(e); }
      this.scene = null;
    }
    if (this.hudRoot) this.hudRoot.replaceChildren();
    if (this.overlayRoot) {
      this.overlayRoot.replaceChildren();
      this.overlayRoot.hidden = true;
    }
  }

  _onResize() { this.renderer.resize(); }

  _onVisibility() {
    // Reset the clock so a long hidden tab doesn't try to catch up.
    if (!document.hidden) {
      this._lastTime = performance.now();
      this._accumulator = 0;
    }
  }

  _loop(now) {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(this._loop);

    let frameDt = (now - this._lastTime) / 1000;
    this._lastTime = now;
    if (frameDt > MAX_FRAME_DT) frameDt = MAX_FRAME_DT;

    this._accumulator += frameDt;
    this.input.beginFrame();

    let steps = 0;
    while (this._accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.scene?.update?.(FIXED_DT);
      this._accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this._accumulator = 0;

    const alpha = this._accumulator / FIXED_DT;
    this.scene?.render?.(this.renderer, alpha);
    this.input.endFrame();

    this._fpsAcc += frameDt;
    this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this._fps = Math.round(this._fpsFrames / this._fpsAcc);
      this._fpsAcc = 0;
      this._fpsFrames = 0;
      this._onFps?.(this._fps);
    }
  }
}
