// worldPainter.js
//
// Paints a generated world (worldGen.js), and — separately, because it
// changes during play — the buildings, roads and banners of the villages
// on it.
//
//   paintWorld(container, world)                      the ground, once
//   paintSettlements(container, world, hexMap, stats) buildings + roads, redrawn as the village grows
//
// Both draw in the same coordinate space the hex overlay, effects and
// villagers share.
//
// ---------------------------------------------------------------------------
// How this copes with thirty thousand hexes
//
// Two rules, and everything else follows from them.
//
// 1. THE GROUND IS BATCHED. Every hex of the same terrain and the same tone
//    goes into ONE <path>. Because a hexagon's outline is identical for
//    every hex of a given size, each one costs a single "M x y" plus a
//    constant tail (hexMath.hexOutlineTail) — so a terrain covering four
//    thousand hexes is one element and a few kilobytes of path data, not
//    four thousand elements. The same trick carries the relief, the cliffs,
//    the sea and the surf.
//
// 2. DECORATION IS DRAWN BY AREA, NOT BY TILE. A forest is not "one tree
//    stamp per hex" — it is a scatter of tree symbols at a density measured
//    in pixels, which is what a drawn map does, and what keeps the picture
//    looking the same whether a hex is 28 pixels across or 9. Those symbols
//    are themselves batched: every conifer on the island is two paths.
//
// What stays fully drawn, sprite by sprite, is what the player is meant to
// stop and look at: villages, landmarks, wildlife and the things people
// left behind. Those are sized from DETAIL_SCALE rather than from the hex,
// so they stay legible however fine the grid gets.

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

// The order the ground is laid down in. Whatever is painted later bleeds
// over what came before, so this is also the order in which one kind of
// country gives way to another.
const TERRAIN_PAINT_ORDER = [
  "beach", "plains", "badlands", "tundra", "flowerMeadow",
  "overgrownHighlands", "marsh", "birchWood", "forest", "denseBush", "taiga",
  "timbermellowForest", "rockyOutcrop", "mountains", "snowfield", "lake", "river",
];

// Ground that gets the soft bleed into its neighbours.
const TERRAIN_BLEEDS = new Set([
  "beach", "plains", "badlands", "tundra", "flowerMeadow", "overgrownHighlands",
  "marsh", "birchWood", "forest", "denseBush", "taiga", "timbermellowForest",
  "rockyOutcrop", "mountains", "snowfield",
]);

// Sprites the player is meant to look at are drawn at this size whatever the
// hex size is, so a village does not shrink to a smudge on a fine grid.
const DETAIL_SCALE = 26;

// ---------------------------------------------------------------------------
// Terrain symbols
//
// Each recipe says what a hex of that ground scatters, and how densely. The
// counts are per hex at the reference size, rescaled by area, so the island
// carries the same amount of forest however fine the grid is.
// ---------------------------------------------------------------------------

const SYMBOL_REFERENCE_HEX = 28;

const SYMBOL_RECIPES = {
  timbermellowForest: { trees: { kind: "round", count: 3.2, color: "#5aa83a", shade: "#2f6b26", size: 0.42 } },
  forest:             { trees: { kind: "round", count: 3.4, color: "#3f8a33", shade: "#1f5222", size: 0.40 } },
  birchWood:          { trees: { kind: "round", count: 3.0, color: "#9ec24f", shade: "#5d7f2c", size: 0.36 } },
  denseBush:          { trees: { kind: "round", count: 4.2, color: "#2d6b2c", shade: "#16401b", size: 0.34 } },
  taiga:              { trees: { kind: "conifer", count: 3.8, color: "#25523a", shade: "#123024", size: 0.44 } },
  flowerMeadow:       { tufts: { count: 3.4, color: "#5f8a3c", size: 0.30 }, blooms: 1.6 },
  plains:             { tufts: { count: 2.6, color: "#b08f37", size: 0.28 }, furrows: 0.5 },
  overgrownHighlands: { tufts: { count: 2.0, color: "#7c8a3c", size: 0.26 }, terrace: true },
  tundra:             { tufts: { count: 2.2, color: "#79805c", size: 0.22 }, rocks: 0.7 },
  marsh:              { reeds: { count: 3.6, color: "#b5a24a", size: 0.34 }, pools: 1.2 },
  badlands:           { rocks: 1.1, cracks: 1.4 },
  beach:              { rocks: 0.5, ripples: 1.3 },
  rockyOutcrop:       { rocks: 2.4 },
  mountains:          { peaks: 1.0 },
  snowfield:          { drifts: 1.6 },
};

