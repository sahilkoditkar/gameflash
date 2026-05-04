// Lightweight audio: lazy-creates a single AudioContext (after a user gesture)
// and exposes simple synth helpers so games don't need external audio assets.
// Browsers require a user gesture before resuming the context — this is handled
// transparently by ensure().

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._unlocked = false;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.4;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  async unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (_) {}
    }
    this._unlocked = true;
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.4;
  }

  // Short tone, mostly used for menu blips and crash sounds.
  beep({ freq = 440, duration = 0.08, type = 'square', gain = 1 } = {}) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.value = 0;
    env.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(env).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  // Continuous engine drone whose pitch tracks a 0..1 throttle value.
  // Returns a handle with setIntensity(v) and stop().
  engineLoop() {
    const ctx = this.ensure();
    if (!ctx) return { setIntensity() {}, stop() {} };
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 80;
    env.gain.value = 0;
    env.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.1);
    osc.connect(env).connect(this.master);
    osc.start();
    let stopped = false;
    return {
      setIntensity: (v) => {
        if (stopped) return;
        const t = Math.max(0, Math.min(1, v));
        osc.frequency.setTargetAtTime(80 + t * 240, ctx.currentTime, 0.05);
        env.gain.setTargetAtTime(this.muted ? 0 : 0.03 + t * 0.06, ctx.currentTime, 0.1);
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        env.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        osc.stop(ctx.currentTime + 0.2);
      }
    };
  }
}
