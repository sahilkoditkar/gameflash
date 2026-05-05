// Miami International Autodrome — fan-made approximation.
// Captures the long start straight + Turn 1 right, the back straight, the
// stadium "switchback" zig-zag in the middle, and the chicane near the finish.

export default {
  id: 'miami',
  name: 'Miami (US)',
  region: 'USA · Florida',
  flavor: 'Stadium chicanes, technical infield, two long straights.',
  theme: 'urban',
  halfWidth: 48,
  laps: 3,
  decorationDensity: 0.7,
  decorationSeed: 2024,
  controlPoints: [
    // Start straight
    [    0,     0], [  150,   -10], [  300,   -20],
    // Turn 1 (right) and Turns 2-3 (right/left chicane)
    [  430,    20], [  470,   100], [  410,   170],
    // Back straight (going west)
    [  280,   200], [  120,   210], [   20,   260],
    // Stadium switchbacks
    [  -90,   320], [ -150,   270], [  -90,   210],
    [ -180,   180], [ -110,   110], [ -200,    50],
    // Turn 11 (right) onto long straight south
    [ -240,   -20], [ -260,  -120], [ -240,  -210],
    // Hairpin (turns 13-14)
    [ -160,  -260], [  -50,  -250],
    // Chicane (turns 16-17) on the way home
    [   60,  -200], [  140,  -240], [  220,  -200],
    // Final corners back to start
    [  280,  -130], [  220,   -50], [  100,   -30]
  ]
};
