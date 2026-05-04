// HUD: per-player DOM panels for lap, position, speed.
// We use DOM (not canvas) for HUD because it gets crisp text essentially free
// and lets us style with CSS. Layout positions are CSS classes set per player.

export class HUD {
  constructor(root) {
    this.root = root;
    this.panels = new Map(); // playerKey -> { panel, lapEl, posEl, speedEl, infoEl }
  }

  ensure(playerKey, opts = {}) {
    let entry = this.panels.get(playerKey);
    if (entry) return entry;
    const panel = document.createElement('div');
    panel.className = 'hud-panel';
    Object.assign(panel.style, opts.position || { top: '12px', left: '12px' });

    panel.innerHTML = `
      <div class="label" data-role="title"></div>
      <div class="value"><span data-role="lap">1/3</span> · <span data-role="pos">P1</span></div>
      <div class="label" data-role="info"></div>
      <div class="value"><span data-role="speed">0</span> kph</div>
    `;
    this.root.appendChild(panel);
    entry = {
      panel,
      titleEl: panel.querySelector('[data-role="title"]'),
      lapEl: panel.querySelector('[data-role="lap"]'),
      posEl: panel.querySelector('[data-role="pos"]'),
      infoEl: panel.querySelector('[data-role="info"]'),
      speedEl: panel.querySelector('[data-role="speed"]')
    };
    this.panels.set(playerKey, entry);
    return entry;
  }

  update(playerKey, data) {
    const e = this.panels.get(playerKey);
    if (!e) return;
    if (data.title != null) e.titleEl.textContent = data.title;
    if (data.lap != null) e.lapEl.textContent = data.lap;
    if (data.pos != null) e.posEl.textContent = data.pos;
    if (data.info != null) e.infoEl.textContent = data.info;
    if (data.speed != null) e.speedEl.textContent = String(Math.round(data.speed));
  }

  destroy() {
    for (const e of this.panels.values()) e.panel.remove();
    this.panels.clear();
  }
}
