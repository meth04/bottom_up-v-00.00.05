// ages.js
//
// The shape of the First Age, and the slow reveal of the game's controls.
//
// Sếp's design notes (details.md):
//
//   "starting out it will be super simple. Think two buttons but as they
//    play longer more and more details will appear through resource check
//    points and research"
//
//   "You don't understand the world and you will make mistakes as you
//    learn about it."
//
// So the interface starts almost empty and grows. Nothing here changes the
// rules — every function in game.js still works if you call it — this only
// decides what the player can *see*, and which act of the First Age they
// are living through.
//
// The four acts, in order:
//
//   dawn    People need to eat, the garlocks steal the surplus, so you
//           need barns. It ends when the village survives its first winter.
//   growth  Free expansion: research, schools, the army camp, professions.
//           No single hurdle — "the player should be let to learn and
//           expand freely with new things popping up".
//   raids   The garlocks start coming, to knock the growth back a peg.
//   famine  The timbermellows run out. Farming, standing work orders and
//           the push outward onto the wider map.
//
// Written in the same plain-globals style as game.js.

// ---------------------------------------------------------------------------
// TUNING
// ---------------------------------------------------------------------------

// dawn -> growth: one whole year lived, and a village big enough to plan.
const AGE_GROWTH_TURN = 9;            // turn 9 is the start of the second year
const AGE_GROWTH_POPULATION = 3;

// growth -> raids: the village is worth robbing, and has had room to breathe.
const AGE_RAIDS_MIN_TURNS_IN_GROWTH = 6;
const AGE_RAIDS_POPULATION = 7;
const AGE_RAIDS_TILES = 3;

// raids -> famine. Two ways in: the land genuinely fails, or the village
// has weathered the raids long enough that the story moves on without it.
// Act IV is a beat in the story, not only an accident of the numbers.
const AGE_FAMINE_MIN_TURNS_IN_RAIDS = 8;
const AGE_FAMINE_POPULATION = 8;
const AGE_FAMINE_TILES = 6;
const AGE_FAMINE_PATIENCE = 20;          // turns in Act III before it comes anyway
const AGE_FAMINE_LAND_FRACTION = 0.35;   // of the most food it ever held
const AGE_FAMINE_LAND_FLOOR = 120;       // ...or simply this little left

// Once the famine has begun the land never fully recovers: every autumn a
// little of each tile's carrying capacity is gone for good.
const AGE_FAMINE_MAX_DECAY = 0.06;

const AGE_ORDER = ["dawn", "growth", "raids", "famine"];

const AGE_INFO = {
  dawn: {
    act: "Act I",
    name: "The First Winter",
    blurb: "Two people, one grove. They eat every turn, the garlocks take whatever will not fit in a barn, and the cold is coming.",
  },
  growth: {
    act: "Act II",
    name: "The Growing Years",
    blurb: "You lived. Now there is room to think: tools, a school, an army camp, and people trained to a trade.",
  },
  raids: {
    act: "Act III",
    name: "The Garlock Raids",
    blurb: "Full barns draw attention. The garlocks come again and again now — not to destroy you, but to keep you small.",
  },
  famine: {
    act: "Act IV",
    name: "The Timbermellow Famine",
    blurb: "The grove is failing, and it will not come back as it was. Learn to farm, spread out, and put your people on standing orders.",
  },
};

// ---------------------------------------------------------------------------
// What the player can see, and what earns it
//
// `when` is asked every update(). Once true it stays unlocked. `tabs` and
// `show` name the parts of the interface it reveals.
// ---------------------------------------------------------------------------

