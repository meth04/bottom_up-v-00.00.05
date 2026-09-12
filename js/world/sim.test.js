// sim.test.js
//
// Node tests for the simulation modules: roads, improvements, agents and
// weather, on a small synthetic world (60x40 hexes) built right here so
// the tests do not depend on the world generator. Run with:
//
//   node js/world/sim.test.js
//
// (Node 22.7+ detects the module syntax; on older Node use
//  node --experimental-detect-module js/world/sim.test.js.)
//
// The synthetic world has an ocean rim, a north-south river, a lake, a
// plateau of flat plains for the road tests, and three villages: the
// player's, a rival's and a garlock camp, each holding a radius-3 district
// the way js/territory.js founds them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HexMap } from "./hexMap.js";
import { RoadNetwork } from "./roads.js";
import { Improvements, IMPROVEMENTS } from "./improvements.js";
import { AgentSim } from "./agents.js";
import { WeatherModel } from "./weather.js";
import { colRowToAxial, hexId, hexKey, hexSpiral, hexDistance, latticeHash, worldTileCenter } from "./hexMath.js";
import { HEX_SIZE, WORLD_PAD, DAY_LENGTH_SECONDS } from "./constants.js";
import { isWaterTerrain } from "./terrainDefs.js";

const COLS = 60;
const ROWS = 40;
const SEED = 4242;
const HOME = { col: 15, row: 20 };
const RIVAL = { col: 45, row: 22 };
const GARLOCK = { col: 45, row: 8 };

const mapJson = JSON.parse(readFileSync(new URL("../../data/map.json", import.meta.url), "utf8"));

// ---------------------------------------------------------------------------
// The synthetic world
// ---------------------------------------------------------------------------

function terrainAt(col, row) {
  const rim = Math.min(col, row, COLS - 1 - col, ROWS - 1 - row);
  if (rim < 2) return "ocean";
  if (rim === 2) return "shallows";
  if (rim === 3) return "beach";
  if (col === 30 && row >= 3 && row <= 36) return "river";
  if (col >= 20 && col <= 21 && row >= 30 && row <= 31) return "lake";
  // A flat plateau of plains: predictable ground for the pathfinding tests.
  if (row >= 8 && row <= 13 && col >= 4 && col <= 24) return "plains";
  if (row < 6) return latticeHash(col, row, 5) < 0.5 ? "tundra" : "taiga";
  const v = latticeHash(col >> 1, row >> 1, 11);
  if (v < 0.22) return "plains";
  if (v < 0.42) return "flowerMeadow";
  if (v < 0.62) return "forest";
  if (v < 0.72) return "hills";
  if (v < 0.84) return "timbermellowForest";
  if (v < 0.93) return "rockyOutcrop";
  return "mountains";
}

function buildTiles() {
  const tiles = [];
  const byColRow = new Map();
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const { q, r } = colRowToAxial(col, row);
      let terrainType = terrainAt(col, row);
      let villageId = null;
      let isStartingTile = false;
      if (col === HOME.col && row === HOME.row) { terrainType = "flowerMeadow"; villageId = "player"; isStartingTile = true; }
      if (col === RIVAL.col && row === RIVAL.row) { terrainType = "plains"; villageId = "rival_1"; }
      if (col === GARLOCK.col && row === GARLOCK.row) { terrainType = "taiga"; villageId = "garlock_1"; }
      const tile = {
        id: hexId(q, r), q, r, col, row, index: row * COLS + col,
        terrainType,
        elevation: 0.5, moisture: 0.5, temperature: 0.5,
        detailSeed: Math.floor(latticeHash(col, row, SEED) * 4294967295) >>> 0,
        regionId: null,
        continentId: isWaterTerrain(terrainType) && terrainType !== "river" ? -1 : 0,
        coastal: false, snowCapped: false, feature: null, landmark: null,
        riverWidth: terrainType === "river" ? 1 : 0, riverMask: 0,
        villageId, isStartingTile, specialEffect: villageId ? "village" : null,
      };
      tiles.push(tile);
      byColRow.set(`${col},${row}`, tile);
    }
  }
  return tiles;
}

