// Tracks registry. The order here is the order they appear in the picker
// and the default order of the championship.

import countryside from './countryside.js';
import silverstone from './silverstone.js';
import spa from './spa.js';
import miami from './miami.js';
import monaco from './monaco.js';
import suzuka from './suzuka.js';
import monza from './monza.js';
import imola from './imola.js';
import bahrain from './bahrain.js';

export const TRACKS = [
  countryside,
  silverstone,
  spa,
  miami,
  monaco,
  suzuka,
  monza,
  imola,
  bahrain
];

export function findTrackById(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
