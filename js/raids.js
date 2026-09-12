// raids.js
//
// Raiding and defence. Sếp asked for it plainly:
//
//   "let me control my village to go and raid other villages, and they
//    raid me back; villages will have defence mechanics"
//
// So the player's soldiers can now march on a neighbour's hall and come
// home with its stores; the neighbours remember it and come back for
// theirs; and both sides can build against it. Everything stays turn-based:
// a raid launched this turn arrives next turn, and the neighbours' raids
// are announced a turn ahead so there is time to raise the shield line.
//
// The garlock raids in game.js are untouched — they are the story's
// rhythm (Act III). This file is about the OTHER villages, the rivals the
// player trades with and seizes land from, and about the player choosing
// to be the raider for once. Beat a village badly enough, or twice, and it
// bends the knee: a vassal pays tribute every turn and never raids you.
// Bring every village on your continent to heel and you have won it.
//
// Written in the same plain-globals style as game.js and territory.js.
// Every cross-file reference is guarded with `typeof`, so the file loads
// (and its tests run) without the rest of the game around it.

// ---------------------------------------------------------------------------
// TUNING — change these freely
// ---------------------------------------------------------------------------

// What a raid costs to send. Provisions for the march, and the hours it
// takes the village to kit the soldiers out and see them off.
const RAID_MIN_SOLDIERS = 2;
const RAID_FOOD_COST = 6;
const RAID_WORK_HOURS = 4;

// A raid launched this turn arrives this many turns later.
const RAID_TRAVEL_TURNS = 1;

// What a successful raid brings home: a share of the defender's land, in
// each of food, wood and stone, between a floor and a ceiling. A village
// of forty hexes is worth ten of each.
const RAID_LOOT_PER_TILE = 0.25;
const RAID_LOOT_MIN = 3;
const RAID_LOOT_MAX = 30;

// The palisade: a ring of stakes round the village. Each ring adds to the
// defence; three rings is as much as anyone bothers to build.
const PALISADE_WOOD_COST = 12;
const PALISADE_WORK_HOURS = 2;
const PALISADE_DEFENCE = 3;
const PALISADE_MAX = 3;

// The watchtower: a smaller bonus, but the first one sees raiders coming
// a turn earlier than the scouts alone would.
const WATCHTOWER_WOOD_COST = 6;
const WATCHTOWER_STONE_COST = 4;
const WATCHTOWER_WORK_HOURS = 1;
const WATCHTOWER_DEFENCE = 2;
const WATCHTOWER_MAX = 3;

// A village that has been raided holds a grudge; the grudge fades by one
// every this many turns if it is left alone.
const GRUDGE_DECAY_TURNS = 12;

// Beat a village this many times (or once, overwhelmingly) and it is yours.
const VASSAL_RAIDS_NEEDED = 2;

// What a vassal sends every turn.
const TRIBUTE_FOOD = 3;
const TRIBUTE_WOOD = 2;

// An angry rival raids on a rhythm of this many turns (offset per village,
// so they do not all arrive at once).
const RIVAL_RAID_INTERVAL = 7;

// A neighbour that is not angry but sees full barns behind a thin guard
// tries its luck now and then.
const RIVAL_GREED_FOOD = 25;
const RIVAL_GREED_CHANCE = 0.12;

// The most a rival raid can take, however badly it went (the garlocks'
// GARLOCK_MAX_BITE, for the same reason: a setback, not an ending).
const RAID_MAX_BITE = 6;

// How many outcomes the ledger keeps.
const RAID_LOG_MAX = 20;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let palisade = 0;
let watchtower = 0;

// Raids the player has sent: { villageId, soldiers, launchedTurn, arriveTurn }.
let raidsOutgoing = [];

// Raids coming for the player: { villageId, strength, turn, seenTurn }.
let raidsIncoming = [];

// villageId -> how much they resent the player. Drives their raids.
let raidGrudge = {};

