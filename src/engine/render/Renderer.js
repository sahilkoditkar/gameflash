// Canvas2D renderer with DPR-aware sizing and a Camera-aware drawing API.
// We deliberately keep this thin: it owns the context and exposes both
// "raw" 2D primitives (for HUD/overlays in screen space) and camera-transformed
// primitives (for world-space rendering). Game code never touches getContext.

import { Camera } from './Camera.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.dpr = 1;
    this.width = 0;   // CSS pixels
    this.height = 0;
    this.camera = new Camera();
    this._inWorld = false;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.width === cssW && this.height === cssH && this.dpr === dpr) return;
    this.width = cssW;
    this.height = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.camera.setViewport(cssW, cssH);
  }

  clear(color = '#000') {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = color;
    c.fillRect(0, 0, this.width, this.height);
  }

  // Apply the camera transform; subsequent draws are in world space.
  // `pushWorld()` and `popWorld()` always pair.
  pushWorld() {
    const c = this.ctx;
    c.save();
    const cam = this.camera;
    // Map world -> screen: translate to view center, scale by zoom, translate by -cam pos.
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.translate(this.width / 2, this.height / 2);
    c.scale(cam.zoom, cam.zoom);
    c.translate(-cam.x, -cam.y);
    this._inWorld = true;
  }

  popWorld() {
    this.ctx.restore();
    this._inWorld = false;
  }

  // Screen-space helpers (no camera transform).
  pushScreen() {
    const c = this.ctx;
    c.save();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
  popScreen() { this.ctx.restore(); }
}
