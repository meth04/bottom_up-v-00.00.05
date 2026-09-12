// ui.js
//
// The antique cartographer shell around the game: the colonist bar across the
// top, the command palette and tabs in the bottom-right corner, the alert
// list down the right, the learning helper, and the tooltips that explain
// every button (including *why* a greyed-out one is greyed out).
//
// Nothing in here touches the rules. It reads game.js's globals and the
// map, and calls the same functions the buttons do. game.js calls
// uiRefresh() at the end of update(); main.js calls it after the map loads.

// ---------------------------------------------------------------------------
// The command palette and its tabs
// ---------------------------------------------------------------------------

let uiOpenTab = "gather";      // which pane is showing; null = palette closed
let uiTutorDone = {};          // lesson id -> true
let uiTutorOff = false;
let uiTutorShowing = null;
let uiColonistKey = "";        // so the bar is only rebuilt when it changed

const UI_TUTOR_STORE = "bottomup.tutor.v1";

function uiSetTab(name) {
  // A tab that has not been earned yet cannot be opened, by key or by click
  // (js/ages.js decides what is showing).
  if (name) {
    const tab = document.querySelector(`.rw-tab[data-tab="${name}"]`);
    if (tab && tab.hidden) return;
  }
  uiOpenTab = name;
  const palette = document.getElementById("palette");
  for (const pane of document.querySelectorAll(".rw-pane")) {
    pane.hidden = pane.dataset.pane !== name;
  }
  if (palette) palette.hidden = !name;
  for (const tab of document.querySelectorAll(".rw-tab")) {
    tab.classList.toggle("is-open", tab.dataset.tab === name);
    if (tab.dataset.tab === name) tab.classList.remove("rw-tab--nudge");
  }
}

function uiToggleTab(name) {
  uiSetTab(uiOpenTab === name ? null : name);
}

// Alerts use this to walk the player to the button that fixes them.
function uiPointAt(tabName, elementId) {
  uiSetTab(tabName);
  if (!elementId) return;
  const target = document.getElementById(elementId);
  if (!target) return;
  target.classList.remove("rw-flash");
  void target.offsetWidth;           // restart the animation
  target.classList.add("rw-flash");
  setTimeout(() => target.classList.remove("rw-flash"), 2200);
}

// Draws the eye to a tab that has just gained something new.
function uiNudgeTab(name) {
  const tab = document.querySelector(`.rw-tab[data-tab="${name}"]`);
  if (tab && uiOpenTab !== name) tab.classList.add("rw-tab--nudge");
}

// ---------------------------------------------------------------------------
// The trades, and the standing work orders
// ---------------------------------------------------------------------------

let uiProfessionKey = "";        // so the trade buttons aren't rebuilt under the cursor
let uiJobKey = "";

function uiRefreshProfessions() {
  const rack = document.getElementById("professionRack");
  if (!rack || rack.hidden) return;

  const key = [school, armycamp, humans, timbermellow_count,
               Object.values(professionCounts).join("-"),
               professionTrainees.map((t) => t.id + t.left).join("-")].join("|");
  if (key === uiProfessionKey) return;
  uiProfessionKey = key;

  const host = document.getElementById("professionButtons");
  if (host) {
    host.innerHTML = Object.keys(PROFESSIONS).map((id) => {
      const trade = PROFESSIONS[id];
      const have = professionCounts[id] || 0;
      const blocker = professionBlocker(id);
      const icon = typeof getIcon === "function" ? getIcon(trade.icon, "game-icon--lg") : "";
      return `
        <button class="rw-gizmo rw-gizmo--trade" ${blocker ? "disabled" : ""}
                onclick="professionTrain('${id}')"
                data-tip-title="Train a ${trade.name.toLowerCase()}"
                data-tip="${trade.blurb} ${trade.effect}. Only the first three of a trade add to the bonus — a fourth farmer is just another mouth."
                data-tip-cost="1 villager for ${trade.turns} turn${trade.turns > 1 ? "s" : ""} · ${trade.food} food"
                data-tip-block="${blocker || ""}">
          <span class="rw-gizmo__icon">${icon}</span>
          <span class="rw-gizmo__label">${trade.name}</span>
          <span class="rw-gizmo__cost">${have ? `${have} trained` : trade.home === "school" ? "school" : "camp"}</span>
        </button>`;
    }).join("");
  }

  const note = document.getElementById("professionSlotNote");
  if (note) {
    const schoolFree = professionSlots("school") - professionSlotsUsed("school");
    const campFree = professionSlots("armycamp") - professionSlotsUsed("armycamp");
    note.textContent = `${schoolFree} school place${schoolFree === 1 ? "" : "s"} · ${campFree} camp place${campFree === 1 ? "" : "s"}`;
  }

  const list = document.getElementById("traineeList");
  if (list) {
    list.innerHTML = professionTrainees.map((trainee) => {
      const trade = PROFESSIONS[trainee.id];
      return `<li><b>${trade.name}</b><small>${trainee.left} turn${trainee.left === 1 ? "" : "s"} left · still eating</small></li>`;
    }).join("");
  }
}

