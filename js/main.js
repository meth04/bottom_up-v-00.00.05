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
  birchWood: "Birch wood",
  denseBush: "Dense bush",
  taiga: "Pine taiga",
  flowerMeadow: "Flowering meadow",
  plains: "Plains",
  mountains: "Mountains",
  rockyOutcrop: "Rocky outcrop",
  overgrownHighlands: "Terraced hills",
  marsh: "Marshland",
  tundra: "Cold tundra",
  snowfield: "Snowfield",
  badlands: "Badlands",
  beach: "Shore",
  river: "River",
  lake: "Lake",
  ocean: "Open sea",
};

// What a tile is like to live on — shown in the inspect pane so the player
// can tell a warm meadow from a frozen one before spending an expedition.
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

// Ground the player has seen but does not hold still shows its own colour on
// the world panel, so the country reads as country and not as fog.
const MINIMAP_TERRAIN_TINT = {
  ocean: "#8fb4c4",
  lake: "#79b3c8",
  river: "#8ec5d6",
  beach: "rgba(229, 211, 163, 0.7)",
  mountains: "rgba(120, 117, 114, 0.55)",
  snowfield: "rgba(232, 238, 244, 0.75)",
  rockyOutcrop: "rgba(158, 139, 114, 0.5)",
  badlands: "rgba(197, 138, 82, 0.55)",
  tundra: "rgba(185, 191, 162, 0.55)",
  marsh: "rgba(127, 143, 78, 0.55)",
  taiga: "rgba(43, 90, 60, 0.5)",
  denseBush: "rgba(51, 105, 50, 0.5)",
  forest: "rgba(70, 133, 56, 0.5)",
  birchWood: "rgba(127, 168, 68, 0.5)",
  flowerMeadow: "rgba(136, 189, 90, 0.45)",
  plains: "rgba(212, 190, 114, 0.45)",
  overgrownHighlands: "rgba(188, 165, 99, 0.45)",
  timbermellowForest: "rgba(120, 184, 78, 0.55)",
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

// ---------------------------------------------------------------------------
// Booting
//
// Building the island takes about half a second and painting it takes about
// as long again. Done in one go that is a second of white screen with the
// tab frozen, which reads as a broken page. So it is done in stages, with a
// frame handed back to the browser between each one, and a loading card
// that says what is being built. The work is the same; the difference is
// that the player can see it happening.
// ---------------------------------------------------------------------------

// Hands control back so the browser can paint what has just been set up.
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

async function initGame() {
  bootStage("Unrolling the paper…", 0.04);
  const response = await fetch("data/map.json");
  const mapData = await response.json();

  const saved = loadSavedGame();
  const params = new URLSearchParams(location.search);
  if (saved) worldSeed = saved.seed;
  else if (params.get("seed")) worldSeed = Number(params.get("seed")) >>> 0;
  else worldSeed = Math.floor(Math.random() * 1e9);

  // If a seed was given in URL, bypass the title screen so automated
  // playtests run cleanly.
  const titleScreen = document.getElementById("titleScreen");
  const continueBtn = document.getElementById("btnContinueGame");
  if (continueBtn && saved) continueBtn.style.display = "flex";
  if (params.get("seed") || location.hash.includes("stop-after-explore")) {
    if (titleScreen) {
      titleScreen.classList.add("is-hidden");
      titleScreen.hidden = true;
    }
  }

  bootStage("Raising the land out of the sea…", 0.12);
  await nextFrame();
  world = generateWorld(Object.assign({}, mapData.world, { seed: worldSeed }));
  mapGrid = world.grid;

  // The player's home gets the starting stores from map.json.
  const home = world.tiles.find((tile) => tile.isStartingTile);
  home.resources = mapData.startingTile.resources;

  bootStage("Counting what grows on it…", 0.34);
  await nextFrame();
  hexMap = new HexMap({ terrainDefaults: mapData.terrainDefaults, tiles: world.tiles });
  villagesSet(world.villages);
  if (saved) {
    hexMap.deserialize(saved.map);
    villagesSet(saved.villages);
  } else {
    // Every settlement starts on its own valley, not on a single hex.
    for (const village of world.villages) {
      territoryFoundVillage(hexMap, village.homeTileId, village.id);
    }
  }
  hexMap.selectTile(home.id);
  territorySetMap(hexMap, mapGrid, onTerritoryChanged);

  bootStage("Painting the country…", 0.46);
  await nextFrame();
  const viewBox = { x: 0, y: 0, width: world.width, height: world.height };
  paintWorld(document.getElementById("mapArtworkHost"), world);

  bootStage("Drawing the borders…", 0.74);
  await nextFrame();
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

  bootStage("Setting out the village…", 0.86);
  await nextFrame();
  viewport = setupMapViewport(document.getElementById("mapstage"), document.getElementById("mapviewport"));
  viewport.onChange(drawMinimap);
  document.getElementById("minimap").addEventListener("click", onMinimapClick);
  viewport.focusOn(village, { width: world.width, height: world.height }, 7.5);

  const seedLabel = document.getElementById("seedLabel");
  if (seedLabel) seedLabel.textContent = worldSeed;
  const settingsSeed = document.getElementById("settingsSeedDisplay");
  if (settingsSeed) settingsSeed.textContent = worldSeed;

  if (saved) {
    gameSetState(saved.game);
    updatelog(`Welcome back — turn ${saved.game.turngame}, saved ${new Date(saved.savedAt).toLocaleString()}.`, "good");
  } else {
    updatelog("Your village stands in a single timbermellow grove. When it starts to run dry, explore the land around it — and mind the neighbours.", "good");
  }

  bootStage("Ready.", 1);
  uiInit();
  hexRenderer.render();
  refreshTilePanel();
  refreshVillagesPanel();
  update();
  villagers.start();
  turnSnapshotTake();
  await nextFrame();
  bootDone();
}

// The named stretch of country a tile belongs to, if it is part of one.
function regionOfTile(tile) {
  if (!world || !tile || !tile.regionId) return null;
  return (world.regions || []).find((region) => region.id === tile.regionId) || null;
}

// The hearth never moves, so it is found once. It used to be looked up by
// searching the whole map, which is thirty thousand tiles now and is asked
// for on every frame of the villagers' animation.
let homeTileCache = null;

function homeTile() {
  if (!homeTileCache && hexMap) {
    homeTileCache = hexMap.getAllTiles().find((candidate) => candidate.isStartingTile) || null;
  }
  return homeTileCache;
}

function villageCenter() {
  const tile = homeTile();
  return tile ? worldTileCenter(tile.q, tile.r, mapGrid) : { x: 0, y: 0 };
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
    invalidateMinimap();
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
  invalidateMinimap();
  drawMinimap();
}

// game.js calls this at the end of end_turn().
function afterTurnEnded() {
  villagesTakeTurn(hexMap, mapGrid, turngame, worldSeed, updatelog);
  hexRenderer.render();
  refreshTilePanel();
  refreshVillagesPanel();
  invalidateMinimap();
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
  // The season is in the key because the fields change with it: turned earth
  // in spring, green in summer, sheaves at harvest, snow-covered stubble.
  const key = `${stonehouse}|${barn}|${school}|${armycamp}|${territoryClaimedCount()}|${seasonchecker}`;
  if (!force && key === settlementsKey) return;
  settlementsKey = key;
  paintSettlements(document.getElementById("mapSettlementsHost"), world, hexMap, {
    houses: stonehouse, barns: barn, schools: school, camps: armycamp, season: seasonchecker,
  });
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
    const anywhere = hexMap.getFrontierTiles("player")
      .some((candidate) => !["ocean", "lake"].includes(candidate.terrainType));
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

  // The pane is a chunk of innerHTML; rebuilding it on every click throws
  // away the player's tooltip and costs a layout for nothing. It only needs
  // redrawing when the tile, its stores, or what you could do to it change.
  const key = [
    tile.id, revealed, claimed, frontier, foreign, tile.owner,
    Object.keys(tile.resources).map((type) => tile.resources[type].amount + "/" + tile.resources[type].max).join(","),
    foreign ? territorySeizeBlocker(tile.id) : territoryExploreBlocker(tile.id),
  ].join("|");
  if (key === tilePanelKey) return;
  tilePanelKey = key;

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
    const region = regionOfTile(tile);
    const climate = terrainClimateNote(tile);
    info.innerHTML = `
      <div class="rw-tileinfo__name">${TERRAIN_NAMES[tile.terrainType] || tile.terrainType}</div>
      ${region ? `<div class="rw-tileinfo__region">${region.name}</div>` : ""}
      <div class="rw-tileinfo__state ${stateClass}">${chip}${state}</div>
      ${climate ? `<div class="rw-tileinfo__climate">${climate}</div>` : ""}
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
    // Scouts make the march cheaper, so quote what it actually costs today.
    const cost = `${EXPLORE_MIN_HUMANS} villagers · ${EXPLORE_MIN_SOLDIERS} soldier · ${territoryExploreFood()} food · ${territoryExploreHours()} hours`;
    const gained = territoryExploreYield(tile.id);
    setTileGizmo(button, "🚩", "Explore", false);
    button.onclick = explore;
    button.disabled = !!blocker;
    button.dataset.tipTitle = "Send an expedition";
    button.dataset.tip = `An expedition settles a whole district, not one field — about ${gained} hexes around this one. Everything on them joins your stores-on-land, and the country beyond comes into view.`;
    button.dataset.tipCost = cost;
    button.dataset.tipBlock = blocker || "";
    reason.textContent = blocker || `Requires: ${cost}. Settles about ${gained} hexes.`;
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

// The world panel. Three layers, because it is redrawn on every frame of a
// drag and there are thirty thousand tiles:
//
//   terrain   painted once, offscreen — the island never changes
//   holdings  repainted only when land changes hands or is revealed
//   the box   the only thing drawn on every viewport change
let minimapTerrain = null;
let minimapHoldings = null;
let minimapHoldingsKey = "";

function minimapProjection(canvas) {
  const scale = Math.min(canvas.width / world.width, canvas.height / world.height);
  return {
    scale,
    ox: (canvas.width - world.width * scale) / 2,
    oy: (canvas.height - world.height * scale) / 2,
    radius: Math.max(0.7, mapGrid.hexSize * scale * 0.9),
  };
}

function buildMinimapTerrain(canvas) {
  const layer = document.createElement("canvas");
  layer.width = canvas.width;
  layer.height = canvas.height;
  const ctx = layer.getContext("2d");
  const { scale, ox, oy, radius } = minimapProjection(canvas);

  ctx.fillStyle = "#8fb4c4";
  ctx.fillRect(0, 0, layer.width, layer.height);

  // Grouped by colour: a few dozen fills instead of thirty thousand.
  const byColor = new Map();
  for (const tile of hexMap.getAllTiles()) {
    if (tile.terrainType === "ocean") continue;
    const color = MINIMAP_TERRAIN_TINT[tile.terrainType] || "rgba(180, 150, 110, 0.5)";
    if (!byColor.has(color)) byColor.set(color, []);
    byColor.get(color).push(tile);
  }
  for (const [color, tiles] of byColor) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const tile of tiles) {
      const center = worldTileCenter(tile.q, tile.r, mapGrid);
      const px = ox + center.x * scale;
      const py = oy + center.y * scale;
      ctx.moveTo(px + radius, py);
      ctx.arc(px, py, radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  return layer;
}

// Who holds what, and what is still blank paper.
function buildMinimapHoldings(canvas) {
  const layer = document.createElement("canvas");
  layer.width = canvas.width;
  layer.height = canvas.height;
  const ctx = layer.getContext("2d");
  const { scale, ox, oy, radius } = minimapProjection(canvas);

  // Fog first: everything not yet seen goes back to parchment.
  if (!hexMap.mapmakingUnlocked) {
    ctx.fillStyle = "#e2d2b2";
    ctx.fillRect(0, 0, layer.width, layer.height);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    for (const tile of hexMap.getSeenTiles()) {
      const center = worldTileCenter(tile.q, tile.r, mapGrid);
      const px = ox + center.x * scale;
      const py = oy + center.y * scale;
      ctx.moveTo(px + radius * 1.4, py);
      ctx.arc(px, py, radius * 1.4, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  const byColor = new Map();
  for (const [owner, ids] of hexMap.tilesByOwner) {
    const color = owner === "player" ? "#c29339" : villageColor(owner) || "#888888";
    if (!byColor.has(color)) byColor.set(color, []);
    for (const id of ids) {
      const tile = hexMap.getTile(id);
      if (tile && hexMap.isRevealed(id)) byColor.get(color).push(tile);
    }
  }
  for (const [color, tiles] of byColor) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const tile of tiles) {
      const center = worldTileCenter(tile.q, tile.r, mapGrid);
      const px = ox + center.x * scale;
      const py = oy + center.y * scale;
      ctx.moveTo(px + radius, py);
      ctx.arc(px, py, radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // Where the villages stand.
  for (const village of villagesGet()) {
    const homeTile = hexMap.getTile(village.homeTileId);
    if (!homeTile || !hexMap.isRevealed(homeTile.id)) continue;
    const center = worldTileCenter(homeTile.q, homeTile.r, mapGrid);
    const px = ox + center.x * scale;
    const py = oy + center.y * scale;
    ctx.fillStyle = village.kind === "garlock" ? "#8c1f1f" : village.kind === "player" ? "#f2c14e" : "#2a4d3a";
    ctx.beginPath();
    ctx.arc(px, py, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  return layer;
}

// Called whenever land changes hands, so the holdings layer is rebuilt then
// rather than on every frame of a drag.
function invalidateMinimap() {
  minimapHoldingsKey = "";
}

function drawMinimap() {
  const canvas = document.getElementById("minimap");
  if (!canvas || !world || !viewport) return;
  const ctx = canvas.getContext("2d");

  if (!minimapTerrain) minimapTerrain = buildMinimapTerrain(canvas);
  const key = `${hexMap.seenTiles.size}|${hexMap.claimOrder.length}|${hexMap.mapmakingUnlocked}`;
  if (key !== minimapHoldingsKey) {
    minimapHoldings = buildMinimapHoldings(canvas);
    minimapHoldingsKey = key;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(minimapTerrain, 0, 0);
  if (minimapHoldings) ctx.drawImage(minimapHoldings, 0, 0);

  ctx.strokeStyle = "#cbb28d";
  ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

  // Camera viewport indicator
  const stage = document.getElementById("mapstage");
  if (!stage) return;
  const { scale, ox, oy } = minimapProjection(canvas);
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
  ctx.fillStyle = "#8c2a1c";
  const cs = 3;
  ctx.fillRect(vx - 1, vy - 1, cs, cs);
  ctx.fillRect(vx + vw - cs + 1, vy - 1, cs, cs);
  ctx.fillRect(vx - 1, vy + vh - cs + 1, cs, cs);
  ctx.fillRect(vx + vw - cs + 1, vy + vh - cs + 1, cs, cs);
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

// ---------------------------------------------------------------------------
// Menu actions the HUD calls by name
// ---------------------------------------------------------------------------

function saveNow() {
  const ok = saveGame(worldSeed);
  updatelog(ok ? "Game saved." : "Could not save — this browser is not letting the page store anything.", ok ? "good" : "bad");
}

function newGame() {
  clearSavedGame();
  location.search = "";
}

// Which way the garlocks are coming from, for the log and the raid alarm.
// Returns something like " from the north-east", or "" if their camp has
// not been found yet.
function garlockDirectionText() {
  if (!hexMap || typeof villagesGet !== "function") return "";
  const camp = villagesGet().find((village) => village.kind === "garlock");
  if (!camp) return "";
  const home = hexMap.getAllTiles().find((tile) => tile.isStartingTile);
  const campTile = hexMap.getTile(camp.homeTileId);
  if (!home || !campTile) return "";
  return ` from the ${directionBetween(home, campTile, mapGrid)}`;
}

function focusVillage() {
  if (!viewport) return;
  const current = viewport.getView();
  viewport.focusOn(villageCenter(), { width: world.width, height: world.height }, Math.max(7, current.scale));
}

function focusSelectedTile() {
  if (!viewport || !hexMap) return;
  const tile = hexMap.getSelectedTile();
  if (!tile) return;
  const current = viewport.getView();
  viewport.focusOn(worldTileCenter(tile.q, tile.r, mapGrid), { width: world.width, height: world.height }, Math.max(6, current.scale));
}

function selectBestFrontier() {
  if (!hexMap) return;
  const frontier = hexMap.getFrontierTiles("player")
    .filter((tile) => !["ocean", "lake"].includes(tile.terrainType));
  if (!frontier.length) return;
  const worth = (tile) => Object.values(tile.resources || {}).reduce((total, entry) => total + (entry.amount || 0), 0);
  frontier.sort((a, b) => worth(b) - worth(a));
  onHexTileClick(frontier[0].id);
  focusSelectedTile();
}

window.addEventListener("DOMContentLoaded", initGame);
