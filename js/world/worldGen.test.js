// worldGen.test.js
//
// Node check for the world generator:  node js/world/worldGen.test.js
//
// Generates the world data/map.json asks for with a fixed seed, times it,
// and asserts the contract in docs/ARCHITECTURE.md holds — every tile
// field present, sane land share, the player within reach of rivals and a
// garlock camp, rivers that end in water, masks that point at water, trade
// roads that are contiguous, sea lanes that stay wet — then prints a
// coarse ASCII map so a human can eyeball the continents. Three more seeds
// are generated afterwards to make sure nothing throws or turns to NaN.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { generateWorld } from "./worldGen.js";
import { TERRAIN, TERRAIN_TYPES, WATER_TYPES, LANDMARK_TYPES } from "./terrainDefs.js";
import { HEX_DIRECTIONS, hexDistance } from "./hexMath.js";

const here = dirname(fileURLToPath(import.meta.url));
const mapData = JSON.parse(readFileSync(join(here, "..", "..", "data", "map.json"), "utf8"));

const TILE_FIELDS = [
  "id", "q", "r", "col", "row", "index", "terrainType", "elevation", "moisture", "temperature",
  "detailSeed", "regionId", "continentId", "coastal", "snowCapped", "feature", "landmark",
  "riverWidth", "riverMask", "villageId", "isStartingTile", "specialEffect",
];
const FEATURES = new Set([null, "waterfall", "oasis", "reef", "hotSpring", "ford"]);

let failures = 0;
function check(condition, message) {
  if (condition) return;
  failures++;
  console.error(`  FAIL: ${message}`);
}

function parseId(id) {
  const parts = id.split("_");
  return { q: Number(parts[1]), r: Number(parts[2]) };
}

// ---- The main world -----------------------------------------------------------

const spec = Object.assign({}, mapData.world, { seed: 424242 });
console.log(`Generating ${spec.cols}x${spec.rows} (${spec.cols * spec.rows} hexes), seed ${spec.seed}...`);
const captions = [];
const started = performance.now();
const world = generateWorld(spec, (fraction, caption) => captions.push(`${Math.round(fraction * 100)}% ${caption}`));
const elapsed = performance.now() - started;
console.log(`Generated in ${elapsed.toFixed(0)} ms (${captions.length} progress reports)`);

const N = spec.cols * spec.rows;
const tiles = world.tiles;
const byId = new Map(tiles.map((tile) => [tile.id, tile]));

check(tiles.length === N, `tile count ${tiles.length} != ${N}`);
check(elapsed < 2500, `generation took ${elapsed.toFixed(0)} ms, budget is 2500 ms`);
check(captions.length >= 8, `only ${captions.length} progress reports`);
check(world.grid.hexSize === spec.hexSize, "grid.hexSize");
check(Number.isFinite(world.width) && Number.isFinite(world.height), "width/height");

// Every tile: every field, sane values, right position.
let landCount = 0;
let missingFields = 0;
let badTerrain = 0;
let badNumbers = 0;
let badPosition = 0;
let badFeature = 0;
const terrainCounts = new Map();
for (let i = 0; i < tiles.length; i++) {
  const tile = tiles[i];
  for (const field of TILE_FIELDS) if (!(field in tile)) missingFields++;
  if (!TERRAIN[tile.terrainType]) badTerrain++;
  if (!Number.isFinite(tile.elevation) || !Number.isFinite(tile.moisture) || !Number.isFinite(tile.temperature)) badNumbers++;
  if (tile.elevation < 0 || tile.elevation > 1 || tile.moisture < 0 || tile.moisture > 1 || tile.temperature < 0 || tile.temperature > 1) badNumbers++;
  if (tile.index !== i || tile.row * spec.cols + tile.col !== i) badPosition++;
  if (tile.id !== `hex_${tile.q}_${tile.r}` || tile.q !== tile.col - Math.floor(tile.row / 2) || tile.r !== tile.row) badPosition++;
  if (!FEATURES.has(tile.feature)) badFeature++;
  if (tile.landmark !== null && !LANDMARK_TYPES.includes(tile.landmark)) badFeature++;
  if (!WATER_TYPES.has(tile.terrainType)) landCount++;
  terrainCounts.set(tile.terrainType, (terrainCounts.get(tile.terrainType) || 0) + 1);
}
check(missingFields === 0, `${missingFields} missing tile fields`);
check(badTerrain === 0, `${badTerrain} tiles with an unknown terrainType`);
check(badNumbers === 0, `${badNumbers} tiles with NaN/out-of-range climate numbers`);
check(badPosition === 0, `${badPosition} tiles with wrong index/id/axial coords`);
check(badFeature === 0, `${badFeature} tiles with an unknown feature/landmark`);
const landFraction = landCount / N;
console.log(`Land fraction ${(landFraction * 100).toFixed(1)}% (${landCount} dry hexes)`);
check(landFraction >= 0.4 && landFraction <= 0.6, `land fraction ${landFraction.toFixed(3)} outside 0.4..0.6`);

