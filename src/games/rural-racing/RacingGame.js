// RacingGame: the Scene. Wires track, vehicles, players, AI, HUD, and
// race/lap state. Supports 1 or 2 local human players (split-screen for 2)
// plus AI fillers.

import { Scene } from '../../engine/Scene.js';
import { Track } from './Track.js';
import { Vehicle } from './Vehicle.js';
import { AIDriver } from './AIDriver.js';
import { HUD } from './HUD.js';
import countryside from './tracks/countryside.js';
import { resolveCircles } from '../../engine/physics/Collision.js';

const VEHICLE_COLORS = ['#ffcc33', '#66e0a3', '#ff6b6b', '#7aa9ff', '#c98bff', '#ffa15a'];

const KB_LAYOUT_P1 = {
  axes: { steer: ['ArrowLeft', 'ArrowRight'] },
  actions: {
    accelerate: ['ArrowUp'],
    brake: ['ArrowDown'],
    handbrake: ['Space'],
    pause: ['KeyP']
  }
};
const KB_LAYOUT_P2 = {
  axes: { steer: ['KeyA', 'KeyD'] },
  actions: {
    accelerate: ['KeyW'],
    brake: ['KeyS'],
    handbrake: ['ShiftLeft']
  }
};
const PAD_LAYOUT = {
  gamepadAxes: {
    steer: { axis: 0 }
  },
  gamepadActions: {
    accelerate: ['rt', 'a'],
    brake: ['lt', 'b'],
    handbrake: ['x'],
    pause: ['start']
  }
};

export class RacingGame extends Scene {
  constructor({ humans = 1, aiCount = 3, track = countryside } = {}) {
    super();
    this.humansRequested = Math.max(1, Math.min(2, humans));
    this.aiCount = aiCount;
    this.trackData = track;
  }

  async init() {
    const ctx = this.ctx;
    this.track = new Track(this.trackData);
    this.vehicles = [];
    this.humanPlayers = [];
    this.aiDrivers = [];
    this.engineSounds = [];
    this.state = 'countdown'; // countdown -> racing -> finished
    this.countdown = 3.999;
    this.elapsed = 0;
    this.cameraSnap = true;

    // Build player input bindings.
    const p1 = ctx.input.createPlayer({
      keyboard: KB_LAYOUT_P1,
      gamepad: 'auto',
      ...PAD_LAYOUT
    });
    this.humanPlayers.push(p1);
    if (this.humansRequested >= 2) {
      const p2 = ctx.input.createPlayer({
        keyboard: KB_LAYOUT_P2,
        gamepad: 'auto',
        ...PAD_LAYOUT
      });
      this.humanPlayers.push(p2);
    }

    // Spawn vehicles in starting grid order: humans first, then AI.
    const grid = this.track.startGrid;
    let slot = 0;
    for (let i = 0; i < this.humanPlayers.length; i++) {
      const g = grid[slot++];
      const v = new Vehicle({
        x: g.x, y: g.y, angle: g.angle,
        color: VEHICLE_COLORS[i % VEHICLE_COLORS.length],
        name: `P${i + 1}`,
        isHuman: true
      });
      this.vehicles.push(v);
    }
    for (let i = 0; i < this.aiCount; i++) {
      const g = grid[slot++ % grid.length];
      const color = VEHICLE_COLORS[(this.humanPlayers.length + i) % VEHICLE_COLORS.length];
      const v = new Vehicle({
        x: g.x, y: g.y, angle: g.angle,
        color,
        name: `CPU${i + 1}`,
        isHuman: false
      });
      this.vehicles.push(v);
      this.aiDrivers.push(new AIDriver({ vehicle: v, track: this.track, skill: 0.55 + i * 0.08 }));
    }

    // Engine sounds: one per human only (avoid noise spam).
    for (const _ of this.humanPlayers) {
      this.engineSounds.push(ctx.audio.engineLoop());
    }

    // Camera setup.
    ctx.renderer.camera.setBounds(this.track.bounds);
    ctx.renderer.camera.setZoom(0.9);

    // HUD.
    this.hud = new HUD(ctx.hudRoot);
    if (this.humanPlayers.length === 1) {
      this.hud.ensure('p1', { position: { top: '12px', left: '12px' } });
    } else {
      this.hud.ensure('p1', { position: { top: '12px', left: '12px' } });
      this.hud.ensure('p2', { position: { top: '12px', right: '12px' } });
    }

    // Pause overlay state.
    this.paused = false;

    this._renderCountdownOverlay();
  }

