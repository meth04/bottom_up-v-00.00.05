// hexMap.js (ES module)
//
// HexMap owns the tile grid: it takes the tiles worldGen produced, derives
// adjacency from (q, r), and tracks everything that CHANGES during play —
// who owns what, what the player has seen, what is left on each tile, the
// roads, the improvements out on the land and the buildings in the towns.
//
// It is also the change bus for the renderer: anything that alters a tile
// goes through a method here, and listeners registered with onChange() are
// told which tiles moved so only those chunks are rebuilt.
//
// Change events: { kind, tileIds }
//   owner        tiles changed hands
//   seen         tiles became visible (fog lifted)
//   reveal       mapmaking: the whole map is visible (tileIds empty)
//   road         road masks changed
//   improvement  an improvement was placed/removed
//   building     a town building was placed/removed
//   resources    amounts on the player's land changed (tileIds may be empty)
//   selection    the selected tile changed
//
// Tile record (see worldGen for the generated fields):
//   id, q, r, col, row, index, terrainType, elevation, moisture, temperature,
//   detailSeed, regionId, continentId, coastal, snowCapped, feature,
//   landmark, riverWidth, riverMask, villageId, isStartingTile,
//   neighbors (array of tile refs, built here),
//   owner, seen, resources, road (6-bit mask), improvement, building

import { hexKey, hexNeighbors, HEX_DIRECTIONS, OPPOSITE_DIRECTION, directionBetween } from "./hexMath.js";
import { SAVE_VERSION } from "./constants.js";

export class HexMap {
  constructor(mapData) {
    this.terrainDefaults = mapData.terrainDefaults || {};
    this.cols = mapData.cols || 0;
    this.rows = mapData.rows || 0;
    this.mapmakingUnlocked = false;
    this.selectedTileId = null;
    this.tilesById = new Map();
    this.tilesByCoord = new Map();
    this.tilesByOwner = new Map();
    this.seenTiles = new Set();
    this.allTiles = [];
    this.resourceVersion = 0;
    this.claimOrder = [];
    this.claimSet = new Set();
    // ownerId -> Map(tileId -> type)
    this.improvementsByOwner = new Map();
    this.buildingsByOwner = new Map();
    this.roadTileCount = 0;
    this.listeners = [];
    this.batchDepth = 0;
    this.batched = null;

    for (const tile of mapData.tiles) {
      const normalized = {
        id: tile.id,
        q: tile.q,
        r: tile.r,
        col: tile.col,
        row: tile.row,
        index: tile.index !== undefined ? tile.index : tile.row * this.cols + tile.col,
        terrainType: tile.terrainType,
        specialEffect: tile.specialEffect || null,
        landmark: tile.landmark || null,
        feature: tile.feature || null,
        elevation: tile.elevation,
        moisture: tile.moisture,
        temperature: tile.temperature,
        regionId: tile.regionId || null,
        continentId: tile.continentId === undefined ? null : tile.continentId,
        detailSeed: tile.detailSeed || 0,
        snowCapped: !!tile.snowCapped,
        coastal: !!tile.coastal,
        riverWidth: tile.riverWidth || 0,
        riverMask: tile.riverMask || 0,
        isStartingTile: !!tile.isStartingTile,
        villageId: tile.villageId || null,
        owner: null,
        seen: false,
        resources: this.buildResources(tile),
        road: 0,
        improvement: null,
        building: null,
        neighbors: null,
      };
      this.tilesById.set(normalized.id, normalized);
      this.tilesByCoord.set(hexKey(normalized.q, normalized.r), normalized);
      this.allTiles.push(normalized);
    }
    // Adjacency, once. Pathfinding, the generator's smoothing passes and the
    // renderer's edge tests all walk neighbours millions of times.
    for (const tile of this.allTiles) {
      const list = [];
      for (const { q, r } of hexNeighbors(tile.q, tile.r)) {
        const neighbor = this.tilesByCoord.get(hexKey(q, r));
        if (neighbor) list.push(neighbor);
      }
      tile.neighbors = list;
    }
  }

  buildResources(tile) {
    const source = tile.resources || this.terrainDefaults[tile.terrainType] || {};
    const resources = {};
    for (const type of Object.keys(source)) {
      resources[type] = {
        amount: source[type].amount,
        max: source[type].amount,
        startingMax: source[type].amount,
        renewable: !!source[type].renewable,
      };
    }
    return resources;
  }

