// Silverstone — fan-made approximation of the GP layout.
// Captures the kidney-shaped outline, the Maggotts/Becketts/Chapel high-speed
// S-section in the middle, and the Hangar straight + Stowe/Vale/Club return.

export default {
  id: 'silverstone',
  name: 'Silverstone (UK)',
  region: 'UK · Northamptonshire',
  flavor: 'Fast sweepers, high-speed S, long straights.',
  theme: 'countryside',
  halfWidth: 50,
  laps: 3,
  decorationDensity: 0.5,
  decorationSeed: 4011,
  controlPoints: [
    // Pit straight (start/finish at first point, going east). All three
    // points share y so the spline runs dead straight through the start
    // line — no drift onto the kerbs at full throttle.
    [ -460,  -45], [ -250,  -45], [    0,  -45],
    [  200,  -25],                                   // Abbey
    [  350,   30], [  450,  100],                    // Farm
    [  500,  220], [  450,  330], [  340,  370],     // Village / Loop
    [  200,  370],                                   // Aintree
    [   40,  340], [ -130,  320], [ -260,  300],    // Wellington
    [ -390,  260], [ -480,  180], [ -490,   80],    // Brooklands / Luffield
    [ -420,    0],                                   // Copse (high-speed right)
    [ -280,   30], [ -150,   80], [  -30,   30], [   90,   80], [  220,   30],  // Maggotts/Becketts/Chapel
    [  340,  -40], [  410, -160],                    // Hangar straight
    [  370, -260],                                   // Stowe
    [  240, -290], [  100, -250], [  -40, -200],    // Vale
    [ -180, -160], [ -310, -130],                    // Club entry
    [ -400, -110],                                    // Club apex
    // Final-corner exit — placed directly south of the pit straight
    // start so the closing segment runs almost due north, giving a clean
    // ~90° entry into the pit straight (was a ~165° U-turn).
    [ -460,  -85]
  ]
};
