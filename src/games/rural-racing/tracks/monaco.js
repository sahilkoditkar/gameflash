// Monaco — fan-made approximation of the street circuit.
// In real life Monaco crosses over itself at the tunnel; the 2D plan is
// untangled here so the layout is a simple non-intersecting loop while
// preserving Sainte Devote, Beau Rivage, Casino Square, the famous Hairpin,
// the Tunnel run, the Nouvelle Chicane, Tabac, the Swimming Pool, Rascasse,
// and Anthony Noghes.

export default {
  id: 'monaco',
  name: 'Monaco (MC)',
  region: 'Monte Carlo',
  flavor: 'Slowest hairpin in the world, swimming pool chicane, barriers everywhere.',
  theme: 'street',
  halfWidth: 36,
  laps: 4,
  decorationDensity: 1.0,
  decorationSeed: 1929,
  controlPoints: [
    // Start straight (Boulevard Albert I)
    [    0,     0], [  120,     0], [  220,     0],
    // Sainte Devote (right)
    [  300,    30], [  330,    90],
    // Beau Rivage climb
    [  330,   180],
    // Massenet, Casino Square
    [  300,   260], [  220,   290], [  120,   300], [   30,   290],
    // Mirabeau (right), Hairpin
    [  -40,   270], [  -80,   240], [ -110,   220], [ -100,   190], [  -70,   190], [  -40,   210],
    // Portier, Tunnel (in 2D this is just a fast curve)
    [   30,   230], [  100,   230], [  180,   210], [  240,   180], [  290,   150],
    // Nouvelle Chicane (right-left)
    [  320,   120], [  300,    80],
    // Tabac (left)
    [  260,    50],
    // Swimming Pool chicane
    [  220,    90], [  170,   100], [  130,    70],
    // La Rascasse (tight right)
    [   80,    60], [   30,    40],
    // Anthony Noghes (right onto pit straight)
    [  -30,    10]
  ]
};
