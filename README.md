# GameFlash

A small, fully static, offline-capable HTML5 mini-arcade. Ships with two games:

- **Rural Racing** — top-down arcade racing inspired by Flash-era Miniclip racers. Solo (you vs. 3 CPU) or split-screen Versus.
- **Arena Brawl** — couch multiplayer dash brawler. 2-4 players on one device.

Multiple gamepads (Gamepad API, hot-plug), keyboard fallback, service-worker offline. No backend, no build step, no dependencies — open `index.html` from any static server (or deploy directly to GitHub Pages).

## Run locally

```sh
# any static server works; pick one:
python3 -m http.server 8080
# or
npx serve .
```

Then open `http://localhost:8080/`.

## Controls

**Rural Racing**

|              | Steer      | Throttle | Brake | Handbrake | Pause |
| ------------ | ---------- | -------- | ----- | --------- | ----- |
| P1 keyboard  | ←/→        | ↑        | ↓     | Space     | P     |
| P2 keyboard  | A/D        | W        | S     | Shift     | —     |
| Gamepad      | Left stick | RT or A  | LT or B | X       | Start |

`Esc` returns to the launcher. `R` restarts on the finish screen.

**Arena Brawl**

|              | Move       | Dash          |
| ------------ | ---------- | ------------- |
| P1 keyboard  | Arrows     | Space / Enter |
| P2 keyboard  | WASD       | Shift / F     |
| Gamepad      | Left stick | A or RT       |

Dash into a non-dashing opponent to hit them. Both dashing = bounce, no damage.

## Verify

`scripts/verify.mjs` runs three checks:

- `node --check` syntax on every file under `src/`
- `manifest.webmanifest` is valid JSON with the required keys
- every path in `sw.js`'s `SHELL_PATHS` list exists on disk (catches the precache list silently rotting when files move)

Run it locally with `node scripts/verify.mjs`. CI runs the same script on every push and pull request.

## Deploy to GitHub Pages

Pushes to `main` are deployed automatically by `.github/workflows/pages.yml` after the verify job passes. Pull requests run verify but don't deploy. Enable Pages once in the repo settings (Source: GitHub Actions). No build step.

The service worker activates after the first load, after which the app is fully offline.

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the diagram, folder layout, key decisions, and how to add a new game.
