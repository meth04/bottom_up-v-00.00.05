// main.js (ES module)
//
// Boots the game and keeps the living world and the HUD in step with the
// village:
//
//   1. picks a world seed (from a save, the URL's ?seed=, or at random) and
//      generates the world off the main thread (js/world/worldGen.worker.js)
//   2. wraps it in a HexMap, founds the villages, lays the old trade tracks
//      as roads, and builds the towns and work sites on the land
//   3. starts the PixiJS renderer (js/engine/renderer.js), the agent
//      simulation (carts, boats, villagers, wildlife) and the weather
//   4. bridges the two halves of the code base: the rules live in classic
//      global scripts (game.js, territory.js, ages.js, ...) that expect a
//      handful of functions and objects on `window`; everything they need
//      from the map is assigned there from here, and everything the map
//      needs from the rules is read through small accessor functions.
//
// Nothing in js/world or js/engine touches a legacy global directly.

import { HEX_SIZE, SAVE_VERSION, ZOOM_MAX } from "./world/constants.js";
import {
  hexKey, hexSpiral, worldTileCenter, worldPointToAxial, createRandom, hexDistance,
} from "./world/hexMath.js";
import { TERRAIN, TERRAIN_NAMES, isWaterTerrain } from "./world/terrainDefs.js";
import { HexMap } from "./world/hexMap.js";
import { RoadNetwork } from "./world/roads.js";
import { Improvements, IMPROVEMENTS } from "./world/improvements.js";
import { AgentSim } from "./world/agents.js";
import { WeatherModel } from "./world/weather.js";
import { detectDevice, qualityFor } from "./engine/device.js";
import { createWorldRenderer } from "./engine/renderer.js";
import { Minimap } from "./engine/minimap.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let world = null;
let worldSeed = 0;
let hexMap = null;
let renderer = null;
let roads = null;
let improvements = null;
let sim = null;
let weather = null;
let minimap = null;
let device = null;
let quality = null;

// The map tool the player is holding: null | { mode: "build", type } |
// { mode: "road", from: tileId|null }
let mapTool = null;
let hoveredTileId = null;
let roadPreview = null;
let currentLens = null;
let gridOn = false;

const RESOURCE_ICONS = { timbermellow: "🌰", grain: "🌾", wood: "🪵", stone: "🪨" };

// What the map tools cost. Town buildings pay through the legacy buttons
// (make_house etc.); these are the work sites and roads that only exist
// once the player is allowed to plan the land.
const SITE_COST = { wood: 3, hours: 1 };
const ROAD_COST_PER_TILE = { wood: 1 };
const ROAD_HOURS_PER_TILES = 4;

// ---------------------------------------------------------------------------
// Legacy accessors. The rules scripts keep their state in top-level `let`
// bindings of classic scripts, which are NOT window properties, so a module
// cannot read them by name. They are read through an indirect eval-free
// accessor the legacy side installs (js/bridge.js), with safe fallbacks.
// ---------------------------------------------------------------------------

function legacy() {
  return typeof window.legacyState === "function" ? window.legacyState() : {};
}

function seasonIndex() {
  const state = legacy();
  return state.seasonchecker || 1;
}

function callLegacy(name, ...args) {
  const fn = window[name];
  return typeof fn === "function" ? fn(...args) : undefined;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function bootStage(caption, fraction) {
  const screen = document.getElementById("bootScreen");
  if (!screen) return;
  const label = document.getElementById("bootCaption");
  const bar = document.getElementById("bootBarFill");
  if (label) label.textContent = caption;
  if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
}

function bootDone() {
  const screen = document.getElementById("bootScreen");
  if (!screen) return;
  screen.classList.add("is-gone");
  setTimeout(() => { screen.hidden = true; }, 700);
}

function bootFailed(error) {
  console.error(error);
  const label = document.getElementById("bootCaption");
  if (label) {
    label.textContent = `Could not start: ${error && error.message ? error.message : error}`;
    label.style.color = "#b83928";
  }
  // T5: a dead boot gets a Retry button instead of a dead screen.
  const bar = document.getElementById("bootBarFill");
  if (bar && bar.parentElement && !document.getElementById("bootRetryBtn")) {
    const btn = document.createElement("button");
    btn.id = "bootRetryBtn";
    btn.className = "rw-btn";
    btn.textContent = "Try again";
    btn.style.marginTop = "12px";
    btn.onclick = () => location.reload();
    bar.parentElement.after(btn);
  }
}

// T5: ?seed=abc used to become 0 silently. Now: digits only, else random
// with a visible note, so shared seeds always reproduce.
function parseSeedParam(value) {
  if (value == null || value === "") return null;
  const trimmed = String(value).trim();
  if (!/^\d{1,10}$/.test(trimmed)) return { invalid: true, raw: trimmed };
  const num = Number(trimmed) >>> 0;
  return { seed: num };
}

// Generates the world in a worker so the boot screen keeps animating.
// Falls back to the main thread if workers are unavailable (file:// pages).
// T4: 20s watchdog — a hung worker falls back instead of hanging the boot.
function generateWorldAsync(spec) {
  return new Promise((resolve, reject) => {
    let worker = null;
    let settled = false;
    const finish = (fn) => (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };
    const done = finish(resolve);
    const fail = finish(reject);
    const fallbackToMainThread = () => {
      import("./world/worldGen.js")
        .then(({ generateWorld }) => done(generateWorld(spec, (fraction, caption) => bootStage(caption, 0.1 + fraction * 0.4))))
        .catch(fail);
    };
    const timer = typeof setTimeout === "function" ? setTimeout(() => {
      if (settled) return;
      try {
        if (worker) worker.terminate();
      } catch (error) {
        // terminating a dead worker is fine
      }
      worker = null;
      fallbackToMainThread();
    }, 20000) : null;
    try {
      worker = new Worker(new URL("./world/worldGen.worker.js", import.meta.url), { type: "module" });
    } catch (error) {
      worker = null;
    }
    if (!worker) {
      fallbackToMainThread();
      return;
    }
    worker.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === "progress") {
        bootStage(message.caption || "Raising the land out of the sea…", 0.1 + (message.fraction || 0) * 0.4);
      } else if (message.type === "done") {
        try {
          worker.terminate();
        } catch (error) {
          // already gone
        }
        done(message.world);
      } else if (message.type === "error") {
        try {
          worker.terminate();
        } catch (error) {
          // already gone
        }
        // T4: worker errors fall back to main thread instead of a dead boot.
        fallbackToMainThread();
      }
    };
    worker.onerror = (event) => {
      try {
        worker.terminate();
      } catch (error) {
        // already gone
      }
      // A worker that cannot even start (old browser, blocked module
      // workers) is not fatal: do the work here instead.
      fallbackToMainThread();
    };
    worker.postMessage({ spec });
  });
}

async function initGame() {
  try {
    await boot();
  } catch (error) {
    bootFailed(error);
  }
}

