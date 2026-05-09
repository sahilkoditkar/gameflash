// Track: spline-based centerline with a uniform half-width and a theme that
// drives palette + decoration types.
//
// Themes:
//   - countryside : green grass, trees + hay + rocks (UK farmland feel)
//   - forest      : darker grass, dense conifers, fewer rocks (Ardennes)
//   - urban       : asphalt-grey runoff, palm trees + grandstands (Miami)
//   - street      : grey "concrete" surroundings, barriers tight to track (Monaco)
//
// Decorations are scattered along both edges from a deterministic seed so the
// scene is identical for every player.

import { distToSegment } from '../../engine/utils/math.js';
import { createRng, range } from '../../engine/utils/rng.js';
import { closedCenterline } from '../../engine/utils/spline.js';

const THEMES = {
  countryside: {
    grass: '#2d5a35',
    grassBands: 'rgba(255,255,255,0.025)',
    decoTypes: ['tree', 'tree', 'tree', 'hay', 'rock'],
    treePalette: ['#1f6b2a', '#2a8038'],
    barrierTight: false
  },
  forest: {
    grass: '#1a3f22',
    grassBands: 'rgba(255,255,255,0.015)',
    decoTypes: ['tree', 'tree', 'tree', 'tree', 'rock'],
    treePalette: ['#0f3318', '#194a25'],
    barrierTight: false
  },
  urban: {
    grass: '#3e4044',
    grassBands: 'rgba(255,255,255,0.02)',
    decoTypes: ['palm', 'palm', 'grandstand', 'rock'],
    treePalette: ['#2f7a4a', '#3a8e58'],
    barrierTight: false
  },
  street: {
    grass: '#4a4d52',
    grassBands: 'rgba(255,255,255,0.018)',
    decoTypes: ['barrier', 'barrier', 'palm', 'grandstand'],
    treePalette: ['#2f7a4a'],
    barrierTight: true
  },
  desert: {
    grass: '#c9a86a',
    grassBands: 'rgba(0,0,0,0.04)',
    decoTypes: ['palm', 'rock', 'rock', 'grandstand'],
    treePalette: ['#2f7a4a'],
    barrierTight: false
  }
};

// Global scale applied to all tracks. Bumping this enlarges every circuit's
// world coordinates and road width together, so the player needs the camera
// to follow them rather than seeing the whole track at once.
const TRACK_SCALE = 1.8;

// Effective "keep clear" radius for a decoration. Conservative: rectangles
// use half their longest side so the check works regardless of orientation.
// Used by Track._decoOverlapsTrack to drop trees/etc. that would land on
// the racing surface (e.g. on the inside of a hairpin or across a parallel
// straight, where the local placement perpendicular crosses another segment).
function decoFootprintRadius(deco) {
  if (deco.r != null) return deco.r;
  if (deco.w != null && deco.h != null) return Math.max(deco.w, deco.h) / 2;
  return 8;
}

export class Track {
  constructor({
    name,
    controlPoints,
    halfWidth = 70,
    laps = 3,
    theme = 'countryside',
    decorationDensity = 0.5,
    decorationSeed = 1,
    scale = TRACK_SCALE
  }) {
    this.name = name;
    this.scale = scale;
    this.halfWidth = halfWidth * scale;
    this.totalLaps = laps;
    this.theme = THEMES[theme] || THEMES.countryside;
    this.themeName = theme;

    const scaled = controlPoints.map(([x, y]) => [x * scale, y * scale]);
    this.centerline = closedCenterline(scaled, 14);

    // Pre-compute segment lengths and tangents.
    this.segLen = new Array(this.centerline.length);
    this.segTangent = new Array(this.centerline.length);
    let total = 0;
    for (let i = 0; i < this.centerline.length; i++) {
      const a = this.centerline[i];
      const b = this.centerline[(i + 1) % this.centerline.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      this.segLen[i] = len;
      this.segTangent[i] = { x: dx / (len || 1), y: dy / (len || 1) };
      total += len;
    }
    this.totalLength = total;

    // Bounds, used by the camera.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of this.centerline) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = this.halfWidth + 80;
    this.bounds = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };

    // Start position: at segment 0, slightly behind the start line.
    const startSeg = 0;
    const t = this.segTangent[startSeg];
    this.startAngle = Math.atan2(t.y, t.x);
    const start = this.centerline[startSeg];
    this.startX = start.x - t.x * 30 * scale;
    this.startY = start.y - t.y * 30 * scale;

    this.startGrid = this._buildStartGrid(8);
    this.decorations = this._buildDecorations(decorationDensity, decorationSeed);
  }

