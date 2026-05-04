// InputManager: unifies KeyboardSource and GamepadSource into a Player API.
//
// A Player exposes a normalized set of "actions" (booleans with edge-detection)
// and "axes" (continuous floats). Games define which actions and axes they need
// when they create players.
//
// A Player can be bound to:
//   - a keyboard layout (a map from action -> KeyboardEvent.code, plus axis maps),
//   - a gamepad slot (auto-attached when a pad is connected),
//   - or both (a "hybrid" player merges sources; useful for single-player).
//
// Hot-plug: when a gamepad connects, it is offered to the first player whose
// gamepad slot is `auto` (i.e. requested any pad and doesn't yet have one).
// On disconnect the player goes back to keyboard-only (if a keyboard layout was set).

import { KeyboardSource } from './KeyboardSource.js';
import { GamepadSource } from './GamepadSource.js';
import { clamp } from '../utils/math.js';

export class InputManager {
  constructor() {
    this.keyboard = new KeyboardSource();
    this.gamepads = new GamepadSource();
    this.players = [];
    this._gamepadUnsub = null;
  }

  attach() {
    this.keyboard.attach();
    this.gamepads.attach();
    this._gamepadUnsub = this.gamepads.on((kind, index) => {
      if (kind === 'connect') this._tryAssignPad(index);
      else if (kind === 'disconnect') this._releasePad(index);
    });
  }

  detach() {
    this.keyboard.detach();
    this.gamepads.detach();
    if (this._gamepadUnsub) { this._gamepadUnsub(); this._gamepadUnsub = null; }
    this.players = [];
  }

  // Called by Engine each frame.
  beginFrame() {
    this.gamepads.poll();
    for (const p of this.players) p._sample(this.keyboard, this.gamepads);
  }
  endFrame() {
    for (const p of this.players) p._commit();
  }

  // Create a player. `binding` shape:
  //   {
  //     keyboard?: { axes: { steer: ['ArrowLeft', 'ArrowRight'], ... },
  //                  actions: { accelerate: ['ArrowUp'], brake: ['ArrowDown'], ... } }
  //     gamepad?: 'auto' | number  // index, or 'auto' to pick the next free pad
  //   }
  createPlayer(binding) {
    const player = new Player(binding);
    this.players.push(player);
    if (binding.gamepad === 'auto') {
      // Try to attach an already-connected, unclaimed pad immediately.
      const pads = this.gamepads.list();
      for (let i = 0; i < pads.length; i++) {
        if (pads[i] && !this._padIsClaimed(i)) { player._padIndex = i; break; }
      }
    } else if (typeof binding.gamepad === 'number') {
      player._padIndex = binding.gamepad;
    }
    return player;
  }

  removePlayer(player) {
    const i = this.players.indexOf(player);
    if (i >= 0) this.players.splice(i, 1);
  }

  _padIsClaimed(index) {
    return this.players.some((p) => p._padIndex === index);
  }
  _tryAssignPad(index) {
    for (const p of this.players) {
      if (p.binding.gamepad === 'auto' && p._padIndex == null) {
        p._padIndex = index;
        return;
      }
    }
  }
  _releasePad(index) {
    for (const p of this.players) {
      if (p._padIndex === index) p._padIndex = null;
    }
  }
}

// Standard-mapping gamepad button names we care about.
const PAD_BUTTON = {
  a: 0, b: 1, x: 2, y: 3,
  lb: 4, rb: 5, lt: 6, rt: 7,
  back: 8, start: 9,
  dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15
};