  // ---- Change notification ---------------------------------------------------

  onChange(listener) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  emit(kind, tileIds) {
    if (this.batchDepth > 0) {
      if (!this.batched.has(kind)) this.batched.set(kind, new Set());
      const set = this.batched.get(kind);
      for (const id of tileIds || []) set.add(id);
      return;
    }
    const event = { kind, tileIds: tileIds || [] };
    for (const listener of this.listeners) listener(event);
  }

  // Wrap bulk edits (founding thirty villages, loading a save) so listeners
  // get one event per kind instead of thousands.
  beginBatch() {
    if (this.batchDepth === 0) this.batched = new Map();
    this.batchDepth++;
  }

  endBatch() {
    this.batchDepth = Math.max(0, this.batchDepth - 1);
    if (this.batchDepth > 0) return;
    const batched = this.batched;
    this.batched = null;
    for (const [kind, ids] of batched) this.emit(kind, Array.from(ids));
  }

  // ---- Lookup ----------------------------------------------------------------

  getTile(id) {
    return this.tilesById.get(id);
  }

  getTileAt(q, r) {
    return this.tilesByCoord.get(hexKey(q, r)) || null;
  }

  getAllTiles() {
    return this.allTiles;
  }

  getNeighbors(id) {
    const tile = this.getTile(id);
    return tile ? tile.neighbors : [];
  }

  // ---- Ownership -------------------------------------------------------------

  ownerOf(id) {
    const tile = this.getTile(id);
    return tile ? tile.owner : null;
  }

  isOwnedBy(id, villageId) {
    return this.ownerOf(id) === villageId;
  }

  isClaimed(id) {
    return this.isOwnedBy(id, "player");
  }

  claimTile(id, villageId) {
    const owner = villageId || "player";
    const tile = this.getTile(id);
    if (!tile || tile.owner === owner) return null;
    if (tile.owner) {
      const previous = this.tilesByOwner.get(tile.owner);
      if (previous) previous.delete(id);
      // An improvement changes hands with the ground it stands on.
      if (tile.improvement) this.moveImprovementOwner(tile, tile.owner, owner);
    }
    tile.owner = owner;
    if (!this.tilesByOwner.has(owner)) this.tilesByOwner.set(owner, new Set());
    this.tilesByOwner.get(owner).add(id);

    if (owner === "player") {
      if (!this.claimSet.has(id)) {
        this.claimOrder.push(id);
        this.claimSet.add(id);
      }
      this.revealAround(tile);
      this.resourceVersion++;
    } else if (this.claimSet.has(id)) {
      this.claimSet.delete(id);
      const index = this.claimOrder.indexOf(id);
      if (index >= 0) this.claimOrder.splice(index, 1);
      this.resourceVersion++;
    }
    this.emit("owner", [id]);
    return tile;
  }

  getTilesOwnedBy(villageId) {
    const ids = this.tilesByOwner.get(villageId);
    if (!ids) return [];
    const tiles = [];
    for (const id of ids) {
      const tile = this.getTile(id);
      if (tile) tiles.push(tile);
    }
    return tiles;
  }

  countOwnedBy(villageId) {
    const ids = this.tilesByOwner.get(villageId);
    return ids ? ids.size : 0;
  }

  countClaimed() {
    return this.claimOrder.length;
  }

  getClaimedTiles() {
    const tiles = [];
    for (const id of this.claimOrder) {
      const tile = this.getTile(id);
      if (tile) tiles.push(tile);
    }
    return tiles;
  }

  isFrontierFor(villageId, id) {
    const tile = this.getTile(id);
    if (!tile || tile.owner) return false;
    return tile.neighbors.some((neighbor) => neighbor.owner === villageId);
  }

  isFrontier(id) {
    return this.isFrontierFor("player", id);
  }

  getFrontierTiles(villageId) {
    const owner = villageId || "player";
    const seen = new Set();
    const frontier = [];
    for (const tile of this.getTilesOwnedBy(owner)) {
      for (const neighbor of tile.neighbors) {
        if (neighbor.owner || seen.has(neighbor.id)) continue;
        seen.add(neighbor.id);
        frontier.push(neighbor);
      }
    }
    return frontier;
  }

