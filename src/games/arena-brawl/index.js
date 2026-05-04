// Arena Brawl — local-multiplayer brawler. Demonstrates how a game with
// totally different mechanics plugs into the same engine and platform.

export default {
  id: 'arena-brawl',
  title: 'Arena Brawl',
  description: 'Couch multiplayer for 2-4 players. Dash into opponents to deal damage. Last fighter standing wins the round.',
  tags: ['action', 'multiplayer'],
  players: { min: 2, max: 4 },
  controls: 'Arrows + WASD or Gamepads',
  load: async () => {
    const { BrawlGame } = await import('./BrawlGame.js');
    return {
      createScene(/* ctx */) { return new BrawlGame({ players: 2 }); }
    };
  }
};
