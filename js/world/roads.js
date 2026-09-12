// roads.js (ES module)
//
// The road network: how to get from one hex to another, what it would cost
// to lay a road there, and which of a village's fields are actually joined
// to its hall by a track.
//
// Roads matter to the rules as well as to the picture: a field that is
// connected to the hall hauls more home per hour (territoryRoadMultiplier
// in js/territory.js), a long connected network is easier to defend, and a
// rival whose hall you can reach by road becomes a trading partner. So this
// module is deliberately small and deterministic — the same map and the
// same roads always give the same path.
//
// Three searches live here:
//   findPath    A* over land, for walkers (moveCost) or road-builders
//               (roadCost). An existing road edge is cheap to follow, a
//               river is expensive to cross unless a bridge is already there.
//   waterPath   A* over water only, for boats and trade ships.
//   connectedToTown  a flood fill along road edges out from the hall.
//
// All of them work over `tile.neighbors` (built once by HexMap) and never
// allocate per hex: the open set is a binary heap of tile indexes and the
// scores live in typed arrays stamped with a search generation, so nothing
// has to be cleared between searches on an 86 400-hex map.

import { hexDistance, HEX_DIRECTIONS } from "./hexMath.js";
import { moveCost, roadCost, isWaterTerrain } from "./terrainDefs.js";

// Following an edge that already has a road costs this much per step. It is
// well under the cheapest ground (1) so a path takes the road even when the
// road bends a little.
const ROAD_EDGE_COST = 0.4;

// Entering a river hex that no road (bridge) crosses yet: on top of the
// terrain cost, because a bridge is a real piece of work.
const RIVER_CROSSING_PENALTY = 4;

// Boats: shallow water is where they belong; the open sea is a little
// dearer so a lane hugs the coast when it can.
const WATER_COST = { shallows: 1, lake: 1, river: 1, ocean: 1.3 };

// A* explores no further than this many hexes from the start, whatever the
// caller asks, so a path to the far side of the world cannot stall a frame.
const DEFAULT_MAX_COST = Infinity;

// ---------------------------------------------------------------------------
// A binary min-heap of (priority, tile index) pairs, kept in two parallel
// arrays so pushing a node is two array writes and no object.
// ---------------------------------------------------------------------------

class BinaryHeap {
  constructor() {
    this.keys = [];
    this.values = [];
  }

  get size() {
    return this.keys.length;
  }

  clear() {
    this.keys.length = 0;
    this.values.length = 0;
  }

  push(key, value) {
    const keys = this.keys;
    const values = this.values;
    let i = keys.length;
    keys.push(key);
    values.push(value);
    // Sift up.
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

  // Removes and returns the value with the smallest key.
  pop() {
    const keys = this.keys;
    const values = this.values;
    const top = values[0];
    const lastKey = keys.pop();
    const lastValue = values.pop();
    const n = keys.length;
    if (n > 0) {
      // Sift the last element down from the root.
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        if (left >= n) break;
        const right = left + 1;
        const child = right < n && keys[right] < keys[left] ? right : left;
        if (keys[child] >= lastKey) break;
        keys[i] = keys[child];
        values[i] = values[child];
        i = child;
      }
      keys[i] = lastKey;
      values[i] = lastValue;
    }
    return top;
  }
}

// ---------------------------------------------------------------------------

export class RoadNetwork {
  constructor(hexMap) {
    this.hexMap = hexMap;
    const n = hexMap.allTiles.length;

    // Search scratch. `stamp[i] === generation` means gScore/cameFrom are
    // valid for this search; anything else is "unvisited". Bumping the
    // generation is how a search is cleared.
    this.generation = 0;
    this.stamp = new Uint32Array(n);
    this.gScore = new Float64Array(n);
    this.cameFrom = new Int32Array(n);
    this.closed = new Uint32Array(n);      // closed[i] === generation -> done
    this.heap = new BinaryHeap();

    // Connectivity is asked for on every gather click (through
    // territoryRoadMultiplier) but only changes when a road is laid or land
    // changes hands, so it is cached until then.
    this.connectedCache = new Map();       // villageId -> Set<tileId>
    this.efficiencyCache = new Map();      // villageId -> number

    this.unsubscribe = hexMap.onChange((event) => {
      if (event.kind === "road" || event.kind === "owner" || event.kind === "resources") this.invalidate();
    });
  }