// How often something worth stopping for turns up. These are per hex, and
// deliberately rare — on a thirty-thousand hex map even one in two hundred
// is a hundred and fifty things to find.
const DETAIL_CHANCE = {
  flowerMeadow:       { wildlife: 0.012, beasts: ["sheep", "deer", "birds"], props: 0.005, things: ["beehive", "cairn"] },
  plains:             { wildlife: 0.010, beasts: ["sheep", "birds"], props: 0.005, things: ["scarecrow", "cairn"] },
  timbermellowForest: { wildlife: 0.014, beasts: ["deer", "boar"], props: 0.004, things: ["huntersBlind"] },
  forest:             { wildlife: 0.012, beasts: ["deer", "boar", "birds"], props: 0.006, things: ["huntersBlind", "charcoalBurner"] },
  birchWood:          { wildlife: 0.012, beasts: ["deer", "birds"], props: 0.004, things: ["huntersBlind"] },
  denseBush:          { wildlife: 0.008, beasts: ["boar"], props: 0.003, things: ["cairn"] },
  taiga:              { wildlife: 0.008, beasts: ["boar", "deer"], props: 0.005, things: ["cairn", "charcoalBurner"] },
  overgrownHighlands: { wildlife: 0.008, beasts: ["sheep"], props: 0.005, things: ["cairn"] },
  rockyOutcrop:       { wildlife: 0.007, beasts: ["eagle"], props: 0.005, things: ["cairn", "ruin"] },
  mountains:          { wildlife: 0.009, beasts: ["eagle"], props: 0.003, things: ["cairn"] },
  badlands:           { wildlife: 0.006, beasts: ["eagle"], props: 0.006, things: ["ruin", "cairn"] },
  tundra:             { wildlife: 0.008, beasts: ["deer", "birds"], props: 0.005, things: ["cairn"] },
  snowfield:          { props: 0.004, things: ["cairn"] },
  marsh:              { wildlife: 0.020, beasts: ["heron", "birds"] },
  beach:              { wildlife: 0.008, beasts: ["birds"], props: 0.006, things: ["seaStack"] },
};

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

// ---------------------------------------------------------------------------
// Ornament
// ---------------------------------------------------------------------------

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

// The border of the sheet: a double rule, tick marks like a chart's
// graticule, and a small rosette in each corner.
function paintMapFrame(world) {
  const layer = svgEl("g", { class: "art-frame" });
  const w = world.width;
  const h = world.height;
  const inset = 10;
  const band = 13;

  layer.appendChild(svgEl("rect", {
    x: inset, y: inset, width: w - inset * 2, height: h - inset * 2,
    fill: "none", stroke: "#c49a45", "stroke-width": 3,
  }));
  layer.appendChild(svgEl("rect", {
    x: inset + band, y: inset + band, width: w - (inset + band) * 2, height: h - (inset + band) * 2,
    fill: "none", stroke: "#8a6526", "stroke-width": 1.2,
  }));

  const step = Math.max(70, world.grid.hexSize * Math.sqrt(3) * 12);
  let ticks = "";
  for (let x = inset + band + step; x < w - inset - band; x += step) {
    ticks += ` M ${x.toFixed(1)} ${inset} L ${x.toFixed(1)} ${inset + band}` +
             ` M ${x.toFixed(1)} ${h - inset} L ${x.toFixed(1)} ${h - inset - band}`;
  }
  const rowStep = Math.max(70, world.grid.hexSize * 1.5 * 12);
  for (let y = inset + band + rowStep; y < h - inset - band; y += rowStep) {
    ticks += ` M ${inset} ${y.toFixed(1)} L ${inset + band} ${y.toFixed(1)}` +
             ` M ${w - inset} ${y.toFixed(1)} L ${w - inset - band} ${y.toFixed(1)}`;
  }
  layer.appendChild(svgEl("path", { d: ticks.trim(), fill: "none", stroke: "#c49a45", "stroke-width": 1.4 }));

  for (const corner of [[inset + band, inset + band], [w - inset - band, inset + band],
                        [inset + band, h - inset - band], [w - inset - band, h - inset - band]]) {
    layer.appendChild(svgEl("circle", { cx: corner[0], cy: corner[1], r: 7, fill: "#edd9b4", stroke: "#8a6526", "stroke-width": 1.2 }));
    layer.appendChild(svgEl("circle", { cx: corner[0], cy: corner[1], r: 2.6, fill: "#8c2a1c" }));
  }
  return layer;
}

// ---------------------------------------------------------------------------
// The ground
// ---------------------------------------------------------------------------