  isSeizable(id) {
    const tile = this.getTile(id);
    if (!tile || !tile.owner || tile.owner === "player") return false;
    return tile.neighbors.some((neighbor) => neighbor.owner === "player");
  }

  getSeizableTiles() {
    const seen = new Set();
    const seizable = [];
    for (const tile of this.getTilesOwnedBy("player")) {
      for (const neighbor of tile.neighbors) {
        if (!neighbor.owner || neighbor.owner === "player" || seen.has(neighbor.id)) continue;
        seen.add(neighbor.id);
        seizable.push(neighbor);
      }
    }
    return seizable;
  }

  // The tile a village lives on (its hall).
  homeTileOf(villageId) {
    for (const tile of this.getTilesOwnedBy(villageId)) {
      if (tile.villageId === villageId) return tile;
    }
    return null;
  }

  // ---- Visibility -----------------------------------------------------------

  refreshVisibility() {
    for (const tile of this.getTilesOwnedBy("player")) this.revealAround(tile);
  }

  revealAround(tile, radius) {
    const changed = [];
    const mark = (candidate) => {
      if (candidate.seen) return;
      candidate.seen = true;
      this.seenTiles.add(candidate.id);
      changed.push(candidate.id);
    };
    mark(tile);
    for (const neighbor of tile.neighbors) {
      mark(neighbor);
      if (radius >= 2) for (const far of neighbor.neighbors) mark(far);
    }
    if (changed.length) this.emit("seen", changed);
  }

  revealTiles(tiles) {
    const changed = [];
    for (const tile of tiles) {
      if (tile.seen) continue;
      tile.seen = true;
      this.seenTiles.add(tile.id);
      changed.push(tile.id);
    }
    if (changed.length) this.emit("seen", changed);
  }

  getSeenTiles() {
    const tiles = [];
    for (const id of this.seenTiles) {
      const tile = this.getTile(id);
      if (tile) tiles.push(tile);
    }
    return tiles;
  }

  isRevealed(id) {
    const tile = this.getTile(id);
    if (!tile) return false;
    return this.mapmakingUnlocked || tile.seen;
  }

  unlockMapmaking() {
    this.mapmakingUnlocked = true;
    this.emit("reveal", []);
  }

  // ---- Roads -----------------------------------------------------------------

  hasRoad(id) {
    const tile = this.getTile(id);
    return !!(tile && tile.road);
  }

  hasRoadBetween(idA, idB) {
    const a = this.getTile(idA);
    const b = this.getTile(idB);
    if (!a || !b) return false;
    const dir = directionBetween(a, b);
    return dir >= 0 && (a.road & (1 << dir)) !== 0;
  }

  // Lays road between two ADJACENT tiles (both ends get the bit).
  addRoadEdge(idA, idB) {
    const a = this.getTile(idA);
    const b = this.getTile(idB);
    if (!a || !b) return false;
    const dir = directionBetween(a, b);
    if (dir < 0) return false;
    const before = (a.road ? 1 : 0) + (b.road ? 1 : 0);
    a.road |= 1 << dir;
    b.road |= 1 << OPPOSITE_DIRECTION[dir];
    this.roadTileCount += (a.road ? 1 : 0) + (b.road ? 1 : 0) - before;
    this.emit("road", [a.id, b.id]);
    return true;
  }

  removeRoadEdge(idA, idB) {
    const a = this.getTile(idA);
    const b = this.getTile(idB);
    if (!a || !b) return false;
    const dir = directionBetween(a, b);
    if (dir < 0) return false;
    const before = (a.road ? 1 : 0) + (b.road ? 1 : 0);
    a.road &= ~(1 << dir);
    b.road &= ~(1 << OPPOSITE_DIRECTION[dir]);
    this.roadTileCount += (a.road ? 1 : 0) + (b.road ? 1 : 0) - before;
    this.emit("road", [a.id, b.id]);
    return true;
  }

  // Lays a road along a path of adjacent tile ids. Returns edges added.
  addRoadPath(tileIds) {
    let added = 0;
    this.beginBatch();
    for (let i = 1; i < tileIds.length; i++) {
      if (!this.hasRoadBetween(tileIds[i - 1], tileIds[i]) && this.addRoadEdge(tileIds[i - 1], tileIds[i])) added++;
    }
    this.endBatch();
    return added;
  }

