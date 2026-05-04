// AssetManager: lazy load + cache for images, audio buffers, and JSON.
// All loads are deduplicated — concurrent calls for the same URL share a Promise.
// Releasing assets is explicit (release / clear) so we don't churn the cache.

export class AssetManager {
  constructor() {
    this._images = new Map();   // url -> { promise, value }
    this._json = new Map();
    this._audio = new Map();
  }

  loadImage(url) {
    let entry = this._images.get(url);
    if (entry) return entry.promise;
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';
      img.onload = () => { entry.value = img; resolve(img); };
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
    entry = { promise, value: null };
    this._images.set(url, entry);
    return promise;
  }

  loadJson(url) {
    let entry = this._json.get(url);
    if (entry) return entry.promise;
    const promise = fetch(url, { credentials: 'omit' }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return r.json();
    });
    entry = { promise, value: null };
    promise.then((v) => (entry.value = v)).catch(() => {});
    this._json.set(url, entry);
    return promise;
  }

  loadAudioBuffer(url, audioCtx) {
    let entry = this._audio.get(url);
    if (entry) return entry.promise;
    const promise = fetch(url, { credentials: 'omit' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        return r.arrayBuffer();
      })
      .then((buf) => audioCtx.decodeAudioData(buf));
    entry = { promise, value: null };
    promise.then((v) => (entry.value = v)).catch(() => {});
    this._audio.set(url, entry);
    return promise;
  }

  release(url) {
    this._images.delete(url);
    this._json.delete(url);
    this._audio.delete(url);
  }

  clear() {
    this._images.clear();
    this._json.clear();
    this._audio.clear();
  }
}
