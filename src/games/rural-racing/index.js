// Rural Racing manifests. The launcher shows three entries that share the
// same RacingGame module (loaded once) but pick a different `mode`.

const sharedLoad = async () => {
  const { RacingGame } = await import('./RacingGame.js');
  return RacingGame;
};

const race = {
  id: 'rural-racing',
  title: 'Rural Racing',
  description: 'Top-down arcade racing. Pick a circuit, tune options, claim a controller, choose a colour, race up to two players plus AI.',
  tags: ['racing', 'multiplayer'],
  players: { min: 1, max: 2 },
  controls: 'Arrows + WASD or Gamepads',
  load: async () => {
    const RacingGame = await sharedLoad();
    return { createScene: () => new RacingGame({ mode: 'race' }) };
  }
};

const timetrial = {
  id: 'rural-racing-timetrial',
  title: 'Rural Racing — Time Trial',
  description: 'Solo, no AI. Hot-lap any circuit. Sector deltas, persistent personal-best, and a translucent ghost car of your fastest lap.',
  tags: ['racing'],
  players: { min: 1, max: 1 },
  controls: 'Arrows or Gamepad',
  load: async () => {
    const RacingGame = await sharedLoad();
    return { createScene: () => new RacingGame({ mode: 'timetrial' }) };
  }
};

const career = {
  id: 'rural-racing-career',
  title: 'Rural Racing — Career',
  description: 'A 9-race championship across every circuit. F1 points scoring; standings persist across sessions. Resume any time.',
  tags: ['racing', 'career'],
  players: { min: 1, max: 1 },
  controls: 'Arrows or Gamepad',
  load: async () => {
    const RacingGame = await sharedLoad();
    return { createScene: () => new RacingGame({ mode: 'career' }) };
  }
};

export default [race, timetrial, career];
