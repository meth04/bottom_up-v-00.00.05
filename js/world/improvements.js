// improvements.js (ES module)
//
// What people build, and where it goes.
//
// Two families live here. WORK SITES stand out on the land — a farm on the
// meadow, a lumber camp in the wood, a quarry under the hill, a fishery on
// the shore — and mark where a village actually works its ground. TOWN
// BUILDINGS stand in rings around the hall and mirror the legacy counters
// in game.js (stonehouse, barn, school, armycamp), so when the player
// presses "build a house" a house appears on a hex next to the square.
//
// The rules never ask this module for permission: game.js keeps its own
// counters and this module keeps the map in step with them (syncTown).
// The one exception is the Place tool in main.js, which asks canPlace()
// before letting the player put a building on a hex of their choosing.
//
// Every placement is idempotent and deterministic: the same counters and
// the same land give the same town, so a reload looks like the game that
// was saved and the renderer is only told about hexes that really changed.

import { hexSpiral, hexDistance } from "./hexMath.js";
import { isWaterTerrain } from "./terrainDefs.js";
import { hasResources } from "./roads.js";

// ---------------------------------------------------------------------------
// The catalogue. `kind: "site"` goes on the land, `kind: "town"` in the
// rings around the hall. `counter` names the game.js number a town building
// follows. `spriteBase` is the atlas key the feature layer draws.
// ---------------------------------------------------------------------------

const FOREST = ["forest", "birchWood", "denseBush", "taiga", "timbermellowForest", "marsh"];
const ROCK = ["mountains", "rockyOutcrop", "badlands", "cliffs", "snowfield"];
const HILL = ["hills", "overgrownHighlands"];
const FIELD = ["plains", "flowerMeadow", "overgrownHighlands", "hills", "badlands"];
const GRAZING = ["flowerMeadow", "plains", "hills", "tundra"];

export const IMPROVEMENTS = {
  // ---- out on the land ------------------------------------------------------
  farm:       { name: "Farm",        kind: "site", terrains: FIELD,                 yields: "food",  spriteBase: "improvement/farm" },
  pasture:    { name: "Pasture",     kind: "site", terrains: GRAZING,               yields: "food",  spriteBase: "improvement/pasture" },
  lumberCamp: { name: "Lumber camp", kind: "site", terrains: FOREST,                yields: "wood",  spriteBase: "improvement/lumberCamp" },
  quarry:     { name: "Quarry",      kind: "site", terrains: ROCK.concat(HILL, ["tundra", "beach"]), yields: "stone", spriteBase: "improvement/quarry" },
  fishery:    { name: "Fishery",     kind: "site", terrains: null, needsWater: true, yields: "food",  spriteBase: "improvement/fishery" },
  mine:       { name: "Mine",        kind: "site", terrains: ["mountains", "rockyOutcrop"], yields: "stone", spriteBase: "improvement/mine" },

  // ---- in the town (tied to the game.js counters) -----------------------------
  hall:          { name: "Hall",          kind: "town", spriteBase: "building/hall" },
  house:         { name: "House",         kind: "town", counter: "houses",  spriteBase: "building/house" },
  barn:          { name: "Barn",          kind: "town", counter: "barns",   spriteBase: "building/barn" },
  school:        { name: "School",        kind: "town", counter: "schools", spriteBase: "building/school" },
  armyCamp:      { name: "Army camp",     kind: "town", counter: "camps",   spriteBase: "building/armyCamp" },
  market:        { name: "Market",        kind: "town", spriteBase: "building/market" },
  watchtower:    { name: "Watchtower",    kind: "town", spriteBase: "building/watchtower" },
  well:          { name: "Well",          kind: "town", spriteBase: "building/well" },
  dock:          { name: "Dock",          kind: "town", needsWater: true, spriteBase: "building/dock" },
  garlock_tent:  { name: "Garlock tent",  kind: "town", spriteBase: "building/garlock_tent" },
  garlock_totem: { name: "Garlock totem", kind: "town", spriteBase: "building/garlock_totem" },
};