async function boot() {
  bootStage("Unrolling the paper…", 0.04);
  const response = await fetch("data/map.json");
  const mapData = await response.json();

  device = detectDevice();
  quality = qualityFor(device.tier);
  const params = new URLSearchParams(location.search);
  const preferred = params.get("quality") || qualityPreference();
  if (preferred && preferred !== "auto") quality = qualityFor(preferred);
  const qualitySelect = document.getElementById("settingsQuality");
  if (qualitySelect) qualitySelect.value = preferred || "auto";

  const saved = callLegacy("loadSavedGame");
  // T5: validate ?seed= — digits only. Bad seeds fall back to random and
  // say so on the boot card instead of silently becoming world 0.
  const seedParam = parseSeedParam(params.get("seed"));
  if (seedParam && seedParam.invalid) {
    bootStage(`Ignoring bad seed "${seedParam.raw}" — rolling a fresh world…`, 0.06);
  }
  if (saved) worldSeed = saved.seed >>> 0;
  else if (seedParam && !seedParam.invalid && seedParam.seed != null) worldSeed = seedParam.seed >>> 0;
  else worldSeed = Math.floor(Math.random() * 1e9);

  const titleScreen = document.getElementById("titleScreen");
  const continueBtn = document.getElementById("btnContinueGame");
  if (continueBtn && saved) continueBtn.style.display = "flex";
  if (params.get("seed") || location.hash.includes("stop-after-explore")) {
    if (titleScreen) {
      titleScreen.classList.add("is-hidden");
      titleScreen.hidden = true;
    }
  }

  bootStage("Raising the land out of the sea…", 0.1);
  await nextFrame();
  const spec = Object.assign({}, mapData.world, { seed: worldSeed });
  world = await generateWorldAsync(spec);

  // The player's home gets the starting stores from map.json.
  const home = world.tiles.find((tile) => tile.isStartingTile);
  home.resources = mapData.startingTile.resources;

  bootStage("Counting what grows on it…", 0.52);
  await nextFrame();
  hexMap = new HexMap({ cols: world.cols, rows: world.rows, terrainDefaults: mapData.terrainDefaults, tiles: world.tiles });
  installBridge();

  callLegacy("villagesSet", world.villages);
  hexMap.beginBatch();
  // T5: never trust a save whose world no longer matches this generator.
  // Mismatched saves start fresh on the new world instead of loading
  // sideways onto wrong tiles.
  let useSave = saved;
  try {
    if (saved && typeof saveWorldMismatch === "function" && saveWorldMismatch(saved, worldSeed, world)) {
      useSave = null;
      bootStage("Old save did not match this world — starting fresh…", 0.5);
      try {
        if (typeof updatelog === "function") updatelog("An old save did not match this world, so a fresh village was founded.", "bad");
      } catch (error) {
        // log not ready during boot; the boot caption already said it
      }
    }
  } catch (error) {
    useSave = saved;
  }
  if (useSave) {
    hexMap.deserialize(useSave.map);
    callLegacy("villagesSet", useSave.villages);
  } else {
    for (const village of world.villages) {
      callLegacy("territoryFoundVillage", hexMap, village.homeTileId, village.id);
    }
    // The old tracks between the villages are real roads from day one:
    // carts use them, and a village they reach is a trade partner.
    for (const route of world.tradeRoutes || []) hexMap.addRoadPath(route.tileIds);
  }
  hexMap.selectTile(home.id);
  hexMap.endBatch();
  callLegacy("territorySetMap", hexMap, world.grid, onTerritoryChanged);
  // T5: persist the fresh world immediately so a reload before turn 1 keeps
  // the same seed instead of rolling a new one. Best-effort; quotas/private
  // windows just mean the next boot rolls again.
  if (!useSave) {
    try {
      callLegacy("saveGame", worldSeed);
    } catch (error) {
      // boot continues unsaved
    }
  }

  roads = new RoadNetwork(hexMap);
  improvements = new Improvements(hexMap, roads);
  window.roadNetwork = roads;
  window.improvements = improvements;

  bootStage("Waking the engine…", 0.6);
  await nextFrame();
  const host = document.getElementById("mapstage");
  renderer = await createWorldRenderer({
    host,
    world,
    hexMap,
    villages: () => callLegacy("villagesGet") || [],
    quality,
    callbacks: {
      onTileClick: onTileClick,
      onTileLongPress: onTileLongPress,
      onTileHover: onTileHover,
      onViewChange: onViewChange,
      onFps: onFps,
    },
  });
  window.renderer = renderer;

  weather = new WeatherModel(worldSeed);
  renderer.setWeather(weather);

  bootStage("Setting out the villages…", 0.8);
  await nextFrame();
  minimap = new Minimap(document.getElementById("minimap"), world, hexMap, () => callLegacy("villagesGet") || []);
  // T-fix: no free scouting — clicks into unseen parchment stay put.
  minimap.onClick((x, y) => {
    try {
      const tile = typeof tileAtWorld === "function" ? tileAtWorld(x, y) : null;
      if (tile && hexMap && typeof hexMap.isRevealed === "function" && !hexMap.isRevealed(tile.id) && !hexMap.mapmakingUnlocked) return;
    } catch (error) {
      // mapping failed; fall through to the focus
    }
    renderer.camera.focusOn(x, y, undefined, { animate: true });
  });
  renderer.camera.onChange((view) => minimap.draw(view));

  const seedLabel = document.getElementById("seedLabel");
  if (seedLabel) seedLabel.textContent = worldSeed;
  const settingsSeed = document.getElementById("settingsSeedDisplay");
  if (settingsSeed) settingsSeed.textContent = worldSeed;

  if (saved) {
    callLegacy("gameSetState", saved.game);
    if (saved.raids) callLegacy("raidsSetState", saved.raids);
    if (saved.objectives) callLegacy("objectivesSetState", saved.objectives);
    callLegacy("updatelog", `Welcome back — turn ${saved.game.turngame}, saved ${new Date(saved.savedAt).toLocaleString()}.`, "good");
  } else {
    callLegacy("updatelog", "Your village stands in a single timbermellow grove. When it starts to run dry, explore the land around it — and mind the neighbours.", "good");
  }
  // T-fix: restore view state saved alongside the game (lens/grid/selected).
  try {
    if (saved && saved.view) {
      if (saved.view.lens) setMapLens(saved.view.lens);
      if (saved.view.grid && !gridOn) toggleMapGrid();
      if (saved.view.selected && hexMap && typeof hexMap.getTile === "function" && hexMap.getTile(saved.view.selected)) {
        hexMap.selectTile(saved.view.selected);
      }
    }
  } catch (error) {
    // view restore is cosmetic; the game stands without it
  }

  // Towns and work sites for everyone, then the people who live in them.
  syncAllSettlements(true);
  sim = new AgentSim({ world, hexMap, roads, improvements, quality });
  renderer.setAgentSource(sim);
  syncPopulation();

  const centre = villageCenter();
  renderer.camera.focusOn(centre.x, centre.y, 1.25, { animate: false });

  bootStage("Ready.", 1);
  installMapTools();
  callLegacy("uiInit");
  refreshTilePanel();
  refreshVillagesPanel();
  callLegacy("update");
  callLegacy("turnSnapshotTake");
  minimap.invalidate();
  minimap.draw(currentView());
  startSiteIncome();
  window.addEventListener("resize", () => { if (renderer) renderer.resize(); });
  // T6 portal: pause the ticker when the page loses focus (portal iframe
  // blur does not always set document.hidden). Resume resets the FPS meter
  // so one huge frame never trips adaptive quality.
  installPauseOnBlur();
  await nextFrame();
  bootDone();
}

