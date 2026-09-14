// raids.test.js
//
// Node tests for js/raids.js. The rules file is a classic script that reads
// plain globals (human_army, wood, hexMap, villagesGet, ...), so this
// script defines tiny stubs of everything it touches on globalThis and
// then evaluates raids.js in this context with vm.runInThisContext. Run:
//
//   node js/raids.test.js

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const G = globalThis;

// A tiny map: one tile per village hall, on two continents.
const tiles = {
  h_p:   { id: "h_p",   continentId: 0, owner: "player",    villageId: "player" },
  h_r1:  { id: "h_r1",  continentId: 0, owner: "rival_1",   villageId: "rival_1" },
  h_r2:  { id: "h_r2",  continentId: 0, owner: "rival_2",   villageId: "rival_2" },
  h_g:   { id: "h_g",   continentId: 0, owner: "garlock_1", villageId: "garlock_1" },
  h_far: { id: "h_far", continentId: 1, owner: "rival_far", villageId: "rival_far" },
};
const villages = [
  { id: "player",    name: "Home",      kind: "player",  color: "#f2c14e", homeTileId: "h_p",   continentId: 0 },
  { id: "rival_1",   name: "Eastmere",  kind: "rival",   color: "#3a7d44", homeTileId: "h_r1",  continentId: 0 },
  { id: "rival_2",   name: "Northholm", kind: "rival",   color: "#3a5d94", homeTileId: "h_r2",  continentId: 0 },
  { id: "garlock_1", name: "The Maw",   kind: "garlock", color: "#8c1f1f", homeTileId: "h_g",   continentId: 0 },
  { id: "rival_far", name: "Farshore",  kind: "rival",   color: "#94733a", homeTileId: "h_far", continentId: 1 },
];
const held = { player: 37, rival_1: 15, rival_2: 60, garlock_1: 10, rival_far: 20 };
const revealed = new Set(["h_p", "h_r1", "h_g", "h_far"]);

G.hexMap = {
  getTile: (id) => tiles[id] || null,
  homeTileOf: (villageId) => Object.values(tiles).find((tile) => tile.villageId === villageId) || null,
  isRevealed: (id) => revealed.has(id),
  countOwnedBy: (villageId) => held[villageId] || 0,
};
G.villagesGet = () => villages;
G.villageById = (id) => villages.find((village) => village.id === id) || null;
G.villageName = (id) => (G.villageById(id) || { name: "someone" }).name;
// The same formula as js/villages.js (T1: tiles / 8).
G.villageStrength = (village, map) => (village.kind === "garlock" ? 4 : 2) + Math.round(map.countOwnedBy(village.id) / 8) * 2;
// game.js's defence without captains, camps or roads.
G.garlockVillageDefence = () => G.human_army * 3;

// A mulberry32, like js/world/hexMath.js.
G.createRandom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const log = [];
const hooks = { launched: [], incoming: [], resolved: [], milestones: [] };
G.updatelog = (text, kind) => log.push({ text, kind });
G.turnReportNote = () => {};
G.update = () => {};
G.showMilestonePopup = (title) => hooks.milestones.push(title);
G.onRaidLaunched = (villageId, soldiers) => hooks.launched.push({ villageId, soldiers });
G.onRaidIncoming = (villageId, turn) => hooks.incoming.push({ villageId, turn });
G.onRaidResolved = (result) => hooks.resolved.push(result);

function resetVillage(over) {
  Object.assign(G, {
    humans: 6, human_army: 4, wood: 20, stone: 10, timbermellow_count: 10, working_hours: 8,
    storage_capacity: 20, barn: 4, turngame: 5, worldSeed: 777,
    professionCounts: { farmer: 0, forester: 0, mason: 0, scholar: 0, scout: 0, captain: 0 },
  }, over || {});
  log.length = 0;
  for (const key of Object.keys(hooks)) hooks[key].length = 0;
}

