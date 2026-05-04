// Track: spline-based centerline with a uniform half-width.
//
// Construction takes a small list of control points (the "spine" of the loop)
// and generates a dense centerline by Catmull-Rom interpolation. The centerline
// drives both rendering (we draw a thick stroke) and gameplay (cars query the
// track to find their nearest segment, off-track distance, and lap progress).
//
// Closed loop only — first/last points are connected.

import { TAU, dist, distToSegment } from '../../engine/utils/math.js';

const SUBDIVISIONS_PER_SEGMENT = 14;

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export class Track {
  constructor({ name, controlPoints, halfWidth = 90, laps = 3 }) {
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
    // Move 30 units back along the tangent so cars cross the line on lap start.
    this.startX = start.x - t.x * 30;
    this.startY = start.y - t.y * 30;

    // Cached starting grid: 4 staggered slots in two rows.
    this.startGrid = this._buildStartGrid(8);
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
      const lx = nx * side * 22;
      const ly = ny * side * 22;
      grid.push({ x: start.x + ox + lx, y: start.y + oy + ly, angle: this.startAngle });
    }
    return grid;
  }

  // Find the nearest segment to (x, y), starting search around `aroundIdx`.
  // Returns { segIndex, t, distance, ahead } where t is parameter along that
  // segment [0..1] and `ahead` is the signed forward progress in world units.
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
        // Project to get t.
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        bestT = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
      }
    }
    return { segIndex: bestI, t: bestT, distance: bestD };
  }

  // Returns the point `lookahead` units forward of (segIndex, t).
  lookAhead(segIndex, t, distance) {
    let i = segIndex;
    let remain = distance + this.segLen[i] * (1 - t);
    while (remain > this.segLen[i]) {
      remain -= this.segLen[i];
      i = (i + 1) % this.centerline.length;
    }
    const a = this.centerline[i];
    const b = this.centerline[(i + 1) % this.centerline.length];
    const tt = remain / (this.segLen[i] || 1);
    return { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt, segIndex: i, t: tt };
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
    return acc; // radians of total turn over `count` segments
  }

  draw(renderer) {
    const ctx = renderer.ctx;
    const cl = this.centerline;

    // Grass background — large rect tied to bounds.
    ctx.fillStyle = '#274d2e';
    ctx.fillRect(this.bounds.minX, this.bounds.minY,
      this.bounds.maxX - this.bounds.minX,
      this.bounds.maxY - this.bounds.minY);

    // Track surface: thick stroke along the centerline.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.halfWidth * 2;
    ctx.strokeStyle = '#3a3f48';
    ctx.beginPath();
    ctx.moveTo(cl[0].x, cl[0].y);
    for (let i = 1; i < cl.length; i++) ctx.lineTo(cl[i].x, cl[i].y);
    ctx.closePath();
    ctx.stroke();

    // Curb edges (subtle inner stripe).
    ctx.lineWidth = this.halfWidth * 2 - 6;
    ctx.strokeStyle = '#454a55';
    ctx.stroke();

    // Centerline dashes.
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 220, 90, 0.6)';
    ctx.setLineDash([18, 22]);
    ctx.beginPath();
    ctx.moveTo(cl[0].x, cl[0].y);
    for (let i = 1; i < cl.length; i++) ctx.lineTo(cl[i].x, cl[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Start/finish line: a thick checkered band perpendicular to seg 0 tangent.
    const t = this.segTangent[0];
    const a = this.centerline[0];
    const nx = -t.y, ny = t.x;
    const w = this.halfWidth;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.atan2(t.y, t.x));
    const lineLen = 12;
    for (let i = -8; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#fff' : '#1a1a1a';
      ctx.fillRect(-lineLen / 2, -w + (i + 8) * (w * 2 / 16), lineLen, w * 2 / 16);
    }
    ctx.restore();

    // Track bounding box outline (debug aesthetic).
    void TAU;
  }

  isOffTrack(distance) { return distance > this.halfWidth - 6; }
}