  destroy() {
    for (const s of this.engineSounds) s.stop?.();
    this.engineSounds = [];
    if (this.hud) this.hud.destroy();
    if (this.ctx?.overlayRoot) {
      this.ctx.overlayRoot.replaceChildren();
      this.ctx.overlayRoot.hidden = true;
    }
    if (this.ctx?.input) {
      for (const p of this.humanPlayers) this.ctx.input.removePlayer(p);
    }
  }

  // --- Update loop ---
  update(dt) {
    if (this.paused) return;

    if (this.state === 'countdown') {
      this.countdown -= dt;
      this._renderCountdownOverlay();
      if (this.countdown <= 0) {
        this.state = 'racing';
        this.elapsed = 0;
        for (const v of this.vehicles) v.lastLapStart = 0;
        this._clearOverlay();
        this.ctx.audio.beep({ freq: 880, duration: 0.18 });
      } else {
        // Cars locked at start.
        for (const v of this.vehicles) v.setControl({ steer: 0, throttle: 0 });
        this._integrateAll(dt);
        return;
      }
    }

    if (this.state === 'racing') this.elapsed += dt;

    // Apply human input.
    for (let i = 0; i < this.humanPlayers.length; i++) {
      const p = this.humanPlayers[i];
      const v = this.vehicles[i];
      const accel = p.isDown('accelerate') ? 1 : 0;
      const brake = p.isDown('brake') ? 1 : 0;
      const throttle = accel - brake;
      const steer = p.axis('steer');
      v.setControl({ steer, throttle, handbrake: p.isDown('handbrake') });
      if (p.justPressed('pause')) this.togglePause();
    }

    // AI input.
    for (const ai of this.aiDrivers) ai.update(dt);

    this._integrateAll(dt);
    this._handleLaps();
    this._updateRanking();
    this._updateHUD();
    this._updateAudio();

    // Camera follow.
    if (this.humanPlayers.length === 1) {
      const v = this.vehicles[0];
      if (this.cameraSnap) { this.ctx.renderer.camera.snapTo(v.body.x, v.body.y); this.cameraSnap = false; }
      else this.ctx.renderer.camera.follow(v.body.x, v.body.y);
    } else {
      // 2-player: frame midpoint between the two cars; we'll handle split-screen at render time.
      // For shared single-camera fallback, center on midpoint with zoom-out.
      // (Render path uses two viewports; this branch is unused there.)
    }

    // Finish detection.
    const allHumansDone = this.humanPlayers.every((_, i) => this.vehicles[i].finished);
    if (this.state === 'racing' && allHumansDone) {
      this.state = 'finished';
      this._renderFinishedOverlay();
    }
  }

  _integrateAll(dt) {
    for (const v of this.vehicles) v.update(dt, this.track);
    // Pairwise collision between vehicles (cheap N^2; N is small).
    for (let i = 0; i < this.vehicles.length; i++) {
      for (let j = i + 1; j < this.vehicles.length; j++) {
        resolveCircles(this.vehicles[i].body, this.vehicles[j].body, 0.25);
      }
    }
  }

  _handleLaps() {
    if (this.state !== 'racing') return;
    const total = this.track.centerline.length;
    for (const v of this.vehicles) {
      if (v.finished) continue;
      // Track lap when the seg index wraps from near-end to near-start.
      if (v._lastSeg == null) { v._lastSeg = v.segIndex; continue; }
      const wentForward = (v.segIndex - v._lastSeg + total) % total;
      if (wentForward > total / 2) {
        // Wrapped backward, ignore.
      } else if (v._lastSeg > total - 6 && v.segIndex < 6) {
        // crossed start/finish.
        const lapTime = this.elapsed - v.lastLapStart;
        if (v.lap > 0 && lapTime < v.bestLapTime) v.bestLapTime = lapTime;
        v.lastLapStart = this.elapsed;
        v.lap += 1;
        if (v.lap >= this.track.totalLaps) {
          v.finished = true;
          v.finishTime = this.elapsed;
        }
      }
      v._lastSeg = v.segIndex;
      v.totalRaceTime = this.elapsed;
      v.progress = v.lap * total + v.segIndex + v.segT;
    }
  }

  _updateRanking() {
    // Sort by progress descending; finished cars rank by finishTime ascending.
    const byProgress = this.vehicles.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    this._ranking = new Map(byProgress.map((v, i) => [v, i + 1]));
  }

