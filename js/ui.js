// ui.js
//
// The RimWorld-style shell around the game: the colonist bar across the
// top, the command palette and tabs in the bottom-right corner, the alert
// list down the right, the learning helper, and the tooltips that explain
// every button (including *why* a greyed-out one is greyed out).
//
// Nothing in here touches the rules. It reads game.js's globals and the
// map, and calls the same functions the buttons do. game.js calls
// uiRefresh() at the end of update(); main.js calls it after the map loads.
//
// Written in the same plain-globals style as the rest of the game.

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
  uiOpenTab = name;
  const palette = document.getElementById("palette");
  for (const pane of document.querySelectorAll(".rw-pane")) {
    pane.hidden = pane.dataset.pane !== name;
  }
  palette.hidden = !name;
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

// ---------------------------------------------------------------------------
// Tooltips
// ---------------------------------------------------------------------------
//
// Disabled buttons never fire mouse events, and a disabled button is exactly
// the one you most want explained — so the hovered element is looked up from
// the pointer position instead of from an event target.

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
    if (element.id === "mapstage") break;   // the map itself has no tooltip
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
  // Sit above-right of the pointer, and stay on screen.
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

// A tiny head-and-shoulders, varied per villager so the bar reads as people.
function uiPawnPortrait(index, soldier) {
  const skin = UI_SKIN[(index * 7 + 3) % UI_SKIN.length];
  const hair = UI_HAIR[(index * 5 + 1) % UI_HAIR.length];
  const shirt = soldier ? "#6d5533" : UI_SHIRT[(index * 3) % UI_SHIRT.length];
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

  const total = humans + human_army;
  const needed = total;
  const fed = needed > 0 ? Math.min(1, timbermellow_count / needed) : 1;
  const hungry = timbermellow_count < needed;
  const roofless = Math.max(0, humans - peoplecap);
  const key = `${humans}|${human_army}|${Math.round(fed * 20)}|${roofless}|${seasonchecker}`;
  if (key === uiColonistKey) return;
  uiColonistKey = key;

  const shown = Math.min(total, 20);
  let html = "";
  for (let index = 0; index < shown; index++) {
    const soldier = index >= humans;
    const noRoof = !soldier && index >= peoplecap;
    const flags = (hungry ? "⚠" : "") + (noRoof && seasonchecker === 4 ? "❄" : noRoof ? "🌧" : "");
    const tipParts = [];
    tipParts.push(soldier ? "A soldier. Does no work, but escorts expeditions, seizes land and defends the village." : "A villager. Every villager is 4 work hours in spring and autumn, 6 in summer, 2 in winter.");
    if (hungry) tipParts.push("There is not enough in the barns to feed everyone this turn.");
    if (noRoof) tipParts.push("No roof — this one dies of exposure if winter comes.");
    html += `
      <button class="rw-pawn ${soldier ? "rw-pawn--soldier" : ""} ${hungry ? "rw-pawn--hungry" : ""}"
              onclick="uiFocusVillage()"
              data-tip-title="${uiPawnName(index)}${soldier ? " · soldier" : ""}"
              data-tip="${tipParts.join(" ")}">
        <div class="rw-pawn__name">${uiPawnName(index)}</div>
        <div class="rw-pawn__box">
          ${uiPawnPortrait(index, soldier)}
          ${flags ? `<span class="rw-pawn__flags">${flags}</span>` : ""}
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
// Alerts — the red and yellow lines down the right
// ---------------------------------------------------------------------------
//
// Each one names a problem and, when clicked, opens the tab that fixes it.

function uiBuildAlerts() {
  const alerts = [];
  const mouths = humans + human_army;
  const foodOnLand = typeof territoryAvailable === "function" ? territoryAvailable(territoryFoodTypes()) : 0;
  const woodOnLand = typeof territoryAvailable === "function" ? territoryAvailable(["wood"]) : 0;
  const stoneOnLand = typeof territoryAvailable === "function" ? territoryAvailable(["stone"]) : 0;

  if (timbermellow_count < mouths) {
    alerts.push({
      level: "bad", icon: "☠",
      text: `Starvation — ${mouths - timbermellow_count} will go unfed`,
      tip: "Everyone eats one timbermellow when the turn ends. Soldiers starve first, then villagers. Gather more before you end the turn.",
      go: () => uiPointAt("gather", "btn_find_timbermellow"),
    });
  }

  if (garlocks_attacking) {
    alerts.push({
      level: "bad", icon: "⚔",
      text: `Garlock raid on turn ${garlock_incomingattack_turn}`,
      tip: `They come with a strength of ${garlock_strangth} and a defense of ${garlock_defense}. Soldiers are the only thing that stops them; without any, the village is sacked.`,
      go: () => uiPointAt("people", "btn_soldier"),
    });
  }

  if (humans > peoplecap) {
    alerts.push({
      level: seasonchecker >= 3 ? "bad" : "warn", icon: "🏠",
      text: `${humans - peoplecap} without a roof`,
      tip: "Anyone without a roof dies of exposure in winter. Each house shelters 3 and costs 2 stone.",
      go: () => uiPointAt("build", "btn_house"),
    });
  }

  if (timbermellow_count >= storage_capacity && storage_capacity > 0) {
    alerts.push({
      level: "warn", icon: "🏚",
      text: "Barns full — the rest is lost",
      tip: "Anything over your barn space is eaten by the garlocks the moment the turn ends. A barn costs 4 wood and holds 5 more.",
      go: () => uiPointAt("build", "btn_barn"),
    });
  }

  if (timbermellow_count >= 20 && human_army === 0) {
    alerts.push({
      level: "warn", icon: "🛡",
      text: "Full barns, no soldiers",
      tip: "The garlocks start watching once your stores pass 25. Train a soldier before the scouts are seen.",
      go: () => uiPointAt("people", "btn_soldier"),
    });
  }

  if (foodOnLand <= 3 && seasonchecker !== 4) {
    alerts.push({
      level: "warn", icon: "🌰",
      text: "The land is running dry",
      tip: "There is almost nothing left to gather on the tiles you hold. Pick a tile next to your land and explore it.",
      go: () => uiHintExplore(),
    });
  }

  if (woodOnLand <= 0 && wood < 4) {
    alerts.push({
      level: "info", icon: "🪵",
      text: "No wood on your land",
      tip: "Forests and dense bush carry wood. Take a tile that has some.",
      go: () => uiHintExplore(),
    });
  }

  if (stoneOnLand <= 0 && stone < 2) {
    alerts.push({
      level: "info", icon: "🪨",
      text: "No stone on your land",
      tip: "Mountains, rocky outcrops and terraced hills carry stone, and stone never grows back. You will need a tile with some for houses.",
      go: () => uiHintExplore(),
    });
  }

  const techOpen = ["stoneaxebt", "foodbasketbt", "farmingbt", "mapmakingbt"]
    .filter((id) => { const b = document.getElementById(id); return b && b.style.display !== "none"; });
  if (techOpen.length) {
    alerts.push({
      level: "info", icon: "💡",
      text: `${techOpen.length} new idea${techOpen.length > 1 ? "s" : ""}`,
      tip: "Someone in the village has worked something out. Research it before you need it.",
      go: () => uiPointAt("research", techOpen[0]),
    });
  }

  if (working_hours > 0) {
    alerts.push({
      level: "info", icon: "⏱",
      text: `${working_hours} work hour${working_hours > 1 ? "s" : ""} idle`,
      tip: "Unspent hours are gone when the turn ends. Spend them gathering, building or raising people.",
      go: () => uiPointAt("gather", "btn_find_timbermellow"),
    });
  }

  return alerts;
}

function uiRefreshAlerts() {
  const host = document.getElementById("alertList");
  if (!host) return;
  const alerts = uiBuildAlerts();
  host.innerHTML = "";
  alerts.forEach((alert, index) => {
    const button = document.createElement("button");
    button.className = `rw-alert rw-alert--${alert.level}`;
    button.innerHTML = `<span class="rw-alert__icon">${alert.icon}</span><span>${alert.text}</span>`;
    button.dataset.tipTitle = alert.text;
    button.dataset.tip = alert.tip;
    button.dataset.tipCost = "Click to be shown what fixes it.";
    button.onclick = alert.go;
    host.appendChild(button);
    void index;
  });
}

// "Pick a tile and explore it" — select the best frontier tile and say so.
function uiHintExplore() {
  uiSetTab(null);
  if (typeof selectBestFrontier === "function") selectBestFrontier();
}

// ---------------------------------------------------------------------------
// Learning helper
// ---------------------------------------------------------------------------
//
// One lesson at a time, in the order they become true. Dismissed lessons are
// remembered in the browser.

const UI_LESSONS = [
  {
    id: "welcome",
    title: "Your village",
    body: "This is the world, drawn by hand. The gold outline is the land you hold — everything you gather comes off it. Drag to pan, scroll to zoom, click any hex to look at it.",
    when: () => true,
  },
  {
    id: "hours",
    title: "Work hours",
    body: "Bottom right is everything the village can do. Open GATHER and spend your hours — every action costs one. Hours you don't spend are lost when the turn ends.",
    when: () => working_hours > 0,
  },
  {
    id: "endturn",
    title: "Ending the turn",
    body: "When the hours are gone, press END TURN (or hit Space). Everyone eats one timbermellow, the season moves on and the neighbours settle more land.",
    when: () => working_hours <= 0,
  },
  {
    id: "barn",
    title: "Build a barn",
    body: "Your barns only hold so much, and anything over that is eaten the moment the turn ends. Open BUILD and put up a barn — 4 wood each, 5 more spaces each.",
    when: () => wood >= 4,
  },
  {
    id: "explore",
    title: "Taking new land",
    body: "The dashed white hexes are wild land touching yours. Select one and press EXPLORE in the bottom-left panel. It needs 3 villagers, 1 soldier as escort, 10 timbermellows and 4 hours.",
    when: () => humans >= 3 && human_army >= 1,
  },
  {
    id: "winter",
    title: "Winter is coming",
    body: "In winter nothing can be gathered, everyone still eats, and anyone without a roof dies of exposure. Fill the barns and build houses before the snow.",
    when: () => seasonchecker === 3,
  },
  {
    id: "garlocks",
    title: "The garlocks",
    body: "The garlock camp has noticed your stores. When the raid comes, soldiers are the only thing between them and your barns — and without soldiers the village is sacked.",
    when: () => garlocks_attacking,
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
  if (box) box.checked = uiTutorOff;
  if (menuBox) menuBox.checked = uiTutorOff;
}

function uiSaveTutor() {
  try {
    localStorage.setItem(UI_TUTOR_STORE, JSON.stringify({ done: uiTutorDone, off: uiTutorOff }));
  } catch (error) { /* private windows refuse storage; the tips just come back */ }
}

function uiSetTutorOff(off) {
  uiTutorOff = off;
  const box = document.getElementById("tutorOff");
  const menuBox = document.getElementById("tutorOffMenu");
  if (box) box.checked = off;
  if (menuBox) menuBox.checked = off;
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
  if (uiTutorShowing) return;                       // let the player read it

  const lesson = UI_LESSONS.find((candidate) => !uiTutorDone[candidate.id] && candidate.when());
  if (!lesson) { panel.hidden = true; return; }
  uiTutorShowing = lesson.id;
  document.getElementById("tutorTitle").textContent = lesson.title;
  document.getElementById("tutorBody").textContent = lesson.body;
  panel.hidden = false;
}

// ---------------------------------------------------------------------------
// Why a button is greyed out
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
  reason("btn_human", working_hours <= 0 ? noHours : timbermellow_count < 3 ? "Needs 3 timbermellows." : "");
  reason("btn_human_5x", working_hours < 5 ? "Needs 5 work hours." : timbermellow_count < 15 ? "Needs 15 timbermellows." : "");
  reason("btn_soldier", humans < 2 ? "Needs a villager to spare — you would be left with none." : "");
  reason("btn_soldier_5x", humans < 5 ? "Needs at least 5 villagers." : "");
  reason("btn_barn", working_hours <= 0 ? noHours : wood < 4 ? "Needs 4 wood." : "");
  reason("btn_house", working_hours <= 0 ? noHours : stone < 2 ? "Needs 2 stone." : "");
}

// ---------------------------------------------------------------------------
// Keyboard — RimWorld plays from the keyboard too
// ---------------------------------------------------------------------------

const UI_KEYS = { "1": "gather", "2": "build", "3": "people", "4": "research", "5": "villages" };

function uiInstallKeys() {
  // A clicked button keeps the focus, and then Space would press it again
  // as well as ending the turn. Drop the focus after a real mouse click;
  // keyboard focus (event.detail === 0) is left alone.
  document.addEventListener("click", (event) => {
    const button = event.target.closest && event.target.closest("button");
    if (button && event.detail > 0) button.blur();
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea")) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    if (UI_KEYS[event.key]) { uiToggleTab(UI_KEYS[event.key]); event.preventDefault(); return; }
    if (event.key === "6") { toggleLog(); event.preventDefault(); return; }
    if (event.key === " ") { end_turn(); event.preventDefault(); return; }
    if (event.key === "Escape") {
      const log = document.getElementById("logPanel");
      if (!log.hidden) { log.hidden = true; return; }
      uiToggleTab("menu");
      event.preventDefault();
    }
  });
}

// ---------------------------------------------------------------------------
// Boot and the per-update refresh
// ---------------------------------------------------------------------------

function uiInit() {
  for (const tab of document.querySelectorAll(".rw-tab")) {
    if (tab.dataset.tab === "log") continue;       // its own onclick opens the window
    tab.addEventListener("click", () => uiToggleTab(tab.dataset.tab));
  }
  document.getElementById("tutorNext").addEventListener("click", uiDismissLesson);
  document.getElementById("tutorClose").addEventListener("click", uiDismissLesson);
  document.getElementById("tutorOff").addEventListener("change", (event) => uiSetTutorOff(event.target.checked));
  document.getElementById("tutorOffMenu").addEventListener("change", (event) => uiSetTutorOff(event.target.checked));

  uiLoadTutor();
  uiInstallTooltips();
  uiInstallKeys();
  uiSetTab("gather");
}

// Called at the end of game.js's update().
function uiRefresh() {
  const year = Math.floor((turngame - 1) / 8) + 1;
  const yearLabel = document.getElementById("text_year");
  if (yearLabel) yearLabel.textContent = year;

  // End turn turns red when there isn't enough food to go round.
  const endturn = document.querySelector(".rw-endturn");
  if (endturn) endturn.classList.toggle("rw-endturn--short", timbermellow_count < humans + human_army);

  // A tab with something new in it asks to be opened.
  const research = document.querySelector('.rw-tab[data-tab="research"]');
  if (research) {
    const open = ["stoneaxebt", "foodbasketbt", "farmingbt", "mapmakingbt"]
      .some((id) => { const b = document.getElementById(id); return b && b.style.display !== "none"; });
    research.classList.toggle("rw-tab--nudge", open && uiOpenTab !== "research");
  }

  uiBlockReasons();
  uiRefreshColonists();
  uiRefreshAlerts();
  uiRefreshTutor();
  if (uiTipTarget) { uiTipTarget = null; uiUpdateTooltip(); }   // costs may have changed
}
