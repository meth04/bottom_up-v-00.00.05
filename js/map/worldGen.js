// worldGen.js
//
// Builds a whole world from a seed, in the spirit of Sếp's drawing: an
// island rimmed with ocean and pale beaches, rock and snow along the high
// spine, rivers running downhill into lakes and out to sea, marshes in the
// wet lowlands, cold tundra in the north and dry badlands in the south —
// and a handful of small villages spread across it, one of them yours.
//
// The same seed always produces the same world, so a saved game only has
// to remember what changed (who owns what, what's been gathered).
//
// What comes out:
//   { seed, cols, rows, grid, width, height, tiles, rivers, lakes,
//     villages, regions, tradeRoutes }
//
// Each tile carries, besides its terrain: elevation, moisture, temperature,
// a `detailSeed` the painter scatters its undergrowth with, and a `regionId`.

// ---------------------------------------------------------------------------
// TUNING
// ---------------------------------------------------------------------------

const WORLD_NOISE_SCALE = 12;         // bigger = broader hills and forests
const WORLD_RIVER_COUNT = 14;
const WORLD_VILLAGE_SPACING = 8;      // minimum hexes between villages
const WORLD_LAKE_COUNT = 7;           // how many inland lakes to try for
const WORLD_MIN_REGION = 10;          // tiles a region needs before it is named

// How far in from the paper's edge the sea reaches. Bigger = smaller island.
const WORLD_ISLAND_BIAS = 0.04;

const VILLAGE_NAMES = [
  "Ashford", "Brookhollow", "Cairnwick", "Dunmere", "Elmreach", "Fernby", "Greywater", "Hollins",
  "Oakhaven", "Ironridge", "Stonegate", "Mistveil", "Riverrun", "Windshear"
];
const VILLAGE_COLORS = ["#c0392b", "#8e44ad", "#2980b9", "#16a085", "#d35400", "#7f8c8d", "#2c3e50", "#1abc9c"];
const PLAYER_COLOR = "#d9a441";
const GARLOCK_COLOR = "#3b2f2f";

// Region names, by the ground that dominates them.
const REGION_WORDS = {
  mountains:   { head: ["The", "The", "The"], adj: ["Iron", "Grey", "Cloudpierce", "Old", "Broken", "Giant's"], noun: ["Spine", "Teeth", "Range", "Crags", "Wall"] },
  rockyOutcrop:{ head: ["The"], adj: ["Flint", "Shattered", "Sunworn", "Bare"], noun: ["Screes", "Barrens", "Steps", "Rubble"] },
  snowfield:   { head: ["The"], adj: ["White", "Silent", "Everwhite", "Frost"], noun: ["Waste", "Mantle", "Reaches", "Shroud"] },
  tundra:      { head: ["The"], adj: ["Cold", "Thin", "Rimed", "Pale"], noun: ["Moors", "Heath", "Flats", "Fells"] },
  badlands:    { head: ["The"], adj: ["Red", "Thirsty", "Cracked", "Bitter"], noun: ["Scar", "Waste", "Gullies", "Pan"] },
  marsh:       { head: ["The"], adj: ["Hollow", "Slow", "Whispering", "Drowned"], noun: ["Fens", "Mire", "Sinks", "Bog"] },
  taiga:       { head: ["The"], adj: ["Black", "Deep", "Needle", "Hushed"], noun: ["Pinewood", "Taiga", "Dark", "Stand"] },
  denseBush:   { head: ["The"], adj: ["Tangled", "Green", "Thorn", "Close"], noun: ["Thicket", "Snarl", "Bramble", "Wilds"] },
  forest:      { head: ["The"], adj: ["Long", "Elder", "Green", "Quiet"], noun: ["Wood", "Forest", "Glades", "Weald"] },
  birchWood:   { head: ["The"], adj: ["White", "Silver", "Thin", "Whistling"], noun: ["Birches", "Poles", "Grove", "Stand"] },
  flowerMeadow:{ head: ["The"], adj: ["Bright", "Bee", "Wide", "Sunlit"], noun: ["Meadows", "Lea", "Bloom", "Commons"] },
  plains:      { head: ["The"], adj: ["Wide", "Wind", "Open", "Golden"], noun: ["Plain", "Downs", "Reach", "Sweep"] },
  overgrownHighlands: { head: ["The"], adj: ["Stepped", "Terraced", "Green", "High"], noun: ["Shelves", "Hills", "Benches", "Rise"] },
  timbermellowForest: { head: ["The"], adj: ["Fat", "Old", "Sweet"], noun: ["Grove", "Orchard", "Larder"] },
  ocean:       { head: ["The"], adj: ["Grey", "Wide", "Cold", "Endless"], noun: ["Sea", "Water", "Deep", "Sound"] },
  lake:        { head: ["The"], adj: ["Still", "Deep", "Black", "Clear"], noun: ["Mere", "Tarn", "Water", "Lake"] },
  beach:       { head: ["The"], adj: ["Pale", "Long", "Shell"], noun: ["Strand", "Shore", "Sands"] },
};

