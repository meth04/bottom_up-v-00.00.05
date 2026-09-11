// worldPainter.js
//
// Paints a generated world (worldGen.js) as clean 2D game tiles using the
// sprites in artStyle.js, and — separately, because it changes during play
// — the buildings, roads and banners of the villages on it.
//
//   paintWorld(container, world)                      the ground, once
//   paintSettlements(container, world, hexMap, stats) buildings + roads, redrawn as the village grows
//
// Both draw in the same coordinate space the hex overlay, effects and
// villagers share.

const TERRAIN_FILL = {
  plains: ART_COLORS.plains,
  flowerMeadow: ART_COLORS.meadow,
  forest: ART_COLORS.forest,
  timbermellowForest: ART_COLORS.homeGround,
  denseBush: ART_COLORS.thicket,
  rockyOutcrop: ART_COLORS.outcrop,
  mountains: ART_COLORS.mountain,
  overgrownHighlands: ART_COLORS.terrace,
  river: ART_COLORS.waterLight,
};

function paintCompassRose(parent, x, y, size) {
  const g = svgEl("g", { class: "art-compass-rose" });
  g.appendChild(svgEl("circle", { cx: x, cy: y, r: size, fill: "none", stroke: "#c49a45", "stroke-width": 2 }));
  g.appendChild(svgEl("circle", { cx: x, cy: y, r: size * 0.88, fill: "none", stroke: "#8a6526", "stroke-width": 1, "stroke-dasharray": "2 3" }));
  g.appendChild(svgEl("circle", { cx: x, cy: y, r: size * 0.45, fill: "none", stroke: "#c49a45", "stroke-width": 1 }));

  const cardinal = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = cardinal[i];
    const px = dy, py = -dx;
    g.appendChild(svgEl("polygon", {
      points: `${x},${y} ${x + dx * size} ${y + dy * size} ${x + dx * size * 0.3 + px * size * 0.15} ${y + dy * size * 0.3 + py * size * 0.15}`,
      fill: "#e5c06b"
    }));
    g.appendChild(svgEl("polygon", {
      points: `${x},${y} ${x + dx * size} ${y + dy * size} ${x + dx * size * 0.3 - px * size * 0.15} ${y + dy * size * 0.3 - py * size * 0.15}`,
      fill: "#8c2a1c"
    }));
  }

  const diag = [[0.707, -0.707], [0.707, 0.707], [-0.707, 0.707], [-0.707, -0.707]];
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = diag[i];
    const px = dy, py = -dx;
    g.appendChild(svgEl("polygon", {
      points: `${x},${y} ${x + dx * size * 0.75} ${y + dy * size * 0.75} ${x + dx * size * 0.25 + px * size * 0.1} ${y + dy * size * 0.25 + py * size * 0.1}`,
      fill: "#c59d48"
    }));
    g.appendChild(svgEl("polygon", {
      points: `${x},${y} ${x + dx * size * 0.75} ${y + dy * size * 0.75} ${x + dx * size * 0.25 - px * size * 0.1} ${y + dy * size * 0.25 - py * size * 0.1}`,
      fill: "#3d2b1f"
    }));
  }

  g.appendChild(svgEl("circle", { cx: x, cy: y, r: size * 0.12, fill: "#3a2818", stroke: "#e5c06b", "stroke-width": 1.5 }));
  g.appendChild(svgEl("circle", { cx: x, cy: y, r: size * 0.05, fill: "#e5c06b" }));

  const n = svgEl("text", { x, y: y - size - 8, "text-anchor": "middle", fill: "#e5c06b", "font-family": "Cinzel, serif", "font-size": "15", "font-weight": "700" });
  n.textContent = "N";
  g.appendChild(n);

  parent.appendChild(g);
}