// How far from the hall a town building may stand (hexSpiral rings 1..3):
// the village's founding radius, so a town never spills onto wild land.
const TOWN_RADIUS = 3;

// Work sites keep this many hexes between them (and from the hall), so a
// district reads as a farm with fields, not a shed on every hex.
const SITE_SPACING = 2;

// Roughly one work site per this many resource-bearing hexes.
const SITE_PER_TILES = 9;

// A site's road runs to the nearest connected tile; longer than this and
// the site simply stays off the network until the player draws one.
const SITE_ROAD_MAX = 40;

// Water next door, for fisheries and docks.
const SHORE_WATER = new Set(["ocean", "shallows", "lake", "river"]);

function nearWater(tile) {
  if (tile.coastal) return true;
  for (const neighbor of tile.neighbors) if (SHORE_WATER.has(neighbor.terrainType)) return true;
  return false;
}

function nearRock(tile) {
  for (const neighbor of tile.neighbors) if (neighbor.terrainType === "mountains" || neighbor.terrainType === "rockyOutcrop") return true;
  return false;
}

function hasResource(tile, type) {
  const entry = tile.resources && tile.resources[type];
  return !!entry && entry.amount > 0;
}

// ---------------------------------------------------------------------------

export class Improvements {
  constructor(hexMap, roads) {
    this.hexMap = hexMap;
    this.roads = roads;
    // Rival towns only grow when the land they hold crosses a threshold;
    // this remembers the last shape built so syncRival is a string compare
    // on every other call.
    this.rivalKeys = new Map();
  }

  // ---- Rules -------------------------------------------------------------------

  // Whether `type` may stand on `tileId` for `villageId`, and if not, why
  // (written for the player — the Place tool shows it as a hint).
  canPlace(type, tileId, villageId) {
    const def = IMPROVEMENTS[type];
    if (!def) return { ok: false, reason: "Nobody knows how to build that." };
    const tile = this.hexMap.getTile(tileId);
    if (!tile) return { ok: false, reason: "Pick a hex on the map first." };
    if (tile.owner !== villageId) return { ok: false, reason: "You can only build on your own land." };
    if (isWaterTerrain(tile.terrainType) && tile.terrainType !== "river") return { ok: false, reason: "Nothing can be built on water." };
    if (tile.villageId && type !== "hall" && type !== "garlock_totem") return { ok: false, reason: "The hall already stands here." };
    if (tile.building || tile.improvement) return { ok: false, reason: "Something already stands on that hex." };

    if (def.kind === "town") {
      if (tile.terrainType === "mountains") return { ok: false, reason: "Nobody builds a house on a mountain." };
      const home = this.hexMap.homeTileOf(villageId);
      if (home && hexDistance(home, tile) > TOWN_RADIUS) return { ok: false, reason: "Town buildings must stand within three hexes of the hall." };
      if (def.needsWater && !nearWater(tile)) return { ok: false, reason: "A dock needs water beside it." };
      return { ok: true, reason: null };
    }

    // A work site.
    if (def.needsWater) {
      if (!nearWater(tile)) return { ok: false, reason: `A ${def.name.toLowerCase()} needs water beside it.` };
      if (tile.terrainType === "mountains") return { ok: false, reason: "Nobody fishes off a mountain." };
    } else if (def.terrains && !def.terrains.includes(tile.terrainType)) {
      return { ok: false, reason: `A ${def.name.toLowerCase()} does not belong on that ground.` };
    }
    for (const neighbor of tile.neighbors) {
      if (neighbor.improvement || neighbor.villageId) {
        return { ok: false, reason: "Work sites need a hex of open ground between them." };
      }
    }
    return { ok: true, reason: null };
  }

  // Places it, and runs a road out to it. Returns false if canPlace refuses.
  place(type, tileId, villageId) {
    const check = this.canPlace(type, tileId, villageId);
    if (!check.ok) return false;
    const def = IMPROVEMENTS[type];
    this.hexMap.beginBatch();
    if (def.kind === "town") {
      this.hexMap.setBuilding(tileId, type);
    } else {
      this.hexMap.setImprovement(tileId, type);
      this.connectSite(tileId, villageId);
    }
    this.hexMap.endBatch();
    return true;
  }