// Ground that a village can be founded on.
const HOMELY_TERRAIN = ["flowerMeadow", "plains", "forest", "birchWood", "overgrownHighlands"];

// Which ground yields what. This mirrors terrainDefaults in data/map.json —
// worldGen only needs the shape of it, to check that the player's first few
// hexes can actually keep a village alive.
const TERRAIN_SUPPLIES = {
  food:  ["timbermellowForest", "flowerMeadow", "forest", "birchWood", "denseBush", "taiga", "marsh", "tundra"],
  wood:  ["timbermellowForest", "forest", "birchWood", "denseBush", "taiga", "marsh"],
  stone: ["mountains", "rockyOutcrop", "overgrownHighlands", "badlands", "tundra", "snowfield", "beach"],
};

// What a missing resource gets turned into, and what may be sacrificed for it.
// Plains first: dry grass is the least missed.
const START_REPAIR = {
  stone: { becomes: "rockyOutcrop", sacrifice: ["plains", "flowerMeadow", "tundra", "badlands"] },
  wood:  { becomes: "forest", sacrifice: ["plains", "flowerMeadow", "tundra", "badlands"] },
  food:  { becomes: "flowerMeadow", sacrifice: ["plains", "badlands", "tundra", "rockyOutcrop"] },
};

// Ground that is water — no walking, no settling, no roads.
const WATER_TERRAIN = ["ocean", "lake", "river"];

function isWaterTerrain(type) {
  return WATER_TERRAIN.includes(type);
}

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

// Integer lattice hash: the same (x, y, seed) always gives the same value,
// no matter what order the map is walked in.
function latticeHash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

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

// Layered noise: broad shapes with finer detail on top.
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

