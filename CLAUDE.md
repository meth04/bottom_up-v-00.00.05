# bottom up — notes for Claude

- Plain HTML/CSS/JS, **no build tool, no npm**. Serve with `node scripts/dev-server.js` and open http://localhost:8080.
- Two halves, one seam (see `docs/ARCHITECTURE.md`):
  - **Rules** = classic global scripts (`js/game.js`, `ages.js`, `professions.js`, `territory.js`, `villages.js`, `save.js`, `ui.js`, `empire.js`, `turnReport.js`, `gameFeel.js`, `icons.js`). Keep the plain-globals style and the explanatory comment voice.
  - **World + engine** = ES modules under `js/world/` and `js/engine/`, PixiJS v8 via `js/engine/pixi.js` only. Never import PixiJS from a URL elsewhere.
  - `js/main.js` (module) and `js/bridge.js` (classic) are the only files that cross the seam.
- Terrain type names, `HEX_DIRECTIONS` bit order and the tile record are part of the save format — extend, never rename.
- Performance rules: nothing per frame over all 86k hexes; cull and rebuild by 16×16 chunk; pool sprites; detail by zoom (`ZOOM_FAR/MID/NEAR`) and by `quality` tier.
- Tests: `node js/world/worldGen.test.js`, `node js/world/sim.test.js`, and in the browser `scripts/playtest.html`, `scripts/preview.html`, `scripts/engine-smoke.html`, `scripts/atlas-preview.html`.
- The user writes Vietnamese; answer in Vietnamese.
