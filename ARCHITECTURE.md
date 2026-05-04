# GameFlash — Architecture

GameFlash is a **static**, **offline-capable** mini-arcade. The first game is a
Flash-era top-down racer (Rural Racing); a second game (Arena Brawl) ships with
it to prove the platform can host more than one game cleanly.

The repo is plain ES modules — no bundler, no transpiler, no runtime dependencies.
Open `index.html` from any static server and it runs.

---

## High-level diagram

```
                              ┌────────────────────────┐
                              │   index.html (shell)   │
                              │   styles/main.css      │
                              │   manifest.webmanifest │
                              │   sw.js (offline)      │
                              └───────────┬────────────┘
                                          │ <script type="module">
                                          ▼
                              ┌────────────────────────┐
                              │     src/main.js        │  boots everything
                              └───────────┬────────────┘
                                          ▼
   ┌──────────────────────────  Platform layer  ──────────────────────────┐
   │                                                                      │
   │   Platform ── owns DOM chrome (top bar, FPS, fullscreen, esc-home)   │
   │     │                                                                │
   │     ├── GameRegistry  ── manifest list (id, title, players, load)    │
   │     ├── GameLoader    ── lazy import + Engine.setScene()             │
   │     └── Launcher      ── home grid                                   │
   │                                                                      │
   └────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
   ┌──────────────────────────  Engine layer  ───────────────────────────┐
   │                                                                     │
   │   Engine                                                            │
   │     ├── fixed-timestep loop (60 Hz logic, render every frame)       │
   │     ├── Renderer (Canvas2D, DPR-aware, world/screen transforms)     │
   │     ├── Camera (smooth follow + bounds)                             │
   │     ├── InputManager                                                │
   │     │     ├── KeyboardSource                                        │
   │     │     ├── GamepadSource (hot-plug)                              │
   │     │     └── Player (unified actions/axes; multi-source binding)   │
   │     ├── AssetManager (lazy + cached: image / json / audio)          │
   │     ├── AudioManager (WebAudio synth helpers)                       │
   │     └── physics (Body, circle-circle, AABB-clamp)                   │
   │                                                                     │
   └────────────────────────────────┬────────────────────────────────────┘
                                    ▼
   ┌────────────────────────────  Game layer  ──────────────────────────┐
   │                                                                    │
   │   src/games/<game-id>/                                             │
   │     index.js   ── manifest (or array of manifests) + load()        │
   │     *.js       ── a Scene subclass, plus game-specific objects     │
   │                                                                    │
   │   Scene { init, update(dt), render(renderer, alpha), destroy }     │
   │                                                                    │
   └────────────────────────────────────────────────────────────────────┘
```

---

## Folder layout

```
/
├── index.html
├── manifest.webmanifest
├── sw.js
├── README.md
├── ARCHITECTURE.md
├── styles/
│   └── main.css
└── src/
    ├── main.js
    ├── platform/
    │   ├── Platform.js
    │   ├── GameRegistry.js
    │   ├── GameLoader.js
    │   └── Launcher.js
    ├── engine/
    │   ├── Engine.js
    │   ├── Scene.js
    │   ├── render/
    │   │   ├── Renderer.js
    │   │   └── Camera.js
    │   ├── input/
    │   │   ├── InputManager.js
    │   │   ├── KeyboardSource.js
    │   │   └── GamepadSource.js
    │   ├── physics/
    │   │   ├── Body.js
    │   │   └── Collision.js
    │   ├── assets/
    │   │   └── AssetManager.js
    │   ├── audio/
    │   │   └── AudioManager.js
    │   └── utils/
    │       ├── math.js
    │       └── rng.js
    └── games/
        ├── index.js                  # registry of all installed games
        ├── rural-racing/
        │   ├── index.js              # manifest(s) — Solo + Versus
        │   ├── RacingGame.js         # Scene
        │   ├── Track.js
        │   ├── Vehicle.js
        │   ├── AIDriver.js
        │   ├── HUD.js
        │   └── tracks/
        │       └── countryside.js
        └── arena-brawl/
            ├── index.js
            ├── BrawlGame.js
            └── Fighter.js
```

---

## Adding a new game

1. Create `src/games/<your-game>/index.js` exporting a manifest (or array):
   ```js
   export default {
     id: 'your-game',
     title: 'Your Game',
     description: '...',
     players: { min: 1, max: 4 },
     controls: 'Keyboard / Gamepad',
     load: async () => {
       const { YourScene } = await import('./YourScene.js');
       return { createScene: (ctx) => new YourScene() };
     }
   };
   ```
