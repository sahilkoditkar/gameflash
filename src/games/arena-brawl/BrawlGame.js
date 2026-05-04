// BrawlGame: a tiny local-multiplayer arena brawler.
// 2-4 fighters dash into each other. A successful dash that hits a non-dashing
// opponent (or wins a head-on) deals damage. Last fighter standing scores a
// point and the round restarts. The game proves the platform supports very
// different mechanics on the same engine.

import { Scene } from '../../engine/Scene.js';
import { Fighter } from './Fighter.js';
import { resolveCircles, clampToRectInterior } from '../../engine/physics/Collision.js';

const ARENA = { minX: -400, minY: -260, maxX: 400, maxY: 260 };
const COLORS = ['#ffcc33', '#66e0a3', '#ff6b6b', '#7aa9ff'];

const KB_LAYOUTS = [
  {
    axes: { moveX: ['ArrowLeft', 'ArrowRight'], moveY: ['ArrowUp', 'ArrowDown'] },
    actions: { dash: ['Space', 'Enter'] }
  },
  {
    axes: { moveX: ['KeyA', 'KeyD'], moveY: ['KeyW', 'KeyS'] },
    actions: { dash: ['ShiftLeft', 'KeyF'] }
  }
];

const PAD_LAYOUT = {
  gamepadAxes: { moveX: { axis: 0 }, moveY: { axis: 1 } },
  gamepadActions: { dash: ['a', 'rt'] }
};

export class BrawlGame extends Scene {
  constructor({ players = 2 } = {}) {
    super();
    this.playerCount = Math.max(2, Math.min(4, players));
  }

  async init() {
    const ctx = this.ctx;
    this.fighters = [];
    this.players = [];

    // Build players. First two get keyboard layouts; all get auto-pad.
    for (let i = 0; i < this.playerCount; i++) {
      const binding = {
        keyboard: KB_LAYOUTS[i] || undefined,
        gamepad: 'auto',
        ...PAD_LAYOUT
      };
      this.players.push(ctx.input.createPlayer(binding));
    }
    // Spawn fighters at arena corners.
    const slots = [
      { x: ARENA.minX + 60, y: ARENA.minY + 60 },
      { x: ARENA.maxX - 60, y: ARENA.maxY - 60 },
      { x: ARENA.maxX - 60, y: ARENA.minY + 60 },
      { x: ARENA.minX + 60, y: ARENA.maxY - 60 }
    ];
    for (let i = 0; i < this.playerCount; i++) {
      this.fighters.push(new Fighter({
        x: slots[i].x, y: slots[i].y, color: COLORS[i], name: `P${i + 1}`
      }));
    }

    ctx.renderer.camera.setBounds({
      minX: ARENA.minX - 80, minY: ARENA.minY - 80,
      maxX: ARENA.maxX + 80, maxY: ARENA.maxY + 80
    });
    ctx.renderer.camera.setZoom(1);
    ctx.renderer.camera.snapTo(0, 0);

    // HUD strip
    this._buildHud();
    this.state = 'roundStart';
    this.timer = 1.5;
    this._roundIndex = 1;
    this._renderBanner(`Round ${this._roundIndex}`);
  }

  destroy() {
    if (this.ctx?.input) {
      for (const p of this.players) this.ctx.input.removePlayer(p);
    }
    if (this._hudPanel) this._hudPanel.remove();
    if (this.ctx?.overlayRoot) {
      this.ctx.overlayRoot.replaceChildren();
      this.ctx.overlayRoot.hidden = true;
    }
  }

  _buildHud() {
    const panel = document.createElement('div');
    panel.className = 'hud-panel';
    Object.assign(panel.style, { top: '12px', left: '50%', transform: 'translateX(-50%)' });
    this.ctx.hudRoot.appendChild(panel);
    this._hudPanel = panel;
    this._refreshHud();
  }
  _refreshHud() {
    if (!this._hudPanel) return;
    const items = this.fighters.map((f) =>
      `<span style="color:${f.color}; margin: 0 8px;">${f.name}: ${f.score}♛ · ${'❤'.repeat(Math.max(0, f.hp))}</span>`
    ).join('');
    this._hudPanel.innerHTML = `<div class="value" style="white-space:nowrap;">${items}</div>`;
  }

  update(dt) {
    if (this.state === 'roundStart') {
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 'fighting'; this._clearBanner(); }
      return;
    }
    if (this.state === 'roundOver') {
      this.timer -= dt;
      if (this.timer <= 0) this._beginRound();
      return;
    }

