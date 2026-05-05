// Tracks registry. The order here is the order they appear in the picker.

import countryside from './countryside.js';
import silverstone from './silverstone.js';
import spa from './spa.js';
import miami from './miami.js';
import monaco from './monaco.js';

export const TRACKS = [countryside, silverstone, spa, miami, monaco];

export function findTrackById(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