function uiRefreshJobs() {
  const rack = document.getElementById("jobRack");
  if (!rack || rack.hidden) return;

  const key = [humans, seasonchecker, JOB_TYPES.map((t) => jobAssignments[t]).join("-")].join("|");
  if (key === uiJobKey) return;
  uiJobKey = key;

  const free = document.getElementById("jobFree");
  if (free) free.textContent = jobFreeVillagers();

  const host = document.getElementById("jobRows");
  if (!host) return;
  const perVillager = jobHoursPerVillager();
  host.innerHTML = JOB_TYPES.map((type) => {
    const count = jobAssignments[type] || 0;
    const icon = typeof getIcon === "function" ? getIcon(type) : "";
    return `
      <div class="rw-jobrow"
           data-tip-title="${JOB_LABELS[type]}"
           data-tip="Every villager here works ${perVillager} hours on this job the moment the turn begins — no clicking. Hours they spend are taken off your total.">
        <span class="rw-jobrow__icon">${icon}</span>
        <span class="rw-jobrow__label">${JOB_LABELS[type]}</span>
        <button class="rw-x5" onclick="jobAssign('${type}', -1)" ${count <= 0 ? "disabled" : ""}>−</button>
        <b class="rw-jobrow__count">${count}</b>
        <button class="rw-x5" onclick="jobAssign('${type}', 1)" ${jobFreeVillagers() <= 0 ? "disabled" : ""}>+</button>
      </div>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Tooltips
// ---------------------------------------------------------------------------

let uiTipTarget = null;
let uiTipPending = false;
let uiPointer = { x: 0, y: 0 };

function uiInstallTooltips() {
  document.addEventListener("mousemove", (event) => {
    uiPointer.x = event.clientX;
    uiPointer.y = event.clientY;
    if (uiTipPending) return;
    uiTipPending = true;
    requestAnimationFrame(() => {
      uiTipPending = false;
      uiUpdateTooltip();
    });
  });
  document.addEventListener("mouseleave", () => uiShowTooltip(null));
  document.addEventListener("mousedown", () => uiShowTooltip(null));
  window.addEventListener("blur", () => uiShowTooltip(null));
}

function uiUpdateTooltip() {
  const stack = document.elementsFromPoint(uiPointer.x, uiPointer.y);
  let found = null;
  for (const element of stack) {
    const owner = element.closest && element.closest("[data-tip-title]");
    if (owner) { found = owner; break; }
    if (element.id === "mapstage") break;
  }
  uiShowTooltip(found);
}

function uiShowTooltip(element) {
  const tip = document.getElementById("tooltip");
  if (!tip) return;
  if (!element) {
    uiTipTarget = null;
    tip.hidden = true;
    return;
  }
  if (element !== uiTipTarget) {
    uiTipTarget = element;
    const block = element.disabled ? element.dataset.tipBlock : "";
    tip.innerHTML =
      `<div class="rw-tip__title">${element.dataset.tipTitle || ""}</div>` +
      `<div>${element.dataset.tip || ""}</div>` +
      (element.dataset.tipCost ? `<div class="rw-tip__cost">${element.dataset.tipCost}</div>` : "") +
      (block ? `<div class="rw-tip__block">${block}</div>` : "");
    tip.hidden = false;
  }
  const box = tip.getBoundingClientRect();
  let x = uiPointer.x + 16;
  let y = uiPointer.y - box.height - 12;
  if (x + box.width > window.innerWidth - 8) x = uiPointer.x - box.width - 16;
  if (y < 8) y = uiPointer.y + 22;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.min(window.innerHeight - box.height - 8, y)}px`;
}

// ---------------------------------------------------------------------------
// The colonist bar
// ---------------------------------------------------------------------------

const UI_PAWN_NAMES = [
  "Mira", "Tovan", "Elspeth", "Kell", "Rowan", "Sable", "Odd", "Yarrow",
  "Bran", "Lowen", "Ashe", "Fen", "Corrin", "Wren", "Halle", "Dov",
  "Pike", "Nessa", "Garrick", "Isolde", "Rook", "Marek", "Tansy", "Ivo",
  "Cass", "Bryn", "Orla", "Finn", "Dalia", "Sten", "Hesper", "Ludo",
];

const UI_SKIN = ["#e6c2a0", "#d3a273", "#a8734b", "#7b5335", "#f0d5b8"];
const UI_HAIR = ["#3a2a1c", "#6b4423", "#1d1d1d", "#8e6c3f", "#c9a24a", "#5c5c5c"];
const UI_SHIRT = ["#6b7f52", "#7a5c4a", "#4d6272", "#8a6f3f", "#5e5b73", "#7b4a4a"];

function uiPawnName(index) {
  return UI_PAWN_NAMES[index % UI_PAWN_NAMES.length] + (index >= UI_PAWN_NAMES.length ? ` ${Math.floor(index / UI_PAWN_NAMES.length) + 1}` : "");
}

function uiPawnPortrait(index, soldier) {
  const skin = UI_SKIN[(index * 7 + 3) % UI_SKIN.length];
  const hair = UI_HAIR[(index * 5 + 1) % UI_HAIR.length];
  const shirt = soldier ? "#5d6d84" : UI_SHIRT[(index * 3) % UI_SHIRT.length];
  return `
    <svg viewBox="0 0 40 42" aria-hidden="true">
      <path d="M6 42 q0-13 14-13 t14 13z" fill="${shirt}"/>
      ${soldier ? '<path d="M20 29 l0 13" stroke="#c9c3b4" stroke-width="2"/>' : ""}
      <circle cx="20" cy="18" r="10" fill="${skin}"/>
      <path d="M10 17 q1-11 10-11 t10 11 q-3-5-10-5 t-10 5z" fill="${hair}"/>
      ${soldier ? `<path d="M9 16 q11-8 22 0 l0 -2 q-11-9-22 0z" fill="#9aa3ae"/>` : ""}
      <circle cx="16.5" cy="19" r="1.3" fill="#2a2119"/>
      <circle cx="23.5" cy="19" r="1.3" fill="#2a2119"/>
    </svg>`;
}

function uiRefreshColonists() {
  const bar = document.getElementById("colonistBar");
  if (!bar) return;

  const trainees = professionTraineeCount();
  const total = humans + human_army + trainees;
  const needed = total;
  const fed = needed > 0 ? Math.min(1, timbermellow_count / needed) : 1;
  const hungry = timbermellow_count < needed;
  const roofless = Math.max(0, humans - peoplecap);
  const key = `${humans}|${human_army}|${trainees}|${Math.round(fed * 20)}|${roofless}|${seasonchecker}`;
  if (key === uiColonistKey) return;
  uiColonistKey = key;

  const shown = Math.min(total, 20);
  let html = "";
  for (let index = 0; index < shown; index++) {
    const soldier = index >= humans && index < humans + human_army;
    const trainee = index >= humans + human_army;
    const noRoof = !soldier && index >= peoplecap;
    const flagSvg = (hungry ? `<span style="color:#b83928;" title="Hungry">⚠</span>` : "") +
                    (noRoof && seasonchecker === 4 ? `<span style="color:#336699;" title="Freezing">❄</span>` : noRoof ? `<span style="color:#557799;" title="Roofless">🌧</span>` : "");
    const tipParts = [];
    tipParts.push(trainee ? "In training. Off the work rota for now — and still eating — but will come back qualified."
                 : soldier ? "A soldier. Escorts expeditions, seizes land and defends the settlement."
                 : "A settler. Each provides 4 work hours in spring/autumn, 6 in summer, 2 in winter.");
    if (hungry) tipParts.push("Starving! There is not enough timbermellow in the barns.");
    if (noRoof) tipParts.push("Exposed to elements! Lacks a roof for the coming winter.");
    html += `
      <button class="rw-pawn ${soldier ? "rw-pawn--soldier" : ""} ${trainee ? "rw-pawn--trainee" : ""} ${hungry ? "rw-pawn--hungry" : ""}"
              onclick="uiFocusVillage()"
              data-tip-title="${uiPawnName(index)}${soldier ? " · soldier" : trainee ? " · in training" : ""}"
              data-tip="${tipParts.join(" ")}">
        <div class="rw-pawn__name">${uiPawnName(index)}</div>
        <div class="rw-pawn__box">
          ${uiPawnPortrait(index, soldier)}
          ${flagSvg ? `<span class="rw-pawn__flags">${flagSvg}</span>` : ""}
          <span class="rw-pawn__bar"><i style="width:${Math.round(fed * 100)}%"></i></span>
        </div>
      </button>`;
  }
  if (total > shown) html += `<span class="rw-pawn__more">+${total - shown}</span>`;
  bar.innerHTML = html;
}

function uiFocusVillage() {
  if (typeof focusVillage === "function") focusVillage();
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

function uiBuildAlerts() {
  const alerts = [];
  const mouths = mouthsToFeed();
  const foodOnLand = typeof territoryAvailable === "function" ? territoryAvailable(territoryFoodTypes()) : 0;
  const woodOnLand = typeof territoryAvailable === "function" ? territoryAvailable(["wood"]) : 0;
  const stoneOnLand = typeof territoryAvailable === "function" ? territoryAvailable(["stone"]) : 0;

  if (timbermellow_count < mouths) {
    alerts.push({
      level: "bad", icon: typeof getIcon === "function" ? getIcon("hungry") : "☠",
      text: `Starvation — ${mouths - timbermellow_count} will go unfed`,
      tip: "Everyone eats one timbermellow when the turn ends. Soldiers starve first, then villagers. Gather more before you end the turn.",
      go: () => uiPointAt("gather", "btn_find_timbermellow"),
    });
  }

  if (garlocks_attacking) {
    const defence = garlockVillageDefence();
    alerts.push({
      level: "bad", icon: typeof getIcon === "function" ? getIcon("seize") : "⚔",
      text: `Garlock raid on turn ${garlock_incomingattack_turn}`,
      tip: `They come ${garlock_strangth} strong; your village stands at ${defence}. Each soldier is worth 2, each captain 2 more, each army camp 1. Come up short and they take food, wood and barns.`,
      go: () => uiPointAt("people", "btn_soldier"),
    });
  } else if (ageAtLeast("raids") && garlock_next_raid_turn) {
    alerts.push({
      level: "info", icon: typeof getIcon === "function" ? getIcon("soldier") : "🛡",
      text: `Next raid around turn ${garlock_next_raid_turn}`,
      tip: "The garlocks come on a rhythm now. Have the shield line standing before the scouts are seen.",
      go: () => uiPointAt("people", "btn_soldier"),
    });
  }

  if (ageHas("professions")) {
    const freeSchool = professionSlots("school") - professionSlotsUsed("school");
    const freeCamp = professionSlots("armycamp") - professionSlotsUsed("armycamp");
    if ((freeSchool > 0 || freeCamp > 0) && humans >= 3 && professionTotal() < humans) {
      alerts.push({
        level: "info", icon: typeof getIcon === "function" ? getIcon("tech") : "🎓",
        text: `${freeSchool + freeCamp} training place${freeSchool + freeCamp > 1 ? "s" : ""} empty`,
        tip: "A trained villager is worth several untrained ones at the job they know. Training costs you their hours for a turn or two.",
        go: () => uiPointAt("people", "professionRack"),
      });
    }
  }

  if (ageHas("jobs") && jobFreeVillagers() >= 4) {
    alerts.push({
      level: "info", icon: typeof getIcon === "function" ? getIcon("hours") : "⏱",
      text: `${jobFreeVillagers()} villagers with no standing job`,
      tip: "Put them on a standing order and they will work every turn without being clicked.",
      go: () => uiPointAt("people", "jobRack"),
    });
  }

  if (humans > peoplecap) {
    alerts.push({
      level: seasonchecker >= 3 ? "bad" : "warn", icon: typeof getIcon === "function" ? getIcon("house") : "🏠",
      text: `${humans - peoplecap} without a roof`,
      tip: "Anyone without a roof dies of exposure in winter. Each house shelters 3 and costs 2 stone.",
      go: () => uiPointAt("build", "btn_house"),
    });
  }

  if (timbermellow_count >= storage_capacity && storage_capacity > 0) {
    alerts.push({
      level: "warn", icon: typeof getIcon === "function" ? getIcon("barn") : "🏚",
      text: "Barns full — excess is lost",
      tip: "Anything over your barn space is eaten by garlocks when the turn ends. Build another barn (4 wood).",
      go: () => uiPointAt("build", "btn_barn"),
    });
  }

  if (timbermellow_count >= 20 && human_army === 0) {
    alerts.push({
      level: "warn", icon: typeof getIcon === "function" ? getIcon("soldier") : "🛡",
      text: "Abundant stores, no soldiers",
      tip: "The garlocks start watching once stores reach 25. Train a soldier before scouts arrive.",
      go: () => uiPointAt("people", "btn_soldier"),
    });
  }

  if (foodOnLand <= 3 && seasonchecker !== 4) {
    alerts.push({
      level: "warn", icon: typeof getIcon === "function" ? getIcon("timbermellow") : "🌰",
      text: "The land is running dry",
      tip: "There is almost nothing left to gather on the tiles you hold. Pick a frontier tile and explore it.",
      go: () => uiHintExplore(),
    });
  }

  if (woodOnLand <= 0 && wood < 4) {
    alerts.push({
      level: "info", icon: typeof getIcon === "function" ? getIcon("wood") : "🪵",
      text: "No wood on your land",
      tip: "Forests and dense bush carry wood. Take a tile that has some.",
      go: () => uiHintExplore(),
    });
  }

  if (stoneOnLand <= 0 && stone < 2) {
    alerts.push({
      level: "info", icon: typeof getIcon === "function" ? getIcon("stone") : "🪨",
      text: "No stone on your land",
      tip: "Mountains, rocky outcrops and terraced hills carry stone, and stone never grows back. You will need stone for houses.",
      go: () => uiHintExplore(),
    });
  }

  const techOpen = ["stoneaxebt", "foodbasketbt", "farmingbt", "mapmakingbt"]
    .filter((id) => { const b = document.getElementById(id); return b && b.style.display !== "none"; });
  if (techOpen.length) {
    alerts.push({
      level: "info", icon: typeof getIcon === "function" ? getIcon("tech") : "💡",
      text: `${techOpen.length} new idea${techOpen.length > 1 ? "s" : ""}`,
      tip: "Someone in the village has devised an innovation. Research it before you need it.",
      go: () => uiPointAt("research", techOpen[0]),
    });
  }

  if (working_hours > 0) {
    alerts.push({
      level: "info", icon: typeof getIcon === "function" ? getIcon("hours") : "⏱",
      text: `${working_hours} work hour${working_hours > 1 ? "s" : ""} idle`,
      tip: "Unspent hours vanish when the turn ends. Spend them gathering, building or raising people.",
      go: () => uiPointAt("gather", "btn_find_timbermellow"),
    });
  }

  // Raids under way and raiders on the road (js/raids.js). They matter
  // more than idle hours, so they go in front of everything but starvation.
  if (typeof raidsAlerts === "function") {
    const raidAlerts = raidsAlerts() || [];
    for (const alert of raidAlerts) {
      if (!alert.icon) alert.icon = typeof getIcon === "function" ? getIcon(alert.level === "bad" ? "raid" : "shield") : "⚔";
    }
    const urgent = raidAlerts.filter((alert) => alert.level === "bad");
    const rest = raidAlerts.filter((alert) => alert.level !== "bad");
    alerts.splice(alerts.length && alerts[0].level === "bad" ? 1 : 0, 0, ...urgent);
    alerts.push(...rest);
  }

  // The next objective, at the bottom: the checklist panel already shows
  // it, this is just so the alert column is never empty of things to do.
  if (typeof objectivesAlerts === "function") alerts.push(...(objectivesAlerts() || []));

  return alerts;
}

let uiAlertKey = "";

function uiRefreshAlerts() {
  const host = document.getElementById("alertList");
  if (!host) return;
  const alerts = uiBuildAlerts();
  // Rebuilding ten buttons on every single click is a lot of thrown-away
  // DOM, and it kills the hover state under the player's cursor. The list
  // only changes when one of the things it warns about changes.
  const key = alerts.map((alert) => alert.level + alert.text).join("|");
  if (key === uiAlertKey) return;
  uiAlertKey = key;
  host.innerHTML = "";
  alerts.forEach((alert) => {
    const button = document.createElement("button");
    button.className = `rw-alert rw-alert--${alert.level}`;
    button.innerHTML = `<span class="rw-alert__icon">${alert.icon}</span><span>${alert.text}</span>`;
    button.dataset.tipTitle = alert.text;
    button.dataset.tip = alert.tip;
    button.dataset.tipCost = "Click to open the action that resolves this.";
    button.onclick = alert.go;
    host.appendChild(button);
  });
}

function uiHintExplore() {
  uiSetTab(null);
  if (typeof selectBestFrontier === "function") selectBestFrontier();
}

// ---------------------------------------------------------------------------
// Learning helper
// ---------------------------------------------------------------------------

const UI_LESSONS = [
  {
    id: "welcome",
    title: "Two People, One Grove",
    body: "This is the world, drawn by hand. The gold outline is the land you hold — everything you gather comes off it. There is one button that matters today: GATHER. Drag to pan, scroll to zoom, click any hex to look at it.",
    when: () => true,
  },
  {
    id: "hours",
    title: "Work Hours",
    body: "Everything costs an hour. Spend them all — hours you do not spend are simply gone when the turn ends.",
    when: () => working_hours > 0,
  },
  {
    id: "endturn",
    title: "Ending the Turn",
    body: "When your hours are spent, press END TURN (or Space). Everyone eats one timbermellow, and the season moves on.",
    when: () => working_hours <= 0,
  },
  {
    id: "barn",
    title: "Build a Barn",
    body: "Food left in the open is food the garlocks take: anything over your barn space vanishes the moment the turn ends. Open BUILD — 4 wood, 5 more spaces.",
    when: () => ageHas("build_barn") && wood >= 4,
  },
  {
    id: "winter",
    title: "Winter is Coming",
    body: "In winter nothing can be gathered, everyone still eats, and anyone without a roof dies of exposure. This is the whole of Act I: get everybody through it.",
    when: () => seasonchecker === 3,
  },
  {
    id: "allday",
    title: "A Whole Day at Once",
    body: "You have enough hands that clicking one hour at a time is a waste of your evening. ×5 does five hours; ALL spends everything you have left — and stops before the barns overflow.",
    when: () => ageHas("bulk_five"),
  },
  {
    id: "ledger",
    title: "What Just Happened",
    body: "After every turn a short ledger appears above the clock: what you gathered, what was eaten, what spoiled, who arrived and who did not survive. Click it to put it away.",
    when: () => turngame >= 3,
  },
  {
    id: "explore",
    title: "Frontier Expansion",
    body: "The dashed white hexes are wild land touching yours. Select one and press EXPLORE in the bottom-left panel. An expedition needs 3 settlers, a soldier as escort, food and hours.",
    when: () => ageHas("soldiers") && humans >= 3 && human_army >= 1,
  },
  {
    id: "growth",
    title: "Act II — Room to Think",
    body: "You survived a year. Research has opened, and so have the school and the army camp. There is no single hurdle now — build what you like and see what turns up.",
    when: () => ageAtLeast("growth"),
  },
  {
    id: "trades",
    title: "Learning a Trade",
    body: "Training takes a villager off the work rota for a turn or two. They still eat, and you lose their hours — but they come back worth several untrained hands at the job they learned.",
    when: () => ageHas("professions"),
  },
  {
    id: "garlocks",
    title: "Act III — The Raids",
    body: "The garlocks come on a rhythm now, to knock you back down. Each soldier is worth 2 defence, each captain 2 more, each army camp 1. Match their strength and they break on your line.",
    when: () => ageAtLeast("raids"),
  },
  {
    id: "famine",
    title: "Act IV — The Grove Fails",
    body: "The timbermellows will not come all the way back any more. Learn farming, take more land — and put people on standing orders so you are not clicking for every hour of a village this size.",
    when: () => ageAtLeast("famine"),
  },
];

function uiLoadTutor() {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_TUTOR_STORE) || "{}");
    uiTutorDone = saved.done || {};
    uiTutorOff = !!saved.off;
  } catch (error) {
    uiTutorDone = {};
  }
  const box = document.getElementById("tutorOff");
  const menuBox = document.getElementById("tutorOffMenu");
  const settingsBox = document.getElementById("settingsToggleHelper");
  if (box) box.checked = uiTutorOff;
  if (menuBox) menuBox.checked = uiTutorOff;
  if (settingsBox) settingsBox.checked = uiTutorOff;
}

