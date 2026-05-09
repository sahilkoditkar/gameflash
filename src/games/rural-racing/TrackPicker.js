// TrackPicker: an overlay that lists available tracks (with SVG previews)
// and resolves a Promise once the player chooses one.
//
// The preview is generated from the same Catmull-Rom math the runtime track
// uses, so what you see is what you race.

import { closedCenterline, bounds, closedPolylineLength } from '../../engine/utils/spline.js';
import { TRACKS } from './tracks/index.js';

export class TrackPicker {
  constructor(overlayRoot) {
    this.root = overlayRoot;
    this._dispose = null;
  }

  show() {
    return new Promise((resolve) => {
      this.root.hidden = false;
      this.root.replaceChildren();
      const card = document.createElement('div');
      card.className = 'overlay-card track-picker';
      card.style.maxWidth = '900px';
      card.innerHTML = `<h2>Pick a circuit</h2>
        <p>Choose a track. Real-circuit layouts are fan-made approximations.</p>
        <div class="track-grid"></div>`;
      const grid = card.querySelector('.track-grid');
      for (const t of TRACKS) {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'track-tile';
        tile.dataset.id = t.id;
        tile.appendChild(this._makePreview(t));
        const meta = document.createElement('div');
        meta.className = 'track-meta';
        meta.innerHTML = `
          <strong></strong>
          <span class="region"></span>
          <p class="flavor"></p>
          <span class="stats"></span>`;
        meta.querySelector('strong').textContent = t.name;
        meta.querySelector('.region').textContent = t.region || '';
        meta.querySelector('.flavor').textContent = t.flavor || '';
        const len = Math.round(closedPolylineLength(closedCenterline(t.controlPoints, 14)));
        meta.querySelector('.stats').textContent = `${t.laps} laps · ${len}u perimeter · ${t.theme}`;
        tile.appendChild(meta);
        tile.addEventListener('click', () => choose(t.id));
        grid.appendChild(tile);
      }
      this.root.appendChild(card);

      const onKey = (e) => {
        if (e.code === 'Escape') choose(null);
      };
      window.addEventListener('keydown', onKey);

      const choose = (id) => {
        if (this._dispose) return;
        this._dispose = () => {
          window.removeEventListener('keydown', onKey);
          this.root.hidden = true;
          this.root.replaceChildren();
        };
        this._dispose();
        resolve(id);
      };
    });
  }

  // Build an SVG preview of the track shape.
  _makePreview(track) {
    const W = 220, H = 130, PAD = 12;
    const pts = closedCenterline(track.controlPoints, 14);
    const b = bounds(pts);
    const trackW = b.maxX - b.minX;
    const trackH = b.maxY - b.minY;
    const s = Math.min((W - PAD * 2) / trackW, (H - PAD * 2) / trackH);
    const ox = PAD + ((W - PAD * 2) - trackW * s) / 2;
    const oy = PAD + ((H - PAD * 2) - trackH * s) / 2;
    let d = '';
    for (let i = 0; i < pts.length; i++) {
      const px = ox + (pts[i].x - b.minX) * s;
      const py = oy + (pts[i].y - b.minY) * s;
      d += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ',' + py.toFixed(1);
    }
    d += 'Z';
    // Mark start dot.
    const startX = ox + (pts[0].x - b.minX) * s;
    const startY = oy + (pts[0].y - b.minY) * s;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'track-preview');
    const bg = document.createElementNS(svgNS, 'rect');
    bg.setAttribute('width', String(W));
    bg.setAttribute('height', String(H));
    bg.setAttribute('fill', '#0a0a0a');
    svg.appendChild(bg);
    const outer = document.createElementNS(svgNS, 'path');
    outer.setAttribute('d', d);
    outer.setAttribute('fill', 'none');
    outer.setAttribute('stroke', '#3d3d3d');
    outer.setAttribute('stroke-width', '12');
    outer.setAttribute('stroke-linejoin', 'round');
    outer.setAttribute('stroke-linecap', 'round');
    svg.appendChild(outer);
    const inner = document.createElementNS(svgNS, 'path');
    inner.setAttribute('d', d);
    inner.setAttribute('fill', 'none');
    inner.setAttribute('stroke', '#f59e0b');
    inner.setAttribute('stroke-width', '1.2');
    inner.setAttribute('stroke-dasharray', '3 4');
    svg.appendChild(inner);
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', startX.toFixed(1));
    dot.setAttribute('cy', startY.toFixed(1));
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', '#34d399');
    svg.appendChild(dot);
    return svg;
  }
}