function paintWorld(container, world) {
  const size = world.grid.hexSize;
  const tail = hexOutlineTail(size);
  const tileById = new Map(world.tiles.map((tile) => [tile.id, tile]));
  const tileByCoord = new Map(world.tiles.map((tile) => [hexKey(tile.q, tile.r), tile]));
  const neighborAt = (tile, edge) => {
    const dir = PAINT_EDGE_DIRECTION[edge];
    return tileByCoord.get(hexKey(tile.q + dir.q, tile.r + dir.r)) || null;
  };
  // Every hex centre, worked out once and shared by every layer.
  const centerOf = new Map();
  for (const tile of world.tiles) centerOf.set(tile.id, worldTileCenter(tile.q, tile.r, world.grid));
  const hexAt = (tile) => {
    const c = centerOf.get(tile.id);
    const start = hexOutlineStart(c.x, c.y, size);
    return `M${start[0].toFixed(1)} ${start[1].toFixed(1)}${tail}`;
  };

  // The hillshade is a soft wash — it does not need the full grid. Because
  // axialToPixel(3q, 3r, s) is exactly axialToPixel(q, r, 3s), hexes three
  // times the size at every third coordinate tile the plane perfectly, so
  // relief can be drawn on a grid a ninth the size with no seams and no
  // visible difference. That is a megabyte of path data saved.
  const RELIEF_STEP = 3;
  const reliefTail = hexOutlineTail(size * RELIEF_STEP);
  const reliefHexAt = (tile) => {
    const c = centerOf.get(tile.id);
    const start = hexOutlineStart(c.x, c.y, size * RELIEF_STEP);
    return `M${start[0].toFixed(1)} ${start[1].toFixed(1)}${reliefTail}`;
  };

  const svg = svgEl("svg", {
    viewBox: `0 0 ${world.width} ${world.height}`,
    width: "100%",
    height: "100%",
    preserveAspectRatio: "xMidYMid meet",
    class: "map-artwork",
  });
  svg.appendChild(svgEl("rect", { x: 0, y: 0, width: world.width, height: world.height, fill: ART_COLORS.oceanDeep }));

  // ---- pass 1: sort every hex into a bucket ---------------------------------
  // One bucket per (terrain, tone). Three tones per terrain is enough to stop
  // a wide plain reading as a single swatch of paint, and cheap enough that
  // the whole island is still under sixty elements.
  const groundBuckets = new Map();
  const reliefBuckets = new Map();
  let cliffPath = "";
  let foamPath = "";
  let depthPath = "";
  let shelfPath = "";

  for (const tile of world.tiles) {
    const terrain = tile.terrainType;

    if (terrain === "ocean") {
      // The open sea is the background rectangle — drawing seven thousand
      // identical blue hexagons on top of it would be the single largest
      // path on the map and would look no different. Only the shelf, where
      // the water shallows against the land, is worth drawing.
      const c = centerOf.get(tile.id);
      let touchesLand = false;
      for (let edge = 0; edge < 6; edge++) {
        const neighbor = neighborAt(tile, edge);
        if (!neighbor || neighbor.terrainType === "ocean") continue;
        touchesLand = true;
        const corners = hexEdgeCorners(c.x, c.y, size * 0.94, edge);
        foamPath += ` M${corners[0][0].toFixed(1)} ${corners[0][1].toFixed(1)}` +
                    ` L${corners[1][0].toFixed(1)} ${corners[1][1].toFixed(1)}`;
      }
      if (touchesLand) shelfPath += hexAt(tile);
      else if ((tile.detailSeed || 0) % 23 === 0) depthPath += hexAt(tile);
      continue;
    }

    const tone = ((tile.detailSeed || 0) % 3) - 1;            // -1, 0 or 1
    const key = `${terrain}|${tone}`;
    groundBuckets.set(key, (groundBuckets.get(key) || "") + hexAt(tile));

    // Relief, in bands: lit above the halfway mark, shaded below it. The
    // gentlest band is left out — at five per cent opacity nobody could see
    // it, and it was a third of all the path data on the map.
    if (tile.q % RELIEF_STEP === 0 && tile.r % RELIEF_STEP === 0) {
      const band = Math.max(-3, Math.min(3, Math.round((tile.elevation - 0.5) * 7)));
      if (Math.abs(band) >= 2) reliefBuckets.set(band, (reliefBuckets.get(band) || "") + reliefHexAt(tile));
    }

    // A drop steep enough to need a hand and a foot.
    if (tile.elevation > 0.45) {
      const c = centerOf.get(tile.id);
      for (let edge = 0; edge < 6; edge++) {
        const neighbor = neighborAt(tile, edge);
        if (!neighbor || neighbor.terrainType === "lake") continue;
        if (tile.elevation - neighbor.elevation <= 0.17) continue;
        const corners = hexEdgeCorners(c.x, c.y, size, edge);
        cliffPath += ` M${corners[0][0].toFixed(1)} ${corners[0][1].toFixed(1)}` +
                     ` L${corners[1][0].toFixed(1)} ${corners[1][1].toFixed(1)}`;
      }
    }
  }

  // ---- the ground itself ----------------------------------------------------
  const ground = svgEl("g", { class: "art-ground" });
  if (shelfPath) {
    ground.appendChild(svgEl("path", {
      d: shelfPath, fill: ART_COLORS.ocean, class: "art-terrain art-terrain--ocean",
      stroke: ART_COLORS.oceanShallow, "stroke-width": size * 0.5, "stroke-opacity": 0.55, "stroke-linejoin": "round",
    }));
  }
  for (const terrain of TERRAIN_PAINT_ORDER) {
    for (const tone of [-1, 0, 1]) {
      const d = groundBuckets.get(`${terrain}|${tone}`);
      if (!d) continue;
      const base = TERRAIN_FILL[terrain] || ART_COLORS.plains;
      const fill = tone ? shadeColor(base, tone * 0.055) : base;
      const attributes = { d, fill, class: `art-terrain art-terrain--${terrain}` };
      // The bleed: a fat stroke of a terrain's own colour spills it over the
      // hexes it borders, so one kind of country gives way to the next
      // instead of stopping dead on a hex line.
      if (TERRAIN_BLEEDS.has(terrain)) {
        attributes.stroke = fill;
        attributes["stroke-width"] = size * 0.4;
        attributes["stroke-opacity"] = 0.5;
        attributes["stroke-linejoin"] = "round";
      }
      ground.appendChild(svgEl("path", attributes));
    }
  }
  svg.appendChild(ground);

  // ---- relief and cliffs ----------------------------------------------------
  const relief = svgEl("g", { class: "art-relief" });
  for (const [band, d] of reliefBuckets) {
    relief.appendChild(svgEl("path", {
      d, fill: band > 0 ? "#ffffff" : "#25190d",
      opacity: Math.min(0.22, (Math.abs(band) - 1) * 0.085),
    }));
  }
  if (cliffPath) {
    relief.appendChild(svgEl("path", {
      d: cliffPath.trim(), fill: "none", stroke: "rgba(58, 42, 26, 0.5)",
      "stroke-width": Math.max(0.8, size * 0.14), "stroke-linecap": "round",
    }));
  }
  svg.appendChild(relief);

  // ---- water ---------------------------------------------------------------
  const water = svgEl("g", { class: "art-water" });
  if (depthPath) {
    water.appendChild(svgEl("path", {
      d: depthPath, fill: "none", stroke: "rgba(210, 238, 246, 0.16)",
      "stroke-width": 0.8, "stroke-dasharray": "4 5",
    }));
  }
  paintOceanTexture(water, world, centerOf, size);
  for (const river of world.rivers) {
    const ids = river.tileIds || river;
    const points = ids
      .map((id) => tileById.get(id))
      .filter(Boolean)
      .map((tile) => {
        const c = centerOf.get(tile.id);
        return [c.x, c.y];
      });
    if (points.length < 2) continue;
    const halfWidths = points.map((_, i) => size * (0.16 + 0.2 * (i / Math.max(1, points.length - 1))));
    paintRiver(water, points, halfWidths);
  }
  if (foamPath) {
    water.appendChild(svgEl("path", {
      d: foamPath.trim(), fill: "none", stroke: ART_COLORS.oceanFoam,
      "stroke-width": Math.max(1.2, size * 0.16), "stroke-linecap": "round",
      opacity: 0.7, class: "art-foam",
    }));
  }
  svg.appendChild(water);

  // The old tracks between the villages, under everything that grows.
  svg.appendChild(paintTradeRoutes(world, tileById, centerOf));

  // ---- what grows on it -----------------------------------------------------
  svg.appendChild(paintTerrainSymbols(world, centerOf, size));
  svg.appendChild(paintMountainRidges(world, tileByCoord, centerOf));
  svg.appendChild(paintLandmarksAndLife(world, centerOf, size));

  // ---- names and ornament ---------------------------------------------------
  svg.appendChild(paintRegionLabels(world));
  svg.appendChild(paintWaterLabels(world, tileById, centerOf));
  paintCompassRose(svg, Math.min(world.width - 100, world.width * 0.94), 90, 56);
  paintCartouche(svg, 140, 52, 190, 42);
  svg.appendChild(paintMapFrame(world));

  // A colour wash css/style.css tunes per season.
  svg.appendChild(svgEl("rect", {
    x: 0, y: 0, width: world.width, height: world.height,
    class: "art-season-tint", fill: "#ffffff", opacity: 0,
  }));

  container.innerHTML = "";
  container.appendChild(svg);
  return svg;
}

