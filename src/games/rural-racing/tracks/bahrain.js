// Bahrain (Sakhir) — fan-made approximation.
// Long start straight, Turn 1 right, slow Turn 4 right hairpin, technical
// infield, and a fast back section. Desert palette.

export default {
  id: 'bahrain',
  name: 'Bahrain (BH)',
  region: 'Bahrain · Sakhir',
  flavor: 'Long straights, slow hairpin, technical infield.',
  theme: 'desert',
  halfWidth: 48,
  laps: 3,
  decorationDensity: 0.6,
  decorationSeed: 2004,
  controlPoints: [
    // Pit straight
    [    0,    0], [  220,   10], [  430,   30],
    // Turn 1 hard right
    [  530,   80], [  570,  170],
    // Turns 2-3
    [  530,  280], [  450,  330],
    // Turn 4 — slow right hairpin
    [  470,  430], [  390,  500], [  290,  470],
    // Turns 5-6
    [  200,  410], [  100,  390],
    // Turns 7-8 (right then left)
    [  -10,  430], [ -110,  470], [ -210,  430],
    // Turns 9-10
    [ -300,  370], [ -390,  290], [ -440,  180],
    // Turn 11 (left)
    [ -460,   60],
    // Turns 12-13 (right back to pit)
    [ -400,  -50], [ -270,  -90], [ -130,  -60]
  ]
};
