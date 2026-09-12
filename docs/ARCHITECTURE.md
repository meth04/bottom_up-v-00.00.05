# bottom up — living-world architecture

This document is the contract between the modules under `js/world/` and
`js/engine/`. Several people (and agents) build them in parallel, so every
public function named here must exist with exactly this signature. Add
more if you need to; never rename or remove what is listed.

## Ground rules

* **Plain ES modules, no build tool.** `import`/`export` only, relative
  paths with the `.js` extension. Nothing from npm except PixiJS, which is
  loaded by `js/engine/pixi.js` (`import PIXI, { Container, Sprite } from "./pixi.js"`).
  Never import PixiJS from a URL anywhere else.
* **The legacy rules code stays as classic global scripts** (`js/game.js`,
  `ages.js`, `professions.js`, `territory.js`, `villages.js`, `save.js`,
  `ui.js`, `empire.js`, `turnReport.js`, `gameFeel.js`, `icons.js`). They read
  and write plain globals (`humans`, `wood`, `turngame`, `seasonchecker`
  1..4, `hexMap`, …) and are wired to the HTML by `onclick`. `js/main.js`
  (a module) bridges the two worlds by assigning what they need onto
  `window`. Engine/world modules must NOT read those globals directly — they
  get everything through constructor options and method calls.
* **Coordinates.** World units: 1 unit = 1 CSS px at zoom 1. A hex has
  corner radius `HEX_SIZE` (24) and centre `worldTileCenter(q, r, world.grid)`.
  Pointy-top axial hexes, directions in `HEX_DIRECTIONS` order (bit i of any
  mask = direction i). See `js/world/hexMath.js`.
* **Chunks.** `CHUNK_SIZE` (16) hexes per side, chunk `(cx, cy) =
  (floor(col / 16), floor(row / 16))`, chunk index `cy * chunkCols + cx`.
  Chunks are the unit of culling, of rebuilding and of ambient spawning.
* **Performance targets.** 60 fps on an integrated-GPU laptop at 1080p and
  30+ fps on a mid-range phone, with a 360×240 (86 400 hex) world. Nothing
  may do per-frame work proportional to the whole map: cull by chunk, pool
  sprites, rebuild only dirty chunks, hide detail by zoom (`ZOOM_FAR`,
  `ZOOM_MID`, `ZOOM_NEAR` in `constants.js`).
* **Determinism.** Everything that scatters things (decor positions, ambient
  animals, cart colours) is seeded from `tile.detailSeed` / `world.seed` so a
  chunk looks the same every time it is rebuilt.
* **Style.** Clean, readable, flat-colour "Civilization VI" look: saturated
  fills, dark thin outlines, simple geometric shapes, soft drop shadows.
  All art is drawn procedurally into a texture atlas with Canvas 2D at boot
  (no image files).

## Module map and ownership

