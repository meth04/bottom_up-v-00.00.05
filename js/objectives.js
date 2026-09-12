// objectives.js
//
// The answer to "I don't know what to do, or what the goal is."
//
// Three things live here:
//
//   1. The objective checklist — a short chain of concrete goals ("gather 5
//      timbermellows", "build a barn", "survive the first winter" ... "rule
//      the continent"). The panel on the right shows the next three, plus
//      the last one ticked off so progress is visible. Clicking one walks
//      the player to the button that does it. Each pays a small reward.
//   2. Onboarding — the five-step "How to play" card shown once, right
//      after Begin Journey, and remembered per browser.
//   3. Victory — the screen shown when every village on the continent has
//      bent the knee (js/raids.js decides when; this only draws it).
//
// Nothing here changes the rules. Every check reads game.js's globals and
// the other rule files; a global that does not exist yet just means "not
// yet". Written in the same plain-globals style as ages.js.
//
// game.js calls objectivesRefresh() at the end of update(). The rest is
// called by the shell: objectivesMaybeIntro() after the title screen,
// showVictoryScreen() from the raid rules, objectivesGetState/SetState from
// save.js.

// ---------------------------------------------------------------------------
// TUNING
// ---------------------------------------------------------------------------

const OBJECTIVES_SHOWN = 3;                    // pending rows in the panel
const OBJECTIVES_INTRO_STORE = "bottomup.intro.v1";

// Which act each objective belongs to, as an index into ages.js's AGE_ORDER:
//   0 dawn · 1 growth · 2 raids · 3 famine
// An objective is only shown (and only checked) once its act has begun.

// ---------------------------------------------------------------------------
// Small readers, all tolerant of a rule file that is not loaded
// ---------------------------------------------------------------------------

function objectivesTiles() {
  return typeof territoryClaimedCount === "function" ? territoryClaimedCount() : 0;
}

function objectivesTrades() {
  if (typeof professionCounts === "undefined" || !professionCounts) return 0;
  return (professionCounts.farmer || 0) + (professionCounts.forester || 0) + (professionCounts.mason || 0);
}

function objectivesStandingOrders() {
  if (typeof jobAssignedTotal === "function") return jobAssignedTotal();
  if (typeof jobAssignments === "undefined" || !jobAssignments) return 0;
  return Object.values(jobAssignments).reduce((sum, count) => sum + (count || 0), 0);
}

// js/raids.js keeps: raidLog as [{ turn, villageId, name, incoming, won,
// loot, lost, text }], raidWins and raidVassals as villageId-keyed objects,
// raidsOutgoing as the raids still marching. Everything is read through a
// typeof guard so this file works before (or without) that one.
function objectivesRaidEntries() {
  return typeof raidLog !== "undefined" && Array.isArray(raidLog) ? raidLog.filter(Boolean) : [];
}

function objectivesCountOf(value) {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "object") return Object.keys(value).length;
  return Number(value) || 0;
}

function objectivesSumOf(value) {
  if (value == null) return 0;
  if (typeof value === "object") return Object.values(value).reduce((sum, n) => sum + (Number(n) || 0), 0);
  return Number(value) || 0;
}

// Raids the player has launched: resolved ones in the log, plus any still
// on the road — pressing Raid is the objective, not getting there.
function objectivesRaidsSent() {
  const resolved = objectivesRaidEntries().filter((entry) => entry.incoming === false).length;
  const marching = typeof raidsOutgoing !== "undefined" ? objectivesCountOf(raidsOutgoing) : 0;
  return resolved + marching;
}

function objectivesRaidsWon() {
  if (typeof raidWins !== "undefined" && raidWins != null) return objectivesSumOf(raidWins);
  return objectivesRaidEntries().filter((entry) => entry.incoming === false && entry.won === true).length;
}

function objectivesVassals() {
  if (typeof raidVassals !== "undefined" && raidVassals != null) return objectivesCountOf(raidVassals);
  const report = objectivesContinent();
  return report ? report.vassals : 0;
}