// villageId -> how many raids the player has won against them.
let raidWins = {};

// villageId -> the turn they bent the knee.
let raidVassals = {};

// The last RAID_LOG_MAX outcomes, newest last:
// { turn, villageId, name, incoming, won, loot: { food, wood, stone }, lost, text }.
let raidLog = [];

// ---------------------------------------------------------------------------
// Helpers that reach across the seam (all optional — see the file comment)
// ---------------------------------------------------------------------------

// The map: territory.js's copy first, then whatever main.js put on window.
function raidMap() {
  if (typeof territoryMap !== "undefined" && territoryMap) return territoryMap;
  if (typeof hexMap !== "undefined" && hexMap) return hexMap;
  return null;
}

function raidVillages() {
  return typeof villagesGet === "function" ? villagesGet() : [];
}

function raidVillage(villageId) {
  return typeof villageById === "function" ? villageById(villageId) : null;
}

function raidName(villageId) {
  return typeof villageName === "function" ? villageName(villageId) : String(villageId);
}

function raidSay(text, kind) {
  if (typeof updatelog === "function") updatelog(text, kind);
}

function raidNote(text, kind) {
  if (typeof turnReportNote === "function") turnReportNote(text, kind);
}

function raidRefresh() {
  if (typeof update === "function") update();
}

// A village's hall tile. Ownership can shift under a hall, so the village
// record's homeTileId is the fallback.
function raidHomeTile(villageId) {
  const map = raidMap();
  if (!map) return null;
  let tile = typeof map.homeTileOf === "function" ? map.homeTileOf(villageId) : null;
  if (!tile) {
    const village = raidVillage(villageId);
    if (village && village.homeTileId) tile = map.getTile(village.homeTileId);
  }
  return tile || null;
}

// Which continent a village stands on: from its hall's tile, or from the
// generated village record if the tile is not to hand. -1 means unknown.
function raidContinentOf(villageId) {
  const tile = raidHomeTile(villageId);
  if (tile && typeof tile.continentId === "number") return tile.continentId;
  const village = raidVillage(villageId);
  return village && typeof village.continentId === "number" ? village.continentId : -1;
}

// "Your soldiers have no boats": a raid only goes where they can walk.
function raidSameContinent(villageId) {
  const mine = raidContinentOf("player");
  const theirs = raidContinentOf(villageId);
  return mine >= 0 && mine === theirs;
}

function raidHeldTiles(villageId) {
  const map = raidMap();
  return map && typeof map.countOwnedBy === "function" ? map.countOwnedBy(villageId) : 0;
}

function raidIsVassal(villageId) {
  return !!raidVassals[villageId];
}

// The dice for a turn: seeded, so a reload replays the same outcome, and
// salted by the raid's index so two raids on one turn roll differently.
function raidRandom(index) {
  const seed = typeof worldSeed !== "undefined" ? (worldSeed >>> 0) : 12345;
  const turn = typeof turngame !== "undefined" ? turngame : 0;
  if (typeof createRandom === "function") return createRandom((seed + turn * 31 + (index || 0)) >>> 0);
  return Math.random;
}

// A stable small number per village, so each rival raids on its own beat.
function raidVillageHash(villageId) {
  let hash = 0;
  const text = String(villageId);
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash;
}

function raidClamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function raidPlural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function raidRemember(entry) {
  raidLog.push(entry);
  while (raidLog.length > RAID_LOG_MAX) raidLog.shift();
}

// ---------------------------------------------------------------------------
// The buildings
// ---------------------------------------------------------------------------

