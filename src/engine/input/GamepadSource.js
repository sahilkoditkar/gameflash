// GamepadSource: polls navigator.getGamepads() each frame and exposes a stable view.
// Hot-plug is handled by the gamepadconnected / gamepaddisconnected events.
//
// Standard mapping (most modern pads): axes 0/1 = left stick, 2/3 = right stick;
// buttons: 0=A 1=B 2=X 3=Y 4=LB 5=RB 6=LT 7=RT 8=Back 9=Start 12-15=Dpad up/down/left/right.
// We stick to standard mapping; non-standard pads get a best-effort fallback.

const DEADZONE = 0.18;

export class GamepadSource {
  constructor() {
    this._snapshot = [];  // index -> { id, axes, buttons } or null
    this._listeners = new Set();
    this._onConnect = (e) => {
      this._notify('connect', e.gamepad.index);
    };
    this._onDisconnect = (e) => {
      this._notify('disconnect', e.gamepad.index);
    };
  }

  attach() {
    window.addEventListener('gamepadconnected', this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);
  }
  detach() {
    window.removeEventListener('gamepadconnected', this._onConnect);
    window.removeEventListener('gamepaddisconnected', this._onDisconnect);
    this._snapshot = [];
    this._listeners.clear();
  }

  on(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  _notify(kind, index) { for (const cb of this._listeners) cb(kind, index); }

  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const out = [];
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p) { out[i] = null; continue; }
      const axes = new Array(p.axes.length);
      for (let a = 0; a < p.axes.length; a++) {
        const v = p.axes[a];
        axes[a] = Math.abs(v) < DEADZONE ? 0 : v;
      }
      const buttons = new Array(p.buttons.length);
      for (let b = 0; b < p.buttons.length; b++) buttons[b] = p.buttons[b].pressed;
      out[i] = { id: p.id, axes, buttons, mapping: p.mapping };
    }
    this._snapshot = out;
  }

  get(index) { return this._snapshot[index] || null; }
  list() { return this._snapshot.slice(); }
}
