// Personal-best store for Time Trial mode.
// Persists per-track best lap time and a downsampled trace of that lap so
// we can replay it as a ghost car.
//
// Trace samples are recorded at the engine's fixed step (60 Hz). To keep
// localStorage usage small we downsample to ~12 Hz (every 5 steps).

// VERSION bumped to 2 because track world coordinates were rescaled.
// Old PBs (recorded in the previous coordinate space) are silently
// discarded by `_load` when the version doesn't match.
const KEY = (trackId) => `gameflash:rural-racing:tt:${trackId}`;
const VERSION = 2;
const SAMPLE_EVERY_N_STEPS = 5;     // 60 Hz / 5 = 12 Hz
const MAX_SAMPLES = 1200;            // ~100 seconds of lap

export class TimeTrialStore {
  constructor(trackId) {
    this.trackId = trackId;
    this.pb = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY(this.trackId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== VERSION) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  best() { return this.pb; }
  bestLapTime() { return this.pb ? this.pb.lapTime : null; }
  bestSamples() { return this.pb ? this.pb.samples : null; }

  trySave(lapTime, samples) {
    if (this.pb && lapTime >= this.pb.lapTime) return false;
    const compact = compactSamples(samples);
    this.pb = { version: VERSION, lapTime, samples: compact };
    try { localStorage.setItem(KEY(this.trackId), JSON.stringify(this.pb)); } catch (_) {}
    return true;
  }

  reset() {
    this.pb = null;
    try { localStorage.removeItem(KEY(this.trackId)); } catch (_) {}
  }
}

// Downsample a 60 Hz lap trace to ~12 Hz with rounded numbers.
function compactSamples(samples) {
  const out = [];
  for (let i = 0; i < samples.length && out.length < MAX_SAMPLES; i += SAMPLE_EVERY_N_STEPS) {
    const s = samples[i];
    out.push([
      Math.round(s.t * 1000),       // ms since lap start
      Math.round(s.x),
      Math.round(s.y),
      Math.round(s.angle * 1000)    // milliradians
    ]);
  }
  return out;
}

// Linear-interpolate a ghost position at lap-time `tSec` from a compacted trace.
export function ghostAt(samplesCompact, tSec) {
  if (!samplesCompact || samplesCompact.length === 0) return null;
  const tMs = tSec * 1000;
  // Binary search for the sample with the largest t <= tMs.
  let lo = 0, hi = samplesCompact.length - 1;
  if (tMs <= samplesCompact[0][0]) return decode(samplesCompact[0]);
  if (tMs >= samplesCompact[hi][0]) return decode(samplesCompact[hi]);
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samplesCompact[mid][0] <= tMs) lo = mid; else hi = mid;
  }
  const a = samplesCompact[lo];
  const b = samplesCompact[hi];
  const span = b[0] - a[0] || 1;
  const f = (tMs - a[0]) / span;
  // Wrap angle interpolation to take the short way.
  let angA = a[3] / 1000;
  let angB = b[3] / 1000;
  let diff = angB - angA;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return {
    x: a[1] + (b[1] - a[1]) * f,
    y: a[2] + (b[2] - a[2]) * f,
    angle: angA + diff * f
  };
}

function decode(s) {
  return { x: s[1], y: s[2], angle: s[3] / 1000 };
}