  remove(tileId) {
    const tile = this.hexMap.getTile(tileId);
    if (!tile) return;
    if (tile.improvement) this.hexMap.setImprovement(tileId, null);
    if (tile.building) this.hexMap.setBuilding(tileId, null);
  }

  // Everything a village has built: [{ tileId, type, kind, yields }].
  listFor(villageId) {
    const list = [];
    for (const [tileId, type] of this.hexMap.getImprovements(villageId)) {
      const def = IMPROVEMENTS[type];
      list.push({ tileId, type, kind: "site", yields: def ? def.yields || null : null });
    }
    for (const [tileId, type] of this.hexMap.getBuildings(villageId)) {
      list.push({ tileId, type, kind: "town", yields: null });
    }
    return list;
  }

  // A road from a new site to the nearest tile already on the network
  // (the hall, failing anything else). Quietly gives up past SITE_ROAD_MAX.
  connectSite(tileId, villageId) {
    if (!this.roads) return null;
    const target = this.roads.nearestConnected(tileId, villageId);
    if (!target || target.id === tileId) return null;
    return this.roads.autoConnect(tileId, target.id, { maxLength: SITE_ROAD_MAX, forVillage: villageId });
  }

  // ---- The town ------------------------------------------------------------------

  // Keeps a village's buildings in step with the legacy counters.
  //
  // The hall stands for the first house AND the first barn (game.js starts
  // at stonehouse = 1, barn = 1 with nothing built), so only houses - 1 and
  // barns - 1 get a sprite of their own. Some buildings follow from the
  // counters without a counter of their own: a well once there are two
  // houses, a market at four, a watchtower once there is an army camp or
  // the garlocks have come, a dock when the town stands by water.
  syncTown(villageId, counters, preferredTileId) {
    const home = this.hexMap.homeTileOf(villageId);
    if (!home) return { placed: [], removed: [] };
    const houses = Math.max(1, counters.houses || 1);
    const barns = Math.max(1, counters.barns || 1);
    const wanted = {
      house: houses - 1,
      barn: barns - 1,
      school: counters.schools || 0,
      armyCamp: counters.camps || 0,
      well: houses >= 2 ? 1 : 0,
      market: houses >= 4 ? 1 : 0,
      watchtower: (counters.camps || 0) >= 1 || counters.raided ? 1 : 0,
      dock: houses >= 3 && this.townHasShore(home, villageId) ? 1 : 0,
    };
    return this.syncBuildings(villageId, home, "hall", wanted, preferredTileId);
  }

  townHasShore(home, villageId) {
    for (const { q, r } of hexSpiral(home, 2)) {
      const tile = this.hexMap.getTileAt(q, r);
      if (tile && tile.owner === villageId && !isWaterTerrain(tile.terrainType) && nearWater(tile)) return true;
    }
    return false;
  }