function make_palisade() {
  if (palisade >= PALISADE_MAX) { raidSay(`Three rings of stakes already circle the village — there is no room for a fourth.`); raidRefresh(); return; }
  if (working_hours < PALISADE_WORK_HOURS) { raidSay(`A palisade takes ${PALISADE_WORK_HOURS} work hours.`); raidRefresh(); return; }
  if (wood < PALISADE_WOOD_COST) { raidSay(`A palisade needs ${PALISADE_WOOD_COST} wood.`); raidRefresh(); return; }

  wood -= PALISADE_WOOD_COST;
  working_hours -= PALISADE_WORK_HOURS;
  palisade += 1;
  raidSay(`A ring of sharpened stakes goes up round the village. Defence +${PALISADE_DEFENCE} (${palisade} of ${PALISADE_MAX} rings).`, "good");
  if (palisade === 1 && typeof showMilestonePopup === "function") {
    showMilestonePopup("The Palisade", "Every trunk sharpened, every gap closed. Raiders who reach the village now have to get over something first.", "shield");
  }
  raidRefresh();
}

function make_watchtower() {
  if (watchtower >= WATCHTOWER_MAX) { raidSay(`Three towers already watch the roads — a fourth would see nothing new.`); raidRefresh(); return; }
  if (working_hours < WATCHTOWER_WORK_HOURS) { raidSay(`A watchtower takes ${WATCHTOWER_WORK_HOURS} work hour.`); raidRefresh(); return; }
  if (wood < WATCHTOWER_WOOD_COST) { raidSay(`A watchtower needs ${WATCHTOWER_WOOD_COST} wood.`); raidRefresh(); return; }
  if (stone < WATCHTOWER_STONE_COST) { raidSay(`A watchtower needs ${WATCHTOWER_STONE_COST} stone.`); raidRefresh(); return; }

  wood -= WATCHTOWER_WOOD_COST;
  stone -= WATCHTOWER_STONE_COST;
  working_hours -= WATCHTOWER_WORK_HOURS;
  watchtower += 1;
  raidSay(`A watchtower rises at the edge of town. Defence +${WATCHTOWER_DEFENCE}, and raiders are seen a turn sooner.`, "good");
  if (watchtower === 1 && typeof showMilestonePopup === "function") {
    showMilestonePopup("The Watchtower", "A platform above the rooftops and someone always on it. Nobody comes up the road unseen now.", "soldier");
  }
  raidRefresh();
}