```
js/world/constants.js     shared numbers (DONE)
js/world/hexMath.js       hex maths, PRNG (DONE)
js/world/terrainDefs.js   terrain catalogue: colours, decor recipes, costs (DONE — extend, don't rename)
js/world/hexMap.js        HexMap: tiles, ownership, fog, roads, improvements, change bus (DONE)

js/world/worldGen.js         generateWorld(spec) — multi-continent generator      [AGENT: worldgen]
js/world/worldGen.worker.js  runs generateWorld off the main thread              [AGENT: worldgen]

js/world/roads.js         RoadNetwork: A*, connectivity, auto-connect            [AGENT: sim]
js/world/improvements.js  Improvements: placement rules, auto-placement, towns   [AGENT: sim]
js/world/agents.js        AgentSim: carts, boats, villagers, animals, birds       [AGENT: sim]
js/world/weather.js       WeatherModel: season + day/night + precipitation       [AGENT: sim]
js/engine/unitLayer.js    draws AgentSim's render list                           [AGENT: sim]
js/engine/weatherLayer.js clouds, rain/snow/petals/leaves, lighting tint         [AGENT: sim]

js/engine/pixi.js         PixiJS loader (DONE)
js/engine/device.js       device tier, quality settings, FPS meter, adaptive     [AGENT: engine]
js/engine/camera.js       pan/zoom/pinch/inertia, world<->screen, bounds         [AGENT: engine]
js/engine/terrainLayer.js chunked terrain mesh with custom shader                [AGENT: engine]
js/engine/labelLayer.js   region / settlement / water names                      [AGENT: engine]
js/engine/minimap.js      canvas minimap                                         [AGENT: engine]
js/engine/renderer.js     WorldRenderer: app, layer stack, input, public API     [AGENT: engine]

js/engine/atlas.js        procedural texture atlas (all sprites)                 [AGENT: art]
js/engine/featureLayer.js decor, landmarks, improvements, buildings              [AGENT: art]
js/engine/roadLayer.js    roads, bridges, rivers, waterfalls                     [AGENT: art]
js/engine/overlayLayer.js fog edge, borders, frontier, selection, lenses, ghosts [AGENT: art]

js/main.js                boot + bridge to legacy globals                        [integrator]
index.html, css/style.css, data/map.json, README.md                              [integrator]
```

Each module exports what is listed below. `PIXI` means the namespace from
`js/engine/pixi.js`.

---

## js/world/worldGen.js

```js
export function generateWorld(spec, onProgress?) -> world
// spec: { cols, rows, hexSize, seed, villageCount, continents, seaLevel?, ... } (from data/map.json "world")
// onProgress?(fraction 0..1, caption string)
```

Returns:

```js
{
  seed, cols, rows,
  grid: { hexSize, originX, originY },
  width, height,                 // world units, including WORLD_PAD margins
  tiles: [tile...],              // row-major, index = row * cols + col
  continents: [{ id, name, tileCount, center: {x, y}, bounds }],
  rivers: [{ id, name|null, tileIds: [], reachedWater }],
  lakes: [{ id, name|null, tileIds: [] }],
  regions: [{ id, terrainType, name, tileCount, center: {x, y} }],
  villages: [{ id, name, color, kind: "player"|"rival"|"garlock", homeTileId, continentId }],
  tradeRoutes: [{ from, to, tileIds: [] }],      // land tracks between villages (MST per continent)
  seaLanes: [{ from, to, tileIds: [] }],         // water paths between coastal villages of different continents
  landmarks: [{ type, tileId }],
}
```

Tile fields the generator must fill (HexMap copies them):

```
id "hex_q_r", q, r, col, row, index,
terrainType (a key of TERRAIN in terrainDefs.js),
elevation 0..1, moisture 0..1, temperature 0..1,
detailSeed uint32, regionId|null, continentId (int, -1 for sea),
coastal bool (land touching water), snowCapped bool (mountains only),
feature null | "waterfall" | "oasis" | "reef" | "hotSpring" | "ford",
landmark null | one of LANDMARK_TYPES,
riverWidth 0 | 1 | 2 | 3 (river tiles only; from flow accumulation),
riverMask 6-bit (which neighbours are also river/lake/ocean, HEX_DIRECTIONS order),
villageId|null, isStartingTile bool, specialEffect ("startingLand"|"village"|null)
```

Requirements:
* 3–5 continents (spec.continents) with ragged coasts, `shallows` one ring
  out from every coast, `cliffs` where high ground meets the sea, islands.
* Mountain chains (ridged noise), `hills` around them, rain shadow, latitude
  bands (snowfield/tundra top, desert/badlands bottom), `desert` in dry hot
  interiors, `marsh` in wet lowlands, all existing biomes kept.
* Rivers follow steepest descent; width grows with tributaries; `waterfall`
  feature where a river drops more than a threshold; lakes at pools.
* Villages: player on the biggest continent with ≥ 3 rivals and ≥ 1 garlock
  camp on the SAME continent (raids must be reachable), rest spread across
  continents, min spacing; every village home gets `HOMELY_TYPES` ground and
  a liveable ring (see `ensureViableStart` in the old generator).
