// professions.js
//
// Schools, the army camp, the trades people learn in them, and the standing
// work orders that eventually stop you clicking for every single hour.
//
// Sếp's design notes (details.md):
//
//   "This is the age where schools and army camps become available. Where
//    you take a person off the work force to get trains in a profession
//    that lets you have more options"
//
//   "...should be given tool to limit the amount of clicking like assigning
//    the jobs to people which will let the player focus on new stuff."
//
// So training genuinely costs you: the trainee leaves the work rota for a
// turn or two — and still eats — before coming back better at one job.
//
// Written in the same plain-globals style as game.js.

// ---------------------------------------------------------------------------
// TUNING
// ---------------------------------------------------------------------------

const SCHOOL_WOOD_COST = 8;
const SCHOOL_STONE_COST = 6;
const SCHOOL_WORK_HOURS = 2;

const ARMYCAMP_WOOD_COST = 10;
const ARMYCAMP_STONE_COST = 8;
const ARMYCAMP_WORK_HOURS = 2;

// No building trains more than one person at a time.
const TRAINING_SLOTS_PER_BUILDING = 1;

// How far a stack of specialists can push one job. Without a ceiling a
// village of twenty foresters would strip the island in an afternoon.
const PROFESSION_BONUS_CAP = 3;

const PROFESSIONS = {
  farmer: {
    name: "Farmer",
    home: "school",
    turns: 2,
    food: 4,
    icon: "farming",
    effect: "+1 timbermellow for every hour spent gathering food",
    blurb: "Knows which groves are ready and which to leave alone.",
  },
  forester: {
    name: "Forester",
    home: "school",
    turns: 2,
    food: 4,
    icon: "wood",
    effect: "+1 wood for every hour spent cutting",
    blurb: "Fells clean, splits fast, and never ruins a stand.",
  },
  mason: {
    name: "Mason",
    home: "school",
    turns: 2,
    food: 4,
    icon: "stone",
    effect: "+1 stone for every hour spent quarrying",
    blurb: "Reads a rock face and knows where it will break.",
  },
  scholar: {
    name: "Scholar",
    home: "school",
    turns: 3,
    food: 6,
    icon: "tech",
    effect: "every technology costs 20% fewer work hours (up to 60%)",
    blurb: "Keeps the village's knots, tallies and half-remembered ideas.",
  },
  scout: {
    name: "Scout",
    home: "armycamp",
    turns: 2,
    food: 6,
    icon: "explore",
    effect: "expeditions cost 2 less food and 1 less hour (down to 4 food, 2 hours)",
    blurb: "Has been further from the village than anyone else alive.",
  },
  captain: {
    name: "Captain",
    home: "armycamp",
    turns: 3,
    food: 6,
    icon: "soldier",
    effect: "+2 to the village's defence whenever the garlocks come",
    blurb: "Has stood in a shield line before, and did not run.",
  },
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let school = 0;
let armycamp = 0;
let professionCounts = { farmer: 0, forester: 0, mason: 0, scholar: 0, scout: 0, captain: 0 };
let professionTrainees = [];      // [{ id, left }]
let jobAssignments = { timbermellow: 0, wood: 0, stone: 0 };

// ---------------------------------------------------------------------------
// The buildings
// ---------------------------------------------------------------------------

function make_school() {
  if (working_hours < SCHOOL_WORK_HOURS) { updatelog(`A school takes ${SCHOOL_WORK_HOURS} work hours.`); update(); return; }
  if (wood < SCHOOL_WOOD_COST) { updatelog(`A school needs ${SCHOOL_WOOD_COST} wood.`); update(); return; }
  if (stone < SCHOOL_STONE_COST) { updatelog(`A school needs ${SCHOOL_STONE_COST} stone.`); update(); return; }

  wood -= SCHOOL_WOOD_COST;
  stone -= SCHOOL_STONE_COST;
  working_hours -= SCHOOL_WORK_HOURS;
  school += 1;
  updatelog("A school stands in the village. Someone can be spared to learn a trade properly now.", "good");
  if (school === 1 && typeof showMilestonePopup === "function") {
    showMilestonePopup("The School", "A roof, a bench and an old woman who remembers everything. A villager can now be taken off the work rota to learn a trade.", "tech");
  }
  update();
}

function make_armycamp() {
  if (working_hours < ARMYCAMP_WORK_HOURS) { updatelog(`An army camp takes ${ARMYCAMP_WORK_HOURS} work hours.`); update(); return; }
  if (wood < ARMYCAMP_WOOD_COST) { updatelog(`An army camp needs ${ARMYCAMP_WOOD_COST} wood.`); update(); return; }
  if (stone < ARMYCAMP_STONE_COST) { updatelog(`An army camp needs ${ARMYCAMP_STONE_COST} stone.`); update(); return; }

  wood -= ARMYCAMP_WOOD_COST;
  stone -= ARMYCAMP_STONE_COST;
  working_hours -= ARMYCAMP_WORK_HOURS;
  armycamp += 1;
  updatelog("An army camp is staked out beyond the barns. Scouts and captains can be trained here.", "good");
  if (armycamp === 1 && typeof showMilestonePopup === "function") {
    showMilestonePopup("The Army Camp", "A drill yard, a rack of spears and a fire that never goes out. Scouts range further; captains hold a line.", "soldier");
  }
  update();
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

function professionTraineeCount() {
  return professionTrainees.length;
}

function professionSlots(home) {
  return (home === "school" ? school : armycamp) * TRAINING_SLOTS_PER_BUILDING;
}

function professionSlotsUsed(home) {
  return professionTrainees.filter((trainee) => PROFESSIONS[trainee.id].home === home).length;
}

// Why this trade can't be started right now, or null if it can.
function professionBlocker(id) {
  const trade = PROFESSIONS[id];
  if (!trade) return "No such trade.";
  const buildingName = trade.home === "school" ? "school" : "army camp";
  if (professionSlots(trade.home) <= 0) return `Build a ${buildingName} first.`;
  if (professionSlotsUsed(trade.home) >= professionSlots(trade.home)) {
    return `Every ${buildingName} is already teaching someone. Build another, or wait.`;
  }
  // Three of a trade is all the bonus there is (PROFESSION_BONUS_CAP), so a
  // fourth is a worker lost for two turns and a mouth gained for nothing.
  // Refusing it outright is kinder than letting the player find out.
  if ((professionCounts[id] || 0) >= PROFESSION_BONUS_CAP) {
    return `Three ${trade.name.toLowerCase()}s already teach the village everything they can.`;
  }
  // Taking one of three workers off the rota is not a choice, it is a wound.
  if (humans < 4) return "You need four villagers before you can spare one to train.";
  if (timbermellow_count < trade.food) return `Feeding a trainee costs ${trade.food} timbermellows up front.`;
  return null;
}

function professionTrain(id) {
  const blocker = professionBlocker(id);
  if (blocker) { updatelog(blocker); update(); return; }

  const trade = PROFESSIONS[id];
  humans -= 1;
  timbermellow_count -= trade.food;
  professionTrainees.push({ id, left: trade.turns });
  updatelog(`One villager leaves the work rota to train as a ${trade.name.toLowerCase()} — ${trade.turns} turn${trade.turns > 1 ? "s" : ""}, and they still eat.`, "good");
  update();
}

// Called once per turn from end_turn(): trainees come back qualified.
function professionAdvanceTraining() {
  if (!professionTrainees.length) return;
  const finished = [];
  for (const trainee of professionTrainees) trainee.left -= 1;
  professionTrainees = professionTrainees.filter((trainee) => {
    if (trainee.left > 0) return true;
    finished.push(trainee.id);
    return false;
  });
  for (const id of finished) {
    professionCounts[id] = (professionCounts[id] || 0) + 1;
    humans += 1;
    const trade = PROFESSIONS[id];
    updatelog(`A ${trade.name.toLowerCase()} has finished training — ${trade.effect}.`, "good");
  }
}

// ---------------------------------------------------------------------------
// What the trades are worth
// ---------------------------------------------------------------------------

// Extra units per hour spent on a gathering job.
function professionGatherBonus(type) {
  if (type === "timbermellow" || type === "grain") return Math.min(PROFESSION_BONUS_CAP, professionCounts.farmer || 0);
  if (type === "wood") return Math.min(PROFESSION_BONUS_CAP, professionCounts.forester || 0);
  if (type === "stone") return Math.min(PROFESSION_BONUS_CAP, professionCounts.mason || 0);
  return 0;
}

// A multiplier on the work-hour price of a technology.
function professionResearchFactor() {
  const scholars = Math.min(3, professionCounts.scholar || 0);
  return 1 - scholars * 0.2;
}

// What an expedition actually costs, once the scouts have had their say.
function professionExploreFoodCost() {
  const scouts = Math.min(3, professionCounts.scout || 0);
  return Math.max(4, EXPLORE_FOOD_COST - scouts * 2);
}

function professionExploreHourCost() {
  const scouts = Math.min(3, professionCounts.scout || 0);
  return Math.max(2, EXPLORE_WORK_HOURS - scouts);
}

// Added to the village's strength when the garlocks arrive.
function professionDefenceBonus() {
  return (professionCounts.captain || 0) * 2 + armycamp;
}

function professionTotal() {
  return Object.keys(professionCounts).reduce((sum, id) => sum + (professionCounts[id] || 0), 0);
}

// ---------------------------------------------------------------------------
// Standing work orders
//
// The point of the whole act: once you have twenty people you should not be
// pressing "gather" eighty times a turn.
// ---------------------------------------------------------------------------

const JOB_TYPES = ["timbermellow", "wood", "stone"];

// Hours the standing orders may never touch, so the player is never locked
// out of building.
const JOB_RESERVED_HOURS = 1;

const JOB_LABELS = {
  timbermellow: "Gathering food",
  wood: "Cutting wood",
  stone: "Quarrying stone",
};

function jobAssignedTotal() {
  return JOB_TYPES.reduce((sum, type) => sum + (jobAssignments[type] || 0), 0);
}

function jobFreeVillagers() {
  return Math.max(0, humans - jobAssignedTotal());
}

function jobAssign(type, delta) {
  if (!JOB_TYPES.includes(type)) return;
  const next = (jobAssignments[type] || 0) + delta;
  if (next < 0) return;
  if (delta > 0 && jobFreeVillagers() <= 0) {
    updatelog("Every villager already has a standing job.");
    update();
    return;
  }
  jobAssignments[type] = next;
  update();
}

function jobClear() {
  for (const type of JOB_TYPES) jobAssignments[type] = 0;
  update();
}

// How many hours one villager has this season. Kept in step with
// seasons_effect() in game.js.
function jobHoursPerVillager() {
  if (seasonchecker === 2) return 6;
  if (seasonchecker === 4) return 2;
  return 4;
}

// Run at the start of every turn, after the season has handed out hours.
// Works out what the assigned villagers bring in without calling the
// per-click gather functions thousands of times.
// Standing orders outlive the people who were put on them: a raid or a bad
// winter can leave three jobs and one villager. Left alone, that one villager
// works every hour of every turn on the standing orders and the player can
// never build anything again — so the orders are trimmed to fit.
function jobNormalise() {
  let over = jobAssignedTotal() - Math.max(0, humans);
  if (over <= 0) return 0;
  const dropped = over;
  for (let i = JOB_TYPES.length - 1; i >= 0 && over > 0; i--) {
    const type = JOB_TYPES[i];
    const take = Math.min(over, jobAssignments[type] || 0);
    jobAssignments[type] -= take;
    over -= take;
  }
  return dropped;
}

function jobsRunAuto() {
  if (!ageHas("jobs")) return;
  const dropped = jobNormalise();
  if (dropped > 0) {
    updatelog(`${dropped} standing order${dropped > 1 ? "s were" : " was"} dropped — there are not enough villagers left to work them.`, "bad");
  }
  const assigned = jobAssignedTotal();
  if (assigned <= 0) return;

  const perVillager = jobHoursPerVillager();
  const report = [];

  for (const type of JOB_TYPES) {
    const workers = Math.min(jobAssignments[type] || 0, humans);
    if (workers <= 0) continue;
    // The headman always keeps an hour back. Without it, a village with
    // everybody on standing orders has no hours left to build with and no
    // way out of it — one hour out of many is a cheap guarantee.
    let hours = Math.min(workers * perVillager, Math.max(0, working_hours - JOB_RESERVED_HOURS));
    if (hours <= 0) break;

    if (type === "timbermellow") {
      if (seasonchecker === 4) continue;                       // nothing grows
      let perHour = 1 + (foodbasketmade >= 1 ? 1 : 0) + professionGatherBonus("timbermellow");
      if (seasonchecker === 3) perHour *= 2;                   // the harvest
      const taken = territoryTake(territoryFoodTypes(), perHour * hours);
      if (taken > 0) {
        timbermellow_count += taken;
        ageCountFood(taken);
        report.push(`${taken} timbermellow`);
      }
      working_hours -= hours;
    } else if (type === "wood") {
      const perHour = 1 + (stoneaxe_made >= 1 ? 1 : 0) + professionGatherBonus("wood");
      const taken = territoryTake(["wood"], perHour * hours);
      if (taken > 0) { wood += taken; report.push(`${taken} wood`); }
      working_hours -= hours;
    } else if (type === "stone") {
      const perHour = 1 + professionGatherBonus("stone");
      const taken = territoryTake(["stone"], perHour * hours);
      if (taken > 0) { stone += taken; report.push(`${taken} stone`); }
      working_hours -= hours;
    }
    if (working_hours < 0) working_hours = 0;
  }

  if (report.length) {
    updatelog(`Your standing work orders brought in ${report.join(", ")}.`, "good");
  } else if (assigned > 0 && seasonchecker !== 4) {
    updatelog("Your assigned villagers found nothing left to work on your land.", "bad");
  }
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

function professionsGetState() {
  return {
    school, armycamp,
    professionCounts: Object.assign({}, professionCounts),
    professionTrainees: professionTrainees.map((trainee) => Object.assign({}, trainee)),
    jobAssignments: Object.assign({}, jobAssignments),
  };
}

function professionsSetState(saved) {
  if (!saved) return;
  school = saved.school || 0;
  armycamp = saved.armycamp || 0;
  professionCounts = Object.assign({ farmer: 0, forester: 0, mason: 0, scholar: 0, scout: 0, captain: 0 }, saved.professionCounts || {});
  professionTrainees = (saved.professionTrainees || []).map((trainee) => Object.assign({}, trainee));
  jobAssignments = Object.assign({ timbermellow: 0, wood: 0, stone: 0 }, saved.jobAssignments || {});
}
