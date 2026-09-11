// hexMap.js
//
// HexMap owns the tile grid: it takes the tiles worldGen.js produced,
// derives adjacency from (q, r) via hexMath.js, and tracks who owns what
// and what the player has seen.
//
// The rules it encodes come from Sếp's answers in ask.txt:
//   - "Any explored tile would be claimed" — exploring = owning.
//   - Tiles are hidden "till they get the mapmaking tech" — so the player
//     sees only their own land and what's right next to it, remembers what
//     they've seen, and sees everything once mapmaking is researched.
//
// Resource amounts live in data/map.json (terrainDefaults), not here.

class HexMap {
  constructor(mapData) {
    this.terrainDefaults = mapData.terrainDefaults || {};
    this.mapmakingUnlocked = false;
    this.selectedTileId = null;
    this.tilesById = new Map();
    this.tilesByCoord = new Map();
    // Claim order matters: gathering drains the oldest claimed tile first,
    // so the starting tile is the one that visibly runs dry.
    this.claimOrder = [];

    for (const tile of mapData.tiles) {
      const normalized = {
        id: tile.id,
        q: tile.q,
        r: tile.r,
        terrainType: tile.terrainType,
        specialEffect: tile.specialEffect || null,
        isStartingTile: !!tile.isStartingTile,
        villageId: tile.villageId || null,   // set on a village's home tile
        owner: null,                         // village id, or null for wild land
        seen: false,
        resources: this.buildResources(tile),
      };
      this.tilesById.set(normalized.id, normalized);
      this.tilesByCoord.set(hexKey(normalized.q, normalized.r), normalized);
    }
  }

  // A tile's own "resources" block wins; otherwise it gets a copy of the
  // defaults for its terrain. Each entry remembers its starting amount as
  // "max" so renewable resources know how far they can regrow.
  buildResources(tile) {
    const source = tile.resources || this.terrainDefaults[tile.terrainType] || {};
    const resources = {};
    for (const type of Object.keys(source)) {
      resources[type] = {
        amount: source[type].amount,
        max: source[type].amount,
        renewable: !!source[type].renewable,
      };
    }
    return resources;
  }

  getTile(id) {
    return this.tilesById.get(id);
  }

  getAllTiles() {
    return Array.from(this.tilesById.values());
  }