  // Removes every road bit on a tile (and the matching bits next door).
  clearRoads(id) {
    const tile = this.getTile(id);
    if (!tile || !tile.road) return;
    for (let dir = 0; dir < 6; dir++) {
      if (!(tile.road & (1 << dir))) continue;
      const neighbor = this.getTileAt(tile.q + HEX_DIRECTIONS[dir].q, tile.r + HEX_DIRECTIONS[dir].r);
      if (neighbor) this.removeRoadEdge(tile.id, neighbor.id);
    }
  }

  // Every tile carrying any road.
  getRoadTiles() {
    const tiles = [];
    for (const tile of this.allTiles) if (tile.road) tiles.push(tile);
    return tiles;
  }

  // ---- Improvements and buildings --------------------------------------------

  setImprovement(id, type) {
    const tile = this.getTile(id);
    if (!tile) return false;
    const owner = tile.owner || "wild";
    if (tile.improvement) {
      const list = this.improvementsByOwner.get(owner);
      if (list) list.delete(id);
    }
    tile.improvement = type || null;
    if (type) {
      if (!this.improvementsByOwner.has(owner)) this.improvementsByOwner.set(owner, new Map());
      this.improvementsByOwner.get(owner).set(id, type);
    }
    this.emit("improvement", [id]);
    return true;
  }

  moveImprovementOwner(tile, from, to) {
    const source = this.improvementsByOwner.get(from);
    if (source) source.delete(tile.id);
    if (!this.improvementsByOwner.has(to)) this.improvementsByOwner.set(to, new Map());
    this.improvementsByOwner.get(to).set(tile.id, tile.improvement);
  }

  // Map(tileId -> type) of a village's improvements.
  getImprovements(villageId) {
    return this.improvementsByOwner.get(villageId) || new Map();
  }

  setBuilding(id, type) {
    const tile = this.getTile(id);
    if (!tile) return false;
    const owner = tile.owner || "wild";
    if (tile.building) {
      const list = this.buildingsByOwner.get(owner);
      if (list) list.delete(id);
    }
    tile.building = type || null;
    if (type) {
      if (!this.buildingsByOwner.has(owner)) this.buildingsByOwner.set(owner, new Map());
      this.buildingsByOwner.get(owner).set(id, type);
    }
    this.emit("building", [id]);
    return true;
  }

  getBuildings(villageId) {
    return this.buildingsByOwner.get(villageId) || new Map();
  }

  // ---- Resources on the player's land ------------------------------------------

  getAvailable(types) {
    let total = 0;
    for (const id of this.claimOrder) {
      const tile = this.getTile(id);
      if (!tile) continue;
      for (const type of types) {
        if (tile.resources[type]) total += tile.resources[type].amount;
      }
    }
    return total;
  }

  take(types, wanted) {
    this.resourceVersion++;
    let remaining = wanted;
    const touched = [];
    for (const id of this.claimOrder) {
      if (remaining <= 0) break;
      const tile = this.getTile(id);
      if (!tile) continue;
      for (const type of types) {
        const entry = tile.resources[type];
        if (!entry || entry.amount <= 0 || remaining <= 0) continue;
        const taken = Math.min(entry.amount, remaining);
        entry.amount -= taken;
        remaining -= taken;
        touched.push(id);
      }
    }
    this.emit("resources", touched);
    return wanted - remaining;
  }

  regrow(ratesByType) {
    this.resourceVersion++;
    let grown = 0;
    for (const tile of this.getClaimedTiles()) {
      for (const type of Object.keys(ratesByType)) {
        const entry = tile.resources[type];
        if (!entry || !entry.renewable) continue;
        const before = entry.amount;
        entry.amount = Math.min(entry.max, entry.amount + Math.ceil(entry.max * ratesByType[type]));
        grown += entry.amount - before;
      }
    }
    this.emit("resources", []);
    return grown;
  }

  wither(types, fraction) {
    this.resourceVersion++;
    let lost = 0;
    for (const tile of this.getClaimedTiles()) {
      for (const type of types) {
        const entry = tile.resources[type];
        if (!entry) continue;
        const gone = Math.floor(entry.amount * fraction);
        entry.amount -= gone;
        entry.max = Math.max(1, Math.floor(entry.max * (1 - fraction)));
        if (entry.amount > entry.max) entry.amount = entry.max;
        lost += gone;
      }
    }
    this.emit("resources", []);
    return lost;
  }

