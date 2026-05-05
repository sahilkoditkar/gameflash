// Imola (Autodromo Enzo e Dino Ferrari) — fan-made approximation.
// Tight, undulating, technical. Captures Tamburello, Villeneuve, Tosa,
// Piratella, Acque Minerali, Variante Alta, Rivazza, and Variante Bassa.

export default {
  id: 'imola',
  name: 'Imola (IT)',
  region: 'Italy · Emilia-Romagna',
  flavor: 'Technical, undulating, classic European circuit.',
  theme: 'countryside',
  halfWidth: 44,
  laps: 3,
  decorationDensity: 0.65,
  decorationSeed: 3014,
  controlPoints: [
    // Pit straight
    [    0,    0], [  200,  -10], [  380,    0],
    // Tamburello chicane (right-left)
    [  470,   40], [  500,  120], [  430,  170],
    // Villeneuve right
    [  430,  280],
    // Tosa (slow left hairpin)
    [  500,  390], [  470,  480], [  360,  500],
    // Piratella (left)
    [  240,  450], [  140,  370],
    // Acque Minerali (left double)
    [   60,  300], [  -60,  280], [ -150,  340],
    // Variante Alta (chicane)
    [ -240,  300], [ -290,  220], [ -370,  220],
    // Rivazza 1 & 2 (left double)
    [ -450,  170], [ -470,   60],
    // Variante Bassa (chicane back to pit)
    [ -390,  -30], [ -250,  -50], [ -130,  -40]
  ]
};
