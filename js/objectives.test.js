// objectives.test.js
//
// Runs js/objectives.js in this node process with the game's globals stubbed
// out, and checks the checklist, the panel, the save round-trip, the intro
// card and the victory screen.
//
//   node js/objectives.test.js

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ---------------------------------------------------------------------------
// A document just big enough for the panel and the modals
// ---------------------------------------------------------------------------

function fakeElement(id) {
  const classes = new Set();
  return {
    id,
    hidden: true,
    innerHTML: "",
    textContent: "",
    offsetWidth: 0,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
    },
    classes,
  };
}

const elements = {};
for (const id of ["objectivePanel", "objectiveList", "objectiveCount", "introModal", "introSteps",
                  "victoryModal", "victoryCause", "victoryStats"]) {
  elements[id] = fakeElement(id);
}
global.document = {
  getElementById: (id) => elements[id] || null,
  querySelector: () => null,
};

// ---------------------------------------------------------------------------
// The rule globals, at the start of a fresh game
// ---------------------------------------------------------------------------

const logLines = [];
const pointed = [];
const floated = [];
const popups = [];
let store = {};

Object.assign(global, {
  AGE_ORDER: ["dawn", "growth", "raids", "famine"],
  agePhase: "dawn",
  ageAtLeast: (phase) => global.AGE_ORDER.indexOf(global.agePhase) >= global.AGE_ORDER.indexOf(phase),
  // Item 7: the barn, the land and ageFoodGathered all count calories now.
  // js/territory.js declares this once for the whole classic-script scope.
  CALORIES_PER_TIMBERMELLOW: 1000,
  ageFoodGathered: 0,
  humans: 2, human_army: 0, wood: 0, stone: 0, timbermellow_count: 0,
  barn: 1, stonehouse: 1, school: 0, armycamp: 0, turngame: 1,
  stoneaxe_made: 0, farming_made: 0,
  professionCounts: { farmer: 0, forester: 0, mason: 0 },
  jobAssignments: { timbermellow: 0, wood: 0, stone: 0 },
  territoryClaimedCount: () => 37,
  uiPointAt: (tab, id) => pointed.push([tab, id]),
  uiSetTab: () => {},
  updatelog: (text, kind) => logLines.push([text, kind]),
  spawnFloatingReward: (text, icon) => floated.push([text, icon]),
  showMilestonePopup: (title) => popups.push(title),
  localStorage: {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  },
});

const source = fs.readFileSync(path.join(__dirname, "objectives.js"), "utf8");
vm.runInThisContext(source, { filename: "objectives.js" });
const read = (expression) => vm.runInThisContext(expression);

// ---------------------------------------------------------------------------
// The checklist
// ---------------------------------------------------------------------------

assert.strictEqual(read("OBJECTIVES.length"), 24, "twenty-four objectives");
assert.deepStrictEqual(read("Object.keys(OBJECTIVES)").length, 24);
for (const objective of read("OBJECTIVES")) {
  for (const field of ["id", "title", "hint", "check", "go"]) assert.ok(objective[field], `${objective.id} has ${field}`);
  assert.ok(objective.act >= 0 && objective.act <= 3, `${objective.id} act in range`);
}

// Nothing is done at the start.
objectivesRefresh();
assert.deepStrictEqual(read("objectivesDone"), {}, "nothing done at start");
assert.strictEqual(objectivesNext().id, "gather_5", "the first goal is to gather");
// Sếp's "lets go back to the start": Act I is deliberately bare, so the
// checklist panel and the Next chip stay hidden until Act II (js/ages.js).
assert.strictEqual(elements.objectivePanel.hidden, true, "Act I shows no checklist");
assert.strictEqual(read("objectivesBaseTiles"), 37, "home tiles were noted");

// A later act's objective is not checked before its act begins, even when its
// condition is plainly met. (villager_3 does complete — it is an Act I goal.)
global.human_army = 1;
objectivesRefresh();
assert.strictEqual(read("objectivesDone").villager_3, 1, "Act I objective completes");
assert.ok(!read("objectivesDone").soldier_1, "a later act's objective is not checked yet");
read("delete objectivesDone.villager_3");
global.human_army = 0;
objectivesRefresh();
assert.deepStrictEqual(read("objectivesDone"), {}, "back to nothing done");
floated.length = 0;
logLines.length = 0;