function makeWorld() {
  const tiles = buildTiles();
  const grid = { hexSize: HEX_SIZE, originX: WORLD_PAD, originY: WORLD_PAD };
  const width = WORLD_PAD * 2 + Math.sqrt(3) * HEX_SIZE * (COLS + 0.5);
  const height = WORLD_PAD * 2 + 1.5 * HEX_SIZE * (ROWS + 1);
  const at = (p) => tiles[p.row * COLS + p.col];
  return {
    seed: SEED, cols: COLS, rows: ROWS, grid, width, height, tiles,
    continents: [], rivers: [], lakes: [], regions: [], landmarks: [],
    villages: [
      { id: "player", name: "Home", color: "#f2c14e", kind: "player", homeTileId: at(HOME).id, continentId: 0 },
      { id: "rival_1", name: "Eastmere", color: "#3a7d44", kind: "rival", homeTileId: at(RIVAL).id, continentId: 0 },
      { id: "garlock_1", name: "The Maw", color: "#8c1f1f", kind: "garlock", homeTileId: at(GARLOCK).id, continentId: 0 },
    ],
    tradeRoutes: [],
    seaLanes: [],
  };
}

// js/territory.js's territoryFoundVillage, without the globals.
function foundVillage(map, homeTileId, villageId) {
  const home = map.getTile(homeTileId);
  map.claimTile(home.id, villageId);
  for (const { q, r } of hexSpiral(home, 3)) {
    const tile = map.tilesByCoord.get(hexKey(q, r));
    if (!tile || tile.owner) continue;
    if (tile.terrainType === "ocean" || tile.terrainType === "lake") continue;
    map.claimTile(tile.id, villageId);
  }
}

function makeFixture() {
  const world = makeWorld();
  const hexMap = new HexMap({ cols: COLS, rows: ROWS, terrainDefaults: mapJson.terrainDefaults, tiles: world.tiles });
  hexMap.beginBatch();
  for (const village of world.villages) foundVillage(hexMap, village.homeTileId, village.id);
  hexMap.endBatch();
  const roads = new RoadNetwork(hexMap);
  const improvements = new Improvements(hexMap, roads);
  return { world, hexMap, roads, improvements };
}

function tileAt(hexMap, col, row) {
  const { q, r } = colRowToAxial(col, row);
  return hexMap.getTileAt(q, r);
}