function uiSaveTutor() {
  try {
    localStorage.setItem(UI_TUTOR_STORE, JSON.stringify({ done: uiTutorDone, off: uiTutorOff }));
  } catch (error) { /* ignored */ }
}

function uiSetTutorOff(off) {
  uiTutorOff = off;
  const box = document.getElementById("tutorOff");
  const menuBox = document.getElementById("tutorOffMenu");
  const settingsBox = document.getElementById("settingsToggleHelper");
  if (box) box.checked = off;
  if (menuBox) menuBox.checked = off;
  if (settingsBox) settingsBox.checked = off;
  uiSaveTutor();
  uiRefreshTutor();
}

function uiDismissLesson() {
  if (uiTutorShowing) uiTutorDone[uiTutorShowing] = true;
  uiTutorShowing = null;
  uiSaveTutor();
  uiRefreshTutor();
}

function uiRefreshTutor() {
  const panel = document.getElementById("tutorPanel");
  if (!panel) return;
  if (uiTutorOff) { panel.hidden = true; uiTutorShowing = null; return; }
  if (uiTutorShowing) return;

  const lesson = UI_LESSONS.find((candidate) => !uiTutorDone[candidate.id] && candidate.when());
  if (!lesson) { panel.hidden = true; return; }
  uiTutorShowing = lesson.id;
  document.getElementById("tutorTitle").textContent = lesson.title;
  document.getElementById("tutorBody").textContent = lesson.body;
  panel.hidden = false;
}