// Every TERRAIN key appearing in the output has terrainDefaults.
for (const type of terrainCounts.keys()) check(type in mapData.terrainDefaults, `terrainDefaults missing "${type}"`);
for (const type of TERRAIN_TYPES) check(type in mapData.terrainDefaults, `terrainDefaults missing TERRAIN key "${type}"`);

// Continents.
console.log(`Continents: ${world.continents.length} (${world.continents.slice(0, 6).map((c) => `${c.name || "unnamed"}=${c.tileCount}`).join(", ")})`);
check(world.continents.length >= 3, `only ${world.continents.length} continents`);
check(world.continents.length >= (spec.continents || 4), `fewer continents (${world.continents.length}) than asked (${spec.continents})`);
const sortedSizes = world.continents.map((c) => c.tileCount);
check(sortedSizes.every((size, k) => k === 0 || size <= sortedSizes[k - 1]), "continents not sorted biggest first");
const seaWithId = tiles.filter((t) => (t.terrainType === "ocean" || t.terrainType === "shallows") && t.continentId !== -1).length;
check(seaWithId === 0, `${seaWithId} sea tiles carry a continentId`);
const landWithoutId = tiles.filter((t) => !WATER_TYPES.has(t.terrainType) && t.continentId < 0).length;
check(landWithoutId === 0, `${landWithoutId} land tiles without a continentId`);
// Sea margin.
const edgeLand = tiles.filter((t) => !WATER_TYPES.has(t.terrainType) && Math.min(t.col, spec.cols - 1 - t.col, t.row, spec.rows - 1 - t.row) < 3).length;
check(edgeLand === 0, `${edgeLand} land tiles inside the 3-hex sea margin`);