  _buildStartGrid(slots) {
    const grid = [];
    const t = this.segTangent[0];
    const nx = -t.y;
    const ny = t.x;
    const start = this.centerline[0];
    const s = this.scale;
    for (let i = 0; i < slots; i++) {
      const row = Math.floor(i / 2);
      const side = i % 2 === 0 ? -1 : 1;
      const ox = -t.x * (40 + row * 50) * s;
      const oy = -t.y * (40 + row * 50) * s;
      const lx = nx * side * 20 * s;
      const ly = ny * side * 20 * s;
      grid.push({ x: start.x + ox + lx, y: start.y + oy + ly, angle: this.startAngle });
    }
    return grid;
  }

  _buildDecorations(density, seed) {
    if (density <= 0) return [];
    const rng = createRng(seed);
    const out = [];
    const cl = this.centerline;
    const decoTypes = this.theme.decoTypes;
    const s = this.scale;
    // Step at a fixed cadence; density controls per-side placement probability.
    const step = this.theme.barrierTight ? 3 : 4;
    for (let i = 0; i < cl.length; i += step) {
      const a = cl[i];
      const t = this.segTangent[i];
      // Skip placing decorations near the start/finish line.
      if (i < 4 || i > cl.length - 4) continue;
      for (const side of [-1, 1]) {
        if (rng() > density) continue;
        // Street circuits: barriers right against the track. Others: pulled out.
        const baseOffset = this.theme.barrierTight
          ? this.halfWidth + 6 * s
          : this.halfWidth + (18 + range(rng, 0, 60)) * s;
        const jitterAlong = range(rng, -8, 8) * s;
        const px = a.x + t.x * jitterAlong + (-t.y) * side * baseOffset;
        const py = a.y + t.y * jitterAlong + (t.x) * side * baseOffset;
        const type = decoTypes[Math.floor(rng() * decoTypes.length)];
        const deco = this._makeDecoration(type, px, py, t, rng);
        // Reject anything that landed on the racing surface. The placement
        // offset is perpendicular to the LOCAL segment, which is fine for
        // straights but in hairpins, figure-eights (Suzuka's crossover) and
        // parallel straights (Monza's curva di Lesmo, Spa's Eau Rouge), that
        // local perpendicular can cross another part of the same track.
        if (this._decoOverlapsTrack(deco, i)) continue;
        out.push(deco);
      }
    }
    return out;
  }

  // True if a decoration would clip the racing surface on a segment far
  // from where it was placed. A window around `placedAtIdx` is trusted —
  // that's where the placement code already pushed the deco off the track
  // by --halfWidth + offset—and the check is only for OTHER stretches of
  // tarmac that happen to be near this world position.
  _decoOverlapsTrack(deco, placedAtIdx) {
    const r = decoFootprintRadius(deco);
    // Tree's near edge crosses asphalt edge when distance(center) < halfWidth + r.
    const minClearance = this.halfWidth + r;
    const cl = this.centerline;
    const n = cl.length;
    const skipWindow = 12;
    for (let j = 0; j < n; j++) {
      // Closed-loop distance between segment indices.
      let dj = Math.abs(j - placedAtIdx);
      if (dj > n / 2) dj = n - dj;
      if (dj <= skipWindow) continue;
      const a = cl[j];
      const b = cl[(j + 1) % n];
      if (distToSegment(deco.x, deco.y, a.x, a.y, b.x, b.y) < minClearance) {
        return true;
      }
    }
    return false;
  }

