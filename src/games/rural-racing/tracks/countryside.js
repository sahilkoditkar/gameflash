// "Countryside" — original handmade rural loop. Default track.
// Layout reads counter-clockwise from the start/finish line:
//
//   start straight  →  fast right sweeper  →  S-chicane  →
//   long left  →  tight hairpin  →  uphill kink  →  back to start

export default {
  id: 'countryside',
  name: 'Countryside',
  region: 'Original',
  flavor: 'Mixed sweepers, an S-chicane, and a tight hairpin.',
  theme: 'countryside',
  halfWidth: 56,
  laps: 3,
  decorationDensity: 0.55,
  decorationSeed: 1337,
  controlPoints: [
    [    0,     0],
    [  220,   -10], [  430,   -25],
    [  610,    30], [  730,   140], [  760,   280],
    [  690,   400], [  560,   460], [  450,   400],
    [  340,   470], [  170,   520], [  -50,   540],
    [ -260,   500], [ -420,   420],
    [ -520,   280], [ -510,   120], [ -420,    30],
    [ -280,   -10], [ -140,   -30]
  ]
};
