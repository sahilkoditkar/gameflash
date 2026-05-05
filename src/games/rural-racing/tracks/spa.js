// Spa-Francorchamps — fan-made approximation.
// Captures La Source hairpin, the Eau Rouge / Raidillon zigzag, the long
// Kemmel-style straight, Pouhon-style sweeper, and the Bus Stop chicane.

export default {
  id: 'spa',
  name: 'Spa-Francorchamps (BE)',
  region: 'Belgium · Ardennes',
  flavor: 'Hairpin, Eau Rouge climb, Kemmel straight, Bus Stop.',
  theme: 'forest',
  halfWidth: 52,
  laps: 2,
  decorationDensity: 0.85,
  decorationSeed: 7321,
  controlPoints: [
    // Start straight (east), pit complex
    [ -280,   400], [ -120,   410], [   60,   420],
    // La Source (very tight right hairpin)
    [  170,   400], [  220,   320], [  170,   260], [   80,   260],
    // Eau Rouge dive (left), Raidillon climb (right)
    [    0,   210], [  -40,   140], [   30,    50],
    // Kemmel straight, going east
    [  140,    20], [  290,    10], [  430,    20],
    // Les Combes (S-section)
    [  500,    70], [  520,   140], [  470,   180], [  520,   230],
    // Bruxelles & approach to Pouhon
    [  580,   210], [  620,   140],
    // Pouhon (long sweeping left)
    [  640,    40], [  620,   -70], [  560,  -150],
    // Fagnes (S)
    [  470,  -180], [  370,  -160], [  280,  -200],
    // Stavelot (right)
    [  170,  -240], [   50,  -240],
    // Climb out
    [  -60,  -210], [ -160,  -160],
    // Blanchimont (very fast left)
    [ -240,   -80], [ -280,    30],
    // Bus Stop chicane (right-left-right)
    [ -290,   140], [ -230,   200], [ -290,   260], [ -260,   320],
    // Back onto pit straight
    [ -300,   380]
  ]
};