  // ---- A* over land ----------------------------------------------------------

  // Path of tile ids from `fromId` to `toId` inclusive, or null.
  //
  // opts:
  //   preferRoads  existing road edges cost ROAD_EDGE_COST (default true)
  //   allowWater   may cross water hexes (default false; rivers are land here)
  //   maxCost      give up once the cheapest open node costs more than this
  //   forVillage   only tiles owned by this village or by nobody
  //   build        cost by roadCost (laying a road) instead of moveCost
  //                (walking) — autoConnect sets this
  findPath(fromId, toId, opts) {
    const map = this.hexMap;
    const from = map.getTile(fromId);
    const to = map.getTile(toId);
    if (!from || !to) return null;
    if (from === to) return [from.id];

    const preferRoads = !opts || opts.preferRoads !== false;
    const allowWater = !!(opts && opts.allowWater);
    const maxCost = opts && opts.maxCost !== undefined ? opts.maxCost : DEFAULT_MAX_COST;
    const forVillage = opts && opts.forVillage ? opts.forVillage : null;
    const build = !!(opts && opts.build);

    // The heuristic must never overestimate: the cheapest possible step is
    // a road edge when roads are preferred, otherwise flat ground (1).
    const minStep = preferRoads ? ROAD_EDGE_COST : 1;

    const stepCost = (current, next) => {
      const type = next.terrainType;
      if (forVillage && next.owner && next.owner !== forVillage && next !== to) return Infinity;
      if (isWaterTerrain(type) && type !== "river" && !allowWater) return Infinity;
      if (preferRoads && map.hasRoadBetween(current.id, next.id)) return ROAD_EDGE_COST;
      let cost = build ? roadCost(type) : moveCost(type);
      if (!Number.isFinite(cost)) return Infinity;
      // A river you can only cross where a bridge stands; anywhere else it
      // costs a bridge (building) or a wade (walking).
      if (type === "river" && !next.road) cost += RIVER_CROSSING_PENALTY;
      return cost;
    };

    return this.search(from, to, stepCost, minStep, maxCost);
  }

  // Boats only: shallows, lakes, rivers and the open sea. The two ends may
  // be land (a dock, a fishery) — everything in between must be water.
  waterPath(fromId, toId) {
    const map = this.hexMap;
    const from = map.getTile(fromId);
    const to = map.getTile(toId);
    if (!from || !to) return null;
    if (from === to) return [from.id];
    const stepCost = (current, next) => {
      if (next === to) return 1;
      const cost = WATER_COST[next.terrainType];
      return cost === undefined ? Infinity : cost;
    };
    return this.search(from, to, stepCost, 1, DEFAULT_MAX_COST);
  }

  // The shared A* body. `stepCost(current, next)` returns Infinity to block.
  search(from, to, stepCost, minStep, maxCost) {
    const allTiles = this.hexMap.allTiles;
    const generation = ++this.generation;
    // Uint32 wraps after four billion searches; a fresh stamp array is
    // cheaper than reasoning about it.
    if (generation === 0xffffffff) {
      this.stamp.fill(0);
      this.closed.fill(0);
      this.generation = 1;
    }
    const stamp = this.stamp;
    const gScore = this.gScore;
    const cameFrom = this.cameFrom;
    const closed = this.closed;
    const heap = this.heap;
    heap.clear();

    stamp[from.index] = generation;
    gScore[from.index] = 0;
    cameFrom[from.index] = -1;
    heap.push(hexDistance(from, to) * minStep, from.index);

    while (heap.size > 0) {
      const currentIndex = heap.pop();
      if (closed[currentIndex] === generation) continue;   // stale heap entry
      closed[currentIndex] = generation;
      const current = allTiles[currentIndex];
      const g = gScore[currentIndex];
      if (current === to) return this.reconstruct(currentIndex);
      if (g > maxCost) break;

      const neighbors = current.neighbors;
      for (let i = 0; i < neighbors.length; i++) {
        const next = neighbors[i];
        const ni = next.index;
        if (closed[ni] === generation) continue;
        const cost = stepCost(current, next);
        if (cost === Infinity) continue;
        const tentative = g + cost;
        if (stamp[ni] === generation && tentative >= gScore[ni]) continue;
        stamp[ni] = generation;
        gScore[ni] = tentative;
        cameFrom[ni] = currentIndex;
        heap.push(tentative + hexDistance(next, to) * minStep, ni);
      }
    }
    return null;
  }

