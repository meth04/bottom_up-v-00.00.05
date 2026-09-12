// worldGen.js (ES module)
//
// Builds a whole world from a seed: several continents on a wide sea, each
// with its own ragged coast, mountain spines, rain-shadowed deserts, cold
// northern tundra, rivers that gather tributaries on the way down to lakes
// and the sea, and a few dozen villages spread across the land — one of
// them yours, on the biggest continent, within raiding distance of a
// garlock camp.
//
// This is the multi-continent successor of js/map/worldGen.js (the single
// island generator). The good ideas from there survive — value/fractal/
// ridge noise, rivers that walk downhill, lakes that pool where they get
// stuck, marsh beside fresh water, named regions with unique names, trade
// tracks found by Dijkstra, ensureViableStart, landmark placement — but the
// map is now 86 400 hexes, so the shape of the code is different:
//
//   * Every per-tile scalar lives in a typed array indexed by
//     `row * cols + col` while the world is being built. Tile OBJECTS are
//     only created at the very end. Objects with thirty fields, Map lookups
//     keyed by "q,r" strings and closures in hot loops are what made a
//     naive port take ten seconds; typed arrays get it under two.
//   * Neighbours are looked up in a precomputed Int32Array (`nbr`, six
//     entries per tile, -1 off the edge), never recomputed.
//   * Pathfinding uses A* over a binary heap.
//
// Determinism: the same seed always gives the same world, in every browser
// and in Node. Only `createRandom` (for the few "pick one" decisions) and
// `latticeHash` (for everything per-tile) are used — never Math.random —
// and the map is always walked in the same order.
//
// This module must run inside a Web Worker: no DOM, no `window`, nothing
// imported except the pure world helpers.
//
// See docs/ARCHITECTURE.md ("js/world/worldGen.js") for the contract on
// what comes out.

import {
  HEX_DIRECTIONS,
  OPPOSITE_DIRECTION,
  colRowToAxial,
  createRandom,
  latticeHash,
  pick,
  clamp,
} from "./hexMath.js";
import { WORLD_PAD } from "./constants.js";
import {
  TERRAIN,
  TERRAIN_TYPES,
  HOMELY_TYPES,
  TERRAIN_SUPPLIES,
  LANDMARK_TYPES,
  WATER_TYPES,
} from "./terrainDefs.js";

// ---------------------------------------------------------------------------
// TUNING
// ---------------------------------------------------------------------------
//
// Distances are in HEXES unless the name says otherwise; the grid is fixed
// at 24-unit hexes now, so there is no longer a "reference grid" to scale
// against.

const SEA_MARGIN = 3;                 // hexes of guaranteed sea round the map edge
const EDGE_FALLOFF = 12;              // land gets pushed down this far in from the edge
const DEFAULT_LAND_FRACTION = 0.5;    // share of the map that is land (spec.seaLevel overrides)
const ISLAND_COUNT_MIN = 8;           // small islands and skerries out at sea
const ISLAND_COUNT_MAX = 14;
const ISLAND_SPACING = 16;
const ISLAND_CLEARANCE = 0.06;        // continent field must be below this: "open sea"

const RIVER_PER_LAND_HEXES = 900;     // about one river source per this many land hexes
const RIVER_SOURCE_SPACING = 11;
const RIVER_MAX_STEPS = 700;
const RIVER_MEANDER = 0.02;           // random wobble added to the flow field when choosing the next step
const RIVER_COAST_PULL = 0.0025;      // flow field rises this much per hex inland
const RIVER_NAME_MIN_LENGTH = 28;
const LAKE_MAX_POOL = 34;             // a river that fills a hollow this big just ends there
const LAKE_NAME_MIN_TILES = 8;
const HOLLOW_LAKES_PER_LAND_HEXES = 6000;
const WATERFALL_DROP = 0.08;
const FORD_CHANCE = 0.10;

const VILLAGE_SPACING = 14;
const VILLAGE_MIN_CONTINENT = 250;    // a landmass smaller than this gets no village
const PLAYER_COAST_MIN = 4;           // the player's home likes a shore or a river nearby...
const PLAYER_COAST_MAX = 8;
const PLAYER_RIVER_MAX = 6;
const COASTAL_VILLAGE_REACH = 8;      // a village this close to the sea gets a dock and sea lanes
const OPEN_SEA_MIN_TILES = 300;       // smaller bodies of salt water are land-locked bays: no docks
const HARBOURS_PER_CONTINENT = 3;     // villages placed by the shore first, so boats show up

const LANDMARKS_EACH = 3;
const LANDMARK_SPACING = 25;
const REGION_MIN_TILES = 60;

const PLAYER_COLOR = "#d9a441";
const GARLOCK_COLOR = "#3b2f2f";
const GARLOCK_OUTPOST_COLOR = "#4a3535";
const VILLAGE_COLORS = ["#c0392b", "#8e44ad", "#2980b9", "#16a085", "#d35400", "#7f8c8d", "#2c3e50", "#1abc9c"];
const VILLAGE_NAMES = [
  "Ashford", "Brookhollow", "Cairnwick", "Dunmere", "Elmreach", "Fernby", "Greywater", "Hollins",
  "Oakhaven", "Ironridge", "Stonegate", "Mistveil", "Riverrun", "Windshear", "Barrowfield",
  "Coldharbour", "Thornwick", "Marrowden", "Highmoor", "Saltcombe", "Netherby", "Applegarth",
  "Rookstead", "Fallowmere", "Wexbridge", "Duncarrow", "Larkhollow", "Stillwater", "Brackenfell",
  "Orley", "Pinebarrow", "Redcliffe", "Wraymouth", "Yarnwell", "Crowmarsh", "Bexhollow",
  "Tarnstead", "Gullhaven", "Merrowby", "Kestrel Cross", "Foxmere", "Hartswell", "Norburn",
  "Wolfden", "Sedgeford", "Alderholt", "Bramblegate", "Cinderbrook", "Dovecote", "Emberly",
  "Frostmere", "Gorsefield", "Heronmoor", "Ivywick", "Juniper Hall", "Kilnmouth", "Lindenreach",
  "Moorcombe", "Nettlebury", "Otterford",
];

// Continents are named like the parts of a chart: "The Sunward Reach".
const CONTINENT_ADJECTIVES = [
  "Sunward", "Windward", "Northern", "Western", "Golden", "Shattered", "Elder", "Silent",
  "Green", "Grey", "Broken", "Far", "Wandering", "Iron", "Amber", "Misty", "Storm", "Ember",
];
const CONTINENT_NOUNS_BIG = ["Reach", "Marches", "Expanse", "Holds", "Crown", "Shelf", "Mainland"];
const CONTINENT_NOUNS_SMALL = ["Isles", "Isle", "Skerries", "Shoals", "Cays"];

// Region names, by the ground that dominates them.
const REGION_WORDS = {
  mountains:   { adj: ["Iron", "Grey", "Cloudpierce", "Old", "Broken", "Giant's"], noun: ["Spine", "Teeth", "Range", "Crags", "Wall"] },
  hills:       { adj: ["Rolling", "Green", "Sheep", "Low", "Whale"], noun: ["Downs", "Hills", "Knolls", "Wolds"] },
  rockyOutcrop:{ adj: ["Flint", "Shattered", "Sunworn", "Bare"], noun: ["Screes", "Barrens", "Steps", "Rubble"] },
  cliffs:      { adj: ["White", "Gull", "Sheer", "Storm"], noun: ["Cliffs", "Heads", "Bluffs", "Stacks"] },
  snowfield:   { adj: ["White", "Silent", "Everwhite", "Frost"], noun: ["Waste", "Mantle", "Reaches", "Shroud"] },
  tundra:      { adj: ["Cold", "Thin", "Rimed", "Pale"], noun: ["Moors", "Heath", "Flats", "Fells"] },
  badlands:    { adj: ["Red", "Thirsty", "Cracked", "Bitter"], noun: ["Scar", "Waste", "Gullies", "Pan"] },
  desert:      { adj: ["Burning", "Glass", "Bone", "Endless", "Copper"], noun: ["Sands", "Dunes", "Waste", "Erg"] },
  marsh:       { adj: ["Hollow", "Slow", "Whispering", "Drowned"], noun: ["Fens", "Mire", "Sinks", "Bog"] },
  taiga:       { adj: ["Black", "Deep", "Needle", "Hushed"], noun: ["Pinewood", "Taiga", "Dark", "Stand"] },
  denseBush:   { adj: ["Tangled", "Green", "Thorn", "Close"], noun: ["Thicket", "Snarl", "Bramble", "Wilds"] },
  forest:      { adj: ["Long", "Elder", "Green", "Quiet"], noun: ["Wood", "Forest", "Glades", "Weald"] },
  birchWood:   { adj: ["White", "Silver", "Thin", "Whistling"], noun: ["Birches", "Poles", "Grove", "Stand"] },
  flowerMeadow:{ adj: ["Bright", "Bee", "Wide", "Sunlit"], noun: ["Meadows", "Lea", "Bloom", "Commons"] },
  plains:      { adj: ["Wide", "Wind", "Open", "Golden"], noun: ["Plain", "Downs", "Reach", "Sweep"] },
  overgrownHighlands: { adj: ["Stepped", "Terraced", "Green", "High"], noun: ["Shelves", "Hills", "Benches", "Rise"] },
  timbermellowForest: { adj: ["Fat", "Old", "Sweet"], noun: ["Grove", "Orchard", "Larder"] },
  ocean:       { adj: ["Grey", "Wide", "Cold", "Endless", "Sunken"], noun: ["Sea", "Water", "Deep", "Sound", "Main"] },
  beach:       { adj: ["Pale", "Long", "Shell"], noun: ["Strand", "Shore", "Sands"] },
};

// What the water gets called.
const RIVER_ADJECTIVES = ["Ash", "Cold", "Black", "Silver", "Otter", "Thorn", "Long", "Swift", "Elder", "Quiet", "Salmon", "Willow", "Rush", "Kings", "Mill"];
const RIVER_NOUNS = ["Water", "Beck", "Run", "Race", "Brook", "Rill", "Flow", "Dike", "River"];
const LAKE_ADJECTIVES = ["Still", "Deep", "Black", "Clear", "Cold", "Green", "Drowned", "Moon", "Glass"];
const LAKE_NOUNS = ["Mere", "Tarn", "Water", "Pool", "Eye", "Loch"];

// What a missing resource near a village gets turned into, and what may be
// sacrificed for it. Plains first: dry grass is the least missed.
const START_REPAIR = {
  stone: { becomes: "rockyOutcrop", sacrifice: ["plains", "flowerMeadow", "tundra", "badlands", "desert", "hills"] },
  wood:  { becomes: "forest", sacrifice: ["plains", "flowerMeadow", "tundra", "badlands", "desert", "hills"] },
  food:  { becomes: "flowerMeadow", sacrifice: ["plains", "badlands", "tundra", "desert", "rockyOutcrop"] },
};

