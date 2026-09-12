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
  birchWood: "#7fa844",
  timbermellowForest: ART_COLORS.homeGround,
  denseBush: ART_COLORS.thicket,
  taiga: "#2b5a3c",
  rockyOutcrop: ART_COLORS.outcrop,
  mountains: ART_COLORS.mountain,
  overgrownHighlands: ART_COLORS.terrace,
  marsh: ART_COLORS.marsh,
  tundra: ART_COLORS.tundra,
  snowfield: ART_COLORS.snowfield,
  badlands: ART_COLORS.badlands,
  beach: ART_COLORS.beach,
  river: ART_COLORS.waterLight,
  lake: ART_COLORS.lake,
  ocean: ART_COLORS.ocean,
};

// Ground that the undergrowth scatter should leave alone.
const SCATTER_SKIP = ["ocean", "lake", "river"];

// What little things grow on each kind of ground, and how thickly.
const SCATTER_RECIPES = {
  plains:             { count: 5, tuft: "#b79a3e", pebble: 0.15, wildlife: 0.10 },
  flowerMeadow:       { count: 6, tuft: "#5f8a3c", pebble: 0.08, wildlife: 0.16, flowers: true },
  timbermellowForest: { count: 5, tuft: "#4d7a30", mushroom: 0.3, log: 0.25, wildlife: 0.12 },
  forest:             { count: 5, tuft: "#3f6b2c", mushroom: 0.35, log: 0.3, wildlife: 0.14 },
  birchWood:          { count: 5, tuft: "#6f9a3c", mushroom: 0.25, log: 0.25, wildlife: 0.16 },
  denseBush:          { count: 6, tuft: "#2f5c2a", mushroom: 0.3, log: 0.2 },
  taiga:              { count: 5, tuft: "#2b5238", mushroom: 0.2, log: 0.3, wildlife: 0.08 },
  overgrownHighlands: { count: 4, tuft: "#7c8a3c", pebble: 0.35 },
  rockyOutcrop:       { count: 5, pebble: 0.75, tuft: "#8a8f6d" },
  mountains:          { count: 4, pebble: 0.8 },
  badlands:           { count: 4, pebble: 0.5, tuft: "#8a7539" },
  tundra:             { count: 5, pebble: 0.4, tuft: "#7f8560" },
  snowfield:          { count: 3, pebble: 0.25 },
  marsh:              { count: 4, tuft: "#6e8442", mushroom: 0.2, wildlife: 0.12 },
  beach:              { count: 4, pebble: 0.6, tuft: "#b9ab74" },
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

// Edge i of a pointy-top hex faces this neighbour (same order hexRenderer
// uses): corners -30°, 30°, 90°, 150°, 210°, 270°.
const PAINT_EDGE_DIRECTION = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

function paintWorld(container, world) {
  const random = createRandom(world.seed + 99);
  const size = world.grid.hexSize;
  const tileById = new Map(world.tiles.map((tile) => [tile.id, tile]));
  const tileByCoord = new Map(world.tiles.map((tile) => [hexKey(tile.q, tile.r), tile]));
  const neighborAt = (tile, edge) => {
    const dir = PAINT_EDGE_DIRECTION[edge];
    return tileByCoord.get(hexKey(tile.q + dir.q, tile.r + dir.r)) || null;
  };

  const svg = svgEl("svg", {
    viewBox: `0 0 ${world.width} ${world.height}`,
    width: "100%",
    height: "100%",
    preserveAspectRatio: "xMidYMid meet",
    class: "map-artwork",
  });
  svg.appendChild(svgEl("rect", { x: 0, y: 0, width: world.width, height: world.height, fill: ART_COLORS.oceanDeep }));

  // The ground is static — everything that moves lives in other layers —
  // so the browser can paint it once and leave it alone. It is built up in
  // passes so the whole map reads as one picture rather than 3,500 stamps:
  //
  //   ground  → the flat hex of colour
  //   relief  → hillshade and contour rings
  //   water   → sea texture, rivers, lakes, the foam along every shore
  //   sprites → the one big thing on the tile (trees, a mountain, a mesa)
  //   scatter → the small things underfoot (tufts, pebbles, deer, mushrooms)
  const ground = svgEl("g", { class: "art-ground" });
  const relief = svgEl("g", { class: "art-relief" });
  const water = svgEl("g", { class: "art-water" });
  const sprites = svgEl("g", { class: "art-sprites" });
  const scatter = svgEl("g", { class: "art-scatter" });

  for (const tile of world.tiles) {
    const center = worldTileCenter(tile.q, tile.r, world.grid);
    const isSea = tile.terrainType === "ocean";

    paintHexBase(ground, center.x, center.y, size, TERRAIN_FILL[tile.terrainType] || ART_COLORS.plains);

    if (isSea) {
      // How far from land this water is, for the depth tint.
      const touchingLand = countLandNeighbours(tile, tileByCoord);
      paintOceanSurface(water, center.x, center.y, size, touchingLand > 0 ? 0.2 : 0.75, random);
      const shoreEdges = [];
      for (let edge = 0; edge < 6; edge++) {
        const neighbor = neighborAt(tile, edge);
        if (neighbor && neighbor.terrainType !== "ocean") shoreEdges.push(edge);
      }
      if (shoreEdges.length) paintCoastFoam(water, center.x, center.y, size, shoreEdges);
      continue;
    }

    paintReliefShade(relief, center.x, center.y, size, tile.elevation);
    if (tile.elevation > 0.66) {
      paintContourRing(relief, center.x, center.y, size, tile.elevation > 0.78 ? 1 : 0);
    }

    if (tile.terrainType === "lake") {
      paintLakeSurface(water, center.x, center.y, size, random);
      continue;
    }

    paintTileSprites(sprites, tile, center, size, random);
    paintTileScatter(scatter, tile, center, size);
  }

  svg.appendChild(ground);
  svg.appendChild(relief);

  // Rivers run over the ground as one band per watercourse.
  for (const river of world.rivers) {
    const ids = river.tileIds || river;                 // tolerate old saves
    const centers = ids
      .map((id) => tileById.get(id))
      .filter(Boolean)
      .map((tile) => {
        const c = worldTileCenter(tile.q, tile.r, world.grid);
        return [c.x, c.y];
      });
    if (centers.length < 2) continue;
    const halfWidths = centers.map((_, i) => size * (0.16 + 0.2 * (i / Math.max(1, centers.length - 1))));
    paintRiver(water, centers, halfWidths);
    const last = tileById.get(ids[ids.length - 1]);
    if (last && last.specialEffect === "pool") {
      const c = worldTileCenter(last.q, last.r, world.grid);
      paintPool(water, c.x, c.y, size);
    }
  }
  svg.appendChild(water);

  // The old tracks between the villages, drawn faintly under everything else
  // that lives on the ground.
  svg.appendChild(paintTradeRoutes(world, tileById));

  svg.appendChild(sprites);
  svg.appendChild(scatter);

  // Names for the big stretches of country.
  svg.appendChild(paintRegionLabels(world));

  // Ornate Renaissance Map Cartouche & Compass Rose in the ocean
  paintCompassRose(svg, Math.min(world.width - 100, world.width * 0.94), 90, 56);
  paintCartouche(svg, 140, 52, 190, 42);

  // A colour wash css/style.css tunes per season.
  svg.appendChild(svgEl("rect", {
    x: 0, y: 0, width: world.width, height: world.height,
    class: "art-season-tint", fill: "#ffffff", opacity: 0,
  }));

  container.innerHTML = "";
  container.appendChild(svg);
  return svg;
}

function countLandNeighbours(tile, tileByCoord) {
  let count = 0;
  for (const { q, r } of hexNeighbors(tile.q, tile.r)) {
    const neighbor = tileByCoord.get(hexKey(q, r));
    if (neighbor && neighbor.terrainType !== "ocean") count++;
  }
  return count;
}

// The pale cart tracks that already joined the villages before you arrived.
function paintTradeRoutes(world, tileById) {
  const layer = svgEl("g", { class: "art-traderoutes" });
  for (const route of world.tradeRoutes || []) {
    const points = route.tileIds
      .map((id) => tileById.get(id))
      .filter(Boolean)
      .map((tile) => {
        const c = worldTileCenter(tile.q, tile.r, world.grid);
        return [c.x, c.y];
      });
    if (points.length < 2) continue;
    layer.appendChild(svgEl("path", {
      d: smoothPath(points, false),
      fill: "none",
      stroke: ART_COLORS.road,
      "stroke-width": Math.max(1.2, world.grid.hexSize * 0.07),
      "stroke-linecap": "round",
      "stroke-dasharray": "6 7",
      opacity: 0.38,
    }));
  }
  return layer;
}

// Region names, drawn along a gentle arc in the map's lettering.
function paintRegionLabels(world) {
  const layer = svgEl("g", { class: "art-regionlabels" });
  for (const region of world.regions || []) {
    if (region.terrainType === "ocean" && region.tileCount < 40) continue;
    const scale = Math.min(1.9, 0.7 + region.tileCount / 60);
    const text = svgEl("text", {
      x: region.center.x,
      y: region.center.y,
      "text-anchor": "middle",
      class: "art-region-label",
      "font-size": (13 * scale).toFixed(1),
      fill: region.terrainType === "ocean" ? "#bfe0ea" : "#4a3620",
      opacity: 0.55,
    });
    text.textContent = region.name.toUpperCase();
    layer.appendChild(text);
  }
  return layer;
}

// The small stuff underfoot. It is seeded from the tile itself, so the same
// hex always grows the same tufts no matter when it is drawn.
function paintTileScatter(parent, tile, center, size, recipeOverride) {
  if (SCATTER_SKIP.includes(tile.terrainType)) return;
  const recipe = recipeOverride || SCATTER_RECIPES[tile.terrainType];
  if (!recipe) return;
  const random = createRandom(tile.detailSeed || 1);
  const { x, y } = center;

  const tufts = [];
  const pebbles = [];
  for (let i = 0; i < recipe.count; i++) {
    // Kept inside the hex: a point in a slightly squashed disc.
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * size * 0.78;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius * 0.86;
    const roll = random();

    if (recipe.pebble && roll < recipe.pebble) {
      pebbles.push([px, py]);
    } else if (recipe.mushroom && roll < recipe.mushroom + (recipe.pebble || 0)) {
      paintMushroom(parent, px, py, size * 0.5);
    } else if (recipe.tuft) {
      tufts.push([px, py]);
    }
  }
  // All of this tile's grass and loose stone go out as one element each.
  if (tufts.length) paintGrassTufts(parent, tufts, size * 0.42, recipe.tuft);
  if (pebbles.length) paintPebbles(parent, pebbles, size * 0.5, random);

  if (recipe.log && random() < recipe.log) {
    paintFallenLog(parent, x + (random() - 0.5) * size * 0.7, y + size * 0.3, size * 0.7, random);
  }
  if (recipe.wildlife && random() < recipe.wildlife) {
    if (random() < 0.55) paintDeer(parent, x + (random() - 0.5) * size * 0.5, y + size * 0.1, size * 0.6);
    else paintBirdFlock(parent, x, y - size * 0.42, size * 0.9, random);
  }
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
      case "ruinedTower":
        paintRuinedTower(parent, x, y, size * 0.9);
        return;
      case "hotSpring":
        paintHotSpring(parent, x, y, size * 0.85);
        return;
      case "boneOrchard":
        paintBoneOrchard(parent, x, y, size * 0.85);
        return;
    }
  }

  switch (tile.terrainType) {
    case "beach":
      paintBeachDetail(parent, x, y, size, random);
      break;
    case "marsh":
      paintMarshReeds(parent, x, y, size, random);
      break;
    case "tundra":
      paintTundraScrub(parent, x, y, size, random);
      break;
    case "snowfield":
      paintSnowDrift(parent, x, y, size, random);
      if (random() < 0.3) paintTaigaPine(parent, x + size * 0.24, y - size * 0.1, size * 0.5, random);
      break;
    case "badlands":
      paintBadlandsMesa(parent, x, y, size, random);
      break;
    case "birchWood":
      paintDenseGrove(parent, x, y, size, "birch", random);
      break;
    case "taiga":
      paintDenseGrove(parent, x, y, size, "taiga", random);
      break;
    case "plains":
      if (random() < 0.08 && tile.elevation > 0.35) {
        paintWindmill(parent, x, y, size * 0.72);
      } else if (random() < 0.55) {
        paintCropField(parent, x, y, size, random);
      } else {
        paintWheat(parent, x, y, size * 0.75, random);
      }
      break;
    case "flowerMeadow":
      paintFlowerDots(parent, x, y, size, random);
      if (random() < 0.4) paintBush(parent, x + (random() - 0.5) * size * 0.4, y + size * 0.15, size * 0.65, random);
      break;
    case "forest":
      paintDenseGrove(parent, x, y, size, random() < 0.35 ? "pine" : random() < 0.65 ? "autumn" : "mixed", random);
      break;
    case "denseBush":
      paintDenseGrove(parent, x, y, size, "pine", random);
      paintBush(parent, x, y + size * 0.18, size * 0.6, random);
      break;
    case "rockyOutcrop":
      paintRock(parent, x - size * 0.16, y + size * 0.1, size * 0.9, random);
      if (random() < 0.65) paintRock(parent, x + size * 0.2, y - size * 0.12, size * 0.7, random);
      break;
    case "mountains":
      paintMountain(parent, x, y + size * 0.08, size * 0.95, random);
      if (tile.snowCapped) {
        parent.appendChild(svgEl("path", {
          d: `M ${x - size * 0.26} ${y - size * 0.22} L ${x} ${y - size * 0.58} L ${x + size * 0.26} ${y - size * 0.22}` +
             ` q ${-size * 0.13} ${size * 0.07} ${-size * 0.26} 0 q ${-size * 0.13} ${-size * 0.07} ${-size * 0.26} 0 z`,
          fill: ART_COLORS.snow, opacity: 0.95,
        }));
      }
      break;
    case "overgrownHighlands":
      paintTerraceStripes(parent, x, y, size, random);
      if (random() < 0.4) {
        paintPineTree(parent, x + size * 0.22, y - size * 0.12, size * 0.55, random);
      } else if (random() < 0.5) {
        paintRock(parent, x - size * 0.18, y + size * 0.12, size * 0.5, random);
      }
      break;
    case "timbermellowForest":
      // Vibrant dense grove on starting/home forest
      paintDenseGrove(parent, x, y, size, "oak", random);
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
  const roadWidth = Math.max(1.8, size * 0.1);
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
      paintRoad(roads, [[a.x, a.y], [b.x, b.y]], roadWidth);

      // Wooden river bridge where roads cross water
      if (to.terrainType === "river" || from.terrainType === "river") {
        paintRiverBridge(roads, (a.x + b.x) / 2, (a.y + b.y) / 2, size * 0.75);
      }
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
    } else if (["marsh", "tundra", "snowfield", "badlands", "beach"].includes(cTile.terrainType)) {
      // Hard country: a hut, a store and somewhere to keep watch. No fields.
      paintHouse(buildings, c.x - size * 0.26, c.y + size * 0.1, size * 0.5, ART_COLORS.roofDark);
      paintBarn(buildings, c.x + size * 0.26, c.y - size * 0.1, size * 0.52);
      paintWatchtower(buildings, c.x + size * 0.34, c.y + size * 0.26, size * 0.62, "#d9a441");
    } else if (["forest", "denseBush", "timbermellowForest", "birchWood", "taiga"].includes(cTile.terrainType)) {
      // Lumber & Forestry Camp District
      paintLumberCamp(buildings, c.x - size * 0.06, c.y + size * 0.06, size * 0.86);
      paintBarn(buildings, c.x + size * 0.32, c.y - size * 0.18, size * 0.52);
      paintHouse(buildings, c.x - size * 0.34, c.y + size * 0.22, size * 0.44, ART_COLORS.roofDark);
    } else if (["mountains", "rockyOutcrop", "overgrownHighlands"].includes(cTile.terrainType)) {
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

  // Schools and army camps stand on the edge of the village once raised
  // (js/professions.js).
  const schools = stats.schools || 0;
  const camps = stats.camps || 0;
  for (let i = 0; i < Math.min(schools, 3); i++) {
    paintSchoolhouse(parent, x - size * (0.9 + i * 0.42), y - size * 0.12, size * 0.5);
  }
  for (let i = 0; i < Math.min(camps, 3); i++) {
    const cx = x + size * (0.9 + i * 0.42);
    paintWarTent(parent, cx, y - size * 0.18, size * 0.5);
    if (i === 0) paintTrainingGround(parent, cx, y + size * 0.3, size * 0.58);
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