// Wave strokes over the open sea, all of them in one element.
function paintOceanTexture(parent, world, centerOf, size) {
  let d = "";
  for (const tile of world.tiles) {
    if (tile.terrainType !== "ocean") continue;
    const seed = tile.detailSeed || 0;
    if (seed % 3 !== 0) continue;                  // not every hex, or it turns to soup
    const c = centerOf.get(tile.id);
    const wx = c.x + ((seed >> 3) % 100) / 100 * size - size * 0.5;
    const wy = c.y + ((seed >> 9) % 100) / 100 * size - size * 0.5;
    const w = size * (0.22 + ((seed >> 15) % 100) / 100 * 0.2);
    d += ` M${(wx - w).toFixed(1)} ${wy.toFixed(1)}q${(w * 0.5).toFixed(1)} ${(-size * 0.12).toFixed(1)} ${w.toFixed(1)} 0` +
         `q${(w * 0.5).toFixed(1)} ${(size * 0.12).toFixed(1)} ${w.toFixed(1)} 0`;
  }
  if (!d) return;
  parent.appendChild(svgEl("path", {
    d: d.trim(), fill: "none", stroke: ART_COLORS.oceanShallow,
    "stroke-width": Math.max(0.6, size * 0.05), "stroke-linecap": "round", opacity: 0.4,
  }));
}

// ---------------------------------------------------------------------------
// Terrain symbols: the trees, rocks, reeds and tufts that make a map read as
// forest or fen. Every symbol of a kind is one path, however many there are.
// ---------------------------------------------------------------------------