// Where each wonder may stand. `volcano` on a mountain, `oasis` in the desert.
const LANDMARK_HOMES = {
  standingStones: ["plains", "flowerMeadow", "hills"],
  motherTree: ["forest", "denseBush", "timbermellowForest"],
  dragonBones: ["rockyOutcrop", "badlands", "desert"],
  crystalMine: ["mountains", "rockyOutcrop"],
  shipwreck: ["beach", "cliffs"],
  ruinedTower: ["tundra", "taiga", "plains", "hills"],
  hotSpring: ["snowfield", "tundra", "marsh"],
  boneOrchard: ["badlands", "beach", "desert"],
  volcano: ["mountains"],
  oasis: ["desert"],
};

// ---------------------------------------------------------------------------
// Terrain indices
// ---------------------------------------------------------------------------
//
// The per-tile terrain array holds a small integer, not a string, so the
// smoothing passes compare numbers. Names come back at the end.

const T = {};
TERRAIN_TYPES.forEach((type, index) => { T[type] = index; });
const TYPE_COUNT = TERRAIN_TYPES.length;
const IS_WATER = new Uint8Array(TYPE_COUNT);
for (const type of WATER_TYPES) IS_WATER[T[type]] = 1;
// Sea proper — what a river runs into and what shallows ring.
const IS_SEA = new Uint8Array(TYPE_COUNT);
IS_SEA[T.ocean] = 1;
IS_SEA[T.shallows] = 1;
const ROAD_COST = new Float64Array(TYPE_COUNT);
TERRAIN_TYPES.forEach((type, index) => { ROAD_COST[index] = TERRAIN[type].road; });
const HOMELY = new Uint8Array(TYPE_COUNT);
for (const type of HOMELY_TYPES) HOMELY[T[type]] = 1;
const SUPPLIES = {};
for (const resource of Object.keys(TERRAIN_SUPPLIES)) {
  SUPPLIES[resource] = new Uint8Array(TYPE_COUNT);
  for (const type of TERRAIN_SUPPLIES[resource]) SUPPLIES[resource][T[type]] = 1;
}

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

function valueNoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = latticeHash(ix, iy, seed);
  const b = latticeHash(ix + 1, iy, seed);
  const c = latticeHash(ix, iy + 1, seed);
  const d = latticeHash(ix + 1, iy + 1, seed);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

// Layered noise: broad shapes with finer detail on top. Returns 0..1.
function fractalNoise(x, y, seed, octaves) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    value += valueNoise(x * frequency, y * frequency, seed + octave * 101) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

// Ridged noise: the folds mountain ranges are made of. 1 along the crests.
function ridgeNoise(x, y, seed, octaves) {
  return 1 - Math.abs(fractalNoise(x, y, seed, octaves) * 2 - 1);
}

