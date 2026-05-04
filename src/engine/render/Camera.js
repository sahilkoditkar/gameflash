// Camera with smooth follow and rectangular bounds.
// The camera is value-based (no DOM, no canvas) — Renderer queries x/y/zoom.

import { clamp, lerp } from '../utils/math.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.viewW = 0;
    this.viewH = 0;
    this.bounds = null;       // { minX, minY, maxX, maxY } | null
    this.smoothness = 0.18;   // 0 = teleport, 1 = no movement
  }

  setViewport(w, h) { this.viewW = w; this.viewH = h; }
  setZoom(z) { this.zoom = z; }
  setBounds(b) { this.bounds = b; }

  // Snap immediately to (x, y) — used for first frame to avoid pan-in.
  snapTo(x, y) {
    this.x = x;
    this.y = y;
    this._clampToBounds();
  }

  // Smoothly chase a target. Call once per fixed update.
  follow(targetX, targetY, dtFactor = 1) {
    const t = 1 - Math.pow(1 - this.smoothness, dtFactor);
    this.x = lerp(this.x, targetX, t);
    this.y = lerp(this.y, targetY, t);
    this._clampToBounds();
  }

  _clampToBounds() {
    if (!this.bounds) return;
    const halfW = (this.viewW / this.zoom) / 2;
    const halfH = (this.viewH / this.zoom) / 2;
    const { minX, minY, maxX, maxY } = this.bounds;
    // If world is smaller than view, center on the world.
    if (maxX - minX < halfW * 2) this.x = (minX + maxX) / 2;
    else this.x = clamp(this.x, minX + halfW, maxX - halfW);
    if (maxY - minY < halfH * 2) this.y = (minY + maxY) / 2;
    else this.y = clamp(this.y, minY + halfH, maxY - halfH);
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y
    };
  }
}