// ---------------------------------------------------------------------------
// Block reasons
// ---------------------------------------------------------------------------

function uiBlockReasons() {
  const foodOnLand = typeof territoryAvailable === "function" ? territoryAvailable(territoryFoodTypes()) : 0;
  const woodOnLand = typeof territoryAvailable === "function" ? territoryAvailable(["wood"]) : 0;
  const stoneOnLand = typeof territoryAvailable === "function" ? territoryAvailable(["stone"]) : 0;
  const noHours = "No work hours left — end the turn.";

  const reason = (button, text) => {
    const element = document.getElementById(button);
    if (element) element.dataset.tipBlock = text || "";
  };

  reason("btn_find_timbermellow",
    working_hours <= 0 ? noHours :
    seasonchecker === 4 ? "Nothing grows in winter." :
    foodOnLand <= 0 ? "Nothing left to gather on your land — take more land." : "");
  reason("btn_timbermellow_5x",
    working_hours < 5 ? "Needs 5 work hours." :
    seasonchecker === 4 ? "Nothing grows in winter." :
    foodOnLand < 5 ? "Not enough left on your land." : "");
  reason("btn_wood", working_hours <= 0 ? noHours : woodOnLand <= 0 ? "No wood left on your land." : "");
  reason("btn_wood_5x", working_hours < 5 ? "Needs 5 work hours." : woodOnLand <= 0 ? "No wood left on your land." : "");
  reason("btn_stone", working_hours <= 0 ? noHours : stoneOnLand <= 0 ? "No stone left on your land — stone never grows back." : "");
  reason("btn_stone_5x", working_hours < 5 ? "Needs 5 work hours." : stoneOnLand <= 0 ? "No stone left on your land." : "");
  reason("btn_timbermellow_all",
    working_hours <= 0 ? noHours :
    seasonchecker === 4 ? "Nothing grows in winter." :
    timbermellow_count >= storage_capacity ? "The barns are full — anything more would spoil." :
    foodOnLand <= 0 ? "Nothing left to gather on your land — take more land." : "");
  reason("btn_wood_all", working_hours <= 0 ? noHours : woodOnLand <= 0 ? "No wood left on your land." : "");
  reason("btn_stone_all", working_hours <= 0 ? noHours : stoneOnLand <= 0 ? "No stone left on your land." : "");
  reason("btn_human", working_hours <= 0 ? noHours : timbermellow_count < 3 ? "Needs 3 timbermellows." : "");
  reason("btn_human_5x", working_hours < 5 ? "Needs 5 work hours." : timbermellow_count < 15 ? "Needs 15 timbermellows." : "");
  reason("btn_soldier", humans < 2 ? "Needs a villager to spare — you would be left with none." : "");
  reason("btn_soldier_5x", humans < 5 ? "Needs at least 5 villagers." : "");
  reason("btn_barn", working_hours <= 0 ? noHours : wood < 4 ? "Needs 4 wood." : "");
  reason("btn_house", working_hours <= 0 ? noHours : stone < 2 ? "Needs 2 stone." : "");
  reason("btn_school",
    working_hours < SCHOOL_WORK_HOURS ? `Needs ${SCHOOL_WORK_HOURS} work hours.` :
    wood < SCHOOL_WOOD_COST ? `Needs ${SCHOOL_WOOD_COST} wood.` :
    stone < SCHOOL_STONE_COST ? `Needs ${SCHOOL_STONE_COST} stone.` : "");
  reason("btn_armycamp",
    working_hours < ARMYCAMP_WORK_HOURS ? `Needs ${ARMYCAMP_WORK_HOURS} work hours.` :
    wood < ARMYCAMP_WOOD_COST ? `Needs ${ARMYCAMP_WOOD_COST} wood.` :
    stone < ARMYCAMP_STONE_COST ? `Needs ${ARMYCAMP_STONE_COST} stone.` : "");
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

const UI_KEYS = { "1": "gather", "2": "build", "3": "people", "4": "research", "5": "villages", "6": "empire" };

function uiInstallKeys() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest && event.target.closest("button");
    if (button && event.detail > 0) button.blur();
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea")) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    if (UI_KEYS[event.key]) { uiToggleTab(UI_KEYS[event.key]); event.preventDefault(); return; }
    if (event.key === "7") { toggleLog(); event.preventDefault(); return; }
    if (event.key === " ") { requestEndTurn(); event.preventDefault(); return; }
    if (event.key === "Escape") {
      const log = document.getElementById("logPanel");
      if (log && !log.hidden) { log.hidden = true; return; }
      const settings = document.getElementById("settingsModal");
      if (settings && !settings.hidden) { closeSettingsModal(); return; }
      const codex = document.getElementById("codexModal");
      if (codex && !codex.hidden) { closeCodexModal(); return; }
      const endTurn = document.getElementById("endTurnModal");
      if (endTurn && !endTurn.hidden) { cancelEndTurn(); return; }
      uiToggleTab("menu");
      event.preventDefault();
    }
  });
}

