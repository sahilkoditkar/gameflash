// Track: spline-based centerline with a uniform half-width.
//
// Construction takes a small list of control points (the "spine" of the loop)
// and generates a dense centerline by Catmull-Rom interpolation. The centerline
// drives both rendering (we draw a thick stroke) and gameplay (cars query the
// track to find their nearest segment, off-track distance, lap progress, and
// curvature ahead).
//
// Decorations (trees, hay bales) are scattered along both edges from a
// deterministic seed so the layout is identical for everyone.

import { distToSegment } from '../../engine/utils/math.js';
import { createRng, range } from '../../engine/utils/rng.js';

const SUBDIVISIONS_PER_SEGMENT = 14;

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export class Track {
  constructor({
    name,
    controlPoints,
    halfWidth = 70,
    laps = 3,
    decorationDensity = 0.5,
    decorationSeed = 1
  }) {
    this.name = name;
    this.halfWidth = halfWidth;
    this.totalLaps = laps;

    const cps = controlPoints;
    const n = cps.length;
    const cl = [];
    for (let i = 0; i < n; i++) {
      const p0 = cps[(i - 1 + n) % n];
      const p1 = cps[i];
      const p2 = cps[(i + 1) % n];
      const p3 = cps[(i + 2) % n];
      for (let s = 0; s < SUBDIVISIONS_PER_SEGMENT; s++) {
        const t = s / SUBDIVISIONS_PER_SEGMENT;
        cl.push({
          x: catmullRom(p0[0], p1[0], p2[0], p3[0], t),
          y: catmullRom(p0[1], p1[1], p2[1], p3[1], t)
        });
      }
    }
    this.centerline = cl;

    // Pre-compute segment lengths and tangents.
    this.segLen = new Array(cl.length);
    this.segTangent = new Array(cl.length);
    let total = 0;
    for (let i = 0; i < cl.length; i++) {
      const a = cl[i];
      const b = cl[(i + 1) % cl.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      this.segLen[i] = len;
      this.segTangent[i] = { x: dx / (len || 1), y: dy / (len || 1) };
      total += len;
    }
    this.totalLength = total;

    // Bounds, used by the camera.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of cl) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = halfWidth + 80;
    this.bounds = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };

    // Start position: at segment 0, slightly behind the start line.
    const startSeg = 0;
    const t = this.segTangent[startSeg];
    this.startAngle = Math.atan2(t.y, t.x);
    const start = cl[startSeg];
    this.startX = start.x - t.x * 30;
    this.startY = start.y - t.y * 30;

    // Cached starting grid: 8 staggered slots in two columns.
    this.startGrid = this._buildStartGrid(8);

    // Decorations (deterministic).
    this.decorations = this._buildDecorations(decorationDensity, decorationSeed);
  }

  _buildStartGrid(slots) {
    const grid = [];
    const t = this.segTangent[0];
    const nx = -t.y;
    const ny = t.x;
    const start = this.centerline[0];
    for (let i = 0; i < slots; i++) {
      const row = Math.floor(i / 2);
      const side = i % 2 === 0 ? -1 : 1;
      const ox = -t.x * (40 + row * 50);
      const oy = -t.y * (40 + row * 50);
      const lx = nx * side * 20;
      const ly = ny * side * 20;
      grid.push({ x: start.x + ox + lx, y: start.y + oy + ly, angle: this.startAngle });
    }
    return grid;
  }

  _buildDecorations(density, seed) {
    if (density <= 0) return [];
    const rng = createRng(seed);
    const out = [];
    const cl = this.centerline;
    // Step along the centerline at fixed cadence; density is the per-side
    // placement probability, not the spacing.
    const step = 4;
    for (let i = 0; i < cl.length; i += step) {
      const a = cl[i];
      const t = this.segTangent[i];
      // Skip placing decorations near the start/finish line.
      if (i < 4 || i > cl.length - 4) continue;
      for (const side of [-1, 1]) {
        if (rng() > density) continue;
        const dist = this.halfWidth + 18 + range(rng, 0, 60);
        const jitterAlong = range(rng, -10, 10);
        const px = a.x + t.x * jitterAlong + (-t.y) * side * dist;
        const py = a.y + t.y * jitterAlong + (t.x) * side * dist;
        // Choose decoration type.
        const r = rng();
        if (r < 0.78) {
          out.push({ type: 'tree', x: px, y: py, r: 9 + range(rng, 0, 5), shade: range(rng, 0.85, 1.15) });
        } else if (r < 0.92) {
          out.push({ type: 'hay', x: px, y: py, w: 18, h: 12, angle: range(rng, -0.3, 0.3) });
        } else {
          out.push({ type: 'rock', x: px, y: py, r: 6 + range(rng, 0, 4) });
        }
      }
    }
    return out;
  }

  // Find the nearest segment to (x, y), starting search around `aroundIdx`.
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

  // Returns the point `lookahead` units forward of (segIndex, t).
  // If `lateralOffset` is set, the point is shifted by that many units
  // perpendicular to the local tangent (positive = right of travel).
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

  // Estimate curvature ahead — magnitude of tangent change in the next `count`
  // segments. Used by AI to slow into corners.
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

    // Grass background — large rect tied to bounds.
    ctx.fillStyle = '#2d5a35';
    ctx.fillRect(this.bounds.minX, this.bounds.minY,
      this.bounds.maxX - this.bounds.minX,
      this.bounds.maxY - this.bounds.minY);

    // Soft grass texture: a few tonal bands.
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let yy = this.bounds.minY; yy < this.bounds.maxY; yy += 26) {
      ctx.fillRect(this.bounds.minX, yy, this.bounds.maxX - this.bounds.minX, 4);
    }

    // Curb (red/white, slightly wider than the asphalt).
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.halfWidth * 2 + 8;
    ctx.strokeStyle = '#c83b3b';
    ctx.beginPath();
    ctx.moveTo(cl[0].x, cl[0].y);
    for (let i = 1; i < cl.length; i++) ctx.lineTo(cl[i].x, cl[i].y);
    ctx.closePath();
    ctx.stroke();

    // White curb stripe (overlaid dashed on top of red).
    ctx.lineWidth = this.halfWidth * 2 + 6;
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([16, 16]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Asphalt.
    ctx.lineWidth = this.halfWidth * 2;
    ctx.strokeStyle = '#3a3f48';
    ctx.beginPath();
    ctx.moveTo(cl[0].x, cl[0].y);
    for (let i = 1; i < cl.length; i++) ctx.lineTo(cl[i].x, cl[i].y);
    ctx.closePath();
    ctx.stroke();

    // Inner shading.
    ctx.lineWidth = this.halfWidth * 2 - 4;
    ctx.strokeStyle = '#454a55';
    ctx.stroke();

    // Centerline dashes.
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 220, 90, 0.55)';
    ctx.setLineDash([16, 22]);
    ctx.beginPath();
    ctx.moveTo(cl[0].x, cl[0].y);
    for (let i = 1; i < cl.length; i++) ctx.lineTo(cl[i].x, cl[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Decorations (drawn before the start line so the line is on top).
    for (const d of this.decorations) this._drawDecoration(ctx, d);

    // Start/finish line: a thick checkered band perpendicular to seg 0 tangent.
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

  _drawDecoration(ctx, d) {
    if (d.type === 'tree') {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(d.x + 2, d.y + 3, d.r * 1.05, d.r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      // Foliage
      const g = '#1f6b2a';
      ctx.fillStyle = d.shade > 1 ? '#2a8038' : g;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.arc(d.x - d.r * 0.35, d.y - d.r * 0.35, d.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
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

  isOffTrack(distance) { return distance > this.halfWidth - 6; }
}
