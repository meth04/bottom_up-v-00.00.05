// territory.js
//
// The bridge between the map (js/world/hexMap.js) and the village logic in game.js.
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
// T1 portal tuning (casual 20-30 min): food 10 -> 6, hours 4 -> 3, so the
// first district lands around turn 5 instead of turn 12.
const EXPLORE_MIN_HUMANS = 3;
const EXPLORE_MIN_SOLDIERS = 1;
const EXPLORE_FOOD_COST = 6;
const EXPLORE_WORK_HOURS = 3;

// The grid is fine — a hex is a field, not a county — so an expedition does
// not trudge out to claim one field. It settles the ground around where it
// stops: the tile you picked and every wild tile within CLAIM_RADIUS of it.
// One expedition therefore wins about as much land as it always did, and
// the player does not have to press the button nine times as often.
// Land nobody can settle, however close it is.
const UNSETTLEABLE = ["ocean", "lake"];

const CLAIM_RADIUS = 2;
const SEIZE_RADIUS = 2;

// How much ground a settlement stands on from the day it is founded. A
// village is a hall, the cottages round it, the fields that feed them and
// the commons beyond — about thirty-seven hexes on this grid, not one.
const VILLAGE_RADIUS = 3;

// Gives a village its home ground. Used when a new world is set out.
function territoryFoundVillage(map, homeTileId, villageId) {
  const home = map.getTile(homeTileId);
  if (!home) return 0;
  // The hall first, so it is the oldest claim and therefore the first
  // patch of land the village works dry.
  map.claimTile(home.id, villageId);
  let claimed = 1;
  for (const { q, r } of hexSpiral(home, VILLAGE_RADIUS)) {
    const tile = map.tilesByCoord.get(hexKey(q, r));
    if (!tile || tile.owner) continue;
    if (UNSETTLEABLE.includes(tile.terrainType)) continue;
    map.claimTile(tile.id, villageId);
    claimed++;
  }
  return claimed;
}

// Every tile within `radius` of the middle one, nearest first.
function territoryDistrict(middleId, radius) {
  if (!territoryMap) return [];
  const middle = territoryMap.getTile(middleId);
  if (!middle) return [];
  return hexSpiral(middle, radius)
    .map(({ q, r }) => territoryMap.tilesByCoord.get(hexKey(q, r)))
    .filter(Boolean);
}

// Taking a tile off another village: soldiers in proportion to how strong
// that village is (see villages.js, villageStrength), one of them lost.
const SEIZE_MIN_SOLDIERS = 2;
const SEIZE_SOLDIERS_LOST = 1;
const SEIZE_FOOD_COST = 8;
const SEIZE_WORK_HOURS = 4;