* Must run inside a Web Worker (no DOM, no `window`). Target < 2.5 s for
  86 400 hexes. Report progress ~10 times.

## js/world/worldGen.worker.js

```js
// postMessage({ spec }) in; messages out:
//   { type: "progress", fraction, caption }
//   { type: "done", world }
//   { type: "error", message }
```

Used as `new Worker(new URL("./worldGen.worker.js", import.meta.url), { type: "module" })`.

---

## js/world/roads.js

```js
export class RoadNetwork {
  constructor(hexMap)
  findPath(fromId, toId, opts?) -> tileIds[] | null
  //   opts: { preferRoads=true, allowWater=false, maxCost=Infinity, forVillage=null (only own/wild tiles) }
  //   A* with a binary heap. Step cost = roadCost(terrain) for building, moveCost for walking;
  //   an existing road edge costs 0.4. Rivers cost extra unless a road (bridge) already crosses.
  waterPath(fromId, toId) -> tileIds[] | null      // boats: only water tiles, shallows preferred
  autoConnect(fromId, toId, { maxLength=60 }) -> tileIds[] | null   // finds and LAYS the road on hexMap
  connectedToTown(villageId) -> Set<tileId>        // tiles reachable from the hall by road edges
  isConnected(tileId, villageId) -> bool
  efficiencyFor(villageId) -> 0..1                 // share of that village's resource-bearing tiles connected by road
  invalidate()                                     // call when roads/ownership changed (also subscribes to hexMap.onChange)
}
```

## js/world/improvements.js

```js
export const IMPROVEMENTS = {
  // out on the land
  farm:       { name, kind: "site", terrains: [...], yields: "food",  spriteBase: "improvement/farm" },
  lumberCamp: { ...,  yields: "wood",  spriteBase: "improvement/lumberCamp" },
  quarry:     { ...,  yields: "stone", spriteBase: "improvement/quarry" },
  fishery:    { ...,  needsWater: true, spriteBase: "improvement/fishery" },
  pasture:    { ..., spriteBase: "improvement/pasture" },
  // in the town (tie to game.js counters)
  hall:      { kind: "town", spriteBase: "building/hall" },
  house:     { kind: "town", counter: "houses",  spriteBase: "building/house" },
  barn:      { kind: "town", counter: "barns",   spriteBase: "building/barn" },
  school:    { kind: "town", counter: "schools", spriteBase: "building/school" },
  armyCamp:  { kind: "town", counter: "camps",   spriteBase: "building/armyCamp" },
  market:    { kind: "town", spriteBase: "building/market" },
  watchtower:{ kind: "town", spriteBase: "building/watchtower" },
}

export class Improvements {
  constructor(hexMap, roads)
  canPlace(type, tileId, villageId) -> { ok: bool, reason: string|null }
  place(type, tileId, villageId) -> bool            // writes hexMap.setImprovement / setBuilding, lays a road to it via roads.autoConnect
  remove(tileId)
  // Keeps a village's buildings in step with the legacy counters
  // ({ houses, barns, schools, camps }) — places missing ones on free hexes
  // in rings around the hall (respecting `preferredTileId` if given and
  // valid), removes extras. Also seeds a hall on the home tile.
  syncTown(villageId, counters, preferredTileId?) -> { placed: [tileId], removed: [tileId] }
  // Work sites out on the land: roughly one per 9 resource-bearing hexes,
  // by terrain, only on owned tiles, connected by road. Idempotent.
  syncWorkSites(villageId) -> { placed: [], removed: [] }
  // Rival/garlock towns grow with land held.
  syncRival(village, tilesHeld) -> void
  listFor(villageId) -> [{ tileId, type }]
}
```

## js/world/agents.js

