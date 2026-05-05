// SkidLayer: a fading trail of short line segments emitted under the wheels.
// We hold them as a flat ring buffer of {x1,y1,x2,y2,age,color,alpha0} and
// draw them in world space behind the cars.
//
// The cap (`MAX`) limits memory; once full the oldest segments are reused.
// Aging happens in update(); rendering reads `age` for fade.

const MAX = 3000;
const MAX_AGE = 7.0;          // seconds before a segment fully fades

export class SkidLayer {
  constructor() {
    this.segs = new Array(MAX);
    for (let i = 0; i < MAX; i++) this.segs[i] = null;
    this.head = 0;
    this.count = 0;
  }

  emit(x1, y1, x2, y2, color = '#1a1d22', alpha0 = 0.55) {
    // Skip degenerate segments (no movement).
    const dx = x2 - x1, dy = y2 - y1;
    if (dx * dx + dy * dy < 0.5) return;
    this.segs[this.head] = { x1, y1, x2, y2, age: 0, color, alpha0 };
    this.head = (this.head + 1) % MAX;
    if (this.count < MAX) this.count++;
  }

  update(dt) {
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      if (s) s.age += dt;
    }
  }

  draw(ctx) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      if (!s) continue;
      if (s.age >= MAX_AGE) { this.segs[i] = null; continue; }
      const a = s.alpha0 * (1 - s.age / MAX_AGE);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    for (let i = 0; i < this.segs.length; i++) this.segs[i] = null;
    this.head = 0;
    this.count = 0;
  }
}