const AGE_UNLOCKS = [
  {
    id: "gather_food",
    tabs: ["gather"],
    show: ["btn_find_timbermellow"],
    when: () => true,
  },
  {
    id: "gather_wood",
    show: ["btn_wood"],
    title: "Deadwood",
    note: "There is fallen wood everywhere under the timbermellows. Somebody thinks to pick it up.",
    when: () => ageFoodGathered >= 6,
  },
  {
    id: "build_barn",
    tabs: ["build"],
    show: ["btn_barn"],
    title: "Somewhere to Put It",
    note: "Food left in the open is food the garlocks take. Four wood makes a barn, and a barn holds five.",
    when: () => wood >= 4,
  },
  {
    id: "people",
    tabs: ["people"],
    show: ["btn_human"],
    title: "More Hands",
    note: "With food put by, the village can raise another pair of hands — and another mouth.",
    when: () => barn >= 2 || timbermellow_count >= 6,
  },
  {
    id: "bulk_five",
    show: ["btn_timbermellow_5x", "btn_wood_5x", "btn_stone_5x", "btn_human_5x", "btn_soldier_5x"],
    title: "A Day's Work at Once",
    note: "There are enough hands now that a whole morning can be spent on one job. The ×5 buttons do five hours in one press.",
    when: () => humans >= 3,
  },
  {
    id: "gather_stone",
    show: ["btn_stone"],
    title: "Loose Stone",
    note: "Stone is lying about for the taking. Unlike wood, it never grows back — what you dig out is gone.",
    when: () => humans >= 3,
  },
  {
    id: "soldiers",
    show: ["btn_soldier"],
    title: "Someone Who Watches",
    note: "One villager can stop working and stand guard instead. Soldiers do no work, but nothing leaves the village without them.",
    when: () => humans >= 3,
  },
  {
    id: "build_house",
    show: ["btn_house"],
    title: "A Roof Before the Frost",
    note: "Two stone raises a house, and a house shelters three. Anyone without a roof dies in winter.",
    when: () => stone >= 2,
  },
  {
    id: "villages_panel",
    tabs: ["villages"],
    title: "You Are Not Alone",
    note: "Smoke on the horizon. Other villages share this island, and one of them is not a village at all.",
    when: () => ageSeenAnotherVillage(),
  },
  {
    id: "research",
    tabs: ["research"],
    title: "Ideas",
    note: "The village is big enough that people have time to think. Ideas will start arriving on their own.",
    when: () => ageAtLeast("growth"),
  },
  {
    id: "training_buildings",
    show: ["btn_school", "btn_armycamp"],
    title: "Schools and Camps",
    note: "Raise a school or an army camp and you can pull a villager off the work rota to learn a trade properly.",
    when: () => ageAtLeast("growth"),
  },
  {
    id: "professions",
    show: ["professionRack"],
    title: "A Trade",
    note: "Training takes a villager out of the workforce for a turn or two — they still eat — and gives them back better at one job.",
    when: () => school >= 1 || armycamp >= 1,
  },
  {
    id: "jobs",
    show: ["jobRack"],
    title: "Standing Orders",
    note: "You have too many people to click for one at a time. Put villagers on a standing job and they will work it every turn without being told.",
    when: () => ageAtLeast("famine"),
  },
];

// Every tab the interface has. Anything not unlocked is hidden outright.
const AGE_ALL_TABS = ["gather", "build", "people", "research", "villages", "log", "menu"];
const AGE_ALWAYS_TABS = ["log", "menu"];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let agePhase = "dawn";
let ageEnteredTurn = 1;
let ageUnlocked = {};
let ageFlags = {};
let ageFoodGathered = 0;       // total timbermellows ever gathered
let agePeakLandFood = 0;       // the most food the village's land ever held
let ageFamineActive = false;

function ageIndex(phase) {
  return AGE_ORDER.indexOf(phase || agePhase);
}

function ageAtLeast(phase) {
  return ageIndex(agePhase) >= ageIndex(phase);
}

function ageHas(id) {
  return !!ageUnlocked[id];
}

function ageSeenAnotherVillage() {
  if (typeof hexMap === "undefined" || !hexMap || typeof villagesGet !== "function") return false;
  return villagesGet().some((village) => village.kind !== "player" && hexMap.isRevealed(village.homeTileId));
}

// How much food is still standing on the land the village holds.
function ageLandFood() {
  if (typeof territoryAvailable !== "function") return 0;
  return territoryAvailable(territoryFoodTypes());
}

// ---------------------------------------------------------------------------
// The acts
// ---------------------------------------------------------------------------

// Whether the village has earned its way into the next act.
function ageNextPhase() {
  const population = humans + human_army + professionTraineeCount();
  const turnsHere = turngame - ageEnteredTurn;

  if (agePhase === "dawn") {
    if (turngame >= AGE_GROWTH_TURN && population >= AGE_GROWTH_POPULATION) return "growth";
    return null;
  }
  if (agePhase === "growth") {
    if (turnsHere < AGE_RAIDS_MIN_TURNS_IN_GROWTH) return null;
    const tiles = typeof territoryClaimedCount === "function" ? territoryClaimedCount() : 1;
    if (population >= AGE_RAIDS_POPULATION || tiles >= AGE_RAIDS_TILES) return "raids";
    return null;
  }
  if (agePhase === "raids") {
    const landFood = ageLandFood();
    // The land actually failing gets you there early, whatever else is true.
    if (landFood <= AGE_FAMINE_LAND_FLOOR) return "famine";
    if (agePeakLandFood > 0 && landFood <= agePeakLandFood * AGE_FAMINE_LAND_FRACTION) return "famine";

    if (turnsHere < AGE_FAMINE_MIN_TURNS_IN_RAIDS) return null;
    const tiles = typeof territoryClaimedCount === "function" ? territoryClaimedCount() : 1;
    if (population >= AGE_FAMINE_POPULATION || tiles >= AGE_FAMINE_TILES) return "famine";
    if (turnsHere >= AGE_FAMINE_PATIENCE) return "famine";
    return null;
  }
  return null;
}

function ageEnterPhase(phase) {
  agePhase = phase;
  ageEnteredTurn = turngame;
  const info = AGE_INFO[phase];

  updatelog(`${info.act} — ${info.name}. ${info.blurb}`, phase === "growth" ? "good" : "bad");
  if (typeof showMilestonePopup === "function") {
    showMilestonePopup(`${info.act}: ${info.name}`, info.blurb, phase === "raids" ? "seize" : phase === "famine" ? "timbermellow" : "tech");
  }

  if (phase === "growth") {
    updatelog("Build a school, or an army camp, and start training people to a trade.", "good");
  }
  if (phase === "raids") {
    updatelog("The garlocks will come on a schedule now. Keep soldiers standing, and keep your barns spread out.", "bad");
    garlockScheduleNextRaid();
  }
  if (phase === "famine") {
    ageFamineActive = true;
    ageBeginFamine();
  }
  ageRefreshUnlocks(true);
}

