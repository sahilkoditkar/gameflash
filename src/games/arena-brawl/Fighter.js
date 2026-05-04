// Fighter: top-down arena combatant. Free movement, dash on action button.
// Uses the engine's Body for position; collision is resolved by the scene.

import { Body } from '../../engine/physics/Body.js';

const MOVE_ACCEL = 800;
const MAX_SPEED = 220;
const DRAG = 4.5;        // higher = stops faster
const DASH_SPEED = 480;
const DASH_DURATION = 0.18;
const DASH_COOLDOWN = 0.6;

export class Fighter {
  constructor({ x, y, color, name }) {
    this.body = new Body({ x, y, radius: 18, mass: 1 });
    this.color = color;
    this.name = name;
    this.hp = 5;
    this.score = 0;
    this.dashTimer = 0;
    this.dashCool = 0;
    this.lastHitDir = { x: 1, y: 0 };
    this.invuln = 0;
  }

  update(dt, input) {
    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      // Locked velocity during dash.
      this.body.vx = this.lastHitDir.x * DASH_SPEED;
      this.body.vy = this.lastHitDir.y * DASH_SPEED;
    } else {
      // Accelerate toward input direction.
      this.body.vx += mx * MOVE_ACCEL * dt;
      this.body.vy += my * MOVE_ACCEL * dt;
      // Cap speed.
      const sp = Math.hypot(this.body.vx, this.body.vy);
      if (sp > MAX_SPEED) {
        this.body.vx *= MAX_SPEED / sp;
        this.body.vy *= MAX_SPEED / sp;
      }
      // Drag.
      const k = Math.exp(-DRAG * dt);
      this.body.vx *= k;
      this.body.vy *= k;
      // Track facing.
      if (mx !== 0 || my !== 0) {
        const l = Math.hypot(mx, my) || 1;
        this.lastHitDir.x = mx / l;
        this.lastHitDir.y = my / l;
      }
    }

    if (this.dashCool > 0) this.dashCool -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    if (input.dash && this.dashCool <= 0 && this.dashTimer <= 0) {
      this.dashTimer = DASH_DURATION;
      this.dashCool = DASH_COOLDOWN;
    }

    this.body.integrate(dt);
  }

  isDashing() { return this.dashTimer > 0; }

  takeHit(fromDir) {
    if (this.invuln > 0) return false;
    this.hp -= 1;
    this.invuln = 0.6;
    // Knockback.
    this.body.vx += fromDir.x * 260;
    this.body.vy += fromDir.y * 260;
    return true;
  }

  draw(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.x, b.y);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 4, b.radius, b.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body
    const flash = this.invuln > 0 && (Math.floor(this.invuln * 20) % 2 === 0);
    ctx.fillStyle = flash ? '#fff' : this.color;
    ctx.beginPath();
    ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
    ctx.fill();
    // Facing indicator
    ctx.strokeStyle = '#0c0f14';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(this.lastHitDir.x * b.radius, this.lastHitDir.y * b.radius);
    ctx.stroke();
    if (this.isDashing()) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, b.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
