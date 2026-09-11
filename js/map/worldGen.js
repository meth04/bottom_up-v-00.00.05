// worldGen.js
//
// Builds a whole world from a seed, in the spirit of Sếp's drawing: rock
// around the edges, rivers running downhill into pools, meadows and
// thickets in the lowlands, terraced hills by the water — and a handful of
// small villages spread across it, one of them yours.
//
// The same seed always produces the same world, so a saved game only has
// to remember what changed (who owns what, what's been gathered).

// ---------------------------------------------------------------------------
// TUNING
// ---------------------------------------------------------------------------

const WORLD_NOISE_SCALE = 7;         // bigger = broader hills and forests
const WORLD_EDGE_ROCK = 0.45;         // how strongly the map edge rises into rock
const WORLD_RIVER_COUNT = 3;
const WORLD_VILLAGE_SPACING = 5;      // minimum hexes between villages

const VILLAGE_NAMES = ["Ashford", "Brookhollow", "Cairnwick", "Dunmere", "Elmreach", "Fernby", "Greywater", "Hollins"];
const VILLAGE_COLORS = ["#c0392b", "#8e44ad", "#2980b9", "#16a085", "#d35400", "#7f8c8d"];
const PLAYER_COLOR = "#d9a441";
const GARLOCK_COLOR = "#3b2f2f";

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
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const q = col - Math.floor(row / 2);
      const r = row;
      const center = worldTileCenter(q, r, grid);
      const nx = center.x / (hexSize * WORLD_NOISE_SCALE);
      const ny = center.y / (hexSize * WORLD_NOISE_SCALE);

      // Rock rises towards the edge of the sheet, like the pencil frame.
      const edgeDistance = Math.min(col, cols - 1 - col, row, rows - 1 - row);
      const edgeFactor = Math.max(0, 1 - edgeDistance / 3);
      const elevation = fractalNoise(nx, ny, seed, 3) * 0.8 + edgeFactor * edgeFactor * WORLD_EDGE_ROCK;
      const moisture = fractalNoise(nx + 37.2, ny + 91.7, seed + 7, 3);

      const tile = { id: `hex_${q}_${r}`, q, r, col, row, elevation, moisture, edgeDistance, terrainType: null, specialEffect: null };
      tiles.push(tile);
      byKey.set(hexKey(q, r), tile);
    }
  }
  const neighborsOf = (tile) => hexNeighbors(tile.q, tile.r).map(({ q, r }) => byKey.get(hexKey(q, r))).filter(Boolean);

  for (const tile of tiles) {
    if (tile.elevation > 0.78) tile.terrainType = "mountains";
    else if (tile.elevation > 0.64) tile.terrainType = "rockyOutcrop";
    else if (tile.moisture > 0.64) tile.terrainType = "denseBush";
    else if (tile.moisture > 0.53) tile.terrainType = "forest";
    else if (tile.moisture > 0.40) tile.terrainType = "flowerMeadow";
    else tile.terrainType = "plains";
  }

  // ---- Rivers: start high, follow the slope, end in a pool or off the edge ---
  const rivers = [];
  const sourceCandidates = shuffle(
    tiles.filter((tile) => tile.elevation > 0.58 && tile.elevation < 0.76 && tile.edgeDistance >= 2),
    random
  );
  const sources = [];
  for (const candidate of sourceCandidates) {
    if (sources.length >= WORLD_RIVER_COUNT) break;
    if (sources.every((source) => hexDistance(source, candidate) >= 6)) sources.push(candidate);
  }
  for (const source of sources) {
    const path = [source];
    let current = source;
    for (let step = 0; step < 80; step++) {
      const options = neighborsOf(current).filter((tile) => !path.includes(tile));
      if (!options.length) break;
      let next = options[0];
      let nextScore = Infinity;
      for (const option of options) {
        const score = option.elevation + random() * 0.04;
        if (score < nextScore) { nextScore = score; next = option; }
      }
      if (next.terrainType === "river") { path.push(next); break; }        // joins another river
      if (next.elevation > current.elevation + 0.03) { current.specialEffect = "pool"; break; }
      path.push(next);
      current = next;
      if (current.edgeDistance === 0) break;                                 // runs off the sheet
    }
    if (path.length < 3) continue;
    for (const tile of path) tile.terrainType = "river";
    rivers.push(path.map((tile) => tile.id));
  }

  // Lowland next to water becomes terraced hills, like the drawing's slope.
  for (const tile of tiles) {
    if (tile.terrainType === "river") continue;
    if (tile.elevation > 0.5 && tile.elevation <= 0.64 && neighborsOf(tile).some((n) => n.terrainType === "river")) {
      tile.terrainType = "overgrownHighlands";
    }
  }

  // ---- Villages ---------------------------------------------------------------
  const centerX = width / 2;
  const centerY = height / 2;
  const isHomely = (tile) => ["flowerMeadow", "plains", "forest"].includes(tile.terrainType) && tile.edgeDistance >= 2;
  const homely = tiles.filter(isHomely);
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
  // The village farthest from yours is the garlock camp.
  if (villages.length > 1) {
    let farthest = villages[1];
    let farthestDistance = -1;
    for (const village of villages.slice(1)) {
      const home = byKey.get(hexKey(...village.homeTileId.split("_").slice(1).map(Number)));
      const d = hexDistance(home, playerHome);
      if (d > farthestDistance) { farthestDistance = d; farthest = village; }
    }
    farthest.kind = "garlock";
    farthest.name = "Garlock camp";
    farthest.color = GARLOCK_COLOR;
  }

  for (const village of villages) {
    const home = byKey.get(hexKey(...village.homeTileId.split("_").slice(1).map(Number)));
    home.terrainType = "timbermellowForest";
    home.specialEffect = village.kind === "player" ? "startingLand" : "village";
    home.isStartingTile = village.kind === "player";
    home.villageId = village.id;
  }

  return { seed, cols, rows, grid, width, height, tiles, rivers, villages };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { generateWorld, worldTileCenter, fractalNoise };
}
