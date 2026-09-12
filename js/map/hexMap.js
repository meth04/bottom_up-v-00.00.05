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
    // Who owns what, kept up to date as land changes hands. Without this,
    // every question about a village's land is a walk over thirty thousand
    // tiles, and there are thirty villages asking every turn.
    this.tilesByOwner = new Map();
    this.seenTiles = new Set();        // what the player has laid eyes on
    this.allTiles = null;              // built once, reused
    // Bumped whenever the player's land or what is on it changes. Callers
    // that add up resources can hold on to their answer until it moves.
    this.resourceVersion = 0;
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
        landmark: tile.landmark || null,
        // Kept from worldGen so the inspect pane can describe the place and
        // the painter can scatter the same undergrowth every time.
        elevation: tile.elevation,
        moisture: tile.moisture,
        temperature: tile.temperature,
        regionId: tile.regionId || null,
        detailSeed: tile.detailSeed || 0,
        snowCapped: !!tile.snowCapped,
        coastal: !!tile.coastal,
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
        // What the world generator gave it, so a save can leave out every
        // tile nobody has touched.
        startingMax: source[type].amount,
        renewable: !!source[type].renewable,
      };
    }
    return resources;
  }

  getTile(id) {
    return this.tilesById.get(id);
  }

  getAllTiles() {
    // The set of tiles never changes once the world is built, so the array
    // is made once. It used to be rebuilt — thirty thousand entries — on
    // every call, and it is called a great many times.
    if (!this.allTiles) this.allTiles = Array.from(this.tilesById.values());
    return this.allTiles;
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
    if (tile.owner) {
      const previous = this.tilesByOwner.get(tile.owner);
      if (previous) previous.delete(id);
    }
    tile.owner = owner;
    if (!this.tilesByOwner.has(owner)) this.tilesByOwner.set(owner, new Set());
    this.tilesByOwner.get(owner).add(id);

    if (owner === "player") {
      if (!this.claimSet) this.claimSet = new Set(this.claimOrder);
      if (!this.claimSet.has(id)) {
        this.claimOrder.push(id);
        this.claimSet.add(id);
      }
      this.revealAround(tile);
      this.resourceVersion++;
    } else {
      if (!this.claimSet) this.claimSet = new Set(this.claimOrder);
      if (this.claimSet.has(id)) {
        this.claimSet.delete(id);
        const index = this.claimOrder.indexOf(id);
        if (index >= 0) this.claimOrder.splice(index, 1);
        this.resourceVersion++;
      }
    }
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

  // How much land the player holds. Asked for on every screen refresh, so it
  // must not be "build an array of five hundred tiles and measure it".
  countClaimed() {
    return this.claimOrder.length;
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

  // Walk out from the village's own land rather than over the whole map:
  // the frontier is a rim around something small, not a property of every
  // tile on the island.
  getFrontierTiles(villageId) {
    const owner = villageId || "player";
    const seen = new Set();
    const frontier = [];
    for (const tile of this.getTilesOwnedBy(owner)) {
      for (const neighbor of this.getNeighbors(tile.id)) {
        if (neighbor.owner || seen.has(neighbor.id)) continue;
        seen.add(neighbor.id);
        frontier.push(neighbor);
      }
    }
    return frontier;
  }

  // Another village's land touching the player's — what can be seized.
  isSeizable(id) {
    const tile = this.getTile(id);
    if (!tile || !tile.owner || tile.owner === "player") return false;
    return this.getNeighbors(id).some((neighbor) => neighbor.owner === "player");
  }

  getSeizableTiles() {
    const seen = new Set();
    const seizable = [];
    for (const tile of this.getTilesOwnedBy("player")) {
      for (const neighbor of this.getNeighbors(tile.id)) {
        if (!neighbor.owner || neighbor.owner === "player" || seen.has(neighbor.id)) continue;
        seen.add(neighbor.id);
        seizable.push(neighbor);
      }
    }
    return seizable;
  }

  // ---- Visibility -----------------------------------------------------------

  // The player sees their own land and everything next to it, and
  // remembers it afterwards.
  refreshVisibility() {
    for (const tile of this.getTilesOwnedBy("player")) this.revealAround(tile);
  }

  // Claiming one tile only ever reveals that tile and its neighbours, so
  // there is no reason to walk the player's whole territory again.
  revealAround(tile) {
    tile.seen = true;
    this.seenTiles.add(tile.id);
    for (const neighbor of this.getNeighbors(tile.id)) {
      neighbor.seen = true;
      this.seenTiles.add(neighbor.id);
    }
  }

  // Every tile the player has seen, without searching for them.
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
    this.resourceVersion++;
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

  // Regrows renewable resources on the player's tiles, never past what the
  // tile can hold. The rates are FRACTIONS OF THAT CEILING, not flat
  // amounts: a big grove puts out more than a thin one, and — the reason it
  // had to change — the numbers keep working whatever size a tile is. With
  // flat amounts, making the grid three times finer quietly starved the
  // home grove, because it kept its old large ceiling and got a ninth of
  // its old regrowth.
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
    return grown;
  }

  // Takes a share of the given resources off the player's tiles *and* off
  // what those tiles can ever hold again. The famine, in one method.
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
    return lost;
  }

  // Shrinks what the player's land can hold, without touching what is on it.
  // Called every autumn once the famine has begun.
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
    // The world is rebuilt from its seed on load, so a save only needs the
    // tiles that differ from it: the ones somebody owns, the ones the player
    // has seen, and the ones that have been gathered from or withered. On a
    // thirty-thousand hex map, saving all of them would not fit in the
    // browser's storage at all.
    const tiles = {};
    for (const tile of this.getAllTiles()) {
      let amounts = null;
      let maxes = null;
      for (const type of Object.keys(tile.resources)) {
        const entry = tile.resources[type];
        if (entry.amount === entry.startingMax && entry.max === entry.startingMax) continue;
        if (!amounts) { amounts = {}; maxes = {}; }
        amounts[type] = entry.amount;
        // The famine shrinks a tile's ceiling, so that has to be saved too.
        maxes[type] = entry.max;
      }
      if (!tile.owner && !tile.seen && !amounts) continue;
      const entry = { owner: tile.owner, seen: tile.seen };
      if (amounts) { entry.amounts = amounts; entry.maxes = maxes; }
      tiles[tile.id] = entry;
    }
    return { mapmakingUnlocked: this.mapmakingUnlocked, claimOrder: this.claimOrder.slice(), tiles };
  }

  deserialize(saved) {
    this.resourceVersion++;
    this.mapmakingUnlocked = !!saved.mapmakingUnlocked;
    this.claimOrder = (saved.claimOrder || []).filter((id) => this.tilesById.has(id));
    this.claimSet = new Set(this.claimOrder);
    this.tilesByOwner = new Map();
    this.seenTiles = new Set();
    for (const id of Object.keys(saved.tiles || {})) {
      const tile = this.getTile(id);
      if (!tile) continue;
      const entry = saved.tiles[id];
      tile.owner = entry.owner || null;
      tile.seen = !!entry.seen;
      if (tile.seen) this.seenTiles.add(id);
      if (tile.owner) {
        if (!this.tilesByOwner.has(tile.owner)) this.tilesByOwner.set(tile.owner, new Set());
        this.tilesByOwner.get(tile.owner).add(id);
      }
      for (const type of Object.keys(entry.maxes || {})) {
        if (tile.resources[type]) tile.resources[type].max = entry.maxes[type];
      }
      for (const type of Object.keys(entry.amounts || {})) {
        if (tile.resources[type]) tile.resources[type].amount = entry.amounts[type];
      }
    }
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { HexMap };
}
