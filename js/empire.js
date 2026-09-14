// empire.js
//
// The numbers behind the village, gathered in one place.
//
// Up to now the HUD answered "what can I press?" very well and "how is my
// empire actually doing?" not at all. You could see that you had eleven
// timbermellows; you could not see that you were losing two a turn, that
// four of your twelve people were soldiers, that a third of your land was
// bare rock, or that the village across the valley now held twice as much
// ground as you did.
//
// This file works all of that out. Nothing in here changes the game — it
// only reads game.js's globals and the map — and it is only computed while
// the Empire panel is actually open, so it costs nothing the rest of the
// time.

// ---------------------------------------------------------------------------
// What the village is made of
// ---------------------------------------------------------------------------

function empirePopulation() {
  const trades = {};
  let specialists = 0;
  for (const id of Object.keys(PROFESSIONS)) {
    const count = professionCounts[id] || 0;
    if (count > 0) trades[id] = count;
    specialists += count;
  }
  return {
    workers: humans,
    untrained: Math.max(0, humans - specialists),
    specialists,
    trades,
    soldiers: human_army,
    trainees: professionTraineeCount(),
    total: mouthsToFeed(),
    roofed: Math.min(humans, peoplecap),
    roofless: Math.max(0, humans - peoplecap),
    cap: peoplecap,
  };
}

// What a turn does to the stores, before you touch a single button: what
// the standing orders will bring in, and what the village will eat.
function empireProduction() {
  const perVillager = jobHoursPerVillager();
  const assigned = {
    timbermellow: Math.min(jobAssignments.timbermellow || 0, humans),
    wood: Math.min(jobAssignments.wood || 0, humans),
    stone: Math.min(jobAssignments.stone || 0, humans),
  };
  const standing = {
    timbermellow: seasonchecker === 4 ? 0 : assigned.timbermellow * perVillager * foodPerHour(),
    wood: assigned.wood * perVillager * woodPerHour(),
    stone: assigned.stone * perVillager * stonePerHour(),
  };
  const eaten = mouthsToFeed();
  const spare = Math.max(0, humans - jobAssignedTotal()) * perVillager;

  return {
    perHour: { timbermellow: foodPerHour(), wood: woodPerHour(), stone: stonePerHour() },
    standing,
    eaten,
    netFood: standing.timbermellow - eaten,
    hoursTotal: humans * perVillager,
    hoursCommitted: Math.min(jobAssignedTotal(), humans) * perVillager,
    hoursSpare: spare,
    barnRoom: Math.max(0, storage_capacity - timbermellow_count),
  };
}

// What the ground you hold is actually made of.
function empireLand() {
  const byTerrain = new Map();
  const stores = { timbermellow: 0, grain: 0, wood: 0, stone: 0 };
  const tiles = territoryMap ? territoryMap.getClaimedTiles() : [];
  for (const tile of tiles) {
    byTerrain.set(tile.terrainType, (byTerrain.get(tile.terrainType) || 0) + 1);
    for (const type of Object.keys(stores)) {
      const entry = tile.resources[type];
      if (entry) stores[type] += entry.amount;
    }
  }
  const ranked = [...byTerrain.entries()].sort((a, b) => b[1] - a[1]);
  return { tiles: tiles.length, byTerrain: ranked, stores };
}

// Everyone else, and how you compare.
function empireRivals() {
  if (!territoryMap || typeof villagesGet !== "function") return [];
  return villagesGet()
    .map((village) => {
      const known = village.kind === "player" || territoryMap.isRevealed(village.homeTileId);
      const tiles = territoryMap.getTilesOwnedBy(village.id).length;
      return {
        id: village.id,
        name: known ? village.name : "Uncharted settlement",
        kind: village.kind,
        color: village.color,
        known,
        tiles: known ? tiles : null,
        strength: known && village.kind !== "player" ? villageStrength(village, territoryMap) : null,
      };
    })
    .sort((a, b) => (b.tiles || -1) - (a.tiles || -1));
}

// ---------------------------------------------------------------------------
// The technologies, including the ones that have not arrived yet
//
// An empire game shows you the road ahead, not just the next step. Every
// technology is listed from the first turn; the ones you cannot have yet
// say what they are waiting for.
// ---------------------------------------------------------------------------