  _updateHUD() {
    const total = this.track.totalLaps;
    for (let i = 0; i < this.humanPlayers.length; i++) {
      const v = this.vehicles[i];
      const pos = this._ranking.get(v) || '?';
      const speedKph = Math.abs(v.forwardSpeed) * 0.3;
      const lapNum = Math.min(v.lap + 1, total);
      const padState = this.humanPlayers[i].hasGamepad() ? 'pad' : 'kbd';
      this.hud.update(`p${i + 1}`, {
        title: `Player ${i + 1} — ${padState}`,
        lap: `LAP ${lapNum}/${total}`,
        pos: `P${pos}/${this.vehicles.length}`,
        info: v.offTrack ? 'OFF TRACK' : (v.finished ? 'FINISHED' : ''),
        speed: speedKph
      });
    }
  }

  _updateAudio() {
    for (let i = 0; i < this.humanPlayers.length; i++) {
      const v = this.vehicles[i];
      const t = Math.min(1, Math.abs(v.forwardSpeed) / 360);
      this.engineSounds[i]?.setIntensity(t);
    }
  }

  // --- Render ---
  render(renderer) {
    renderer.clear('#1a1f1a');
    if (this.humanPlayers.length === 1) {
      this._renderViewport(renderer, this.vehicles[0], 0, 0, renderer.width, renderer.height);
    } else {
      const half = renderer.width / 2;
      this._renderViewport(renderer, this.vehicles[0], 0, 0, half, renderer.height);
      this._renderViewport(renderer, this.vehicles[1], half, 0, renderer.width - half, renderer.height);
      // Split divider.
      renderer.pushScreen();
      renderer.ctx.fillStyle = '#0c0f14';
      renderer.ctx.fillRect(half - 1, 0, 2, renderer.height);
      renderer.popScreen();
    }
  }

  _renderViewport(renderer, follow, x, y, w, h) {
    const c = renderer.ctx;
    const cam = renderer.camera;
    cam.setViewport(w, h);
    cam.follow(follow.body.x, follow.body.y);

    c.save();
    // Scissor rect (no actual clip API, but setTransform isolates).
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
    c.translate(x + w / 2, y + h / 2);
    c.scale(cam.zoom, cam.zoom);
    c.translate(-cam.x, -cam.y);

    // World draws.
    this.track.draw(renderer);
    for (const v of this.vehicles) v.draw(c);

    c.restore();
  }

  // --- Overlays ---
  _renderCountdownOverlay() {
    const root = this.ctx.overlayRoot;
    if (!root) return;
    root.hidden = false;
    const n = Math.ceil(this.countdown);
    const text = n > 0 ? String(n) : 'GO!';
    root.replaceChildren();
    const card = document.createElement('div');
    card.className = 'overlay-card';
    card.innerHTML = `<h2 style="font-size:64px;margin:0;">${text}</h2>`;
    card.style.background = 'transparent';
    card.style.border = '0';
    root.appendChild(card);
  }
  _clearOverlay() {
    const root = this.ctx.overlayRoot;
    if (!root) return;
    root.hidden = true;
    root.replaceChildren();
  }
  _renderFinishedOverlay() {
    const root = this.ctx.overlayRoot;
    if (!root) return;
    root.hidden = false;
    root.replaceChildren();
    const card = document.createElement('div');
    card.className = 'overlay-card';
    const sorted = this.vehicles.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    const rows = sorted.map((v, i) => {
      const t = v.finished ? `${v.finishTime.toFixed(2)}s` : 'DNF';
      const best = v.bestLapTime !== Infinity ? `best ${v.bestLapTime.toFixed(2)}s` : '';
      return `<tr><td>${i + 1}</td><td style="color:${v.color}">${v.name}</td><td>${t}</td><td style="color:#8b95a7">${best}</td></tr>`;
    }).join('');
    card.innerHTML = `
      <h2>Race finished</h2>
      <table style="margin: 0 auto 14px; border-collapse: collapse; font-family: ui-monospace, monospace;">
        ${rows}
      </table>
      <p>Press <strong>R</strong> to race again, <strong>Esc</strong> for menu.</p>
    `;
    root.appendChild(card);
    const onKey = (e) => {
      if (e.code === 'KeyR') {
        window.removeEventListener('keydown', onKey);
        this._restart();
      }
    };
    window.addEventListener('keydown', onKey);
  }

  _restart() {
    this.destroy();
    return this.init();
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      const root = this.ctx.overlayRoot;
      root.hidden = false;
      root.replaceChildren();
      const card = document.createElement('div');
      card.className = 'overlay-card';
      card.innerHTML = '<h2>Paused</h2><p>Press P to resume, Esc for menu.</p>';
      root.appendChild(card);
    } else {
      this._clearOverlay();
    }
  }
}
