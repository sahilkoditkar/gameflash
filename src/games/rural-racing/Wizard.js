// RaceWizard: a sequence of overlay steps that resolves to a full race config.
//
// Flow:
//   1. Player count        (1 or 2)
//   2. Track               (countryside, silverstone, spa, miami, monaco)
//   3. Race options        (difficulty, laps, weather, time of day)
//   4. Player setup        (each player presses a key/button to claim a device,
//                           then picks a colour using that device)
//
// Each step renders into the engine's overlayRoot. Esc cancels — `run()`
// resolves with `null`. Otherwise it resolves with a config object the
// RacingGame consumes directly.

import { TrackPicker } from './TrackPicker.js';
import { TRACKS } from './tracks/index.js';

export const COLORS = [
  { id: 'yellow', hex: '#ffcc33' },
  { id: 'green',  hex: '#66e0a3' },
  { id: 'red',    hex: '#ff6b6b' },
  { id: 'blue',   hex: '#7aa9ff' },
  { id: 'purple', hex: '#c98bff' },
  { id: 'orange', hex: '#ffa15a' },
  { id: 'cyan',   hex: '#5fdde6' },
  { id: 'pink',   hex: '#ff8fb1' }
];

export const DIFFICULTY = {
  easy:   { aiCount: 2, skillBase: 0.45, skillSpread: 0.15, label: 'Easy' },
  normal: { aiCount: 3, skillBase: 0.60, skillSpread: 0.18, label: 'Normal' },
  hard:   { aiCount: 4, skillBase: 0.72, skillSpread: 0.13, label: 'Hard' }
};

export const WEATHER = {
  clear: { gripMul: 1.00, label: 'Clear' },
  rain:  { gripMul: 0.55, label: 'Light rain' }
};

export const TIME_OF_DAY = {
  day:   { tint: null,                       label: 'Day' },
  night: { tint: 'rgba(10, 18, 40, 0.45)',   label: 'Night' }
};

const LAP_CHOICES = [1, 3, 5, 8];

// Per-device keyboard layouts. Used both by the wizard navigation and later
// passed to the in-race InputManager.
export const DEVICE_KB1 = {
  keyboard: {
    axes: { steer: ['ArrowLeft', 'ArrowRight'], _wizardX: ['ArrowLeft', 'ArrowRight'] },
    actions: {
      accelerate: ['ArrowUp'], brake: ['ArrowDown'],
      handbrake: ['Space'], pause: ['KeyP'],
      _wizardConfirm: ['Space', 'Enter', 'ArrowDown'], _wizardBack: ['Backspace']
    }
  }
};
export const DEVICE_KB2 = {
  keyboard: {
    axes: { steer: ['KeyA', 'KeyD'], _wizardX: ['KeyA', 'KeyD'] },
    actions: {
      accelerate: ['KeyW'], brake: ['KeyS'],
      handbrake: ['ShiftLeft'],
      _wizardConfirm: ['ShiftLeft', 'KeyS', 'Enter'], _wizardBack: ['Backspace']
    }
  }
};
export const DEVICE_PAD = {
  gamepadAxes: { steer: { axis: 0 } },
  gamepadActions: {
    accelerate: ['rt', 'a'], brake: ['lt', 'b'],
    handbrake: ['x'], pause: ['start']
  }
};

// Keys that identify a keyboard "device" the first time they're pressed.
const KB1_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter']);
const KB2_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft']);