// What the map draws (js/world/improvements.js, syncTown).
function raidDefenceCounters() {
  return { palisades: palisade, watchtowers: watchtower };
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

// What a raiding party is worth: three a soldier, two a captain (up to
// three captains), one more if a scout knows the way.
function raidAttackStrength(soldiers) {
  const counts = typeof professionCounts !== "undefined" && professionCounts ? professionCounts : {};
  const captains = Math.min(3, counts.captain || 0);
  const scout = (counts.scout || 0) > 0 ? 1 : 0;
  return Math.max(0, soldiers) * 3 + captains * 2 + scout;
}

// What stands between raiders and the barns: the garlock defence (soldiers,
// captains, camps, roads — js/game.js) plus the stakes and the towers.
function raidPlayerDefence() {
  const base = typeof garlockVillageDefence === "function"
    ? garlockVillageDefence()
    : (typeof human_army !== "undefined" ? human_army * 3 : 0);
  return base + palisade * PALISADE_DEFENCE + watchtower * WATCHTOWER_DEFENCE;
}

// A neighbour's defence: its strength (js/villages.js) plus walls once it
// holds enough land, a little more for a garlock camp, halved once it has
// bent the knee.
function raidVillageDefence(villageId) {
  const village = raidVillage(villageId);
  const map = raidMap();
  if (!village || !map) return 0;
  const held = raidHeldTiles(villageId);
  let defence = typeof villageStrength === "function" ? villageStrength(village, map) : 2;
  if (held >= 40) defence += 3;
  if (held >= 80) defence += 2;
  if (village.kind === "garlock") defence += 2;
  if (raidIsVassal(villageId)) defence = Math.ceil(defence / 2);
  return defence;
}

// A word for the odds, for the inspect pane. The roll is ±20 % on the
// attack, so "good" always wins and "hopeless" never does.
function raidOdds(attack, defence) {
  if (defence <= 0) return "sure";
  const ratio = attack / defence;
  if (ratio >= 2) return "sure";
  if (ratio >= 1.3) return "good";
  if (ratio >= 0.9) return "even";
  if (ratio >= 0.6) return "risky";
  return "hopeless";
}

// Everything the inspect pane and the villages list want to say.
function raidVillageInfo(villageId) {
  const village = raidVillage(villageId);
  if (!village) return null;
  const defence = raidVillageDefence(villageId);
  const soldiers = typeof human_army !== "undefined" ? human_army : 0;
  const attack = raidAttackStrength(soldiers);
  const home = raidHomeTile(villageId);
  const sameContinent = raidSameContinent(villageId);
  return {
    name: village.name,
    kind: village.kind,
    defence,
    attack,
    odds: raidOdds(attack, defence),
    grudge: raidGrudge[villageId] || 0,
    wins: raidWins[villageId] || 0,
    vassal: raidIsVassal(villageId),
    tribute: { food: TRIBUTE_FOOD, wood: TRIBUTE_WOOD },
    held: raidHeldTiles(villageId),
    sameContinent,
    reachable: !!home && sameContinent,
    underWay: raidsOutgoing.some((raid) => raid.villageId === villageId),
  };
}

// ---------------------------------------------------------------------------
// Sending a raid
// ---------------------------------------------------------------------------

// Why the village can't be raided right now, or null if it can. Written
// for the player; the Raid button shows it as its hint.
function raidBlocker(villageId) {
  const map = raidMap();
  if (!map) return "The map hasn't loaded yet.";
  const village = raidVillage(villageId);
  if (!village) return "That is not a village.";
  if (villageId === "player" || village.kind === "player") return "You cannot raid your own village.";
  if (raidIsVassal(villageId)) return `${village.name} is your vassal already — there is no need.`;
  const home = raidHomeTile(villageId);
  if (!home || (typeof map.isRevealed === "function" && !map.isRevealed(home.id))) return `Nobody knows where ${village.name} is yet.`;
  if (!raidSameContinent(villageId)) return `Your soldiers have no boats — ${village.name} lies across the sea.`;
  if (raidsOutgoing.length) return "A raid is already under way. Wait for the soldiers to come home.";
  if (human_army < RAID_MIN_SOLDIERS) return `A raid needs at least ${RAID_MIN_SOLDIERS} soldiers.`;
  if (timbermellow_count < RAID_FOOD_COST) return `The soldiers need ${RAID_FOOD_COST} timbermellows for the march.`;
  if (working_hours < RAID_WORK_HOURS) return `Sending a raid takes ${RAID_WORK_HOURS} work hours.`;
  return null;
}

// Sends the soldiers. `soldiersSent` is how many to send (all of them if
// left out); they leave human_army until they come back. Returns the raid
// record, or null if it was refused.
function raidLaunch(villageId, soldiersSent) {
  const blocker = raidBlocker(villageId);
  if (blocker) {
    raidSay(blocker);
    raidRefresh();
    return null;
  }
  let soldiers = soldiersSent > 0 ? Math.floor(soldiersSent) : human_army;
  soldiers = raidClamp(soldiers, RAID_MIN_SOLDIERS, human_army);

  human_army -= soldiers;
  timbermellow_count -= RAID_FOOD_COST;
  working_hours -= RAID_WORK_HOURS;

  const raid = {
    villageId,
    soldiers,
    launchedTurn: turngame,
    arriveTurn: turngame + RAID_TRAVEL_TURNS,
  };
  raidsOutgoing.push(raid);

  const name = raidName(villageId);
  const info = raidVillageInfo(villageId);
  raidSay(`${raidPlural(soldiers, "soldier")} set out to raid ${name}. They will reach its hall on turn ${raid.arriveTurn}` +
    (info ? ` — their defence ${info.defence} against your ${raidAttackStrength(soldiers)}, a ${raidOdds(raidAttackStrength(soldiers), info.defence)} fight.` : "."), "good");
  raidNote(`${soldiers} soldiers marched on ${name}`, "");
  if (typeof onRaidLaunched === "function") onRaidLaunched(villageId, soldiers);
  raidRefresh();
  return raid;
}

// ---------------------------------------------------------------------------
// The turn
//
// main.js calls raidsTakeTurn() from afterTurnEnded(), BEFORE the other
// villages take their turn, so a raid lands on the village as it was.
// ---------------------------------------------------------------------------

function raidsTakeTurn() {
  if (!raidMap()) return;
  raidsResolveOutgoing();
  raidsScheduleIncoming();
  raidsResolveIncoming();
  raidsCollectTribute();
  raidsDecayGrudges();
}

// (a) The soldiers arrive.
function raidsResolveOutgoing() {
  if (!raidsOutgoing.length) return;
  const arrived = raidsOutgoing.filter((raid) => raid.arriveTurn <= turngame);
  if (!arrived.length) return;
  raidsOutgoing = raidsOutgoing.filter((raid) => raid.arriveTurn > turngame);

  arrived.forEach((raid, index) => {
    const villageId = raid.villageId;
    const name = raidName(villageId);
    const soldiers = raid.soldiers;
    const attack = raidAttackStrength(soldiers);
    const defence = raidVillageDefence(villageId);
    const random = raidRandom(index);
    // ±20 % on the attack: the ground, the weather, who was awake.
    const roll = attack * (0.8 + random() * 0.4);
    const won = roll >= defence;

    let lost = 0;
    const loot = { food: 0, wood: 0, stone: 0 };
    let text;
    let becameVassal = false;

    if (won) {
      const each = raidClamp(Math.round(raidHeldTiles(villageId) * RAID_LOOT_PER_TILE), RAID_LOOT_MIN, RAID_LOOT_MAX);
      const room = Math.max(0, storage_capacity - timbermellow_count);
      loot.food = Math.min(each, room);
      loot.wood = each;
      loot.stone = each;
      timbermellow_count += loot.food;
      wood += loot.wood;
      stone += loot.stone;

      // The stouter the defence, the dearer the win — but somebody always
      // comes home with the loot.
      lost = Math.min(Math.max(0, soldiers - 1), Math.ceil(defence / 6));
      raidGrudge[villageId] = (raidGrudge[villageId] || 0) + 2;
      raidWins[villageId] = (raidWins[villageId] || 0) + 1;

      if (!raidIsVassal(villageId) && (raidWins[villageId] >= VASSAL_RAIDS_NEEDED || attack >= 2 * defence)) {
        raidVassals[villageId] = turngame;
        raidGrudge[villageId] = 0;
        becameVassal = true;
      }

      const parts = [];
      if (loot.food) parts.push(`${loot.food} timbermellows`);
      if (loot.wood) parts.push(`${loot.wood} wood`);
      if (loot.stone) parts.push(`${loot.stone} stone`);
      text = `Your soldiers broke into ${name}'s hall and carried off ${parts.length ? parts.join(", ") : "nothing worth the trip"}` +
        (lost ? `, losing ${raidPlural(lost, "soldier")}.` : " without losing a soul.") +
        (loot.food < each ? " Some of the food would not fit in the barns." : "");
    } else {
      lost = Math.min(soldiers, Math.ceil(soldiers / 2));
      raidGrudge[villageId] = (raidGrudge[villageId] || 0) + 1;
      text = `${name} held its hall. Your raiders were driven off, and ${raidPlural(lost, "soldier")} did not come home.`;
    }

    human_army += soldiers - lost;

    raidSay(text, won ? "good" : "bad");
    raidNote(won ? `raid on ${name} won: +${loot.food} food, +${loot.wood} wood, +${loot.stone} stone` : `raid on ${name} lost: ${lost} soldiers`, won ? "good" : "bad");
    if (becameVassal) {
      raidSay(`${name} bends the knee. It will send ${TRIBUTE_FOOD} timbermellows and ${TRIBUTE_WOOD} wood every turn, and its raiders will never trouble you again.`, "good");
      raidNote(`${name} became your vassal`, "good");
      if (typeof showMilestonePopup === "function" && Object.keys(raidVassals).length === 1) {
        showMilestonePopup("A Vassal", `${name} has sworn to you. Tribute comes up the road every turn now — and every other village on the continent has heard.`, "raid");
      }
    }
    raidRemember({ turn: turngame, villageId, name, incoming: false, won, loot, lost, vassal: becameVassal, text });
    if (typeof onRaidResolved === "function") onRaidResolved({ villageId, incoming: false, won, loot, lost, vassal: becameVassal });
  });
}

// (b) The neighbours decide whether to come. A rival with a grudge comes
// on its own rhythm; one without may still try its luck against full
// barns and a thin guard, once the raids have begun (Act III).
function raidsScheduleIncoming() {
  const map = raidMap();
  const random = raidRandom(1000);
  const raidsBegun = typeof ageAtLeast === "function" ? ageAtLeast("raids") : true;
  for (const village of raidVillages()) {
    if (village.kind !== "rival") continue;
    const villageId = village.id;
    if (raidIsVassal(villageId)) continue;
    if (raidsIncoming.some((raid) => raid.villageId === villageId)) continue;
    const grudge = raidGrudge[villageId] || 0;
    const home = raidHomeTile(villageId);
    if (!home) continue;
    const revealed = typeof map.isRevealed === "function" ? map.isRevealed(home.id) : true;
    if (!revealed && grudge <= 0) continue;
    if (!raidSameContinent(villageId)) continue;

    const strength = typeof villageStrength === "function" ? villageStrength(village, map) : 2;
    const beat = raidVillageHash(villageId) % RIVAL_RAID_INTERVAL;
    const angry = grudge > 0 && turngame % RIVAL_RAID_INTERVAL === beat;
    const greedy = raidsBegun && timbermellow_count >= RIVAL_GREED_FOOD && raidPlayerDefence() < strength && random() < RIVAL_GREED_CHANCE;
    if (!angry && !greedy) continue;

    // A watchtower sees them on the road a turn earlier than the scouts
    // alone would, which is a turn more to raise soldiers.
    const turn = turngame + (watchtower > 0 ? 2 : 1);
    raidsIncoming.push({ villageId, strength: strength + grudge * 2, turn, seenTurn: turngame });
    raidSay(`Scouts from ${village.name} were seen ${watchtower > 0 ? "from the watchtower, still far down the road" : "at the edge of your land"}. Their raiders will come on turn ${turn}.`, "bad");
    raidNote(`${village.name}'s raiders are coming (turn ${turn})`, "bad");
    if (typeof onRaidIncoming === "function") onRaidIncoming(villageId, turn);
  }
}

// (c) The neighbours arrive. Repelled or not, a rival raid never sacks
// the village — that is the garlocks' job (js/game.js).
function raidsResolveIncoming() {
  if (!raidsIncoming.length) return;
  const arrived = raidsIncoming.filter((raid) => raid.turn <= turngame);
  if (!arrived.length) return;
  raidsIncoming = raidsIncoming.filter((raid) => raid.turn > turngame);

  for (const raid of arrived) {
    const villageId = raid.villageId;
    const name = raidName(villageId);
    const defence = raidPlayerDefence();
    const strength = raid.strength;
    const repelled = defence >= strength;
    const loot = { food: 0, wood: 0, stone: 0, barns: 0 };
    let lost = 0;
    let text;

    if (typeof triggerRaidAlarm === "function") triggerRaidAlarm(name);

    if (repelled) {
      lost = Math.min(human_army, Math.ceil(strength / 5));
      human_army -= lost;
      raidGrudge[villageId] = Math.max(0, (raidGrudge[villageId] || 0) - 1);
      text = `${name}'s raiders broke on ${palisade > 0 ? "the palisade" : "your shield line"} and ran for home` +
        (lost ? `, taking ${raidPlural(lost, "soldier")} with them.` : " without taking a soul.");
    } else {
      const shortfall = Math.min(RAID_MAX_BITE, strength - defence);
      loot.food = Math.min(timbermellow_count, Math.ceil(timbermellow_count / 2) + shortfall);
      loot.wood = Math.min(wood, shortfall * 3);
      loot.barns = shortfall >= 3 && barn > 1 ? 1 : 0;
      lost = Math.min(human_army, Math.ceil(shortfall / 2));

      timbermellow_count -= loot.food;
      wood -= loot.wood;
      barn -= loot.barns;
      if (barn < 1) barn = 1;
      storage_capacity = barn * 5;
      human_army -= lost;

      const parts = [];
      if (loot.food) parts.push(`${loot.food} timbermellows`);
      if (loot.wood) parts.push(`${loot.wood} wood`);
      if (loot.barns) parts.push(`${raidPlural(loot.barns, "barn")}`);
      if (lost) parts.push(raidPlural(lost, "soldier"));
      text = `${name}'s raiders carried off ${parts.length ? parts.join(", ") : "nothing they could find"}.` +
        (defence === 0 ? " Nobody stood in their way." : "");
    }

    raidSay(text, repelled ? "good" : "bad");
    raidNote(repelled ? `${name}'s raid repelled` : `${name}'s raiders took ${loot.food} food, ${loot.wood} wood`, repelled ? "good" : "bad");
    raidRemember({ turn: turngame, villageId, name, incoming: true, won: repelled, loot, lost, text });
    if (typeof onRaidResolved === "function") onRaidResolved({ villageId, incoming: true, won: repelled, loot, lost });
  }
}

// (d) Tribute. Food only fits if there is room in the barns; wood keeps.
function raidsCollectTribute() {
  const vassals = Object.keys(raidVassals);
  if (!vassals.length) return { food: 0, wood: 0, from: [] };
  const room = Math.max(0, storage_capacity - timbermellow_count);
  const food = Math.min(room, TRIBUTE_FOOD * vassals.length);
  const woodSent = TRIBUTE_WOOD * vassals.length;
  timbermellow_count += food;
  wood += woodSent;
  const names = vassals.map((id) => raidName(id)).join(", ");
  raidSay(`Tribute from ${names}: ${food} timbermellow${food === 1 ? "" : "s"} and ${woodSent} wood.`, "good");
  raidNote(`tribute brought ${food} food and ${woodSent} wood`, "good");
  return { food, wood: woodSent, from: vassals };
}

// Grudges fade if left alone.
function raidsDecayGrudges() {
  if (turngame % GRUDGE_DECAY_TURNS !== 0) return;
  for (const villageId of Object.keys(raidGrudge)) {
    raidGrudge[villageId] = Math.max(0, raidGrudge[villageId] - 1);
    if (raidGrudge[villageId] <= 0) delete raidGrudge[villageId];
  }
}

// ---------------------------------------------------------------------------
// Winning the continent
// ---------------------------------------------------------------------------

// Every village that shares the player's continent, and how many of them
// have bent the knee. `raidsWon` is the total across every village, for
// the victory screen.
function raidsContinentReport() {
  const mine = raidContinentOf("player");
  let total = 0;
  let vassals = 0;
  const remaining = [];
  for (const village of raidVillages()) {
    if (village.kind === "player" || village.id === "player") continue;
    if (mine < 0 || raidContinentOf(village.id) !== mine) continue;
    total++;
    if (raidIsVassal(village.id)) vassals++;
    else remaining.push(village.name);
  }
  const raidsWon = Object.keys(raidWins).reduce((sum, id) => sum + (raidWins[id] || 0), 0);
  return { total, vassals, remaining, raidsWon };
}

// True once every other village on the continent is a vassal (and there
// was at least one to beat). main.js shows the victory screen.
function raidsCheckVictory() {
  const report = raidsContinentReport();
  return report.total > 0 && report.vassals === report.total;
}

// ---------------------------------------------------------------------------
// Alerts, in the shape ui.js's uiBuildAlerts uses
// ---------------------------------------------------------------------------

function raidsAlerts() {
  const alerts = [];
  const icon = (key, fallback) => (typeof getIcon === "function" ? getIcon(key) : fallback);
  const pointAtSoldiers = () => { if (typeof uiPointAt === "function") uiPointAt("people", "btn_soldier"); };
  const focusOn = (villageId) => () => {
    if (typeof focusVillageById === "function") focusVillageById(villageId);
    else if (typeof focusVillage === "function") focusVillage();
  };

  for (const raid of raidsOutgoing) {
    const left = Math.max(0, raid.arriveTurn - turngame);
    alerts.push({
      level: "info", icon: icon("raid", "⚔"),
      text: `Raid on ${raidName(raid.villageId)} — ${left <= 0 ? "arriving as the turn ends" : `${raidPlural(left, "turn")} away`}`,
      tip: `${raidPlural(raid.soldiers, "soldier")} on the road, worth ${raidAttackStrength(raid.soldiers)} against a defence of ${raidVillageDefence(raid.villageId)}. They come home when the turn ends.`,
      go: focusOn(raid.villageId),
    });
  }

  for (const raid of raidsIncoming) {
    const defence = raidPlayerDefence();
    alerts.push({
      level: "bad", icon: icon("seize", "⚔"),
      text: `${raidName(raid.villageId)}'s raiders on turn ${raid.turn}`,
      tip: `They come ${raid.strength} strong; your village stands at ${defence}. Each soldier is worth 3, each captain 2, each palisade ring ${PALISADE_DEFENCE}, each watchtower ${WATCHTOWER_DEFENCE}. Come up short and they take food, wood and a barn.`,
      go: pointAtSoldiers,
    });
  }

  const vassals = Object.keys(raidVassals);
  if (vassals.length) {
    const names = vassals.map((id) => raidName(id));
    alerts.push({
      level: "info", icon: icon("shield", "🛡"),
      text: vassals.length === 1 ? `${names[0]} is your vassal` : `${vassals.length} vassals pay tribute`,
      tip: `${names.join(", ")} send${vassals.length === 1 ? "s" : ""} ${TRIBUTE_FOOD} timbermellows and ${TRIBUTE_WOOD} wood each every turn and will never raid you.`,
      go: focusOn(vassals[0]),
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

function raidsGetState() {
  return {
    palisade,
    watchtower,
    raidsOutgoing: raidsOutgoing.map((raid) => Object.assign({}, raid)),
    raidsIncoming: raidsIncoming.map((raid) => Object.assign({}, raid)),
    raidGrudge: Object.assign({}, raidGrudge),
    raidWins: Object.assign({}, raidWins),
    raidVassals: Object.assign({}, raidVassals),
    raidLog: raidLog.map((entry) => Object.assign({}, entry)),
  };
}

function raidsSetState(saved) {
  if (!saved) return;
  palisade = saved.palisade || 0;
  watchtower = saved.watchtower || 0;
  raidsOutgoing = (saved.raidsOutgoing || []).map((raid) => Object.assign({}, raid));
  raidsIncoming = (saved.raidsIncoming || []).map((raid) => Object.assign({}, raid));
  raidGrudge = Object.assign({}, saved.raidGrudge || {});
  raidWins = Object.assign({}, saved.raidWins || {});
  raidVassals = Object.assign({}, saved.raidVassals || {});
  raidLog = (saved.raidLog || []).map((entry) => Object.assign({}, entry)).slice(-RAID_LOG_MAX);
}
