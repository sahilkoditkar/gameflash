// AIDriver: drives a Vehicle by steering toward a look-ahead point on the
// track and modulating throttle by the curvature of the upcoming track.
//
// Each driver has its own personality:
//   - skill         (0..1): aggression and corner speed
//   - lineOffset    (world units, signed): preferred lateral offset from the
//                   centerline; positive = right of travel direction. This is
//                   what makes drivers take *different* racing lines.
//   - lookahead     (world units, base): how far ahead the driver looks; faster
//                   speeds and higher skill increase this dynamically.
//   - cornerCaution (0..1): how much the driver eases off into corners.

export class AIDriver {
  constructor({ vehicle, track, skill = 0.7, lineOffset = 0, lookahead = 80, cornerCaution = 0.5 }) {
    this.vehicle = vehicle;
    this.track = track;
    this.skill = skill;
    this.lineOffset = lineOffset;
    this.lookahead = lookahead;
    this.cornerCaution = cornerCaution;
  }

  update(/* dt */) {
    const v = this.vehicle;
    const b = v.body;

    // Slack the lateral offset to ~0 inside tight corners so AIs can still hit
    // the apex of a hairpin instead of clipping through hay bales.
    const curveImmediate = this.track.curvatureAhead(v.segIndex, 3);
    const offsetScale = Math.max(0.1, 1 - Math.min(1, curveImmediate / 0.9));
    const offset = this.lineOffset * offsetScale;

    const lookDist = this.lookahead + v.speed * (0.3 + 0.25 * this.skill);
    const target = this.track.lookAhead(v.segIndex, v.segT, lookDist, offset);

    // Steering: signed angle between heading and direction to target.
    const dx = target.x - b.x;
    const dy = target.y - b.y;
    const desired = Math.atan2(dy, dx);
    let diff = desired - b.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * (1.4 + this.skill * 0.4)));

    // Throttle by curvature ahead of the *current* segment.
    const curveAhead = this.track.curvatureAhead(v.segIndex, 5);
    const corner = Math.min(1, curveAhead / 1.4);
    const ease = corner * this.cornerCaution * (1 - 0.4 * this.skill);
    const throttle = Math.max(-0.4, (1 - ease) * (0.7 + this.skill * 0.3));

    v.setControl({ steer, throttle, handbrake: false });
  }
}