  // The shared reconciler behind syncTown and syncRival. `centreType` is
  // what stands on the home hex (a hall, or a garlock totem).
  syncBuildings(villageId, home, centreType, wanted, preferredTileId) {
    const map = this.hexMap;
    const placed = [];
    const removed = [];
    map.beginBatch();

    // The centrepiece on the home hex, whatever the counters say.
    if (home.building !== centreType) {
      if (home.improvement) map.setImprovement(home.id, null);
      map.setBuilding(home.id, centreType);
      placed.push(home.id);
    }

    // What stands there now, by type, in ring order (nearest the hall
    // first) so extras are pulled down from the edge of town.
    const current = new Map();
    for (const [tileId, type] of map.getBuildings(villageId)) {
      if (tileId === home.id) continue;
      if (!current.has(type)) current.set(type, []);
      current.get(type).push(tileId);
    }
    for (const list of current.values()) {
      list.sort((a, b) => hexDistance(home, map.getTile(a)) - hexDistance(home, map.getTile(b)) || (a < b ? -1 : 1));
    }

    // Too many of something (a raid took a barn): the outermost goes.
    for (const [type, list] of current) {
      const want = wanted[type] === undefined ? 0 : wanted[type];
      while (list.length > want) {
        const tileId = list.pop();
        map.setBuilding(tileId, null);
        removed.push(tileId);
      }
    }

    // Too few: fill the free plots, the player's chosen hex first.
    let candidates = null;
    for (const type of Object.keys(wanted)) {
      const have = current.has(type) ? current.get(type).length : 0;
      let missing = wanted[type] - have;
      if (missing <= 0) continue;
      if (preferredTileId && this.canPlace(type, preferredTileId, villageId).ok) {
        map.setBuilding(preferredTileId, type);
        placed.push(preferredTileId);
        preferredTileId = null;
        missing--;
      }
      if (missing <= 0) continue;
      if (!candidates) candidates = this.townPlots(home, villageId);
      for (let i = 0; i < candidates.length && missing > 0; i++) {
        const tile = candidates[i];
        if (tile.building || tile.improvement) continue;
        if (!this.canPlace(type, tile.id, villageId).ok) continue;
        map.setBuilding(tile.id, type);
        placed.push(tile.id);
        missing--;
      }
    }

    map.endBatch();
    if (this.roads && (placed.length || removed.length)) this.roads.invalidate();
    return { placed, removed };
  }

  // Free hexes around the hall, best first: nearer rings before farther,
  // a plot beside a road before one without (a street grows along its
  // road), and detailSeed as the final tie so the order never depends on
  // Map iteration.
  townPlots(home, villageId) {
    const map = this.hexMap;
    const plots = [];
    for (const { q, r } of hexSpiral(home, TOWN_RADIUS)) {
      const tile = map.getTileAt(q, r);
      if (!tile || tile === home) continue;
      if (tile.owner !== villageId) continue;
      if (isWaterTerrain(tile.terrainType) || tile.terrainType === "mountains") continue;
      if (tile.building || tile.improvement) continue;
      let roadside = tile.road ? 2 : 0;
      if (!roadside) for (const neighbor of tile.neighbors) if (neighbor.road) { roadside = 1; break; }
      plots.push({ tile, ring: hexDistance(home, tile), roadside });
    }
    plots.sort((a, b) => a.ring - b.ring || b.roadside - a.roadside || (a.tile.detailSeed >>> 0) - (b.tile.detailSeed >>> 0) || a.tile.index - b.tile.index);
    return plots.map((plot) => plot.tile);
  }

  // ---- Work sites --------------------------------------------------------------

  // Which site suits a hex. Woods before rock before water before field,
  // because a wooded shore is worked for its timber first. Meadow and
  // plain are grazed until the village learns to farm, then ploughed.
  siteTypeFor(tile, flags) {
    const type = tile.terrainType;
    if (FOREST.includes(type) && hasResource(tile, "wood")) return "lumberCamp";
    if (ROCK.includes(type) && hasResource(tile, "stone")) return "quarry";
    if (HILL.includes(type) && nearRock(tile) && hasResource(tile, "stone")) return "quarry";
    if (nearWater(tile) && !ROCK.includes(type) && type !== "mountains" && type !== "river") return "fishery";
    if (FIELD.includes(type) && (hasResource(tile, "grain") || hasResource(tile, "timbermellow"))) {
      return flags && flags.farming ? "farm" : "pasture";
    }
    if (GRAZING.includes(type) && hasResources(tile)) return "pasture";
    if (HILL.includes(type) && hasResource(tile, "stone")) return "quarry";
    if (type === "marsh" && hasResources(tile)) return "lumberCamp";
    return null;
  }