export class RaceWizard {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = ctx.overlayRoot;
  }

  // Run only the player-setup phase (used by Time Trial and Career modes).
  // `count` is the number of human players to set up. Returns the players
  // array (same shape as `run()` produces) or `null` if cancelled.
  async runPlayerSetup(count = 1) {
    return this._step4Players(count);
  }

  async run() {
    const count = await this._step1Count();
    if (!count) return null;

    const trackId = await this._step2Track();
    if (!trackId) return null;

    const options = await this._step3Options();
    if (!options) return null;

    const players = await this._step4Players(count);
    if (!players) return null;

    return { humans: count, trackId, options, players };
  }

  // ---------- Step 1: player count ----------
  _step1Count() {
    return this._renderStep('Players', 'Choose how many humans are racing.', (card, resolve) => {
      const grid = document.createElement('div');
      grid.className = 'wizard-choices';
      for (const n of [1, 2]) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wizard-choice';
        btn.innerHTML = `<span class="big">${n}</span><span>${n === 1 ? 'Solo' : 'Local versus'}</span>`;
        btn.addEventListener('click', () => resolve(n));
        grid.appendChild(btn);
      }
      card.appendChild(grid);
      this._addStepNav(card, { back: null });
    });
  }

  // ---------- Step 2: track ----------
  async _step2Track() {
    const picker = new TrackPicker(this.root);
    return picker.show();
  }

  // ---------- Step 3: race options ----------
  _step3Options() {
    const state = {
      difficulty: 'normal',
      laps: null,         // null = use track default
      weather: 'clear',
      time: 'day'
    };
    return this._renderStep('Race options', 'Tune the race to your taste.', (card, resolve) => {
      const opts = document.createElement('div');
      opts.className = 'wizard-options';

      opts.appendChild(this._buttonGroup('Difficulty', DIFFICULTY, state.difficulty, (v) => state.difficulty = v));
      opts.appendChild(this._lapButtonGroup(state, (v) => state.laps = v));
      opts.appendChild(this._buttonGroup('Weather', WEATHER, state.weather, (v) => state.weather = v));
      opts.appendChild(this._buttonGroup('Time of day', TIME_OF_DAY, state.time, (v) => state.time = v));
      card.appendChild(opts);

      const next = document.createElement('button');
      next.className = 'wizard-primary';
      next.type = 'button';
      next.textContent = 'Continue →';
      next.addEventListener('click', () => resolve(state));
      card.appendChild(next);
    });
  }

  // ---------- Step 4: player setup ----------
  async _step4Players(count) {
    const used = new Set();
    const players = [];
    const usedColors = new Set();

    for (let i = 0; i < count; i++) {
      const playerNum = i + 1;
      // Stage A: choose a device by pressing a key/button.
      const device = await this._awaitDevice(playerNum, used);
      if (!device) return null;
      used.add(deviceKey(device));

      // Stage B: pick a colour using that device.
      const color = await this._pickColor(playerNum, device, usedColors);
      if (!color) return null;
      usedColors.add(color.id);

      players.push({ device, color });
    }
    return players;
  }

  _awaitDevice(playerNum, usedDeviceKeys) {
    return this._renderStep(`Player ${playerNum}: pick your controls`,
      'Press a key or gamepad button to claim a device. Esc cancels.',
      (card, resolve, onCleanup) => {
        const status = document.createElement('div');
        status.className = 'wizard-status';
        status.innerHTML = `
          <div class="device-row" data-d="kb1">⌨ Arrow keys + Space</div>
          <div class="device-row" data-d="kb2">⌨ WASD + Shift</div>
          <div class="device-row" data-d="pads">🎮 Any connected gamepad button</div>`;
        for (const k of usedDeviceKeys) {
          const sel = `[data-d="${k.startsWith('pad') ? 'pads' : k}"]`;
          const el = status.querySelector(sel);
          if (el) el.classList.add('used');
        }
        card.appendChild(status);

        const onKey = (e) => {
          if (KB1_KEYS.has(e.code) && !usedDeviceKeys.has('kb1')) {
            e.preventDefault(); resolve({ type: 'kb1' });
          } else if (KB2_KEYS.has(e.code) && !usedDeviceKeys.has('kb2')) {
            e.preventDefault(); resolve({ type: 'kb2' });
          }
        };
        let pollId;
        const poll = () => {
          const pads = navigator.getGamepads ? navigator.getGamepads() : [];
          for (let i = 0; i < pads.length; i++) {
            const pad = pads[i];
            if (!pad) continue;
            if (usedDeviceKeys.has('pad' + i)) continue;
            for (const b of pad.buttons) {
              if (b.pressed) { resolve({ type: 'pad', index: i }); return; }
            }
          }
          pollId = requestAnimationFrame(poll);
        };
        pollId = requestAnimationFrame(poll);
        window.addEventListener('keydown', onKey);
        onCleanup(() => {
          window.removeEventListener('keydown', onKey);
          cancelAnimationFrame(pollId);
        });
      });
  }

  _pickColor(playerNum, device, usedColors) {
    const available = COLORS.map((c, i) => ({ ...c, _i: i }));
    let cursor = available.findIndex((c) => !usedColors.has(c.id));
    if (cursor < 0) cursor = 0;

    return this._renderStep(`Player ${playerNum}: pick your colour`,
      describeDevice(device) + ' — left/right to choose, action button to confirm.',
      (card, resolve, onCleanup) => {
        const swatches = document.createElement('div');
        swatches.className = 'wizard-swatches';
        const elems = available.map((c) => {
          const sw = document.createElement('button');
          sw.type = 'button';
          sw.className = 'swatch';
          sw.style.background = c.hex;
          sw.title = c.id;
          if (usedColors.has(c.id)) sw.classList.add('disabled');
          swatches.appendChild(sw);
          return sw;
        });
        card.appendChild(swatches);

        const updateCursor = () => {
          for (const e of elems) e.classList.remove('active');
          elems[cursor].classList.add('active');
        };
        updateCursor();

        const move = (delta) => {
          let next = cursor;
          for (let n = 0; n < available.length; n++) {
            next = (next + delta + available.length) % available.length;
            if (!usedColors.has(available[next].id)) break;
          }
          cursor = next;
          updateCursor();
        };
        const confirm = () => {
          const chosen = available[cursor];
          if (usedColors.has(chosen.id)) return;
          resolve(chosen);
        };

        const onKey = (e) => {
          const matches = (codes) => codes.includes(e.code);
          if (device.type === 'kb1') {
            if (matches(['ArrowLeft'])) { move(-1); e.preventDefault(); }
            else if (matches(['ArrowRight'])) { move(1); e.preventDefault(); }
            else if (matches(['Space', 'Enter', 'ArrowDown'])) { confirm(); e.preventDefault(); }
          } else if (device.type === 'kb2') {
            if (matches(['KeyA'])) { move(-1); e.preventDefault(); }
            else if (matches(['KeyD'])) { move(1); e.preventDefault(); }
            else if (matches(['ShiftLeft', 'KeyS', 'Enter'])) { confirm(); e.preventDefault(); }
          }
        };
        elems.forEach((el, i) => el.addEventListener('click', () => {
          if (usedColors.has(available[i].id)) return;
          cursor = i; updateCursor(); confirm();
        }));

        let pollId;
        let lastAxisDir = 0;
        let lastConfirm = false;
        const poll = () => {
          if (device.type === 'pad') {
            const pad = navigator.getGamepads()[device.index];
            if (pad) {
              const dpadL = pad.buttons[14]?.pressed;
              const dpadR = pad.buttons[15]?.pressed;
              const stickX = pad.axes[0] || 0;
              const dir = (dpadR || stickX > 0.5) ? 1 : (dpadL || stickX < -0.5) ? -1 : 0;
              if (dir !== 0 && lastAxisDir === 0) move(dir);
              lastAxisDir = dir;
              const a = pad.buttons[0]?.pressed;
              if (a && !lastConfirm) confirm();
              lastConfirm = a;
            }
          }
          pollId = requestAnimationFrame(poll);
        };
        pollId = requestAnimationFrame(poll);
        window.addEventListener('keydown', onKey);
        onCleanup(() => {
          window.removeEventListener('keydown', onKey);
          cancelAnimationFrame(pollId);
        });
      });
  }

  // ---------- helpers ----------
  _renderStep(title, subtitle, build) {
    return new Promise((resolve) => {
      this.root.hidden = false;
      this.root.replaceChildren();
      const card = document.createElement('div');
      card.className = 'overlay-card wizard-card';
      const h = document.createElement('h2');
      h.textContent = title;
      const p = document.createElement('p');
      p.textContent = subtitle;
      card.append(h, p);
      this.root.appendChild(card);

      let resolved = false;
      const cleanups = [];
      const onCleanup = (fn) => cleanups.push(fn);
      const wrappedResolve = (v) => {
        if (resolved) return;
        resolved = true;
        for (const fn of cleanups) {
          try { fn(); } catch (e) { console.error(e); }
        }
        window.removeEventListener('keydown', onEsc);
        this.root.replaceChildren();
        this.root.hidden = true;
        resolve(v);
      };
      const onEsc = (e) => {
        if (e.code === 'Escape' && !resolved) wrappedResolve(null);
      };
      window.addEventListener('keydown', onEsc);
      build(card, wrappedResolve, onCleanup);
    });
  }

  _addStepNav(/* card, opts */) { /* reserved for future */ }

  _buttonGroup(label, optionsObj, currentValue, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'opt-row';
    const lab = document.createElement('span');
    lab.className = 'opt-label';
    lab.textContent = label;
    wrap.appendChild(lab);
    const grp = document.createElement('div');
    grp.className = 'opt-group';
    const buttons = [];
    for (const [key, def] of Object.entries(optionsObj)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt-btn';
      b.textContent = def.label;
      if (key === currentValue) b.classList.add('active');
      b.addEventListener('click', () => {
        for (const x of buttons) x.classList.remove('active');
        b.classList.add('active');
        onChange(key);
      });
      buttons.push(b);
      grp.appendChild(b);
    }
    wrap.appendChild(grp);
    return wrap;
  }

  _lapButtonGroup(state, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'opt-row';
    const lab = document.createElement('span');
    lab.className = 'opt-label';
    lab.textContent = 'Laps';
    wrap.appendChild(lab);
    const grp = document.createElement('div');
    grp.className = 'opt-group';
    const buttons = [];
    const opts = [
      { value: null, label: 'Track default' },
      ...LAP_CHOICES.map((n) => ({ value: n, label: `${n}` }))
    ];
    for (const o of opts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt-btn';
      b.textContent = o.label;
      if (o.value === state.laps) b.classList.add('active');
      b.addEventListener('click', () => {
        for (const x of buttons) x.classList.remove('active');
        b.classList.add('active');
        onChange(o.value);
      });
      buttons.push(b);
      grp.appendChild(b);
    }
    wrap.appendChild(grp);
    return wrap;
  }
}

// External helper used by RacingGame to turn a chosen device into an
// InputManager binding.
export function bindingForDevice(device) {
  if (device.type === 'kb1') return { ...DEVICE_KB1, gamepad: 'auto', ...DEVICE_PAD };
  if (device.type === 'kb2') return { ...DEVICE_KB2, gamepad: 'auto', ...DEVICE_PAD };
  if (device.type === 'pad') return { gamepad: device.index, ...DEVICE_PAD };
  throw new Error('unknown device: ' + JSON.stringify(device));
}

export function applyLapsOverride(track, laps) {
  if (laps != null) track.totalLaps = laps;
  return track;
}

export function trackById(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}

function deviceKey(d) { return d.type === 'pad' ? `pad${d.index}` : d.type; }
function describeDevice(d) {
  if (d.type === 'kb1') return 'Arrow keys + Space';
  if (d.type === 'kb2') return 'WASD + Shift';
  if (d.type === 'pad') return `Gamepad ${d.index + 1}`;
  return '?';
}