  reconstruct(endIndex) {
    const allTiles = this.hexMap.allTiles;
    const path = [];
    let i = endIndex;
    while (i >= 0) {
      path.push(allTiles[i].id);
      i = this.cameFrom[i];
    }
    path.reverse();
    return path;
  }

  // ---- Laying roads ------------------------------------------------------------

  // Finds a road route and LAYS it. Returns the path or null if there is no
  // route or it would be longer than `maxLength` hexes. The route only
  // crosses land the starting tile's owner holds, or wild land, so a
  // village never paves its neighbour's fields.
  autoConnect(fromId, toId, opts) {
    const maxLength = opts && opts.maxLength !== undefined ? opts.maxLength : 60;
    const owner = opts && opts.forVillage !== undefined ? opts.forVillage : this.hexMap.ownerOf(fromId);
    const path = this.findPath(fromId, toId, {
      preferRoads: true,
      allowWater: false,
      build: true,
      forVillage: owner || null,
      // Building cost is at least 1 per hex, so a path longer than
      // maxLength must cost more than that — a cheap way to bound the search.
      maxCost: maxLength * 3,
    });
    if (!path || path.length - 1 > maxLength) return null;
    this.hexMap.addRoadPath(path);
    this.invalidate();
    return path;
  }

  // ---- Connectivity ------------------------------------------------------------

  // Every tile reachable from the village's hall along road edges. The hall
  // itself is always in the set, road or no road.
  connectedToTown(villageId) {
    const cached = this.connectedCache.get(villageId);
    if (cached) return cached;
    const map = this.hexMap;
    const connected = new Set();
    const home = map.homeTileOf(villageId);
    if (home) {
      const queue = [home];
      connected.add(home.id);
      for (let head = 0; head < queue.length; head++) {
        const tile = queue[head];
        const mask = tile.road;
        if (!mask) continue;
        for (let dir = 0; dir < 6; dir++) {
          if (!(mask & (1 << dir))) continue;
          const next = map.getTileAt(tile.q + HEX_DIRECTIONS[dir].q, tile.r + HEX_DIRECTIONS[dir].r);
          if (!next || connected.has(next.id)) continue;
          connected.add(next.id);
          queue.push(next);
        }
      }
    }
    this.connectedCache.set(villageId, connected);
    return connected;
  }

  isConnected(tileId, villageId) {
    return this.connectedToTown(villageId).has(tileId);
  }

  // How many road tiles the village can reach from its hall (the hall counts).
  connectedCount(villageId) {
    return this.connectedToTown(villageId).size;
  }

  // Share of the village's resource-bearing tiles (anything with an amount
  // left, the hall excluded) that a road joins to the hall. 0 with no such
  // tiles. This is what the gathering bonus is built on.
  efficiencyFor(villageId) {
    const cached = this.efficiencyCache.get(villageId);
    if (cached !== undefined) return cached;
    const connected = this.connectedToTown(villageId);
    let total = 0;
    let joined = 0;
    for (const tile of this.hexMap.getTilesOwnedBy(villageId)) {
      if (tile.villageId === villageId) continue;
      if (!hasResources(tile)) continue;
      total++;
      if (connected.has(tile.id)) joined++;
    }
    const efficiency = total === 0 ? 0 : joined / total;
    this.efficiencyCache.set(villageId, efficiency);
    return efficiency;
  }

  // Nearest tile in the village's connected network to `tileId`, by hex
  // distance — where a new site's road should run to. The hall if there is
  // no network yet.
  nearestConnected(tileId, villageId) {
    const map = this.hexMap;
    const tile = map.getTile(tileId);
    if (!tile) return null;
    let best = null;
    let bestDistance = Infinity;
    for (const id of this.connectedToTown(villageId)) {
      const candidate = map.getTile(id);
      if (!candidate) continue;
      const distance = hexDistance(tile, candidate);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  invalidate() {
    this.connectedCache.clear();
    this.efficiencyCache.clear();
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
  }
}

// Whether anything is left to gather on a tile.
export function hasResources(tile) {
  const resources = tile.resources;
  if (!resources) return false;
  for (const type in resources) {
    if (resources[type].amount > 0) return true;
  }
  return false;
}
