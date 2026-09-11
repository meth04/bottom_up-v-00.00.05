// main.js
//
// Boots the game and keeps the map and HUD in step with the village:
//
//   1. picks a world seed (from a save, the URL's ?seed=, or at random) and
//      generates the world (worldGen.js)
//   2. paints it (worldPainter.js), lays the hex overlay over it
//      (hexRenderer.js), adds the buildings, the villagers and the sky
//   3. hands the map to territory.js, which game.js gathers from
//   4. reacts to what happens — a floating number rises when you gather, an
//      expedition walks out to a tile you take, buildings appear as you
//      build, the neighbours take their turn after yours, the weather
//      follows the season, the game autosaves (save.js)

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

  // If a seed was given in URL, bypass the Title Screen directly so automated playtests run cleanly
  const titleScreen = document.getElementById("titleScreen");
  const continueBtn = document.getElementById("btnContinueGame");
  if (continueBtn && saved) {
    continueBtn.style.display = "flex";
  }
  if (params.get("seed") || location.hash.includes("stop-after-explore")) {
    if (titleScreen) {
      titleScreen.classList.add("is-hidden");
      titleScreen.hidden = true;
    }
  }

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
  viewport.focusOn(village, { width: world.width, height: world.height }, 2.8);

  const seedLabel = document.getElementById("seedLabel");
  if (seedLabel) seedLabel.textContent = worldSeed;
  const settingsSeed = document.getElementById("settingsSeedDisplay");
  if (settingsSeed) settingsSeed.textContent = worldSeed;

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
    if (event.amount > 0) {
      if (typeof spawnFloatingReward === "function") {
        spawnFloatingReward(`+${event.amount}`, event.types[0]);
      }
      if (mapEffects) {
        const village = villageCenter();
        const icon = typeof getIcon === "function" ? "" : (RESOURCE_ICONS[event.types[0]] || event.types[0]);
        mapEffects.floatText(village.x, village.y - mapGrid.hexSize * 0.9, `+${event.amount} ${icon}`, "good");
      }
    }
    refreshTilePanel();
    return;
  }

  if (event && (event.kind === "claim" || event.kind === "seize")) {
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

  // Check Game Over condition
  if (typeof humans !== "undefined" && typeof human_army !== "undefined") {
    if (humans <= 0 && human_army <= 0) {
      const year = Math.floor((turngame - 1) / 8) + 1;
      if (typeof showGameOverScreen === "function") {
        showGameOverScreen(
          "Famine and the bitter elements have claimed the final settler. The fires in the village have gone cold.",
          { year, turns: turngame, tiles: typeof territoryClaimedCount === "function" ? territoryClaimedCount() : 1 }
        );
      }
    }
  }
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

  if (!stage.classList.contains(`season--${season}`)) {
    mapEffects.setSeason(season);
    for (const name of Array.from(stage.classList)) {
      if (name.startsWith("season--")) stage.classList.remove(name);
    }
    stage.classList.add(`season--${season}`);
    const year = Math.floor((turngame - 1) / 8) + 1;
    if (typeof showSeasonBanner === "function") {
      showSeasonBanner(season, year);
    }
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

// ---------------------------------------------------------------------------
// Tile inspection pane and minimap
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

  if (!revealed) {
    info.innerHTML = `
      <div class="rw-tileinfo__name">Terra Incognita</div>
      <div class="rw-tileinfo__state">Blank parchment — uncharted frontier. Your settlement must expand here, or discover Mapmaking.</div>`;
  } else {
    let state = "Wild land";
    let stateClass = "";
    if (claimed) { state = tile.isStartingTile ? "Settlement Hearth" : "Your Territory"; stateClass = "rw-tileinfo__state--claimed"; }
    else if (foreign) { state = `${villageName(tile.owner)}'s domain`; stateClass = "rw-tileinfo__state--foreign"; }
    else if (frontier) { state = "Frontier — adjacent and explorable"; stateClass = "rw-tileinfo__state--frontier"; }

    const chip = foreign ? `<i class="chip" style="background:${villageColor(tile.owner)}"></i>` : "";
    info.innerHTML = `
      <div class="rw-tileinfo__name">${TERRAIN_NAMES[tile.terrainType] || tile.terrainType}</div>
      <div class="rw-tileinfo__state ${stateClass}">${chip}${state}</div>
      ${resourceBars(tile)}`;
  }

  // One gizmo, two jobs: explore wild land, seize another village's.
  if (foreign) {
    const blocker = territorySeizeBlocker(tile.id);
    const cost = `${territorySeizeSoldiersNeeded(tile.id)} soldiers (1 lost) · ${SEIZE_FOOD_COST} food · ${SEIZE_WORK_HOURS} hours`;
    setTileGizmo(button, "⚔️", "Seize", true);
    button.onclick = seize;
    button.disabled = !!blocker;
    button.dataset.tipTitle = `Seize territory from ${villageName(tile.owner)}`;
    button.dataset.tip = "Your soldiers march out and conquer the tile. You can take peripheral lands, but never the home center.";
    button.dataset.tipCost = cost;
    button.dataset.tipBlock = blocker || "";
    reason.textContent = blocker || `Requires: ${cost}.`;
    reason.className = blocker ? "rw-reason rw-reason--blocked" : "rw-reason";
  } else {
    const blocker = territoryExploreBlocker(tile.id);
    const cost = `${EXPLORE_MIN_HUMANS} villagers · ${EXPLORE_MIN_SOLDIERS} soldier · ${EXPLORE_FOOD_COST} food · ${EXPLORE_WORK_HOURS} hours`;
    setTileGizmo(button, "🚩", "Explore", false);
    button.onclick = explore;
    button.disabled = !!blocker;
    button.dataset.tipTitle = "Send an expedition";
    button.dataset.tip = "The hex is annexed into your territory, its resources join your stores-on-land, and surrounding lands are revealed.";
    button.dataset.tipCost = cost;
    button.dataset.tipBlock = blocker || "";
    reason.textContent = blocker || `Requires: ${cost}.`;
    reason.className = blocker ? "rw-reason rw-reason--blocked" : "rw-reason";
  }
}

function setTileGizmo(button, icon, label, danger) {
  if (!button) return;
  const iconSvg = typeof getIcon === "function" ? getIcon(danger ? "seize" : "explore") : icon;
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
    const iconSvg = typeof getIcon === "function" ? getIcon(type) : (RESOURCE_ICONS[type] || "");
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
  const tileIcon = typeof getIcon === "function" ? getIcon("tiles") : "⬡";
  list.innerHTML = villagesGet().map((village) => {
    const tiles = hexMap.getTilesOwnedBy(village.id).length;
    const known = village.kind === "player" || hexMap.isRevealed(village.homeTileId);
    return `
      <li class="villagelist__row villagerow ${known ? "" : "villagelist__row--unknown"}">
        <span>
          <i class="chip" style="background:${village.color}"></i>
          <b>${known ? village.name : "Uncharted Settlement"}</b>
          <small style="color:var(--ink-faint); margin-left:6px;">(${kinds[village.kind] || village.kind})</small>
        </span>
        <span style="display:flex; align-items:center; gap:4px;">
          <b>${known ? tiles : "?"}</b> ${tileIcon}
        </span>
      </li>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Minimap & Camera
// ---------------------------------------------------------------------------

function drawMinimap() {
  const canvas = document.getElementById("minimap");
  if (!canvas || !world || !viewport) return;
  const ctx = canvas.getContext("2d");
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  // Background tint: antique parchment look
  ctx.fillStyle = "#edd9b4";
  ctx.fillRect(0, 0, cw, ch);

  // Subtle parchment border inside
  ctx.strokeStyle = "#cbb28d";
  ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, cw - 2, ch - 2);

  const scale = Math.min(cw / world.width, ch / world.height);
  const ox = (cw - world.width * scale) / 2;
  const oy = (ch - world.height * scale) / 2;

  // Render rivers
  if (world.rivers && world.rivers.length) {
    ctx.strokeStyle = "rgba(74, 119, 122, 0.45)";
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.lineCap = "round";
    for (const river of world.rivers) {
      if (!river.points || river.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(ox + river.points[0].x * scale, oy + river.points[0].y * scale);
      for (let i = 1; i < river.points.length; i++) {
        ctx.lineTo(ox + river.points[i].x * scale, oy + river.points[i].y * scale);
      }
      ctx.stroke();
    }
  }

  // Render hexes
  const radius = Math.max(1.8, mapGrid.hexSize * scale * 0.85);
  for (const tile of hexMap.getAllTiles()) {
    if (!hexMap.isRevealed(tile.id)) continue;
    const center = worldTileCenter(tile.q, tile.r, mapGrid);
    const px = ox + center.x * scale;
    const py = oy + center.y * scale;

    if (tile.owner === "player") {
      ctx.fillStyle = "#c29339";
    } else if (tile.owner) {
      ctx.fillStyle = villageColor(tile.owner);
    } else if (hexMap.isFrontier(tile.id)) {
      ctx.fillStyle = "rgba(100, 145, 75, 0.45)";
    } else {
      ctx.fillStyle = "rgba(180, 150, 110, 0.18)";
    }

    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Highlight village centers
  if (typeof villagesGet === "function") {
    const villages = villagesGet();
    for (const v of villages) {
      const homeTile = hexMap.getTile(v.homeTileId);
      if (!homeTile || !hexMap.isRevealed(homeTile.id)) continue;
      const center = worldTileCenter(homeTile.q, homeTile.r, mapGrid);
      const px = ox + center.x * scale;
      const py = oy + center.y * scale;

      ctx.fillStyle = v.kind === "garlock" ? "#8c1f1f" : "#2a4d3a";
      ctx.beginPath();
      ctx.arc(px, py, radius * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Camera viewport indicator
  const stage = document.getElementById("mapstage");
  if (stage) {
    const sRect = stage.getBoundingClientRect();
    const fit = Math.min(sRect.width / world.width, sRect.height / world.height);
    const offsetX = (sRect.width - world.width * fit) / 2;
    const offsetY = (sRect.height - world.height * fit) / 2;
    const view = viewport.getView();

    const worldLeft = (-view.translateX / view.scale - offsetX) / fit;
    const worldTop = (-view.translateY / view.scale - offsetY) / fit;
    const worldW = (sRect.width / view.scale) / fit;
    const worldH = (sRect.height / view.scale) / fit;

    const vx = ox + worldLeft * scale;
    const vy = oy + worldTop * scale;
    const vw = worldW * scale;
    const vh = worldH * scale;

    ctx.strokeStyle = "#8c2a1c";
    ctx.lineWidth = 1.8;
    ctx.strokeRect(vx, vy, vw, vh);

    // Golden corner accents on camera box
    ctx.fillStyle = "#8c2a1c";
    const cs = 3;
    ctx.fillRect(vx - 1, vy - 1, cs, cs);
    ctx.fillRect(vx + vw - cs + 1, vy - 1, cs, cs);
    ctx.fillRect(vx - 1, vy + vh - cs + 1, cs, cs);
    ctx.fillRect(vx + vw - cs + 1, vy + vh - cs + 1, cs, cs);
  }
}

function onMinimapClick(event) {
  if (!viewport || !world) return;
  const canvas = document.getElementById("minimap");
  const rect = canvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  const scale = Math.min(canvas.width / world.width, canvas.height / world.height);
  const ox = (canvas.width - world.width * scale) / 2;
  const oy = (canvas.height - world.height * scale) / 2;

  const worldX = (clickX - ox) / scale;
  const worldY = (clickY - oy) / scale;

  const current = viewport.getView();
  viewport.focusOn({ x: worldX, y: worldY }, { width: world.width, height: world.height }, current.scale);
}

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
