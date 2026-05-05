// Suzuka — fan-made approximation of the figure-8 layout.
// The path crosses itself once at the start/finish area, just like the real
// circuit's bridge. Two distinct loops (north + south) joined at the X.
// Captures Turn 1-2, the Esses, Degner, the hairpin, Spoon, 130R, and the
// chicane back to the pit.

export default {
  id: 'suzuka',
  name: 'Suzuka (JP)',
  region: 'Japan · Mie',
  flavor: 'Figure-8 layout with high-speed Esses, Spoon and 130R.',
  theme: 'forest',
  halfWidth: 46,
  laps: 2,
  decorationDensity: 0.85,
  decorationSeed: 8848,
  controlPoints: [
    // Start/X area, heading NE through the crossing.
    [  -50,   50], [   50,  -50],
    // North loop (clockwise, occupies upper half / negative y)
    [  170, -130], [  300, -200], [  370, -300],
    [  340, -440], [  220, -510], [   60, -510],
    [ -100, -460], [ -240, -360], [ -310, -220],
    [ -290,  -90], [ -180,  -30],
    // Back into X — crossing the start segment at origin.
    [  -50,  -50], [   50,   50],
    // South loop (occupies lower half / positive y)
    [  180,  120], [  290,  200], [  370,  330],
    [  340,  460], [  220,  540], [   60,  550],
    [ -100,  500], [ -240,  410], [ -310,  280],
    [ -300,  140], [ -200,   80]
  ]
};