// T6: portals bury games in iframes — blur/focus is the reliable pause signal.
function installPauseOnBlur() {
  if (installPauseOnBlur.done) return;
  installPauseOnBlur.done = true;
  const stop = () => {
    try {
      if (renderer && renderer.app && renderer.app.ticker) renderer.app.ticker.stop();
    } catch (error) {
      // already stopped
    }
  };
  const start = () => {
    try {
      if (renderer && renderer.app && renderer.app.ticker) {
        renderer.app.ticker.start();
        // Drop the hitch frame from the meter (see device.js FpsMeter).
        if (typeof onFps === "function") onFps(60, 16.7, quality || { tier: "mid" });
      }
    } catch (error) {
      // will resume on next frame anyway
    }
  };
  window.addEventListener("blur", stop);
  window.addEventListener("focus", start);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });
}

function currentView() {
  const camera = renderer.camera;
  return { x: camera.x, y: camera.y, zoom: camera.zoom, bounds: camera.getBounds() };
}

// ---------------------------------------------------------------------------
// The bridge: what the legacy scripts reach for on window
// ---------------------------------------------------------------------------

function installBridge() {
  Object.assign(window, {
    // hex maths the rules use to found villages and claim districts
    hexKey, hexSpiral, worldTileCenter, createRandom, hexDistance,
    // the map itself
    hexMap, world, mapGrid: world.grid, worldSeed,
    TERRAIN_NAMES,
    // functions the rules and the HTML call by name
    refreshTilePanel, refreshVillagesPanel, refreshMapEffects, afterTurnEnded,
    onHexTileClick, onLogEntry, toggleLog, focusVillage, focusSelectedTile,
    selectBestFrontier, saveNow, newGame, garlockDirectionText, onGarlockRaid,
    raidFromPanel, onRaidLaunched, onRaidIncoming, onRaidResolved, focusVillageById,
    homeTile, villageCenter, regionOfTile, terrainClimateNote,
    tileAtWorld, setMapLens, toggleMapGrid, setMapTool, cancelMapTool, toggleFpsMeter,
    toggleLensMenu, toggleBuildPalette, toggleRoadTool, setQualityPreference,
  });
}

// The Settings dialog's detail level. "auto" lets device.js decide; a fixed
// level is remembered and applied on the next load (the renderer is built
// once, so switching live would mean rebuilding every layer).
function setQualityPreference(value) {
  try {
    if (value === "auto") localStorage.removeItem("bottomup.quality.v1");
    else localStorage.setItem("bottomup.quality.v1", value);
  } catch (error) { /* private window */ }
  callLegacy("updatelog", value === "auto" ? "Map detail will be picked automatically next time the game loads." : `Map detail set to ${value} — it applies the next time the game loads.`, "good");
}

function qualityPreference() {
  try {
    return localStorage.getItem("bottomup.quality.v1") || "auto";
  } catch (error) {
    return "auto";
  }
}

function toggleLensMenu() {
  const menu = document.getElementById("lensMenu");
  if (menu) menu.hidden = !menu.hidden;
}

function toggleRoadTool() {
  if (!toolsUnlocked()) return;
  setMapTool(mapTool && mapTool.mode === "road" ? null : { mode: "road", from: null });
}

let homeTileCache = null;

function homeTile() {
  if (!homeTileCache && hexMap) {
    homeTileCache = hexMap.getAllTiles().find((candidate) => candidate.isStartingTile) || null;
  }
  return homeTileCache;
}

function villageCenter() {
  const tile = homeTile();
  return tile ? worldTileCenter(tile.q, tile.r, world.grid) : { x: 0, y: 0 };
}

function regionOfTile(tile) {
  if (!world || !tile || !tile.regionId) return null;
  return (world.regions || []).find((region) => region.id === tile.regionId) || null;
}

function continentOfTile(tile) {
  if (!world || !tile || tile.continentId === null || tile.continentId < 0) return null;
  return (world.continents || []).find((continent) => continent.id === tile.continentId) || null;
}

function tileAtWorld(x, y) {
  if (!hexMap || !world) return null;
  const axial = worldPointToAxial(x, y, world.grid);
  return hexMap.getTileAt(axial.q, axial.r);
}

