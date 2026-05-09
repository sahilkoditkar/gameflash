// Vehicle: arcade-style top-down car physics.
//
// We split velocity into a forward (along the heading) and lateral (sideways)
// component every step. Lateral velocity decays fast — that's the "grip" that
// makes the car go where it points. Forward velocity decays slowly (rolling
// drag). Steering rate scales with speed so the car turns sharper when slower.
//
// On grass (off-track) grip is reduced and drag increased, so the car drifts
// outward and slows down. This keeps players honest without invisible walls.

import { Body } from '../../engine/physics/Body.js';
import { clamp } from '../../engine/utils/math.js';

const MAX_SPEED = 360;          // world units / sec
const REVERSE_SPEED = 120;
const ENGINE_FORCE = 520;       // accel
const BRAKE_FORCE = 800;
const ROLLING_DRAG = 0.4;       // (lower = less drag)
const STEER_RATE = 2.4;         // rad/sec at full lock at full speed
const STEER_SPEED_FACTOR = 0.55;

export class Vehicle {
  constructor({ x, y, angle, color = '#fbbf24', name = 'Car', isHuman = false, gripMul = 1 }) {
    this.body = new Body({ x, y, angle, radius: 14, mass: 1 });
    this.color = color;
    this.name = name;
    this.isHuman = isHuman;
    // Grip multiplier: 1 = clear, <1 = wet (less lateral grip = more drift).
    this.gripMul = Math.max(0.2, Math.min(1.5, gripMul));

    this.throttle = 0;     // -1..1
    this.steer = 0;        // -1..1
    this.handbrake = false;

    this.lap = 0;
    this.segIndex = 0;
    this.segT = 0;
    this.progress = 0;     // monotonic-ish, used for ranking
    this.finished = false;
    this.finishTime = 0;
    this.offTrack = false;
    this.totalRaceTime = 0;
    this.bestLapTime = Infinity;
    this.lastLapStart = 0;
    this.lateralSpeed = 0;        // signed sideways velocity, set by update()
  }

  // Local wheel positions: rear-left, rear-right, front-left, front-right.
  static WHEELS_LOCAL = [
    { x: -13, y: -10, rear: true  },
    { x: -13, y:  10, rear: true  },
    { x:   8, y: -10, rear: false },
    { x:   8, y:  10, rear: false }
  ];

  // Return the four wheels in world coordinates.
  getWheelPositions() {
    const cosA = Math.cos(this.body.angle);
    const sinA = Math.sin(this.body.angle);
    const out = [];
    for (const w of Vehicle.WHEELS_LOCAL) {
      out.push({
        x: this.body.x + w.x * cosA - w.y * sinA,
        y: this.body.y + w.x * sinA + w.y * cosA,
        rear: w.rear
      });
    }
    return out;
  }

  get speed() {
    const b = this.body;
    return Math.hypot(b.vx, b.vy);
  }
  get forwardSpeed() {
    const b = this.body;
    return b.vx * Math.cos(b.angle) + b.vy * Math.sin(b.angle);
  }

  setControl({ steer = 0, throttle = 0, handbrake = false }) {
    this.steer = clamp(steer, -1, 1);
    this.throttle = clamp(throttle, -1, 1);
    this.handbrake = !!handbrake;
  }

  update(dt, track) {
    const b = this.body;
    const cosA = Math.cos(b.angle);
    const sinA = Math.sin(b.angle);

    // Decompose velocity into forward / lateral components.
    let vf = b.vx * cosA + b.vy * sinA;
    let vl = b.vx * -sinA + b.vy * cosA;

    // Throttle: positive accelerates forward (capped at MAX_SPEED),
    // negative engages brakes (and once stopped, reverses).
    if (this.throttle > 0) {
      vf += this.throttle * ENGINE_FORCE * dt;
      if (vf > MAX_SPEED) vf = MAX_SPEED;
    } else if (this.throttle < 0) {
      if (vf > 0) {
        vf += this.throttle * BRAKE_FORCE * dt;
        if (vf < 0) vf = 0;
      } else {
        vf += this.throttle * ENGINE_FORCE * 0.5 * dt;
        if (vf < -REVERSE_SPEED) vf = -REVERSE_SPEED;
      }
    }

    // Off-track penalty: extra drag, reduced grip.
    let dragK = ROLLING_DRAG;
    // Base lateral grip — smaller is stickier. Wet weather scales it up.
    let gripDecay = 0.0008 / this.gripMul;
    let topSpeedFactor = 1;
    this.offTrack = false;
    if (track) {
      const proj = track.project(b.x, b.y, this.segIndex, 4);
      this.segIndex = proj.segIndex;
      this.segT = proj.t;
      if (track.isOffTrack(proj.distance)) {
        this.offTrack = true;
        dragK = 1.6;
        gripDecay = 0.05;
        topSpeedFactor = 0.55;
        if (vf > MAX_SPEED * topSpeedFactor) vf = MAX_SPEED * topSpeedFactor;
      }
    }

    // Handbrake: kills grip so car slides.
    if (this.handbrake) gripDecay = 0.2;

    // Steering: angular velocity is steer * rate * f(speed).
    const speedAbs = Math.abs(vf);
    const sf = STEER_SPEED_FACTOR + (1 - STEER_SPEED_FACTOR) * Math.min(1, speedAbs / 100);
    b.angularVelocity = this.steer * STEER_RATE * sf * Math.sign(vf || 1);
    b.angle += b.angularVelocity * dt;

    // Apply drags. Lateral grip = decay toward zero.
    vf -= vf * dragK * dt;
    vl *= Math.pow(gripDecay, dt);
    this.lateralSpeed = vl;

    // Recompose.
    const cosB = Math.cos(b.angle);
    const sinB = Math.sin(b.angle);
    b.vx = cosB * vf + -sinB * vl;
    b.vy = sinB * vf + cosB * vl;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-16, -10 + 3, 32, 20);
    // Body
    ctx.fillStyle = this.color;
    ctx.fillRect(-16, -10, 32, 20);
    // Windshield
    ctx.fillStyle = 'rgba(20, 28, 40, 0.85)';
    ctx.fillRect(2, -8, 8, 16);
    // Front bumper hint
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(13, -10, 3, 20);
    // Wheels
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(-13, -12, 6, 4);
    ctx.fillRect(-13, 8, 6, 4);
    ctx.fillRect(8, -12, 6, 4);
    ctx.fillRect(8, 8, 6, 4);
    ctx.restore();
  }
}