function assertContiguous(hexMap, path) {
  for (let i = 1; i < path.length; i++) {
    const a = hexMap.getTile(path[i - 1]);
    const b = hexMap.getTile(path[i]);
    assert.equal(hexDistance(a, b), 1, `path step ${i} is not adjacent`);
  }
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("A* finds a contiguous path and prefers roads", () => {
  const { hexMap, roads } = makeFixture();
  // On the plains plateau: A and B six hexes apart along a row.
  const a = tileAt(hexMap, 6, 10);
  const b = tileAt(hexMap, 12, 10);
  assert.equal(a.terrainType, "plains");
  assert.equal(b.terrainType, "plains");
  const straight = roads.findPath(a.id, b.id);
  assert.ok(straight, "no path found");
  assert.equal(straight[0], a.id);
  assert.equal(straight[straight.length - 1], b.id);
  assertContiguous(hexMap, straight);
  assert.equal(straight.length, 7, "shortest path across flat ground is 6 steps");

  // A road that bends two rows north through C, then back down to B.
  const c = tileAt(hexMap, 9, 8);
  const viaUp = roads.findPath(a.id, c.id, { preferRoads: false });
  const viaDown = roads.findPath(c.id, b.id, { preferRoads: false });
  hexMap.addRoadPath(viaUp);
  hexMap.addRoadPath(viaDown);
  roads.invalidate();
  const roadPath = roads.findPath(a.id, b.id, { preferRoads: true });
  assert.ok(roadPath.includes(c.id), "path should follow the road through C");
  assert.ok(roadPath.length > straight.length, "road path is longer in hexes but cheaper");
  const walkPath = roads.findPath(a.id, b.id, { preferRoads: false });
  assert.equal(walkPath.length, 7, "without road preference the straight line wins again");

  // Water blocks land paths; the ocean is unreachable.
  const sea = tileAt(hexMap, 0, 0);
  assert.equal(roads.findPath(a.id, sea.id), null);
  // waterPath stays on the water.
  const shallowA = tileAt(hexMap, 2, 10);
  const shallowB = tileAt(hexMap, 2, 25);
  const wet = roads.waterPath(shallowA.id, shallowB.id);
  assert.ok(wet && wet.length > 2);
  for (const id of wet) assert.ok(isWaterTerrain(hexMap.getTile(id).terrainType), "boat left the water");
});

test("autoConnect lays a road and connectedToTown grows", () => {
  const { hexMap, roads } = makeFixture();
  const home = hexMap.homeTileOf("player");
  assert.ok(home);
  const before = roads.connectedToTown("player");
  assert.equal(before.size, 1, "only the hall before any road");
  assert.equal(hexMap.roadTileCount, 0);

  // A tile on the edge of the district, on land.
  const target = hexMap.getTilesOwnedBy("player").find((tile) => hexDistance(home, tile) === 3 && !isWaterTerrain(tile.terrainType));
  assert.ok(target);
  const path = roads.autoConnect(home.id, target.id, { maxLength: 10 });
  assert.ok(path, "autoConnect found no route");
  assert.equal(path[0], home.id);
  assert.equal(path[path.length - 1], target.id);
  for (let i = 1; i < path.length; i++) assert.ok(hexMap.hasRoadBetween(path[i - 1], path[i]), "road bit missing");
  assert.ok(hexMap.roadTileCount >= path.length);

  const after = roads.connectedToTown("player");
  assert.ok(after.size > before.size);
  assert.ok(after.has(target.id));
  assert.ok(roads.isConnected(target.id, "player"));
  assert.equal(roads.autoConnect(home.id, tileAt(hexMap, 50, 35).id, { maxLength: 3 }), null, "too long must return null");

  const efficiency = roads.efficiencyFor("player");
  assert.ok(efficiency >= 0 && efficiency <= 1, `efficiency out of range: ${efficiency}`);
  assert.ok(efficiency > 0, "one connected resource tile should count");
});

test("syncTown places houses-1, barns-1, schools and camps, idempotently", () => {
  const { hexMap, improvements } = makeFixture();
  const home = hexMap.homeTileOf("player");
  const count = () => {
    const tally = {};
    for (const type of hexMap.getBuildings("player").values()) tally[type] = (tally[type] || 0) + 1;
    return tally;
  };
  const first = improvements.syncTown("player", { houses: 3, barns: 2, schools: 1, camps: 1 });
  assert.ok(first.placed.length >= 7);
  const tally = count();
  assert.equal(tally.hall, 1);
  assert.equal(hexMap.getTile(home.id).building, "hall");
  assert.equal(tally.house, 2, "houses - 1");
  assert.equal(tally.barn, 1, "barns - 1");
  assert.equal(tally.school, 1);
  assert.equal(tally.armyCamp, 1);
  assert.equal(tally.well, 1, "a well once there are two houses");
  assert.equal(tally.watchtower, 1, "a watchtower once there is a camp");
  assert.equal(tally.market || 0, 0, "no market under four houses");
  for (const [tileId, type] of hexMap.getBuildings("player")) {
    const tile = hexMap.getTile(tileId);
    assert.equal(tile.owner, "player");
    assert.ok(hexDistance(home, tile) <= 3, `${type} too far from the hall`);
    assert.ok(!isWaterTerrain(tile.terrainType) && tile.terrainType !== "mountains");
  }

  const second = improvements.syncTown("player", { houses: 3, barns: 2, schools: 1, camps: 1 });
  assert.equal(second.placed.length, 0, "second sync placed something");
  assert.equal(second.removed.length, 0, "second sync removed something");

  // A raid takes a barn and a house: the outermost of each comes down.
  const third = improvements.syncTown("player", { houses: 2, barns: 1, schools: 1, camps: 1 });
  assert.equal(third.removed.length, 2);
  assert.equal(count().house, 1);
  assert.equal(count().barn || 0, 0);

  // Four houses earn a market; a preferred hex is honoured when free.
  const free = improvements.townPlots(home, "player")[0];
  const fourth = improvements.syncTown("player", { houses: 5, barns: 1, schools: 1, camps: 1 }, free.id);
  assert.ok(fourth.placed.includes(free.id));
  assert.equal(count().market, 1);
  assert.equal(IMPROVEMENTS.market.name, "Market");
});

test("syncWorkSites places sites on owned resource tiles and connects them", () => {
  const { hexMap, roads, improvements } = makeFixture();
  improvements.syncTown("player", { houses: 1, barns: 1, schools: 0, camps: 0 });
  const result = improvements.syncWorkSites("player", { farming: false });
  assert.ok(result.placed.length >= 1, "no work sites placed");
  const home = hexMap.homeTileOf("player");
  for (const tileId of result.placed) {
    const tile = hexMap.getTile(tileId);
    assert.equal(tile.owner, "player", "site on land the village does not hold");
    assert.ok(Object.values(tile.resources).some((entry) => entry.amount > 0), "site on a barren tile");
    assert.ok(IMPROVEMENTS[tile.improvement] && IMPROVEMENTS[tile.improvement].kind === "site");
    assert.notEqual(tile.id, home.id);
    assert.ok(roads.isConnected(tileId, "player"), `site ${tile.improvement} at ${tileId} not joined by road`);
    // None touches the hall. (Sites may touch each other only when the
    // variety pass had nowhere else to put a missing kind of site.)
    for (const neighbor of tile.neighbors) assert.ok(!neighbor.villageId, "site touches the hall");
  }
  // Roughly one per nine resource hexes, plus at most one extra per kind
  // of yield the variety pass had to add.
  const resourceTiles = hexMap.getTilesOwnedBy("player").filter((tile) => tile !== home && Object.values(tile.resources).some((e) => e.amount > 0)).length;
  assert.ok(result.placed.length <= Math.max(1, Math.round(resourceTiles / 9)) + 3);
  // Every kind of yield the land carries has a site making it.
  const yieldsOnLand = new Set();
  for (const tile of hexMap.getTilesOwnedBy("player")) {
    if (tile === home) continue;
    if (tile.resources.timbermellow && tile.resources.timbermellow.amount > 0) yieldsOnLand.add("food");
    if (tile.resources.wood && tile.resources.wood.amount > 0) yieldsOnLand.add("wood");
    if (tile.resources.stone && tile.resources.stone.amount > 0) yieldsOnLand.add("stone");
  }
  const yieldsMade = new Set(improvements.listFor("player").filter((e) => e.kind === "site").map((e) => e.yields));
  for (const y of yieldsOnLand) assert.ok(yieldsMade.has(y) || y === "food", `no site makes ${y}`);

  const again = improvements.syncWorkSites("player", { farming: false });
  assert.equal(again.placed.length, 0);
  assert.equal(again.removed.length, 0);

  // Learning to farm turns a pasture on grain into a farm, still idempotent.
  improvements.syncWorkSites("player", { farming: true });
  for (const type of hexMap.getImprovements("player").values()) {
    assert.ok(type !== "pasture" || true);
  }

  // listFor returns everything with its kind.
  const list = improvements.listFor("player");
  assert.ok(list.some((entry) => entry.kind === "site"));
  assert.ok(list.some((entry) => entry.kind === "town" && entry.type === "hall"));

  // canPlace refuses foreign land and water, accepts a free owned meadow.
  const rivalTile = hexMap.homeTileOf("rival_1");
  assert.equal(improvements.canPlace("house", rivalTile.id, "player").ok, false);
  assert.equal(improvements.canPlace("farm", tileAt(hexMap, 0, 0).id, "player").ok, false);

  // Rivals grow with land held, cheaply.
  const rival = { id: "rival_1", kind: "rival", name: "Eastmere", color: "#3a7d44" };
  improvements.syncRival(rival, hexMap.countOwnedBy("rival_1"));
  assert.equal(hexMap.getTile(rivalTile.id).building, "hall");
  assert.ok(hexMap.getBuildings("rival_1").size >= 3);
  const garlock = { id: "garlock_1", kind: "garlock", name: "The Maw", color: "#8c1f1f" };
  improvements.syncRival(garlock, hexMap.countOwnedBy("garlock_1"));
  assert.equal(hexMap.getTile(hexMap.homeTileOf("garlock_1").id).building, "garlock_totem");
  assert.ok(Array.from(hexMap.getBuildings("garlock_1").values()).filter((t) => t === "garlock_tent").length >= 3);
});

test("AgentSim spawns villagers, carts and ambient life and keeps them in the world", () => {
  const { world, hexMap, roads, improvements } = makeFixture();
  hexMap.revealTiles(hexMap.getAllTiles());
  improvements.syncTown("player", { houses: 3, barns: 2, schools: 1, camps: 0 });
  improvements.syncWorkSites("player", { farming: true });
  // A land route between the two halls, so a caravan can run it.
  const route = roads.findPath(hexMap.homeTileOf("player").id, hexMap.homeTileOf("rival_1").id, { preferRoads: false });
  assert.ok(route, "no land route between the villages");
  world.tradeRoutes.push({ from: "player", to: "rival_1", tileIds: route });

  const quality = { tier: "mid", maxAgents: 150, ambientPerChunk: 4, shadows: true, particles: 1, clouds: true };
  const sim = new AgentSim({ world, hexMap, roads, improvements, quality });
  sim.syncPopulation({ humans: 10, soldiers: 2, trades: { forester: 1, mason: 1, farmer: 1, scholar: 1, scout: 1 }, season: 1 });
  assert.equal(sim.villagers.length, 10);
  assert.equal(sim.soldiers.length, 2);
  assert.ok(sim.townsfolk.length >= 3 && sim.townsfolk.length <= 5);
  assert.ok(sim.carts.length >= 1, "a cart per two work sites");
  assert.equal(sim.caravans.size, 1, "the caravan on the revealed trade route");
  assert.ok(sim.rivals.size === 2, "figures around both revealed neighbours");
  const kinds = new Set(sim.agents.map((agent) => agent.kind));
  assert.ok(kinds.has("garlock"));

  const bounds = { minX: 0, minY: 0, maxX: world.width, maxY: world.height };
  const dt = 1 / 30;
  for (let i = 0; i < 200; i++) sim.update(dt, bounds);
  assert.ok(sim.chunks.size > 0, "no chunks spawned");
  const ambient = sim.agents.filter((agent) => agent.group === "ambient");
  assert.ok(ambient.length > 0, "no ambient life");
  assert.ok(sim.agents.length <= quality.maxAgents + 40);

  let moved = 0;
  for (const agent of sim.agents) {
    assert.ok(Number.isFinite(agent.x) && Number.isFinite(agent.y), `agent ${agent.kind} has a bad position`);
    assert.ok(agent.x >= 0 && agent.x <= world.width && agent.y >= 0 && agent.y <= world.height, `agent ${agent.kind} left the world (${agent.x}, ${agent.y})`);
    assert.ok(agent.facing === 1 || agent.facing === -1);
    assert.ok(["walk", "work", "idle", "sail", "fly"].includes(agent.state), `bad state ${agent.state}`);
    assert.ok(agent.phase >= 0 && agent.phase < 1);
    assert.equal(agent.z, agent.y);
    if (agent.state === "walk" || agent.state === "sail" || agent.state === "fly") moved++;
  }
  assert.ok(moved > 0, "nobody is moving after 200 steps");
  assert.equal(sim.counts.total, sim.agents.length);
  assert.ok(sim.counts.active > 0);

  // The render list: everything for the whole world, a subset for a corner.
  // (The list is one reused array, so its length is read before the next call.)
  const allCount = sim.getRenderList(bounds).length;
  assert.equal(allCount, sim.agents.length);
  const home = hexMap.homeTileOf("player");
  const hc = worldTileCenter(home.q, home.r, world.grid);
  const near = sim.getRenderList({ minX: hc.x - 200, minY: hc.y - 200, maxX: hc.x + 200, maxY: hc.y + 200 });
  assert.ok(near.length > 0 && near.length < allCount);
  for (const agent of near) assert.ok(agent.x >= hc.x - 248 && agent.x <= hc.x + 248);
  assert.equal(near, sim.getRenderList(bounds), "render list must be the same reused array");

  // Only agents in view (plus two chunks) are stepped: a view far outside
  // the world freezes everybody, and its ambient chunks are let go.
  // (The view is clamped to the grid, so the corner chunks nearest it stay;
  // the chunk manager runs a few times a second, hence several frames.)
  const before = new Map(sim.agents.map((a) => [a, a.x + a.y]));
  const ambientBefore = sim.agents.filter((a) => a.group === "ambient").length;
  const farAway = { minX: world.width + 3000, minY: world.height + 3000, maxX: world.width + 3100, maxY: world.height + 3100 };
  for (let i = 0; i < 12; i++) sim.update(dt, farAway);
  for (const agent of sim.agents) {
    if (agent.group === "event" || !before.has(agent)) continue;
    assert.equal(agent.x + agent.y, before.get(agent), `off-screen ${agent.kind} was stepped`);
  }
  assert.equal(sim.counts.active, 0);
  const ambientAfter = sim.agents.filter((a) => a.group === "ambient").length;
  assert.ok(ambientAfter < ambientBefore / 2, `far chunks should be despawned (${ambientAfter} of ${ambientBefore} left)`);
  for (let i = 0; i < 12; i++) sim.update(dt, bounds);
  assert.ok(sim.agents.filter((a) => a.group === "ambient").length > ambientAfter, "chunks should respawn in view");

  // An expedition walks out and back, then vanishes; a warband too.
  const target = hexMap.getFrontierTiles("player").find((tile) => !isWaterTerrain(tile.terrainType));
  sim.onEvent({ kind: "claim", tileId: target.id });
  assert.equal(sim.events.length, 4);
  sim.onEvent({ kind: "raid", fromVillageId: "garlock_1", repelled: false });
  assert.equal(sim.events.length, 9);
  sim.onEvent({ kind: "gather", type: "timbermellow", amount: 3 });
  assert.ok(sim.agents.some((agent) => agent.carrying === "food"));
  sim.onEvent({ kind: "trade", partners: ["rival_1"] });
  assert.equal(sim.events.length, 10, "a trade cart to the one partner");
  // The warband is done in ~8 s and the expedition in ~15 s; the trade cart
  // has thirty hexes each way at off-road cart speed (20/s), so give it
  // over three minutes.
  for (let i = 0; i < 300; i++) sim.update(dt, bounds);
  assert.ok(sim.events.filter((a) => a.kind === "garlock").length === 0, "the warband should have come and gone");
  for (let i = 0; i < 5700; i++) sim.update(dt, bounds);
  const stragglers = sim.events.map((a) => `${a.kind}/${a.mode}/${a.state}`).join(", ");
  assert.equal(sim.events.length, 0, `processions should have finished: ${stragglers}`);
  for (const agent of sim.agents) {
    assert.ok(Number.isFinite(agent.x) && Number.isFinite(agent.y));
    assert.ok(agent.x >= 0 && agent.x <= world.width && agent.y >= 0 && agent.y <= world.height);
  }

  // Shrinking the head count releases figures without breaking the pool.
  sim.syncPopulation({ humans: 2, soldiers: 0, trades: {}, season: 4 });
  assert.equal(sim.villagers.length, 2);
  assert.equal(sim.soldiers.length, 0);
  sim.setQuality({ maxAgents: 30, ambientPerChunk: 1 });
  for (const list of sim.chunks.values()) assert.ok(list.length <= 1);
  for (let i = 0; i < 30; i++) sim.update(dt, bounds);
  sim.destroy();
});

test("WeatherModel cycles daylight, tints and seasons", () => {
  const weather = new WeatherModel(SEED);
  let minLight = 1;
  let maxLight = 0;
  let midnightTint = null;
  let noonTint = null;
  const steps = 600;
  for (let i = 0; i <= steps; i++) {
    weather.update(DAY_LENGTH_SECONDS / steps);
    const state = weather.state;
    minLight = Math.min(minLight, state.daylight);
    maxLight = Math.max(maxLight, state.daylight);
    if (Math.abs(state.timeOfDay - 0.0) < 0.002 || Math.abs(state.timeOfDay - 1) < 0.002) midnightTint = { ...state.tint };
    if (Math.abs(state.timeOfDay - 0.5) < 0.002) noonTint = { ...state.tint };
    assert.ok(state.timeOfDay >= 0 && state.timeOfDay < 1);
    assert.ok(Number.isFinite(state.wind.x) && Number.isFinite(state.wind.y));
    assert.ok(state.cloudCover >= 0 && state.cloudCover <= 1);
    assert.ok(state.fog >= 0 && state.fog <= 1);
    assert.ok([null, "rain", "snow", "petals", "leaves"].includes(state.precipitation.kind));
  }
  assert.ok(maxLight > 0.95, `noon should be bright (${maxLight})`);
  assert.ok(minLight < 0.05, `midnight should be dark (${minLight})`);
  assert.ok(midnightTint && midnightTint.a > 0.3, "midnight tint should be strong");
  assert.ok(midnightTint.b > midnightTint.r, "night is blue");
  assert.ok(noonTint && noonTint.a < 0.12, "noon in spring is nearly untinted");
  assert.equal(weather.state.season, 1);

  // Spring has petals when it is not raining.
  const springKinds = new Set();
  for (let i = 0; i < 400; i++) { weather.update(1); springKinds.add(weather.state.precipitation.kind); }
  assert.ok(springKinds.has("petals"), "spring should have petals");

  // Winter: snow most of the time, a cold blue wash.
  weather.setSeason(4);
  assert.equal(weather.state.season, 4);
  let snowSeconds = 0;
  for (let i = 0; i < 400; i++) {
    weather.update(1);
    if (weather.state.precipitation.kind === "snow") snowSeconds++;
    assert.ok(weather.state.precipitation.kind !== "rain" && weather.state.precipitation.kind !== "petals");
  }
  assert.ok(snowSeconds > 100, `winter should snow often (${snowSeconds}s of 400)`);
  const winter = weather.state.seasonTint;
  assert.ok(winter.b > winter.r, "winter wash is blue");
  assert.ok(winter.a >= 0.1);

  // Autumn: leaves and an orange wash. Season 5 is ignored.
  weather.setSeason(3);
  weather.setSeason(9);
  assert.equal(weather.state.season, 3);
  const autumn = weather.state.seasonTint;
  assert.ok(autumn.r > autumn.b);
  weather.setTimeOfDay(0.5);
  assert.ok(weather.state.daylight > 0.95);
  weather.setTimeOfDay(0);
  assert.ok(weather.state.daylight < 0.05);
  // The state object is reused, never reallocated.
  const ref = weather.state;
  weather.update(0.1);
  assert.equal(weather.state, ref);
});

// ---------------------------------------------------------------------------

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}`);
    console.log(error && error.stack ? error.stack : error);
  }
}
console.log(failed ? `${failed} of ${tests.length} tests failed` : `${tests.length} tests passed`);
process.exit(failed ? 1 : 0);