// Villages.
const player = world.villages.find((v) => v.kind === "player");
check(!!player && player.id === "player", "no player village");
const homeIds = new Set();
for (const village of world.villages) {
  const home = byId.get(village.homeTileId);
  check(!!home, `village ${village.id} home ${village.homeTileId} does not exist`);
  if (!home) continue;
  check(!WATER_TYPES.has(home.terrainType), `village ${village.id} home is on ${home.terrainType}`);
  check(home.villageId === village.id, `home tile of ${village.id} has villageId ${home.villageId}`);
  check(home.specialEffect === (village.kind === "player" ? "startingLand" : "village"), `specialEffect on ${village.id}`);
  check(home.continentId === village.continentId, `continentId mismatch for ${village.id}`);
  check(!homeIds.has(village.homeTileId), `two villages share ${village.homeTileId}`);
  homeIds.add(village.homeTileId);
  check(typeof village.name === "string" && village.name.length > 0, `village ${village.id} has no name`);
  check(/^#[0-9a-f]{6}$/i.test(village.color), `village ${village.id} colour ${village.color}`);
}
const starting = tiles.filter((t) => t.isStartingTile);
check(starting.length === 1 && starting[0].id === player.homeTileId, "exactly one starting tile, the player's");
if (player) {
  const sameContinent = world.villages.filter((v) => v.continentId === player.continentId && v.kind !== "player");
  const rivals = sameContinent.filter((v) => v.kind === "rival").length;
  const garlocks = sameContinent.filter((v) => v.kind === "garlock").length;
  console.log(`Villages: ${world.villages.length}; on the player's continent: ${rivals} rivals, ${garlocks} garlock camps`);
  check(player.continentId === world.continents[0].id, "player is not on the biggest continent");
  check(rivals >= 3, `only ${rivals} rivals on the player's continent`);
  check(garlocks >= 1 && garlocks <= 2, `${garlocks} garlock camps on the player's continent`);
  check(world.villages.length === spec.villageCount, `${world.villages.length} villages, wanted ${spec.villageCount}`);
  // Spacing.
  const homes = world.villages.map((v) => parseId(v.homeTileId));
  let tooClose = 0;
  for (let a = 0; a < homes.length; a++) for (let b = a + 1; b < homes.length; b++) if (hexDistance(homes[a], homes[b]) < 14) tooClose++;
  check(tooClose === 0, `${tooClose} village pairs closer than 14 hexes`);
}
const names = world.villages.map((v) => v.name);
check(new Set(names).size === names.length, "duplicate village names");

// Rivers.
const isWaterTile = (tile) => tile && WATER_TYPES.has(tile.terrainType);
let reached = 0;
let riverTiles = 0;
let widthCounts = [0, 0, 0, 0];
for (const river of world.rivers) {
  if (river.reachedWater) reached++;
  for (const id of river.tileIds) {
    const tile = byId.get(id);
    check(!!tile && tile.terrainType === "river", `river ${river.id} lists non-river tile ${id}`);
  }
}
let badMaskBits = 0;
let maskless = 0;
for (const tile of tiles) {
  if (tile.terrainType !== "river") {
    check(tile.riverWidth === 0 && tile.riverMask === 0, `non-river tile ${tile.id} has river width/mask`);
    continue;
  }
  riverTiles++;
  widthCounts[tile.riverWidth]++;
  if (tile.riverMask === 0) maskless++;
  for (let d = 0; d < 6; d++) {
    if (!(tile.riverMask & (1 << d))) continue;
    const neighbour = byId.get(`hex_${tile.q + HEX_DIRECTIONS[d].q}_${tile.r + HEX_DIRECTIONS[d].r}`);
    if (!isWaterTile(neighbour)) badMaskBits++;
  }
}
console.log(`Rivers: ${world.rivers.length} (${reached} reach water), ${riverTiles} river hexes, widths 1/2/3 = ${widthCounts[1]}/${widthCounts[2]}/${widthCounts[3]}; lakes: ${world.lakes.length}`);
check(world.rivers.length >= 10, `only ${world.rivers.length} rivers`);
check(reached >= world.rivers.length * 0.7, `only ${reached}/${world.rivers.length} rivers reach water`);
check(badMaskBits === 0, `${badMaskBits} riverMask bits point at dry land`);
check(widthCounts[0] === 0, `${widthCounts[0]} river tiles with width 0`);
check(maskless === 0, `${maskless} river tiles with an empty riverMask`);
for (const lake of world.lakes) for (const id of lake.tileIds) check(byId.get(id)?.terrainType === "lake", `lake ${lake.id} lists non-lake tile ${id}`);

// Shallows: every one touches land or other shallows, and every sea hex
// touching land is shallows.
let lonelyShallows = 0;
let bareCoast = 0;
for (const tile of tiles) {
  if (tile.terrainType !== "shallows" && tile.terrainType !== "ocean") continue;
  let touchesLand = false;
  let touchesShallows = false;
  for (const dir of HEX_DIRECTIONS) {
    const neighbour = byId.get(`hex_${tile.q + dir.q}_${tile.r + dir.r}`);
    if (!neighbour) continue;
    if (neighbour.terrainType === "shallows") touchesShallows = true;
    else if (neighbour.terrainType !== "ocean") touchesLand = true;
  }
  if (tile.terrainType === "shallows" && !touchesLand && !touchesShallows) lonelyShallows++;
  if (tile.terrainType === "ocean" && touchesLand) bareCoast++;
}
check(lonelyShallows === 0, `${lonelyShallows} shallows surrounded by nothing but deep ocean`);
check(bareCoast === 0, `${bareCoast} ocean tiles touch land without shallows`);
const coastalCount = tiles.filter((t) => t.coastal).length;
check(coastalCount > 0, "no coastal tiles");

// Trade routes: contiguous, on land, between villages.
let brokenRoutes = 0;
for (const route of world.tradeRoutes) {
  check(world.villages.some((v) => v.id === route.from) && world.villages.some((v) => v.id === route.to), `route between unknown villages ${route.from}-${route.to}`);
  for (let k = 0; k < route.tileIds.length; k++) {
    const tile = byId.get(route.tileIds[k]);
    if (!tile) { brokenRoutes++; continue; }
    if (tile.terrainType === "ocean" || tile.terrainType === "shallows" || tile.terrainType === "lake") brokenRoutes++;
    if (k > 0 && hexDistance(tile, byId.get(route.tileIds[k - 1])) !== 1) brokenRoutes++;
  }
}
console.log(`Trade routes: ${world.tradeRoutes.length}, sea lanes: ${world.seaLanes.length}, landmarks: ${world.landmarks.length}, regions: ${world.regions.length}`);
check(world.tradeRoutes.length >= world.villages.length - world.continents.length - 1, `only ${world.tradeRoutes.length} trade routes`);
check(brokenRoutes === 0, `${brokenRoutes} broken steps in trade routes`);

// Sea lanes: all water, contiguous, shore endpoints on land next to the path.
let dryLane = 0;
for (const lane of world.seaLanes) {
  for (let k = 0; k < lane.tileIds.length; k++) {
    const tile = byId.get(lane.tileIds[k]);
    if (!tile || (tile.terrainType !== "ocean" && tile.terrainType !== "shallows")) dryLane++;
    if (k > 0 && hexDistance(tile, byId.get(lane.tileIds[k - 1])) !== 1) dryLane++;
  }
  const fromShore = byId.get(lane.fromTileId);
  const toShore = byId.get(lane.toTileId);
  check(fromShore && !WATER_TYPES.has(fromShore.terrainType), `lane ${lane.from}-${lane.to} fromTileId is not on land`);
  check(toShore && !WATER_TYPES.has(toShore.terrainType), `lane ${lane.from}-${lane.to} toTileId is not on land`);
  check(fromShore && hexDistance(fromShore, byId.get(lane.tileIds[0])) === 1, "lane does not start beside its shore");
  check(toShore && hexDistance(toShore, byId.get(lane.tileIds[lane.tileIds.length - 1])) === 1, "lane does not end beside its shore");
  const a = world.villages.find((v) => v.id === lane.from);
  const b = world.villages.find((v) => v.id === lane.to);
  check(a && b && a.continentId !== b.continentId, `lane ${lane.from}-${lane.to} joins the same continent`);
}
check(dryLane === 0, `${dryLane} sea-lane steps on land or non-adjacent`);
check(world.seaLanes.length >= 1, "no sea lanes at all");

// Landmarks: on the tile, terrain-appropriate-ish, spaced.
for (const landmark of world.landmarks) {
  const tile = byId.get(landmark.tileId);
  check(tile && tile.landmark === landmark.type, `landmark ${landmark.type} not on ${landmark.tileId}`);
  if (landmark.type === "volcano") check(tile.terrainType === "mountains", "volcano off the mountains");
  if (landmark.type === "oasis") check(tile.terrainType === "desert", "oasis landmark off the desert");
}
check(world.landmarks.length >= LANDMARK_TYPES.length, `only ${world.landmarks.length} landmarks`);
const landmarkTiles = world.landmarks.map((l) => parseId(l.tileId));
let crowded = 0;
for (let a = 0; a < landmarkTiles.length; a++) for (let b = a + 1; b < landmarkTiles.length; b++) if (hexDistance(landmarkTiles[a], landmarkTiles[b]) < 25) crowded++;
check(crowded === 0, `${crowded} landmark pairs closer than 25 hexes`);

// Regions and names.
for (const region of world.regions) {
  check(typeof region.name === "string" && region.tileCount >= 60, `region ${region.id} too small or unnamed`);
  check(Number.isFinite(region.center.x) && Number.isFinite(region.center.y), `region ${region.id} centre`);
}
const allNames = [
  ...world.regions.map((r) => r.name),
  ...world.rivers.map((r) => r.name).filter(Boolean),
  ...world.lakes.map((l) => l.name).filter(Boolean),
  ...world.continents.map((c) => c.name).filter(Boolean),
];
check(new Set(allNames).size === allNames.length, "duplicate names among regions/rivers/lakes/continents");

// Determinism.
{
  const again = generateWorld(spec);
  check(again.tiles.every((tile, i) => tile.terrainType === tiles[i].terrainType && tile.riverMask === tiles[i].riverMask), "same seed gave a different world");
}

// ---- ASCII map ---------------------------------------------------------------

const GLYPHS = {
  ocean: "~", shallows: ".", lake: "o", river: "r",
  beach: "_", cliffs: "#", plains: ",", flowerMeadow: "'", hills: "n", overgrownHighlands: "n",
  forest: "T", birchWood: "t", denseBush: "T", taiga: "Y", timbermellowForest: "t",
  marsh: "%", tundra: "-", snowfield: "*", badlands: "=", desert: ":",
  rockyOutcrop: "^", mountains: "A",
};
const CELL = 4;
const villageAt = new Map(world.villages.map((v) => [v.homeTileId, v.kind === "player" ? "P" : v.kind === "garlock" ? "G" : "V"]));
console.log(`\nASCII map (1 char = ${CELL}x${CELL} hexes; P player, V rival, G garlock; ~ sea . shallows A peaks ^ rock n hills T/t/Y woods , plains ' meadow % marsh = badlands : desert - tundra * snow r river o lake _ beach # cliffs)`);
const lines = [];
for (let cy = 0; cy < Math.ceil(spec.rows / CELL); cy++) {
  let line = "";
  for (let cx = 0; cx < Math.ceil(spec.cols / CELL); cx++) {
    const counts = new Map();
    let marker = null;
    for (let row = cy * CELL; row < Math.min(spec.rows, (cy + 1) * CELL); row++) {
      for (let col = cx * CELL; col < Math.min(spec.cols, (cx + 1) * CELL); col++) {
        const tile = tiles[row * spec.cols + col];
        if (villageAt.has(tile.id)) marker = villageAt.get(tile.id);
        counts.set(tile.terrainType, (counts.get(tile.terrainType) || 0) + 1);
      }
    }
    if (marker) { line += marker; continue; }
    let best = null;
    for (const [type, count] of counts) if (!best || count > best.count) best = { type, count };
    line += GLYPHS[best.type] || "?";
  }
  lines.push(line);
}
console.log(lines.join("\n"));

console.log("\nTerrain mix:");
for (const [type, count] of [...terrainCounts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${type.padEnd(20)} ${String(count).padStart(6)}  ${(100 * count / N).toFixed(1)}%`);
const featureCounts = new Map();
for (const tile of tiles) if (tile.feature) featureCounts.set(tile.feature, (featureCounts.get(tile.feature) || 0) + 1);
console.log(`Features: ${[...featureCounts.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`);
console.log(`Named rivers: ${world.rivers.filter((r) => r.name).map((r) => r.name).join(", ")}`);
console.log(`Named lakes: ${world.lakes.filter((l) => l.name).map((l) => l.name).join(", ")}`);
console.log(`Player: ${player.homeTileId} on ${world.continents[0].name}; garlocks: ${world.villages.filter((v) => v.kind === "garlock").map((v) => v.name).join(", ")}`);

// ---- Other seeds -------------------------------------------------------------

// Drop the big lookups first: three more 86 400-tile worlds on top of the
// first one and its Map would spend the run in the garbage collector.
byId.clear();
for (const seed of [1, 7, 99991]) {
  const t0 = performance.now();
  let other;
  try {
    other = generateWorld(Object.assign({}, mapData.world, { seed }));
  } catch (error) {
    failures++;
    console.error(`  FAIL: seed ${seed} threw: ${error.stack}`);
    continue;
  }
  const ms = performance.now() - t0;
  const nan = other.tiles.filter((t) => !Number.isFinite(t.elevation) || !Number.isFinite(t.moisture) || !Number.isFinite(t.temperature) || !TERRAIN[t.terrainType]).length;
  const dry = other.tiles.filter((t) => !WATER_TYPES.has(t.terrainType)).length / other.tiles.length;
  const p = other.villages.find((v) => v.kind === "player");
  const rivals = other.villages.filter((v) => v.kind === "rival" && p && v.continentId === p.continentId).length;
  const garlocks = other.villages.filter((v) => v.kind === "garlock").length;
  console.log(`Seed ${seed}: ${ms.toFixed(0)} ms, land ${(dry * 100).toFixed(1)}%, ${other.continents.length} continents, ${other.villages.length} villages (${rivals} rivals + ${garlocks} garlocks with the player), ${other.rivers.length} rivers, ${other.seaLanes.length} lanes`);
  check(nan === 0, `seed ${seed}: ${nan} tiles with NaN or unknown terrain`);
  check(other.tiles.length === N, `seed ${seed}: tile count`);
  check(!!p && rivals >= 3 && garlocks >= 1, `seed ${seed}: player continent has ${rivals} rivals and ${garlocks} garlocks`);
  check(dry >= 0.4 && dry <= 0.6, `seed ${seed}: land fraction ${dry.toFixed(3)}`);
  check(other.continents.length >= 3, `seed ${seed}: ${other.continents.length} continents`);
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