```js
export class AgentSim {
  constructor({ world, hexMap, roads, improvements, quality })   // quality from device.js
  setQuality(quality)
  syncPopulation({ humans, soldiers, trades: { forester, mason, farmer, scholar, scout }, season })
  update(dt, viewBounds)          // dt seconds (clamped ≤ 0.1). Simulate only agents inside viewBounds + margin;
                                  // ambient life (animals, birds, fish) is spawned per visible chunk and despawned when far.
  getRenderList(viewBounds) -> Agent[]   // reused array; do not retain
  onEvent(event)                  // { kind: "claim"|"seize", tileId } → expedition walks; { kind: "raid", fromVillageId } → warband
  //                                { kind: "gather", type, amount } → a villager runs home with a load
  get counts -> { total, active }
}
// Agent (plain object, pooled):
// { id, kind, variant, x, y, facing: 1|-1, state: "walk"|"work"|"idle"|"sail"|"fly", phase: 0..1 (anim), z: number (sort), tint?: 0xRRGGBB, carrying?: "food"|"wood"|"stone"|null }
// kinds: "villager" (variant = trade: carrier|farmer|forester|mason|scholar|scout), "soldier", "garlock",
//        "cart", "boat", "tradeship", "deer", "boar", "sheep", "wolf", "bird", "heron", "fish"
```

Behaviour: villagers walk from the hall along roads (roads.findPath, preferRoads)
to a work site of their trade, work, return. Carts shuttle between work sites
and the barns, and along `world.tradeRoutes` between connected villages.
Boats fish off fisheries and sail `world.seaLanes`. Animals wander their
habitat (deer/boar in woods, sheep on meadows, wolves in taiga/tundra) and
flee from villagers. Birds fly long lazy paths; herons stand in marsh; fish
jump in lakes. Everything moves smoothly between hex centres (never
teleports), respects `quality.maxAgents`, and is deterministic per seed.

## js/world/weather.js

```js
export class WeatherModel {
  constructor(seed)
  setSeason(season 1..4)
  update(dt)
  get state() -> {
    season, timeOfDay 0..1, daylight 0..1,
    tint: { r, g, b, a },              // multiply/overlay colour for the lighting layer
    precipitation: { kind: null|"rain"|"snow"|"petals"|"leaves", intensity 0..1 },
    wind: { x, y }, cloudCover 0..1, fog 0..1
  }
}
```

## js/engine/unitLayer.js and js/engine/weatherLayer.js

```js
export class UnitLayer   { constructor(PIXI, atlas, quality); container; update(agents, camera, dt); setQuality(q) }
export class WeatherLayer{ constructor(PIXI, atlas, quality, screen: {width,height}); container /* screen space */; update(weatherState, camera, dt); resize(w,h); setQuality(q) }
```

`UnitLayer` sprites: `unit/<kind>_<variant>_<frame>` (see atlas keys), anchored
bottom-centre, y-sorted, hidden below `ZOOM_FAR`, animation frame from `phase`.
Shadows via `fx/shadow`. Carts show a small load sprite (`ui/icon_<carrying>`).

`WeatherLayer`: cloud sprites with soft shadows on the world (multiply),
particle precipitation in screen space (`fx/raindrop`, `fx/snowflake`,
`fx/petal`, `fx/leaf`), a full-screen tint quad driven by `state.tint`, and
warm window glows (`fx/glow`, additive) at night near buildings (positions
supplied by `renderer.getBuildingPositions(viewBounds)`).

---

## js/engine/device.js

```js
export function detectDevice() -> { tier: "low"|"mid"|"high", mobile: bool, touch: bool, dpr, cores, memory }
export function qualityFor(tier) -> quality
// quality: { tier, resolution (renderer DPR cap), antialias, maxAgents, ambientPerChunk, decorDensity 0..1,
//            particles 0..1, shadows: bool, clouds: bool, animateWater: bool, labelLimit }
export class FpsMeter { constructor(); tick(dtMs); get fps; get frameMs; get p95 }
export class AdaptiveQuality {
  constructor(quality, onChange(quality))   // steps decorDensity/particles/maxAgents down when frameMs > 22 for 2 s, up when < 11 for 10 s
  tick(frameMs)
  get quality
}
```

