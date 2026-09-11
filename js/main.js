// main.js
//
// Boots the game and keeps the map and HUD in step with the village:
//
//   1. picks a world seed (from a save, the URL's ?seed=, or at random) and
//      generates the world (worldGen.js)
//   2. paints it (worldPainter.js), lays the hex overlay over it
//      (hexRenderer.js), adds the buildings, the villagers and the sky
//   3. hands the map to territory.js, which game.js gathers from
//   4. reacts to what happens — a "+3" floats up when you gather, an
//      expedition walks out to a tile you take, buildings appear as you
//      build, the neighbours take their turn after yours, the weather
//      follows the season, the game autosaves (save.js)
//
// The map layers live inside #mapviewport, which pans and zooms as one.

let world = null;
let worldSeed = 0;
let hexMap = null;
let hexRenderer = null;
let mapEffects = null;
let villagers = null;
let viewport = null;
let mapGrid = null;
let settlementsKey = "";

const TERRAIN_NAMES = {
  timbermellowForest: "Timbermellow forest",
  forest: "Forest",
  denseBush: "Dense bush",
  flowerMeadow: "Flowering meadow",
  plains: "Plains",
  mountains: "Mountains",
  rockyOutcrop: "Rocky outcrop",
  overgrownHighlands: "Terraced hills",
  river: "River",
};

