// Rural Racing — single launcher entry. The full pre-race wizard
// (player count → track → options → players + colours) runs inside the scene.

const racing = {
  id: 'rural-racing',
  title: 'Rural Racing',
  description: 'Top-down arcade racing. Pick your circuit (Countryside, Silverstone, Spa, Miami, Monaco), tune difficulty / weather / time / laps, claim a controller, choose a colour, race.',
  tags: ['racing', 'multiplayer'],
  players: { min: 1, max: 2 },
  controls: 'Arrows + WASD or Gamepads',
  load: async () => {
    const { RacingGame } = await import('./RacingGame.js');
    return {
      createScene: () => new RacingGame()
    };
  }
};

export default racing;
