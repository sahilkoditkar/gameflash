// Scene: minimal lifecycle that any game implements.
// Engines call: init() once, update(dt) at a fixed timestep, render(renderer, alpha) every frame.
// destroy() must release listeners, DOM nodes added to hudRoot/overlayRoot, and any allocations.
// Subclasses receive engine-provided `ctx` (see Engine.context()) and an `engine` reference.

export class Scene {
  constructor() {
    this.engine = null;
    this.ctx = null;
  }
  async init() {}
  update(/* dt */) {}
  render(/* renderer, alpha */) {}
  destroy() {}
}