function smoothstep(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

// An adjective-plus-noun name that is not already on the map. Two "Moon
// Meres" on one sheet reads as a mistake rather than as a coincidence, so
// every named thing draws from the same pool of used names.
function uniqueName(used, adjectives, nouns, random) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate = `${pick(adjectives, random)} ${pick(nouns, random)}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  return null;
}

// Fisher–Yates with the seeded random, in place, on a plain or typed array.
function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = list[i];
    list[i] = list[j];
    list[j] = swap;
  }
  return list;
}

// ---------------------------------------------------------------------------
// Binary heap for A* — the old linear-scan open list was fine for a
// 3 000-hex island and hopeless for 86 400.
// ---------------------------------------------------------------------------

class MinHeap {
  constructor(capacity) {
    this.keys = new Float64Array(capacity);
    this.values = new Int32Array(capacity);
    this.size = 0;
    this.lastKey = 0;
  }

  clear() {
    this.size = 0;
  }

  push(key, value) {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.keys.length * 2);
      const values = new Int32Array(this.keys.length * 2);
      keys.set(this.keys);
      values.set(this.values);
      this.keys = keys;
      this.values = values;
    }
    let i = this.size++;
    const keys = this.keys;
    const values = this.values;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      values[i] = values[parent];
      i = parent;
    }
    keys[i] = key;
    values[i] = value;
  }

  // Returns the value with the smallest key; the key is left in `lastKey`.
  pop() {
    const keys = this.keys;
    const values = this.values;
    const result = values[0];
    this.lastKey = keys[0];
    const size = --this.size;
    if (size > 0) {
      const key = keys[size];
      const value = values[size];
      let i = 0;
      for (;;) {
        let child = i * 2 + 1;
        if (child >= size) break;
        if (child + 1 < size && keys[child + 1] < keys[child]) child++;
        if (keys[child] >= key) break;
        keys[i] = keys[child];
        values[i] = values[child];
        i = child;
      }
      keys[i] = key;
      values[i] = value;
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

// spec: { cols, rows, hexSize, seed, villageCount, continents, seaLevel? }
export function generateWorld(spec, onProgress) {
  const cols = spec.cols | 0;
  const rows = spec.rows | 0;
  const hexSize = spec.hexSize || 24;
  const seed = (spec.seed >>> 0) || 1;
  const report = typeof onProgress === "function" ? onProgress : () => {};
  const random = createRandom(seed);
  const usedNames = new Set();

  const hexWidth = Math.sqrt(3) * hexSize;
  const grid = { hexSize, originX: WORLD_PAD + hexWidth / 2, originY: WORLD_PAD + hexSize };
  // Odd rows are shifted half a hex right, so the grid is half a hex wider
  // than cols * hexWidth; the last row's bottom corner sits a hexSize below
  // its centre.
  const width = Math.round(cols * hexWidth + hexWidth / 2 + WORLD_PAD * 2);
  const height = Math.round((rows - 1) * 1.5 * hexSize + hexSize * 2 + WORLD_PAD * 2);

  report(0.02, "Laying out the grid");
  const ctx = buildGrid(cols, rows, seed, random, usedNames);
  ctx.grid = grid;

  report(0.08, "Raising the continents");
  carveLand(ctx, spec);

  report(0.18, "Charting the continents");
  findContinents(ctx);
  measureCoasts(ctx);

  report(0.26, "Folding the mountains");
  shapeElevation(ctx);

  report(0.34, "Turning the weather");
  shapeClimate(ctx);

  report(0.42, "Running the rivers");
  runRivers(ctx);

  report(0.54, "Growing the biomes");
  classifyTerrain(ctx);

  report(0.62, "Founding the villages");
  placeVillages(ctx, spec);

  report(0.70, "Marking the shores");
  finishShores(ctx);
  placeFeatures(ctx);

  report(0.76, "Raising the wonders");
  placeLandmarks(ctx);

  report(0.82, "Naming the land");
  nameRegions(ctx);
  nameWaters(ctx);

  report(0.88, "Walking the trade roads");
  buildTradeRoutes(ctx);
  buildSeaLanes(ctx);

  report(0.95, "Writing the map");
  const tiles = buildTiles(ctx);

  report(1, "Done");

  return {
    seed,
    cols,
    rows,
    grid,
    width,
    height,
    tiles,
    continents: ctx.continents.map((continent) => ({
      id: continent.id,
      name: continent.name,
      tileCount: continent.tileCount,
      center: continent.center,
      bounds: continent.bounds,
    })),
    rivers: ctx.riverList,
    lakes: ctx.lakeList,
    regions: ctx.regions,
    villages: ctx.villages,
    tradeRoutes: ctx.tradeRoutes,
    seaLanes: ctx.seaLanes,
    landmarks: ctx.landmarks,
  };
}

// ---------------------------------------------------------------------------
// Grid: coordinates and the neighbour table
// ---------------------------------------------------------------------------

function buildGrid(cols, rows, seed, random, usedNames) {
  const N = cols * rows;
  const qOf = new Int32Array(N);
  const rOf = new Int32Array(N);
  // Positions in "hex widths": a unit step sideways is one hex, so every
  // distance-flavoured tuning number above reads as hexes.
  const ux = new Float32Array(N);
  const uy = new Float32Array(N);
  const edgeDist = new Uint16Array(N);
  const nbr = new Int32Array(N * 6);
  const rowStep = 1.5 / Math.sqrt(3);   // row spacing in hex widths
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const { q } = colRowToAxial(col, row);
      qOf[i] = q;
      rOf[i] = row;
      ux[i] = col + (row & 1) * 0.5;
      uy[i] = row * rowStep;
      edgeDist[i] = Math.min(col, cols - 1 - col, row, rows - 1 - row);
      for (let d = 0; d < 6; d++) {
        const nq = q + HEX_DIRECTIONS[d].q;
        const nr = row + HEX_DIRECTIONS[d].r;
        const ncol = nq + Math.floor(nr / 2);
        nbr[i * 6 + d] = nr < 0 || nr >= rows || ncol < 0 || ncol >= cols ? -1 : nr * cols + ncol;
      }
    }
  }
  return {
    cols, rows, N, seed, random, usedNames,
    qOf, rOf, ux, uy, edgeDist, nbr,
    // Width and height of the map in hex widths, for the layout.
    unitsWide: cols,
    unitsHigh: rows * rowStep,
    land: new Uint8Array(N),
    continentOf: new Int16Array(N).fill(-1),
    coastDist: new Uint16Array(N),
    seaDist: new Uint16Array(N),
    elevation: new Float32Array(N),
    moisture: new Float32Array(N),
    temperature: new Float32Array(N),
    terrain: new Uint8Array(N),
    riverOf: new Int32Array(N).fill(-1),
    lakeOf: new Int32Array(N).fill(-1),
    nextOf: new Int32Array(N).fill(-1),
    riverMask: new Uint8Array(N),
    riverWidth: new Uint8Array(N),
    freshDist: new Uint16Array(N),
    villageOf: new Int16Array(N).fill(-1),
    feature: new Uint8Array(N),          // index into FEATURE_NAMES
    landmarkOf: new Int8Array(N).fill(-1),
    regionOf: new Int32Array(N).fill(-1),
    snowCapped: new Uint8Array(N),
    coastal: new Uint8Array(N),
    openSea: new Uint8Array(N),          // 1 on sea hexes that belong to a big, connected body of water
    // Scratch arrays shared by the BFS/A* passes.
    queue: new Int32Array(N),
    stamp: new Int32Array(N),
    stampValue: 0,
    gScore: new Float64Array(N),
    cameFrom: new Int32Array(N),
    heap: new MinHeap(4096),
    continents: [],
    rivers: [],
    lakes: [],
    riverList: [],
    lakeList: [],
    regions: [],
    villages: [],
    tradeRoutes: [],
    seaLanes: [],
    landmarks: [],
  };
}

const FEATURE_NAMES = [null, "waterfall", "oasis", "reef", "hotSpring", "ford"];
const F = { waterfall: 1, oasis: 2, reef: 3, hotSpring: 4, ford: 5 };

// ---------------------------------------------------------------------------
// Land and sea
// ---------------------------------------------------------------------------

// Where the continents go. The map is cut into a grid of cells with as
// little waste as possible (2x2 for four continents, 3x1 for three) and
// each continent is dropped somewhere near the middle of its cell. That
// guarantees spacing without a rejection loop that could fail on an
// unlucky seed.
function layoutContinents(ctx, count) {
  const { random, unitsWide: W, unitsHigh: H } = ctx;
  let best = null;
  for (let gridCols = 1; gridCols <= count; gridCols++) {
    const gridRows = Math.ceil(count / gridCols);
    const waste = gridCols * gridRows - count;
    const cellAspect = (W / gridCols) / (H / gridRows);
    const score = waste * 0.5 + Math.abs(Math.log(cellAspect));
    if (!best || score < best.score) best = { gridCols, gridRows, score };
  }
  const { gridCols, gridRows } = best;
  const cellW = W / gridCols;
  const cellH = H / gridRows;
  const cells = [];
  for (let y = 0; y < gridRows; y++) for (let x = 0; x < gridCols; x++) cells.push({ x, y });
  shuffle(cells, random);

  const blobs = [];
  for (let c = 0; c < count; c++) {
    const cell = cells[c];
    const cx = (cell.x + 0.5) * cellW + (random() - 0.5) * cellW * 0.2;
    const cy = (cell.y + 0.5) * cellH + (random() - 0.5) * cellH * 0.2;
    // The main body fills most of its cell; the coast noise and the
    // threshold search decide exactly where the water line falls.
    const rx = cellW * 0.46 * (0.85 + random() * 0.25);
    const ry = cellH * 0.46 * (0.85 + random() * 0.25);
    blobs.push({ cx, cy, rx, ry, weight: 1 });
    // Satellite lobes make peninsulas, bays and the odd isthmus.
    const lobes = 3 + Math.floor(random() * 3);
    for (let k = 0; k < lobes; k++) {
      const angle = random() * Math.PI * 2;
      const reach = 0.35 + random() * 0.45;
      const size = 0.3 + random() * 0.35;
      blobs.push({
        cx: cx + Math.cos(angle) * rx * reach,
        cy: cy + Math.sin(angle) * ry * reach,
        rx: rx * size * (0.8 + random() * 0.6),
        ry: ry * size * (0.8 + random() * 0.6),
        weight: 0.8 + random() * 0.3,
      });
    }
  }
  return blobs;
}

function carveLand(ctx, spec) {
  const { N, seed, random, ux, uy, edgeDist, nbr, land } = ctx;
  const continentCount = clamp(spec.continents | 0 || 4, 1, 8);
  const landFraction = clamp(spec.seaLevel !== undefined ? 1 - spec.seaLevel : DEFAULT_LAND_FRACTION, 0.2, 0.7);
  const blobs = layoutContinents(ctx, continentCount);

  // The continent field: how deep inside a continent blob each hex is,
  // domain-warped so the blobs stop looking like ellipses, then given a
  // ragged coast by fractal noise that only bites where there is a blob
  // to bite (otherwise open sea would be freckled with specks).
  const field = new Float32Array(N);
  const blobField = new Float32Array(N);
  let fieldMin = Infinity;
  let fieldMax = -Infinity;
  for (let i = 0; i < N; i++) {
    const x = ux[i];
    const y = uy[i];
    const wx = x + (fractalNoise(x / 70 + 3.1, y / 70 + 7.7, seed + 901, 2) - 0.5) * 44;
    const wy = y + (fractalNoise(x / 70 + 9.4, y / 70 + 1.3, seed + 907, 2) - 0.5) * 44;
    let blob = 0;
    for (let b = 0; b < blobs.length; b++) {
      const B = blobs[b];
      const dx = (wx - B.cx) / B.rx;
      const dy = (wy - B.cy) / B.ry;
      const value = (1 - Math.sqrt(dx * dx + dy * dy)) * B.weight;
      if (value > blob) blob = value;
    }
    blobField[i] = blob;
    const coast = fractalNoise(x / 15 + 11.3, y / 15 + 5.1, seed + 31, 4) - 0.5;
    let value = blob + coast * 0.7 * smoothstep(blob / 0.4);
    // The sea margin: nothing lives on the rim of the paper.
    const edge = edgeDist[i];
    if (edge < SEA_MARGIN) value = -1;
    else if (edge < EDGE_FALLOFF) value -= (1 - (edge - SEA_MARGIN) / (EDGE_FALLOFF - SEA_MARGIN)) * 0.5;
    field[i] = value;
    if (value < fieldMin) fieldMin = value;
    if (value > fieldMax) fieldMax = value;
  }

  // Pick the water line by percentile so the land share is what was asked
  // for, whatever shape the blobs happened to take.
  const BINS = 2048;
  const histogram = new Int32Array(BINS);
  const scale = (BINS - 1) / (fieldMax - fieldMin || 1);
  for (let i = 0; i < N; i++) histogram[Math.floor((field[i] - fieldMin) * scale)]++;
  let wanted = Math.round(N * landFraction);
  let bin = BINS - 1;
  while (bin > 0 && wanted > 0) { wanted -= histogram[bin]; bin--; }
  const threshold = fieldMin + bin / scale;
  for (let i = 0; i < N; i++) land[i] = field[i] > threshold ? 1 : 0;

  // Islands and skerries out in the open sea, where no continent reaches.
  const islandCount = ISLAND_COUNT_MIN + Math.floor(random() * (ISLAND_COUNT_MAX - ISLAND_COUNT_MIN + 1));
  const islands = [];
  const openSea = [];
  for (let i = 0; i < N; i += 7) {
    if (!land[i] && blobField[i] < ISLAND_CLEARANCE && edgeDist[i] >= EDGE_FALLOFF) openSea.push(i);
  }
  shuffle(openSea, random);
  for (const centre of openSea) {
    if (islands.length >= islandCount) break;
    let clear = true;
    for (const other of islands) {
      if (Math.abs(ux[other.centre] - ux[centre]) + Math.abs(uy[other.centre] - uy[centre]) < ISLAND_SPACING) { clear = false; break; }
    }
    if (!clear) continue;
    islands.push({ centre, radius: 1 + Math.floor(random() * 5) });
  }
  for (const island of islands) {
    const cq = ctx.qOf[island.centre];
    const cr = ctx.rOf[island.centre];
    const R = island.radius + 1;
    // Walk the bounding box of the island's spiral.
    for (let dr = -R; dr <= R; dr++) {
      for (let dq = -R; dq <= R; dq++) {
        const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
        if (dist > R) continue;
        const r = cr + dr;
        const col = cq + dq + Math.floor(r / 2);
        if (r < 0 || r >= ctx.rows || col < 0 || col >= ctx.cols) continue;
        const i = r * ctx.cols + col;
        if (edgeDist[i] < SEA_MARGIN) continue;
        const shape = 1 - dist / (island.radius + 0.5) + (fractalNoise(ux[i] / 4 + 2.2, uy[i] / 4 + 8.8, seed + 77, 2) - 0.5) * 0.8;
        if (shape > 0.15) land[i] = 1;
      }
    }
  }

  // A lone hex of sea inside the land is a pond nobody drew; a lone hex of
  // land at sea is a rock. Both read as noise, so they go.
  const before = land.slice();
  for (let i = 0; i < N; i++) {
    let wet = 0;
    let n = 0;
    for (let d = 0; d < 6; d++) {
      const j = nbr[i * 6 + d];
      if (j < 0) continue;
      n++;
      if (!before[j]) wet++;
    }
    if (before[i] && wet >= 5) land[i] = 0;
    else if (!before[i] && wet === 0 && n === 6 && edgeDist[i] >= SEA_MARGIN) land[i] = 1;
  }
}

// Flood-fills the land into continents, biggest first (id 0 is the biggest,
// which is where the player goes). Islands get their own ids.
function findContinents(ctx) {
  const { N, nbr, land, continentOf, queue, ux, uy, random, usedNames } = ctx;
  const bodies = [];
  for (let start = 0; start < N; start++) {
    if (!land[start] || continentOf[start] >= 0) continue;
    const mark = bodies.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    continentOf[start] = mark;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    while (head < tail) {
      const i = queue[head++];
      count++;
      sumX += ux[i];
      sumY += uy[i];
      if (ux[i] < minX) minX = ux[i];
      if (ux[i] > maxX) maxX = ux[i];
      if (uy[i] < minY) minY = uy[i];
      if (uy[i] > maxY) maxY = uy[i];
      for (let d = 0; d < 6; d++) {
        const j = nbr[i * 6 + d];
        if (j < 0 || !land[j] || continentOf[j] >= 0) continue;
        continentOf[j] = mark;
        queue[tail++] = j;
      }
    }
    bodies.push({ mark, tileCount: count, sumX, sumY, minX, maxX, minY, maxY });
  }
  bodies.sort((a, b) => b.tileCount - a.tileCount);
  const remap = new Int16Array(bodies.length);
  bodies.forEach((body, id) => { remap[body.mark] = id; });
  for (let i = 0; i < N; i++) if (continentOf[i] >= 0) continentOf[i] = remap[continentOf[i]];

  const toWorld = (x, y) => ({ x: ctx.grid.originX + x * Math.sqrt(3) * ctx.grid.hexSize, y: ctx.grid.originY + y * Math.sqrt(3) * ctx.grid.hexSize });
  // Each continent gets its own adjective — "The Sunward Reach" next to
  // "The Sunward Isles" reads like one place.
  const adjectives = shuffle(CONTINENT_ADJECTIVES.slice(), random);
  ctx.continents = bodies.map((body, id) => {
    // Only landmasses worth a village are worth a name; skerries stay
    // nameless so the label layer is not littered.
    let name = null;
    if (body.tileCount >= VILLAGE_MIN_CONTINENT) {
      const nouns = body.tileCount >= 3000 ? CONTINENT_NOUNS_BIG : CONTINENT_NOUNS_SMALL;
      const adjective = adjectives.length ? adjectives.pop() : pick(CONTINENT_ADJECTIVES, random);
      name = uniqueName(usedNames, [adjective], nouns, random) || uniqueName(usedNames, CONTINENT_ADJECTIVES, nouns, random);
      if (name) name = `The ${name}`;
    }
    const min = toWorld(body.minX, body.minY);
    const max = toWorld(body.maxX, body.maxY);
    return {
      id,
      name,
      tileCount: body.tileCount,
      center: toWorld(body.sumX / body.tileCount, body.sumY / body.tileCount),
      bounds: { minX: min.x, minY: min.y, maxX: max.x, maxY: max.y },
      homes: [],
    };
  });
}

// Multi-source BFS: distance from every land hex to the sea (coastDist) and
// from every sea hex to the land (seaDist). Both feed elevation (coasts sit
// low), moisture (coasts are wet), deserts (interior only) and shallows.
function measureCoasts(ctx) {
  const { land, coastDist, seaDist } = ctx;
  bfsDistance(ctx, coastDist, (i) => !land[i], (i) => land[i] === 1);
  bfsDistance(ctx, seaDist, (i) => land[i] === 1, (i) => !land[i]);
}

// Fills `out` with hex distance from the nearest seed (0 on seeds), walking
// only through tiles `passable` allows. Unreached tiles get 65535.
function bfsDistance(ctx, out, isSeed, passable) {
  const { N, nbr, queue } = ctx;
  out.fill(65535);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < N; i++) {
    if (isSeed(i)) { out[i] = 0; queue[tail++] = i; }
  }
  while (head < tail) {
    const i = queue[head++];
    const next = out[i] + 1;
    for (let d = 0; d < 6; d++) {
      const j = nbr[i * 6 + d];
      if (j < 0 || out[j] !== 65535 || !passable(j)) continue;
      out[j] = next;
      queue[tail++] = j;
    }
  }
}

// ---------------------------------------------------------------------------
// Elevation and climate
// ---------------------------------------------------------------------------

function shapeElevation(ctx) {
  const { N, seed, ux, uy, land, coastDist, elevation } = ctx;
  for (let i = 0; i < N; i++) {
    if (!land[i]) { elevation[i] = 0; continue; }
    const x = ux[i];
    const y = uy[i];
    const rolling = fractalNoise(x / 20, y / 20, seed, 4);
    // Ridges are folded along warped lines so ranges bend like real ones,
    // and masked by a very broad noise so only some parts of a continent
    // are mountainous — an evenly crinkled continent reads as static.
    const bend = (fractalNoise(x / 55 + 4.2, y / 55 + 2.9, seed + 113, 2) - 0.5) * 18;
    const ridge = ridgeNoise((x + bend) / 34 + 5.5, (y - bend) / 34 + 2.2, seed + 53, 3);
    const rangeMask = smoothstep((fractalNoise(x / 75 + 21.1, y / 75 + 17.3, seed + 59, 2) - 0.38) / 0.3);
    // Land sinks towards the water, so beaches and river mouths sit low —
    // except along "high coasts" where the range runs straight into the
    // sea and the shore is cliff.
    const highCoast = smoothstep((fractalNoise(x / 40 + 33.3, y / 40 + 8.1, seed + 67, 2) - 0.54) / 0.12);
    let interior = smoothstep(coastDist[i] / 7);
    interior = interior + (1 - interior) * highCoast * 0.85;
    let e = 0.1 + rolling * 0.42 + Math.pow(ridge, 2.4) * 0.72 * rangeMask;
    e *= 0.3 + 0.7 * interior;
    elevation[i] = clamp(e, 0.02, 1);
  }
}

function shapeClimate(ctx) {
  const { N, cols, rows, seed, ux, uy, rOf, land, coastDist, elevation, moisture, temperature } = ctx;
  // Temperature: cold at the top of the sheet, hot at the bottom, colder
  // on high ground, with some weather-scale noise.
  for (let i = 0; i < N; i++) {
    const latitude = rOf[i] / Math.max(1, rows - 1);
    let t = 0.1 + latitude * 1.0;
    t += (fractalNoise(ux[i] / 24 + 71.4, uy[i] / 24 + 13.9, seed + 17, 2) - 0.5) * 0.2;
    t -= elevation[i] * 0.22;
    temperature[i] = clamp(t, 0, 1);
  }
  // Moisture: noise, plus the sea's breath near the coast, then the rain
  // shadow. The wind blows from the west: a range wets its western slopes
  // and leaves a dry band to its east, so each row is scanned left to
  // right carrying "how much mountain is upwind" and right to left
  // carrying "how close is a range downwind" (the windward slopes).
  for (let i = 0; i < N; i++) {
    let m = fractalNoise(ux[i] / 26 + 37.2, uy[i] / 26 + 91.7, seed + 7, 3) * 0.72 + 0.1;
    if (land[i]) m += 0.24 * (1 - Math.min(coastDist[i], 12) / 12);
    moisture[i] = m;
  }
  for (let row = 0; row < rows; row++) {
    let shadow = 0;
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const e = land[i] ? elevation[i] : 0;
      // Anything mountainous adds to the shadow; it fades over ~12 hexes.
      const peak = e > 0.6 ? (e - 0.6) * 2.5 : 0;
      shadow = Math.max(shadow * 0.92, peak);
      if (!land[i]) shadow *= 0.8;   // the sea refills the air quickly
      moisture[i] -= shadow * 0.3;
    }
    let windward = 0;
    for (let col = cols - 1; col >= 0; col--) {
      const i = row * cols + col;
      const e = land[i] ? elevation[i] : 0;
      const peak = e > 0.62 ? (e - 0.62) * 2.5 : 0;
      windward = Math.max(windward * 0.7, peak);
      moisture[i] += windward * 0.18;
    }
  }
  for (let i = 0; i < N; i++) moisture[i] = clamp(moisture[i], 0, 1);
}

// ---------------------------------------------------------------------------
// Rivers and lakes
// ---------------------------------------------------------------------------
//
// A river starts high and wet and walks to the lowest neighbour with a
// little wobble so it meanders. When every way is up it pools: a lake
// grows through the lowest rim hexes until one of them is lower than the
// water — the spill — and the river carries on from there. Rivers that
// run into another river or a lake join it; the joined water grows wider
// downstream (flow accumulation).

function runRivers(ctx) {
  const { N, seed, random, nbr, land, elevation, moisture, coastDist, edgeDist, riverOf, lakeOf, nextOf, riverMask, stamp } = ctx;

  let landCount = 0;
  for (let i = 0; i < N; i++) landCount += land[i];
  const wantedRivers = Math.max(4, Math.round(landCount / RIVER_PER_LAND_HEXES));

  // Rivers do not read the raw elevation: its fine-grained bumps would trap
  // them in a puddle every few hexes. They follow a smoothed copy with a
  // gentle pull towards the coast — real drainage basins slope to the sea
  // over distances our noise knows nothing about.
  const flow = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!land[i]) { flow[i] = -1; continue; }
    let sum = elevation[i] * 2;
    let n = 2;
    for (let d = 0; d < 6; d++) {
      const j = nbr[i * 6 + d];
      if (j < 0) continue;
      sum += land[j] ? elevation[j] : 0;
      n++;
    }
    flow[i] = sum / n + coastDist[i] * RIVER_COAST_PULL;
  }
  ctx.flow = flow;

  // Sources: high, moist, and well inland (a river three hexes long is a
  // ditch). Sampled every 5th tile to keep the candidate list small.
  const candidates = [];
  for (let i = 0; i < N; i += 5) {
    if (!land[i] || elevation[i] < 0.52 || elevation[i] > 0.88 || moisture[i] < 0.4 || coastDist[i] < 10) continue;
    candidates.push(i);
  }
  shuffle(candidates, random);
  // Deep-interior sources first (with a little jitter so it is not always
  // the very middle): a river born ten hexes from the sea is a brook.
  const depthOf = new Map(candidates.map((i) => [i, coastDist[i] + random() * 10]));
  candidates.sort((a, b) => depthOf.get(b) - depthOf.get(a));
  const sources = [];
  for (const candidate of candidates) {
    if (sources.length >= wantedRivers) break;
    let clear = true;
    for (const source of sources) {
      if (hexDist(ctx, source, candidate) < RIVER_SOURCE_SPACING) { clear = false; break; }
    }
    if (clear) sources.push(candidate);
  }

  const rivers = ctx.rivers;
  const lakes = ctx.lakes;

  for (const source of sources) {
    const riverIndex = rivers.length;
    const mark = ++ctx.stampValue;
    const path = [];
    let current = source;
    let reachedWater = false;
    let ended = false;

    const claim = (i) => {
      path.push(i);
      riverOf[i] = riverIndex;
      stamp[i] = mark;
    };
    claim(current);

    for (let step = 0; step < RIVER_MAX_STEPS && !ended; step++) {
      let best = -1;
      let bestScore = Infinity;
      let sea = -1;
      let joinRiver = -1;
      let joinLake = -1;
      for (let d = 0; d < 6; d++) {
        const j = nbr[current * 6 + d];
        if (j < 0) continue;
        if (!land[j]) { sea = j; break; }
        // Our own path and our own lakes are stamped: never flow back into
        // them, or the river would loop.
        if (stamp[j] === mark) continue;
        if (riverOf[j] >= 0 && riverOf[j] !== riverIndex) { joinRiver = j; break; }
        if (lakeOf[j] >= 0) { joinLake = j; continue; }
        const score = flow[j] + latticeHash(j, step, seed + 401) * RIVER_MEANDER;
        if (score < bestScore) { bestScore = score; best = j; }
      }
      if (sea >= 0) {
        setFlow(ctx, current, sea);
        reachedWater = true;
        break;
      }
      if (joinRiver >= 0) {
        setFlow(ctx, current, joinRiver);
        reachedWater = true;
        break;
      }
      if (joinLake >= 0) {
        setFlow(ctx, current, joinLake);
        // For flow accumulation the water carries on out of the lake.
        nextOf[current] = lakes[lakeOf[joinLake]].outlet;
        reachedWater = true;
        break;
      }
      if (best < 0 || flow[best] > flow[current] + 0.001) {
        // Stuck in a hollow: pool. The hex we are on becomes the lake's
        // first tile, so the last river tile before it flows into water.
        path.pop();
        riverOf[current] = -1;
        const previous = path.length ? path[path.length - 1] : -1;
        const pool = growLake(ctx, current, mark, riverIndex);
        if (pool.kind === "spill") {
          if (previous >= 0) nextOf[previous] = pool.spill;
          current = pool.spill;
          claim(current);
          riverMask[current] |= 1 << dirBetween(ctx, current, pool.via);
          continue;
        }
        if (pool.kind === "join") {
          if (previous >= 0) nextOf[previous] = pool.outlet;
          reachedWater = true;
        } else if (pool.kind === "sea") {
          reachedWater = true;
        } else {
          // The hollow was too big to fill: the river ends in the lake.
          reachedWater = true;
        }
        ended = true;
        break;
      }
      setFlow(ctx, current, best);
      current = best;
      claim(current);
      if (edgeDist[current] < SEA_MARGIN) break;
    }

    if (path.length < 3) {
      // Too short to be a river. Un-claim it (any lake it made stays), and
      // take back the bit the river it joined got pointing at its mouth.
      for (const i of path) {
        riverOf[i] = -1;
        nextOf[i] = -1;
        riverMask[i] = 0;
        for (let d = 0; d < 6; d++) {
          const k = nbr[i * 6 + d];
          if (k >= 0 && riverOf[k] >= 0) riverMask[k] &= ~(1 << OPPOSITE_DIRECTION[d]);
        }
      }
      rivers.push(null);
      continue;
    }
    rivers.push({ index: riverIndex, path, reachedWater });
  }

  // A few closed hollows become lakes on their own — still water in a wet
  // lowland with no river feeding it.
  const hollowCount = Math.round(landCount / HOLLOW_LAKES_PER_LAND_HEXES);
  const hollows = [];
  for (let i = 3; i < N; i += 5) {
    if (!land[i] || elevation[i] > 0.4 || moisture[i] < 0.55 || coastDist[i] < 6 || riverOf[i] >= 0 || lakeOf[i] >= 0) continue;
    hollows.push(i);
  }
  shuffle(hollows, random);
  const placed = [];
  for (const hollow of hollows) {
    if (placed.length >= hollowCount) break;
    if (riverOf[hollow] >= 0 || lakeOf[hollow] >= 0) continue;
    let clear = true;
    for (const other of placed) if (hexDist(ctx, other, hollow) < 20) { clear = false; break; }
    if (!clear) continue;
    let nearWater = false;
    for (let d = 0; d < 6 && !nearWater; d++) {
      const j = nbr[hollow * 6 + d];
      if (j >= 0 && (riverOf[j] >= 0 || lakeOf[j] >= 0)) nearWater = true;
    }
    if (nearWater) continue;
    const wanted = 4 + Math.floor(random() * 9);
    growStillLake(ctx, hollow, wanted);
    placed.push(hollow);
  }

  // Flow accumulation: every source walks down `nextOf`, counting how many
  // sources feed each tile and how far the water has already come.
  const sourceCount = new Uint16Array(N);
  const reach = new Uint16Array(N);
  for (const river of rivers) {
    if (!river) continue;
    let i = river.path[0];
    let steps = 0;
    let guard = 0;
    while (i >= 0 && guard++ < 4000) {
      sourceCount[i]++;
      if (steps > reach[i]) reach[i] = steps;
      steps++;
      i = nextOf[i];
    }
  }
  const { riverWidth } = ctx;
  for (let i = 0; i < N; i++) {
    if (riverOf[i] < 0) continue;
    // Continents are ~100 hexes across, so a 40-hex river is a long one.
    let w = 1;
    if (sourceCount[i] >= 2 || reach[i] >= 18) w = 2;
    if ((sourceCount[i] >= 3 && reach[i] >= 28) || reach[i] >= 45) w = 3;
    riverWidth[i] = w;
  }

  // Distance to fresh water, for marsh, oases and the player's start.
  bfsDistance(ctx, ctx.freshDist, (i) => riverOf[i] >= 0 || lakeOf[i] >= 0, (i) => land[i] === 1);
}

// Records that water flows from a to its neighbour b: the downstream link
// and the river-mask bits on both ends (only river tiles carry masks — a
// lake or the sea is drawn as a body of water, not as a channel).
function setFlow(ctx, a, b) {
  const d = dirBetween(ctx, a, b);
  if (d < 0) return;
  ctx.nextOf[a] = b;
  ctx.riverMask[a] |= 1 << d;
  // b is either a river tile already or the tile the walk claims next;
  // lakes and the sea get no mask (they are bodies, not channels).
  if (ctx.land[b] && ctx.lakeOf[b] < 0) ctx.riverMask[b] |= 1 << OPPOSITE_DIRECTION[d];
}

function dirBetween(ctx, a, b) {
  for (let d = 0; d < 6; d++) if (ctx.nbr[a * 6 + d] === b) return d;
  return -1;
}

function hexDist(ctx, a, b) {
  const dq = ctx.qOf[a] - ctx.qOf[b];
  const dr = ctx.rOf[a] - ctx.rOf[b];
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// Fills a hollow from `start` upward until the water finds a way out.
// Returns { kind: "spill", spill, via } when a rim hex lower than the water
// is found (the river continues from `spill`, entering it from lake tile
// `via`), { kind: "join", outlet } when the rim touches another river or
// lake, { kind: "sea" } when it touches the sea, or { kind: "full" } when
// the hollow is bigger than a river can fill.
function growLake(ctx, start, mark, riverIndex) {
  const { nbr, land, flow, riverOf, lakeOf, nextOf, stamp, lakes } = ctx;
  const lakeIndex = lakes.length;
  const lake = { index: lakeIndex, tiles: [start], outlet: -1 };
  lakes.push(lake);
  lakeOf[start] = lakeIndex;
  stamp[start] = mark;
  let level = flow[start];

  for (;;) {
    let lowest = -1;
    let lowestElevation = Infinity;
    let via = -1;
    for (const i of lake.tiles) {
      for (let d = 0; d < 6; d++) {
        const j = nbr[i * 6 + d];
        if (j < 0 || lakeOf[j] === lakeIndex) continue;
        // The sea and other water are always the way out.
        const e = land[j] ? flow[j] : -1;
        if (e < lowestElevation) { lowestElevation = e; lowest = j; via = i; }
      }
    }
    if (lowest < 0) return { kind: "full", lakeIndex };
    if (!land[lowest]) return { kind: "sea", lakeIndex };
    if (riverOf[lowest] >= 0 && riverOf[lowest] !== riverIndex) {
      lake.outlet = lowest;
      return { kind: "join", lakeIndex, outlet: lowest };
    }
    if (lakeOf[lowest] >= 0) {
      lake.outlet = lakes[lakeOf[lowest]].outlet;
      return { kind: "join", lakeIndex, outlet: lake.outlet };
    }
    if (stamp[lowest] === mark) {
      // Our own upstream path: the wobble put a bend below the water line.
      // Absorb it into the lake rather than looping the river into itself.
      riverOf[lowest] = -1;
      nextOf[lowest] = -1;
      ctx.riverMask[lowest] = 0;
      lake.tiles.push(lowest);
      lakeOf[lowest] = lakeIndex;
      if (lowestElevation > level) level = lowestElevation;
      if (lake.tiles.length > LAKE_MAX_POOL) return { kind: "full", lakeIndex };
      continue;
    }
    if (lowestElevation < level) {
      lake.outlet = lowest;
      return { kind: "spill", lakeIndex, spill: lowest, via };
    }
    lake.tiles.push(lowest);
    lakeOf[lowest] = lakeIndex;
    stamp[lowest] = mark;
    level = lowestElevation;
    if (lake.tiles.length > LAKE_MAX_POOL) return { kind: "full", lakeIndex };
  }
}

// A lake with no river: grows through the lowest ground to `wanted` hexes.
function growStillLake(ctx, start, wanted) {
  const { nbr, land, flow: elevation, riverOf, lakeOf, lakes } = ctx;
  const lakeIndex = lakes.length;
  const lake = { index: lakeIndex, tiles: [start], outlet: -1 };
  lakes.push(lake);
  lakeOf[start] = lakeIndex;
  while (lake.tiles.length < wanted) {
    let lowest = -1;
    let lowestElevation = Infinity;
    for (const i of lake.tiles) {
      for (let d = 0; d < 6; d++) {
        const j = nbr[i * 6 + d];
        if (j < 0 || !land[j] || lakeOf[j] >= 0 || riverOf[j] >= 0) continue;
        if (elevation[j] < lowestElevation) { lowestElevation = elevation[j]; lowest = j; }
      }
    }
    if (lowest < 0) break;
    lake.tiles.push(lowest);
    lakeOf[lowest] = lakeIndex;
  }
}

// ---------------------------------------------------------------------------
// Biomes
// ---------------------------------------------------------------------------

function classifyTerrain(ctx) {
  const { N, seed, ux, uy, nbr, land, elevation, moisture, temperature, coastDist, riverOf, lakeOf, terrain } = ctx;

  // First pass: mountains, so the passes that follow can ask "is there rock
  // next door".
  for (let i = 0; i < N; i++) {
    if (!land[i]) { terrain[i] = T.ocean; continue; }
    if (lakeOf[i] >= 0) { terrain[i] = T.lake; continue; }
    if (riverOf[i] >= 0) { terrain[i] = T.river; continue; }
    terrain[i] = elevation[i] > 0.74 ? T.mountains : 255;
  }
  // rockNear: 1 = touching a mountain, 2 = two hexes away. Hills belt the
  // ranges; scree lies right under the peaks.
  const rockNear = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (terrain[i] !== T.mountains) continue;
    for (let d = 0; d < 6; d++) {
      const j = nbr[i * 6 + d];
      if (j >= 0 && rockNear[j] === 0 && terrain[j] !== T.mountains) rockNear[j] = 1;
    }
  }
  for (let i = 0; i < N; i++) {
    if (rockNear[i] !== 1) continue;
    for (let d = 0; d < 6; d++) {
      const j = nbr[i * 6 + d];
      if (j >= 0 && rockNear[j] === 0 && terrain[j] !== T.mountains) rockNear[j] = 2;
    }
  }

  for (let i = 0; i < N; i++) {
    if (terrain[i] !== 255) continue;
    const hillNoise = fractalNoise(ux[i] / 9 + 51.7, uy[i] / 9 + 44.1, seed + 23, 2);
    const patchNoise = fractalNoise(ux[i] / 11 + 12.5, uy[i] / 11 + 61.9, seed + 29, 2);
    terrain[i] = classifyLand(elevation[i], moisture[i], temperature[i], coastDist[i], rockNear[i], hillNoise, patchNoise);
  }

  // Beside fresh water: marsh in the wet lowlands, terraces on the slopes,
  // an oasis-to-be where a river crosses the desert (features come later).
  for (let i = 0; i < N; i++) {
    const t = terrain[i];
    if (!land[i] || IS_WATER[t] || t === T.mountains) continue;
    let besideFresh = false;
    for (let d = 0; d < 6; d++) {
      const j = nbr[i * 6 + d];
      if (j >= 0 && (riverOf[j] >= 0 || lakeOf[j] >= 0)) { besideFresh = true; break; }
    }
    if (!besideFresh) continue;
    if (elevation[i] < 0.4 && moisture[i] > 0.5 && temperature[i] > 0.2 && temperature[i] < 0.9) terrain[i] = T.marsh;
    else if (elevation[i] > 0.48 && elevation[i] <= 0.64 && t !== T.desert && t !== T.snowfield) terrain[i] = T.overgrownHighlands;
  }

  // The shore: what the sea actually touches. Low shores are beaches, high
  // ones are cliffs. Done before villages so a home is never founded on
  // ground that is about to become sand.
  shoreTerrain(ctx);

  smoothSpecks(ctx);
}

// Which ground a dry hex carries, from its height, wet, warmth, distance to
// the coast, nearness to rock and two bits of texture noise.
function classifyLand(e, m, t, coast, rockNear, hillNoise, patchNoise) {
  if (e > 0.74) return T.mountains;
  if (e > 0.64) {
    if (t < 0.1) return T.snowfield;
    return hillNoise > 0.55 ? T.hills : T.rockyOutcrop;
  }
  // Scree directly under the peaks, a belt of hills around the range.
  if (rockNear === 1 && e > 0.56) return T.rockyOutcrop;
  if (rockNear >= 1 && e > 0.44) return T.hills;

  if (t < 0.08) return T.snowfield;
  if (t < 0.18) return T.tundra;
  if (t < 0.34 && m > 0.5) return T.taiga;

  // The hot, dry end: desert deep inland, badlands where it is a little
  // wetter or near rock.
  if (t > 0.78 && m < 0.42 && coast >= 3) return T.desert;
  if (t > 0.74 && m < 0.48) return T.badlands;

  // Rolling country away from the ranges.
  if (hillNoise > 0.66 && e > 0.42) return T.hills;

  if (m > 0.7 && e < 0.36) return T.marsh;
  if (m > 0.62) return T.denseBush;
  if (m > 0.5) {
    if (t > 0.38 && t < 0.72 && patchNoise > 0.64) return T.timbermellowForest;
    return t < 0.46 ? T.birchWood : T.forest;
  }
  if (m > 0.42) return T.flowerMeadow;
  if (e > 0.52 && hillNoise > 0.5) return T.overgrownHighlands;
  return T.plains;
}

function shoreTerrain(ctx) {
  const { N, nbr, land, elevation, terrain, villageOf } = ctx;
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    const t = terrain[i];
    if (IS_WATER[t] || t === T.mountains || villageOf[i] >= 0) continue;
    let touchesSea = false;
    for (let d = 0; d < 6; d++) {
      const j = nbr[i * 6 + d];
      if (j >= 0 && !land[j]) { touchesSea = true; break; }
    }
    if (!touchesSea) continue;
    if (elevation[i] > 0.55) terrain[i] = T.cliffs;
    else if (elevation[i] < 0.38) terrain[i] = T.beach;
  }
}

// A lone hex of one ground surrounded by five or six of another becomes
// that other — except mountains, which are allowed to stand alone as a
// crag, and water/villages, which mean something.
function smoothSpecks(ctx) {
  const { N, nbr, land, terrain, villageOf } = ctx;
  const before = terrain.slice();
  const counts = new Uint8Array(TYPE_COUNT);
  for (let i = 0; i < N; i++) {
    const t = before[i];
    if (!land[i] || IS_WATER[t] || t === T.mountains || villageOf[i] >= 0) continue;
    let same = 0;
    let bestType = -1;
    let bestCount = 0;
    for (let d = 0; d < 6; d++) {
      const j = nbr[i * 6 + d];
      if (j < 0) continue;
      const u = before[j];
      if (u === t) { same++; continue; }
      if (IS_WATER[u]) continue;
      const c = ++counts[u];
      if (c > bestCount) { bestCount = c; bestType = u; }
    }
    for (let d = 0; d < 6; d++) {
      const j = nbr[i * 6 + d];
      if (j >= 0) counts[before[j]] = 0;
    }
    if (same === 0 && bestCount >= 5) terrain[i] = bestType;
  }
}

// ---------------------------------------------------------------------------
// Villages
// ---------------------------------------------------------------------------

function placeVillages(ctx, spec) {
  const { N, random, land, terrain, continentOf, coastDist, freshDist, temperature, edgeDist, villageOf, continents } = ctx;
  const villageCount = Math.max(1, spec.villageCount | 0 || 42);

  // Homely ground, bucketed by continent. Sizeable landmasses only.
  const candidatesByContinent = continents.map(() => []);
  for (let i = 0; i < N; i++) {
    if (!land[i] || !HOMELY[terrain[i]] || edgeDist[i] < SEA_MARGIN) continue;
    if (temperature[i] < 0.18 || temperature[i] > 0.88) continue;
    const c = continentOf[i];
    if (c < 0 || continents[c].tileCount < VILLAGE_MIN_CONTINENT) continue;
    candidatesByContinent[c].push(i);
  }
  // Shuffle, then float a few shore-side candidates to the front of each
  // list: a continent whose villages all sit inland never launches a boat.
  for (let c = 0; c < candidatesByContinent.length; c++) {
    const list = shuffle(candidatesByContinent[c], random);
    const harbours = [];
    const rest = [];
    for (const i of list) {
      if (harbours.length < HARBOURS_PER_CONTINENT * 3 && coastDist[i] >= 2 && coastDist[i] <= 5) harbours.push(i);
      else rest.push(i);
    }
    candidatesByContinent[c] = harbours.concat(rest);
  }

  // Share the villages out in proportion to land, by largest remainder,
  // then make sure the player's continent has room for the player, three
  // rivals and a garlock camp or two.
  let sizeTotal = 0;
  for (const continent of continents) {
    if (continent.tileCount >= VILLAGE_MIN_CONTINENT && candidatesByContinent[continent.id].length) sizeTotal += continent.tileCount;
  }
  const quota = new Int32Array(continents.length);
  const remainders = [];
  let assigned = 0;
  for (const continent of continents) {
    if (continent.tileCount < VILLAGE_MIN_CONTINENT || !candidatesByContinent[continent.id].length) continue;
    const share = (villageCount * continent.tileCount) / sizeTotal;
    quota[continent.id] = Math.floor(share);
    assigned += quota[continent.id];
    remainders.push({ id: continent.id, fraction: share - quota[continent.id] });
  }
  remainders.sort((a, b) => b.fraction - a.fraction);
  for (let k = 0; assigned < villageCount && k < remainders.length; k++, assigned++) quota[remainders[k].id]++;
  const playerContinent = continents.length ? continents[0].id : -1;
  if (playerContinent >= 0 && quota[playerContinent] < Math.min(6, villageCount)) {
    const need = Math.min(6, villageCount) - quota[playerContinent];
    quota[playerContinent] += need;
    // Take them back from the smallest continents first.
    let toRemove = need;
    for (let c = continents.length - 1; c > 0 && toRemove > 0; c--) {
      const give = Math.min(quota[c], toRemove);
      quota[c] -= give;
      toRemove -= give;
    }
  }

  const homes = [];   // tile indexes, in placement order
  const villages = ctx.villages;

  const farEnough = (i) => {
    for (const home of homes) if (hexDist(ctx, home, i) < VILLAGE_SPACING) return false;
    return true;
  };

  const found = (i, kind) => {
    const continentId = continentOf[i];
    const village = {
      id: kind === "player" ? "player" : `village${villages.length}`,
      name: null,
      color: null,
      kind,
      homeTileId: null,
      continentId,
      home: i,
    };
    villages.push(village);
    homes.push(i);
    villageOf[i] = villages.length - 1;
    continents[continentId].homes.push(villages.length - 1);
    return village;
  };

  // The player first: on the biggest continent, near a shore or a river
  // where possible so boats and bridges turn up early.
  if (playerContinent >= 0) {
    const list = candidatesByContinent[playerContinent];
    let chosen = -1;
    for (const i of list) {
      const nearCoast = coastDist[i] >= PLAYER_COAST_MIN && coastDist[i] <= PLAYER_COAST_MAX;
      const nearRiver = freshDist[i] <= PLAYER_RIVER_MAX && coastDist[i] >= PLAYER_COAST_MIN;
      if (nearCoast || nearRiver) { chosen = i; break; }
    }
    if (chosen < 0 && list.length) chosen = list[0];
    if (chosen < 0) {
      // A very hostile roll (all ice or all desert): anything dry and
      // walkable on the biggest continent will do; ensureViableStart
      // fixes the ground around it.
      for (let i = 0; i < N; i++) {
        if (continentOf[i] === playerContinent && !IS_WATER[terrain[i]] && terrain[i] !== T.mountains && coastDist[i] >= 2) { chosen = i; break; }
      }
    }
    if (chosen >= 0) found(chosen, "player");
  }

  // Everyone else, continent by continent, biggest first. A continent that
  // cannot fit its quota passes the remainder on.
  let carry = 0;
  for (const continent of continents) {
    const c = continent.id;
    let wanted = quota[c] + carry - continent.homes.length;
    carry = 0;
    if (wanted <= 0) { carry = Math.max(0, wanted); continue; }
    for (const i of candidatesByContinent[c]) {
      if (wanted <= 0) break;
      if (villageOf[i] >= 0 || !farEnough(i)) continue;
      found(i, "rival");
      wanted--;
    }
    carry = wanted;
  }

  // Garlock camps: the villages on the player's continent farthest from
  // home — far enough to be a threat that takes some reaching, close
  // enough that raids are possible at all.
  const player = villages.find((village) => village.kind === "player");
  if (player) {
    const others = continents[playerContinent].homes
      .map((index) => villages[index])
      .filter((village) => village.kind !== "player")
      .sort((a, b) => hexDist(ctx, b.home, player.home) - hexDist(ctx, a.home, player.home));
    const garlocks = others.length >= 5 ? 2 : others.length >= 1 ? 1 : 0;
    for (let k = 0; k < garlocks; k++) {
      others[k].kind = "garlock";
      others[k].name = k === 0 ? "Garlock Stronghold" : "Garlock Outpost";
      others[k].color = k === 0 ? GARLOCK_COLOR : GARLOCK_OUTPOST_COLOR;
    }
  }

  // Names and banners.
  const names = shuffle(VILLAGE_NAMES.slice(), random);
  let nameIndex = 0;
  let colorIndex = 0;
  for (const village of villages) {
    if (village.kind === "player") {
      village.name = "Your village";
      village.color = PLAYER_COLOR;
    } else if (village.kind === "rival") {
      village.name = nameIndex < names.length ? names[nameIndex++] : `${pick(CONTINENT_ADJECTIVES, random)}stead ${villages.indexOf(village)}`;
      village.color = VILLAGE_COLORS[colorIndex++ % VILLAGE_COLORS.length];
    }
    ctx.usedNames.add(village.name);
    village.homeTileId = `hex_${ctx.qOf[village.home]}_${ctx.rOf[village.home]}`;
  }

  // The ground each village stands on.
  for (const village of villages) settleHome(ctx, village);
  for (const village of villages) ensureViableStart(ctx, village.home, 3);
}

// The home hex becomes a timbermellow grove; the ring around it is made
// liveable (no peaks, no deep water) so nobody starts hemmed in.
function settleHome(ctx, village) {
  const { nbr, land, terrain, lakeOf, riverOf, continentOf, snowCapped, riverMask } = ctx;
  const home = village.home;
  terrain[home] = T.timbermellowForest;
  snowCapped[home] = 0;
  for (let d = 0; d < 6; d++) {
    const j = nbr[home * 6 + d];
    if (j < 0) continue;
    if (terrain[j] === T.mountains) terrain[j] = T.rockyOutcrop;
    // A lake hex a river runs into is the river's mouth: leave it wet, or
    // the river would end pointing at sand.
    let riverMouth = false;
    for (let e = 0; e < 6 && !riverMouth; e++) {
      const k = nbr[j * 6 + e];
      if (k >= 0 && riverOf[k] >= 0 && (riverMask[k] & (1 << OPPOSITE_DIRECTION[e]))) riverMouth = true;
    }
    if (IS_WATER[terrain[j]] && terrain[j] !== T.river && !riverMouth) {
      // Deep water turns to beach. That makes it land: fix the bookkeeping
      // and unhook any river that thought it flowed into this hex.
      terrain[j] = T.beach;
      land[j] = 1;
      continentOf[j] = continentOf[home];
      if (lakeOf[j] >= 0) {
        const lake = ctx.lakes[lakeOf[j]];
        lake.tiles = lake.tiles.filter((i) => i !== j);
        lakeOf[j] = -1;
      }
      for (let e = 0; e < 6; e++) {
        const k = nbr[j * 6 + e];
        if (k >= 0 && riverOf[k] >= 0) riverMask[k] &= ~(1 << OPPOSITE_DIRECTION[e]);
      }
    }
    snowCapped[j] = 0;
  }
}

// Every village must be able to live off its first ring of land. A start
// with no stone within reach can never raise a second house, which caps
// the village at three people and quietly soft-locks the game — so if the
// three rings around a home are missing food, wood or stone, the least
// useful patch out there is turned into ground that has it.
function ensureViableStart(ctx, home, radius) {
  const { terrain, villageOf, landmarkOf, snowCapped } = ctx;
  const near = spiralIndexes(ctx, home, radius).filter((i) => i !== home);
  for (const resource of ["stone", "wood", "food"]) {
    const supplies = SUPPLIES[resource];
    if (near.some((i) => supplies[terrain[i]])) continue;
    const repair = START_REPAIR[resource];
    const open = near.filter((i) => villageOf[i] < 0 && !IS_WATER[terrain[i]]);
    let donor = -1;
    for (const kind of repair.sacrifice) {
      donor = open.find((i) => terrain[i] === T[kind]) ?? -1;
      if (donor >= 0) break;
    }
    if (donor < 0) donor = open.find((i) => hexDist(ctx, i, home) === radius - 1) ?? (open.length ? open[0] : -1);
    if (donor < 0) continue;
    // A patch of it, not one hex — one hex of stone is barely two loads.
    for (const i of spiralIndexes(ctx, donor, 1)) {
      if (villageOf[i] >= 0 || IS_WATER[terrain[i]]) continue;
      terrain[i] = T[repair.becomes];
      landmarkOf[i] = -1;
      snowCapped[i] = 0;
    }
  }
}

// Every tile index within `radius` of `centre`, nearest ring first.
function spiralIndexes(ctx, centre, radius) {
  const { cols, rows, qOf, rOf } = ctx;
  const cq = qOf[centre];
  const cr = rOf[centre];
  const result = [];
  for (let ring = 0; ring <= radius; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dq = -ring; dq <= ring; dq++) {
        const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
        if (dist !== ring) continue;
        const r = cr + dr;
        const col = cq + dq + Math.floor(r / 2);
        if (r < 0 || r >= rows || col < 0 || col >= cols) continue;
        result.push(r * cols + col);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Shores, snow and small features
// ---------------------------------------------------------------------------

// Shallows on every sea hex that touches land, and on a second ring by a
// coin toss so the shelf has an uneven edge. Also the final `coastal` flag.
function finishShores(ctx) {
  const { N, seed, nbr, land, terrain, coastal, seaDist } = ctx;
  // Land may have changed under the villages; re-measure the sea's distance
  // from it.
  bfsDistance(ctx, seaDist, (i) => land[i] === 1, (i) => !land[i]);
  for (let i = 0; i < N; i++) {
    if (land[i]) continue;
    const dist = seaDist[i];
    if (dist === 1) terrain[i] = T.shallows;
    else if (dist === 2 && latticeHash(i, 3, seed + 131) < 0.5) terrain[i] = T.shallows;
    else terrain[i] = T.ocean;
  }
  // A second-ring shallows hex that has no first-ring neighbour would be a
  // lone patch of light water; make sure every shallows hex touches land
  // or other shallows (dist 2 tiles always touch a dist 1 tile, so this
  // holds by construction — the check is for the village edits).
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    let touchesSea = false;
    for (let d = 0; d < 6; d++) {
      const j = nbr[i * 6 + d];
      if (j >= 0 && !land[j]) { touchesSea = true; break; }
    }
    coastal[i] = touchesSea ? 1 : 0;
  }
  markOpenSea(ctx);
}

// Flood-fills the sea into bodies and flags the big ones. A pocket of salt
// water enclosed by land looks like sea but no boat can leave it, so docks
// and sea lanes must not use it.
function markOpenSea(ctx) {
  const { N, nbr, land, openSea, queue, stamp } = ctx;
  const mark = ++ctx.stampValue;
  for (let start = 0; start < N; start++) {
    if (land[start] || stamp[start] === mark) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    stamp[start] = mark;
    while (head < tail) {
      const i = queue[head++];
      for (let d = 0; d < 6; d++) {
        const j = nbr[i * 6 + d];
        if (j < 0 || land[j] || stamp[j] === mark) continue;
        stamp[j] = mark;
        queue[tail++] = j;
      }
    }
    if (tail >= OPEN_SEA_MIN_TILES) for (let k = 0; k < tail; k++) openSea[queue[k]] = 1;
  }
}

function placeFeatures(ctx) {
  const { N, seed, nbr, land, terrain, elevation, temperature, nextOf, riverOf, lakeOf, riverWidth, feature, snowCapped, villageOf } = ctx;
  for (let i = 0; i < N; i++) {
    const t = terrain[i];
    if (t === T.mountains) {
      if (temperature[i] < 0.42) snowCapped[i] = 1;
      continue;
    }
    if (villageOf[i] >= 0) continue;
    if (t === T.river) {
      const next = nextOf[i];
      if (next >= 0 && dirBetween(ctx, i, next) >= 0 && elevation[i] - elevation[next] > WATERFALL_DROP) {
        feature[i] = F.waterfall;
      } else if (riverWidth[i] === 1 && latticeHash(i, 5, seed + 137) < FORD_CHANCE) {
        feature[i] = F.ford;
      }
      continue;
    }
    if (t === T.desert) {
      for (let d = 0; d < 6; d++) {
        const j = nbr[i * 6 + d];
        if (j >= 0 && (riverOf[j] >= 0 || lakeOf[j] >= 0)) { feature[i] = F.oasis; break; }
      }
      continue;
    }
    if (t === T.shallows) {
      if (latticeHash(i, 7, seed + 139) < 0.04) feature[i] = F.reef;
      continue;
    }
    if ((t === T.tundra || t === T.snowfield) && land[i]) {
      if (latticeHash(i, 9, seed + 149) < 0.008) feature[i] = F.hotSpring;
    }
  }
}

// ---------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------

function placeLandmarks(ctx) {
  const { N, random, terrain, villageOf, landmarkOf, coastal, edgeDist } = ctx;
  // Bucket every land hex by terrain, once, then shuffle the buckets a
  // wonder needs. Cheaper than shuffling the whole map per wonder.
  const buckets = new Map();
  for (let i = 0; i < N; i++) {
    const t = terrain[i];
    if (IS_WATER[t] || villageOf[i] >= 0 || edgeDist[i] < SEA_MARGIN + 2) continue;
    let list = buckets.get(t);
    if (!list) buckets.set(t, list = []);
    list.push(i);
  }
  for (const list of buckets.values()) shuffle(list, random);

  const placed = [];
  const landmarks = ctx.landmarks;
  for (let typeIndex = 0; typeIndex < LANDMARK_TYPES.length; typeIndex++) {
    const type = LANDMARK_TYPES[typeIndex];
    const homesFor = LANDMARK_HOMES[type] || ["plains"];
    const pool = [];
    for (const home of homesFor) {
      const list = buckets.get(T[home]);
      if (list) pool.push(list);
    }
    let count = 0;
    // Round-robin across the allowed terrains so a wonder that may stand
    // on beach or cliff is not always on the (bigger) beach bucket.
    const cursors = pool.map(() => 0);
    let exhausted = false;
    while (count < LANDMARKS_EACH && !exhausted) {
      exhausted = true;
      for (let p = 0; p < pool.length && count < LANDMARKS_EACH; p++) {
        const list = pool[p];
        while (cursors[p] < list.length) {
          const i = list[cursors[p]++];
          exhausted = false;
          if (landmarkOf[i] >= 0 || villageOf[i] >= 0) continue;
          if (type === "shipwreck" && !coastal[i]) continue;
          let clear = true;
          for (const other of placed) if (hexDist(ctx, other, i) < LANDMARK_SPACING) { clear = false; break; }
          if (!clear) continue;
          landmarkOf[i] = typeIndex;
          placed.push(i);
          landmarks.push({ type, tileId: tileIdOf(ctx, i) });
          count++;
          break;
        }
      }
    }
  }
}

function tileIdOf(ctx, i) {
  return `hex_${ctx.qOf[i]}_${ctx.rOf[i]}`;
}

// ---------------------------------------------------------------------------
// Names: regions, rivers, lakes
// ---------------------------------------------------------------------------

// Flood-fills same-terrain areas and names the big ones, so the map reads
// as somewhere rather than as a field of hexes.
function nameRegions(ctx) {
  const { N, nbr, terrain, regionOf, queue, ux, uy, random, usedNames, grid } = ctx;
  const seen = new Uint8Array(N);
  const regions = ctx.regions;
  const toWorld = (x, y) => ({ x: grid.originX + x * Math.sqrt(3) * grid.hexSize, y: grid.originY + y * Math.sqrt(3) * grid.hexSize });
  for (let start = 0; start < N; start++) {
    if (seen[start]) continue;
    const kind = terrain[start];
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    let sumX = 0;
    let sumY = 0;
    while (head < tail) {
      const i = queue[head++];
      sumX += ux[i];
      sumY += uy[i];
      for (let d = 0; d < 6; d++) {
        const j = nbr[i * 6 + d];
        if (j < 0 || seen[j] || terrain[j] !== kind) continue;
        seen[j] = 1;
        queue[tail++] = j;
      }
    }
    const count = tail;
    if (count < REGION_MIN_TILES) continue;
    const words = REGION_WORDS[TERRAIN_TYPES[kind]];
    if (!words) continue;   // shallows, rivers, lakes are named elsewhere or not at all
    const name = uniqueName(usedNames, words.adj, words.noun, random);
    if (!name) continue;
    const id = `region_${regions.length}`;
    const regionIndex = regions.length;
    for (let k = 0; k < tail; k++) regionOf[queue[k]] = regionIndex;
    regions.push({ id, terrainType: TERRAIN_TYPES[kind], name: `The ${name}`, tileCount: count, center: toWorld(sumX / count, sumY / count) });
  }
}

function nameWaters(ctx) {
  const { random, usedNames, terrain } = ctx;
  ctx.riverList = [];
  for (const river of ctx.rivers) {
    if (!river) continue;
    // Tiles absorbed into a lake (or turned to beach by a village) are no
    // longer river.
    const tileIds = river.path.filter((i) => terrain[i] === T.river).map((i) => tileIdOf(ctx, i));
    if (tileIds.length < 3) continue;
    const name = tileIds.length >= RIVER_NAME_MIN_LENGTH ? uniqueName(usedNames, RIVER_ADJECTIVES, RIVER_NOUNS, random) : null;
    ctx.riverList.push({ id: `river_${ctx.riverList.length}`, name: name ? `The ${name}` : null, tileIds, reachedWater: river.reachedWater });
  }
  ctx.lakeList = [];
  for (const lake of ctx.lakes) {
    const tileIds = lake.tiles.filter((i) => terrain[i] === T.lake).map((i) => tileIdOf(ctx, i));
    if (!tileIds.length) continue;
    const name = tileIds.length >= LAKE_NAME_MIN_TILES ? uniqueName(usedNames, LAKE_ADJECTIVES, LAKE_NOUNS, random) : null;
    ctx.lakeList.push({ id: `lake_${ctx.lakeList.length}`, name: name ? `The ${name}` : null, tileIds });
  }
}

// ---------------------------------------------------------------------------
// Pathfinding: A* with a binary heap over typed arrays
// ---------------------------------------------------------------------------

// Cheapest path from `start` to `goal`, where `stepCost(i)` is the cost of
// entering tile i (Infinity = never). The heuristic is hex distance times
// `minStep`, admissible as long as no step is cheaper than that. Returns an
// array of tile indexes or null.
function findPath(ctx, start, goal, stepCost, minStep) {
  const { nbr, gScore, cameFrom, stamp, heap, qOf, rOf } = ctx;
  const mark = ++ctx.stampValue;
  const gq = qOf[goal];
  const gr = rOf[goal];
  const h = (i) => {
    const dq = qOf[i] - gq;
    const dr = rOf[i] - gr;
    return ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2) * minStep;
  };
  heap.clear();
  gScore[start] = 0;
  cameFrom[start] = -1;
  stamp[start] = mark;
  heap.push(h(start), start);
  let found = false;
  while (heap.size > 0) {
    const i = heap.pop();
    if (i === goal) { found = true; break; }
    // Stale entry: a cheaper route to i was pushed later.
    if (heap.lastKey - h(i) > gScore[i] + 1e-9) continue;
    const g = gScore[i];
    for (let d = 0; d < 6; d++) {
      const j = nbr[i * 6 + d];
      if (j < 0) continue;
      const cost = stepCost(j);
      if (cost === Infinity) continue;
      const ng = g + cost;
      if (stamp[j] !== mark || ng < gScore[j]) {
        stamp[j] = mark;
        gScore[j] = ng;
        cameFrom[j] = i;
        heap.push(ng + h(j), j);
      }
    }
  }
  if (!found) return null;
  const path = [];
  for (let i = goal; i >= 0; i = cameFrom[i]) path.push(i);
  path.reverse();
  return path;
}

// ---------------------------------------------------------------------------
// Trade routes and sea lanes
// ---------------------------------------------------------------------------

// Every village is joined to its nearest already-connected neighbour on
// the same continent (a minimum spanning tree per continent), and each
// link is walked as a cart would: cheapest road cost, never through water.
function buildTradeRoutes(ctx) {
  const { terrain, villages, continents } = ctx;
  const routes = ctx.tradeRoutes;
  const stepCost = (i) => ROAD_COST[terrain[i]];
  for (const continent of continents) {
    const members = continent.homes.map((index) => villages[index]);
    if (members.length < 2) continue;
    for (const [from, to] of spanningTree(ctx, members.map((village) => village.home))) {
      const path = findPath(ctx, members[from].home, members[to].home, stepCost, 1);
      if (!path) continue;
      routes.push({ from: members[from].id, to: members[to].id, tileIds: path.map((i) => tileIdOf(ctx, i)) });
    }
  }
}

// Prim's algorithm over hex distance. Returns [fromIndex, toIndex] pairs.
function spanningTree(ctx, points) {
  const edges = [];
  if (points.length < 2) return edges;
  const inTree = new Uint8Array(points.length);
  inTree[0] = 1;
  for (let added = 1; added < points.length; added++) {
    let bestFrom = -1;
    let bestTo = -1;
    let bestDistance = Infinity;
    for (let a = 0; a < points.length; a++) {
      if (!inTree[a]) continue;
      for (let b = 0; b < points.length; b++) {
        if (inTree[b]) continue;
        const distance = hexDist(ctx, points[a], points[b]);
        if (distance < bestDistance) { bestDistance = distance; bestFrom = a; bestTo = b; }
      }
    }
    inTree[bestTo] = 1;
    edges.push([bestFrom, bestTo]);
  }
  return edges;
}

// Boats between continents: each coastal village gets a dock on its nearest
// shore; continents are joined by a spanning tree over the nearest pair of
// docks, and each lane is a water-only path (shallows preferred).
function buildSeaLanes(ctx) {
  const { terrain, villages, continents, coastDist } = ctx;
  const lanes = ctx.seaLanes;

  // Docks: the shore hex and the water hex beside it, found by a short BFS
  // over land from the home.
  const docks = new Map();   // village index -> { shore, water }
  villages.forEach((village, index) => {
    if (coastDist[village.home] > COASTAL_VILLAGE_REACH) return;
    const dock = findDock(ctx, village.home, COASTAL_VILLAGE_REACH + 2);
    if (dock) docks.set(index, dock);
  });
  if (docks.size < 2) return;

  const nodes = continents.filter((continent) => continent.homes.some((index) => docks.has(index)));
  if (nodes.length < 2) return;

  // The nearest few dock pairs for every pair of continents, nearest
  // first — if the closest pair turns out not to be joined by water the
  // next one is tried.
  const pairKey = (a, b) => `${a},${b}`;
  const pairs = new Map();
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      const list = [];
      for (const va of nodes[a].homes) {
        const da = docks.get(va);
        if (!da) continue;
        for (const vb of nodes[b].homes) {
          const db = docks.get(vb);
          if (!db) continue;
          list.push({ distance: hexDist(ctx, da.water, db.water), va, vb });
        }
      }
      list.sort((x, y) => x.distance - y.distance);
      pairs.set(pairKey(a, b), list.slice(0, 4));
    }
  }
  // Prim over continents.
  const inTree = new Uint8Array(nodes.length);
  inTree[0] = 1;
  const stepCost = (i) => (terrain[i] === T.shallows ? 1 : terrain[i] === T.ocean ? 1.15 : Infinity);
  for (let added = 1; added < nodes.length; added++) {
    let best = null;
    let bestB = -1;
    for (let a = 0; a < nodes.length; a++) {
      if (!inTree[a]) continue;
      for (let b = 0; b < nodes.length; b++) {
        if (inTree[b]) continue;
        const list = pairs.get(a < b ? pairKey(a, b) : pairKey(b, a));
        if (list && list.length && (!best || list[0].distance < best[0].distance)) { best = list; bestB = b; }
      }
    }
    if (!best) break;
    inTree[bestB] = 1;
    for (const pair of best) {
      const from = docks.get(pair.va);
      const to = docks.get(pair.vb);
      const path = findPath(ctx, from.water, to.water, stepCost, 1);
      if (!path) continue;
      lanes.push({
        from: villages[pair.va].id,
        to: villages[pair.vb].id,
        fromTileId: tileIdOf(ctx, from.shore),
        toTileId: tileIdOf(ctx, to.shore),
        tileIds: path.map((i) => tileIdOf(ctx, i)),
      });
      break;
    }
  }
}

// BFS over land from `home` to the nearest sea hex. Returns { shore, water }.
function findDock(ctx, home, maxRadius) {
  const { nbr, land, terrain, queue, stamp } = ctx;
  const mark = ++ctx.stampValue;
  const parent = ctx.cameFrom;
  let head = 0;
  let tail = 0;
  queue[tail++] = home;
  stamp[home] = mark;
  parent[home] = -1;
  const depth = ctx.gScore;
  depth[home] = 0;
  while (head < tail) {
    const i = queue[head++];
    if (depth[i] > maxRadius) break;
    for (let d = 0; d < 6; d++) {
      const j = nbr[i * 6 + d];
      if (j < 0 || stamp[j] === mark) continue;
      if (!land[j] && IS_SEA[terrain[j]] && ctx.openSea[j]) return { shore: i, water: j };
      if (!land[j]) continue;
      stamp[j] = mark;
      parent[j] = i;
      depth[j] = depth[i] + 1;
      queue[tail++] = j;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function buildTiles(ctx) {
  const {
    N, cols, seed, qOf, rOf, terrain, elevation, moisture, temperature, regionOf, continentOf, coastal,
    snowCapped, feature, landmarkOf, riverWidth, riverMask, villageOf, villages, land,
  } = ctx;
  const tiles = new Array(N);
  const player = villages.find((village) => village.kind === "player");
  const playerHome = player ? player.home : -1;
  for (let i = 0; i < N; i++) {
    const q = qOf[i];
    const r = rOf[i];
    const villageIndex = villageOf[i];
    const isRiver = terrain[i] === T.river;
    tiles[i] = {
      id: `hex_${q}_${r}`,
      q,
      r,
      col: i % cols,
      row: r,
      index: i,
      terrainType: TERRAIN_TYPES[terrain[i]],
      elevation: elevation[i],
      moisture: moisture[i],
      temperature: temperature[i],
      detailSeed: (latticeHash(q, r, seed + 811) * 4294967296) >>> 0,
      regionId: regionOf[i] >= 0 ? ctx.regions[regionOf[i]].id : null,
      continentId: land[i] ? continentOf[i] : -1,
      coastal: coastal[i] === 1,
      snowCapped: snowCapped[i] === 1,
      feature: FEATURE_NAMES[feature[i]],
      landmark: landmarkOf[i] >= 0 ? LANDMARK_TYPES[landmarkOf[i]] : null,
      riverWidth: isRiver ? riverWidth[i] : 0,
      riverMask: isRiver ? riverMask[i] : 0,
      villageId: villageIndex >= 0 ? villages[villageIndex].id : null,
      isStartingTile: i === playerHome,
      specialEffect: i === playerHome ? "startingLand" : villageIndex >= 0 ? "village" : null,
    };
  }
  // The villages the game keeps are plain records without the tile index.
  ctx.villages = villages.map((village) => ({
    id: village.id,
    name: village.name,
    color: village.color,
    kind: village.kind,
    homeTileId: village.homeTileId,
    continentId: village.continentId,
  }));
  return tiles;
}

// Exposed for tests and for anyone who wants to reuse the noise.
export { fractalNoise, ridgeNoise, valueNoise, classifyLand, MinHeap };
export const VILLAGE_NAME_LIST = VILLAGE_NAMES;
export const CONSTANTS = { PLAYER_COLOR, GARLOCK_COLOR, VILLAGE_COLORS, VILLAGE_SPACING, LANDMARK_SPACING, REGION_MIN_TILES };