// Ridged noise: the folds mountain ranges are made of.
function ridgeNoise(x, y, seed, octaves) {
  return 1 - Math.abs(fractalNoise(x, y, seed, octaves) * 2 - 1);
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// Fisher–Yates with the seeded random: the same seed shuffles the same way
// in every browser (sort() with a random comparator does not).
function shuffle(list, random) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function worldTileCenter(q, r, grid) {
  const pixel = axialToPixel(q, r, grid.hexSize);
  return { x: pixel.x + grid.originX, y: pixel.y + grid.originY };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

// spec: { cols, rows, hexSize, seed, villageCount }
function generateWorld(spec) {
  const { cols, rows, hexSize, seed } = spec;
  const random = createRandom(seed);
  const hexWidth = Math.sqrt(3) * hexSize;
  const grid = {
    hexSize,
    originX: hexWidth / 2 + 8,
    originY: hexSize + 8,
  };
  const width = Math.round(grid.originX * 2 + (cols - 1) * hexWidth + hexWidth / 2);
  const height = Math.round(grid.originY * 2 + (rows - 1) * 1.5 * hexSize);

  // ---- Ground -----------------------------------------------------------------
  const tiles = [];
  const byKey = new Map();
  const halfCols = (cols - 1) / 2;
  const halfRows = (rows - 1) / 2;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const q = col - Math.floor(row / 2);
      const r = row;
      const center = worldTileCenter(q, r, grid);
      const nx = center.x / (hexSize * WORLD_NOISE_SCALE);
      const ny = center.y / (hexSize * WORLD_NOISE_SCALE);

      // --- how far out to sea this tile is -----------------------------------
      // A rounded-rectangle island: part square (keeps the corners useful),
      // part circle (keeps the coast from looking like a picture frame).
      const ux = (col - halfCols) / halfCols;
      const uy = (row - halfRows) / halfRows;
      const boxy = Math.max(Math.abs(ux), Math.abs(uy));
      const round = Math.hypot(ux, uy);
      const radial = boxy * 0.42 + round * 0.58;
      const coastNoise = fractalNoise(nx * 1.7 + 11.3, ny * 1.7 + 5.1, seed + 31, 3);
      // > 0 is land, < 0 is sea; the noise makes the coastline ragged.
      const landMask = 1 - radial - WORLD_ISLAND_BIAS + (coastNoise - 0.5) * 0.50;

      const edgeDistance = Math.min(col, cols - 1 - col, row, rows - 1 - row);

      // --- height -------------------------------------------------------------
      const rolling = fractalNoise(nx, ny, seed, 4);
      const ridges = ridgeNoise(nx * 0.72 + 5.5, ny * 0.72 + 2.2, seed + 53, 3);
      let elevation = rolling * 0.60 + ridges * 0.40;
      // Land sinks towards the water, so beaches and river mouths sit low.
      const shore = clamp01(landMask / 0.26);
      elevation *= 0.30 + 0.70 * shore;

      const moisture = fractalNoise(nx + 37.2, ny + 91.7, seed + 7, 3);

      // --- warmth -------------------------------------------------------------
      // Cold at the top of the sheet, hot at the bottom; high ground is
      // always colder than the valley below it.
      const latitude = row / Math.max(1, rows - 1);
      let temperature = 0.06 + latitude * 1.02;
      temperature += (fractalNoise(nx + 71.4, ny + 13.9, seed + 17, 2) - 0.5) * 0.22;
      temperature -= elevation * 0.22;

      const tile = {
        id: `hex_${q}_${r}`,
        q, r, col, row,
        elevation,
        moisture,
        temperature,
        landMask,
        edgeDistance,
        detailSeed: (latticeHash(q, r, seed + 811) * 4294967296) >>> 0,
        terrainType: null,
        specialEffect: null,
        landmark: null,
        regionId: null,
        coastal: false,
        snowCapped: false,
      };
      tiles.push(tile);
      byKey.set(hexKey(q, r), tile);
    }
  }
  const neighborsOf = (tile) => hexNeighbors(tile.q, tile.r).map(({ q, r }) => byKey.get(hexKey(q, r))).filter(Boolean);

  // ---- Sea, then the ground it surrounds --------------------------------------
  for (const tile of tiles) {
    if (tile.edgeDistance === 0 || tile.landMask <= 0) {
      tile.terrainType = "ocean";
      continue;
    }
    tile.terrainType = classifyLand(tile);
  }

  // Beaches: the land the sea actually touches, where it is low enough.
  for (const tile of tiles) {
    if (tile.terrainType === "ocean") continue;
    const touchesSea = neighborsOf(tile).some((n) => n.terrainType === "ocean");
    if (!touchesSea) continue;
    tile.coastal = true;
    if (tile.elevation < 0.38 && tile.terrainType !== "mountains") tile.terrainType = "beach";
  }

  // A single hex of sea poking into the land is a bay, not an island of water;
  // a single hex of land out at sea is a skerry. Both read badly, so smooth them.
  for (const tile of tiles) {
    const neighbors = neighborsOf(tile);
    if (!neighbors.length) continue;
    const water = neighbors.filter((n) => n.terrainType === "ocean").length;
    if (tile.terrainType !== "ocean" && water >= 5) tile.terrainType = "ocean";
    else if (tile.terrainType === "ocean" && water === 0 && tile.edgeDistance > 0) tile.terrainType = "beach";
  }

  // ---- Rivers: start high, follow the slope, end in a lake or the sea ---------
  const rivers = [];
  const sourceCandidates = shuffle(
    tiles.filter((tile) =>
      tile.elevation > 0.56 && tile.elevation < 0.80 &&
      tile.edgeDistance >= 3 && !isWaterTerrain(tile.terrainType)),
    random
  );
  const sources = [];
  for (const candidate of sourceCandidates) {
    if (sources.length >= WORLD_RIVER_COUNT) break;
    if (sources.every((source) => hexDistance(source, candidate) >= 5)) sources.push(candidate);
  }
  for (const source of sources) {
    const path = [source];
    let current = source;
    let reachedWater = false;
    for (let step = 0; step < 90; step++) {
      const options = neighborsOf(current).filter((tile) => !path.includes(tile));
      if (!options.length) break;
      let next = options[0];
      let nextScore = Infinity;
      for (const option of options) {
        // Downhill, with a little wander so rivers meander.
        const score = option.elevation + random() * 0.05;
        if (score < nextScore) { nextScore = score; next = option; }
      }
      if (next.terrainType === "ocean") { path.push(next); reachedWater = true; break; }
      if (next.terrainType === "river" || next.terrainType === "lake") { path.push(next); reachedWater = true; break; }
      if (next.elevation > current.elevation + 0.035) { current.specialEffect = "pool"; break; }
      path.push(next);
      current = next;
      if (current.edgeDistance === 0) { reachedWater = true; break; }
    }
    if (path.length < 3) continue;
    for (const tile of path) {
      if (tile.terrainType === "ocean") continue;   // the mouth stays sea
      tile.terrainType = "river";
    }
    rivers.push({ tileIds: path.map((tile) => tile.id), reachedWater });
  }

  // ---- Lakes: water pools where a river stopped, and in closed hollows --------
  const lakes = [];
  const lakeSeeds = tiles.filter((tile) => tile.specialEffect === "pool");
  const hollows = shuffle(
    tiles.filter((tile) =>
      !isWaterTerrain(tile.terrainType) && tile.terrainType !== "beach" &&
      tile.elevation < 0.34 && tile.moisture > 0.55 && tile.edgeDistance >= 4),
    random
  );
  for (const candidate of hollows) {
    if (lakeSeeds.length >= WORLD_LAKE_COUNT) break;
    if (lakeSeeds.every((seedTile) => hexDistance(seedTile, candidate) >= 6)) lakeSeeds.push(candidate);
  }
  for (const seedTile of lakeSeeds) {
    // Grow a small blob outward through the lowest ground.
    const body = [seedTile];
    const wanted = 2 + Math.floor(random() * 5);
    while (body.length < wanted) {
      const rim = [];
      for (const tile of body) {
        for (const neighbor of neighborsOf(tile)) {
          if (body.includes(neighbor)) continue;
          if (neighbor.terrainType === "ocean" || neighbor.edgeDistance <= 1) continue;
          rim.push(neighbor);
        }
      }
      if (!rim.length) break;
      rim.sort((a, b) => a.elevation - b.elevation);
      body.push(rim[0]);
    }
    for (const tile of body) {
      tile.terrainType = "lake";
      tile.specialEffect = null;
    }
    lakes.push(body.map((tile) => tile.id));
  }

  // Wet ground beside fresh water turns to marsh; slopes beside it terrace.
  for (const tile of tiles) {
    if (isWaterTerrain(tile.terrainType) || tile.terrainType === "beach") continue;
    const besideFresh = neighborsOf(tile).some((n) => n.terrainType === "river" || n.terrainType === "lake");
    if (!besideFresh) continue;
    if (tile.elevation < 0.38 && tile.moisture > 0.50 && tile.temperature > 0.20) {
      tile.terrainType = "marsh";
    } else if (tile.elevation > 0.48 && tile.elevation <= 0.64) {
      tile.terrainType = "overgrownHighlands";
    }
  }

  // Snow sits on the high ground wherever it is cold enough to stay.
  for (const tile of tiles) {
    if (tile.terrainType === "mountains" && tile.temperature < 0.42) tile.snowCapped = true;
  }

  // ---- Villages ---------------------------------------------------------------
  const centerX = width / 2;
  const centerY = height / 2;
  const isHomely = (tile) =>
    HOMELY_TERRAIN.includes(tile.terrainType) &&
    tile.edgeDistance >= 3 &&
    tile.temperature > 0.18 && tile.temperature < 0.88;
  let homely = tiles.filter(isHomely);
  if (homely.length < 4) {
    // A very hostile roll: fall back to anything dry and walkable.
    homely = tiles.filter((tile) => !isWaterTerrain(tile.terrainType) && tile.terrainType !== "mountains" && tile.edgeDistance >= 2);
  }
  homely.sort((a, b) => {
    const da = Math.hypot(worldTileCenter(a.q, a.r, grid).x - centerX, worldTileCenter(a.q, a.r, grid).y - centerY);
    const db = Math.hypot(worldTileCenter(b.q, b.r, grid).x - centerX, worldTileCenter(b.q, b.r, grid).y - centerY);
    return da - db;
  });

  const villages = [];
  const playerHome = homely[0];
  villages.push({ id: "player", name: "Your village", color: PLAYER_COLOR, kind: "player", homeTileId: playerHome.id });

  const others = shuffle(homely.slice(1), random);
  const wanted = Math.max(1, (spec.villageCount || 5) - 1);
  for (const candidate of others) {
    if (villages.length > wanted) break;
    const homes = villages.map((village) => byKey.get(hexKey(...village.homeTileId.split("_").slice(1).map(Number))));
    if (homes.every((home) => hexDistance(home, candidate) >= WORLD_VILLAGE_SPACING)) {
      villages.push({
        id: `village${villages.length}`,
        name: VILLAGE_NAMES[(villages.length - 1) % VILLAGE_NAMES.length],
        color: VILLAGE_COLORS[(villages.length - 1) % VILLAGE_COLORS.length],
        kind: "rival",
        homeTileId: candidate.id,
      });
    }
  }
  // The villages farthest from yours are garlock camps.
  if (villages.length > 1) {
    const nonPlayers = villages.slice(1);
    nonPlayers.sort((va, vb) => {
      const ha = byKey.get(hexKey(...va.homeTileId.split("_").slice(1).map(Number)));
      const hb = byKey.get(hexKey(...vb.homeTileId.split("_").slice(1).map(Number)));
      return hexDistance(hb, playerHome) - hexDistance(ha, playerHome);
    });
    nonPlayers[0].kind = "garlock";
    nonPlayers[0].name = "Garlock Stronghold";
    nonPlayers[0].color = GARLOCK_COLOR;
    if (nonPlayers.length > 4) {
      nonPlayers[1].kind = "garlock";
      nonPlayers[1].name = "Garlock Outpost";
      nonPlayers[1].color = "#4a3535";
    }
  }

  for (const village of villages) {
    const home = byKey.get(hexKey(...village.homeTileId.split("_").slice(1).map(Number)));
    home.terrainType = "timbermellowForest";
    home.specialEffect = village.kind === "player" ? "startingLand" : "village";
    home.isStartingTile = village.kind === "player";
    home.villageId = village.id;
    home.snowCapped = false;
    // A village always has a little workable ground around it, so nobody
    // starts hemmed in by rock and water.
    for (const neighbor of neighborsOf(home)) {
      if (neighbor.terrainType === "mountains") neighbor.terrainType = "rockyOutcrop";
    }
  }

  // ---- A start you can actually live on ---------------------------------------
  ensureViableStart(playerHome, byKey);

  // ---- Trade roads: the tracks that already run between the villages ----------
  const tradeRoutes = buildTradeRoutes(villages, byKey, neighborsOf, grid);

  // ---- Procedural Landmarks & World Wonders -----------------------------------
  const landmarkCandidates = shuffle(
    tiles.filter((t) => !t.villageId && !t.isStartingTile && t.edgeDistance >= 3),
    random
  );
  const placedLandmarks = new Set();
  const tryPlaceLandmark = (type, predicate) => {
    const match = landmarkCandidates.find((t) => !t.landmark && !placedLandmarks.has(t.id) && predicate(t));
    if (match) {
      match.landmark = type;
      placedLandmarks.add(match.id);
    }
  };

  tryPlaceLandmark("standingStones", (t) => t.terrainType === "plains" || t.terrainType === "flowerMeadow");
  tryPlaceLandmark("motherTree", (t) => t.terrainType === "forest" || t.terrainType === "denseBush");
  tryPlaceLandmark("dragonBones", (t) => t.terrainType === "rockyOutcrop" || t.terrainType === "badlands");
  tryPlaceLandmark("crystalMine", (t) => t.terrainType === "mountains" || t.terrainType === "rockyOutcrop");
  tryPlaceLandmark("shipwreck", (t) => t.terrainType === "beach" || neighborsOf(t).some((n) => n.terrainType === "ocean"));
  tryPlaceLandmark("ruinedTower", (t) => t.terrainType === "tundra" || t.terrainType === "taiga" || t.terrainType === "plains");
  tryPlaceLandmark("hotSpring", (t) => t.terrainType === "snowfield" || t.terrainType === "tundra" || t.terrainType === "marsh");
  tryPlaceLandmark("boneOrchard", (t) => t.terrainType === "badlands" || t.terrainType === "beach");

  // ---- Regions: name the big stretches of one kind of ground ------------------
  const regions = nameRegions(tiles, neighborsOf, grid, random);

  return { seed, cols, rows, grid, width, height, tiles, rivers, lakes, villages, regions, tradeRoutes };
}