const EMPIRE_TECHS = [
  {
    id: "stoneaxe", name: "Stone axe", icon: "stoneaxe",
    cost: "20 wood · 30 stone", effect: "Every hour spent cutting wood brings back two instead of one.",
    comesAt: 25,
    done: () => stoneaxe_made > 0,
    open: () => techlevel >= 1,
  },
  {
    id: "farming", name: "Farming", icon: "farming",
    cost: "30 wood · 12 hours", effect: "Grain on plains and terraced hills starts counting as food.",
    comesAt: 40,
    done: () => farming_made > 0,
    open: () => farming_unlocked,
  },
  {
    id: "foodbasket", name: "Food basket", icon: "foodbasket",
    cost: "50 wood · 16 hours", effect: "Every hour spent gathering brings back two timbermellows instead of one.",
    comesAt: 50,
    done: () => foodbasketmade > 0,
    open: () => techlevel >= 2,
  },
  {
    id: "mapmaking", name: "Mapmaking", icon: "mapmaking",
    cost: "20 wood · 10 hours", effect: "The whole island is drawn in — no more blank paper.",
    comesAt: 60,
    done: () => mapmaking_made > 0,
    open: () => mapmaking_unlocked,
  },
];

function empireTechOutlook() {
  return EMPIRE_TECHS.map((tech) => {
    let state = "locked";
    if (tech.done()) state = "done";
    else if (tech.open()) state = "open";
    return {
      id: tech.id, name: tech.name, icon: tech.icon, cost: tech.cost, effect: tech.effect,
      state,
      // Two different reasons a technology is not available yet, and saying
      // "you have 44 hours" while it stays locked because the village is
      // still in Act I would just be confusing.
      waiting: state !== "locked" ? ""
        : !ageAtLeast("growth")
          ? "nobody has time to think yet — it comes with Act II"
          : `arrives at ${tech.comesAt} work hours — you have ${humans * jobHoursPerVillager()}`,
    };
  });
}

// ---------------------------------------------------------------------------
// Drawing it
// ---------------------------------------------------------------------------

let empirePanelKey = "";

