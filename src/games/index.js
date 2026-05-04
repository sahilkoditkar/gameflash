// Game manifest list. Add a new game by importing its manifest(s) and pushing
// them into this array — no other registration step needed.
//
// Each manifest's `load()` does a dynamic import so the game's code stays out
// of the initial bundle until the user actually launches it. A module may
// export a single manifest or an array of related manifests (e.g. Solo + Versus).

import ruralRacing from './rural-racing/index.js';
import arenaBrawl from './arena-brawl/index.js';

const all = [];
for (const m of [ruralRacing, arenaBrawl]) {
  if (Array.isArray(m)) all.push(...m);
  else all.push(m);
}
export default all;