// How much of a tile's carrying capacity comes back each autumn
// (ask.txt, "Resource pool merge behaviour": "different per resource").
// These are FRACTIONS, so they hold whatever size a tile is — see
// HexMap.regrow.
const REGROWTH_PER_AUTUMN = {
  timbermellow: 0.28,
  wood: 0.20,
  grain: 0.32,
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

// "How much food is left on my land" is asked seven or eight times every
// time the screen refreshes, and the screen refreshes on every click. The
// answer only changes when the land does, so it is remembered until then.
let territoryTotalsVersion = -1;
let territoryTotals = new Map();

function territoryAvailable(types) {
  if (!territoryMap) return 0;
  if (territoryMap.resourceVersion !== territoryTotalsVersion) {
    territoryTotalsVersion = territoryMap.resourceVersion;
    territoryTotals = new Map();
  }
  const key = types.join("+");
  let total = territoryTotals.get(key);
  if (total === undefined) {
    total = territoryMap.getAvailable(types);
    territoryTotals.set(key, total);
  }
  return total;
}

function territoryTake(types, wanted) {
  if (!territoryMap) return 0;
  const taken = territoryMap.take(types, wanted);
  territoryChangedCallback({ kind: "take", types, amount: taken });
  return taken;
}

// The same, without the floating "+3" and the ledger bump: the carts that
// trickle goods home between turns (js/main.js) announce themselves.
function territoryTakeQuiet(types, wanted) {
  if (!territoryMap) return 0;
  return territoryMap.take(types, wanted);
}

function territoryRegrowAutumn() {
  if (!territoryMap) return 0;
  let rates = REGROWTH_PER_AUTUMN;
  // Once the famine has started the grove never comes all the way back:
  // half as much returns, and the land's carrying capacity shrinks with it.
  // This is what teaches the player that the resource pool is finite.
  if (typeof ageFamineActive !== "undefined" && ageFamineActive) {
    rates = {};
    for (const type of Object.keys(REGROWTH_PER_AUTUMN)) rates[type] = REGROWTH_PER_AUTUMN[type] * 0.5;
    territoryMap.decayCapacity(["timbermellow"], AGE_FAMINE_MAX_DECAY);
  }
  const grown = territoryMap.regrow(rates);
  territoryChangedCallback({ kind: "regrow", amount: grown });
  return grown;
}

// A little of everything comes back EVERY turn of the growing season, not
// only at the harvest: waiting a whole year for the grove to refill made
// the early game feel like standing still. Winter still grows nothing, and
// the famine still halves what returns.
const REGROWTH_PER_TURN_FRACTION = 0.35;   // of the autumn rate, in spring and summer

function territoryRegrowTurn() {
  if (!territoryMap) return 0;
  if (typeof seasonchecker !== "undefined" && (seasonchecker === 3 || seasonchecker === 4)) return 0;
  const famine = typeof ageFamineActive !== "undefined" && ageFamineActive;
  const rates = {};
  for (const type of Object.keys(REGROWTH_PER_AUTUMN)) {
    rates[type] = REGROWTH_PER_AUTUMN[type] * REGROWTH_PER_TURN_FRACTION * (famine ? 0.5 : 1);
  }
  const grown = territoryMap.regrow(rates);
  if (grown > 0) territoryChangedCallback({ kind: "regrow", amount: grown });
  return grown;
}

// Kills off a share of the food still standing on the village's land, and
// takes the same share off what the land can ever hold again. Returns how
// much was lost. Used by the famine that ends the First Age (js/ages.js).
function territoryWither(fraction) {
  if (!territoryMap) return 0;
  const lost = territoryMap.wither(territoryFoodTypes(), fraction);
  territoryChangedCallback({ kind: "wither", amount: lost });
  return lost;
}

// The mapmaking technology: every tile becomes visible.
function territoryRevealMap() {
  if (!territoryMap) return;
  territoryMap.unlockMapmaking();
  territoryChangedCallback({ kind: "reveal" });
}

function territoryClaimedCount() {
  return territoryMap ? territoryMap.countClaimed() : 0;
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
  if (tile.terrainType === "ocean") return "That is open sea. Your people have no boats yet.";
  if (tile.terrainType === "lake") return "That is deep water — nobody can settle a lake.";
  if (!territoryMap.isFrontier(tileId)) return "You can only explore land next to your own.";
  if (humans < EXPLORE_MIN_HUMANS) return `You need at least ${EXPLORE_MIN_HUMANS} humans to send an expedition.`;
  // T1: the very first step out needs no escort, so casuals see a new
  // district early. Once the valley (~37 hexes) has grown past 40 tiles,
  // expeditions need their soldier again.
  const claimedNow = typeof territoryClaimedCount === "function" ? territoryClaimedCount() : 99;
  if (human_army < EXPLORE_MIN_SOLDIERS && claimedNow > 40) return `An expedition needs ${EXPLORE_MIN_SOLDIERS} soldier${EXPLORE_MIN_SOLDIERS > 1 ? "s" : ""} as escort.`;
  if (timbermellow_count < territoryExploreFood()) return `An expedition needs ${territoryExploreFood()} timbermellows as provisions.`;
  if (working_hours < territoryExploreHours()) return `Exploring takes ${territoryExploreHours()} work hours.`;
  return null;
}

// What an expedition costs today. Scouts trained at the army camp make the
// march cheaper (see js/professions.js).
function territoryExploreFood() {
  return typeof professionExploreFoodCost === "function" ? professionExploreFoodCost() : EXPLORE_FOOD_COST;
}

function territoryExploreHours() {
  return typeof professionExploreHourCost === "function" ? professionExploreHourCost() : EXPLORE_WORK_HOURS;
}

// Claims the district around the tile and pays the expedition's cost.
// Returns the tile the player picked, or null if it would have been refused.
function territoryExplore(tileId) {
  if (territoryExploreBlocker(tileId)) return null;
  const tile = territoryMap.claimTile(tileId, "player");
  // Everything wild and walkable around it comes with the settlement.
  for (const neighbour of territoryDistrict(tileId, CLAIM_RADIUS)) {
    if (neighbour.owner) continue;
    if (UNSETTLEABLE.includes(neighbour.terrainType)) continue;
    territoryMap.claimTile(neighbour.id, "player");
  }
  timbermellow_count -= territoryExploreFood();
  working_hours -= territoryExploreHours();
  territoryChangedCallback({ kind: "claim", tile });
  return tile;
}

// How many tiles an expedition would actually win, for the button's hint.
function territoryExploreYield(tileId) {
  return territoryDistrict(tileId, CLAIM_RADIUS)
    .filter((tile) => !tile.owner && !UNSETTLEABLE.includes(tile.terrainType)).length;
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
  // T-fix: no blind snips — the tile must have been seen. Raids need the
  // hall revealed; seizing the fields around it needs the fields seen.
  if (typeof territoryMap.isRevealed === "function" && !territoryMap.isRevealed(tileId)) return "Scout it first — you cannot seize land you have not seen.";
  const needed = territorySeizeSoldiersNeeded(tileId);
  if (human_army < needed) return `Seizing this from ${villageName(tile.owner)} needs ${needed} soldiers.`;
  if (timbermellow_count < SEIZE_FOOD_COST) return `The soldiers need ${SEIZE_FOOD_COST} timbermellows for the march.`;
  if (working_hours < SEIZE_WORK_HOURS) return `Seizing takes ${SEIZE_WORK_HOURS} work hours.`;
  return null;
}

// Takes the district, pays the cost, loses a soldier (unless overwhelming).
// Returns the tile or null.
function territorySeize(tileId) {
  if (territorySeizeBlocker(tileId)) return null;
  const tile = territoryMap.getTile(tileId);
  const previousOwner = tile.owner;
  // T-fix: overwhelming force takes ground clean instead of always burying one.
  const needed = territorySeizeSoldiersNeeded(tileId);
  const lost = human_army >= needed + 3 ? 0 : SEIZE_SOLDIERS_LOST;
  territoryMap.claimTile(tileId, "player");
  // Soldiers take the ground around what they took, but never a village
  // itself — "you can take the land around a village, never the village".
  for (const neighbour of territoryDistrict(tileId, SEIZE_RADIUS)) {
    if (neighbour.owner !== previousOwner) continue;
    if (neighbour.villageId === previousOwner) continue;
    if (UNSETTLEABLE.includes(neighbour.terrainType)) continue;
    territoryMap.claimTile(neighbour.id, "player");
  }
  human_army -= lost;
  timbermellow_count -= SEIZE_FOOD_COST;
  working_hours -= SEIZE_WORK_HOURS;
  territoryChangedCallback({ kind: "seize", tile, from: previousOwner });
  return tile;
}

// ---- Roads and trade ----------------------------------------------------------
//
// The road network (js/world/roads.js) is built by main.js and put on
// window as `roadNetwork`. Everything below works without it — before the
// map has loaded, or in a test — and simply gives the plain answer.

// A village whose fields are joined to its hall by road brings more home
// in the same hours: up to +30% with every resource tile connected.
const ROAD_GATHER_BONUS = 0.3;

// Every fifteen hexes of connected road are worth a point of defence
// (patrols move faster, word travels), up to three.
const ROAD_DEFENCE_PER_TILES = 15;
const ROAD_DEFENCE_CAP = 3;

// What a trading partner sends each turn.
const TRADE_FOOD_PER_PARTNER = 2;
const TRADE_WOOD_PER_PARTNER = 1;
const TRADE_MAX_PARTNERS = 4;

function territoryRoadNetwork() {
  return typeof roadNetwork !== "undefined" && roadNetwork ? roadNetwork : null;
}

function territoryRoadMultiplier() {
  const network = territoryRoadNetwork();
  if (!network) return 1;
  return 1 + ROAD_GATHER_BONUS * network.efficiencyFor("player");
}

// How many hexes the hall can reach by road (the hall itself counts).
function territoryConnectedCount() {
  const network = territoryRoadNetwork();
  return network ? network.connectedToTown("player").size : 0;
}

function territoryRoadDefence() {
  return Math.min(ROAD_DEFENCE_CAP, Math.floor(territoryConnectedCount() / ROAD_DEFENCE_PER_TILES));
}

// Whether a village trades with us over the sea: a sea lane joins the two
// and the player has built a dock. Sea lanes come from the generated
// world, which main.js puts on window as `world`; without it there is no
// sea trade, only the roads.
function territorySeaPartner(village) {
  if (typeof world === "undefined" || !world || !Array.isArray(world.seaLanes)) return false;
  if (!territoryMap) return false;
  let dock = false;
  for (const type of territoryMap.getBuildings("player").values()) if (type === "dock") dock = true;
  if (!dock) return false;
  return world.seaLanes.some((lane) =>
    (lane.from === "player" && lane.to === village.id) || (lane.to === "player" && lane.from === village.id));
}

// Once a turn, from main.js's afterTurnEnded(): every rival village whose
// hall the road network reaches (or a sea lane with a dock) sends a little
// food and wood. Returns the partners' ids so the map can show the carts.
function territoryTradeTurn() {
  if (!territoryMap || typeof villagesGet !== "function") return [];
  const network = territoryRoadNetwork();
  const connected = network ? network.connectedToTown("player") : new Set();
  const partners = [];
  for (const village of villagesGet()) {
    if (village.kind !== "rival") continue;
    if (!territoryMap.isRevealed(village.homeTileId)) continue;
    // A village you have raided sends no traders (js/raids.js), and a
    // vassal pays tribute instead of trading.
    if (typeof raidGrudge !== "undefined" && raidGrudge[village.id] > 0) continue;
    if (typeof raidVassals !== "undefined" && raidVassals[village.id]) continue;
    if (connected.has(village.homeTileId) || territorySeaPartner(village)) partners.push(village.id);
    // A road network that reaches the whole continent is not a trade
    // empire on turn one: only the nearest few markets send caravans.
    if (partners.length >= TRADE_MAX_PARTNERS) break;
  }
  if (!partners.length) return partners;

  // Food only fits if there is room in the barns; wood keeps anywhere.
  const foodOffered = TRADE_FOOD_PER_PARTNER * partners.length;
  const room = Math.max(0, storage_capacity - timbermellow_count);
  const foodTaken = Math.min(room, foodOffered);
  const woodTaken = TRADE_WOOD_PER_PARTNER * partners.length;
  timbermellow_count += foodTaken;
  wood += woodTaken;

  const names = partners.map((id) => villageName(id)).join(", ");
  if (typeof updatelog === "function") {
    updatelog(`Traders from ${names} came up the road with ${foodTaken} food${foodTaken === 1 ? "" : "s"} and ${woodTaken} wood.`, "good");
  }
  if (typeof turnReportNote === "function") turnReportNote(`trade brought ${foodTaken} food and ${woodTaken} wood`, "good");
  return partners;
}

// One-line description of what a tile holds, for the log and tile panel.
function territoryDescribeResources(tile) {
  const parts = Object.keys(tile.resources).map((type) => {
    const entry = tile.resources[type];
    return `${entry.amount} ${type}${entry.renewable ? " (regrows)" : ""}`;
  });
  return parts.length ? parts.join(", ") : "nothing to gather";
}
