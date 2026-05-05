// RacingGame: the Scene. Wires track, vehicles, players, AI, HUD, and
// race/lap state. On launch it runs a multi-step pre-race wizard that
// resolves to a complete config (player count, track, options, players).
//
// On restart (R after race finish) the same config is reused — the wizard
// only runs the first time per launch.

import { Scene } from '../../engine/Scene.js';
import { Track } from './Track.js';
import { Vehicle } from './Vehicle.js';
import { AIDriver } from './AIDriver.js';
import { HUD } from './HUD.js';
import { resolveCircles } from '../../engine/physics/Collision.js';
import {
  RaceWizard, COLORS, DIFFICULTY, WEATHER, TIME_OF_DAY,
  bindingForDevice, applyLapsOverride, trackById
} from './Wizard.js';

const AI_NAMES = ['Reiner', 'Marlow', 'Pippa', 'Oso', 'Verity', 'Ash', 'Zeb', 'Cleo'];
const AI_LINE_OFFSETS = [0, -22, 24, -10, 14, -18, 20, -8];

// Reserve colours that humans claim so AI doesn't accidentally double up.
function aiColors(usedHexes) {
  return COLORS.map((c) => c.hex).filter((h) => !usedHexes.has(h));
}

export class RacingGame extends Scene {
  constructor(opts = {}) {
    super();
    // `config` lets a caller skip the wizard (used internally by restart).
    this.preset = opts.config || null;
    this.config = null;
  }

  async init() {
    const ctx = this.ctx;

    // Ensure the canvas focus is back on so the wizard's keydown listeners
    // receive Escape via window.
    ctx.canvas.focus({ preventScroll: true });

    if (!this.config) {
      if (this.preset) {
        this.config = this.preset;
      } else {
        const wizard = new RaceWizard(ctx);
        this.config = await wizard.run();
        if (!this.config) {
          // Cancelled at any step — bail out to launcher.
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
          return;
        }
      }
    }

    const cfg = this.config;
    const trackData = trackById(cfg.trackId);
    this.trackData = trackData;
    this.track = new Track(trackData);
    applyLapsOverride(this.track, cfg.options.laps);

    const weather = WEATHER[cfg.options.weather] || WEATHER.clear;
    const timeDef = TIME_OF_DAY[cfg.options.time] || TIME_OF_DAY.day;
    this.weather = weather;
    this.timeDef = timeDef;

    this.vehicles = [];
    this.humanPlayers = [];
    this.aiDrivers = [];
    this.engineSounds = [];
    this.state = 'countdown';
    this.countdown = 3.999;
    this.elapsed = 0;
    this.paused = false;

    // Build players from chosen devices/colours.
    const usedHexes = new Set();
    const grid = this.track.startGrid;
    let slot = 0;

    for (let i = 0; i < cfg.players.length; i++) {
      const pdef = cfg.players[i];
      const binding = bindingForDevice(pdef.device);
      const player = ctx.input.createPlayer(binding);
      this.humanPlayers.push(player);

      const g = grid[slot++];
      const v = new Vehicle({
        x: g.x, y: g.y, angle: g.angle,
        color: pdef.color.hex,
        name: `P${i + 1}`,
        isHuman: true,
        gripMul: weather.gripMul
      });
      this.vehicles.push(v);
      usedHexes.add(pdef.color.hex);
    }

    // AI drivers: count + skill scale come from difficulty.
    const diff = DIFFICULTY[cfg.options.difficulty] || DIFFICULTY.normal;
    const aiPalette = aiColors(usedHexes);
    for (let i = 0; i < diff.aiCount; i++) {
      const g = grid[slot++ % grid.length];
      const skill = diff.skillBase + (i / Math.max(1, diff.aiCount - 1)) * diff.skillSpread;
      const v = new Vehicle({
        x: g.x, y: g.y, angle: g.angle,
        color: aiPalette[i % aiPalette.length],
        name: AI_NAMES[i % AI_NAMES.length],
        isHuman: false,
        gripMul: weather.gripMul
      });
      this.vehicles.push(v);
      this.aiDrivers.push(new AIDriver({
        vehicle: v,
        track: this.track,
        skill,
        lineOffset: AI_LINE_OFFSETS[i % AI_LINE_OFFSETS.length],
        lookahead: 80 + i * 4,
        cornerCaution: 0.45 + (1 - skill) * 0.4
      }));
    }

    // Engine drone for human cars only.
    for (const _ of this.humanPlayers) this.engineSounds.push(ctx.audio.engineLoop());

    // Camera: fit the entire track in one viewport.
    ctx.renderer.camera.setBounds(this.track.bounds);
    this._refitCamera();

    // HUD.
    this.hud = new HUD(ctx.hudRoot);
    if (this.humanPlayers.length === 1) {
      this.hud.ensure('p1', { position: { top: '12px', right: '12px' } });
    } else {
      this.hud.ensure('p1', { position: { top: '12px', left: '64px' } });
      this.hud.ensure('p2', { position: { top: '12px', right: '12px' } });
    }

    this._renderCountdownOverlay();
  }

