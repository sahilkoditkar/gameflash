// AIDriver: drives a Vehicle by steering toward a look-ahead point on the
// centerline and modulating throttle by the curvature of the upcoming track.
// Skill is a single 0..1 dial that scales aggression and corner speed.

export class AIDriver {
  constructor({ vehicle, track, skill = 0.7 }) {
    this.vehicle = vehicle;
    this.track = track;
    this.skill = skill;
  }

  update(/* dt */) {
    const v = this.vehicle;
    const b = v.body;
    const lookDist = 80 + v.speed * 0.45;
    const target = this.track.lookAhead(v.segIndex, v.segT, lookDist);

    // Steering: signed angle between heading and direction to target.
    const dx = target.x - b.x;
    const dy = target.y - b.y;
    const desired = Math.atan2(dy, dx);
    let diff = desired - b.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 1.6));

    // Throttle by curvature ahead.
    const curve = this.track.curvatureAhead(v.segIndex, 5);
    // curve is radians of bend over 5 segments; >1 is a hairpin.
    const corner = Math.min(1, curve / 1.4);
    const throttle = (1 - corner * (1 - 0.35 * this.skill)) * (0.7 + this.skill * 0.3);

    v.setControl({ steer, throttle, handbrake: false });
  }
}