function paintTerrainSymbols(world, centerOf, size) {
  const layer = svgEl("g", { class: "art-symbols" });
  // How many symbols a hex is worth, now that a hex may be any size. A fine
  // grid gets proportionally fewer per hex so the island looks the same.
  const areaFactor = (size * size) / (SYMBOL_REFERENCE_HEX * SYMBOL_REFERENCE_HEX);

  const canopy = new Map();
  const tufts = new Map();
  const reeds = new Map();
  const rocks = { body: "", face: "" };
  const peaks = { body: "", face: "", snow: "" };
  let drifts = "";
  const detail = { blooms: "", furrows: "", cracks: "", ripples: "", pools: "", terrace: "" };

  for (const tile of world.tiles) {
    const recipe = SYMBOL_RECIPES[tile.terrainType];
    if (!recipe) continue;
    const c = centerOf.get(tile.id);
    const random = createRandom((tile.detailSeed || 1) >>> 0);
    const spread = () => [
      c.x + (random() - 0.5) * size * 1.25,
      c.y + (random() - 0.5) * size * 1.1,
    ];
    // A fractional count means "this often", not "round it down to nothing".
    const howMany = (perHex) => {
      const wanted = perHex * areaFactor;
      return Math.floor(wanted) + (random() < wanted % 1 ? 1 : 0);
    };

    if (recipe.trees) {
      const spec = recipe.trees;
      const entry = canopy.get(tile.terrainType) || { body: "", shade: "", spec };
      for (let i = 0, n = howMany(spec.count); i < n; i++) {
        const [x, y] = spread();
        const r = size * spec.size * (0.8 + random() * 0.45);
        if (spec.kind === "conifer") {
          entry.shade += coniferGlyph(x + r * 0.22, y + r * 0.28, r);
          entry.body += coniferGlyph(x, y, r);
        } else {
          entry.shade += roundTreeGlyph(x + r * 0.22, y + r * 0.28, r);
          entry.body += roundTreeGlyph(x, y, r);
        }
      }
      canopy.set(tile.terrainType, entry);
    }

    if (recipe.tufts) {
      let d = tufts.get(tile.terrainType) || "";
      for (let i = 0, n = howMany(recipe.tufts.count); i < n; i++) {
        const [x, y] = spread();
        d += grassTuftPath(x, y, size * recipe.tufts.size);
      }
      tufts.set(tile.terrainType, d);
    }

    if (recipe.reeds) {
      let d = reeds.get(tile.terrainType) || "";
      for (let i = 0, n = howMany(recipe.reeds.count); i < n; i++) {
        const [x, y] = spread();
        const h = size * recipe.reeds.size * (0.7 + random() * 0.6);
        d += `M${x.toFixed(1)} ${y.toFixed(1)}l${((random() - 0.5) * h * 0.3).toFixed(1)} ${(-h).toFixed(1)}`;
      }
      reeds.set(tile.terrainType, d);
    }

    if (recipe.rocks) {
      for (let i = 0, n = howMany(recipe.rocks); i < n; i++) {
        const [x, y] = spread();
        const r = size * 0.3 * (0.7 + random() * 0.6);
        rocks.body += rockGlyph(x, y, r);
        rocks.face += rockFaceGlyph(x, y, r);
      }
    }

    if (recipe.peaks) {
      for (let i = 0, n = Math.max(1, howMany(recipe.peaks)); i < n; i++) {
        const r = size * (0.62 + random() * 0.25);
        const x = c.x + (random() - 0.5) * size * 0.4;
        const y = c.y + (random() - 0.5) * size * 0.3;
        peaks.body += peakGlyph(x, y, r);
        peaks.face += peakFaceGlyph(x, y, r);
        if (tile.snowCapped) peaks.snow += peakSnowGlyph(x, y, r);
      }
    }

    if (recipe.drifts) {
      for (let i = 0, n = howMany(recipe.drifts); i < n; i++) {
        const [x, y] = spread();
        const r = size * 0.34 * (0.7 + random() * 0.6);
        drifts += `M${(x - r).toFixed(1)} ${y.toFixed(1)}` +
                  `q${(r * 0.5).toFixed(1)} ${(-r * 0.75).toFixed(1)} ${r.toFixed(1)} ${(-r * 0.12).toFixed(1)}` +
                  `q${(r * 0.5).toFixed(1)} ${(r * 0.45).toFixed(1)} ${r.toFixed(1)} ${(r * 0.12).toFixed(1)}z`;
      }
    }

    if (recipe.blooms) {
      for (let i = 0, n = howMany(recipe.blooms); i < n; i++) {
        const [x, y] = spread();
        const r = Math.max(0.6, size * 0.06);
        detail.blooms += `M${x.toFixed(1)} ${y.toFixed(1)}m${(-r).toFixed(1)} 0` +
                         `a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(r * 2).toFixed(1)} 0` +
                         `a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-r * 2).toFixed(1)} 0z`;
      }
    }
    if (recipe.furrows) {
      for (let i = 0, n = howMany(recipe.furrows); i < n; i++) {
        const [x, y] = spread();
        const w = size * 0.5;
        detail.furrows += `M${(x - w).toFixed(1)} ${y.toFixed(1)}q${w.toFixed(1)} ${(size * 0.12).toFixed(1)} ${(w * 2).toFixed(1)} 0`;
      }
    }
    if (recipe.cracks) {
      for (let i = 0, n = howMany(recipe.cracks); i < n; i++) {
        const [x, y] = spread();
        detail.cracks += `M${x.toFixed(1)} ${y.toFixed(1)}l${(size * 0.2).toFixed(1)} ${(size * 0.1).toFixed(1)}l${(size * 0.14).toFixed(1)} ${(-size * 0.16).toFixed(1)}`;
      }
    }
    if (recipe.ripples) {
      for (let i = 0, n = howMany(recipe.ripples); i < n; i++) {
        const [x, y] = spread();
        const w = size * 0.36;
        detail.ripples += `M${(x - w).toFixed(1)} ${y.toFixed(1)}q${(w * 0.5).toFixed(1)} ${(-size * 0.1).toFixed(1)} ${w.toFixed(1)} 0`;
      }
    }
    if (recipe.pools) {
      for (let i = 0, n = howMany(recipe.pools); i < n; i++) {
        const [x, y] = spread();
        const rx = size * 0.22 * (0.7 + random() * 0.7);
        const ry = rx * 0.6;
        detail.pools += `M${(x - rx).toFixed(1)} ${y.toFixed(1)}` +
                        `a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(rx * 2).toFixed(1)} 0` +
                        `a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(-rx * 2).toFixed(1)} 0z`;
      }
    }
    if (recipe.terrace) {
      for (let i = -1; i <= 1; i++) {
        const y = c.y + i * size * 0.36;
        detail.terrace += `M${(c.x - size * 0.6).toFixed(1)} ${y.toFixed(1)}q${(size * 0.6).toFixed(1)} ${(size * 0.14).toFixed(1)} ${(size * 1.2).toFixed(1)} 0`;
      }
    }
  }

  // Everything above, in about twenty elements.
  if (detail.pools) layer.appendChild(svgEl("path", { d: detail.pools, fill: ART_COLORS.marshWater, opacity: 0.75 }));
  if (detail.terrace) layer.appendChild(svgEl("path", { d: detail.terrace, fill: "none", stroke: ART_COLORS.terraceLine, "stroke-width": Math.max(0.5, size * 0.06), opacity: 0.5 }));
  if (detail.furrows) layer.appendChild(svgEl("path", { d: detail.furrows, fill: "none", stroke: ART_COLORS.wheatDark, "stroke-width": Math.max(0.5, size * 0.05), opacity: 0.45 }));
  if (detail.cracks) layer.appendChild(svgEl("path", { d: detail.cracks, fill: "none", stroke: ART_COLORS.badlandsDark, "stroke-width": Math.max(0.5, size * 0.05), opacity: 0.6 }));
  if (detail.ripples) layer.appendChild(svgEl("path", { d: detail.ripples, fill: "none", stroke: ART_COLORS.beachWet, "stroke-width": Math.max(0.5, size * 0.07), opacity: 0.6 }));

  for (const [terrain, d] of tufts) {
    if (!d) continue;
    layer.appendChild(svgEl("path", {
      d, fill: "none", stroke: SYMBOL_RECIPES[terrain].tufts.color,
      "stroke-width": Math.max(0.5, size * 0.075), "stroke-linecap": "round", opacity: 0.8,
    }));
  }
  for (const [terrain, d] of reeds) {
    if (!d) continue;
    layer.appendChild(svgEl("path", {
      d, fill: "none", stroke: SYMBOL_RECIPES[terrain].reeds.color,
      "stroke-width": Math.max(0.5, size * 0.055), "stroke-linecap": "round", opacity: 0.85,
    }));
  }
  if (detail.blooms) layer.appendChild(svgEl("path", { d: detail.blooms, fill: "#f6e28a", opacity: 0.85 }));

  if (drifts) layer.appendChild(svgEl("path", { d: drifts, fill: ART_COLORS.snow, stroke: ART_COLORS.snowfieldShade, "stroke-width": 0.5, opacity: 0.95 }));
  if (rocks.body) {
    layer.appendChild(svgEl("path", { d: rocks.body, fill: ART_COLORS.rock, stroke: ART_COLORS.rockDark, "stroke-width": Math.max(0.4, size * 0.04), "stroke-linejoin": "round" }));
    layer.appendChild(svgEl("path", { d: rocks.face, fill: ART_COLORS.rockLight, opacity: 0.75 }));
  }
  for (const [terrain, entry] of canopy) {
    layer.appendChild(svgEl("path", { d: entry.shade, fill: entry.spec.shade, opacity: 0.55, class: `art-canopy art-canopy--${terrain}` }));
    layer.appendChild(svgEl("path", {
      d: entry.body, fill: entry.spec.color, stroke: entry.spec.shade,
      "stroke-width": Math.max(0.4, size * 0.035), "stroke-linejoin": "round",
      class: `art-canopy art-canopy--${terrain}`,
    }));
  }
  if (peaks.body) {
    layer.appendChild(svgEl("path", { d: peaks.body, fill: "#6d6a66", stroke: "#3b3734", "stroke-width": Math.max(0.4, size * 0.045), "stroke-linejoin": "round" }));
    layer.appendChild(svgEl("path", { d: peaks.face, fill: "#a5a29d", opacity: 0.85 }));
    if (peaks.snow) layer.appendChild(svgEl("path", { d: peaks.snow, fill: ART_COLORS.snow, opacity: 0.95 }));
  }
  return layer;
}