function paintCartouche(parent, x, y, width, height) {
  const g = svgEl("g", { class: "art-cartouche" });
  g.appendChild(svgEl("rect", {
    x: x - width * 0.5, y: y - height * 0.5, width, height, rx: 6,
    fill: "#edd9b4", stroke: "#8a6526", "stroke-width": 2, opacity: 0.92
  }));
  g.appendChild(svgEl("rect", {
    x: x - width * 0.5 + 4, y: y - height * 0.5 + 4, width: width - 8, height: height - 8, rx: 4,
    fill: "none", stroke: "#c49a45", "stroke-width": 1
  }));
  const t1 = svgEl("text", {
    x, y: y - 4, "text-anchor": "middle", fill: "#3b220e",
    "font-family": "Cinzel, serif", "font-size": "15", "font-weight": "700", "letter-spacing": "0.14em"
  });
  t1.textContent = "CHARTA TERRARUM";
  g.appendChild(t1);
  const t2 = svgEl("text", {
    x, y: y + 14, "text-anchor": "middle", fill: "#8c2a1c",
    "font-family": "Cinzel, serif", "font-size": "10", "font-weight": "600", "letter-spacing": "0.16em"
  });
  t2.textContent = "ANNO DOMINI • UNCHARTED ISLE";
  g.appendChild(t2);
  parent.appendChild(g);
}

