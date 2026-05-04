// GameLoader: drives the load -> createScene -> setScene transition.
// Caches the loaded module per game so subsequent launches don't re-import.
// Loader is an isolation point: if a game throws during load, the platform
// catches the error and reports it instead of crashing the whole shell.

export class GameLoader {
  constructor(engine, registry) {
    this.engine = engine;
    this.registry = registry;
    this._loaded = new Map(); // id -> module
  }

  async launch(id) {
    const manifest = this.registry.get(id);
    if (!manifest) throw new Error(`Unknown game: ${id}`);
    let mod = this._loaded.get(id);
    if (!mod) {
      mod = await manifest.load();
      if (!mod || typeof mod.createScene !== 'function') {
        throw new Error(`Game "${id}" did not export createScene(ctx)`);
      }
      this._loaded.set(id, mod);
    }
    const scene = mod.createScene(this.engine.context());
    await this.engine.setScene(scene);
    return manifest;
  }
}