## js/engine/camera.js

```js
export class Camera {
  constructor(hostElement, { worldWidth, worldHeight, minZoom?, maxZoom? })
  x, y            // world coordinate at the centre of the screen
  zoom            // world units -> css px
  screenWidth, screenHeight
  worldToScreen(x, y) -> { x, y }
  screenToWorld(sx, sy) -> { x, y }
  getBounds(margin = 0) -> { minX, minY, maxX, maxY }     // visible world rect
  focusOn(x, y, zoom?, { animate = true, duration = 0.6 })
  zoomBy(factor, screenX?, screenY?)
  setLimits({ worldWidth, worldHeight, minZoom, maxZoom })
  onChange(listener(view)) -> unsubscribe        // view = { x, y, zoom, bounds }
  update(dt)                                     // inertia + animations; returns true if moved
  attachInput(canvasElement, { onTap(sx, sy, ev), onLongPress(sx, sy), onHover(sx, sy), onDragStart?, onDragEnd? })
  // mouse drag pans, wheel zooms about cursor, touch drag pans, pinch zooms about midpoint,
  // double-tap zooms in, tap vs drag threshold 6 px, long press 450 ms. Never lets the world leave the screen.
  applyTo(container)                             // sets container.position/scale for the world root
  destroy()
}
```

## js/engine/terrainLayer.js

```js
export class TerrainLayer {
  constructor(PIXI, world, hexMap, quality)
  container                       // add to world root
  markDirty(tileIds)              // rebuild colour buffers of those chunks (next frame)
  markAllDirty()
  setSeason(season 1..4)          // shifts palette (snow in winter, gold in autumn) — all chunks dirty
  setGrid(visible: bool)          // hex outline via shader uniform
  setOwnerColors(fn(villageId) -> 0xRRGGBB)
  update(camera, dt)              // culls chunks against camera.getBounds(), animates water, rebuilds ≤ N dirty chunks per frame
}
```

One `Mesh` per chunk with a custom GLSL shader (WebGL only — the renderer
is created with `preference: "webgl"`). Per vertex: `aPosition` (2),
`aColor` (3), `aEdge` (1: 0 at rim, 1 at centre) and `aFlags` (1: bit0 =
water, bit1 = fog). 7 vertices + 18 indices per hex. Colour = terrain
colour mixed with `colorAlt` by `detailSeed`, blended toward the owner's
colour (18 %) on owned tiles, replaced by parchment `#e2d2b2` on unseen
tiles (unless `hexMap.mapmakingUnlocked`). The fragment shader darkens the
rim (`aEdge < 0.1`) when the grid is on, and gives water a slow moving
highlight from `uTime`.

## js/engine/labelLayer.js

```js
export class LabelLayer { constructor(PIXI, world, hexMap, villages: () => [...]); container; update(camera); refresh() }
```
Region names large and faint (fade out above `ZOOM_NEAR`), settlement names
with a coloured dot (only revealed villages), river/lake names along the
water. Never more than `quality.labelLimit` visible. Text scales inversely
with zoom so it stays readable.

## js/engine/minimap.js

```js
export class Minimap { constructor(canvas, world, hexMap, villages: () => [...]); draw(view); invalidate(); onClick(fn(worldX, worldY)) }
```

## js/engine/renderer.js