// Act II: the panel appears, listing the next three pending, nothing done yet.
global.agePhase = "growth";
objectivesRefresh();
assert.strictEqual(elements.objectivePanel.hidden, false, "panel shows once Act II begins");
assert.strictEqual(elements.objectiveCount.textContent, "0/24");
assert.strictEqual((elements.objectiveList.innerHTML.match(/<li>/g) || []).length, 3, "three rows");
assert.ok(!elements.objectiveList.innerHTML.includes("rw-objective--done"), "no done row yet");
assert.ok(elements.objectiveList.innerHTML.includes("rw-objective--new"), "first rows flash as new");
assert.ok(elements.objectiveList.innerHTML.includes("0/5"), "progress text for gather");

// Keyed rebuild: nothing changed, so the DOM is left alone.
elements.objectiveList.innerHTML = "UNTOUCHED";
objectivesRefresh();
assert.strictEqual(elements.objectiveList.innerHTML, "UNTOUCHED", "no rebuild when nothing changed");

// Gathering 5 completes the first objective and pays the reward (2 wood).
global.ageFoodGathered = 5 * 1000;
global.wood = 1;
objectivesRefresh();
assert.strictEqual(read("objectivesDone").gather_5, 1, "gather_5 done on turn 1");
assert.strictEqual(global.wood, 3, "reward of 2 wood granted");
assert.ok(logLines.some(([text]) => text.startsWith("Objective complete — Gather 5 timbermellows")), "log line");
assert.deepStrictEqual(floated[0], ["+2", "wood"], "floating reward");
assert.strictEqual(elements.objectiveCount.textContent, "1/24");

// The panel now shows the done row (greyed) plus the next three pending.
const html = elements.objectiveList.innerHTML;
assert.strictEqual((html.match(/<li>/g) || []).length, 4, "one done row plus three pending");
assert.strictEqual((html.match(/rw-objective--done/g) || []).length, 1, "one done row");
assert.ok(html.indexOf("rw-objective--done") < html.indexOf("Pick up 4 wood"), "done row first");
assert.ok(html.includes("Pick up 4 wood") && html.includes("Build a barn") && html.includes("End a turn"), "next three");
assert.ok(!html.includes("Raise a third villager"), "fourth pending is not shown");
assert.ok(!html.includes("Train a soldier"), "a later act's objective is not shown");
assert.ok(html.includes("✓") && html.includes("○"), "marks");

// Act II objectives complete once their act begins.
global.human_army = 1;
objectivesRefresh();
assert.strictEqual(read("objectivesDone").soldier_1, 1, "soldier objective completes once Act II begins");
assert.ok(objectivesPending().some((o) => o.id === "explore_1"), "Act II objectives now pending");
assert.ok(!objectivesPending().some((o) => o.id === "raid_1"), "Act III still hidden");

// Exploring is measured against the founding size, not a fixed 37.
global.territoryClaimedCount = () => 44;
objectivesRefresh();
assert.strictEqual(read("objectivesDone").explore_1, 1, "explore completes when the land grows");

// A raid still on the road counts as sent, before anything is in the log.
global.raidsOutgoing = [{ villageId: "v2", soldiers: 2 }];
assert.strictEqual(objectivesRaidsSent(), 1, "a marching raid counts");
delete global.raidsOutgoing;

// A missing global is just "not yet" — no throw. (raidLog, palisade unset.)
global.agePhase = "famine";
assert.doesNotThrow(() => objectivesRefresh());
assert.ok(!read("objectivesDone").palisade_1 && !read("objectivesDone").raid_1 && !read("objectivesDone").continent);

