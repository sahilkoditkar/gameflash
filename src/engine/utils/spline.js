// Catmull-Rom spline helpers used by Track and the track picker preview.

// Closed Catmull-Rom interpolation: returns a dense polyline through every
// control point, treating the points as a closed loop.
export function closedCenterline(controlPoints, subdivisions = 14) {
  const n = controlPoints.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = controlPoints[(i - 1 + n) % n];
    const p1 = controlPoints[i];
    const p2 = controlPoints[(i + 1) % n];
    const p3 = controlPoints[(i + 2) % n];
    for (let s = 0; s < subdivisions; s++) {
      const t = s / subdivisions;
      out.push({
        x: catmullRom(p0[0], p1[0], p2[0], p3[0], t),
        y: catmullRom(p0[1], p1[1], p2[1], p3[1], t)
      });
    }
  }
  return out;
}

export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

// Compute the bounding box of a list of {x, y} points.
export function bounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// Cumulative length of a closed polyline (sum of segment lengths, last to first).
export function closedPolylineLength(points) {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}
