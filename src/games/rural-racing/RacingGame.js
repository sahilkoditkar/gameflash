// RacingGame: the Scene. Drives three modes through a single object so the
// engine, render path, and most physics are shared:
//
//   mode = 'race'        Full pre-race wizard, AI opponents, R/N restart.
//   mode = 'timetrial'   Solo, no AI, no countdown end. Sectors + PB + ghost.
//   mode = 'career'      Solo, AI opponents, championship records results
//                        and feeds in the next track on Continue.

import { Scene } from '../../engine/Scene.js';
import { Track } from './Track.js';
import { Vehicle } from './Vehicle.js';
import { AIDriver } from './AIDriver.js';
import { HUD } from './HUD.js';
import { SkidLayer } from './SkidLayer.js';
import { Haptics } from './Haptics.js';
import { Camera } from '../../engine/render/Camera.js';
import { resolveCircles } from '../../engine/physics/Collision.js';
import {
  RaceWizard, COLORS, DIFFICULTY, WEATHER, TIME_OF_DAY,
  bindingForDevice, applyLapsOverride, trackById
} from './Wizard.js';
import { TrackPicker } from './TrackPicker.js';
import { TimeTrialStore, ghostAt } from './TimeTrialStore.js';
import { Championship, AI_DRIVER_NAMES } from './Championship.js';

const AI_LINE_OFFSETS = [0, -22, 24, -10, 14, -18, 20, -8];
const SKID_LATERAL_THRESHOLD = 70;       // |lateral speed| above this leaves marks
const COLLISION_RUMBLE_THRESHOLD = 80;   // relative velocity for a strong rumble
const FOLLOW_ZOOM = 1.4;                 // per-player follow camera zoom

// 1-4 player split-screen layout. Returns viewport rectangles (CSS-pixel
// coordinates) inside the canvas. 1=full, 2=L|R, 3=top L|R + bottom-left,
// 4=2x2.
function viewportLayout(playerCount, w, h) {
  if (playerCount <= 1) return [{ x: 0, y: 0, w, h }];
  const halfW = w / 2;
  const halfH = h / 2;
  if (playerCount === 2) return [
    { x: 0,     y: 0, w: halfW, h },
    { x: halfW, y: 0, w: halfW, h }
  ];
  if (playerCount === 3) return [
    { x: 0,     y: 0,     w: halfW, h: halfH },
    { x: halfW, y: 0,     w: halfW, h: halfH },
    { x: 0,     y: halfH, w: halfW, h: halfH }
  ];
  return [
    { x: 0,     y: 0,     w: halfW, h: halfH },
    { x: halfW, y: 0,     w: halfW, h: halfH },
    { x: 0,     y: halfH, w: halfW, h: halfH },
    { x: halfW, y: halfH, w: halfW, h: halfH }
  ];
}

function aiColors(usedHexes) {
  return COLORS.map((c) => c.hex).filter((h) => !usedHexes.has(h));
}

export class RacingGame extends Scene {
  constructor(opts = {}) {
    super();
    this.mode = opts.mode || 'race';
    this.preset = opts.config || null;       // skip wizard if supplied
    this.config = null;
    this.championship = opts.championship || null;
  }