// ---------------------------------------------------------------------------
// Populating static SVG vector icons across the interface
// ---------------------------------------------------------------------------

function uiPopulateStaticIcons() {
  if (typeof getIcon !== "function") return;
  document.querySelectorAll("[data-icon]").forEach((el) => {
    const iconName = el.dataset.icon;
    const extraClass = el.classList.contains("rw-gizmo__icon") ? "game-icon--lg" : "";
    el.innerHTML = getIcon(iconName, extraClass);
  });
}

// ---------------------------------------------------------------------------
// Commercial Game Shell Modals & Triggers
// ---------------------------------------------------------------------------

function startGameFromTitle(loadSaved) {
  const titleScreen = document.getElementById("titleScreen");
  if (titleScreen) {
    titleScreen.classList.add("is-hidden");
    setTimeout(() => { titleScreen.hidden = true; }, 500);
  }
  if (typeof focusVillage === "function") focusVillage();
  // The first time in this browser: how to play, in five lines (js/objectives.js).
  if (typeof objectivesMaybeIntro === "function") setTimeout(objectivesMaybeIntro, 600);
}

function openSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (!modal) return;
  const seedDisp = document.getElementById("settingsSeedDisplay");
  if (seedDisp && typeof worldSeed !== "undefined") seedDisp.textContent = worldSeed;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("is-open"));
}

function closeSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  setTimeout(() => (modal.hidden = true), 260);
}

function openCodexModal() {
  const modal = document.getElementById("codexModal");
  if (!modal) return;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("is-open"));
}

function closeCodexModal() {
  const modal = document.getElementById("codexModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  setTimeout(() => (modal.hidden = true), 260);
}

function copyActiveSeed() {
  if (typeof worldSeed === "undefined") return;
  navigator.clipboard.writeText(String(worldSeed)).then(() => {
    if (typeof updatelog === "function") updatelog(`World seed ${worldSeed} copied to clipboard!`, "good");
  }).catch(() => {
    prompt("World Seed:", String(worldSeed));
  });
}

function applyCustomSeed() {
  const input = document.getElementById("titleSeedInput");
  if (!input || !input.value.trim()) return;
  const seedVal = encodeURIComponent(input.value.trim());
  location.search = `?seed=${seedVal}`;
}

// ---------------------------------------------------------------------------
// Ending the turn
//
// end_turn() itself never asks anything — scripts and tests call it
// directly. The asking lives here, on the way in from the button and the
// space bar, so a turn that would starve somebody stops once and says so.
// ---------------------------------------------------------------------------

let uiPendingEndTurn = false;

function requestEndTurn() {
  const warnings = typeof endTurnWarnings === "function" ? endTurnWarnings() : [];
  if (!warnings.length || uiPendingEndTurn) {
    uiPendingEndTurn = false;
    uiCloseEndTurnWarning();
    end_turn();
    turnReportHide();
    return;
  }
  uiShowEndTurnWarning(warnings);
}

function uiShowEndTurnWarning(warnings) {
  const modal = document.getElementById("endTurnModal");
  if (!modal) { end_turn(); return; }
  const list = document.getElementById("endTurnWarnings");
  if (list) {
    list.innerHTML = warnings.map((warning) => `<li>${warning}</li>`).join("");
  }
  uiPendingEndTurn = true;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("is-open"));
}