// The moment the grove fails. A third of what is still standing withers, and
// from now on every autumn the land comes back a little smaller than before.
function ageBeginFamine() {
  const lost = typeof territoryWither === "function" ? territoryWither(0.34) : 0;
  updatelog(`The timbermellows are failing — ${lost} rotted on the branch this season, and the grove will not come back as it was.`, "bad");
  updatelog("Learn farming. Take more land. Put your people on standing orders and stop clicking for every hour.", "bad");

  // The idea arrives with the hunger, whether or not the village had earned it.
  if (typeof farming_unlocked !== "undefined" && !farming_unlocked && farming_made === 0) {
    farming_unlocked = true;
    const button = document.getElementById("farmingbt");
    if (button) button.style.display = "block";
    updatelog("New technology unlocked: farming!", "good");
  }
}

// ---------------------------------------------------------------------------
// Revealing the interface
// ---------------------------------------------------------------------------

// Checks every locked feature; announces the ones that have just been earned.
function ageRefreshUnlocks(quiet) {
  for (const unlock of AGE_UNLOCKS) {
    if (ageUnlocked[unlock.id]) continue;
    let earned = false;
    try {
      earned = !!unlock.when();
    } catch (error) {
      earned = false;                      // a global that doesn't exist yet
    }
    if (!earned) continue;
    ageUnlocked[unlock.id] = true;
    if (!quiet && unlock.title) {
      updatelog(`${unlock.title} — ${unlock.note}`, "good");
      if (typeof uiNudgeTab === "function" && unlock.tabs) uiNudgeTab(unlock.tabs[0]);
    }
  }
  ageApplyVisibility();
}

// Hides everything that has not been earned yet.
function ageApplyVisibility() {
  const shownTabs = new Set(AGE_ALWAYS_TABS);
  const shownIds = new Set();
  for (const unlock of AGE_UNLOCKS) {
    if (!ageUnlocked[unlock.id]) continue;
    for (const tab of unlock.tabs || []) shownTabs.add(tab);
    for (const id of unlock.show || []) shownIds.add(id);
  }

  for (const tab of AGE_ALL_TABS) {
    const element = document.querySelector(`.rw-tab[data-tab="${tab}"]`);
    if (element) element.hidden = !shownTabs.has(tab);
  }

  for (const unlock of AGE_UNLOCKS) {
    for (const id of unlock.show || []) {
      const element = document.getElementById(id);
      if (!element) continue;
      const visible = shownIds.has(id);
      element.hidden = !visible;
      // ×5 buttons sit in a wrapper next to their gizmo; hide the gap too.
      if (element.parentElement && element.parentElement.classList.contains("rw-gizmowrap")) {
        element.parentElement.hidden = element.parentElement.querySelectorAll(":scope > :not([hidden])").length === 0;
      }
    }
  }

  // The palette must never be left showing a tab that has just been hidden.
  if (typeof uiOpenTab !== "undefined" && uiOpenTab && !shownTabs.has(uiOpenTab)) {
    if (typeof uiSetTab === "function") uiSetTab("gather");
  }
}

// game.js calls this at the end of every update().
function ageRefresh() {
  const landFood = ageLandFood();
  if (landFood > agePeakLandFood) agePeakLandFood = landFood;

  const next = ageNextPhase();
  if (next) ageEnterPhase(next);

  ageRefreshUnlocks(false);
  ageRenderBanner();
}

// The little "Act II — The Growing Years" line above the clock.
function ageRenderBanner() {
  const host = document.getElementById("agePhase");
  if (!host) return;
  const info = AGE_INFO[agePhase];
  host.textContent = `${info.act} · ${info.name}`;
  host.className = `rw-agephase rw-agephase--${agePhase}`;
  host.dataset.tipTitle = `${info.act} — ${info.name}`;
  host.dataset.tip = info.blurb;
}

// game.js calls this whenever food is gathered, so the first checkpoints can
// fire off how much work the village has actually done.
function ageCountFood(amount) {
  ageFoodGathered += Math.max(0, amount || 0);
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

function ageGetState() {
  return {
    agePhase, ageEnteredTurn, ageUnlocked, ageFlags,
    ageFoodGathered, agePeakLandFood, ageFamineActive,
  };
}

function ageSetState(saved) {
  if (!saved) return;
  agePhase = saved.agePhase || "dawn";
  ageEnteredTurn = saved.ageEnteredTurn || 1;
  ageUnlocked = saved.ageUnlocked || {};
  ageFlags = saved.ageFlags || {};
  ageFoodGathered = saved.ageFoodGathered || 0;
  agePeakLandFood = saved.agePeakLandFood || 0;
  ageFamineActive = !!saved.ageFamineActive;
  ageApplyVisibility();
  ageRenderBanner();
}