  // Adjacency is always derived from (q, r).
  getNeighbors(id) {
    const tile = this.getTile(id);
    if (!tile) return [];
    return hexNeighbors(tile.q, tile.r)
      .map(({ q, r }) => this.tilesByCoord.get(hexKey(q, r)))
      .filter(Boolean);
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

  // Gives a tile to a village — taking it off whoever held it before.
  claimTile(id, villageId) {
    const owner = villageId || "player";
    const tile = this.getTile(id);
    if (!tile || tile.owner === owner) return null;
    tile.owner = owner;
    if (owner === "player") {
      if (!this.claimOrder.includes(id)) this.claimOrder.push(id);
      this.refreshVisibility();
    } else {
      const index = this.claimOrder.indexOf(id);
      if (index >= 0) this.claimOrder.splice(index, 1);
    }
    return tile;
  }

  getTilesOwnedBy(villageId) {
    return this.getAllTiles().filter((tile) => tile.owner === villageId);
  }

  // The player's land, oldest claim first.
  getClaimedTiles() {
    return this.claimOrder.map((id) => this.getTile(id)).filter(Boolean);
  }

  // Wild land touching a village's territory — what it can explore next.
  isFrontierFor(villageId, id) {
    const tile = this.getTile(id);
    if (!tile || tile.owner) return false;
    return this.getNeighbors(id).some((neighbor) => neighbor.owner === villageId);
  }

  isFrontier(id) {
    return this.isFrontierFor("player", id);
  }

  getFrontierTiles(villageId) {
    const owner = villageId || "player";
    return this.getAllTiles().filter((tile) => this.isFrontierFor(owner, tile.id));
  }

  // Another village's land touching the player's — what can be seized.
  isSeizable(id) {
    const tile = this.getTile(id);
    if (!tile || !tile.owner || tile.owner === "player") return false;
    return this.getNeighbors(id).some((neighbor) => neighbor.owner === "player");
  }

  getSeizableTiles() {
    return this.getAllTiles().filter((tile) => this.isSeizable(tile.id));
  }

  // ---- Visibility -----------------------------------------------------------

  // The player sees their own land and everything next to it, and
  // remembers it afterwards.
  refreshVisibility() {
    for (const tile of this.getTilesOwnedBy("player")) {
      tile.seen = true;
      for (const neighbor of this.getNeighbors(tile.id)) neighbor.seen = true;
    }
  }

  isRevealed(id) {
    const tile = this.getTile(id);
    if (!tile) return false;
    return this.mapmakingUnlocked || tile.seen;
  }

  // Call this once the "mapmaking" technology is researched.
  unlockMapmaking() {
    this.mapmakingUnlocked = true;
  }

  // ---- Resources on the player's land ------------------------------------------

  // Total of the given resource types left across the player's tiles.
  getAvailable(types) {
    let total = 0;
    for (const tile of this.getClaimedTiles()) {
      for (const type of types) {
        if (tile.resources[type]) total += tile.resources[type].amount;
      }
    }
    return total;
  }

  // Takes up to `wanted` units of the given types off the player's tiles,
  // oldest claim first. Returns how much was actually taken.
  take(types, wanted) {
    let remaining = wanted;
    for (const tile of this.getClaimedTiles()) {
      for (const type of types) {
        const entry = tile.resources[type];
        if (!entry || entry.amount <= 0 || remaining <= 0) continue;
        const taken = Math.min(entry.amount, remaining);
        entry.amount -= taken;
        remaining -= taken;
      }
    }
    return wanted - remaining;
  }

  // Regrows renewable resources on the player's tiles by the given per-type
  // amounts, never past the tile's original amount. Returns the total grown.
  regrow(ratesByType) {
    let grown = 0;
    for (const tile of this.getClaimedTiles()) {
      for (const type of Object.keys(ratesByType)) {
        const entry = tile.resources[type];
        if (!entry || !entry.renewable) continue;
        const before = entry.amount;
        entry.amount = Math.min(entry.max, entry.amount + ratesByType[type]);
        grown += entry.amount - before;
      }
    }
    return grown;
  }

  // ---- Selection (for the tile panel) -------------------------------------------

  selectTile(id) {
    this.selectedTileId = this.getTile(id) ? id : null;
  }

  getSelectedTile() {
    return this.selectedTileId ? this.getTile(this.selectedTileId) : null;
  }

  // ---- Saving ----------------------------------------------------------------

  // Only what changes: ownership, what's been seen, amounts left. The rest
  // is rebuilt from the world seed.
  serialize() {
    const tiles = {};
    for (const tile of this.getAllTiles()) {
      const amounts = {};
      for (const type of Object.keys(tile.resources)) amounts[type] = tile.resources[type].amount;
      tiles[tile.id] = { owner: tile.owner, seen: tile.seen, amounts };
    }
    return { mapmakingUnlocked: this.mapmakingUnlocked, claimOrder: this.claimOrder.slice(), tiles };
  }

  deserialize(saved) {
    this.mapmakingUnlocked = !!saved.mapmakingUnlocked;
    this.claimOrder = (saved.claimOrder || []).filter((id) => this.tilesById.has(id));
    for (const id of Object.keys(saved.tiles || {})) {
      const tile = this.getTile(id);
      if (!tile) continue;
      const entry = saved.tiles[id];
      tile.owner = entry.owner || null;
      tile.seen = !!entry.seen;
      for (const type of Object.keys(entry.amounts || {})) {
        if (tile.resources[type]) tile.resources[type].amount = entry.amounts[type];
      }
    }
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { HexMap };
}