function uiCloseEndTurnWarning() {
  const modal = document.getElementById("endTurnModal");
  if (!modal || modal.hidden) return;
  modal.classList.remove("is-open");
  setTimeout(() => { modal.hidden = true; }, 220);
}

function cancelEndTurn() {
  uiPendingEndTurn = false;
  uiCloseEndTurnWarning();
}

function confirmEndTurn() {
  uiCloseEndTurnWarning();
  uiPendingEndTurn = false;
  end_turn();
  turnReportHide();
}

// The animations switch in the menu and in Settings.
function setMotion(on) {
  document.body.classList.toggle("no-motion", !on);
  const menuBox = document.getElementById("toggleMotion");
  const settingsBox = document.getElementById("settingsToggleMotion");
  if (menuBox) menuBox.checked = on;
  if (settingsBox) settingsBox.checked = on;
  try {
    localStorage.setItem("bottomup.motion.v1", on ? "on" : "off");
  } catch (error) { /* private window; the setting just won't stick */ }
}

function uiLoadMotion() {
  let on = true;
  try {
    on = localStorage.getItem("bottomup.motion.v1") !== "off";
  } catch (error) { /* ignored */ }
  setMotion(on);
}

// A one-off message over the map, for code that has no log line to attach to.
function uiToast(text, kind) {
  if (typeof onLogEntry === "function") onLogEntry(text, kind);
}

