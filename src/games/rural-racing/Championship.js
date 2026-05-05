// Championship: career-mode state — the season, the standings, and a
// localStorage adapter so progress persists across reloads.
//
// State shape:
//   {
//     version: 1,
//     trackOrder: [trackId, ...],
//     currentRaceIndex: number,
//     standings: { driverName: points },
//     finishedRaces: [ { trackId, results: [{name, finishTime, lap, color}] } ],
//     player: { device, color, name }
//   }
//
// Points use the F1 system (top 10 finishers): 25, 18, 15, 12, 10, 8, 6, 4, 2, 1.

const STORAGE_KEY = 'gameflash:rural-racing:championship';
const VERSION = 1;
const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export const DEFAULT_SEASON = [
  'countryside',
  'silverstone',
  'monza',
  'spa',
  'imola',
  'suzuka',
  'monaco',
  'bahrain',
  'miami'
];

export const AI_DRIVER_NAMES = ['Reiner', 'Marlow', 'Pippa', 'Oso', 'Verity', 'Ash', 'Zeb', 'Cleo'];

export class Championship {
  constructor(state) {
    this.state = state;
  }

  static load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== VERSION) return null;
      return new Championship(parsed);
    } catch (_) {
      return null;
    }
  }

  static start(player, trackOrder = DEFAULT_SEASON) {
    // Initial standings: human + AI drivers all start at 0.
    const standings = {};
    standings[player.name || 'You'] = 0;
    for (const a of AI_DRIVER_NAMES) standings[a] = 0;
    const state = {
      version: VERSION,
      trackOrder: trackOrder.slice(),
      currentRaceIndex: 0,
      standings,
      finishedRaces: [],
      player
    };
    return new Championship(state);
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (_) { /* localStorage unavailable / quota — ignore */ }
  }

  static clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  isComplete() { return this.state.currentRaceIndex >= this.state.trackOrder.length; }
  raceCount() { return this.state.trackOrder.length; }
  raceIndex() { return this.state.currentRaceIndex; }
  currentTrackId() { return this.state.trackOrder[this.state.currentRaceIndex]; }
  player() { return this.state.player; }

  // Apply finish positions to standings. `results` is sorted best-to-worst by
  // finish: [{name, finishTime, lap, color}].
  recordRace(results) {
    const trackId = this.currentTrackId();
    for (let i = 0; i < results.length; i++) {
      const points = F1_POINTS[i] || 0;
      const name = results[i].name;
      this.state.standings[name] = (this.state.standings[name] || 0) + points;
    }
    this.state.finishedRaces.push({ trackId, results });
  }

  advance() {
    this.state.currentRaceIndex += 1;
  }

  // Return standings as a sorted array: [{ name, points, color }, ...]
  // Color is taken from the most recent race the driver was in (so the human
  // shows their chosen colour).
  standingsSorted() {
    const colorByName = new Map();
    for (const r of this.state.finishedRaces) {
      for (const d of r.results) colorByName.set(d.name, d.color);
    }
    if (this.state.player) colorByName.set(this.state.player.name, this.state.player.color.hex);
    const arr = Object.entries(this.state.standings)
      .map(([name, points]) => ({ name, points, color: colorByName.get(name) || '#999' }));
    arr.sort((a, b) => b.points - a.points);
    return arr;
  }
}
