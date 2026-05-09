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
    // Pit straight (start/finish at first point, going east). Dead-straight
    // y so the spline doesn't drift the car onto the kerbs at full pace.
    [ -120,   -10], [   30,   -10], [  180,   -10], [  330,   -10],
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
    // Sweep back across the infield toward the pit straight
    [  240,  -130], [  180,   -50], [   60,    20],
    // Final corner — placed south-of-and-slightly-west-of the pit straight
    // start so the closing segment runs north into the start line, giving
    // a ~110° entry instead of the previous ~165° U-turn.
    [ -120,    40]
  ]
};