// --- the glyphs themselves, as path data ------------------------------------

function roundTreeGlyph(x, y, r) {
  const rx = r * 0.72;
  const ry = r * 0.66;
  return `M${(x - rx).toFixed(1)} ${y.toFixed(1)}` +
         `a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 1 ${(rx * 2).toFixed(1)} 0` +
         `a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 1 ${(-rx * 2).toFixed(1)} 0z`;
}

function coniferGlyph(x, y, r) {
  const w = r * 0.6;
  return `M${x.toFixed(1)} ${(y - r).toFixed(1)}l${(-w).toFixed(1)} ${(r * 1.5).toFixed(1)}h${(w * 2).toFixed(1)}z`;
}

function rockGlyph(x, y, r) {
  return `M${(x - r).toFixed(1)} ${(y + r * 0.5).toFixed(1)}` +
         `l${(r * 0.55).toFixed(1)} ${(-r * 0.95).toFixed(1)}` +
         `l${(r * 0.6).toFixed(1)} ${(r * 0.35).toFixed(1)}` +
         `l${(r * 0.85).toFixed(1)} ${(r * 0.6).toFixed(1)}z`;
}

function rockFaceGlyph(x, y, r) {
  return `M${(x - r).toFixed(1)} ${(y + r * 0.5).toFixed(1)}` +
         `l${(r * 0.55).toFixed(1)} ${(-r * 0.95).toFixed(1)}` +
         `l${(r * 0.2).toFixed(1)} ${(r * 0.95).toFixed(1)}z`;
}

function peakGlyph(x, y, r) {
  return `M${(x - r).toFixed(1)} ${(y + r * 0.62).toFixed(1)}` +
         `L${x.toFixed(1)} ${(y - r * 0.85).toFixed(1)}` +
         `L${(x + r).toFixed(1)} ${(y + r * 0.62).toFixed(1)}z`;
}

function peakFaceGlyph(x, y, r) {
  return `M${(x - r).toFixed(1)} ${(y + r * 0.62).toFixed(1)}` +
         `L${x.toFixed(1)} ${(y - r * 0.85).toFixed(1)}` +
         `L${(x + r * 0.16).toFixed(1)} ${(y + r * 0.62).toFixed(1)}z`;
}

