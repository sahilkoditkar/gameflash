// KeyboardSource: tracks raw key state. Owned by InputManager.
// Uses event.code (physical key) so layouts are stable across users.
// Held state is canonical; "justPressed" is recomputed by InputManager.

export class KeyboardSource {
  constructor() {
    this._down = new Set();
    this._onDown = (e) => {
      // Avoid eating the key when the user is typing in a real input.
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      this._down.add(e.code);
      // Prevent browser scroll for arrow keys, space, etc. when game is focused.
      if (PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault();
    };
    this._onUp = (e) => { this._down.delete(e.code); };
    this._onBlur = () => { this._down.clear(); };
  }

  attach() {
    window.addEventListener('keydown', this._onDown, { passive: false });
    window.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', this._onBlur);
  }
  detach() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
    window.removeEventListener('blur', this._onBlur);
    this._down.clear();
  }

  isDown(code) { return this._down.has(code); }
}

const PREVENT_DEFAULT_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'Tab',
  // WASD, Shift left for player 2 controls
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'
]);