// A raid on the village that broke on the shield line: a neighbour's, from
// the raid log, or the garlocks', from the numbers game.js leaves behind.
function objectivesRepelled() {
  if (objectivesRaidEntries().some((entry) => entry.incoming === true && entry.won === true)) return true;
  if (typeof garlock_attacked_turn === "undefined" || typeof garlock_defense === "undefined" || typeof garlock_strangth === "undefined") return false;
  return garlock_attacked_turn > 0 && garlock_strangth > 0 && garlock_defense >= garlock_strangth;
}

function objectivesContinent() {
  if (typeof raidsContinentReport !== "function") return null;
  const report = raidsContinentReport();
  if (!report) return null;
  return {
    total: objectivesCountOf(report.total),
    vassals: objectivesCountOf(report.vassals),
    remaining: objectivesCountOf(report.remaining),
  };
}

// Walks the player to a button (js/ui.js); silently does nothing in tests.
function objectivesPoint(tab, elementId) {
  if (typeof uiPointAt === "function") uiPointAt(tab, elementId);
}

// The End Turn button has no id, so it is flashed by its class.
function objectivesFlashEndTurn() {
  if (typeof uiSetTab === "function") uiSetTab(null);
  const target = document.querySelector ? document.querySelector(".rw-endturn") : null;
  if (!target || !target.classList) return;
  target.classList.remove("rw-flash");
  void target.offsetWidth;
  target.classList.add("rw-flash");
  setTimeout(() => target.classList.remove("rw-flash"), 2200);
}

function objectivesPointAtMap(elementId) {
  if (typeof uiSetTab === "function") uiSetTab(null);
  if (typeof focusVillage === "function") focusVillage();
  objectivesPoint(null, elementId);
}

function objectivesPointAtFrontier() {
  if (typeof uiSetTab === "function") uiSetTab(null);
  if (typeof selectBestFrontier === "function") selectBestFrontier();
  objectivesPoint(null, "exploreButton");
}

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------