function toggleHelperFromSettings(checked) {
  uiSetTutorOff(checked);
}

function restartSameSeed() {
  localStorage.removeItem("bottom_up.save.v1");
  if (typeof worldSeed !== "undefined") {
    location.search = `?seed=${worldSeed}`;
  } else {
    location.reload();
  }
}

// ---------------------------------------------------------------------------
// Boot and the per-update refresh
// ---------------------------------------------------------------------------

function uiInit() {
  for (const tab of document.querySelectorAll(".rw-tab")) {
    if (tab.dataset.tab === "log") continue;
    tab.addEventListener("click", () => uiToggleTab(tab.dataset.tab));
  }
  const tutorNext = document.getElementById("tutorNext");
  const tutorClose = document.getElementById("tutorClose");
  const tutorOff = document.getElementById("tutorOff");
  const tutorOffMenu = document.getElementById("tutorOffMenu");

  if (tutorNext) tutorNext.addEventListener("click", uiDismissLesson);
  if (tutorClose) tutorClose.addEventListener("click", uiDismissLesson);
  if (tutorOff) tutorOff.addEventListener("change", (event) => uiSetTutorOff(event.target.checked));
  if (tutorOffMenu) tutorOffMenu.addEventListener("change", (event) => uiSetTutorOff(event.target.checked));

  uiLoadTutor();
  uiLoadMotion();
  uiPopulateStaticIcons();
  uiInstallTooltips();
  uiInstallKeys();
  uiSetTab("gather");
}

function uiRefresh() {
  const year = Math.floor((turngame - 1) / 8) + 1;
  const yearLabel = document.getElementById("text_year");
  if (yearLabel) yearLabel.textContent = year;

  // Unspent hours, always on screen. Every builder game keeps its idle-worker
  // count in front of you, because it is the one number you can always act on.
  const idle = document.getElementById("idleChip");
  if (idle) {
    idle.hidden = working_hours <= 0;
    const count = document.getElementById("idleChipCount");
    if (count) count.textContent = working_hours;
    idle.dataset.tipTitle = `${working_hours} work hours unspent`;
    idle.dataset.tip = "Hours you do not spend are gone when the turn ends. Click to open Gather.";
  }

  const endturn = document.querySelector(".rw-endturn");
  if (endturn) endturn.classList.toggle("rw-endturn--short", timbermellow_count < humans + human_army);

  const research = document.querySelector('.rw-tab[data-tab="research"]');
  if (research) {
    const open = ["stoneaxebt", "foodbasketbt", "farmingbt", "mapmakingbt"]
      .some((id) => { const b = document.getElementById(id); return b && b.style.display !== "none"; });
    research.classList.toggle("rw-tab--nudge", open && uiOpenTab !== "research");
  }

  uiBlockReasons();
  uiRefreshColonists();
  uiRefreshProfessions();
  uiRefreshJobs();
  uiRefreshAlerts();
  if (typeof empireRefresh === "function") empireRefresh();
  uiRefreshTutor();
  if (uiTipTarget) { uiTipTarget = null; uiUpdateTooltip(); }
}