```js
export async function createWorldRenderer({
  host,                    // HTMLElement the canvas goes into
  world, hexMap,
  villages: () => [...],   // live list (villagesGet)
  quality,                 // from device.js
  callbacks: {
    onTileClick(tileId, { x, y, button, shift }),
    onTileLongPress(tileId),
    onTileHover(tileId|null),
    onViewChange(view),
    onFps(fps, frameMs, quality)
  },
}) -> WorldRenderer

class WorldRenderer {
  app, atlas, camera, quality, world, hexMap
  layers: { terrain, roads, features, units, overlay, labels, weather }
  setSeason(season)                       // to terrain, features, weather
  setWeather(weatherModel)                // renderer calls model.update and feeds weatherLayer
  setAgentSource(agentSim)                // renderer calls sim.update/getRenderList each frame
  setGrid(on), setLens(name|null)         // lens: "yields"|"territory"|"resources"|"roads"|null
  setSelected(tileId|null), setHover(tileId|null)
  setPlacementGhost({ tileId, type, valid } | null)
  setRoadPreview(tileIds|null)
  markDirty(tileIds), refreshAll()
  flashTile(tileId, color), floatText(x, y, text, kind), animateExpedition(from, to, color, onArrive), burst(x, y)
  getBuildingPositions(bounds) -> [{x, y}]
  tileAtScreen(sx, sy) -> tile|null
  resize()
  destroy()
}
```

The renderer subscribes to `hexMap.onChange` and forwards dirty tiles to
every layer. It owns the ticker: per frame `camera.update`, `weather.update`,
`sim.update(dt, bounds)`, then each layer's `update(camera, dt)`, then the
FPS meter and adaptive quality. It applies `quality` changes to all layers.

---

## js/engine/atlas.js

```js
export async function buildAtlas(PIXI, { scale = 2 }) -> Atlas
class Atlas {
  texture(key) -> PIXI.Texture       // falls back to "missing" (magenta hex) and warns once
  has(key) -> bool
  variants(base) -> number           // how many `${base}_${n}` exist
  keys() -> string[]
}
```

Every texture has `defaultAnchor` set (bottom-centre for standing things,
centre for flat things). Drawn at `scale` × the nominal size, with
`texture.source.resolution = scale`, so nominal sizes are in world units:

| key pattern | nominal size (w×h units) | anchor | notes |
| --- | --- | --- | --- |
| `decor/tree_broad_{0-3}`, `tree_pine_{0-3}`, `tree_birch_{0-2}`, `tree_timbermellow_{0-2}` | 18×26 | bottom | timbermellow: round canopy with orange fruit |
| `decor/bush_{0-2}`, `grass_{0-2}`, `flower_{0-2}`, `reed_{0-1}`, `cactus_{0-1}` | 10–14 tall | bottom | |
| `decor/rock_{0-2}`, `boulder_{0-1}`, `snowdrift_{0-1}`, `dune_{0-1}`, `pool_{0-1}`, `wave_{0-2}`, `ice` | 12–20 | centre | flat things |
| `decor/hill_{0-2}` | 40×26 | bottom | Civ-style rounded hill with shaded side |
| `decor/mountain_{0-2}`, `mountain_snow_{0-2}` | 44×40 | bottom | grey peak, snow cap on the _snow variants |
| `decor/cliff`, `decor/palm`, `decor/dead_tree` | 24–30 | bottom | |
| `landmark/<type>` for every LANDMARK_TYPES, `landmark/waterfall_{0-2}` (frames) | 32×32 | bottom | |
| `building/hall_{0-2}` (size tiers), `house_{0-2}`, `barn`, `school`, `armyCamp`, `market`, `watchtower`, `well`, `windmill_{0-3}` (frames), `garlock_tent`, `garlock_totem`, `palisade`, `dock`, `bridge`, `bridge_v`, `lighthouse` | 30×30 | bottom | `bridge` spans east-west, `bridge_v` north-south |
| `improvement/farm_{spring,summer,autumn,winter}`, `lumberCamp`, `quarry`, `fishery`, `pasture`, `mine` | 34×30 | bottom | farm shows tilled/green/golden/snowed fields |
| `unit/villager_<trade>_{0-1}` (trade: carrier, farmer, forester, mason, scholar, scout), `soldier_{0-1}`, `garlock_{0-1}`, `cart_{0-1}`, `boat_{0-1}`, `tradeship_{0-1}`, `deer_{0-1}`, `boar_{0-1}`, `sheep_{0-1}`, `wolf_{0-1}`, `bird_{0-1}`, `heron_{0-1}`, `fish_{0-1}` | people 10×16, cart 18×12, boat 16×10, ship 22×16, animals 12×10, bird 8×6 | bottom | two frames = walk cycle; all face RIGHT |
| `fx/cloud_{0-2}` (120×60, centre, soft), `raindrop`, `snowflake`, `petal`, `leaf`, `smoke_{0-1}`, `spark`, `glow` (radial), `shadow` (soft ellipse 16×8), `flag` | | centre | |
| `ui/hex_fill` (solid white hex, HEX_SIZE), `ui/hex_outline` (2 px white outline), `ui/hex_dashed`, `ui/icon_food`, `icon_wood`, `icon_stone`, `icon_grain`, `ui/marker_explore`, `marker_seize`, `ui/select_bracket` (one corner bracket) | | centre | tint these at runtime |

