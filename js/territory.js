// territory.js
//
// The bridge between the map (js/map/) and the village logic in game.js.
// Everything the village gathers comes off the tiles it holds; exploring a
// wild tile next door claims it; seizing takes a tile off another village.
// Sếp's core loop:
//
//   "they start on one timbermellow tile and then when they start to use
//    it up will need to spread out to find more food till they learn to
//    farm."                                        (ask.txt, question 14)
//
// Written in the same plain-globals style as game.js so it reads the same
// way. Every number Sếp hasn't decided yet is in the TUNING block.

// ---------------------------------------------------------------------------
// TUNING — change these freely
// ---------------------------------------------------------------------------

// What an expedition into wild land needs. Sếp's unfinished explore() stub
// checked humans > 3, soldiers > 2 and timbermellows > 10 — seven people
// before your first step outside, which is a long wait — so the soldier
// requirement is lower here.
const EXPLORE_MIN_HUMANS = 3;
const EXPLORE_MIN_SOLDIERS = 1;
const EXPLORE_FOOD_COST = 10;
const EXPLORE_WORK_HOURS = 4;

// Taking a tile off another village: soldiers in proportion to how strong
// that village is (see villages.js, villageStrength), one of them lost.
const SEIZE_MIN_SOLDIERS = 2;
const SEIZE_SOLDIERS_LOST = 1;
const SEIZE_FOOD_COST = 8;
const SEIZE_WORK_HOURS = 4;

// How much renewable resources grow back on the player's tiles each autumn
// (ask.txt, "Resource pool merge behaviour": "different per resource").
const REGROWTH_PER_AUTUMN = {
  timbermellow: 60,
  wood: 40,
  grain: 80,
};

// ---------------------------------------------------------------------------

let territoryMap = null;
let territoryGrid = null;

// main.js hands over the loaded HexMap and a callback that gets told what
// happened ({ kind: "take" | "regrow" | "claim" | "seize" | "reveal", ... }).
let territoryChangedCallback = function () {};

function territorySetMap(map, grid, changedCallback) {
  territoryMap = map;
  territoryGrid = grid;
  if (changedCallback) territoryChangedCallback = changedCallback;
}

// Food comes from timbermellow tiles; once the village learns farming, its
// grain tiles count too ("till they learn to farm").
function territoryFoodTypes() {
  return typeof farming_made !== "undefined" && farming_made > 0
    ? ["timbermellow", "grain"]
    : ["timbermellow"];
}

function territoryAvailable(types) {
  if (!territoryMap) return 0;
  return territoryMap.getAvailable(types);
}

function territoryTake(types, wanted) {
  if (!territoryMap) return 0;
  const taken = territoryMap.take(types, wanted);
  territoryChangedCallback({ kind: "take", types, amount: taken });
  return taken;
}

function territoryRegrowAutumn() {
  if (!territoryMap) return 0;
  const grown = territoryMap.regrow(REGROWTH_PER_AUTUMN);
  territoryChangedCallback({ kind: "regrow", amount: grown });
  return grown;
}

// The mapmaking technology: every tile becomes visible.
function territoryRevealMap() {
  if (!territoryMap) return;
  territoryMap.unlockMapmaking();
  territoryChangedCallback({ kind: "reveal" });
}

function territoryClaimedCount() {
  return territoryMap ? territoryMap.getClaimedTiles().length : 0;
}

function territorySelectedTileId() {
  return territoryMap ? territoryMap.selectedTileId : null;
}

function territoryOwnerName(tileId) {
  const tile = territoryMap ? territoryMap.getTile(tileId) : null;
  return tile && tile.owner ? villageName(tile.owner) : "nobody";
}

// ---- Exploring wild land -----------------------------------------------------