function peakSnowGlyph(x, y, r) {
  return `M${(x - r * 0.34).toFixed(1)} ${(y - r * 0.28).toFixed(1)}` +
         `L${x.toFixed(1)} ${(y - r * 0.85).toFixed(1)}` +
         `L${(x + r * 0.34).toFixed(1)} ${(y - r * 0.28).toFixed(1)}` +
         `q${(-r * 0.17).toFixed(1)} ${(r * 0.11).toFixed(1)} ${(-r * 0.34).toFixed(1)} 0` +
         `q${(-r * 0.17).toFixed(1)} ${(-r * 0.11).toFixed(1)} ${(-r * 0.34).toFixed(1)} 0z`;
}

// ---------------------------------------------------------------------------
// Ranges, landmarks and life
// ---------------------------------------------------------------------------

// Hand-drawn maps do not draw mountains one at a time — they draw a range,
// one long crest with the peaks hanging off it. This finds each connected
// group of mountain hexes and walks its longest path, which is as good a
// definition of a crest as any.
function paintMountainRidges(world, tileByCoord, centerOf) {
  const layer = svgEl("g", { class: "art-ridges" });
  const seen = new Set();
  const grid = world.grid;

  const neighbours = (tile) =>
    hexNeighbors(tile.q, tile.r)
      .map(({ q, r }) => tileByCoord.get(hexKey(q, r)))
      .filter((n) => n && n.terrainType === "mountains");

  const walk = (start) => {
    const from = new Map([[start.id, null]]);
    const order = [start];
    for (let i = 0; i < order.length; i++) {
      for (const next of neighbours(order[i])) {
        if (from.has(next.id)) continue;
        from.set(next.id, order[i]);
        order.push(next);
      }
    }
    return { from, order };
  };

  let crest = "";
  let lit = "";
  for (const tile of world.tiles) {
    if (tile.terrainType !== "mountains" || seen.has(tile.id)) continue;
    const first = walk(tile);
    for (const member of first.order) seen.add(member.id);
    if (first.order.length < 5) continue;

    const farthest = first.order[first.order.length - 1];
    const second = walk(farthest);
    let cursor = second.order[second.order.length - 1];
    const spine = [];
    while (cursor) {
      spine.push(cursor);
      cursor = second.from.get(cursor.id);
    }
    if (spine.length < 5) continue;

    const points = spine.map((member) => {
      const c = centerOf.get(member.id);
      return [c.x, c.y - grid.hexSize * 0.18];
    });
    crest += smoothPath(points, false);
    lit += smoothPath(points.map(([x, y]) => [x, y - grid.hexSize * 0.16]), false);
  }
  if (crest) {
    layer.appendChild(svgEl("path", {
      d: crest, fill: "none", stroke: "rgba(48, 40, 34, 0.4)",
      "stroke-width": grid.hexSize * 0.5, "stroke-linecap": "round", "stroke-linejoin": "round",
    }));
    layer.appendChild(svgEl("path", {
      d: lit, fill: "none", stroke: "rgba(255, 255, 255, 0.3)",
      "stroke-width": grid.hexSize * 0.2, "stroke-linecap": "round", "stroke-linejoin": "round",
    }));
  }
  return layer;
}

// Wonders, wildlife and the things people left behind. Drawn at
// DETAIL_SCALE, not at hex size, so they stay worth finding on a fine grid.
function paintLandmarksAndLife(world, centerOf, size) {
  const layer = svgEl("g", { class: "art-scatter" });
  const scale = Math.max(size, DETAIL_SCALE);

  for (const tile of world.tiles) {
    const c = centerOf.get(tile.id);

    if (tile.landmark) {
      paintLandmark(layer, tile.landmark, c.x, c.y, scale);
      continue;
    }

    const chance = DETAIL_CHANCE[tile.terrainType];
    if (!chance) continue;
    const random = createRandom(((tile.detailSeed || 1) ^ 0x9e3779b9) >>> 0);

    if (chance.wildlife && random() < chance.wildlife) {
      const beasts = chance.beasts || ["deer"];
      paintBeast(layer, beasts[Math.floor(random() * beasts.length) % beasts.length], c.x, c.y, scale, random);
    } else if (chance.props && chance.things && random() < chance.props) {
      const things = chance.things;
      paintBiomeProp(layer, things[Math.floor(random() * things.length) % things.length], c.x, c.y, scale, random);
    }
  }

  // Two of each, placed by hand, so the empty half of the chart has
  // something in it.
  let whales = 2;
  let sails = 2;
  for (const tile of world.tiles) {
    if (tile.terrainType !== "ocean" || (!whales && !sails)) continue;
    const seed = tile.detailSeed || 0;
    const c = centerOf.get(tile.id);
    if (whales && seed % 1499 === 3) { paintWhale(layer, c.x, c.y, scale * 0.9); whales--; }
    else if (sails && seed % 1487 === 7) { paintSail(layer, c.x, c.y, scale * 0.8); sails--; }
  }
  return layer;
}

function paintLandmark(parent, kind, x, y, scale) {
  switch (kind) {
    case "standingStones": return paintStandingStones(parent, x, y, scale * 0.95);
    case "motherTree":     return paintMotherTree(parent, x, y, scale * 1.05);
    case "dragonBones":    return paintDragonBones(parent, x, y, scale * 0.9);
    case "crystalMine":    return paintCrystalMine(parent, x, y, scale * 0.9);
    case "shipwreck":      return paintShipwreck(parent, x, y, scale * 0.85);
    case "ruinedTower":    return paintRuinedTower(parent, x, y, scale * 0.9);
    case "hotSpring":      return paintHotSpring(parent, x, y, scale * 0.85);
    case "boneOrchard":    return paintBoneOrchard(parent, x, y, scale * 0.85);
    default:               return undefined;
  }
}