// Every world must be playable from its first hex. A start with no stone
// within reach can never raise a second house, which caps the village at
// three people and quietly soft-locks the game — so if the two rings around
// the player's home are missing food, wood or stone, the least useful tile
// out there is quietly turned into ground that has it.
function ensureViableStart(home, byKey) {
  const near = hexSpiral(home, 2)
    .map(({ q, r }) => byKey.get(hexKey(q, r)))
    .filter((tile) => tile && tile !== home);

  for (const resource of ["stone", "wood", "food"]) {
    const suppliers = TERRAIN_SUPPLIES[resource];
    if (near.some((tile) => suppliers.includes(tile.terrainType))) continue;

    const repair = START_REPAIR[resource];
    // Somewhere free: no village, no water, and not something scarce itself.
    const open = near.filter((tile) =>
      !tile.villageId && !tile.isStartingTile && !isWaterTerrain(tile.terrainType));
    let donor = null;
    for (const kind of repair.sacrifice) {
      donor = open.find((tile) => tile.terrainType === kind);
      if (donor) break;
    }
    if (!donor) donor = open.find((tile) => hexDistance(tile, home) === 2) || open[0];
    if (!donor) continue;

    donor.terrainType = repair.becomes;
    donor.landmark = null;
    donor.snowCapped = false;
  }
}

