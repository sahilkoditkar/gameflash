// Monza — fan-made approximation of the high-speed temple.
// Captures the long pit straight, first chicane, Curva Grande, second
// chicane (Roggia), the two Lesmos, the back straight with Variante Ascari,
// and the Parabolica returning to the pit.

export default {
  id: 'monza',
  name: 'Monza (IT)',
  region: 'Italy · Lombardy',
  flavor: 'Long straights, three chicanes, Parabolica.',
  theme: 'forest',
  halfWidth: 50,
  laps: 3,
  decorationDensity: 0.75,
  decorationSeed: 1922,
  controlPoints: [
    // Pit straight (heading south)
    [    0, -400], [    0, -200], [    0,    0], [    0,  200],
    // Variante del Rettifilo (slow right-left chicane)
    [   40,  280], [  120,  300], [  130,  370],
    // Curva Grande (long right)
    [   80,  470], [  -60,  520], [ -200,  500],
    // Variante della Roggia (chicane)
    [ -300,  450], [ -340,  370], [ -400,  410],
    // Lesmo 1
    [ -480,  370],
    // Lesmo 2
    [ -550,  280],
    // Back straight (heading north)
    [ -580,  150], [ -570,    0], [ -550, -150],
    // Variante Ascari (chicane on the back straight)
    [ -570, -250], [ -510, -290], [ -490, -360],
    [ -440, -440],
    // Parabolica (long sweeping right back to pit)
    [ -340, -510], [ -200, -540], [  -80, -510]
  ]
};