function resetRaids(over) {
  raidsSetState(Object.assign({
    palisade: 0, watchtower: 0, raidsOutgoing: [], raidsIncoming: [],
    raidGrudge: {}, raidWins: {}, raidVassals: {}, raidLog: [],
  }, over || {}));
}

// A turn on which `villageId` is NOT on its raiding beat (or is, if `on`).
function turnFor(villageId, on, from) {
  const beat = raidVillageHash(villageId) % RIVAL_RAID_INTERVAL;
  let turn = from || 2;
  while ((turn % RIVAL_RAID_INTERVAL === beat) !== !!on) turn++;
  return turn;
}

const source = fs.readFileSync(path.join(__dirname, "raids.js"), "utf8");
vm.runInThisContext(source, { filename: "raids.js" });

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL - ${name}\n  ${error && error.stack ? error.stack.split("\n").slice(0, 3).join("\n  ") : error}`);
  }
}

test("strength: attack counts soldiers, captains and a scout; defence counts walls", () => {
  resetVillage();
  resetRaids();
  assert.equal(raidAttackStrength(3), 9);
  G.professionCounts.captain = 5;      // capped at three
  G.professionCounts.scout = 2;        // one bonus, however many
  assert.equal(raidAttackStrength(3), 9 + 6 + 1);
  assert.equal(raidPlayerDefence(), 12);
  resetRaids({ palisade: 2, watchtower: 1 });
  assert.equal(raidPlayerDefence(), 12 + 2 * PALISADE_DEFENCE + WATCHTOWER_DEFENCE);
  // T1: tiles / 8. Eastmere 15 -> 2 + 2*2 = 6. Northholm 60 -> 2 + 8*2 = 18 +3. Garlocks 10 -> 4 + 1*2 +2 = 8.
  assert.equal(raidVillageDefence("rival_1"), 6);
  assert.equal(raidVillageDefence("rival_2"), 2 + 16 + 3);
  assert.equal(raidVillageDefence("garlock_1"), 4 + 2 + 2);
  resetRaids({ raidVassals: { rival_1: 3 } });
  assert.equal(raidVillageDefence("rival_1"), 3, "a vassal's defence is halved");
});

test("blockers, in order", () => {
  resetVillage({ human_army: 1, timbermellow_count: 2, working_hours: 1 });
  resetRaids();
  assert.match(raidBlocker("nowhere"), /not a village/);
  assert.match(raidBlocker("player"), /own village/);
  assert.match(raidBlocker("rival_2"), /Nobody knows where Northholm/);
  assert.match(raidBlocker("rival_far"), /no boats/);
  assert.match(raidBlocker("rival_1"), /at least 2 soldiers/);
  G.human_army = 2;
  assert.match(raidBlocker("rival_1"), /6 timbermellows/);
  G.timbermellow_count = 6;
  assert.match(raidBlocker("rival_1"), /4 work hours/);
  G.working_hours = 4;
  assert.equal(raidBlocker("rival_1"), null);
  resetRaids({ raidVassals: { rival_1: 2 } });
  assert.match(raidBlocker("rival_1"), /vassal already/);
  // T1: two warbands at once. Same hall blocks; a different hall is fine
  // until two are already out. rival_2 is unrevealed in fixtures, so reveal
  // it for this check.
  resetRaids({ raidsOutgoing: [{ villageId: "rival_1", soldiers: 2, launchedTurn: 4, arriveTurn: 6 }] });
  assert.match(raidBlocker("rival_1"), /already under way/);
  revealed.add("h_r2");
  assert.equal(raidBlocker("garlock_1"), null, "a second raid on another hall is allowed");
  resetRaids({ raidsOutgoing: [
    { villageId: "rival_1", soldiers: 2, launchedTurn: 4, arriveTurn: 6 },
    { villageId: "garlock_1", soldiers: 2, launchedTurn: 4, arriveTurn: 6 },
  ] });
  assert.match(raidBlocker("rival_2"), /Two raids are already under way/);
  revealed.delete("h_r2");
  const info = raidVillageInfo("rival_far");
  assert.equal(info.reachable, false);
  assert.equal(info.sameContinent, false);
  assert.equal(raidVillageInfo("rival_1").reachable, true);
});

test("a launch pays, takes the soldiers off the roster and tells the map", () => {
  resetVillage();
  resetRaids();
  const raid = raidLaunch("rival_1", 3);
  assert.ok(raid);
  assert.equal(G.human_army, 1);
  assert.equal(G.timbermellow_count, 10 - RAID_FOOD_COST);
  assert.equal(G.working_hours, 8 - RAID_WORK_HOURS);
  assert.equal(raid.arriveTurn, 5 + RAID_TRAVEL_TURNS);
  assert.deepEqual(hooks.launched, [{ villageId: "rival_1", soldiers: 3 }]);
  assert.match(raidBlocker("rival_1"), /already under way/);
  assert.equal(raidVillageInfo("rival_1").underWay, true);
  // With no count every soldier goes; a refused launch changes nothing.
  resetVillage({ human_army: 5 });
  resetRaids();
  assert.equal(raidLaunch("rival_1").soldiers, 5);
  assert.equal(G.human_army, 0);
  resetVillage({ human_army: 1 });
  resetRaids();
  assert.equal(raidLaunch("rival_1"), null);
  assert.equal(G.human_army, 1);
  assert.match(log[log.length - 1].text, /at least 2 soldiers/);
});

test("a sure win loots the hall and the survivors come home", () => {
  // T1: Three soldiers (9) against Eastmere's 6: the worst roll, 7.2, still
  // wins, but 9 < 2*6 so it stays an ordinary win, not an instant vassal.
  resetVillage({ human_army: 5 });
  resetRaids();
  raidLaunch("rival_1", 3);
  assert.equal(G.human_army, 2);
  G.turngame = turnFor("rival_1", false, 6);
  raidsTakeTurn();
  const state = raidsGetState();
  assert.equal(state.raidsOutgoing.length, 0);
  // 15 tiles * 0.25 = 4 food/wood; stone comes home at half rate (no quarry).
  assert.equal(G.timbermellow_count, 4 + 4);
  assert.equal(G.wood, 24);
  assert.equal(G.stone, 12);
  // T1: ceil(6 / 6) = 1 soldier lost, two come home.
  assert.equal(G.human_army, 4);
  assert.equal(state.raidWins.rival_1, 1);
  assert.equal(state.raidGrudge.rival_1, 2);
  assert.equal(state.raidVassals.rival_1, undefined, "one ordinary win is not a vassal");
  assert.equal(hooks.resolved.length, 1);
  assert.deepEqual(hooks.resolved[0], { villageId: "rival_1", incoming: false, won: true, loot: { food: 4, wood: 4, stone: 2 }, lost: 1, vassal: false });
  assert.equal(state.raidLog.length, 1);
  assert.equal(state.raidLog[0].won, true);
  assert.ok(log.some((entry) => /carried off 4 timbermellows, 4 wood, 2 stone/.test(entry.text)));
});

test("food loot is capped by the barns", () => {
  resetVillage({ human_army: 5, timbermellow_count: 12, storage_capacity: 8 });
  resetRaids();
  raidLaunch("rival_1", 4);           // food 12 -> 6, room for 2
  G.turngame = turnFor("rival_1", false, 6);
  raidsTakeTurn();
  assert.equal(G.timbermellow_count, 8);
  assert.equal(hooks.resolved[0].loot.food, 2);
});

test("a hopeless raid loses half the party and earns a grudge", () => {
  // T1: Two soldiers (6) against Northholm's 21: the best roll, 7.2, still loses.
  revealed.add("h_r2");
  resetVillage({ human_army: 2 });
  resetRaids();
  raidLaunch("rival_2");
  assert.equal(raidVillageInfo("rival_2").odds, "hopeless");
  G.turngame = turnFor("rival_2", false, 6);
  raidsTakeTurn();
  assert.equal(G.human_army, 1);
  const state = raidsGetState();
  assert.equal(state.raidGrudge.rival_2, 1);
  assert.equal(state.raidWins.rival_2, undefined);
  assert.equal(hooks.resolved[0].won, false);
  assert.equal(hooks.resolved[0].lost, 1);
  revealed.delete("h_r2");
});

test("two wins make a vassal; so does one overwhelming win", () => {
  resetVillage({ human_army: 5 });
  resetRaids({ raidWins: { rival_1: 1 }, raidGrudge: { rival_1: 2 } });
  raidLaunch("rival_1", 4);
  G.turngame = turnFor("rival_1", false, 6);
  raidsTakeTurn();
  const state = raidsGetState();
  assert.equal(state.raidWins.rival_1, 2);
  assert.equal(state.raidVassals.rival_1, G.turngame);
  assert.equal(state.raidGrudge.rival_1, 0, "a vassal has no grudge left");
  assert.ok(log.some((entry) => /Eastmere bends the knee/.test(entry.text)));
  assert.equal(hooks.resolved[0].vassal, true);
  assert.deepEqual(hooks.milestones, ["A Vassal"]);
  assert.equal(raidVillageInfo("rival_1").vassal, true);

  // The garlock camp (4 + 1*2 for ten tiles + 2 = 8) against seven soldiers (21):
  // 21 >= 2 * 8 -> "sure", and a vassal at once.
  resetVillage({ human_army: 7 });
  resetRaids();
  assert.equal(raidVillageInfo("garlock_1").odds, "sure");
  raidLaunch("garlock_1");
  G.turngame = 7;
  raidsTakeTurn();
  assert.equal(raidsGetState().raidVassals.garlock_1, 7);
});

test("vassals pay tribute every turn and never raid", () => {
  resetVillage({ timbermellow_count: 4, wood: 0, storage_capacity: 20 });
  resetRaids({ raidVassals: { rival_1: 3 }, raidGrudge: { rival_1: 5 } });
  G.turngame = turnFor("rival_1", true, 8);        // on Eastmere's raiding beat, yet nothing comes
  raidsTakeTurn();
  assert.equal(G.timbermellow_count, 4 + TRIBUTE_FOOD);
  assert.equal(G.wood, TRIBUTE_WOOD);
  assert.equal(raidsGetState().raidsIncoming.length, 0);
  assert.ok(log.some((entry) => /Tribute from Eastmere/.test(entry.text)));
  // Food only fits if there is room.
  resetVillage({ timbermellow_count: 19, wood: 0, storage_capacity: 20 });
  resetRaids({ raidVassals: { rival_1: 3, garlock_1: 4 } });
  G.turngame = turnFor("rival_1", false, 8);
  raidsTakeTurn();
  assert.equal(G.timbermellow_count, 20);
  assert.equal(G.wood, 2 * TRIBUTE_WOOD);
});

test("a rival with a grudge schedules a raid on its beat; watchtowers see it a turn earlier", () => {
  // T-fix: GRUDGE_DECAY_TURNS is 8 now, so avoid decay turns or the grudge
  // drops 3->2 between the two takeTurns and the strength reads 10 not 12.
  const offBeat = () => {
    let t = turnFor("rival_1", false, 9);
    while (t % GRUDGE_DECAY_TURNS === 0) t++;
    while (t % RIVAL_RAID_INTERVAL === raidVillageHash("rival_1") % RIVAL_RAID_INTERVAL) t++;
    return t;
  };
  const onBeat = () => {
    let t = turnFor("rival_1", true, 9);
    while (t % GRUDGE_DECAY_TURNS === 0) t += RIVAL_RAID_INTERVAL;
    return t;
  };
  resetVillage();
  resetRaids({ raidGrudge: { rival_1: 3 } });
  G.turngame = offBeat();
  raidsTakeTurn();
  assert.equal(raidsGetState().raidsIncoming.length, 0, "off the beat, nobody comes");
  resetRaids({ raidGrudge: { rival_1: 3 } });
  G.turngame = onBeat();
  raidsTakeTurn();
  let incoming = raidsGetState().raidsIncoming;
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].villageId, "rival_1");
  // T1: villageStrength 15 tiles -> 6, so 6 + 3*2 = 12.
  assert.equal(incoming[0].strength, 6 + 3 * 2);
  assert.equal(incoming[0].turn, G.turngame + 1);
  assert.deepEqual(hooks.incoming, [{ villageId: "rival_1", turn: G.turngame + 1 }]);
  assert.ok(log.some((entry) => /Scouts from Eastmere/.test(entry.text)));
  // Only once while it is on the road.
  raidsTakeTurn();
  assert.equal(raidsGetState().raidsIncoming.length, 1);

  resetRaids({ raidGrudge: { rival_1: 3 }, watchtower: 1 });
  resetVillage();
  G.turngame = turnFor("rival_1", true, 8);
  raidsTakeTurn();
  incoming = raidsGetState().raidsIncoming;
  assert.equal(incoming[0].turn, G.turngame + 2, "a watchtower gives a turn more warning");

  // Across the sea, or unknown and unprovoked: nothing.
  resetRaids({ raidGrudge: { rival_far: 4 } });
  G.turngame = turnFor("rival_far", true, 8);
  raidsTakeTurn();
  assert.equal(raidsGetState().raidsIncoming.length, 0);
});

test("an incoming raid is resolved against the defence, palisades counting", () => {
  // Fourteen strong against two soldiers (6) and three rings (9): repelled.
  // T1: barns hold 8 each (3 barns = 24).
  resetVillage({ human_army: 2, timbermellow_count: 20, wood: 30, barn: 3, storage_capacity: 24 });
  resetRaids({ palisade: 3, raidGrudge: { rival_1: 3 }, raidsIncoming: [{ villageId: "rival_1", strength: 14, turn: 9, seenTurn: 8 }] });
  G.turngame = turnFor("rival_1", false, 9);
  raidsSetState(Object.assign(raidsGetState(), { raidsIncoming: [{ villageId: "rival_1", strength: 14, turn: G.turngame, seenTurn: G.turngame - 1 }] }));
  raidsTakeTurn();
  assert.equal(raidsGetState().raidsIncoming.length, 0);
  assert.equal(G.timbermellow_count, 20, "repelled: the barns are untouched");
  assert.equal(G.wood, 30);
  assert.equal(G.barn, 3);
  assert.equal(G.human_army, 0, "ceil(14 / 5) = 3, capped at the two we had");
  assert.equal(raidsGetState().raidGrudge.rival_1, 2);
  assert.deepEqual(hooks.resolved[0], { villageId: "rival_1", incoming: true, won: true, loot: { food: 0, wood: 0, stone: 0, barns: 0 }, lost: 2 });
  assert.ok(log.some((entry) => /broke on the palisade/.test(entry.text)));

  // The same raid with no walls: shortfall 8, capped at 6.
  resetVillage({ human_army: 2, timbermellow_count: 20, wood: 30, barn: 3, storage_capacity: 24 });
  resetRaids({ raidsIncoming: [{ villageId: "rival_1", strength: 14, turn: G.turngame, seenTurn: G.turngame - 1 }] });
  raidsTakeTurn();
  assert.equal(G.timbermellow_count, 20 - (10 + 6));
  assert.equal(G.wood, 30 - 18);
  assert.equal(G.barn, 2);
  assert.equal(G.storage_capacity, 16, "T1: 2 barns hold 16");
  assert.equal(G.human_army, 0);
  assert.equal(G.humans, 6, "a rival raid never sacks the village");
  const result = hooks.resolved[0];
  assert.equal(result.won, false);
  assert.deepEqual(result.loot, { food: 16, wood: 18, stone: 0, barns: 1 });
  assert.ok(log.some((entry) => /Eastmere's raiders carried off 16 timbermellows, 18 wood, 1 barn, 2 soldiers/.test(entry.text)));
});

test("grudges fade", () => {
  resetVillage();
  resetRaids({ raidGrudge: { rival_1: 1, rival_2: 3 } });
  G.turngame = GRUDGE_DECAY_TURNS * 3;
  while (G.turngame % RIVAL_RAID_INTERVAL === raidVillageHash("rival_1") % RIVAL_RAID_INTERVAL ||
         G.turngame % RIVAL_RAID_INTERVAL === raidVillageHash("rival_2") % RIVAL_RAID_INTERVAL) G.turngame += GRUDGE_DECAY_TURNS;
  raidsTakeTurn();
  const grudge = raidsGetState().raidGrudge;
  assert.equal(grudge.rival_1, undefined);
  assert.equal(grudge.rival_2, 2);
});

test("victory when every village on the continent is a vassal", () => {
  resetVillage();
  resetRaids({ raidVassals: { rival_1: 3, rival_2: 5 }, raidWins: { rival_1: 2, rival_2: 1, garlock_1: 1 } });
  let report = raidsContinentReport();
  assert.equal(report.total, 3, "Farshore is across the sea and does not count");
  assert.equal(report.vassals, 2);
  assert.deepEqual(report.remaining, ["The Maw"]);
  assert.equal(report.raidsWon, 4);
  assert.equal(raidsCheckVictory(), false);
  resetRaids({ raidVassals: { rival_1: 3, rival_2: 5, garlock_1: 6 } });
  report = raidsContinentReport();
  assert.deepEqual(report.remaining, []);
  assert.equal(raidsCheckVictory(), true);
  resetRaids();
  assert.equal(raidsCheckVictory(), false, "nothing to win with nobody beaten");
});

test("T1 casual: three vassals wins a big continent early", () => {
  resetVillage();
  // Five rivals on the continent, only three bent — still a win for 30-min runs.
  // Note: G.villageById in this file closes over `villages`, so override it too.
  const bigList = [
    { id: "player", name: "Home", kind: "player", color: "#fff", homeTileId: "h_p", continentId: 0 },
    { id: "rival_1", name: "A", kind: "rival", color: "#000", homeTileId: "h_r1", continentId: 0 },
    { id: "rival_2", name: "B", kind: "rival", color: "#000", homeTileId: "h_r2", continentId: 0 },
    { id: "garlock_1", name: "C", kind: "garlock", color: "#000", homeTileId: "h_g", continentId: 0 },
    { id: "extra_1", name: "D", kind: "rival", color: "#000", homeTileId: "h_r1", continentId: 0 },
    { id: "extra_2", name: "E", kind: "rival", color: "#000", homeTileId: "h_r2", continentId: 0 },
  ];
  const oldGet = G.villagesGet;
  const oldById = G.villageById;
  const oldName = G.villageName;
  G.villagesGet = () => bigList;
  G.villageById = (id) => bigList.find((village) => village.id === id) || null;
  G.villageName = (id) => (G.villageById(id) || { name: "someone" }).name;
  resetRaids({ raidVassals: { rival_1: 3, rival_2: 5, garlock_1: 6 } });
  const report = raidsContinentReport();
  assert.equal(report.total, 5);
  assert.equal(report.vassals, 3);
  assert.equal(raidsCheckVictory(), true, "three vassals is a continent won");
  G.villagesGet = oldGet;
  G.villageById = oldById;
  G.villageName = oldName;
});

test("the buildings pay and are capped", () => {
  resetVillage({ wood: 20, stone: 10, working_hours: 4 });
  resetRaids();
  make_palisade();
  assert.equal(G.wood, 20 - PALISADE_WOOD_COST);
  assert.equal(G.working_hours, 4 - PALISADE_WORK_HOURS);
  assert.deepEqual(raidDefenceCounters(), { palisades: 1, watchtowers: 0 });
  assert.deepEqual(hooks.milestones, ["The Palisade"]);
  make_palisade();                                   // 8 wood: refused
  assert.equal(raidDefenceCounters().palisades, 1);
  assert.match(log[log.length - 1].text, /needs 12 wood/);
  G.wood = 100; G.working_hours = 20;
  make_palisade(); make_palisade(); make_palisade();
  assert.equal(raidDefenceCounters().palisades, PALISADE_MAX);
  assert.match(log[log.length - 1].text, /Three rings/);

  G.stone = 3;
  make_watchtower();
  assert.match(log[log.length - 1].text, /needs 4 stone/);
  G.stone = 4;
  make_watchtower();
  assert.deepEqual(raidDefenceCounters(), { palisades: 3, watchtowers: 1 });
  assert.equal(G.stone, 0);
  assert.equal(raidPlayerDefence(), 4 * 3 + 3 * PALISADE_DEFENCE + WATCHTOWER_DEFENCE);
});

test("alerts come in ui.js's shape", () => {
  resetVillage({ turngame: 10 });
  resetRaids({
    raidsOutgoing: [{ villageId: "rival_1", soldiers: 3, launchedTurn: 10, arriveTurn: 11 }],
    raidsIncoming: [{ villageId: "rival_2", strength: 20, turn: 11, seenTurn: 10 }],
    raidVassals: { garlock_1: 4 },
  });
  const alerts = raidsAlerts();
  assert.equal(alerts.length, 3);
  for (const alert of alerts) {
    assert.ok(["info", "bad"].includes(alert.level));
    assert.equal(typeof alert.text, "string");
    assert.equal(typeof alert.tip, "string");
    assert.equal(typeof alert.go, "function");
    alert.go();                                     // must not throw without the UI
  }
  assert.match(alerts[0].text, /Raid on Eastmere — 1 turn away/);
  assert.match(alerts[1].text, /Northholm's raiders on turn 11/);
  assert.match(alerts[2].text, /The Maw is your vassal/);
  resetRaids();
  assert.deepEqual(raidsAlerts(), []);
});

test("state round-trips", () => {
  resetVillage();
  const saved = {
    palisade: 2, watchtower: 1,
    raidsOutgoing: [{ villageId: "rival_1", soldiers: 3, launchedTurn: 10, arriveTurn: 11 }],
    raidsIncoming: [{ villageId: "rival_2", strength: 20, turn: 11, seenTurn: 10 }],
    raidGrudge: { rival_1: 2 },
    raidWins: { rival_1: 1, garlock_1: 2 },
    raidVassals: { garlock_1: 4 },
    raidLog: [{ turn: 9, villageId: "garlock_1", name: "The Maw", incoming: false, won: true, loot: { food: 3, wood: 3, stone: 3 }, lost: 0, vassal: true, text: "x" }],
  };
  raidsSetState(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(raidsGetState(), saved);
  assert.deepEqual(raidDefenceCounters(), { palisades: 2, watchtowers: 1 });
  // The copy is a copy: mutating the snapshot leaves the live state alone.
  const snapshot = raidsGetState();
  snapshot.raidsOutgoing[0].soldiers = 99;
  snapshot.raidGrudge.rival_1 = 99;
  assert.equal(raidsGetState().raidsOutgoing[0].soldiers, 3);
  assert.equal(raidsGetState().raidGrudge.rival_1, 2);
  // An empty or missing save is a fresh start.
  raidsSetState(null);
  assert.equal(raidsGetState().palisade, 2, "null leaves things as they were");
  raidsSetState({});
  assert.deepEqual(raidsGetState(), { palisade: 0, watchtower: 0, raidsOutgoing: [], raidsIncoming: [], raidGrudge: {}, raidWins: {}, raidVassals: {}, raidLog: [] });
});

if (failures) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nall raids tests passed");