export class Player {
  constructor(binding) {
    this.binding = binding;
    this._padIndex = null;
    this._actions = {};       // name -> { down, justDown, justUp, _prevDown }
    this._axes = {};          // name -> number

    const actionsCfg = binding.keyboard?.actions || {};
    for (const name of Object.keys(actionsCfg)) {
      this._actions[name] = { down: false, justDown: false, justUp: false, _prevDown: false };
    }
    // Allow gamepad-only actions to be declared via binding.gamepadActions.
    for (const name of Object.keys(binding.gamepadActions || {})) {
      if (!this._actions[name]) {
        this._actions[name] = { down: false, justDown: false, justUp: false, _prevDown: false };
      }
    }
    const axesCfg = binding.keyboard?.axes || {};
    for (const name of Object.keys(axesCfg)) this._axes[name] = 0;
    for (const name of Object.keys(binding.gamepadAxes || {})) {
      if (!(name in this._axes)) this._axes[name] = 0;
    }
  }

  hasGamepad() { return this._padIndex != null; }
  gamepadIndex() { return this._padIndex; }

  // Public read API
  isDown(action) { return !!this._actions[action]?.down; }
  justPressed(action) { return !!this._actions[action]?.justDown; }
  justReleased(action) { return !!this._actions[action]?.justUp; }
  axis(name) { return this._axes[name] ?? 0; }

  // Sampled by InputManager.
  _sample(keyboard, gamepads) {
    // Reset per-frame held state, then OR in keyboard, then OR in gamepad.
    for (const name in this._actions) this._actions[name].down = false;
    for (const name in this._axes) this._axes[name] = 0;

    // Keyboard
    const kb = this.binding.keyboard;
    if (kb) {
      const aMap = kb.actions || {};
      for (const name in aMap) {
        const codes = aMap[name];
        const arr = Array.isArray(codes) ? codes : [codes];
        for (const c of arr) if (keyboard.isDown(c)) { this._actions[name].down = true; break; }
      }
      const xMap = kb.axes || {};
      for (const name in xMap) {
        const def = xMap[name]; // [negativeCode, positiveCode]
        let v = 0;
        if (keyboard.isDown(def[0])) v -= 1;
        if (keyboard.isDown(def[1])) v += 1;
        this._axes[name] = clamp(v, -1, 1);
      }
    }

    // Gamepad
    if (this._padIndex != null) {
      const pad = gamepads.get(this._padIndex);
      if (pad) {
        const aMap = this.binding.gamepadActions || {};
        for (const name in aMap) {
          const buttons = Array.isArray(aMap[name]) ? aMap[name] : [aMap[name]];
          for (const b of buttons) {
            const idx = typeof b === 'string' ? PAD_BUTTON[b] : b;
            if (idx != null && pad.buttons[idx]) {
              if (this._actions[name]) this._actions[name].down = true;
              break;
            }
          }
        }
        const xMap = this.binding.gamepadAxes || {};
        for (const name in xMap) {
          const def = xMap[name]; // { axis: number, invert?: boolean } or [negBtn, posBtn]
          if (Array.isArray(def)) {
            let v = 0;
            const negIdx = typeof def[0] === 'string' ? PAD_BUTTON[def[0]] : def[0];
            const posIdx = typeof def[1] === 'string' ? PAD_BUTTON[def[1]] : def[1];
            if (negIdx != null && pad.buttons[negIdx]) v -= 1;
            if (posIdx != null && pad.buttons[posIdx]) v += 1;
            // Combine with keyboard via "stronger absolute value wins" so they don't cancel.
            const cur = this._axes[name] ?? 0;
            this._axes[name] = Math.abs(v) > Math.abs(cur) ? clamp(v, -1, 1) : cur;
          } else {
            const raw = pad.axes[def.axis] ?? 0;
            const v = (def.invert ? -raw : raw);
            const cur = this._axes[name] ?? 0;
            this._axes[name] = Math.abs(v) > Math.abs(cur) ? clamp(v, -1, 1) : cur;
          }
        }
      }
    }
  }

  _commit() {
    for (const name in this._actions) {
      const a = this._actions[name];
      a.justDown = a.down && !a._prevDown;
      a.justUp = !a.down && a._prevDown;
      a._prevDown = a.down;
    }
  }
}
