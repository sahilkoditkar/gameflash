// Haptics: a thin wrapper over the Gamepad vibrationActuator.
//
// Browser support: Chrome/Edge support `dual-rumble`; Firefox/Safari do not
// (they either lack vibrationActuator entirely or expose a different shape).
// We feature-detect per call and silently no-op if unsupported.
//
// The Player abstraction exposes `gamepadIndex()` so we can rumble the right
// pad for a given human player.

export class Haptics {
  constructor() {
    // Throttle off-track / sustained pulses per pad so we don't spam playEffect.
    this._sustainCooldown = new Map(); // padIndex -> seconds remaining
  }

  pulsePad(padIndex, { duration = 120, strong = 0.5, weak = 0.3 } = {}) {
    if (padIndex == null) return;
    const pad = navigator.getGamepads ? navigator.getGamepads()[padIndex] : null;
    if (!pad) return;
    const va = pad.vibrationActuator;
    if (!va || typeof va.playEffect !== 'function') return;
    try {
      va.playEffect('dual-rumble', {
        duration,
        strongMagnitude: clamp01(strong),
        weakMagnitude: clamp01(weak),
        startDelay: 0
      }).catch(() => {});
    } catch (_) { /* unsupported effect type — ignore */ }
  }

  // Re-emits a small pulse at most every `intervalMs` for a given pad.
  // Call this every frame while a sustained condition (e.g. off-track) holds.
  sustainPad(padIndex, dt, { intervalMs = 220, duration = 200, strong = 0.2, weak = 0.4 } = {}) {
    if (padIndex == null) return;
    const remaining = (this._sustainCooldown.get(padIndex) || 0) - dt;
    if (remaining > 0) {
      this._sustainCooldown.set(padIndex, remaining);
      return;
    }
    this.pulsePad(padIndex, { duration, strong, weak });
    this._sustainCooldown.set(padIndex, intervalMs / 1000);
  }

  reset() { this._sustainCooldown.clear(); }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