  destroy() {
    if (this.engineSounds) {
      for (const s of this.engineSounds) s.stop?.();
      this.engineSounds = [];
    }
    if (this.hud) this.hud.destroy();
    if (this.ctx?.overlayRoot) {
      this.ctx.overlayRoot.replaceChildren();
      this.ctx.overlayRoot.hidden = true;
    }
    if (this.ctx?.input && this.humanPlayers) {
      for (const p of this.humanPlayers) this.ctx.input.removePlayer(p);
    }
  }

  // The render loop can fire while init's await chain is still running
  // (wizard open). Guard the methods that depend on a built track.
  update(dt) { if (this.track) return this._update(dt); }
  render(renderer) {
    if (!this.track) { renderer.clear('#0c0f14'); return; }
    return this._render(renderer);
  }

  _refitCamera() {
    const cam = this.ctx.renderer.camera;
    cam.setViewport(this.ctx.renderer.width, this.ctx.renderer.height);
    cam.fitToBounds(this.track.bounds, 0);
  }

  // --- Update loop ---
  _update(dt) {
    if (this.paused) return;
    this._refitCamera();

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
        for (const v of this.vehicles) v.setControl({ steer: 0, throttle: 0 });
        this._integrateAll(dt);
        return;
      }
    }

    if (this.state === 'racing') this.elapsed += dt;

    // Human input.
    for (let i = 0; i < this.humanPlayers.length; i++) {
      const p = this.humanPlayers[i];
      const v = this.vehicles[i];
      const accel = p.isDown('accelerate') ? 1 : 0;
      const brake = p.isDown('brake') ? 1 : 0;
      v.setControl({
        steer: p.axis('steer'),
        throttle: accel - brake,
        handbrake: p.isDown('handbrake')
      });
      if (p.justPressed('pause')) this.togglePause();
    }

    for (const ai of this.aiDrivers) ai.update(dt);

    this._integrateAll(dt);
    this._handleLaps();
    this._updateRanking();
    this._updateHUD();
    this._updateAudio();

    const allHumansDone = this.humanPlayers.every((_, i) => this.vehicles[i].finished);
    if (this.state === 'racing' && allHumansDone) {
      this.state = 'finished';
      this._renderFinishedOverlay();
    }
  }

  _integrateAll(dt) {
    for (const v of this.vehicles) v.update(dt, this.track);
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
      if (v._lastSeg == null) { v._lastSeg = v.segIndex; continue; }
      if (v._lastSeg > total - 6 && v.segIndex < 6) {
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
  _render(renderer) {
    renderer.clear('#1a1f1a');
    renderer.pushWorld();
    this.track.draw(renderer);
    for (const v of this.vehicles) v.draw(renderer.ctx);
    renderer.popWorld();

    // Time of day tint (full screen, dimmer).
    if (this.timeDef?.tint) {
      renderer.pushScreen();
      renderer.ctx.fillStyle = this.timeDef.tint;
      renderer.ctx.fillRect(0, 0, renderer.width, renderer.height);
      renderer.popScreen();
    }

    // Rain overlay (simple animated streaks).
    if (this.config?.options.weather === 'rain') {
      renderer.pushScreen();
      const c = renderer.ctx;
      c.strokeStyle = 'rgba(180, 210, 240, 0.35)';
      c.lineWidth = 1;
      const t = this.elapsed * 1000;
      for (let i = 0; i < 90; i++) {
        const x = ((i * 137 + t * 0.6) % (renderer.width + 80)) - 40;
        const y = ((i * 91  + t * 0.9) % (renderer.height + 60)) - 30;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - 6, y + 14);
        c.stroke();
      }
      renderer.popScreen();
    }
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
    card.style.background = 'transparent';
    card.style.border = '0';
    card.innerHTML = `<h2 style="font-size:64px;margin:0;">${text}</h2>`;
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
      <p>Press <strong>R</strong> to race the same setup, <strong>N</strong> for new race options, <strong>Esc</strong> for menu.</p>
    `;
    root.appendChild(card);
    const onKey = (e) => {
      if (e.code === 'KeyR') {
        window.removeEventListener('keydown', onKey);
        this._restart(true);
      } else if (e.code === 'KeyN') {
        window.removeEventListener('keydown', onKey);
        this._restart(false);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  async _restart(reuseConfig) {
    this.destroy();
    if (!reuseConfig) this.config = null;
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
