// Body: minimal kinematic body with position, angle, velocity, angular velocity.
// Used both for vehicles (custom integration) and arcade-style entities.
// We don't ship a generic rigid-body simulation — games drive forces directly.

export class Body {
  constructor({ x = 0, y = 0, angle = 0, radius = 12, mass = 1 } = {}) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.angularVelocity = 0;
    this.radius = radius;
    this.mass = mass;
  }

  integrate(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.angularVelocity * dt;
  }
}