const RESOURCE_ICONS = {
  timbermellow: "🌰",
  grain: "🌾",
  wood: "🪵",
  stone: "🪨",
  clay: "🏺",
  iron: "⛏️",
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function initGame() {
  const response = await fetch("data/map.json");
  const mapData = await response.json();

  const saved = loadSavedGame();
  const params = new URLSearchParams(location.search);
  if (saved) worldSeed = saved.seed;
  else if (params.get("seed")) worldSeed = Number(params.get("seed")) >>> 0;
  else worldSeed = Math.floor(Math.random() * 1e9);

  world = generateWorld(Object.assign({}, mapData.world, { seed: worldSeed }));
  mapGrid = world.grid;

  // The player's home gets the starting stores from map.json.
  const home = world.tiles.find((tile) => tile.isStartingTile);
  home.resources = mapData.startingTile.resources;

  hexMap = new HexMap({ terrainDefaults: mapData.terrainDefaults, tiles: world.tiles });
  villagesSet(world.villages);
  if (saved) {
    hexMap.deserialize(saved.map);
    villagesSet(saved.villages);
  } else {
    for (const village of world.villages) hexMap.claimTile(village.homeTileId, village.id);
  }
  hexMap.selectTile(home.id);
  territorySetMap(hexMap, mapGrid, onTerritoryChanged);

  const viewBox = { x: 0, y: 0, width: world.width, height: world.height };
  paintWorld(document.getElementById("mapArtworkHost"), world);
  hexRenderer = new HexRenderer(hexMap, document.getElementById("hexMapSvgHost"), {
    hexSize: mapGrid.hexSize,
    origin: { x: mapGrid.originX, y: mapGrid.originY },
    viewBox,
    onTileClick: onHexTileClick,
    ownerColor: villageColor,
  });
  mapEffects = new MapEffects(document.getElementById("mapEffectsHost"), world.width, world.height);
  villagers = new Villagers(document.getElementById("mapVillagersHost"), world, hexMap);
  const village = villageCenter();
  mapEffects.setVillage(village.x, village.y - mapGrid.hexSize * 0.2);

  viewport = setupMapViewport(document.getElementById("mapstage"), document.getElementById("mapviewport"));
  viewport.onChange(drawMinimap);
  document.getElementById("minimap").addEventListener("click", onMinimapClick);
  viewport.focusOn(village, { width: world.width, height: world.height }, 2.4);

  document.getElementById("seedLabel").textContent = worldSeed;

  if (saved) {
    gameSetState(saved.game);
    updatelog(`Welcome back — turn ${saved.game.turngame}, saved ${new Date(saved.savedAt).toLocaleString()}.`, "good");
  } else {
    updatelog("Your village stands in a single timbermellow forest. When it starts to run dry, explore the land around it — and mind the neighbours.", "good");
  }

  uiInit();
  hexRenderer.render();
  refreshTilePanel();
  refreshVillagesPanel();
  update();
  villagers.start();
}

function villageCenter() {
  const tile = hexMap.getAllTiles().find((candidate) => candidate.isStartingTile);
  return worldTileCenter(tile.q, tile.r, mapGrid);
}

// ---------------------------------------------------------------------------
// Reacting to the game
// ---------------------------------------------------------------------------

// Called by territory.js whenever land is claimed, seized, gathered from,
// regrows or is revealed. `event` says which (see territory.js).
function onTerritoryChanged(event) {
  if (!hexRenderer) return;

  if (event && event.kind === "take") {
    if (event.amount > 0 && mapEffects) {
      const village = villageCenter();
      const icon = RESOURCE_ICONS[event.types[0]] || event.types[0];
      mapEffects.floatText(village.x, village.y - mapGrid.hexSize * 0.9, `+${event.amount} ${icon}`, "good");
    }
    refreshTilePanel();
    return;
  }

  if (event && (event.kind === "claim" || event.kind === "seize")) {
    // The land changes hands at once; the banner walking out is decoration.
    hexMap.selectTile(event.tile.id);
    hexRenderer.render();
    refreshTilePanel();
    refreshVillagesPanel();
    refreshSettlements(true);
    drawMinimap();
    if (mapEffects) {
      const from = villageCenter();
      const to = worldTileCenter(event.tile.q, event.tile.r, mapGrid);
      mapEffects.animateExpedition(from, to, event.kind === "seize" ? "#d9534f" : "#f2c14e", null);
    }
    return;
  }

  hexRenderer.render();
  refreshTilePanel();
  drawMinimap();
}

// game.js calls this at the end of end_turn().
function afterTurnEnded() {
  villagesTakeTurn(hexMap, mapGrid, turngame, worldSeed, updatelog);
  hexRenderer.render();
  refreshTilePanel();
  refreshVillagesPanel();
  drawMinimap();
  saveGame(worldSeed);
}

function onHexTileClick(tileId) {
  hexMap.selectTile(tileId);
  hexRenderer.render();
  refreshTilePanel();
}

// game.js calls this from update(): weather, buildings and people follow the numbers.
function refreshMapEffects() {
  if (!mapEffects) return;
  const season = document.getElementById("season").innerText.toLowerCase();
  const stage = document.getElementById("mapstage");
  // Only touch the stage's classes when the season actually changes:
  // rewriting them restyles every sprite on the map.
  if (!stage.classList.contains(`season--${season}`)) {
    mapEffects.setSeason(season);
    for (const name of Array.from(stage.classList)) {
      if (name.startsWith("season--")) stage.classList.remove(name);
    }
    stage.classList.add(`season--${season}`);
  }
  refreshSettlements(false);
  if (villagers) villagers.sync(humans, human_army);
}

// Redraws buildings and roads only when something about them changed.
function refreshSettlements(force) {
  const key = `${stonehouse}|${barn}|${territoryClaimedCount()}`;
  if (!force && key === settlementsKey) return;
  settlementsKey = key;
  paintSettlements(document.getElementById("mapSettlementsHost"), world, hexMap, { houses: stonehouse, barns: barn });
}

// game.js calls this from updatelog(): the newest lines pop up over the map.
function onLogEntry(text, kind) {
  const host = document.getElementById("toasts");
  if (!host) return;
  const toast = document.createElement("div");
  toast.className = "toast" + (kind ? ` toast--${kind}` : "");
  toast.textContent = text;
  host.appendChild(toast);
  while (host.childElementCount > 4) host.firstElementChild.remove();
  setTimeout(() => toast.remove(), 6100);
}

function toggleLog() {
  const panel = document.getElementById("logPanel");
  panel.hidden = !panel.hidden;
  const tab = document.querySelector('.rw-tab[data-tab="log"]');
  if (tab) tab.classList.toggle("is-open", !panel.hidden);
}

// " from the north-east" — where the garlock camp lies, for the raid log.
function garlockDirectionText() {
  const camp = villagesGet().find((village) => village.kind === "garlock");
  if (!camp || !hexMap) return "";
  const home = hexMap.getAllTiles().find((tile) => tile.isStartingTile);
  const campTile = hexMap.getTile(camp.homeTileId);
  if (!home || !campTile) return "";
  return ` from the ${directionBetween(home, campTile, mapGrid)}`;
}

function setMotion(enabled) {
  document.getElementById("mapstage").classList.toggle("no-motion", !enabled);
  if (villagers) (enabled ? villagers.start() : villagers.stop());
}

function newGame() {
  if (!confirm("Start a new world? The current game will be lost.")) return;
  clearSavedGame();
  location.href = `${location.pathname}?seed=${Math.floor(Math.random() * 1e9)}`;
}

function saveNow() {
  updatelog(saveGame(worldSeed) ? "Game saved." : "Could not save — the browser refused storage.", "good");
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------

function drawMinimap(view) {
  const canvas = document.getElementById("minimap");
  if (!canvas || !world || !hexMap) return;
  const context = canvas.getContext("2d");
  const fit = Math.min(canvas.width / world.width, canvas.height / world.height);
  const offsetX = (canvas.width - world.width * fit) / 2;
  const offsetY = (canvas.height - world.height * fit) / 2;
  const dot = Math.max(2, mapGrid.hexSize * fit * 1.7);

  context.fillStyle = "#0d1014";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const tile of hexMap.getAllTiles()) {
    const c = worldTileCenter(tile.q, tile.r, mapGrid);
    const x = offsetX + c.x * fit;
    const y = offsetY + c.y * fit;
    context.fillStyle = hexMap.isRevealed(tile.id) ? (TERRAIN_FILL[tile.terrainType] || "#888") : "#1b2029";
    context.fillRect(x - dot / 2, y - dot / 2, dot, dot);
    if (tile.owner && hexMap.isRevealed(tile.id)) {
      context.strokeStyle = tile.owner === "player" ? "#f2c14e" : villageColor(tile.owner);
      context.lineWidth = 1;
      context.strokeRect(x - dot / 2 + 0.5, y - dot / 2 + 0.5, dot - 1, dot - 1);
    }
  }

  // The part of the world on screen.
  const current = view || (viewport && viewport.getView());
  if (current && current.width) {
    const stageFit = Math.min(current.width / world.width, current.height / world.height);
    const stageOffsetX = (current.width - world.width * stageFit) / 2;
    const stageOffsetY = (current.height - world.height * stageFit) / 2;
    const toWorld = (stageX, stageY) => [(stageX - stageOffsetX) / stageFit, (stageY - stageOffsetY) / stageFit];
    const [x0, y0] = toWorld(-current.translateX / current.scale, -current.translateY / current.scale);
    const [x1, y1] = toWorld((current.width - current.translateX) / current.scale, (current.height - current.translateY) / current.scale);
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.5;
    context.strokeRect(offsetX + x0 * fit, offsetY + y0 * fit, (x1 - x0) * fit, (y1 - y0) * fit);
  }
}

function onMinimapClick(event) {
  const canvas = event.currentTarget;
  const bounds = canvas.getBoundingClientRect();
  const fit = Math.min(canvas.width / world.width, canvas.height / world.height);
  const offsetX = (canvas.width - world.width * fit) / 2;
  const offsetY = (canvas.height - world.height * fit) / 2;
  const x = (event.clientX - bounds.left - offsetX) / fit;
  const y = (event.clientY - bounds.top - offsetY) / fit;
  const current = viewport.getView();
  viewport.focusOn({ x, y }, { width: world.width, height: world.height }, Math.max(1.6, current.scale));
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function refreshTilePanel() {
  const info = document.getElementById("tileInfo");
  const button = document.getElementById("exploreButton");
  const reason = document.getElementById("exploreReason");
  const focusButton = document.getElementById("focusButton");
  if (!info || !hexMap) return;

  const tile = hexMap.getSelectedTile();
  if (focusButton) focusButton.disabled = !tile;

  if (!tile) {
    info.innerHTML = `
      <div class="rw-tileinfo__name">Nothing selected</div>
      <div class="rw-tileinfo__state">Click any hex on the map to look at it.</div>`;
    setTileGizmo(button, "\u{1F6A9}", "Explore", false);
    button.disabled = true;
    button.dataset.tipBlock = "Nothing selected.";
    reason.textContent = "";
    reason.className = "rw-reason";
    return;
  }

  const claimed = hexMap.isClaimed(tile.id);
  const frontier = hexMap.isFrontier(tile.id);
  const revealed = hexMap.isRevealed(tile.id);
  const foreign = tile.owner && tile.owner !== "player";

  if (!revealed) {
    info.innerHTML = `
      <div class="rw-tileinfo__name">Unknown land</div>
      <div class="rw-tileinfo__state">Blank paper — the world has not been drawn here yet. Your land has to reach it, or you have to learn mapmaking.</div>`;
  } else {
    let state = "Wild land";
    let stateClass = "";
    if (claimed) { state = tile.isStartingTile ? "Your village" : "Your land"; stateClass = "rw-tileinfo__state--claimed"; }
    else if (foreign) { state = `${villageName(tile.owner)}'s land`; stateClass = "rw-tileinfo__state--foreign"; }
    else if (frontier) { state = "Next to your land — can be explored"; stateClass = "rw-tileinfo__state--frontier"; }

    const chip = foreign ? `<i class="chip" style="background:${villageColor(tile.owner)}"></i>` : "";
    info.innerHTML = `
      <div class="rw-tileinfo__name">${TERRAIN_NAMES[tile.terrainType] || tile.terrainType}</div>
      <div class="rw-tileinfo__state ${stateClass}">${chip}${state}</div>
      ${resourceBars(tile)}`;
  }

  // One gizmo, two jobs: explore wild land, seize another village's.
  if (foreign) {
    const blocker = territorySeizeBlocker(tile.id);
    const cost = `${territorySeizeSoldiersNeeded(tile.id)} soldiers (one never comes back) \u00b7 ${SEIZE_FOOD_COST} \u{1F330} \u00b7 ${SEIZE_WORK_HOURS} hours`;
    setTileGizmo(button, "\u2694", "Seize", true);
    button.onclick = seize;
    button.disabled = !!blocker;
    button.dataset.tipTitle = `Seize this land from ${villageName(tile.owner)}`;
    button.dataset.tip = "Your soldiers march out and take the tile. You can take the land around a village, but never the village itself.";
    button.dataset.tipCost = cost;
    button.dataset.tipBlock = blocker || "";
    reason.textContent = blocker || `Costs ${cost}.`;
    reason.className = blocker ? "rw-reason rw-reason--blocked" : "rw-reason";
  } else {
    const blocker = territoryExploreBlocker(tile.id);
    const cost = `${EXPLORE_MIN_HUMANS} villagers \u00b7 ${EXPLORE_MIN_SOLDIERS} soldier escort \u00b7 ${EXPLORE_FOOD_COST} \u{1F330} \u00b7 ${EXPLORE_WORK_HOURS} hours`;
    setTileGizmo(button, "\u{1F6A9}", "Explore", false);
    button.onclick = explore;
    button.disabled = !!blocker;
    button.dataset.tipTitle = "Send an expedition";
    button.dataset.tip = "The tile becomes yours, whatever grows on it joins your stores-on-land, and the land beyond it comes into view.";
    button.dataset.tipCost = cost;
    button.dataset.tipBlock = blocker || "";
    reason.textContent = blocker || `Costs ${cost}.`;
    reason.className = blocker ? "rw-reason rw-reason--blocked" : "rw-reason";
  }
}

// The Explore/Seize gizmo keeps its icon and its colour in step with its job.
function setTileGizmo(button, icon, label, danger) {
  button.innerHTML = `<span class="rw-gizmo__icon">${icon}</span><span class="rw-gizmo__label">${label}</span>`;
  button.classList.toggle("rw-gizmo--danger", !!danger);
  button.classList.toggle("rw-gizmo--go", !danger);
}

function resourceBars(tile) {
  const types = Object.keys(tile.resources);
  if (!types.length) return `<div class="rw-tileinfo__empty">Nothing to gather here.</div>`;
  return types.map((type) => {
    const entry = tile.resources[type];
    const percent = entry.max ? Math.round((entry.amount / entry.max) * 100) : 0;
    const note = entry.renewable ? "regrows every autumn" : "never grows back";
    return `
      <div class="bar">
        <span>${RESOURCE_ICONS[type] || ""} ${type} <small>${note}</small></span>
        <b>${entry.amount} / ${entry.max}</b>
        <div class="bar__track"><div class="bar__fill ${entry.renewable ? "" : "bar__fill--finite"}" style="width:${percent}%"></div></div>
      </div>`;
  }).join("");
}

function refreshVillagesPanel() {
  const list = document.getElementById("villageList");
  if (!list || !hexMap) return;
  const kinds = { player: "you", rival: "rival village", garlock: "garlocks" };
  list.innerHTML = villagesGet().map((village) => {
    const tiles = hexMap.getTilesOwnedBy(village.id).length;
    const known = village.kind === "player" || hexMap.isRevealed(village.homeTileId);
    return `
      <li class="villagerow ${known ? "" : "villagerow--unknown"}">
        <i class="chip" style="background:${village.color}"></i>
        <span class="villagerow__name">${known ? village.name : "An unknown village"}</span>
        <span class="villagerow__kind">${kinds[village.kind] || village.kind}</span>
        <b class="villagerow__tiles">${known ? tiles : "?"} \u2B21</b>
      </li>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Taking the player somewhere — the alerts and the colonist bar use these
// ---------------------------------------------------------------------------

function focusVillage() {
  if (!viewport) return;
  const current = viewport.getView();
  viewport.focusOn(villageCenter(), { width: world.width, height: world.height }, Math.max(2.2, current.scale));
}

function focusSelectedTile() {
  if (!viewport || !hexMap) return;
  const tile = hexMap.getSelectedTile();
  if (!tile) return;
  const current = viewport.getView();
  viewport.focusOn(worldTileCenter(tile.q, tile.r, mapGrid), { width: world.width, height: world.height }, Math.max(2.2, current.scale));
}

// Picks the richest tile the village could explore next, selects it and brings
// it on screen — so "the land is running dry" has somewhere to point.
function selectBestFrontier() {
  if (!hexMap) return;
  const frontier = hexMap.getAllTiles().filter((tile) => hexMap.isFrontier(tile.id) && !tile.owner);
  if (!frontier.length) return;
  const worth = (tile) => Object.values(tile.resources || {}).reduce((total, entry) => total + (entry.amount || 0), 0);
  frontier.sort((a, b) => worth(b) - worth(a));
  onHexTileClick(frontier[0].id);
  focusSelectedTile();
}

window.addEventListener("DOMContentLoaded", initGame);