function paintWorld(container, world) {
  const random = createRandom(world.seed + 99);
  const size = world.grid.hexSize;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${world.width} ${world.height}`,
    width: "100%",
    height: "100%",
    preserveAspectRatio: "xMidYMid meet",
    class: "map-artwork",
  });
  svg.appendChild(svgEl("rect", { x: 0, y: 0, width: world.width, height: world.height, fill: ART_COLORS.waterDeep }));

  // The ground is static — everything that moves lives in other layers —
  // so the browser can paint it once and leave it alone.
  const ground = svgEl("g", { class: "art-ground" });
  const sprites = svgEl("g", { class: "art-sprites" });

  for (const tile of world.tiles) {
    const center = worldTileCenter(tile.q, tile.r, world.grid);
    paintHexBase(ground, center.x, center.y, size, TERRAIN_FILL[tile.terrainType] || ART_COLORS.plains);
    paintTileSprites(sprites, tile, center, size, random);
  }

  svg.appendChild(ground);

  // Water runs over the ground as one band per river.
  const water = svgEl("g", { class: "art-water" });
  const tileById = new Map(world.tiles.map((tile) => [tile.id, tile]));
  for (const riverIds of world.rivers) {
    const centers = riverIds.map((id) => {
      const tile = tileById.get(id);
      const c = worldTileCenter(tile.q, tile.r, world.grid);
      return [c.x, c.y];
    });
    const halfWidths = centers.map((_, i) => size * (0.2 + 0.18 * (i / Math.max(1, centers.length - 1))));
    paintRiver(water, centers, halfWidths);
    const last = tileById.get(riverIds[riverIds.length - 1]);
    if (last.specialEffect === "pool") {
      const c = worldTileCenter(last.q, last.r, world.grid);
      paintPool(water, c.x, c.y, size);
    }
  }
  svg.appendChild(water);
  svg.appendChild(sprites);

  // Ornate Renaissance Map Cartouche & Compass Rose in the ocean
  paintCompassRose(svg, Math.min(world.width - 130, world.width * 0.94), 130, 75);
  paintCartouche(svg, 175, 75, 230, 52);

  // A colour wash css/style.css tunes per season.
  svg.appendChild(svgEl("rect", {
    x: 0, y: 0, width: world.width, height: world.height,
    class: "art-season-tint", fill: "#ffffff", opacity: 0,
  }));

  container.innerHTML = "";
  container.appendChild(svg);
  return svg;
}

function paintTileSprites(parent, tile, center, size, random) {
  const { x, y } = center;

  // World Wonders & Landmarks take precedence and are visually striking
  if (tile.landmark) {
    switch (tile.landmark) {
      case "standingStones":
        paintStandingStones(parent, x, y, size * 0.95);
        return;
      case "motherTree":
        paintMotherTree(parent, x, y, size * 1.05);
        return;
      case "dragonBones":
        paintDragonBones(parent, x, y, size * 0.9);
        return;
      case "crystalMine":
        paintCrystalMine(parent, x, y, size * 0.9);
        return;
      case "shipwreck":
        paintShipwreck(parent, x, y, size * 0.85);
        return;
    }
  }

  switch (tile.terrainType) {
    case "plains":
      if (random() < 0.08 && tile.elevation > 0.35) {
        paintWindmill(parent, x, y, size * 0.7);
      } else if (random() < 0.35) {
        paintHayBale(parent, x + (random() - 0.5) * size * 0.4, y + (random() - 0.5) * size * 0.3, size * 0.75);
      } else {
        paintWheat(parent, x + (random() - 0.5) * size * 0.4, y + (random() - 0.5) * size * 0.3, size, random);
      }
      break;
    case "flowerMeadow":
      paintFlowerDots(parent, x, y, size, random);
      if (random() < 0.4) paintBush(parent, x + (random() - 0.5) * size * 0.5, y + size * 0.18, size, random);
      break;
    case "forest":
      if (random() < 0.4) {
        paintPineTree(parent, x - size * 0.22, y + size * 0.12, size * 0.85, random);
        paintTree(parent, x + size * 0.22, y - size * 0.1, size * 0.8, random);
      } else if (random() < 0.6) {
        paintAutumnTree(parent, x - size * 0.2, y + size * 0.1, size * 0.85, random);
        paintTree(parent, x + size * 0.2, y - size * 0.1, size * 0.8, random);
      } else {
        paintTree(parent, x - size * 0.22, y + size * 0.12, size * 0.85, random);
        paintTree(parent, x + size * 0.22, y - size * 0.1, size * 0.8, random);
      }
      break;
    case "denseBush":
      paintTree(parent, x - size * 0.28, y - size * 0.08, size * 0.85, random);
      paintPineTree(parent, x + size * 0.25, y - size * 0.15, size * 0.8, random);
      paintTree(parent, x, y + size * 0.25, size * 0.9, random);
      break;
    case "rockyOutcrop":
      paintRock(parent, x - size * 0.18, y + size * 0.1, size, random);
      if (random() < 0.65) paintRock(parent, x + size * 0.22, y - size * 0.12, size * 0.75, random);
      break;
    case "mountains":
      paintMountain(parent, x, y + size * 0.1, size, random);
      break;
    case "overgrownHighlands":
      paintTerraceStripes(parent, x, y, size, random);
      if (random() < 0.4) {
        paintPineTree(parent, x + size * 0.22, y - size * 0.12, size * 0.65, random);
      } else if (random() < 0.5) {
        paintRock(parent, x - size * 0.2, y + size * 0.14, size * 0.6, random);
      }
      break;
    case "timbermellowForest":
      // Home tile trees
      paintTree(parent, x - size * 0.52, y + size * 0.28, size * 0.75, random);
      paintTree(parent, x + size * 0.52, y + size * 0.24, size * 0.75, random);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Settlements: what changes during play
// ---------------------------------------------------------------------------

// stats: { houses, barns } for the player's village.
function paintSettlements(container, world, hexMap, stats) {
  const random = createRandom(world.seed + 7);
  const size = world.grid.hexSize;
  const svg = svgEl("svg", {
    viewBox: `0 0 ${world.width} ${world.height}`,
    width: "100%",
    height: "100%",
    preserveAspectRatio: "xMidYMid meet",
    class: "map-settlements",
  });

  // Dirt paths from the player's village out to every tile it holds,
  // following the territory so no path crosses land you don't own.
  const roads = svgEl("g", { class: "art-roads" });
  const home = hexMap.getAllTiles().find((tile) => tile.isStartingTile);
  if (home) {
    const parent = new Map([[home.id, null]]);
    const queue = [home];
    while (queue.length) {
      const current = queue.shift();
      for (const neighbor of hexMap.getNeighbors(current.id)) {
        if (neighbor.owner !== "player" || parent.has(neighbor.id)) continue;
        parent.set(neighbor.id, current);
        queue.push(neighbor);
      }
    }
    for (const [id, from] of parent) {
      if (!from) continue;
      const a = worldTileCenter(from.q, from.r, world.grid);
      const to = hexMap.getTile(id);
      const b = worldTileCenter(to.q, to.r, world.grid);
      paintRoad(roads, [[a.x, a.y], [b.x, b.y]]);
    }
  }
  svg.appendChild(roads);

  const buildings = svgEl("g", { class: "art-buildings" });

  // ---------------------------------------------------------------------------
  // Living Districts on Annexed Player Territory
  // ---------------------------------------------------------------------------
  const claimedTiles = hexMap.getClaimedTiles().filter((t) => !t.isStartingTile && t.owner === "player");
  for (const cTile of claimedTiles) {
    const c = worldTileCenter(cTile.q, cTile.r, world.grid);
    const neighbors = hexMap.getNeighbors(cTile.id);
    const isWaterfront = cTile.terrainType === "river" || neighbors.some((n) => n.terrainType === "river");
    const isFrontierTile = hexMap.isFrontier(cTile.id);

    if (isWaterfront) {
      // River Fishery & Pier District
      paintFisheryDock(buildings, c.x, c.y + size * 0.06, size * 0.88);
      paintHouse(buildings, c.x - size * 0.3, c.y - size * 0.18, size * 0.48, "#785233");
    } else if (cTile.terrainType === "forest" || cTile.terrainType === "denseBush" || cTile.terrainType === "timbermellowForest") {
      // Lumber & Forestry Camp District
      paintLumberCamp(buildings, c.x - size * 0.06, c.y + size * 0.06, size * 0.86);
      paintBarn(buildings, c.x + size * 0.32, c.y - size * 0.18, size * 0.52);
      paintHouse(buildings, c.x - size * 0.34, c.y + size * 0.22, size * 0.44, ART_COLORS.roofDark);
    } else if (cTile.terrainType === "mountains" || cTile.terrainType === "rockyOutcrop") {
      // Masonry Quarry & Blacksmith Smithy District
      paintSmithy(buildings, c.x - size * 0.2, c.y + size * 0.08, size * 0.78);
      paintQuarryWorks(buildings, c.x + size * 0.22, c.y - size * 0.12, size * 0.72);
      paintWatchtower(buildings, c.x + size * 0.38, c.y + size * 0.24, size * 0.68, "#d9a441");
    } else {
      // Agricultural Farmland, Granary & Livestock District (plains, meadow, highlands)
      paintBarn(buildings, c.x - size * 0.24, c.y - size * 0.12, size * 0.62);
      paintAnimalPen(buildings, c.x + size * 0.24, c.y + size * 0.15, size * 0.68);
      paintHouse(buildings, c.x - size * 0.28, c.y + size * 0.22, size * 0.46, ART_COLORS.roof);
      if (cTile.terrainType === "plains") {
        paintHayBale(buildings, c.x + size * 0.2, c.y - size * 0.28, size * 0.6);
      }
    }

    // Fortified frontier outpost training grounds
    if (isFrontierTile && cTile.terrainType !== "mountains" && cTile.terrainType !== "rockyOutcrop") {
      paintTrainingGround(buildings, c.x + size * 0.28, c.y - size * 0.25, size * 0.62);
    }
  }

  for (const village of world.villages) {
    const tile = hexMap.getTile(village.homeTileId);
    const c = worldTileCenter(tile.q, tile.r, world.grid);
    if (village.kind === "player") {
      paintPlayerVillage(buildings, c.x, c.y, size, stats, random);
    } else {
      paintOtherVillage(buildings, c.x, c.y, size, village, random);
    }
    const label = svgEl("text", { x: c.x, y: c.y - size * 1.05, class: "art-village-label", "text-anchor": "middle" });
    label.textContent = village.name;
    buildings.appendChild(label);
  }
  svg.appendChild(buildings);

  container.innerHTML = "";
  container.appendChild(svg);
  return svg;
}

// The player's capital village: Chieftain's Great Hall, stone plaza, village well,
// market stalls, central bonfire, and growing perimeter cottages
function paintPlayerVillage(parent, x, y, size, stats, random) {
  // Paved cobblestone civic plaza
  paintPlaza(parent, x, y + size * 0.08, size * 1.08);

  // Magnificent Chieftain's Great Hall at the capital center
  paintChieftainHall(parent, x, y - size * 0.12, size * 0.92);

  // Village well with bucket and shingled roof
  paintWell(parent, x - size * 0.38, y + size * 0.2, size * 0.66);

  // Flanking medieval market stalls
  paintMarketStall(parent, x - size * 0.44, y - size * 0.04, "crimson", size * 0.54);
  paintMarketStall(parent, x + size * 0.44, y - size * 0.04, "azure", size * 0.54);

  // Capital hearth bonfire
  paintCampfire(parent, x, y + size * 0.28, size * 0.72);

  // Chieftain's golden heraldic banner
  paintBanner(parent, x + size * 0.24, y + size * 0.26, size * 0.72, "#d9a441");

  const slots = [
    [-0.58, 0.32], [0.58, 0.32], [-0.35, 0.54], [0.35, 0.54], [0, 0.62],
    [-0.68, 0.06], [0.68, 0.06], [-0.58, -0.42], [0.58, -0.42],
    [-0.32, -0.62], [0.32, -0.62], [0, -0.68],
    [-0.8, 0.28], [0.8, 0.28], [-0.75, 0.55], [0.75, 0.55],
    [-0.5, 0.72], [0.5, 0.72], [-0.78, -0.22], [0.78, -0.22]
  ];
  const houses = stats.houses || 1;
  const barns = stats.barns || 1;

  let slot = 0;
  // If additional barns built, place around the perimeter
  for (let i = 1; i < barns && slot < slots.length; i++, slot++) {
    paintBarn(parent, x + slots[slot][0] * size, y + slots[slot][1] * size, size * 0.58);
  }
  // If additional houses built, place around the perimeter
  for (let i = 1; i < houses && slot < slots.length; i++, slot++) {
    paintHouse(parent, x + slots[slot][0] * size, y + slots[slot][1] * size, size * 0.56, i % 3 === 1 ? ART_COLORS.roofDark : ART_COLORS.roof);
  }

  // Stone watchtower guards the settlement entrance as village prospers
  if (houses >= 3 || barns >= 2) {
    paintWatchtower(parent, x + size * 0.52, y - size * 0.42, size * 0.8, "#d9a441");
  }
}

function paintOtherVillage(parent, x, y, size, village, random) {
  if (village.kind === "garlock") {
    paintSpikes(parent, x, y + size * 0.35, size);
    paintWarTent(parent, x - size * 0.28, y - size * 0.05, size * 0.7);
    paintWarTent(parent, x + size * 0.28, y - size * 0.05, size * 0.65);
    paintCampfire(parent, x, y + size * 0.1, size * 0.7);
    paintBanner(parent, x, y - size * 0.25, size * 0.7, village.color);
  } else {
    paintPlaza(parent, x, y, size * 0.85);
    paintChieftainHall(parent, x, y - size * 0.12, size * 0.75);
    paintMarketStall(parent, x - size * 0.35, y + size * 0.12, "emerald", size * 0.48);
    paintHouse(parent, x + size * 0.35, y + size * 0.12, size * 0.52, ART_COLORS.roof);
    paintBanner(parent, x, y + size * 0.26, size * 0.65, village.color);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { paintWorld, paintSettlements };
}
