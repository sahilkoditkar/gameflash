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
  //
  // The previous version was a single bare sawtooth at 80-320 Hz — bright,
  // electronic, no filtering, sounded like a buzzer. This builds a small
  // synth instead:
  //
  //   oscA, oscB (sawtooth, slightly detuned)  ┐
  //   sub        (triangle, half-frequency)    ├─► low-pass ─► output
  //   noise      (filtered band-pass)          │
  //
  // The two detuned saws beat against each other for a chorus-like body,
  // the sub adds the low thump of a four-stroke, and the noise layer is
  // the broad-band roar a real engine makes. The master low-pass cutoff
  // opens with throttle, so harmonics come in gradually as you accelerate
  // instead of always blasting through.
  //
  // Per-stage gains are tuned for up to 4 simultaneous engines (split
  // screen) without clipping.
  engineLoop() {
    const ctx = this.ensure();
    if (!ctx) return { setIntensity() {}, stop() {} };

    // Output bus — every voice routes through this so a single gain ramp
    // can fade the whole engine in/out and respect mute.
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);

    // Master low-pass, modulated by throttle.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    lp.Q.value = 0.6;
    lp.connect(out);

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 70;
    const oscB = ctx.createOscillator();
    oscB.type = 'sawtooth';
    oscB.frequency.value = 70;
    oscB.detune.value = 14;  // ~14 cents detune → chorus / beating

    const oscMix = ctx.createGain();
    oscMix.gain.value = 0.32;
    oscA.connect(oscMix);
    oscB.connect(oscMix);
    oscMix.connect(lp);

    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = 35;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.10;
    sub.connect(subGain);
    subGain.connect(lp);

    // Broad-band roar.
    const noise = ctx.createBufferSource();
    noise.buffer = engineNoiseBuffer(ctx);
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 220;
    noiseFilter.Q.value = 0.6;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;  // ramps in via setIntensity
    noise.connect(noiseFilter).connect(noiseGain).connect(out);

    oscA.start();
    oscB.start();
    sub.start();
    noise.start();

    out.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 0.1);

    let stopped = false;
    return {
      setIntensity: (v) => {
        if (stopped) return;
        const t = Math.max(0, Math.min(1, v));
        // Idle ~60 Hz, full throttle ~220 Hz.
        const f = 60 + t * 160;
        oscA.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
        oscB.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
        sub.frequency.setTargetAtTime(f * 0.5, ctx.currentTime, 0.05);
        // Filter opens 400 → 2800 Hz across the throttle range.
        lp.frequency.setTargetAtTime(400 + t * 2400, ctx.currentTime, 0.06);
        // Noise band tracks pitch and rises with load.
        noiseFilter.frequency.setTargetAtTime(220 + t * 380, ctx.currentTime, 0.06);
        noiseGain.gain.setTargetAtTime(this.muted ? 0 : 0.012 + t * 0.028, ctx.currentTime, 0.08);
        out.gain.setTargetAtTime(this.muted ? 0 : 0.10 + t * 0.14, ctx.currentTime, 0.1);
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        oscA.stop(ctx.currentTime + 0.3);
        oscB.stop(ctx.currentTime + 0.3);
        sub.stop(ctx.currentTime + 0.3);
        noise.stop(ctx.currentTime + 0.3);
      }
    };
  }
}

// 2-second mono white-noise buffer reused as the source for the engine
// noise layer. Cached per AudioContext so we don't reallocate ~88 KB per
// new engine handle on every restart.
const _noiseBufferCache = new WeakMap();
function engineNoiseBuffer(ctx) {
  const cached = _noiseBufferCache.get(ctx);
  if (cached) return cached;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  _noiseBufferCache.set(ctx, buf);
  return buf;
}