function empireRefresh() {
  const pane = document.querySelector('.rw-pane[data-pane="empire"]');
  if (!pane || pane.hidden) return;

  // T-fix: palisade/watchtower in the key so building walls refreshes the
  // ledger instead of leaving it stale.
  const palisadeNow = typeof palisade !== "undefined" ? palisade : 0;
  const towerNow = typeof watchtower !== "undefined" ? watchtower : 0;
  const key = [
    humans, human_army, professionTraineeCount(), timbermellow_count, wood, stone,
    barn, stonehouse, school, armycamp, palisadeNow, towerNow,
    territoryClaimedCount(), seasonchecker, turngame,
    Object.values(professionCounts).join(""), Object.values(jobAssignments).join(""),
  ].join("|");
  if (key === empirePanelKey) return;
  empirePanelKey = key;

  const icon = (name) => (typeof getIcon === "function" ? getIcon(name) : "");
  const people = empirePopulation();
  const production = empireProduction();
  const land = empireLand();

  const row = (label, value, tone) =>
    `<div class="rw-stat ${tone ? `rw-stat--${tone}` : ""}"><span>${label}</span><b>${value}</b></div>`;

  const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

  // --- who they are --------------------------------------------------------
  const tradeLines = Object.keys(people.trades)
    .map((id) => row(`${icon(PROFESSIONS[id].icon)} ${PROFESSIONS[id].name}s`, people.trades[id]))
    .join("");
  setPanel("empirePeople", [
    row(`${icon("villager")} Workers`, people.workers),
    people.untrained ? row("&nbsp;&nbsp;untrained", people.untrained) : "",
    tradeLines,
    people.trainees ? row(`${icon("tech")} In training`, people.trainees, "warn") : "",
    row(`${icon("soldier")} Soldiers`, people.soldiers),
    row(`${icon("house")} Under a roof`, `${people.roofed}/${people.cap}`, people.roofless ? "bad" : ""),
    people.roofless ? row("&nbsp;&nbsp;without a roof", people.roofless, "bad") : "",
    row(`${icon("hungry")} Mouths to feed`, people.total),
  ].join(""));

  // --- what a turn does ----------------------------------------------------
  setPanel("empireProduction", [
    row(`${icon("hours")} Work hours a turn`, production.hoursTotal),
    row("&nbsp;&nbsp;on standing orders", production.hoursCommitted),
    row("&nbsp;&nbsp;yours to spend", production.hoursSpare),
    row(`${icon("timbermellow")} Standing orders bring`, signed(production.standing.timbermellow), production.standing.timbermellow ? "good" : ""),
    row(`${icon("hungry")} The village eats`, `−${production.eaten}`, "bad"),
    row("<b>Food, net a turn</b>", signed(production.netFood), production.netFood >= 0 ? "good" : "bad"),
    row(`${icon("wood")} Wood a turn`, signed(production.standing.wood)),
    row(`${icon("stone")} Stone a turn`, signed(production.standing.stone)),
    row(`${icon("barn")} Room left in the barns`, production.barnRoom, production.barnRoom <= 0 ? "bad" : ""),
  ].join(""));

  // --- the ground ----------------------------------------------------------
  const terrainLines = land.byTerrain.slice(0, 7)
    .map(([terrain, count]) => row(TERRAIN_NAMES[terrain] || terrain, `${count} hex${count === 1 ? "" : "es"}`))
    .join("");
  // T-fix: the town itself, counted — houses/barns/schools/camps plus the
  // walls the ledger used to hide.
  const palisadeShown = typeof palisade !== "undefined" ? palisade : 0;
  const towerShown = typeof watchtower !== "undefined" ? watchtower : 0;
  setPanel("empireLand", [
    row(`${icon("tiles")} Hexes held`, land.tiles),
    terrainLines,
    land.byTerrain.length > 7 ? row("other ground", `${land.byTerrain.slice(7).reduce((n, e) => n + e[1], 0)} hexes`) : "",
    row(`${icon("timbermellow")} Food still on the land`, land.stores.timbermellow + (farming_made > 0 ? land.stores.grain : 0)),
    row(`${icon("wood")} Wood still standing`, land.stores.wood),
    row(`${icon("stone")} Stone still in the ground`, land.stores.stone),
    row(`${icon("house")} Houses · barns · schools · camps`, `${stonehouse} · ${barn} · ${school} · ${armycamp}`),
    (palisadeShown || towerShown) ? row(`${icon("shield")} Walls · towers`, `${palisadeShown} · ${towerShown}`) : "",
  ].join(""));

  // --- everyone else -------------------------------------------------------
  const rivals = empireRivals();
  const host = document.getElementById("empireRivals");
  if (host) {
    host.innerHTML = rivals.map((village) => `
      <li class="rw-rival ${village.kind === "player" ? "rw-rival--you" : ""} ${village.known ? "" : "rw-rival--unknown"}">
        <i class="chip" style="background:${village.color}"></i>
        <span class="rw-rival__name">${village.name}</span>
        <span class="rw-rival__tiles">${village.tiles === null ? "?" : village.tiles}</span>
        <span class="rw-rival__strength">${village.strength === null ? (village.kind === "player" ? "you" : "?") : `str ${village.strength}`}</span>
      </li>`).join("");
  }

  // --- the road ahead ------------------------------------------------------
  const techHost = document.getElementById("empireTechs");
  if (techHost) {
    techHost.innerHTML = empireTechOutlook().map((tech) => `
      <li class="rw-techrow rw-techrow--${tech.state}">
        <span class="rw-techrow__icon">${icon(tech.icon)}</span>
        <span class="rw-techrow__body">
          <b>${tech.name}</b>
          <small>${tech.state === "done" ? "already known" : tech.state === "open" ? tech.cost : tech.waiting}</small>
          <em>${tech.effect}</em>
        </span>
        <span class="rw-techrow__mark">${tech.state === "done" ? "✔" : tech.state === "open" ? "●" : "·"}</span>
      </li>`).join("");
  }
}

function setPanel(id, html) {
  const element = document.getElementById(id);
  if (element) element.innerHTML = html;
}
