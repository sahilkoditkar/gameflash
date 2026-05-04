// Rural Racing — exports two manifest entries that share the same module:
// solo (1 human + AI) and versus (2 humans split-screen + AI).
// The platform calls load() lazily. Sharing one module avoids re-downloading
// game code when switching configurations.

const sharedLoad = async () => {
  const { RacingGame } = await import('./RacingGame.js');
  return {
    createScene(_ctx, opts) {
      return new RacingGame(opts || { humans: 1, aiCount: 3 });
    }
  };
};

const solo = {
  id: 'rural-racing-solo',
  title: 'Rural Racing — Solo',
  description: 'Top-down arcade racing through countryside bends versus three CPU drivers.',
  tags: ['racing'],
  players: { min: 1, max: 1 },
  controls: 'Arrows or Gamepad',
  load: async () => {
    const mod = await sharedLoad();
    return { createScene: (ctx) => mod.createScene(ctx, { humans: 1, aiCount: 3 }) };
  }
};

const versus = {
  id: 'rural-racing-versus',
  title: 'Rural Racing — Versus (2P)',
  description: 'Split-screen local multiplayer. Player 1 uses Arrows + Space, Player 2 uses WASD + Shift, plus any connected gamepads.',
  tags: ['racing', 'multiplayer'],
  players: { min: 2, max: 2 },
  controls: 'Arrows + WASD or 2 Gamepads',
  load: async () => {
    const mod = await sharedLoad();
    return { createScene: (ctx) => mod.createScene(ctx, { humans: 2, aiCount: 2 }) };
  }
};

export default [solo, versus];
