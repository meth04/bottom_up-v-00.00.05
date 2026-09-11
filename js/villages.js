// villages.js
//
// The other villages on the map — the "others" the player seizes territory
// from (ask.txt, question 12). Each takes a simple turn after the player:
// with some chance it settles one more tile next to its own land. The
// garlock camp is just a hungrier village with a darker banner; the raids
// themselves still live in game.js.
//
// Written in the same plain-globals style as game.js.

// ---------------------------------------------------------------------------
// TUNING
// ---------------------------------------------------------------------------

// Chance per turn that a village settles one more tile.
const VILLAGE_EXPAND_CHANCE = { rival: 0.35, garlock: 0.5 };

// A village's strength grows with its land; seizing one of its tiles needs
// soldiers in proportion (see territory.js, SEIZE_*).
function villageStrength(village, map) {
  const tiles = map.getTilesOwnedBy(village.id).length;
  const base = village.kind === "garlock" ? 4 : 2;
  return base + tiles * 2;
}

// ---------------------------------------------------------------------------

let villageList = [];

function villagesSet(list) {
  villageList = list.map((village) => Object.assign({}, village));
}

function villagesGet() {
  return villageList;
}

function villageById(id) {
  return villageList.find((village) => village.id === id) || null;
}

function villageColor(id) {
  const village = villageById(id);
  return village ? village.color : null;
}

function villageName(id) {
  const village = villageById(id);
  return village ? village.name : "someone";
}

// Rough compass direction from one tile to another, for the log.
function directionBetween(fromTile, toTile, grid) {
  const from = worldTileCenter(fromTile.q, fromTile.r, grid);
  const to = worldTileCenter(toTile.q, toTile.r, grid);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const names = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"];
  return names[Math.round(((angle + 360) % 360) / 45) % 8];
}

// Every village but the player's gets a go. `log(text, kind)` is game.js's
// updatelog; `seed` keeps the dice deterministic per turn (useful for tests).
function villagesTakeTurn(map, grid, turn, seed, log) {
  const random = createRandom((seed + turn * 7919) >>> 0);
  const playerHome = map.getAllTiles().find((tile) => tile.isStartingTile);

  for (const village of villageList) {
    if (village.kind === "player") continue;
    const chance = VILLAGE_EXPAND_CHANCE[village.kind] || 0;
    if (random() >= chance) continue;

    const frontier = map.getFrontierTiles(village.id).filter((tile) => tile.terrainType !== "mountains");
    if (!frontier.length) continue;
    const target = frontier[Math.floor(random() * frontier.length)];
    map.claimTile(target.id, village.id);

    // Only worth a log line if the player can actually see it happen.
    if (map.isRevealed(target.id) && playerHome) {
      const where = directionBetween(playerHome, target, grid);
      log(`${village.name} has settled new land to the ${where}.`, village.kind === "garlock" ? "bad" : null);
    }
  }
}