function paintBiomeProp(parent, kind, x, y, size, random) {
  switch (kind) {
    case "scarecrow":      return paintScarecrow(parent, x, y, size * 0.8);
    case "beehive":        return paintBeehive(parent, x, y, size * 0.7);
    case "cairn":          return paintCairn(parent, x, y, size * 0.75);
    case "ruin":           return paintStandingRuin(parent, x, y, size * 0.8, random);
    case "huntersBlind":   return paintHuntersBlind(parent, x, y, size * 0.75);
    case "charcoalBurner": return paintCharcoalBurner(parent, x, y, size * 0.7);
    case "seaStack":       return paintSeaStack(parent, x, y, size * 0.85);
    default:               return undefined;
  }
}

function paintBeast(parent, kind, x, y, size, random) {
  switch (kind) {
    case "sheep":  return paintSheep(parent, x, y, size * 0.7);
    case "boar":   return paintBoar(parent, x, y, size * 0.7);
    case "heron":  return paintHeron(parent, x, y, size * 0.8);
    case "eagle":  return paintEagle(parent, x, y - size * 0.3, size * 0.65);
    case "birds":  return paintBirdFlock(parent, x, y - size * 0.4, size * 0.9, random);
    case "deer":
    default:       return paintDeer(parent, x, y, size * 0.6);
  }
}

// ---------------------------------------------------------------------------
// Names and old roads
// ---------------------------------------------------------------------------

// The pale cart tracks that already joined the villages before you arrived.
function paintTradeRoutes(world, tileById, centerOf) {
  const layer = svgEl("g", { class: "art-traderoutes" });
  for (const route of world.tradeRoutes || []) {
    const points = route.tileIds
      .map((id) => tileById.get(id))
      .filter(Boolean)
      .map((tile) => {
        const c = centerOf.get(tile.id);
        return [c.x, c.y];
      });
    if (points.length < 2) continue;
    layer.appendChild(svgEl("path", {
      d: smoothPath(points, false),
      fill: "none",
      stroke: ART_COLORS.road,
      "stroke-width": Math.max(1.2, world.grid.hexSize * 0.2),
      "stroke-linecap": "round",
      "stroke-dasharray": `${(world.grid.hexSize * 0.7).toFixed(1)} ${(world.grid.hexSize * 0.8).toFixed(1)}`,
      opacity: 0.36,
    }));
  }
  return layer;
}

// Only the country big enough to be worth naming gets a name. A label on
// every small thicket buries the map in text.
const REGION_LABEL_MIN_TILES = 90;
const REGION_LABEL_MAX = 26;

function paintRegionLabels(world) {
  const layer = svgEl("g", { class: "art-regionlabels" });
  const worth = (world.regions || [])
    .filter((region) => region.tileCount >= REGION_LABEL_MIN_TILES)
    .sort((a, b) => b.tileCount - a.tileCount)
    .slice(0, REGION_LABEL_MAX);
  for (const region of worth) {
    if (region.terrainType === "ocean" && region.tileCount < 400) continue;
    const scale = Math.min(2.4, 0.7 + region.tileCount / 1500);
    const text = svgEl("text", {
      x: region.center.x,
      y: region.center.y,
      "text-anchor": "middle",
      class: "art-region-label",
      "font-size": (14 * scale).toFixed(1),
      fill: region.terrainType === "ocean" ? "#bfe0ea" : "#4a3620",
      opacity: 0.55,
    });
    text.textContent = region.name.toUpperCase();
    layer.appendChild(text);
  }
  return layer;
}

// River and lake names, written along the water itself.
function paintWaterLabels(world, tileById, centerOf) {
  const layer = svgEl("g", { class: "art-waterlabels" });
  const defs = svgEl("defs", {});
  layer.appendChild(defs);

  (world.rivers || []).forEach((river, index) => {
    if (!river.name) return;
    const ids = river.tileIds || river;
    if (!ids || ids.length < 10) return;
    const points = ids
      .map((id) => tileById.get(id))
      .filter(Boolean)
      .map((tile) => {
        const c = centerOf.get(tile.id);
        return [c.x, c.y];
      });
    if (points.length < 10) return;

    // A label upside-down is worse than no label, so a course running
    // right-to-left is reversed before the text is hung on it.
    const ordered = points[0][0] > points[points.length - 1][0] ? points.slice().reverse() : points;
    const pathId = `riverline_${world.seed}_${index}`;
    defs.appendChild(svgEl("path", { id: pathId, d: smoothPath(ordered, false), fill: "none" }));

    const text = svgEl("text", { class: "art-water-label", "font-size": 12, fill: "#2a5f77" });
    const onPath = svgEl("textPath", { href: `#${pathId}`, startOffset: "22%" });
    onPath.textContent = river.name;
    text.appendChild(onPath);
    layer.appendChild(text);
  });

  (world.lakes || []).forEach((lake) => {
    if (!lake.name || !lake.tileIds || !lake.tileIds.length) return;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const id of lake.tileIds) {
      const center = centerOf.get(id);
      if (!center) continue;
      sumX += center.x;
      sumY += center.y;
      count++;
    }
    if (!count) return;
    const text = svgEl("text", {
      x: sumX / count, y: sumY / count + 4, "text-anchor": "middle",
      class: "art-water-label", "font-size": 12, fill: "#18485c",
    });
    text.textContent = lake.name;
    layer.appendChild(text);
  });

  return layer;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { paintWorld };
}
