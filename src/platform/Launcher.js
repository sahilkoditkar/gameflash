// Launcher: renders the home screen and dispatches to the GameLoader.
// All DOM interaction is here; games never read the launcher.

export class Launcher {
  constructor({ root, registry, onLaunch }) {
    this.root = root;
    this.registry = registry;
    this.onLaunch = onLaunch;
  }

  render() {
    const list = this.registry.list();
    this.root.replaceChildren();
    for (const m of list) {
      const li = document.createElement('li');
      li.className = 'game-card';
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.dataset.gameId = m.id;

      const h2 = document.createElement('h2');
      h2.textContent = m.title;
      const p = document.createElement('p');
      p.textContent = m.description || '';
      const meta = document.createElement('div');
      meta.className = 'meta';
      const playerLabel = m.players
        ? `${m.players.min}${m.players.max && m.players.max !== m.players.min ? '-' + m.players.max : ''} player${(m.players.max || m.players.min) > 1 ? 's' : ''}`
        : '1 player';
      meta.textContent = `${playerLabel} · ${m.controls || 'Keyboard / Gamepad'}`;

      li.append(h2, p, meta);
      li.addEventListener('click', () => this.onLaunch(m.id));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.onLaunch(m.id);
        }
      });
      this.root.append(li);
    }
  }
}