## js/engine/featureLayer.js

```js
export class FeatureLayer {
  constructor(PIXI, atlas, world, hexMap, quality, villages: () => [...])
  container
  markDirty(tileIds); markAllDirty()
  setSeason(season)                  // farms, timbermellow trees change with the season
  setQuality(quality)
  update(camera, dt)                 // builds/destroys chunk containers around the view, y-sorts, animates windmills/waterfalls
  getBuildingPositions(bounds) -> [{x, y}]
}
```
Per chunk: a `Container` built lazily when within the view (+1 chunk
margin) and destroyed when 3+ chunks away. Decor from `TERRAIN[type].decor`
scattered by `detailSeed` (count × `quality.decorDensity`, fewer when zoomed
out: at `zoom < ZOOM_MID` only mountains/hills/one tree cluster per hex; at
`zoom < ZOOM_FAR` only mountains). Unseen tiles draw nothing. Landmarks,
improvements (`tile.improvement`) and buildings (`tile.building`) are
sprites on top; the hall gets the settlement's banner colour (`fx/flag`
tinted). Everything y-sorted (`zIndex = y`).

## js/engine/roadLayer.js

```js
export class RoadLayer { constructor(PIXI, atlas, world, hexMap, quality); container /* below features */; markDirty(tileIds); markAllDirty(); update(camera, dt) }
```
Per chunk `Graphics`: rivers first (band from centre to each `riverMask`
neighbour's edge midpoint, width by `riverWidth`, light-blue core with a
darker edge, animated dashes for flow if `quality.animateWater`), then
roads (dirt band from centre to each `road` bit's edge midpoint, rounded
joins, lighter centre line), then bridge sprites where road crosses a
river tile, waterfall sprites on `feature === "waterfall"`.

## js/engine/overlayLayer.js

```js
export class OverlayLayer {
  constructor(PIXI, atlas, world, hexMap, quality, villages: () => [...])
  container                                  // above units, below labels
  setSelected(tileId|null); setHover(tileId|null)
  setLens(name|null); setPlacementGhost(ghost|null); setRoadPreview(tileIds|null)
  markDirty(tileIds); markAllDirty()
  update(camera, dt)
  flashTile(tileId, color)
}
```
Draws: territory borders (one line per edge where the owner changes, in
the owner's colour, player's gold thicker), frontier tiles (dashed white
outline, only when zoom ≥ ZOOM_FAR), seizable tiles (dashed in the
owner's colour), the fog rim (soft dark edge one hex wide around seen
tiles, none once mapmaking is unlocked), the selection (six corner
brackets, animated), the hover hex, lens overlays (yields: three small
icons+numbers per owned hex; territory: strong fills; resources: green→red
fill by amount/max; roads: connected tiles green, disconnected red), the
placement ghost (sprite at 60 % alpha, green/red tint by `valid`) and the
road preview (dashed path). All per-chunk Graphics rebuilt only when dirty.