function terrainClimateNote(tile) {
  if (!tile) return "";
  const parts = [];
  if (tile.temperature !== undefined) {
    parts.push(tile.temperature < 0.15 ? "frozen" : tile.temperature < 0.35 ? "cold" :
               tile.temperature > 0.85 ? "parched" : tile.temperature > 0.65 ? "warm" : "temperate");
  }
  if (tile.moisture !== undefined) {
    parts.push(tile.moisture > 0.65 ? "wet" : tile.moisture < 0.38 ? "dry" : "well-watered");
  }
  if (tile.elevation !== undefined) {
    parts.push(tile.elevation > 0.72 ? "high ground" : tile.elevation < 0.32 ? "lowland" : "rolling");
  }
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Keeping the world in step with the rules
// ---------------------------------------------------------------------------

function playerCounters() {
  const state = legacy();
  const defences = callLegacy("raidDefenceCounters") || {};
  return {
    houses: state.stonehouse || 1,
    barns: state.barn || 1,
    schools: state.school || 0,
    camps: state.armycamp || 0,
    palisades: defences.palisades || 0,
    watchtowers: defences.watchtowers || 0,
  };
}

let pendingPlacementTile = null;

function syncAllSettlements(force) {
  if (!improvements) return;
  const state = legacy();
  improvements.syncTown("player", playerCounters(), pendingPlacementTile);
  pendingPlacementTile = null;
  improvements.syncWorkSites("player", { farming: (state.farming_made || 0) > 0 });
  for (const village of callLegacy("villagesGet") || []) {
    if (village.kind === "player") continue;
    if (!force && !hexMap.isRevealed(village.homeTileId)) continue;
    improvements.syncRival(village, hexMap.countOwnedBy(village.id));
  }
}

function syncPopulation() {
  if (!sim) return;
  const state = legacy();
  sim.syncPopulation({
    humans: state.humans || 0,
    soldiers: state.human_army || 0,
    trades: state.professionCounts || {},
    season: seasonIndex(),
  });
}

// game.js calls this from update(): weather, buildings and people follow the numbers.
let lastSeasonName = "";

function refreshMapEffects() {
  if (!renderer) return;
  const seasonName = document.getElementById("season").innerText.toLowerCase();
  const stage = document.getElementById("mapstage");
  if (seasonName !== lastSeasonName) {
    const changed = lastSeasonName !== "";
    lastSeasonName = seasonName;
    renderer.setSeason(seasonIndex());
    if (weather) weather.setSeason(seasonIndex());
    for (const name of Array.from(stage.classList)) {
      if (name.startsWith("season--")) stage.classList.remove(name);
    }
    stage.classList.add(`season--${seasonName}`);
    if (changed) {
      const year = Math.floor(((legacy().turngame || 1) - 1) / 8) + 1;
      callLegacy("showSeasonBanner", seasonName, year);
    }
  }
  syncAllSettlements(false);
  syncPopulation();
  refreshToolBar();
}

// Called by territory.js whenever land is claimed, seized, gathered from,
// regrows or is revealed.
function onTerritoryChanged(event) {
  if (!renderer) return;

  if (event && event.kind === "take") {
    if (event.amount > 0) {
      callLegacy("spawnFloatingReward", `+${event.amount}`, event.types[0]);
      const centre = villageCenter();
      renderer.floatText(centre.x, centre.y - HEX_SIZE * 1.4, `+${event.amount} ${RESOURCE_ICONS[event.types[0]] || event.types[0]}`, "good");
      if (sim) sim.onEvent({ kind: "gather", type: event.types[0], amount: event.amount });
    }
    refreshTilePanel();
    return;
  }

  if (event && (event.kind === "claim" || event.kind === "seize")) {
    hexMap.selectTile(event.tile.id);
    renderer.setSelected(event.tile.id);
    refreshTilePanel();
    refreshVillagesPanel();
    syncAllSettlements(false);
    minimap.invalidate();
    const from = villageCenter();
    const to = worldTileCenter(event.tile.q, event.tile.r, world.grid);
    renderer.animateExpedition(from, to, event.kind === "seize" ? "#d9534f" : "#f2c14e", null);
    if (sim) sim.onEvent({ kind: event.kind, tileId: event.tile.id });
    return;
  }

  if (event && event.kind === "reveal") {
    renderer.refreshAll();
    syncAllSettlements(true);
  }
  refreshTilePanel();
  minimap.invalidate();
}

// game.js calls this at the end of end_turn().
function afterTurnEnded() {
  const state = legacy();
  // Raids resolve first: the warbands that set out last turn arrive before
  // anybody settles new land (js/raids.js).
  callLegacy("raidsTakeTurn");
  callLegacy("villagesTakeTurn", hexMap, world.grid, state.turngame, worldSeed, window.updatelog);
  const partners = callLegacy("territoryTradeTurn");
  if (partners && partners.length && sim) sim.onEvent({ kind: "trade", partners });
  syncAllSettlements(false);
  refreshTilePanel();
  refreshVillagesPanel();
  minimap.invalidate();
  // Raids and trade changed the stores after update() ran: redraw the HUD
  // so the alert list and the readout are not a turn behind.
  callLegacy("update");
  callLegacy("saveGame", worldSeed);

  const after = legacy();
  if ((after.humans || 0) <= 0 && (after.human_army || 0) <= 0) {
    const year = Math.floor((after.turngame - 1) / 8) + 1;
    callLegacy("showGameOverScreen",
      "Famine and the bitter elements have claimed the final settler. The fires in the village have gone cold.",
      { year, turns: after.turngame, tiles: hexMap.countClaimed() });
    return;
  }
  if (callLegacy("raidsCheckVictory") === true) {
    const report = callLegacy("raidsContinentReport") || {};
    callLegacy("showVictoryScreen", {
      year: Math.floor((after.turngame - 1) / 8) + 1,
      turns: after.turngame,
      tiles: hexMap.countClaimed(),
      vassals: report.vassals || 0,
      raidsWon: report.raidsWon || 0,
    });
  }
}

// ---------------------------------------------------------------------------
// Real-time income: the work sites keep producing between turns
//
// Turns cost work hours, but the map never stops — and a player watching
// carts roll along the roads expects the barns to fill while they watch.
// Every SITE_TICK_SECONDS each road-connected work site sends one unit of
// what it makes home (taken off the land, so the fields still run dry),
// food only if there is room in the barns. Nothing arrives while the tab
// is hidden, so leaving the game open overnight is not a strategy.
// ---------------------------------------------------------------------------

const SITE_TICK_SECONDS = 12;
const SITE_YIELD_TYPES = { food: null, wood: ["wood"], stone: ["stone"] };
let siteTimer = null;
let siteCursor = 0;

function startSiteIncome() {
  if (siteTimer) clearInterval(siteTimer);
  siteTimer = setInterval(siteIncomeTick, 1000);
}

function siteIncomeTick() {
  if (document.hidden || !improvements || !roads) return;
  const sites = improvements.listFor("player").filter((entry) => entry.kind === "site" && entry.yields);
  if (!sites.length) return;
  // Spread the deliveries over the interval so carts arrive one at a time
  // rather than the whole village dumping its load on the same second.
  const perSecond = sites.length / SITE_TICK_SECONDS;
  siteCursor += perSecond;
  let deliveries = Math.floor(siteCursor);
  siteCursor -= deliveries;
  const state = legacy();
  let changed = false;
  while (deliveries-- > 0) {
    const site = sites[Math.floor(Math.random() * sites.length)];
    if (!roads.isConnected(site.tileId, "player")) continue;
    const types = site.yields === "food" ? (callLegacy("territoryFoodTypes") || ["timbermellow"]) : SITE_YIELD_TYPES[site.yields];
    if (!types) continue;
    if (site.yields === "food" && state.timbermellow_count >= state.storage_capacity) continue;
    const taken = callLegacy("territoryTakeQuiet", types, 1);
    if (!taken) continue;
    callLegacy("legacyAdd", site.yields === "food" ? { food: taken } : site.yields === "wood" ? { wood: taken } : { stone: taken });
    changed = true;
    const tile = hexMap.getTile(site.tileId);
    if (renderer && tile) {
      const centre = worldTileCenter(tile.q, tile.r, world.grid);
      renderer.floatText(centre.x, centre.y - HEX_SIZE, `+${taken} ${RESOURCE_ICONS[types[0]] || ""}`, "good");
    }
    if (sim) sim.onEvent({ kind: "gather", type: types[0], amount: taken });
  }
  if (changed) callLegacy("update");
}

// ---------------------------------------------------------------------------
// Raids: the inspect pane's Raid button and the warbands on the map
// ---------------------------------------------------------------------------

function raidFromPanel() {
  const tile = hexMap && hexMap.getSelectedTile();
  if (!tile || !tile.owner || tile.owner === "player") return;
  const blocker = callLegacy("raidBlocker", tile.owner);
  if (blocker) {
    callLegacy("updatelog", blocker, "bad");
    return;
  }
  callLegacy("raidLaunch", tile.owner);
  refreshTilePanel();
}

function villageHomeCenter(villageId) {
  const village = (callLegacy("villagesGet") || []).find((candidate) => candidate.id === villageId);
  const tile = village ? hexMap.getTile(village.homeTileId) : null;
  return tile ? worldTileCenter(tile.q, tile.r, world.grid) : null;
}

function focusVillageById(villageId) {
  const centre = villageHomeCenter(villageId);
  if (centre && renderer) renderer.camera.focusOn(centre.x, centre.y, Math.max(1.0, renderer.camera.zoom), { animate: true });
}

// raids.js: your soldiers set out. They are seen marching to the village.
function onRaidLaunched(villageId, soldiers) {
  if (sim) sim.onEvent({ kind: "warband", fromVillageId: "player", toVillageId: villageId, unit: "soldier", count: Math.min(8, soldiers || 2), thenBack: true });
  const centre = villageCenter();
  if (renderer) renderer.floatText(centre.x, centre.y - HEX_SIZE * 2, `${soldiers} soldiers march`, "bad");
}

// raids.js: scouts from a neighbour were seen; their warband is on the road.
function onRaidIncoming(villageId, turn) {
  const centre = villageHomeCenter(villageId);
  if (centre && renderer) renderer.flashTile(hexMap.homeTileOf(villageId) ? hexMap.homeTileOf(villageId).id : null, 0xd9534f);
}

// raids.js: a raid resolved, ours or theirs.
function onRaidResolved(result) {
  if (!result) return;
  const village = (callLegacy("villagesGet") || []).find((candidate) => candidate.id === result.villageId);
  const unit = village && village.kind === "garlock" ? "garlock" : "rival";
  if (result.incoming) {
    if (sim) sim.onEvent({ kind: "warband", fromVillageId: result.villageId, toVillageId: "player", unit, count: 5, thenBack: !!result.won });
    const home = homeTile();
    if (renderer && home) {
      renderer.flashTile(home.id, result.won ? 0xf2c14e : 0xd9534f);
      const centre = villageCenter();
      renderer.floatText(centre.x, centre.y - HEX_SIZE * 2, result.won ? "raid repelled!" : "raided!", result.won ? "good" : "bad");
    }
  } else {
    const centre = villageHomeCenter(result.villageId);
    const target = hexMap.homeTileOf(result.villageId);
    if (renderer && target) renderer.flashTile(target.id, result.won ? 0xf2c14e : 0xd9534f);
    if (renderer && centre) {
      const loot = result.loot || {};
      const text = result.won
        ? `+${loot.food || 0} 🌰 +${loot.wood || 0} 🪵 +${loot.stone || 0} 🪨`
        : `${result.lost || 0} soldiers lost`;
      renderer.floatText(centre.x, centre.y - HEX_SIZE * 2, text, result.won ? "good" : "bad");
    }
  }
  refreshVillagesPanel();
  refreshTilePanel();
}

// game.js calls this as a raid resolves: the warband is seen marching.
function onGarlockRaid(repelled) {
  const camp = (callLegacy("villagesGet") || []).find((village) => village.kind === "garlock");
  if (sim && camp) sim.onEvent({ kind: "raid", fromVillageId: camp.id, repelled: !!repelled });
  const centre = villageCenter();
  if (renderer) renderer.flashTile(homeTile().id, repelled ? 0xf2c14e : 0xd9534f);
  if (renderer && !repelled) renderer.floatText(centre.x, centre.y - HEX_SIZE * 2, "raided!", "bad");
}

function garlockDirectionText() {
  if (!hexMap) return "";
  const camp = (callLegacy("villagesGet") || []).find((village) => village.kind === "garlock");
  if (!camp) return "";
  const home = homeTile();
  const campTile = hexMap.getTile(camp.homeTileId);
  if (!home || !campTile) return "";
  return ` from the ${callLegacy("directionBetween", home, campTile, world.grid)}`;
}

// ---------------------------------------------------------------------------
// Input from the map
// ---------------------------------------------------------------------------

function onTileClick(tileId, detail) {
  if (!hexMap || !tileId) return;
  if (mapTool) {
    if (applyMapTool(tileId)) return;
  }
  onHexTileClick(tileId);
}

function onHexTileClick(tileId) {
  hexMap.selectTile(tileId);
  renderer.setSelected(tileId);
  refreshTilePanel();
}

function onTileLongPress(tileId) {
  if (!tileId) return;
  onHexTileClick(tileId);
  focusSelectedTile();
}

function onTileHover(tileId) {
  hoveredTileId = tileId;
  if (!mapTool || !renderer) return;
  if (mapTool.mode === "build") {
    if (!tileId) { renderer.setPlacementGhost(null); return; }
    const check = improvements.canPlace(mapTool.type, tileId, "player");
    renderer.setPlacementGhost({ tileId, type: mapTool.type, valid: check.ok });
    setToolHint(check.ok ? `Place ${IMPROVEMENTS[mapTool.type].name || mapTool.type} here` : check.reason);
  } else if (mapTool.mode === "road" && mapTool.from && tileId) {
    roadPreview = roads.findPath(mapTool.from, tileId, { preferRoads: true, forVillage: "player" });
    renderer.setRoadPreview(roadPreview);
    if (roadPreview) {
      const cost = roadCost(roadPreview);
      setToolHint(`Road: ${cost.tiles} new tiles · ${cost.wood} wood · ${cost.hours} hours`);
    } else {
      setToolHint("No way through for a road.");
    }
  }
}

let viewChangeQueued = false;

function onViewChange(view) {
  if (viewChangeQueued) return;
  viewChangeQueued = true;
  requestAnimationFrame(() => {
    viewChangeQueued = false;
    if (minimap) minimap.draw(view);
  });
}

function onFps(fps, frameMs, currentQuality) {
  const meter = document.getElementById("fpsMeter");
  if (!meter || meter.hidden) return;
  meter.textContent = `${Math.round(fps)} fps · ${frameMs.toFixed(1)} ms · ${currentQuality.tier}${sim ? ` · ${sim.counts.active} moving` : ""}`;
}

// ---------------------------------------------------------------------------
// Map tools: grid, lenses, building placement, road drawing
// ---------------------------------------------------------------------------

function installMapTools() {
  const bar = document.getElementById("mapTools");
  if (!bar) return;
  bar.hidden = false;
  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea")) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === "g") { toggleMapGrid(); event.preventDefault(); }
    else if (key === "l") { cycleLens(); event.preventDefault(); }
    else if (key === "f3") { toggleFpsMeter(); event.preventDefault(); }
    else if (key === "b" && toolsUnlocked()) { toggleBuildPalette(); event.preventDefault(); }
    else if (key === "r" && toolsUnlocked()) { setMapTool(mapTool && mapTool.mode === "road" ? null : { mode: "road", from: null }); event.preventDefault(); }
    else if (key === "escape" && mapTool) { cancelMapTool(); event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  refreshToolBar();
}

function toolsUnlocked() {
  return callLegacy("ageHas", "planning") === true;
}

function refreshToolBar() {
  const grid = document.getElementById("toolGrid");
  if (grid) grid.classList.toggle("is-on", gridOn);
  const lens = document.getElementById("toolLens");
  if (lens) {
    lens.classList.toggle("is-on", !!currentLens);
    const label = lens.querySelector(".rw-tool__label");
    if (label) label.textContent = currentLens ? `Lens: ${currentLens}` : "Lens";
  }
  const build = document.getElementById("toolBuild");
  const road = document.getElementById("toolRoad");
  const unlocked = toolsUnlocked();
  if (build) { build.hidden = !unlocked; build.classList.toggle("is-on", !!mapTool && mapTool.mode === "build"); }
  if (road) { road.hidden = !unlocked; road.classList.toggle("is-on", !!mapTool && mapTool.mode === "road"); }
  const palette = document.getElementById("buildPalette");
  if (palette && !unlocked) palette.hidden = true;
}

function toggleMapGrid() {
  gridOn = !gridOn;
  if (renderer) renderer.setGrid(gridOn);
  refreshToolBar();
}

const LENSES = [null, "yields", "territory", "resources", "roads"];

function cycleLens() {
  const index = LENSES.indexOf(currentLens);
  setMapLens(LENSES[(index + 1) % LENSES.length]);
}

function setMapLens(name) {
  currentLens = name || null;
  if (renderer) renderer.setLens(currentLens);
  refreshToolBar();
}

function toggleFpsMeter() {
  const meter = document.getElementById("fpsMeter");
  if (!meter) return;
  meter.hidden = !meter.hidden;
  const button = document.getElementById("toolFps");
  if (button) button.classList.toggle("is-on", !meter.hidden);
}

function toggleBuildPalette() {
  const palette = document.getElementById("buildPalette");
  if (!palette) return;
  if (!palette.hidden) { palette.hidden = true; cancelMapTool(); return; }
  palette.hidden = false;
  fillBuildPalette();
}

// Which things can be placed by hand, and what the placement costs. Town
// buildings are paid through the same functions the Build tab uses, so
// the price is whatever game.js says it is.
const PLACEABLE = [
  { type: "house", label: "House", pay: "make_house", icon: "house" },
  { type: "barn", label: "Barn", pay: "make_barn", icon: "barn" },
  { type: "school", label: "School", pay: "make_school", icon: "tech" },
  { type: "armyCamp", label: "Army camp", pay: "make_armycamp", icon: "soldier" },
  // T-fix: dock was auto-only, so sea trade could never be chosen. Now it is
  // placeable like any town building (needs shore water, see canPlace).
  { type: "dock", label: "Dock", pay: null, cost: { wood: 6, hours: 1 }, icon: "explore" },
  { type: "farm", label: "Farm", site: true, icon: "farming" },
  { type: "pasture", label: "Pasture", site: true, icon: "timbermellow" },
  { type: "lumberCamp", label: "Lumber camp", site: true, icon: "wood" },
  { type: "quarry", label: "Quarry", site: true, icon: "stone" },
  { type: "fishery", label: "Fishery", site: true, icon: "explore" },
];

function fillBuildPalette() {
  const host = document.getElementById("buildPaletteBody");
  if (!host) return;
  const state = legacy();
  const icon = (name) => (typeof window.getIcon === "function" ? window.getIcon(name) : "");
  host.innerHTML = PLACEABLE.map((entry) => {
    const active = mapTool && mapTool.mode === "build" && mapTool.type === entry.type;
    const blocked = entry.type === "farm" && !(state.farming_made > 0);
    const price = entry.cost || (entry.site ? SITE_COST : null);
    const cost = price ? `${price.wood} wood · ${price.hours} hour${price.hours === 1 ? "" : "s"}` : "same as the Build tab";
    const tip = entry.type === "dock"
      ? "Pick a shore hex you own. Sea lanes from the world join here — a docked neighbour becomes a trading partner."
      : "Pick where it stands. Work sites bring carts and roads with them.";
    return `
      <button class="rw-gizmo rw-gizmo--place ${active ? "is-on" : ""}" ${blocked ? "disabled" : ""}
              data-place="${entry.type}"
              data-tip-title="Place a ${entry.label.toLowerCase()}"
              data-tip="${tip}"
              data-tip-cost="${cost}"
              data-tip-block="${blocked ? "Learn farming first." : ""}">
        <span class="rw-gizmo__icon">${icon(entry.icon)}</span>
        <span class="rw-gizmo__label">${entry.label}</span>
      </button>`;
  }).join("");
  for (const button of host.querySelectorAll("[data-place]")) {
    button.addEventListener("click", () => {
      const type = button.dataset.place;
      setMapTool(mapTool && mapTool.mode === "build" && mapTool.type === type ? null : { mode: "build", type });
      fillBuildPalette();
    });
  }
}

function setMapTool(tool) {
  mapTool = tool;
  roadPreview = null;
  if (renderer) {
    renderer.setPlacementGhost(null);
    renderer.setRoadPreview(null);
  }
  const stage = document.getElementById("mapstage");
  if (stage) stage.classList.toggle("is-tool", !!tool);
  if (!tool) setToolHint("");
  else if (tool.mode === "road") setToolHint("Road: click where it starts, then where it ends.");
  else setToolHint(`Click a hex to place the ${tool.type}.`);
  refreshToolBar();
}

function cancelMapTool() {
  setMapTool(null);
  const palette = document.getElementById("buildPalette");
  if (palette) palette.hidden = true;
}

function setToolHint(text) {
  const hint = document.getElementById("toolHint");
  if (!hint) return;
  hint.textContent = text || "";
  hint.hidden = !text;
}

function roadCost(path) {
  let tiles = 0;
  for (let i = 1; i < path.length; i++) {
    if (!hexMap.hasRoadBetween(path[i - 1], path[i])) tiles++;
  }
  return { tiles, wood: tiles * ROAD_COST_PER_TILE.wood, hours: Math.max(1, Math.ceil(tiles / ROAD_HOURS_PER_TILES)) };
}

// Returns true when the click was consumed by the tool.
function applyMapTool(tileId) {
  const state = legacy();
  if (mapTool.mode === "build") {
    const check = improvements.canPlace(mapTool.type, tileId, "player");
    if (!check.ok) { callLegacy("updatelog", check.reason, "bad"); return true; }
    const entry = PLACEABLE.find((candidate) => candidate.type === mapTool.type);
    if (entry && entry.pay) {
      // The legacy button pays and bumps the counter; syncTown then puts
      // the new building on the hex the player picked.
      pendingPlacementTile = tileId;
      const before = playerCounters();
      callLegacy(entry.pay);
      const after = playerCounters();
      if (JSON.stringify(before) === JSON.stringify(after)) pendingPlacementTile = null;
      return true;
    }
    // T-fix: town buildings without a legacy button (dock) pay their own
    // entry.cost, defaulting to the work-site price.
    const price = (entry && entry.cost) || SITE_COST;
    if (state.wood < price.wood) { callLegacy("updatelog", `A ${mapTool.type} needs ${price.wood} wood.`, "bad"); return true; }
    if (state.working_hours < price.hours) { callLegacy("updatelog", "No work hours left for that.", "bad"); return true; }
    callLegacy("legacySpend", { wood: price.wood, hours: price.hours });
    improvements.place(mapTool.type, tileId, "player");
    callLegacy("updatelog", `A ${IMPROVEMENTS[mapTool.type].name || mapTool.type} is staked out on the land.`, "good");
    callLegacy("update");
    return true;
  }
  if (mapTool.mode === "road") {
    if (!mapTool.from) {
      mapTool.from = tileId;
      setToolHint("Now click where the road ends.");
      return true;
    }
    const path = roads.findPath(mapTool.from, tileId, { preferRoads: true, forVillage: "player" });
    if (!path) { callLegacy("updatelog", "No way through for a road there.", "bad"); return true; }
    const cost = roadCost(path);
    if (cost.tiles === 0) { callLegacy("updatelog", "There is already a road all the way."); mapTool.from = null; return true; }
    if (state.wood < cost.wood) { callLegacy("updatelog", `That road needs ${cost.wood} wood.`, "bad"); return true; }
    if (state.working_hours < cost.hours) { callLegacy("updatelog", `That road needs ${cost.hours} work hours.`, "bad"); return true; }
    callLegacy("legacySpend", { wood: cost.wood, hours: cost.hours });
    hexMap.addRoadPath(path);
    roads.invalidate();
    callLegacy("updatelog", `${cost.tiles} hexes of road laid.`, "good");
    callLegacy("update");
    mapTool.from = null;
    renderer.setRoadPreview(null);
    setToolHint("Road laid. Click to start another, or press Esc.");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tile inspection pane and settlement list
// ---------------------------------------------------------------------------

let tilePanelKey = "";

function refreshTilePanel() {
  const info = document.getElementById("tileInfo");
  const button = document.getElementById("exploreButton");
  const reason = document.getElementById("exploreReason");
  const focusButton = document.getElementById("focusButton");
  if (!info || !hexMap) return;

  const tile = hexMap.getSelectedTile();
  if (focusButton) focusButton.disabled = !tile;
  const findButton = document.getElementById("findLandButton");
  if (findButton) {
    const anywhere = hexMap.getFrontierTiles("player").some((candidate) => !isWaterTerrain(candidate.terrainType) || candidate.terrainType === "river");
    findButton.disabled = !anywhere;
    findButton.dataset.tipBlock = anywhere ? "" : "There is no wild land touching yours.";
  }

  if (!tile) {
    tilePanelKey = "";
    info.innerHTML = `
      <div class="rw-tileinfo__name">Select Land</div>
      <div class="rw-tileinfo__state">Click any hex on the map to survey its terrain and resources.</div>`;
    setTileGizmo(button, "🚩", "Explore", false);
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
  const connected = tile.owner === "player" && roads ? roads.isConnected(tile.id, "player") : false;

  const raidInfo = foreign && revealed ? callLegacy("raidVillageInfo", tile.owner) : null;
  const raidBlocker = foreign ? callLegacy("raidBlocker", tile.owner) : "";
  const raidUnlocked = callLegacy("ageHas", "raiding") === true;
  const key = [
    tile.id, revealed, claimed, frontier, foreign, tile.owner, tile.road, tile.improvement, tile.building, connected,
    Object.keys(tile.resources).map((type) => tile.resources[type].amount + "/" + tile.resources[type].max).join(","),
    foreign ? callLegacy("territorySeizeBlocker", tile.id) : callLegacy("territoryExploreBlocker", tile.id),
    raidInfo ? JSON.stringify(raidInfo) : "", raidBlocker, raidUnlocked,
  ].join("|");
  if (key === tilePanelKey) return;
  tilePanelKey = key;

  // The Raid gizmo only shows for another village's land, once raiding is
  // unlocked (js/ages.js). Its tooltip carries the odds.
  const raidButton = document.getElementById("raidButton");
  if (raidButton) {
    raidButton.hidden = !(foreign && revealed && raidUnlocked);
    raidButton.disabled = !!raidBlocker;
    raidButton.dataset.tipBlock = raidBlocker || "";
    if (raidInfo) {
      raidButton.dataset.tipTitle = `Raid ${raidInfo.name}`;
      raidButton.dataset.tipCost = `${window.RAID_MIN_SOLDIERS || 2}+ soldiers · ${window.RAID_FOOD_COST || 6} food · ${window.RAID_WORK_HOURS || 4} hours · their defence ${raidInfo.defence}, your attack ${raidInfo.attack} (${raidInfo.odds})`;
    }
  }

  if (!revealed) {
    info.innerHTML = `
      <div class="rw-tileinfo__name">Terra Incognita</div>
      <div class="rw-tileinfo__state">Blank parchment — uncharted frontier. Your settlement must expand here, or discover Mapmaking.</div>`;
  } else {
    let state = "Wild land";
    let stateClass = "";
    if (claimed) { state = tile.isStartingTile ? "Settlement Hearth" : "Your Territory"; stateClass = "rw-tileinfo__state--claimed"; }
    else if (foreign) { state = `${callLegacy("villageName", tile.owner)}'s domain`; stateClass = "rw-tileinfo__state--foreign"; }
    else if (frontier) { state = "Frontier — adjacent and explorable"; stateClass = "rw-tileinfo__state--frontier"; }

    const chip = foreign ? `<i class="chip" style="background:${callLegacy("villageColor", tile.owner)}"></i>` : "";
    const region = regionOfTile(tile);
    const continent = continentOfTile(tile);
    const climate = terrainClimateNote(tile);
    const details = [];
    if (tile.riverWidth) details.push(tile.riverWidth >= 3 ? "a wide river" : tile.riverWidth === 2 ? "a river" : "a stream");
    if (tile.feature) details.push(featureName(tile.feature));
    if (tile.landmark) details.push(landmarkName(tile.landmark));
    if (tile.building) details.push(buildingName(tile.building));
    if (tile.improvement) details.push(buildingName(tile.improvement));
    if (tile.road) details.push(claimed ? (connected ? "road to the village" : "road, not yet joined to yours") : "an old track");
    if (tile.snowCapped) details.push("snow-capped");
    let raidLine = "";
    if (raidInfo) {
      const tone = raidInfo.vassal ? "rw-raidinfo--good" : raidInfo.odds === "hopeless" || raidInfo.odds === "risky" ? "rw-raidinfo--bad" : raidInfo.odds === "even" ? "" : "rw-raidinfo--good";
      raidLine = raidInfo.vassal
        ? `<p class="rw-raidinfo rw-raidinfo--good"><b>Your vassal</b> — pays tribute every turn.</p>`
        : `<p class="rw-raidinfo ${tone}">Defence <b>${raidInfo.defence}</b> · your attack <b>${raidInfo.attack}</b> · a raid looks <b>${raidInfo.odds}</b>${raidInfo.grudge ? ` · grudge ${raidInfo.grudge}` : ""}${raidInfo.reachable === false ? " · across the sea" : ""}</p>`;
    }
    info.innerHTML = `
      <div class="rw-tileinfo__name">${TERRAIN_NAMES[tile.terrainType] || tile.terrainType}</div>
      ${region ? `<div class="rw-tileinfo__region">${region.name}${continent ? ` · ${continent.name}` : ""}</div>` : (continent ? `<div class="rw-tileinfo__region">${continent.name}</div>` : "")}
      <div class="rw-tileinfo__state ${stateClass}">${chip}${state}</div>
      ${climate ? `<div class="rw-tileinfo__climate">${climate}</div>` : ""}
      ${details.length ? `<div class="rw-tileinfo__climate">${details.join(" · ")}</div>` : ""}
      ${raidLine}
      ${resourceBars(tile)}`;
  }

  if (foreign) {
    const blocker = callLegacy("territorySeizeBlocker", tile.id);
    const cost = `${callLegacy("territorySeizeSoldiersNeeded", tile.id)} soldiers (1 lost) · ${window.SEIZE_FOOD_COST} food · ${window.SEIZE_WORK_HOURS} hours`;
    setTileGizmo(button, "⚔️", "Seize", true);
    button.onclick = window.seize;
    button.disabled = !!blocker;
    button.dataset.tipTitle = `Seize territory from ${callLegacy("villageName", tile.owner)}`;
    button.dataset.tip = "Your soldiers march out and conquer the tile. You can take peripheral lands, but never the home center.";
    button.dataset.tipCost = cost;
    button.dataset.tipBlock = blocker || "";
    reason.textContent = blocker || `Requires: ${cost}.`;
    reason.className = blocker ? "rw-reason rw-reason--blocked" : "rw-reason";
  } else {
    const blocker = callLegacy("territoryExploreBlocker", tile.id);
    const cost = `${window.EXPLORE_MIN_HUMANS} villagers · ${window.EXPLORE_MIN_SOLDIERS} soldier · ${callLegacy("territoryExploreFood")} food · ${callLegacy("territoryExploreHours")} hours`;
    const gained = callLegacy("territoryExploreYield", tile.id);
    setTileGizmo(button, "🚩", "Explore", false);
    button.onclick = window.explore;
    button.disabled = !!blocker;
    button.dataset.tipTitle = "Send an expedition";
    button.dataset.tip = `An expedition settles a whole district, not one field — about ${gained} hexes around this one. Everything on them joins your stores-on-land, and the country beyond comes into view.`;
    button.dataset.tipCost = cost;
    button.dataset.tipBlock = blocker || "";
    reason.textContent = blocker || `Requires: ${cost}. Settles about ${gained} hexes.`;
    reason.className = blocker ? "rw-reason rw-reason--blocked" : "rw-reason";
  }
}

const FEATURE_NAMES = { waterfall: "a waterfall", oasis: "an oasis", reef: "a reef", hotSpring: "a hot spring", ford: "a ford" };
const LANDMARK_NAMES = {
  standingStones: "standing stones", motherTree: "the Mother Tree", dragonBones: "dragon bones",
  crystalMine: "a crystal mine", shipwreck: "a shipwreck", ruinedTower: "a ruined tower",
  hotSpring: "a hot spring", boneOrchard: "the bone orchard", volcano: "a volcano", oasis: "an oasis",
};

function featureName(feature) { return FEATURE_NAMES[feature] || feature; }
function landmarkName(landmark) { return LANDMARK_NAMES[landmark] || landmark; }
function buildingName(type) {
  const def = IMPROVEMENTS[type];
  return def && def.name ? def.name.toLowerCase() : type;
}

function setTileGizmo(button, icon, label, danger) {
  if (!button) return;
  const iconSvg = typeof window.getIcon === "function" ? window.getIcon(danger ? "seize" : "explore") : icon;
  button.innerHTML = `<span class="rw-gizmo__icon">${iconSvg}</span><span class="rw-gizmo__label">${label}</span>`;
  button.classList.toggle("rw-gizmo--danger", !!danger);
  button.classList.toggle("rw-gizmo--go", !danger);
}

function resourceBars(tile) {
  const types = Object.keys(tile.resources);
  if (!types.length) return `<div class="rw-tileinfo__empty">No harvestable resources on this tile.</div>`;
  return types.map((type) => {
    const entry = tile.resources[type];
    const percent = entry.max ? Math.round((entry.amount / entry.max) * 100) : 0;
    const note = entry.renewable ? "replenishes in autumn" : "finite — never regrows";
    const iconSvg = typeof window.getIcon === "function" ? window.getIcon(type) : (RESOURCE_ICONS[type] || "");
    return `
      <div class="bar">
        <span>${iconSvg} <b>${type}</b> <small>(${note})</small></span>
        <b>${entry.amount} / ${entry.max}</b>
        <div class="bar__track"><div class="bar__fill ${entry.renewable ? "" : "bar__fill--finite"}" style="width:${percent}%"></div></div>
      </div>`;
  }).join("");
}

function refreshVillagesPanel() {
  const list = document.getElementById("villageList");
  if (!list || !hexMap) return;
  const kinds = { player: "your village", rival: "neighbour", garlock: "garlock camp" };
  const tileIcon = typeof window.getIcon === "function" ? window.getIcon("tiles") : "⬡";
  const connected = roads ? roads.connectedToTown("player") : new Set();
  list.innerHTML = (callLegacy("villagesGet") || []).map((village) => {
    const tiles = hexMap.countOwnedBy(village.id);
    const known = village.kind === "player" || hexMap.isRevealed(village.homeTileId);
    const partner = village.kind === "rival" && known && connected.has(village.homeTileId);
    const info = known && village.kind !== "player" ? callLegacy("raidVillageInfo", village.id) : null;
    const status = info ? (info.vassal ? " · vassal" : ` · defence ${info.defence}${info.grudge ? ` · grudge ${info.grudge}` : ""}`) : "";
    return `
      <li class="villagelist__row villagerow ${known ? "" : "villagelist__row--unknown"}" ${known ? `onclick="focusVillageById('${village.id}')" style="cursor:pointer"` : ""}>
        <span>
          <i class="chip" style="background:${village.color}"></i>
          <b>${known ? village.name : "Uncharted Settlement"}</b>
          <small style="color:var(--ink-faint); margin-left:6px;">(${kinds[village.kind] || village.kind}${partner ? " · trading" : ""}${status})</small>
        </span>
        <span style="display:flex; align-items:center; gap:4px;">
          <b>${known ? tiles : "?"}</b> ${tileIcon}
        </span>
      </li>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Menu actions and camera helpers the HUD calls by name
// ---------------------------------------------------------------------------

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

function saveNow() {
  const ok = callLegacy("saveGame", worldSeed);
  callLegacy("updatelog", ok ? "Game saved." : "Could not save — this browser is not letting the page store anything.", ok ? "good" : "bad");
}

function newGame() {
  callLegacy("clearSavedGame");
  location.search = "";
}

function focusVillage() {
  if (!renderer) return;
  const centre = villageCenter();
  renderer.camera.focusOn(centre.x, centre.y, Math.max(1.2, renderer.camera.zoom), { animate: true });
}

function focusSelectedTile() {
  if (!renderer || !hexMap) return;
  const tile = hexMap.getSelectedTile();
  if (!tile) return;
  const centre = worldTileCenter(tile.q, tile.r, world.grid);
  renderer.camera.focusOn(centre.x, centre.y, Math.max(1.0, renderer.camera.zoom), { animate: true });
}

function selectBestFrontier() {
  if (!hexMap) return;
  const frontier = hexMap.getFrontierTiles("player")
    .filter((tile) => !isWaterTerrain(tile.terrainType) || tile.terrainType === "river");
  if (!frontier.length) return;
  const worth = (tile) => Object.values(tile.resources || {}).reduce((total, entry) => total + (entry.amount || 0), 0);
  frontier.sort((a, b) => worth(b) - worth(a));
  onHexTileClick(frontier[0].id);
  focusSelectedTile();
}

// The engine loads PixiJS with a top-level await, so this module can finish
// evaluating AFTER DOMContentLoaded has already fired — in which case the
// listener would never run. Start straight away if the page is ready.
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initGame);
} else {
  initGame();
}