const OBJECTIVES = [
  // --- Act I: the first winter -------------------------------------------
  {
    id: "gather_5",
    act: 0,
    title: "Gather 5 timbermellows",
    hint: "Press Gather in the bottom-right; each press is one hour of work.",
    check: () => ageFoodGathered >= 5,
    progress: () => ({ have: Math.min(5, ageFoodGathered), need: 5 }),
    reward: { wood: 2 },
    go: () => objectivesPoint("gather", "btn_find_timbermellow"),
  },
  {
    id: "wood_4",
    act: 0,
    title: "Pick up 4 wood",
    hint: "The Wood button sits beside Gather once someone has thought of it.",
    check: () => wood >= 4 || barn >= 2,
    progress: () => ({ have: Math.min(4, wood), need: 4 }),
    reward: { food: 3 },
    go: () => objectivesPoint("gather", "btn_wood"),
  },
  {
    id: "barn_2",
    act: 0,
    title: "Build a barn",
    hint: "Open Build and press Barn — 4 wood, and food over your barn space is stolen at the end of the turn.",
    check: () => barn >= 2,
    progress: () => ({ have: Math.min(1, Math.max(0, barn - 1)), need: 1 }),
    reward: { food: 5 },
    go: () => objectivesPoint("build", "btn_barn"),
  },
  {
    id: "end_turn",
    act: 0,
    title: "End a turn",
    hint: "When your hours are spent press End turn (or Space); everyone eats one food.",
    check: () => turngame >= 2,
    progress: null,
    reward: { wood: 2 },
    go: () => objectivesFlashEndTurn(),
  },
  {
    id: "villager_3",
    act: 0,
    title: "Raise a third villager",
    hint: "Open People and press Raise — 3 food, and one more mouth every turn.",
    check: () => humans + human_army >= 3,
    progress: () => ({ have: Math.min(3, humans + human_army), need: 3 }),
    reward: { food: 4 },
    go: () => objectivesPoint("people", "btn_human"),
  },
  {
    id: "food_20",
    act: 0,
    title: "Store 20 food before winter",
    hint: "Nothing grows in winter; fill the barns in autumn so nobody starves.",
    check: () => timbermellow_count >= 20,
    progress: () => ({ have: Math.min(20, timbermellow_count), need: 20 }),
    reward: { wood: 4 },
    go: () => objectivesPoint("gather", "btn_find_timbermellow"),
  },
  {
    id: "house_2",
    act: 0,
    title: "Build a house",
    hint: "Gather 2 stone, then Build → House; anyone without a roof dies in winter.",
    check: () => stonehouse >= 2,
    progress: () => ({ have: Math.min(2, stone), need: 2 }),
    reward: { stone: 3 },
    go: () => objectivesPoint(stone >= 2 ? "build" : "gather", stone >= 2 ? "btn_house" : "btn_stone"),
  },
  {
    id: "first_winter",
    act: 0,
    title: "Survive the first winter",
    hint: "Reach turn 9 with at least two people still alive.",
    check: () => turngame >= 9 && humans >= 2,
    progress: () => ({ have: Math.min(9, turngame), need: 9 }),
    reward: { food: 6 },
    go: () => objectivesPoint("gather", "btn_find_timbermellow"),
  },

  // --- Act II: the growing years -----------------------------------------
  {
    id: "soldier_1",
    act: 1,
    title: "Train a soldier",
    hint: "People → Soldier turns a villager into a guard; expeditions and raids need one.",
    check: () => human_army >= 1,
    progress: () => ({ have: Math.min(1, human_army), need: 1 }),
    reward: { food: 4 },
    go: () => objectivesPoint("people", "btn_soldier"),
  },
  {
    id: "explore_1",
    act: 1,
    title: "Explore a new tile",
    hint: "Click a dashed hex next to your land and press Explore in the bottom-left.",
    check: () => objectivesTiles() > objectivesBaseTiles,
    progress: null,
    reward: { food: 5 },
    go: () => objectivesPointAtFrontier(),
  },
  {
    id: "school_1",
    act: 1,
    title: "Build a school",
    hint: "Build → School (8 wood, 6 stone) lets you train farmers, foresters and masons.",
    check: () => school >= 1,
    progress: () => ({ have: Math.min(1, school), need: 1 }),
    reward: { food: 5 },
    go: () => objectivesPoint("build", "btn_school"),
  },
  {
    id: "trade_1",
    act: 1,
    title: "Train a farmer, forester or mason",
    hint: "People → Trades takes a villager off the rota for a turn or two and gives them back better.",
    check: () => objectivesTrades() >= 1,
    progress: () => ({ have: Math.min(1, objectivesTrades()), need: 1 }),
    reward: { wood: 5 },
    go: () => objectivesPoint("people", school >= 1 || armycamp >= 1 ? "professionRack" : "btn_school"),
  },
  {
    id: "hexes_60",
    act: 1,
    title: "Hold 60 hexes",
    hint: "Keep exploring: each expedition claims the tile and the ring around it.",
    check: () => objectivesTiles() >= 60,
    progress: () => ({ have: Math.min(60, objectivesTiles()), need: 60 }),
    reward: { food: 8 },
    milestone: "The valley is yours from ridge to ridge. Sixty hexes fly your colours.",
    go: () => objectivesPointAtFrontier(),
  },
  {
    id: "armycamp_1",
    act: 1,
    title: "Build an army camp",
    hint: "Build → Army camp (10 wood, 8 stone) trains scouts and captains and adds to your defence.",
    check: () => armycamp >= 1,
    progress: () => ({ have: Math.min(1, armycamp), need: 1 }),
    reward: { stone: 4 },
    go: () => objectivesPoint("build", "btn_armycamp"),
  },
  {
    id: "soldier_4",
    act: 1,
    title: "Keep 4 soldiers standing",
    hint: "People → Soldier; every soldier is worth 3 defence when the garlocks come.",
    check: () => human_army >= 4,
    progress: () => ({ have: Math.min(4, human_army), need: 4 }),
    reward: { food: 6 },
    go: () => objectivesPoint("people", "btn_soldier"),
  },
  {
    id: "stoneaxe",
    act: 1,
    title: "Research the stone axe",
    hint: "Open Research and press Stone axe; wood comes in twice as fast afterwards.",
    check: () => stoneaxe_made >= 1,
    progress: () => ({ have: Math.min(1, stoneaxe_made), need: 1 }),
    reward: { wood: 6 },
    go: () => objectivesPoint("research", "stoneaxebt"),
  },
  {
    id: "palisade_1",
    act: 1,
    title: "Raise a palisade",
    hint: "Build → Palisade once a soldier is standing; a ring of stakes adds 3 to your defence.",
    check: () => typeof palisade !== "undefined" && palisade >= 1,
    progress: () => ({ have: typeof palisade !== "undefined" ? Math.min(1, palisade) : 0, need: 1 }),
    reward: { wood: 4 },
    go: () => objectivesPoint("build", "btn_palisade"),
  },

  // --- Act III: the garlock raids ----------------------------------------
  {
    id: "raid_1",
    act: 2,
    title: "Raid a neighbour",
    hint: "Click any hex of another village and press Raid in the bottom-left; two soldiers go.",
    check: () => objectivesRaidsSent() >= 1,
    progress: null,
    reward: { food: 5 },
    go: () => objectivesPointAtMap("raidButton"),
  },
  {
    id: "raid_win",
    act: 2,
    title: "Win a raid",
    hint: "Send more soldiers than the village can muster and you carry off its stores.",
    check: () => objectivesRaidsWon() >= 1,
    progress: () => ({ have: Math.min(1, objectivesRaidsWon()), need: 1 }),
    reward: { stone: 5 },
    go: () => objectivesPointAtMap("raidButton"),
  },
  {
    id: "repel_1",
    act: 2,
    title: "Repel a raid",
    hint: "Have the shield line standing before the scouts are seen — soldiers, palisades, a watchtower.",
    check: () => objectivesRepelled(),
    progress: null,
    reward: { food: 8 },
    go: () => objectivesPoint("people", "btn_soldier"),
  },
  {
    id: "vassal_1",
    act: 2,
    title: "Make a village your vassal",
    hint: "Beat a neighbour enough times and it bends the knee, paying tribute every turn.",
    check: () => objectivesVassals() >= 1,
    progress: () => ({ have: Math.min(1, objectivesVassals()), need: 1 }),
    reward: { food: 10 },
    milestone: "A neighbour has bent the knee. Their tribute is yours; so is their grudge.",
    go: () => objectivesPointAtMap("raidButton"),
  },

  // --- Act IV: the famine ------------------------------------------------
  {
    id: "farming",
    act: 3,
    title: "Learn farming",
    hint: "Open Research and press Farming; the grove will not feed you forever.",
    check: () => farming_made >= 1,
    progress: () => ({ have: Math.min(1, farming_made), need: 1 }),
    reward: { food: 8 },
    go: () => objectivesPoint("research", "farmingbt"),
  },
  {
    id: "orders_3",
    act: 3,
    title: "Put 3 villagers on standing orders",
    hint: "People → Standing orders; they work their job every turn without being clicked.",
    check: () => objectivesStandingOrders() >= 3,
    progress: () => ({ have: Math.min(3, objectivesStandingOrders()), need: 3 }),
    reward: { wood: 6 },
    go: () => objectivesPoint("people", "jobRack"),
  },
  {
    id: "continent",
    act: 3,
    title: "Rule the continent",
    hint: "Make every village on your continent a vassal — that is the goal of the First Age.",
    check: () => {
      const report = objectivesContinent();
      return !!report && report.total > 0 && report.remaining === 0;
    },
    progress: () => {
      const report = objectivesContinent();
      if (!report || report.total <= 0) return null;
      return { have: report.total - report.remaining, need: report.total };
    },
    reward: null,
    milestone: "Every village on the continent answers to you. The First Age is won.",
    go: () => objectivesPointAtMap("raidButton"),
  },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let objectivesDone = {};            // id -> turn it was completed on
let objectivesSeen = {};            // id -> true once it has been drawn (for the flash)
let objectivesBaseTiles = 0;        // hexes held before the first expedition
let objectivesVictoryShown = false; // the victory screen is shown once per game
let objectivesPanelKey = "";        // so the panel is only rebuilt when it changed

function objectivesActReached(act) {
  if (typeof ageAtLeast !== "function" || typeof AGE_ORDER === "undefined") return act === 0;
  return ageAtLeast(AGE_ORDER[act]);
}

function objectivesById(id) {
  return OBJECTIVES.find((objective) => objective.id === id) || null;
}

// The objectives the player can see right now: not done, act begun.
function objectivesPending() {
  return OBJECTIVES.filter((objective) => !objectivesDone[objective.id] && objectivesActReached(objective.act));
}

// The first unfinished objective — what the tool hint and the tutor point at.
function objectivesNext() {
  return objectivesPending()[0] || null;
}

function objectivesDoneCount() {
  return OBJECTIVES.filter((objective) => objectivesDone[objective.id]).length;
}

// The most recently completed objective, to keep it showing greyed-out.
function objectivesLastDone() {
  let best = null;
  OBJECTIVES.forEach((objective, index) => {
    const turn = objectivesDone[objective.id];
    if (!turn) return;
    if (!best || turn > best.turn || (turn === best.turn && index > best.index)) {
      best = { objective, turn, index };
    }
  });
  return best ? best.objective : null;
}

// ---------------------------------------------------------------------------
// Checking, and paying out
// ---------------------------------------------------------------------------

function objectivesSafe(fn, fallback) {
  try {
    return fn();
  } catch (error) {
    return fallback;                 // a global that does not exist yet
  }
}

function objectivesRewardText(reward) {
  if (!reward) return "";
  const parts = [];
  if (reward.food) parts.push(`+${reward.food} food`);
  if (reward.wood) parts.push(`+${reward.wood} wood`);
  if (reward.stone) parts.push(`+${reward.stone} stone`);
  return parts.join(", ");
}

function objectivesGrant(reward) {
  if (!reward) return;
  if (reward.food && typeof timbermellow_count !== "undefined") timbermellow_count += reward.food;
  if (reward.wood && typeof wood !== "undefined") wood += reward.wood;
  if (reward.stone && typeof stone !== "undefined") stone += reward.stone;
  if (typeof spawnFloatingReward === "function") {
    if (reward.food) spawnFloatingReward(`+${reward.food}`, "timbermellow");
    if (reward.wood) spawnFloatingReward(`+${reward.wood}`, "wood");
    if (reward.stone) spawnFloatingReward(`+${reward.stone}`, "stone");
  }
}

function objectivesComplete(objective) {
  objectivesDone[objective.id] = typeof turngame !== "undefined" ? turngame : 1;
  objectivesGrant(objective.reward);
  const rewardText = objectivesRewardText(objective.reward);
  if (typeof updatelog === "function") {
    updatelog(`Objective complete — ${objective.title}${rewardText ? ` (${rewardText})` : ""}.`, "good");
  }
  if (objective.milestone && typeof showMilestonePopup === "function") {
    showMilestonePopup(objective.title, objective.milestone, objective.id === "continent" ? "seize" : "tech");
  }
}

// The first expedition is measured against what the village started with,
// because a coastal valley is founded on fewer hexes than an inland one.
function objectivesNoteBaseTiles() {
  if (objectivesBaseTiles > 0) return;
  const tiles = objectivesSafe(objectivesTiles, 0);
  if (tiles > 0) objectivesBaseTiles = tiles;
}

// game.js calls this at the end of every update().
function objectivesRefresh() {
  objectivesNoteBaseTiles();
  for (const objective of OBJECTIVES) {
    if (objectivesDone[objective.id]) continue;
    if (!objectivesActReached(objective.act)) continue;
    if (!objectivesSafe(() => !!objective.check(), false)) continue;
    objectivesComplete(objective);
  }
  objectivesRender();
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

function objectivesEscape(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function objectivesRowHtml(objective, done, fresh) {
  const progress = done ? null : objectivesSafe(() => (objective.progress ? objective.progress() : null), null);
  const classes = ["rw-objective"];
  if (done) classes.push("rw-objective--done");
  if (fresh) classes.push("rw-objective--new");
  const share = progress && progress.need > 0 ? Math.max(0, Math.min(1, progress.have / progress.need)) : 0;
  const progressText = progress ? `${progress.have}/${progress.need}` : "";
  const bar = progress ? `<span class="rw-objective__bar"><i style="width:${Math.round(share * 100)}%"></i></span>` : "";
  const reward = objectivesRewardText(objective.reward);
  return `<li><button class="${classes.join(" ")}" onclick="objectivesGo('${objective.id}')"` +
         ` data-tip-title="${objectivesEscape(objective.title)}"` +
         ` data-tip="${objectivesEscape(objective.hint)}"` +
         ` data-tip-cost="${objectivesEscape(done ? "Done." : reward ? `Reward: ${reward}. Click to be shown where.` : "Click to be shown where.")}">` +
         `<span class="rw-objective__mark">${done ? "✓" : "○"}</span>` +
         `<span class="rw-objective__title">${objectivesEscape(objective.title)}` +
         `<span class="rw-objective__hint">${objectivesEscape(objective.hint)}</span></span>` +
         `<span class="rw-objective__progress">${progressText}</span>${bar}</button></li>`;
}

function objectivesRender() {
  const panel = document.getElementById("objectivePanel");
  const list = document.getElementById("objectiveList");
  if (!panel || !list) return;

  const pending = objectivesPending().slice(0, OBJECTIVES_SHOWN);
  const last = objectivesLastDone();
  if (!pending.length && !last) {
    panel.hidden = true;
    return;
  }

  // Only touch the DOM when what it says has changed — rebuilding on every
  // click kills the hover state and the "new" flash. The key deliberately
  // leaves the flash out so the class survives until the content moves on.
  const rows = [];
  if (last) rows.push({ objective: last, done: true });
  for (const objective of pending) rows.push({ objective, done: false });
  const key = rows.map((row) => objectivesRowHtml(row.objective, row.done, false)).join("");
  if (key === objectivesPanelKey) return;
  objectivesPanelKey = key;

  list.innerHTML = rows.map((row) => {
    const fresh = !row.done && !objectivesSeen[row.objective.id];
    return objectivesRowHtml(row.objective, row.done, fresh);
  }).join("");
  for (const row of rows) objectivesSeen[row.objective.id] = true;

  const count = document.getElementById("objectiveCount");
  if (count) count.textContent = `${objectivesDoneCount()}/${OBJECTIVES.length}`;
  panel.hidden = false;
}

// The panel's buttons call this.
function objectivesGo(id) {
  const objective = objectivesById(id);
  if (!objective || typeof objective.go !== "function") return;
  objectivesSafe(objective.go, undefined);
}

// One "Next: ..." line for the alert list (js/ui.js may splice it in).
function objectivesAlerts() {
  const next = objectivesNext();
  if (!next) return [];
  return [{
    level: "info",
    icon: typeof getIcon === "function" ? getIcon("tech") : "◎",
    text: `Next: ${next.title}`,
    tip: next.hint,
    go: () => objectivesGo(next.id),
  }];
}

// ---------------------------------------------------------------------------
// Onboarding — the "How to play" card
// ---------------------------------------------------------------------------

const OBJECTIVES_INTRO_STEPS = [
  "<b>Gather.</b> The buttons in the bottom-right corner spend work hours. Everyone eats 1 food when the turn ends, so gather first.",
  "<b>Build.</b> A barn, or the surplus is stolen in the night; a house, or people freeze in winter.",
  "<b>Explore.</b> Click a dashed hex next to your land and press Explore. More land means more to gather.",
  "<b>Soldiers.</b> Train them to defend against garlock raids and to raid the neighbours — select a neighbour's hex and press Raid.",
  "<b>The goal.</b> Make every village on your continent your vassal. Roads make your land yield more, and carts bring the goods home.",
];

function objectivesOpenModal(modal) {
  modal.hidden = false;
  const open = () => modal.classList.add("is-open");
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(open); else open();
}

function objectivesCloseModal(modal) {
  modal.classList.remove("is-open");
  if (typeof setTimeout === "function") setTimeout(() => { modal.hidden = true; }, 300); else modal.hidden = true;
}

function objectivesIntroSeen() {
  try {
    return localStorage.getItem(OBJECTIVES_INTRO_STORE) === "1";
  } catch (error) {
    return false;                    // private windows: show it every time
  }
}

function showIntroModal() {
  const modal = document.getElementById("introModal");
  if (!modal) return;
  const steps = document.getElementById("introSteps");
  if (steps) steps.innerHTML = OBJECTIVES_INTRO_STEPS.map((step) => `<li>${step}</li>`).join("");
  objectivesOpenModal(modal);
}

function closeIntroModal() {
  const modal = document.getElementById("introModal");
  if (modal) objectivesCloseModal(modal);
  try {
    localStorage.setItem(OBJECTIVES_INTRO_STORE, "1");
  } catch (error) {
    // nowhere to remember it; it will show again next time
  }
}

// The shell calls this after Begin Journey; the card shows once per browser.
function objectivesMaybeIntro() {
  if (objectivesIntroSeen()) return false;
  showIntroModal();
  return true;
}

// For the settings menu: forget that the card was seen, and show it now.
function resetIntro() {
  try {
    localStorage.removeItem(OBJECTIVES_INTRO_STORE);
  } catch (error) {
    // nothing to forget
  }
  showIntroModal();
}

// ---------------------------------------------------------------------------
// Victory
// ---------------------------------------------------------------------------

// stats: { cause?, turns?, year?, tiles? (or hexes?), vassals?, raidsWon? } —
// anything missing is read from the globals. Shown once per game; the flag
// is saved with the rest of the state.
function showVictoryScreen(stats) {
  if (objectivesVictoryShown) return false;
  const modal = document.getElementById("victoryModal");
  if (!modal) return false;
  objectivesVictoryShown = true;
  stats = stats || {};

  const turns = stats.turns != null ? stats.turns : (typeof turngame !== "undefined" ? turngame : 1);
  const year = stats.year != null ? stats.year : Math.floor((turns - 1) / 8) + 1;
  const hexes = stats.tiles != null ? stats.tiles : stats.hexes != null ? stats.hexes : objectivesSafe(objectivesTiles, 0);
  const vassals = stats.vassals != null ? stats.vassals : objectivesSafe(objectivesVassals, 0);
  const raidsWon = stats.raidsWon != null ? stats.raidsWon : objectivesSafe(objectivesRaidsWon, 0);

  const causeEl = document.getElementById("victoryCause");
  if (causeEl) {
    causeEl.textContent = stats.cause ||
      "Every village on the continent has bent the knee. Their tribute flows to your barns, and the First Age is yours.";
  }
  const statsEl = document.getElementById("victoryStats");
  if (statsEl) {
    statsEl.innerHTML =
      `<div class="summary-stat"><b>${turns}</b><small>Turns</small></div>` +
      `<div class="summary-stat"><b>${year}</b><small>Year</small></div>` +
      `<div class="summary-stat"><b>${hexes}</b><small>Hexes Held</small></div>` +
      `<div class="summary-stat"><b>${vassals}</b><small>Vassals</small></div>` +
      `<div class="summary-stat"><b>${raidsWon}</b><small>Raids Won</small></div>`;
  }
  if (typeof updatelog === "function") {
    updatelog("The continent is yours. Every village answers to you now — the First Age is won.", "good");
  }
  objectivesOpenModal(modal);
  return true;
}

function closeVictoryScreen() {
  const modal = document.getElementById("victoryModal");
  if (modal) objectivesCloseModal(modal);
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

function objectivesGetState() {
  return {
    done: Object.assign({}, objectivesDone),
    baseTiles: objectivesBaseTiles,
    victoryShown: objectivesVictoryShown,
  };
}

function objectivesSetState(saved) {
  objectivesDone = saved && saved.done ? Object.assign({}, saved.done) : {};
  objectivesBaseTiles = saved && saved.baseTiles ? saved.baseTiles : 0;
  objectivesVictoryShown = !!(saved && saved.victoryShown);
  // Everything already done has been seen; nothing loaded should flash.
  objectivesSeen = {};
  for (const id of Object.keys(objectivesDone)) objectivesSeen[id] = true;
  objectivesPanelKey = "";
  objectivesRender();
}
