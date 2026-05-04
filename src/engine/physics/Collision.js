// Collision: a few primitives we need for arcade games.
// All functions are pure — they take values and return values, no side effects on bodies.

import { dist2 } from '../utils/math.js';

// Resolve overlap between two equal-mass circular bodies elastically.
// Mutates positions and velocities. Returns true if a collision was resolved.
export function resolveCircles(a, b, restitution = 0.4) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const r = a.radius + b.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r || d2 === 0) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const overlap = r - d;
  // Positional correction (split by inverse mass).
  const ima = 1 / (a.mass || 1);
  const imb = 1 / (b.mass || 1);
  const sum = ima + imb;
  a.x -= nx * overlap * (ima / sum);
  a.y -= ny * overlap * (ima / sum);
  b.x += nx * overlap * (imb / sum);
  b.y += ny * overlap * (imb / sum);
  // Velocity along normal.
  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn > 0) return true; // separating already
  const j = -(1 + restitution) * vn / sum;
  a.vx -= j * nx * ima;
  a.vy -= j * ny * ima;
  b.vx += j * nx * imb;
  b.vy += j * ny * imb;
  return true;
}

// Reflect a body off an axis-aligned rectangle's interior walls.
// Returns true if a wall was hit.
export function clampToRectInterior(body, minX, minY, maxX, maxY, restitution = 0.5) {
  let hit = false;
  if (body.x - body.radius < minX) { body.x = minX + body.radius; body.vx = -body.vx * restitution; hit = true; }
  else if (body.x + body.radius > maxX) { body.x = maxX - body.radius; body.vx = -body.vx * restitution; hit = true; }
  if (body.y - body.radius < minY) { body.y = minY + body.radius; body.vy = -body.vy * restitution; hit = true; }
  else if (body.y + body.radius > maxY) { body.y = maxY - body.radius; body.vy = -body.vy * restitution; hit = true; }
  return hit;
}

export { dist2 };
