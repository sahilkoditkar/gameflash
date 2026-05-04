// GameRegistry: a manifest of installed games + a lazy loader hook.
//
// A game manifest is a plain object:
//   { id, title, description, tags, players: { min, max }, controls, load }
// where `load` is an async function returning an object with a `createScene(ctx)`
// factory. The registry never imports the game module itself — discovery is
// driven by the manifest list, and the dynamic import lives on the manifest.

export class GameRegistry {
  constructor() {
    this._games = new Map();
    this._order = [];
  }

  register(manifest) {
    if (!manifest || typeof manifest.id !== 'string' || !manifest.id) {
      throw new Error('GameRegistry.register: manifest.id is required');
    }
    if (this._games.has(manifest.id)) {
      throw new Error(`GameRegistry: duplicate game id "${manifest.id}"`);
    }
    if (typeof manifest.load !== 'function') {
      throw new Error(`GameRegistry: game "${manifest.id}" missing load() function`);
    }
    this._games.set(manifest.id, Object.freeze({ ...manifest }));
    this._order.push(manifest.id);
  }

  list() {
    return this._order.map((id) => this._games.get(id));
  }
  get(id) { return this._games.get(id) || null; }
}