// Which ground a dry tile carries, from its height, wet and warmth.
function classifyLand(tile) {
  const { elevation, moisture, temperature } = tile;

  if (elevation > 0.740) return "mountains";
  if (elevation > 0.645) return temperature < 0.08 ? "snowfield" : "rockyOutcrop";

  if (temperature < 0.08) return "snowfield";
  if (temperature < 0.18) return "tundra";
  if (temperature < 0.34 && moisture > 0.52) return "taiga";
  if (temperature > 0.80 && moisture < 0.44) return "badlands";

  if (moisture > 0.70 && elevation < 0.36) return "marsh";
  if (moisture > 0.62) return "denseBush";
  if (moisture > 0.52) return temperature < 0.46 ? "birchWood" : "forest";
  if (moisture > 0.42) return "flowerMeadow";
  return "plains";
}

// ---------------------------------------------------------------------------
// Trade roads
// ---------------------------------------------------------------------------

// Every village is joined to its nearest already-connected neighbour, so the
// whole map ends up on one network of old tracks (a minimum spanning tree).
// The paths themselves are walked with a plain Dijkstra over walking cost.
function buildTradeRoutes(villages, byKey, neighborsOf, grid) {
  const homeOf = (village) => byKey.get(hexKey(...village.homeTileId.split("_").slice(1).map(Number)));
  if (villages.length < 2) return [];

  const connected = [villages[0]];
  const pending = villages.slice(1);
  const routes = [];

  while (pending.length) {
    let bestFrom = null;
    let bestTo = null;
    let bestDistance = Infinity;
    for (const from of connected) {
      for (const to of pending) {
        const distance = hexDistance(homeOf(from), homeOf(to));
        if (distance < bestDistance) { bestDistance = distance; bestFrom = from; bestTo = to; }
      }
    }
    pending.splice(pending.indexOf(bestTo), 1);
    connected.push(bestTo);

    const path = walkRoad(homeOf(bestFrom), homeOf(bestTo), neighborsOf);
    if (path) routes.push({ from: bestFrom.id, to: bestTo.id, tileIds: path.map((tile) => tile.id) });
  }
  return routes;
}