  _makeDecoration(type, x, y, tan, rng) {
    const s = this.scale;
    if (type === 'tree') {
      const palette = this.theme.treePalette;
      return {
        type: 'tree',
        x, y,
        r: (9 + range(rng, 0, 5)) * s,
        color: palette[Math.floor(rng() * palette.length)]
      };
    }
    if (type === 'hay') {
      return { type: 'hay', x, y, w: 18 * s, h: 12 * s, angle: range(rng, -0.3, 0.3) };
    }
    if (type === 'rock') {
      return { type: 'rock', x, y, r: (6 + range(rng, 0, 4)) * s };
    }
    if (type === 'palm') {
      return { type: 'palm', x, y, r: (7 + range(rng, 0, 3)) * s };
    }
    if (type === 'grandstand') {
      return {
        type: 'grandstand',
        x, y,
        angle: Math.atan2(tan.y, tan.x),
        w: (60 + range(rng, 0, 30)) * s,
        h: 14 * s
      };
    }
    if (type === 'barrier') {
      return {
        type: 'barrier',
        x, y,
        angle: Math.atan2(tan.y, tan.x),
        w: 18 * s,
        h: 5 * s
      };
    }
    return { type: 'rock', x, y, r: 6 * s };
  }

  project(x, y, aroundIdx = 0, window = 24) {
    const cl = this.centerline;
    const n = cl.length;
    let bestI = 0;
    let bestD = Infinity;
    let bestT = 0;
    for (let k = -window; k <= window; k++) {
      const i = ((aroundIdx + k) % n + n) % n;
      const a = cl[i];
      const b = cl[(i + 1) % n];
      const d = distToSegment(x, y, a.x, a.y, b.x, b.y);
      if (d < bestD) {
        bestD = d;
        bestI = i;
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        bestT = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
      }
    }
    return { segIndex: bestI, t: bestT, distance: bestD };
  }

  lookAhead(segIndex, t, distance, lateralOffset = 0) {
    let i = segIndex;
    let remain = distance + this.segLen[i] * (1 - t);
    while (remain > this.segLen[i]) {
      remain -= this.segLen[i];
      i = (i + 1) % this.centerline.length;
    }
    const a = this.centerline[i];
    const b = this.centerline[(i + 1) % this.centerline.length];
    const tt = remain / (this.segLen[i] || 1);
    const px = a.x + (b.x - a.x) * tt;
    const py = a.y + (b.y - a.y) * tt;
    if (lateralOffset === 0) return { x: px, y: py, segIndex: i, t: tt };
    const tan = this.segTangent[i];
    const nx = -tan.y;
    const ny = tan.x;
    return {
      x: px + nx * lateralOffset,
      y: py + ny * lateralOffset,
      segIndex: i,
      t: tt
    };
  }

  curvatureAhead(segIndex, count = 6) {
    const n = this.segTangent.length;
    let acc = 0;
    for (let k = 0; k < count; k++) {
      const a = this.segTangent[(segIndex + k) % n];
      const b = this.segTangent[(segIndex + k + 1) % n];
      const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
      acc += Math.acos(dot);
    }
    return acc;
  }