// The raid globals from js/raids.js, once present, are read with typeof guards.
global.palisade = 1;
// Shapes as js/raids.js keeps them: incoming flag on log entries, villageId-keyed maps.
global.raidsOutgoing = [];
global.raidLog = [{ turn: 12, villageId: "v2", incoming: false, won: false }, { turn: 13, villageId: "v3", incoming: true, won: true }];
global.raidWins = { v2: 1 };
global.raidVassals = { v2: 14 };
global.raidsContinentReport = () => ({ total: 3, vassals: 1, remaining: ["Ashford", "Brill"], raidsWon: 1 });
objectivesRefresh();
const done = read("objectivesDone");
assert.ok(done.palisade_1 && done.raid_1 && done.raid_win && done.repel_1 && done.vassal_1, "raid objectives complete");
assert.ok(!done.continent, "continent not yet");
assert.ok(popups.includes("Make a village your vassal"), "milestone popup for the vassal");
assert.deepStrictEqual(objectivesById("continent").progress(), { have: 1, need: 3 }, "continent progress");

global.raidsContinentReport = () => ({ total: 3, vassals: 3, remaining: [], raidsWon: 4 });
objectivesRefresh();
assert.ok(read("objectivesDone").continent, "continent done when nobody remains");

// Clicking a row walks the player to the right button.
objectivesGo("barn_2");
assert.deepStrictEqual(pointed[pointed.length - 1], ["build", "btn_barn"], "go() points at the barn");

// Alerts: one "Next:" line for the top pending objective.
const alerts = objectivesAlerts();
assert.strictEqual(alerts.length, 1);
assert.strictEqual(alerts[0].text, `Next: ${objectivesNext().title}`);
assert.strictEqual(alerts[0].level, "info");

// ---------------------------------------------------------------------------
// Save round-trip
// ---------------------------------------------------------------------------

const saved = JSON.parse(JSON.stringify(objectivesGetState()));
assert.deepStrictEqual(Object.keys(saved).sort(), ["baseTiles", "done", "victoryShown"]);
objectivesSetState(null);
assert.deepStrictEqual(read("objectivesDone"), {}, "cleared");
objectivesSetState(saved);
assert.deepStrictEqual(read("objectivesDone"), saved.done, "restored");
assert.strictEqual(read("objectivesBaseTiles"), 37, "base tiles restored");
assert.strictEqual(read("objectivesVictoryShown"), false);
assert.ok(!elements.objectiveList.innerHTML.includes("rw-objective--new") ||
          elements.objectiveList.innerHTML.includes("rw-objective--done"), "rendered after load");

// ---------------------------------------------------------------------------
// The intro card
// ---------------------------------------------------------------------------

assert.strictEqual(objectivesMaybeIntro(), true, "intro shows the first time");
assert.strictEqual(elements.introModal.hidden, false);
assert.strictEqual((elements.introSteps.innerHTML.match(/<li>/g) || []).length, 5, "five steps");
closeIntroModal();
assert.strictEqual(store["bottomup.intro.v1"], "1", "remembered in localStorage");
assert.strictEqual(objectivesMaybeIntro(), false, "not shown a second time");
resetIntro();
assert.strictEqual(store["bottomup.intro.v1"], undefined, "reset forgets it");
assert.strictEqual(elements.introModal.hidden, false, "and shows it again");

// ---------------------------------------------------------------------------
// Victory, once
// ---------------------------------------------------------------------------

assert.strictEqual(showVictoryScreen({ turns: 40, tiles: 120, vassals: 3, raidsWon: 7 }), true, "victory shows");
assert.strictEqual(elements.victoryModal.hidden, false);
assert.ok(elements.victoryStats.innerHTML.includes("<b>40</b>") && elements.victoryStats.innerHTML.includes("<b>5</b>"), "turns and year");
assert.ok(elements.victoryStats.innerHTML.includes("<b>120</b>") && elements.victoryStats.innerHTML.includes("<b>3</b>") && elements.victoryStats.innerHTML.includes("<b>7</b>"));
assert.ok(elements.victoryCause.textContent.length > 0, "cause text");
assert.strictEqual(showVictoryScreen(), false, "only once per game");
assert.strictEqual(objectivesGetState().victoryShown, true, "the flag is saved");
closeVictoryScreen();

console.log("objectives.test.js: all assertions passed");
