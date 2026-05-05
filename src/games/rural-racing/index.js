// Rural Racing — single launcher entry. Mode (Race / Time Trial / Career)
// is chosen in-game as the first wizard step. The same RacingGame module
// drives all three modes.

const racing = {
  id: 'rural-racing',
  title: 'Rural Racing',
  description: 'Top-down arcade racing. Pick a mode (Race / Time Trial / Career), choose a circuit, claim a controller, and race.',
  tags: ['racing', 'multiplayer', 'career'],
  players: { min: 1, max: 4 },
  controls: 'Arrows + WASD or Gamepads',
  load: async () => {
    const { RacingGame } = await import('./RacingGame.js');
    return { createScene: () => new RacingGame() };
  }
};

export default racing;