    // Sample inputs.
    for (let i = 0; i < this.fighters.length; i++) {
      const p = this.players[i];
      const f = this.fighters[i];
      const input = {
        moveX: p.axis('moveX'),
        moveY: p.axis('moveY'),
        dash: p.justPressed('dash')
      };
      f.update(dt, input);
      clampToRectInterior(f.body, ARENA.minX + f.body.radius, ARENA.minY + f.body.radius,
                          ARENA.maxX - f.body.radius, ARENA.maxY - f.body.radius, 0.5);
    }

    // Pairwise collision + dash damage.
    const alive = this.fighters.filter((f) => f.hp > 0);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        if (resolveCircles(a.body, b.body, 0.6)) {
          if (a.isDashing() && !b.isDashing()) {
            const dir = { x: a.lastHitDir.x, y: a.lastHitDir.y };
            b.takeHit(dir);
            this.ctx.audio.beep({ freq: 220, duration: 0.1 });
          } else if (b.isDashing() && !a.isDashing()) {
            a.takeHit({ x: b.lastHitDir.x, y: b.lastHitDir.y });
            this.ctx.audio.beep({ freq: 220, duration: 0.1 });
          } else if (a.isDashing() && b.isDashing()) {
            // Both dashing — bounce, no damage.
            this.ctx.audio.beep({ freq: 600, duration: 0.05 });
          }
        }
      }
    }

    this._refreshHud();

    const stillAlive = this.fighters.filter((f) => f.hp > 0);
    if (stillAlive.length <= 1) this._endRound(stillAlive[0]);
  }

  _endRound(winner) {
    this.state = 'roundOver';
    this.timer = 2.0;
    if (winner) winner.score += 1;
    this._renderBanner(winner ? `${winner.name} wins!` : 'Draw');
  }

  _beginRound() {
    // Reset positions/HP.
    const slots = [
      { x: ARENA.minX + 60, y: ARENA.minY + 60 },
      { x: ARENA.maxX - 60, y: ARENA.maxY - 60 },
      { x: ARENA.maxX - 60, y: ARENA.minY + 60 },
      { x: ARENA.minX + 60, y: ARENA.maxY - 60 }
    ];
    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i];
      f.body.x = slots[i].x;
      f.body.y = slots[i].y;
      f.body.vx = 0;
      f.body.vy = 0;
      f.hp = 5;
      f.invuln = 0.5;
      f.dashTimer = 0;
      f.dashCool = 0;
    }
    this._roundIndex += 1;
    this.state = 'roundStart';
    this.timer = 1.2;
    this._renderBanner(`Round ${this._roundIndex}`);
  }

  render(renderer) {
    renderer.clear('#0c0f14');
    renderer.pushWorld();
    const c = renderer.ctx;

    // Arena floor
    c.fillStyle = '#1f2632';
    c.fillRect(ARENA.minX, ARENA.minY, ARENA.maxX - ARENA.minX, ARENA.maxY - ARENA.minY);
    // Arena border
    c.strokeStyle = '#3a3f48';
    c.lineWidth = 6;
    c.strokeRect(ARENA.minX, ARENA.minY, ARENA.maxX - ARENA.minX, ARENA.maxY - ARENA.minY);
    // Center grid
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1;
    for (let gx = ARENA.minX; gx <= ARENA.maxX; gx += 40) {
      c.beginPath(); c.moveTo(gx, ARENA.minY); c.lineTo(gx, ARENA.maxY); c.stroke();
    }
    for (let gy = ARENA.minY; gy <= ARENA.maxY; gy += 40) {
      c.beginPath(); c.moveTo(ARENA.minX, gy); c.lineTo(ARENA.maxX, gy); c.stroke();
    }

    for (const f of this.fighters) f.draw(c);
    renderer.popWorld();
  }

  _renderBanner(text) {
    const root = this.ctx.overlayRoot;
    if (!root) return;
    root.hidden = false;
    root.replaceChildren();
    const card = document.createElement('div');
    card.className = 'overlay-card';
    card.style.background = 'transparent';
    card.style.border = '0';
    card.innerHTML = `<h2 style="font-size:48px;margin:0;">${text}</h2>`;
    root.appendChild(card);
  }
  _clearBanner() {
    const root = this.ctx.overlayRoot;
    if (!root) return;
    root.hidden = true;
    root.replaceChildren();
  }
}