  decayCapacity(types, fraction) {
    this.resourceVersion++;
    for (const tile of this.getClaimedTiles()) {
      for (const type of types) {
        const entry = tile.resources[type];
        if (!entry || !entry.renewable) continue;
        entry.max = Math.max(1, Math.floor(entry.max * (1 - fraction)));
        if (entry.amount > entry.max) entry.amount = entry.max;
      }
    }
    this.emit("resources", []);
  }

  // ---- Selection ---------------------------------------------------------------

  selectTile(id) {
    const next = this.getTile(id) ? id : null;
    if (next === this.selectedTileId) return;
    const previous = this.selectedTileId;
    this.selectedTileId = next;
    this.emit("selection", [previous, next].filter(Boolean));
  }

  getSelectedTile() {
    return this.selectedTileId ? this.getTile(this.selectedTileId) : null;
  }

  // ---- Saving ------------------------------------------------------------------

  serialize() {
    const tiles = {};
    for (const tile of this.allTiles) {
      let amounts = null;
      let maxes = null;
      for (const type of Object.keys(tile.resources)) {
        const entry = tile.resources[type];
        if (entry.amount === entry.startingMax && entry.max === entry.startingMax) continue;
        if (!amounts) { amounts = {}; maxes = {}; }
        amounts[type] = entry.amount;
        maxes[type] = entry.max;
      }
      if (!tile.owner && !tile.seen && !amounts && !tile.road && !tile.improvement && !tile.building) continue;
      const entry = {};
      if (tile.owner) entry.o = tile.owner;
      if (tile.seen) entry.s = 1;
      if (tile.road) entry.r = tile.road;
      if (tile.improvement) entry.i = tile.improvement;
      if (tile.building) entry.b = tile.building;
      if (amounts) { entry.a = amounts; entry.m = maxes; }
      tiles[tile.id] = entry;
    }
    return { version: SAVE_VERSION, mapmakingUnlocked: this.mapmakingUnlocked, claimOrder: this.claimOrder.slice(), tiles };
  }

  deserialize(saved) {
    this.beginBatch();
    this.resourceVersion++;
    this.mapmakingUnlocked = !!saved.mapmakingUnlocked;
    this.claimOrder = (saved.claimOrder || []).filter((id) => this.tilesById.has(id));
    this.claimSet = new Set(this.claimOrder);
    this.tilesByOwner = new Map();
    this.seenTiles = new Set();
    this.improvementsByOwner = new Map();
    this.buildingsByOwner = new Map();
    this.roadTileCount = 0;
    for (const tile of this.allTiles) {
      tile.owner = null; tile.seen = false; tile.road = 0; tile.improvement = null; tile.building = null;
    }
    const owned = [];
    const seen = [];
    const roads = [];
    for (const id of Object.keys(saved.tiles || {})) {
      const tile = this.getTile(id);
      if (!tile) continue;
      const entry = saved.tiles[id];
      tile.owner = entry.o || null;
      tile.seen = !!entry.s;
      if (tile.seen) { this.seenTiles.add(id); seen.push(id); }
      if (tile.owner) {
        if (!this.tilesByOwner.has(tile.owner)) this.tilesByOwner.set(tile.owner, new Set());
        this.tilesByOwner.get(tile.owner).add(id);
        owned.push(id);
      }
      if (entry.r) { tile.road = entry.r; this.roadTileCount++; roads.push(id); }
      if (entry.i) this.setImprovement(id, entry.i);
      if (entry.b) this.setBuilding(id, entry.b);
      for (const type of Object.keys(entry.m || {})) {
        if (tile.resources[type]) tile.resources[type].max = entry.m[type];
      }
      for (const type of Object.keys(entry.a || {})) {
        if (tile.resources[type]) tile.resources[type].amount = entry.a[type];
      }
    }
    this.emit("owner", owned);
    this.emit("seen", seen);
    this.emit("road", roads);
    this.emit("resources", []);
    if (this.mapmakingUnlocked) this.emit("reveal", []);
    this.endBatch();
  }
}