// What it costs a cart to cross a tile. Water is impassable; rock is dear.
function roadCost(tile) {
  if (tile.terrainType === "ocean" || tile.terrainType === "lake") return Infinity;
  if (tile.terrainType === "mountains") return 9;
  if (tile.terrainType === "river") return 5;          // a ford
  if (tile.terrainType === "marsh") return 4;
  if (tile.terrainType === "rockyOutcrop" || tile.terrainType === "snowfield") return 3;
  if (tile.terrainType === "denseBush" || tile.terrainType === "taiga") return 2.2;
  if (tile.terrainType === "forest" || tile.terrainType === "birchWood") return 1.7;
  return 1;
}

function walkRoad(start, goal, neighborsOf) {
  const best = new Map([[start.id, 0]]);
  const cameFrom = new Map([[start.id, null]]);
  const open = [{ tile: start, cost: 0 }];

  while (open.length) {
    // Small maps, small frontier: a linear scan is cheaper than a heap.
    let index = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[index].cost) index = i;
    const { tile, cost } = open.splice(index, 1)[0];
    if (tile.id === goal.id) break;
    if (cost > (best.get(tile.id) ?? Infinity)) continue;

    for (const neighbor of neighborsOf(tile)) {
      const step = roadCost(neighbor);
      if (!isFinite(step)) continue;
      const next = cost + step;
      if (next < (best.get(neighbor.id) ?? Infinity)) {
        best.set(neighbor.id, next);
        cameFrom.set(neighbor.id, tile);
        open.push({ tile: neighbor, cost: next });
      }
    }
  }

  if (!cameFrom.has(goal.id)) return null;
  const path = [];
  let cursor = goal;
  while (cursor) {
    path.unshift(cursor);
    cursor = cameFrom.get(cursor.id);
  }
  return path;
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