  // Lays out a village's work sites: about one per SITE_PER_TILES
  // resource-bearing hexes, SITE_SPACING apart, nearest the hall first,
  // each joined to the road network. Removes sites whose hex is no longer
  // the village's, or has nothing left on it. Idempotent.
  //
  // flags: { farming: bool, perTiles?: number }
  syncWorkSites(villageId, flags) {
    const map = this.hexMap;
    const home = map.homeTileOf(villageId);
    const placed = [];
    const removed = [];
    if (!home) return { placed, removed };
    const farming = !!(flags && flags.farming);
    const perTiles = flags && flags.perTiles ? flags.perTiles : SITE_PER_TILES;

    map.beginBatch();

    // Existing sites: keep what still makes sense.
    const existing = [];
    for (const [tileId, type] of Array.from(map.getImprovements(villageId))) {
      const tile = map.getTile(tileId);
      if (!tile || tile.owner !== villageId || !hasResources(tile)) {
        map.setImprovement(tileId, null);
        removed.push(tileId);
        continue;
      }
      // Learning to farm turns the pastures on ploughable ground into farms.
      if (farming && type === "pasture" && FIELD.includes(tile.terrainType) && hasResource(tile, "grain")) {
        map.setImprovement(tileId, "farm");
      }
      existing.push(tile);
    }

    // Candidates, nearest the hall first (ties by index so it is stable).
    const owned = map.getTilesOwnedBy(villageId);
    let resourceTiles = 0;
    const candidates = [];
    for (const tile of owned) {
      if (tile === home || tile.villageId) continue;
      if (isWaterTerrain(tile.terrainType) && tile.terrainType !== "river") continue;
      if (!hasResources(tile)) continue;
      resourceTiles++;
      if (tile.improvement || tile.building) continue;
      candidates.push(tile);
    }
    candidates.sort((a, b) => hexDistance(home, a) - hexDistance(home, b) || a.index - b.index);

    const cap = Math.max(1, Math.round(resourceTiles / perTiles));
    let count = existing.length;
    for (let i = 0; i < candidates.length && count < cap; i++) {
      const tile = candidates[i];
      const type = this.siteTypeFor(tile, { farming });
      if (!type) continue;
      if (!this.clearOfSites(tile)) continue;
      map.setImprovement(tile.id, type);
      placed.push(tile.id);
      count++;
    }

    map.endBatch();

    // Roads after the batch so each search sees the roads laid before it.
    for (const tileId of placed) this.connectSite(tileId, villageId);
    if (this.roads && (placed.length || removed.length)) this.roads.invalidate();
    return { placed, removed };
  }

  // SITE_SPACING hexes from every other site and from any hall.
  clearOfSites(tile) {
    if (tile.improvement || tile.villageId || tile.building) return false;
    for (const { q, r } of hexSpiral(tile, SITE_SPACING - 1)) {
      const near = this.hexMap.getTileAt(q, r);
      if (near && near !== tile && (near.improvement || near.villageId)) return false;
    }
    return true;
  }

  // ---- The neighbours ------------------------------------------------------------

  // A rival town grows with the land it holds; a garlock camp pitches more
  // tents. Cheap to call every turn: nothing happens until a threshold moves.
  syncRival(village, tilesHeld) {
    if (!village || village.kind === "player") return;
    const held = tilesHeld || 0;
    let wanted;
    let centre;
    if (village.kind === "garlock") {
      centre = "garlock_totem";
      wanted = { garlock_tent: Math.min(9, 3 + Math.floor(held / 8)) };
    } else {
      centre = "hall";
      const houses = Math.min(12, 2 + Math.floor(held / 6));
      wanted = {
        house: houses,
        barn: Math.floor(houses / 4),
        well: 1,
        market: houses >= 6 ? 1 : 0,
      };
    }
    const key = JSON.stringify(wanted) + "|" + Math.floor(held / 12);
    if (this.rivalKeys.get(village.id) === key) return;
    this.rivalKeys.set(village.id, key);

    const home = this.hexMap.homeTileOf(village.id);
    if (!home) return;
    this.syncBuildings(village.id, home, centre, wanted, null);
    // Rivals work their land too, more thinly than the player, and they
    // have always known how to farm.
    this.syncWorkSites(village.id, { farming: village.kind !== "garlock", perTiles: 12 });
  }
}