  draw(renderer) {
    const ctx = renderer.ctx;
    const cl = this.centerline;
    const theme = this.theme;

    // Grass background.
    ctx.fillStyle = theme.grass;
    ctx.fillRect(this.bounds.minX, this.bounds.minY,
      this.bounds.maxX - this.bounds.minX,
      this.bounds.maxY - this.bounds.minY);

    // Grass tonal bands.
    ctx.fillStyle = theme.grassBands;
    for (let yy = this.bounds.minY; yy < this.bounds.maxY; yy += 26) {
      ctx.fillRect(this.bounds.minX, yy, this.bounds.maxX - this.bounds.minX, 4);
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (!this.theme.barrierTight) {
      // Curb (red/white, slightly wider than the asphalt).
      ctx.lineWidth = this.halfWidth * 2 + 8;
      ctx.strokeStyle = '#c83b3b';
      this._strokeLoop(ctx, cl);

      ctx.lineWidth = this.halfWidth * 2 + 6;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([16, 16]);
      this._strokeLoop(ctx, cl);
      ctx.setLineDash([]);
    } else {
      // Street circuits: a narrow concrete shoulder, no kerb stripes.
      ctx.lineWidth = this.halfWidth * 2 + 5;
      ctx.strokeStyle = '#bdbfc3';
      this._strokeLoop(ctx, cl);
    }

    // Asphalt.
    ctx.lineWidth = this.halfWidth * 2;
    ctx.strokeStyle = '#3a3f48';
    this._strokeLoop(ctx, cl);

    ctx.lineWidth = this.halfWidth * 2 - 4;
    ctx.strokeStyle = '#454a55';
    this._strokeLoop(ctx, cl);

    // Centerline dashes.
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 220, 90, 0.55)';
    ctx.setLineDash([16, 22]);
    this._strokeLoop(ctx, cl);
    ctx.setLineDash([]);

    for (const d of this.decorations) this._drawDecoration(ctx, d);

    // Start/finish line.
    const t = this.segTangent[0];
    const a = this.centerline[0];
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.atan2(t.y, t.x));
    const lineLen = 14;
    const w = this.halfWidth;
    const cells = 12;
    const cellH = (w * 2) / cells;
    for (let i = 0; i < cells; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#fff' : '#1a1a1a';
      ctx.fillRect(-lineLen / 2, -w + i * cellH, lineLen, cellH);
    }
    ctx.restore();
  }

  _strokeLoop(ctx, cl) {
    ctx.beginPath();
    ctx.moveTo(cl[0].x, cl[0].y);
    for (let i = 1; i < cl.length; i++) ctx.lineTo(cl[i].x, cl[i].y);
    ctx.closePath();
    ctx.stroke();
  }

  _drawDecoration(ctx, d) {
    if (d.type === 'tree') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(d.x + 2, d.y + 3, d.r * 1.05, d.r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.arc(d.x - d.r * 0.35, d.y - d.r * 0.35, d.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.type === 'palm') {
      // Trunk
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(d.x + 2, d.y + 3, d.r * 0.9, d.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a5a3a';
      ctx.fillRect(d.x - 2, d.y - 1, 4, 6);
      // Fronds
      ctx.fillStyle = '#2f8a4a';
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const ex = d.x + Math.cos(a) * d.r;
        const ey = d.y + Math.sin(a) * d.r * 0.7;
        ctx.beginPath();
        ctx.ellipse(ex, ey, d.r * 0.55, d.r * 0.18, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#56b078';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.type === 'grandstand') {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.angle);
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-d.w / 2 + 2, -d.h / 2 + 2, d.w, d.h);
      // Body (white roof)
      ctx.fillStyle = '#dadde2';
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      // Stripes (seating rows)
      ctx.fillStyle = '#9aa1ad';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(-d.w / 2 + 2, -d.h / 2 + 2 + i * (d.h - 4) / 4, d.w - 4, 1);
      }
      ctx.restore();
    } else if (d.type === 'barrier') {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.angle);
      ctx.fillStyle = '#e6e6e6';
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.fillStyle = '#c83b3b';
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w * 0.5, d.h);
      ctx.restore();
    } else if (d.type === 'hay') {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-d.w / 2 + 2, -d.h / 2 + 3, d.w, d.h);
      ctx.fillStyle = '#caa44b';
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const lx = -d.w / 2 + (i * d.w) / 4;
        ctx.beginPath();
        ctx.moveTo(lx, -d.h / 2);
        ctx.lineTo(lx, d.h / 2);
        ctx.stroke();
      }
      ctx.restore();
    } else if (d.type === 'rock') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(d.x + 2, d.y + 3, d.r * 1.1, d.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a8189';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Off-track when the car center has gone past the asphalt edge plus a
  // small kerb-forgiveness pad. The previous threshold (halfWidth - 6) was
  // backwards: it penalised the player while their CENTER was still 6px
  // inside the asphalt — i.e. while the whole car was clearly on track.
  isOffTrack(distance) { return distance > this.halfWidth + 4; }
}