  async init() {
    const ctx = this.ctx;
    ctx.canvas.focus({ preventScroll: true });

    if (!this.config) {
      this.config = await this._setupForMode();
      if (!this.config) {
        // Cancelled — bail back to launcher.
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
        return;
      }
    }

    const cfg = this.config;
    const trackData = trackById(cfg.trackId);
    this.trackData = trackData;
    this.track = new Track(trackData);
    applyLapsOverride(this.track, cfg.options.laps);

    this.weather = WEATHER[cfg.options.weather] || WEATHER.clear;
    this.timeDef = TIME_OF_DAY[cfg.options.time] || TIME_OF_DAY.day;

    this.vehicles = [];
    this.humanPlayers = [];
    this.aiDrivers = [];
    this.engineSounds = [];
    this.state = 'countdown';
    this.countdown = 3.999;
    this.elapsed = 0;
    this.paused = false;
    this.skids = new SkidLayer();
    this.haptics = new Haptics();
    this._collisionRumblePairs = new WeakMap();
    this._raceFinishHandled = false;

    // Time trial bookkeeping.
    this._tt = null;
    if (this.mode === 'timetrial') {
      this._tt = {
        store: new TimeTrialStore(cfg.trackId),
        currentSamples: [],
        lapStartElapsed: 0,
        sectorTimes: [null, null, null],
        currentSector: 0,
        lastLapTime: null,
        deltaText: '',
        deltaShowTime: 0
      };
    }

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
        name: pdef.name || `P${i + 1}`,
        isHuman: true,
        gripMul: this.weather.gripMul
      });
      this.vehicles.push(v);
      usedHexes.add(pdef.color.hex);
    }

    // AI drivers — disabled for time trial.
    const wantAi = this.mode !== 'timetrial';
    const diff = DIFFICULTY[cfg.options.difficulty] || DIFFICULTY.normal;
    const aiCount = wantAi ? (this.mode === 'career' ? 7 : diff.aiCount) : 0;
    const aiPalette = aiColors(usedHexes);
    for (let i = 0; i < aiCount; i++) {
      const g = grid[slot++ % grid.length];
      const skill = diff.skillBase + (i / Math.max(1, aiCount - 1)) * diff.skillSpread;
      const v = new Vehicle({
        x: g.x, y: g.y, angle: g.angle,
        color: aiPalette[i % aiPalette.length],
        name: AI_DRIVER_NAMES[i % AI_DRIVER_NAMES.length],
        isHuman: false,
        gripMul: this.weather.gripMul
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

    for (const _ of this.humanPlayers) this.engineSounds.push(ctx.audio.engineLoop());

    // One follow camera per human player. Each is bounded by the track and
    // snaps to the player's start position on the first frame.
    this._playerCameras = [];
    for (let i = 0; i < this.humanPlayers.length; i++) {
      const cam = new Camera();
      cam.setZoom(FOLLOW_ZOOM);
      cam.setBounds(this.track.bounds);
      cam.smoothness = 0.22;
      cam.snapTo(this.vehicles[i].body.x, this.vehicles[i].body.y);
      this._playerCameras.push(cam);
    }

    // Pre-compute mini-map projections for every panel size we might use.
    // Each entry is keyed by viewport width (4-player splits get a smaller
    // minimap than full-screen so it doesn't crowd the view).
    this._minimaps = new Map();

    this.hud = new HUD(ctx.hudRoot);
    for (let i = 0; i < this.humanPlayers.length; i++) {
      this.hud.ensure(`p${i + 1}`);
    }
    this._lastViewportSig = '';
    this._positionHuds();
    if (this.mode === 'timetrial') this._buildTtHud();
    if (this.mode === 'career') this._buildCareerHud();

    this._renderCountdownOverlay();
  }

  _positionHuds() {
    const w = this.ctx.renderer.width;
    const h = this.ctx.renderer.height;
    const sig = `${this.humanPlayers.length}|${w}|${h}`;
    if (sig === this._lastViewportSig) return;
    this._lastViewportSig = sig;
    const layout = viewportLayout(this.humanPlayers.length, w, h);
    for (let i = 0; i < this.humanPlayers.length; i++) {
      const vp = layout[i];
      // Position relative to the canvas (HUD root sits over the canvas).
      this.hud.setPosition(`p${i + 1}`, {
        top: `${vp.y + 12}px`,
        left: `${vp.x + 12}px`
      });
    }
  }

  // ---------- mode-specific setup ----------
  async _setupForMode() {
    if (this.preset) return this.preset;
    if (this.mode === 'race') {
      const wizard = new RaceWizard(this.ctx);
      return wizard.run();
    }
    if (this.mode === 'timetrial') return this._timeTrialSetup();
    if (this.mode === 'career') return this._careerSetup();
    return null;
  }

  async _timeTrialSetup() {
    // Track picker, then a single player setup.
    const picker = new TrackPicker(this.ctx.overlayRoot);
    const trackId = await picker.show();
    if (!trackId) return null;
    const wizard = new RaceWizard(this.ctx);
    const players = await wizard.runPlayerSetup(1);
    if (!players) return null;
    return {
      humans: 1, trackId,
      options: { difficulty: 'normal', laps: null, weather: 'clear', time: 'day' },
      players
    };
  }

  async _careerSetup() {
    // If a saved championship exists ask the player to resume or restart.
    const existing = Championship.load();
    if (existing && !existing.isComplete()) {
      const resume = await this._askResumeChampionship(existing);
      if (resume === null) return null;       // Esc
      if (resume === 'resume') {
        this.championship = existing;
      } else {
        Championship.clear();
      }
    } else if (existing && existing.isComplete()) {
      // Old finished championship — clear it before starting a new one.
      Championship.clear();
    }

    if (!this.championship) {
      const wizard = new RaceWizard(this.ctx);
      const players = await wizard.runPlayerSetup(1);
      if (!players) return null;
      this.championship = Championship.start({
        device: players[0].device,
        color: players[0].color,
        name: 'You'
      });
      this.championship.save();
    }

    return this._configFromChampionship();
  }

  _configFromChampionship() {
    const c = this.championship;
    const player = c.player();
    return {
      humans: 1,
      trackId: c.currentTrackId(),
      options: { difficulty: 'normal', laps: null, weather: 'clear', time: 'day' },
      players: [{ device: player.device, color: player.color, name: player.name || 'You' }]
    };
  }

  _askResumeChampionship(existing) {
    return new Promise((resolve) => {
      const root = this.ctx.overlayRoot;
      root.hidden = false;
      root.replaceChildren();
      const card = document.createElement('div');
      card.className = 'overlay-card';
      const standings = existing.standingsSorted().slice(0, 5)
        .map((d, i) => `<tr><td>${i + 1}</td><td style="color:${d.color}">${d.name}</td><td>${d.points}</td></tr>`)
        .join('');
      card.innerHTML = `
        <h2>Championship in progress</h2>
        <p>Race ${existing.raceIndex() + 1} of ${existing.raceCount()} — current standings:</p>
        <table style="margin: 0 auto 14px; border-collapse: collapse; font-family: ui-monospace, monospace;">${standings}</table>
        <button class="wizard-primary" data-act="resume">Resume</button>
        <button class="overlay-card-secondary" data-act="restart">Start over</button>
      `;
      // Inline secondary button styling is in main.css under .overlay-card button.secondary
      card.querySelector('[data-act="restart"]').classList.add('secondary');
      const cleanup = () => {
        root.replaceChildren();
        root.hidden = true;
        window.removeEventListener('keydown', onKey);
      };
      const choose = (v) => { cleanup(); resolve(v); };
      card.querySelector('[data-act="resume"]').addEventListener('click', () => choose('resume'));
      card.querySelector('[data-act="restart"]').addEventListener('click', () => choose('restart'));
      const onKey = (e) => { if (e.code === 'Escape') choose(null); };
      window.addEventListener('keydown', onKey);
      root.appendChild(card);
    });
  }

  // ---------- destroy ----------
  destroy() {
    if (this.engineSounds) {
      for (const s of this.engineSounds) s.stop?.();
      this.engineSounds = [];
    }
    if (this.hud) this.hud.destroy();
    if (this._ttHud) { this._ttHud.remove(); this._ttHud = null; }
    if (this._careerHud) { this._careerHud.remove(); this._careerHud = null; }
    if (this.ctx?.overlayRoot) {
      this.ctx.overlayRoot.replaceChildren();
      this.ctx.overlayRoot.hidden = true;
    }
    if (this.ctx?.input && this.humanPlayers) {
      for (const p of this.humanPlayers) this.ctx.input.removePlayer(p);
    }
  }

  update(dt) { if (this.track) return this._update(dt); }
  render(renderer) {
    if (!this.track) { renderer.clear('#0c0f14'); return; }
    return this._render(renderer);
  }

  // --- Update loop ---
  _update(dt) {
    if (this.paused) return;
    this._positionHuds();

    if (this.state === 'countdown') {
      this.countdown -= dt;
      this._renderCountdownOverlay();
      if (this.countdown <= 0) {
        this.state = 'racing';
        this.elapsed = 0;
        for (const v of this.vehicles) v.lastLapStart = 0;
        if (this._tt) { this._tt.lapStartElapsed = 0; this._tt.currentSector = 0; }
        this._clearOverlay();
        this.ctx.audio.beep({ freq: 880, duration: 0.18 });
      } else {
        for (const v of this.vehicles) v.setControl({ steer: 0, throttle: 0 });
        this._integrateAll(dt);
        return;
      }
    }

    if (this.state === 'racing') this.elapsed += dt;

    // Human input. A finished car is parked — controls are ignored so the
    // player just watches the rest of the field cross the line. Pause still
    // works.
    for (let i = 0; i < this.humanPlayers.length; i++) {
      const p = this.humanPlayers[i];
      const v = this.vehicles[i];
      if (v.finished) {
        v.setControl({ steer: 0, throttle: 0, handbrake: true });
      } else {
        const accel = p.isDown('accelerate') ? 1 : 0;
        const brake = p.isDown('brake') ? 1 : 0;
        v.setControl({
          steer: p.axis('steer'),
          throttle: accel - brake,
          handbrake: p.isDown('handbrake')
        });
      }
      if (p.justPressed('pause')) this.togglePause();
    }

    // AI cars also park once they finish — they no longer steer.
    for (const ai of this.aiDrivers) {
      if (ai.vehicle.finished) {
        ai.vehicle.setControl({ steer: 0, throttle: 0, handbrake: true });
      } else {
        ai.update(dt);
      }
    }

    this._integrateAll(dt);
    this._emitSkidMarks();
    this.skids.update(dt);
    this._handleLaps();
    if (this.mode === 'timetrial') this._updateTimeTrial(dt);
    this._updateRanking();
    this._updateHUD();
    this._updateAudio();
    this._updateRumble(dt);

    // Race finish detection — disabled for time trial.
    if (this.mode !== 'timetrial' && !this._raceFinishHandled
        && this.state === 'racing'
        && this.humanPlayers.every((_, i) => this.vehicles[i].finished)) {
      // Wait for the AI to finish too so we can rank everyone.
      if (this.vehicles.every((v) => v.finished)) {
        this._raceFinishHandled = true;
        this.state = 'finished';
        this._onRaceFinished();
      } else {
        // Auto-finish stragglers after a short grace period (they cross or get DNF).
        if (!this._gracePeriodStart) this._gracePeriodStart = this.elapsed;
        if (this.elapsed - this._gracePeriodStart > 12) {
          for (const v of this.vehicles) {
            if (!v.finished) { v.finished = true; v.finishTime = this.elapsed + 999; }
          }
          this._raceFinishHandled = true;
          this.state = 'finished';
          this._onRaceFinished();
        }
      }
    }
  }

  _integrateAll(dt) {
    for (const v of this.vehicles) v.update(dt, this.track);
    // Pairwise vehicle collisions; emit a rumble pulse for human cars.
    for (let i = 0; i < this.vehicles.length; i++) {
      for (let j = i + 1; j < this.vehicles.length; j++) {
        const a = this.vehicles[i], b = this.vehicles[j];
        const relSpeed = Math.hypot(a.body.vx - b.body.vx, a.body.vy - b.body.vy);
        const collided = resolveCircles(a.body, b.body, 0.25);
        if (collided && relSpeed > COLLISION_RUMBLE_THRESHOLD) {
          this._rumbleForVehicle(a, { duration: 160, strong: 0.8, weak: 0.5 });
          this._rumbleForVehicle(b, { duration: 160, strong: 0.8, weak: 0.5 });
        }
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
        if (v.isHuman && this._tt && v.lap > 0) this._onTtLapComplete(v, lapTime);
        v.lastLapStart = this.elapsed;
        v.lap += 1;
        if (this.mode !== 'timetrial' && v.lap >= this.track.totalLaps) {
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
      const lapText = this.mode === 'timetrial' ? `LAP ${v.lap + 1}` : `LAP ${lapNum}/${total}`;
      this.hud.update(`p${i + 1}`, {
        title: `Player ${i + 1} — ${padState}`,
        lap: lapText,
        pos: this.mode === 'timetrial' ? '' : `P${pos}/${this.vehicles.length}`,
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

  _updateRumble(dt) {
    for (let i = 0; i < this.humanPlayers.length; i++) {
      const player = this.humanPlayers[i];
      const v = this.vehicles[i];
      if (!player.hasGamepad()) continue;
      const padIdx = player.gamepadIndex();
      if (v.offTrack && Math.abs(v.forwardSpeed) > 60) {
        // Sustained low rumble while off-track at speed.
        this.haptics.sustainPad(padIdx, dt, { intervalMs: 220, duration: 220, strong: 0.15, weak: 0.45 });
      }
    }
  }

  _rumbleForVehicle(v, opts) {
    if (!v.isHuman) return;
    const idx = this.vehicles.indexOf(v);
    if (idx < 0 || idx >= this.humanPlayers.length) return;
    const player = this.humanPlayers[idx];
    if (!player.hasGamepad()) return;
    this.haptics.pulsePad(player.gamepadIndex(), opts);
  }

  // --- Skid marks ---
  _emitSkidMarks() {
    for (const v of this.vehicles) {
      const wheels = v.getWheelPositions();
      const prev = v._prevWheels;
      v._prevWheels = wheels;
      if (!prev) continue;

      const sliding = Math.abs(v.lateralSpeed) > SKID_LATERAL_THRESHOLD;
      const handbraking = v.handbrake && Math.abs(v.forwardSpeed) > 30;
      const dirt = v.offTrack && Math.abs(v.forwardSpeed) > 100;

      if (sliding || handbraking) {
        for (let i = 0; i < 4; i++) {
          if (handbraking && !wheels[i].rear && !sliding) continue;
          this.skids.emit(prev[i].x, prev[i].y, wheels[i].x, wheels[i].y, '#1a1d22', 0.55);
        }
      } else if (dirt) {
        for (let i = 0; i < 4; i++) {
          this.skids.emit(prev[i].x, prev[i].y, wheels[i].x, wheels[i].y, '#a07a4a', 0.45);
        }
      }
    }
  }

  // --- Time trial bookkeeping ---
  _updateTimeTrial(dt) {
    const tt = this._tt;
    if (!tt || this.state !== 'racing') return;
    const v = this.vehicles[0];

    // Sample player position for ghost recording (60 Hz fixed step).
    if (v.lap >= 1) {
      const lapElapsed = this.elapsed - v.lastLapStart;
      tt.currentSamples.push({ t: lapElapsed, x: v.body.x, y: v.body.y, angle: v.body.angle });
    }

    // Sector boundary crossings (3 sectors of equal segment span).
    const total = this.track.centerline.length;
    const sectorLen = total / 3;
    const newSector = Math.min(2, Math.floor(v.segIndex / sectorLen));
    if (newSector !== tt.currentSector) {
      // Crossed a sector boundary; record the time.
      const lapElapsed = this.elapsed - v.lastLapStart;
      tt.sectorTimes[tt.currentSector] = lapElapsed;
      tt.currentSector = newSector;
    }

    if (tt.deltaShowTime > 0) tt.deltaShowTime -= dt;
  }

  _onTtLapComplete(v, lapTime) {
    const tt = this._tt;
    tt.lastLapTime = lapTime;
    // Persist if PB beaten.
    const prev = tt.store.bestLapTime();
    if (tt.store.trySave(lapTime, tt.currentSamples)) {
      tt.deltaText = prev != null ? `−${(prev - lapTime).toFixed(3)}s NEW PB` : `${lapTime.toFixed(3)}s FIRST LAP`;
    } else if (prev != null) {
      const delta = lapTime - prev;
      tt.deltaText = `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}s`;
    }
    tt.deltaShowTime = 3.0;
    tt.currentSamples = [];
    tt.sectorTimes = [null, null, null];
    tt.currentSector = 0;
  }

  _buildTtHud() {
    const panel = document.createElement('div');
    panel.className = 'hud-panel';
    panel.style.top = '12px';
    panel.style.left = '12px';
    panel.style.minWidth = '180px';
    panel.innerHTML = `
      <div class="label">TIME TRIAL</div>
      <div class="value" data-role="lap">--:--:---</div>
      <div class="label" style="margin-top:4px;">LAST · BEST</div>
      <div class="value" data-role="last-best">— · —</div>
      <div class="label" style="margin-top:4px;">DELTA</div>
      <div class="value" data-role="delta">—</div>
    `;
    this.ctx.hudRoot.appendChild(panel);
    this._ttHud = panel;
  }

  _renderTtHud() {
    if (!this._ttHud || !this._tt) return;
    const v = this.vehicles[0];
    if (!v) return;
    const lapElapsed = Math.max(0, this.elapsed - v.lastLapStart);
    const last = this._tt.lastLapTime;
    const best = this._tt.store.bestLapTime();
    this._ttHud.querySelector('[data-role="lap"]').textContent = formatTime(lapElapsed);
    this._ttHud.querySelector('[data-role="last-best"]').textContent =
      `${last != null ? formatTime(last) : '—'} · ${best != null ? formatTime(best) : '—'}`;
    const delta = this._tt.deltaShowTime > 0 ? this._tt.deltaText : '—';
    this._ttHud.querySelector('[data-role="delta"]').textContent = delta;
  }

  // --- Career HUD ---
  _buildCareerHud() {
    const panel = document.createElement('div');
    panel.className = 'hud-panel';
    panel.style.top = '12px';
    panel.style.left = '12px';
    panel.style.minWidth = '180px';
    const c = this.championship;
    panel.innerHTML = `
      <div class="label">CHAMPIONSHIP</div>
      <div class="value">Race ${c.raceIndex() + 1}/${c.raceCount()}</div>
      <div class="label" style="margin-top:4px;">CIRCUIT</div>
      <div class="value">${trackById(c.currentTrackId()).name}</div>
    `;
    this.ctx.hudRoot.appendChild(panel);
    this._careerHud = panel;
  }

  // --- Render ---
  _render(renderer) {
    renderer.clear('#1a1f1a');
    const layout = viewportLayout(this.humanPlayers.length, renderer.width, renderer.height);
    for (let i = 0; i < layout.length; i++) {
      this._renderViewport(renderer, layout[i], i);
    }
    // 3-player mode: render the stats panel in the empty 4th cell.
    if (this.humanPlayers.length === 3) {
      const halfW = renderer.width / 2;
      const halfH = renderer.height / 2;
      this._renderStatsPanel(renderer, { x: halfW, y: halfH, w: halfW, h: halfH });
    }
    if (this.humanPlayers.length >= 2) this._drawSplitDividers(renderer, layout);
    if (this.mode === 'timetrial') this._renderTtHud();
  }

  _renderViewport(renderer, vp, playerIdx) {
    const ctx = renderer.ctx;
    const cam = this._playerCameras[playerIdx];
    cam.setViewport(vp.w, vp.h);
    cam.follow(this.vehicles[playerIdx].body.x, this.vehicles[playerIdx].body.y);

    // Clip to viewport, apply camera transform, draw the world.
    ctx.save();
    ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
    ctx.beginPath();
    ctx.rect(vp.x, vp.y, vp.w, vp.h);
    ctx.clip();
    ctx.translate(vp.x + vp.w / 2, vp.y + vp.h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    this.track.draw(renderer);
    this.skids.draw(ctx);
    this._renderGhost(renderer);
    for (const v of this.vehicles) v.draw(ctx);

    ctx.restore();

    // Per-viewport screen-space overlays.
    this._renderScreenEffects(renderer, vp);
    this._drawMinimap(renderer, vp, playerIdx);
  }

  _renderScreenEffects(renderer, vp) {
    const ctx = renderer.ctx;
    if (this.timeDef?.tint) {
      ctx.save();
      ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
      ctx.fillStyle = this.timeDef.tint;
      ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
      ctx.restore();
    }
    if (this.config?.options.weather === 'rain') {
      ctx.save();
      ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
      ctx.beginPath();
      ctx.rect(vp.x, vp.y, vp.w, vp.h);
      ctx.clip();
      ctx.strokeStyle = 'rgba(180, 210, 240, 0.35)';
      ctx.lineWidth = 1;
      const t = this.elapsed * 1000;
      for (let i = 0; i < 70; i++) {
        const x = vp.x + ((i * 137 + t * 0.6) % (vp.w + 80)) - 40;
        const y = vp.y + ((i * 91  + t * 0.9) % (vp.h + 60)) - 30;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 6, y + 14);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawSplitDividers(renderer, layout) {
    const ctx = renderer.ctx;
    ctx.save();
    ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
    ctx.fillStyle = '#0c0f14';
    const n = layout.length;
    if (n === 2) {
      ctx.fillRect(renderer.width / 2 - 1, 0, 2, renderer.height);
    } else if (n >= 3) {
      ctx.fillRect(renderer.width / 2 - 1, 0, 2, renderer.height);
      ctx.fillRect(0, renderer.height / 2 - 1, renderer.width, 2);
    }
    ctx.restore();
  }

  // Build a Path2D + projection from the track's centerline so each frame's
  // mini-map draw is just a stroke + N filled circles.
  _buildMinimap(W, H) {
    const PAD = 10;
    const b = this.track.bounds;
    const tw = b.maxX - b.minX;
    const th = b.maxY - b.minY;
    const scale = Math.min((W - PAD * 2) / tw, (H - PAD * 2) / th);
    const ox = PAD + (W - PAD * 2 - tw * scale) / 2 - b.minX * scale;
    const oy = PAD + (H - PAD * 2 - th * scale) / 2 - b.minY * scale;

    const path = new Path2D();
    const cl = this.track.centerline;
    for (let i = 0; i < cl.length; i++) {
      const px = ox + cl[i].x * scale;
      const py = oy + cl[i].y * scale;
      if (i === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    }
    path.closePath();
    return { w: W, h: H, scale, ox, oy, path };
  }

  _drawMinimap(renderer, vp, playerIdx) {
    const ctx = renderer.ctx;
    // Choose mini-map size relative to viewport so it stays unobtrusive.
    const W = Math.max(110, Math.min(180, Math.round(vp.w * 0.22)));
    const H = Math.round(W * 2 / 3);
    let m = this._minimaps.get(W);
    if (!m) { m = this._buildMinimap(W, H); this._minimaps.set(W, m); }
    // Top-right corner of the viewport.
    const x = vp.x + vp.w - m.w - 12;
    const y = vp.y + 12;

    ctx.save();
    ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);

    // Panel background.
    ctx.fillStyle = 'rgba(12, 15, 20, 0.6)';
    ctx.fillRect(x, y, m.w, m.h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, m.w - 1, m.h - 1);

    // Track centerline (cached path) translated into the panel.
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(m.path);
    // Start/finish marker.
    const start = this.track.centerline[0];
    ctx.fillStyle = '#ffcc33';
    ctx.beginPath();
    ctx.arc(m.ox + start.x * m.scale, m.oy + start.y * m.scale, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Cars as colour-coded dots; the viewing player's own car gets a ring.
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const px = m.ox + v.body.x * m.scale;
      const py = m.oy + v.body.y * m.scale;
      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.arc(px, py, i === playerIdx ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (i === playerIdx) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 5.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Stats / leaderboard panel rendered in the empty quadrant of a 3-player
  // 2x2 split so every quadrant is filled.
  _renderStatsPanel(renderer, vp) {
    const ctx = renderer.ctx;
    ctx.save();
    ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);

    // Background.
    ctx.fillStyle = '#0c0f14';
    ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
    // Subtle inner border.
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vp.x + 0.5, vp.y + 0.5, vp.w - 1, vp.h - 1);

    // Header.
    const px = vp.x + 24;
    let py = vp.y + 32;
    ctx.fillStyle = '#ffcc33';
    ctx.font = 'bold 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(this.trackData.name, px, py);
    py += 22;

    ctx.fillStyle = '#8b95a7';
    ctx.font = '12px ui-monospace, monospace';
    const leaderLap = this.vehicles.reduce((mx, v) => Math.max(mx, v.lap + 1), 1);
    const totalLaps = this.track.totalLaps;
    const stateLabel = this.state === 'countdown'
      ? 'Countdown'
      : this.state === 'finished'
        ? 'Finished'
        : `Lap ${Math.min(leaderLap, totalLaps)}/${totalLaps}`;
    ctx.fillText(`${stateLabel}  ·  ${formatTime(this.elapsed)}  ·  ${this.vehicles.length} cars`, px, py);
    py += 28;

    // Leaderboard.
    const sorted = this._rankedAll();
    const rowH = 22;
    const maxRows = Math.min(sorted.length, Math.floor((vp.h - (py - vp.y) - 16) / rowH));
    ctx.font = '14px ui-monospace, monospace';
    for (let i = 0; i < maxRows; i++) {
      const v = sorted[i];
      const rowY = py + i * rowH;
      // Position
      ctx.fillStyle = '#8b95a7';
      ctx.fillText(`${(i + 1).toString().padStart(2, ' ')}.`, px, rowY);
      // Car dot.
      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.arc(px + 36, rowY - 5, 5, 0, Math.PI * 2);
      ctx.fill();
      // Name.
      ctx.fillStyle = v.isHuman ? '#fff' : '#cdd2db';
      ctx.fillText(v.name, px + 50, rowY);
      // Lap + status (right-aligned).
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8b95a7';
      const status = v.finished
        ? (v.finishTime < 999 ? formatTime(v.finishTime) : 'DNF')
        : `L${v.lap}/${this.track.totalLaps}`;
      ctx.fillText(status, vp.x + vp.w - 24, rowY);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  _rankedAll() {
    return this.vehicles.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
  }

  _renderGhost(renderer) {
    if (this.mode !== 'timetrial' || !this._tt) return;
    const samples = this._tt.store.bestSamples();
    if (!samples) return;
    const v = this.vehicles[0];
    if (!v || v.lap < 1) return;
    const lapElapsed = this.elapsed - v.lastLapStart;
    const ghost = ghostAt(samples, lapElapsed);
    if (!ghost) return;
    const c = renderer.ctx;
    c.save();
    c.globalAlpha = 0.45;
    c.translate(ghost.x, ghost.y);
    c.rotate(ghost.angle);
    c.fillStyle = '#ffffff';
    c.fillRect(-16, -10, 32, 20);
    c.fillStyle = 'rgba(20, 28, 40, 0.6)';
    c.fillRect(2, -8, 8, 16);
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

  _onRaceFinished() {
    if (this.mode === 'career' && this.championship) {
      this._handleCareerRaceFinished();
    } else {
      this._renderFinishedOverlay();
    }
  }

  _renderFinishedOverlay() {
    const root = this.ctx.overlayRoot;
    if (!root) return;
    root.hidden = false;
    root.replaceChildren();
    const card = document.createElement('div');
    card.className = 'overlay-card';
    const sorted = this._sortedResults();
    const rows = sorted.map((v, i) => {
      const t = v.finished && v.finishTime < 999 ? `${v.finishTime.toFixed(2)}s` : 'DNF';
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

  _handleCareerRaceFinished() {
    const sorted = this._sortedResults();
    const results = sorted.map((v) => ({
      name: v.name,
      finishTime: v.finishTime,
      lap: v.lap,
      color: v.color
    }));
    this.championship.recordRace(results);
    this.championship.advance();
    this.championship.save();
    if (this.championship.isComplete()) {
      this._renderChampionshipFinale();
    } else {
      this._renderChampionshipStandings();
    }
  }

  _renderChampionshipStandings() {
    const root = this.ctx.overlayRoot;
    root.hidden = false;
    root.replaceChildren();
    const card = document.createElement('div');
    card.className = 'overlay-card';
    const standings = this.championship.standingsSorted();
    const rows = standings.map((d, i) =>
      `<tr><td>${i + 1}</td><td style="color:${d.color}">${d.name}</td><td>${d.points}</td></tr>`
    ).join('');
    const next = trackById(this.championship.currentTrackId());
    card.innerHTML = `
      <h2>Standings — ${this.championship.raceIndex()}/${this.championship.raceCount()} done</h2>
      <table style="margin: 0 auto 14px; border-collapse: collapse; font-family: ui-monospace, monospace;">${rows}</table>
      <p>Next: <strong>${next.name}</strong></p>
      <button class="wizard-primary" data-act="next">Continue →</button>
      <button class="overlay-card-secondary secondary" data-act="quit">Save &amp; quit</button>
    `;
    root.appendChild(card);
    const cleanup = () => { window.removeEventListener('keydown', onKey); root.replaceChildren(); root.hidden = true; };
    const onKey = (e) => {
      if (e.code === 'Escape') { cleanup(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); }
      else if (e.code === 'Enter') { cleanup(); this._restart(false /* force re-config from championship */); }
    };
    window.addEventListener('keydown', onKey);
    card.querySelector('[data-act="next"]').addEventListener('click', () => { cleanup(); this._restart(false); });
    card.querySelector('[data-act="quit"]').addEventListener('click', () => {
      cleanup(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    });
  }

  _renderChampionshipFinale() {
    const root = this.ctx.overlayRoot;
    root.hidden = false;
    root.replaceChildren();
    const card = document.createElement('div');
    card.className = 'overlay-card';
    const standings = this.championship.standingsSorted();
    const rows = standings.map((d, i) =>
      `<tr><td>${i + 1}</td><td style="color:${d.color}">${d.name}</td><td>${d.points}</td></tr>`
    ).join('');
    const champion = standings[0];
    card.innerHTML = `
      <h2>Season ended</h2>
      <p>Champion: <strong style="color:${champion.color}">${champion.name}</strong> · ${champion.points} pts</p>
      <table style="margin: 0 auto 14px; border-collapse: collapse; font-family: ui-monospace, monospace;">${rows}</table>
      <button class="wizard-primary" data-act="new">New season</button>
      <button class="overlay-card-secondary secondary" data-act="menu">Menu</button>
    `;
    root.appendChild(card);
    const cleanup = () => { root.replaceChildren(); root.hidden = true; };
    card.querySelector('[data-act="new"]').addEventListener('click', () => {
      Championship.clear();
      this.championship = null;
      this.config = null;
      cleanup();
      this.destroy();
      this.init();
    });
    card.querySelector('[data-act="menu"]').addEventListener('click', () => {
      cleanup();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    });
  }

  _sortedResults() {
    return this.vehicles.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
  }

  async _restart(reuseConfig) {
    this.destroy();
    if (this.mode === 'career') {
      // Always rebuild config from championship state (next track or replay).
      this.config = this._configFromChampionship();
    } else if (!reuseConfig) {
      this.config = null;
    }
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

function formatTime(s) {
  if (s == null || !isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`;
}