2. Implement a `Scene` subclass: `init(), update(dt), render(renderer, alpha), destroy()`.
3. Append to the array in `src/games/index.js`. Done.

That is the entire integration surface. Games never reach into Engine internals
beyond the `ctx` object handed to them, so changes inside a game can never
break the platform or another game.

---

## Key decisions and tradeoffs

**Vanilla ES modules, no build step.**
Pro: deploys to GitHub Pages by pushing files; no npm, no toolchain rot.
Con: no minification (the codebase is small enough that this doesn't matter).

**Canvas2D, not WebGL.**
A top-down racer with ~5 cars and a static track does not stress Canvas2D on
modern hardware. WebGL would add ~5x the engine code (shaders, buffers, batching)
for no perceptible benefit at this scope. The Renderer abstraction does not
expose `getContext`; if a game ever needs WebGL we can add a sibling renderer.

**Fixed timestep (60 Hz logic), variable-rate rendering.**
Determinism is critical for arcade physics — at variable dt the same key press
gives different speeds. We accumulate frame time and step the simulation in
1/60 s slices, with a max-steps-per-frame cap to avoid spiral-of-death after
a tab regains focus. Rendering still runs every rAF and receives an `alpha`
for optional interpolation.

**Player-centric input rather than action-centric.**
Many engines have a global "is action X pressed". That breaks down with
multiple humans on one device because two players might bind the same physical
key for the same action. The `Player` abstraction owns its own per-frame state
and per-frame edge detection, so the racing game can ask
`p1.justPressed('handbrake')` and `p2.justPressed('handbrake')` independently
even though both are listening to the same `KeyboardSource`.

**Hot-plug gamepads via a slot reservation.**
A player created with `gamepad: 'auto'` is offered the next free pad on
`gamepadconnected`. On `gamepaddisconnected` the slot frees and the player
falls back to its keyboard layout (if any). Players can have **both** a
keyboard layout and a gamepad — the InputManager merges them per frame, so a
single player can drop the controller and grab the keyboard mid-race.

**Spline track over tile track.**
Racing tracks at this scale are fundamentally curves, not grids. A single
Catmull-Rom-driven centerline + a uniform half-width gives us:
* rendering (one thick stroke + a dashed centerline + a checkered start),
* lap progression (segment index + segment-local t),
* AI lookahead and corner curvature in the same data structure,
* off-track detection (`distance > halfWidth`).
Tradeoff: variable track width / chicanes need extra state. We can extend
`Track` with per-segment width without changing the public API.

**HUD in DOM, world in canvas.**
DOM gets crisp text and CSS layout for free; canvas is for the world. The
HUD layer is a positioned `<div>` on top of the canvas and is rebuilt only
when content changes (no per-frame innerHTML thrash for stable text — the
racing HUD updates only the `textContent` of inner spans).

**Service worker is cache-first with a cache version.**
First load populates the cache from the explicit shell list. Subsequent loads
are network-free. To ship an update we bump `CACHE_VERSION` in `sw.js`; on
activate we evict old caches.

**Security defaults.**
* No `eval`, no `new Function`, no `innerHTML` for any user-derived content.
  The few places we use `innerHTML` (HUD setup, finish-screen table) build
  strings from in-game state (numbers, hard-coded color hex). Player names are
  not user-supplied.
* Service worker only intercepts same-origin GETs.
* The manifest sets `scope` and `start_url` to `./` so it works under any
  GitHub Pages base path.
* `crossOrigin = 'anonymous'` on images so we don't taint the canvas if an
  asset is ever loaded cross-origin.

**Performance.**
* Logic clamped to 60 Hz, max 5 catch-up steps per frame.
* Canvas2D `setTransform` per draw call rather than `save/restore` chains in
  the hot path of the renderer.
* Per-frame allocations are bounded: input sampling reuses fixed-shape state
  objects; collision iterates `O(N²)` over a small N (≤ 5 cars, ≤ 4 fighters).
* Image-rendering set to `pixelated` so DPR upscaling doesn't smear the art.
* The asset manager dedupes concurrent loads so `loadImage(url)` from many
  callers shares one Promise + one HTTP request.

**Things deliberately not built.**
* No generic ECS — over-abstraction for two games.
* No AABB tree / spatial index — N is small.
* No JSON-driven scene format — game code is the scene description.
* No internationalization layer — we'd add it when a second locale lands.