// Why the tile can't be explored right now, or null if it can. Each reason
// is written for the player, and doubles as the button's hint.
function territoryExploreBlocker(tileId) {
  if (!territoryMap) return "The map hasn't loaded yet.";
  const tile = territoryMap.getTile(tileId);
  if (!tile) return "Pick a tile on the map first.";
  if (territoryMap.isClaimed(tileId)) return "That land is already yours.";
  if (tile.owner) return `That land belongs to ${villageName(tile.owner)} — it would have to be seized.`;
  if (!territoryMap.isFrontier(tileId)) return "You can only explore land next to your own.";
  if (humans < EXPLORE_MIN_HUMANS) return `You need at least ${EXPLORE_MIN_HUMANS} humans to send an expedition.`;
  if (human_army < EXPLORE_MIN_SOLDIERS) return `An expedition needs ${EXPLORE_MIN_SOLDIERS} soldier${EXPLORE_MIN_SOLDIERS > 1 ? "s" : ""} as escort.`;
  if (timbermellow_count < EXPLORE_FOOD_COST) return `An expedition needs ${EXPLORE_FOOD_COST} timbermellows as provisions.`;
  if (working_hours < EXPLORE_WORK_HOURS) return `Exploring takes ${EXPLORE_WORK_HOURS} work hours.`;
  return null;
}

// Claims the tile and pays the expedition's cost. Returns the tile, or null
// if territoryExploreBlocker() would have refused.
function territoryExplore(tileId) {
  if (territoryExploreBlocker(tileId)) return null;
  const tile = territoryMap.claimTile(tileId, "player");
  timbermellow_count -= EXPLORE_FOOD_COST;
  working_hours -= EXPLORE_WORK_HOURS;
  territoryChangedCallback({ kind: "claim", tile });
  return tile;
}

// ---- Seizing another village's land ---------------------------------------------

function territorySeizeSoldiersNeeded(tileId) {
  const tile = territoryMap.getTile(tileId);
  const village = tile && tile.owner ? villageById(tile.owner) : null;
  if (!village) return SEIZE_MIN_SOLDIERS;
  return Math.max(SEIZE_MIN_SOLDIERS, Math.ceil(villageStrength(village, territoryMap) / 4));
}

function territorySeizeBlocker(tileId) {
  if (!territoryMap) return "The map hasn't loaded yet.";
  const tile = territoryMap.getTile(tileId);
  if (!tile) return "Pick a tile on the map first.";
  if (!tile.owner || tile.owner === "player") return "Only another village's land can be seized.";
  if (tile.villageId === tile.owner) return `${villageName(tile.owner)} itself cannot be taken — only the land around it.`;
  if (!territoryMap.isSeizable(tileId)) return "You can only seize land next to your own.";
  const needed = territorySeizeSoldiersNeeded(tileId);
  if (human_army < needed) return `Seizing this from ${villageName(tile.owner)} needs ${needed} soldiers.`;
  if (timbermellow_count < SEIZE_FOOD_COST) return `The soldiers need ${SEIZE_FOOD_COST} timbermellows for the march.`;
  if (working_hours < SEIZE_WORK_HOURS) return `Seizing takes ${SEIZE_WORK_HOURS} work hours.`;
  return null;
}

// Takes the tile, pays the cost, loses a soldier. Returns the tile or null.
function territorySeize(tileId) {
  if (territorySeizeBlocker(tileId)) return null;
  const tile = territoryMap.getTile(tileId);
  const previousOwner = tile.owner;
  territoryMap.claimTile(tileId, "player");
  human_army -= SEIZE_SOLDIERS_LOST;
  timbermellow_count -= SEIZE_FOOD_COST;
  working_hours -= SEIZE_WORK_HOURS;
  territoryChangedCallback({ kind: "seize", tile, from: previousOwner });
  return tile;
}

// One-line description of what a tile holds, for the log and tile panel.
function territoryDescribeResources(tile) {
  const parts = Object.keys(tile.resources).map((type) => {
    const entry = tile.resources[type];
    return `${entry.amount} ${type}${entry.renewable ? " (regrows)" : ""}`;
  });
  return parts.length ? parts.join(", ") : "nothing to gather";
}