// Flood-fills tiles of the same terrain into regions and gives the big ones
// a name, so the map reads as somewhere rather than as a field of hexes.
function nameRegions(tiles, neighborsOf, grid, random) {
  const seen = new Set();
  const regions = [];

  for (const tile of tiles) {
    if (seen.has(tile.id)) continue;
    const kind = tile.terrainType;
    const body = [];
    const queue = [tile];
    seen.add(tile.id);
    while (queue.length) {
      const current = queue.pop();
      body.push(current);
      for (const neighbor of neighborsOf(current)) {
        if (seen.has(neighbor.id) || neighbor.terrainType !== kind) continue;
        seen.add(neighbor.id);
        queue.push(neighbor);
      }
    }
    if (body.length < WORLD_MIN_REGION) continue;

    const words = REGION_WORDS[kind];
    if (!words) continue;
    const id = `region_${regions.length}`;
    let sumX = 0;
    let sumY = 0;
    for (const member of body) {
      member.regionId = id;
      const center = worldTileCenter(member.q, member.r, grid);
      sumX += center.x;
      sumY += center.y;
    }
    regions.push({
      id,
      terrainType: kind,
      name: `${pick(words.adj, random)} ${pick(words.noun, random)}`,
      tileCount: body.length,
      center: { x: sumX / body.length, y: sumY / body.length },
    });
  }
  return regions;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { generateWorld, worldTileCenter, fractalNoise, isWaterTerrain, classifyLand };
}
