// settlements.js
//
// Everything people built: the player's town, the rival villages, the
// garlock camps, the working districts out on claimed land, and the roads
// between them. This is the layer that changes during play, so it lives
// apart from the static ground (worldPainter.js) and is redrawn whenever
// the village grows.
//
//   paintSettlements(container, world, hexMap, stats)
//     stats: { houses, barns, schools, camps, season }
//
// ---------------------------------------------------------------------------
// A settlement is bigger than a hex
//
// On a fine grid a hex is about twenty pixels across — smaller than a
// cottage. A town drawn to fit inside one would be a smudge. So settlements
// are drawn at their own scale, spilling over the hex they belong to, the
// way a town on a real map covers more paper than the field beside it.
// Everything is laid out on rings around the market square, so a hamlet of
// three huts and a walled town of twenty buildings are the same code with
// different numbers.
// ---------------------------------------------------------------------------

// A settlement is never drawn smaller than this, however fine the grid.
// A village holds about thirty-seven hexes from the day it is founded
// (js/territory.js, VILLAGE_RADIUS), which is roughly sixty pixels of
// ground in every direction — so that is the size the town is drawn.
const SETTLEMENT_MIN_SCALE = 62;

function settlementScale(hexSize) {
  return Math.max(SETTLEMENT_MIN_SCALE, hexSize * 5.6);
}

// Where a building goes: `ring` outward, `index` of `count` around.
// Squashed vertically, because the map is drawn slightly from above.
function ringSlot(x, y, scale, ring, index, count, phase) {
  const angle = (Math.PI * 2 * index) / Math.max(1, count) + (phase || 0);
  const radius = scale * ring;
  return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.82];
}

// ---------------------------------------------------------------------------
// The whole layer
// ---------------------------------------------------------------------------

function paintSettlements(container, world, hexMap, stats) {
  const random = createRandom(world.seed + 7);
  const size = world.grid.hexSize;
  const scale = settlementScale(size);
  const season = stats.season || 1;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${world.width} ${world.height}`,
    width: "100%",
    height: "100%",
    preserveAspectRatio: "xMidYMid meet",
    class: "map-settlements",
  });

  svg.appendChild(paintPlayerRoads(world, hexMap, size));

  const buildings = svgEl("g", { class: "art-buildings" });
  paintWorkingDistricts(buildings, world, hexMap, size, scale, season);

  for (const village of world.villages) {
    const tile = hexMap.getTile(village.homeTileId);
    if (!tile) continue;
    // A town the player has never found is under blank paper anyway. Not
    // building it saves a few thousand elements on a map with thirty
    // settlements on it, and it appears the moment it is discovered.
    if (village.kind !== "player" && !hexMap.isRevealed(tile.id)) continue;
    const c = worldTileCenter(tile.q, tile.r, world.grid);
    const held = hexMap.getTilesOwnedBy(village.id).length;
    const neighbours = hexMap.getNeighbors(tile.id);
    const waterAngle = waterDirection(tile, neighbours, world.grid, c);

    if (village.kind === "player") {
      paintPlayerTown(buildings, c.x, c.y, scale, stats, waterAngle, random, season);
    } else if (village.kind === "garlock") {
      paintGarlockCamp(buildings, c.x, c.y, scale, village, held, random);
    } else {
      paintRivalVillage(buildings, c.x, c.y, scale, village, held, waterAngle, random, season);
    }

    const label = svgEl("text", {
      x: c.x, y: c.y - scale * 1.15,
      class: "art-village-label", "text-anchor": "middle",
    });
    label.textContent = village.name;
    buildings.appendChild(label);
  }

  svg.appendChild(buildings);
  container.innerHTML = "";
  container.appendChild(svg);
  return svg;
}

// Which way the water lies, if any is next door — so jetties point at it
// and gates do not open onto a lake.
function waterDirection(tile, neighbours, grid, center) {
  for (const neighbor of neighbours) {
    if (!["river", "lake", "ocean"].includes(neighbor.terrainType)) continue;
    const to = worldTileCenter(neighbor.q, neighbor.r, grid);
    return Math.atan2(to.y - center.y, to.x - center.x);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

// Dirt paths from the player's village out to every tile it holds,
// following the territory so no path crosses land you don't own.
function paintPlayerRoads(world, hexMap, size) {
  const roads = svgEl("g", { class: "art-roads" });
  const home = typeof homeTile === "function"
    ? homeTile()
    : hexMap.getAllTiles().find((tile) => tile.isStartingTile);
  if (!home) return roads;

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

  // A road runs to somewhere, not to every field you own. Only the tracks
  // that actually reach a working district are drawn, which on a fine grid
  // is the difference between a road network and a brown mat.
  const used = new Set();
  for (const tile of hexMap.getClaimedTiles()) {
    if (!isDistrictTile(tile)) continue;
    let cursor = tile.id;
    while (cursor && !used.has(cursor)) {
      used.add(cursor);
      const from = parent.get(cursor);
      cursor = from ? from.id : null;
    }
  }

  // One path for the whole road network, plus a lighter one on top for the
  // wheel ruts — two elements however far the village has spread.
  let track = "";
  const bridges = [];
  for (const [id, from] of parent) {
    if (!from || !used.has(id)) continue;
    const a = worldTileCenter(from.q, from.r, world.grid);
    const to = hexMap.getTile(id);
    const b = worldTileCenter(to.q, to.r, world.grid);
    track += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    if (to.terrainType === "river" || from.terrainType === "river") {
      bridges.push([(a.x + b.x) / 2, (a.y + b.y) / 2]);
    }
  }
  if (track) {
    roads.appendChild(svgEl("path", {
      d: track, fill: "none", stroke: ART_COLORS.roadEdge,
      "stroke-width": Math.max(2, size * 0.5), "stroke-linecap": "round", "stroke-linejoin": "round",
    }));
    roads.appendChild(svgEl("path", {
      d: track, fill: "none", stroke: ART_COLORS.road,
      "stroke-width": Math.max(1.2, size * 0.34), "stroke-linecap": "round", "stroke-linejoin": "round",
    }));
    roads.appendChild(svgEl("path", {
      d: track, fill: "none", stroke: "rgba(255,255,255,0.18)",
      "stroke-width": Math.max(0.5, size * 0.08), "stroke-linecap": "round",
      "stroke-dasharray": `${(size * 0.5).toFixed(1)} ${(size * 0.7).toFixed(1)}`,
    }));
  }
  for (const [bx, by] of bridges) paintRiverBridge(roads, bx, by, Math.max(size * 1.6, 26));
  return roads;
}

// ---------------------------------------------------------------------------
// Working districts on claimed land
// ---------------------------------------------------------------------------

// Land the player holds but does not live on still gets worked. What stands
// there follows what the ground is good for.
// One farmstead every nine fields, not one on every field. A hex is now a
// field; a district is a farm, and farms are further apart than that.
const DISTRICT_IN = 9;

function isDistrictTile(tile) {
  return !tile.isStartingTile && (tile.detailSeed || 0) % DISTRICT_IN === 0;
}

function paintWorkingDistricts(parent, world, hexMap, size, scale, season) {
  const districtScale = Math.max(size * 2.4, 30);
  const held = hexMap.getClaimedTiles().filter((tile) => tile.owner === "player");

  // Everything the village works gets a faint wash of tilled colour, so the
  // land reads as held even where there is no building on it. One element.
  const tail = hexOutlineTail(size);
  let worked = "";
  for (const tile of held) {
    const c = worldTileCenter(tile.q, tile.r, world.grid);
    const start = hexOutlineStart(c.x, c.y, size);
    worked += `M${start[0].toFixed(1)} ${start[1].toFixed(1)}${tail}`;
  }
  if (worked) {
    parent.appendChild(svgEl("path", {
      d: worked, fill: "#c9a85f", opacity: 0.22, class: "art-worked",
    }));
  }

  const claimed = held.filter(isDistrictTile);

  for (const tile of claimed) {
    const c = worldTileCenter(tile.q, tile.r, world.grid);
    const random = createRandom((tile.detailSeed || 1) >>> 0);
    const neighbours = hexMap.getNeighbors(tile.id);
    const waterfront = ["river", "lake"].includes(tile.terrainType) ||
      neighbours.some((n) => ["river", "lake", "ocean"].includes(n.terrainType));
    const s = districtScale;

    if (waterfront) {
      paintFisheryDock(parent, c.x, c.y + s * 0.06, s * 0.9);
      paintHouse(parent, c.x - s * 0.32, c.y - s * 0.2, s * 0.5, "#785233");
      const angle = waterDirection(tile, neighbours, world.grid, c);
      if (angle !== null) paintJetty(parent, c.x, c.y, s * 0.7, angle);
    } else if (["marsh", "tundra", "snowfield", "badlands", "beach"].includes(tile.terrainType)) {
      paintHouse(parent, c.x - s * 0.26, c.y + s * 0.1, s * 0.52, ART_COLORS.roofDark);
      paintBarn(parent, c.x + s * 0.26, c.y - s * 0.1, s * 0.54);
      paintWatchtower(parent, c.x + s * 0.36, c.y + s * 0.28, s * 0.66, "#d9a441");
    } else if (["forest", "denseBush", "timbermellowForest", "birchWood", "taiga"].includes(tile.terrainType)) {
      paintLumberCamp(parent, c.x - s * 0.06, c.y + s * 0.06, s * 0.9);
      paintBarn(parent, c.x + s * 0.34, c.y - s * 0.2, s * 0.54);
      paintHouse(parent, c.x - s * 0.36, c.y + s * 0.24, s * 0.46, ART_COLORS.roofDark);
      paintWoodpile(parent, c.x + s * 0.12, c.y + s * 0.34, s * 0.6);
      if (random() < 0.5) paintHandcart(parent, c.x - s * 0.42, c.y - s * 0.06, s * 0.5);
    } else if (["mountains", "rockyOutcrop"].includes(tile.terrainType)) {
      paintSmithy(parent, c.x - s * 0.2, c.y + s * 0.08, s * 0.8);
      paintQuarryWorks(parent, c.x + s * 0.24, c.y - s * 0.14, s * 0.74);
      paintWatchtower(parent, c.x + s * 0.4, c.y + s * 0.26, s * 0.7, "#d9a441");
      paintHandcart(parent, c.x - s * 0.02, c.y + s * 0.36, s * 0.55);
    } else {
      // Farmland: fields first, then the buildings and beasts that work them.
      for (let i = 0; i < 3; i++) {
        const [fx, fy] = ringSlot(c.x, c.y, s, 0.62, i, 3, random() * 2);
        paintFieldPatch(parent, fx, fy, s * 0.62, s * 0.4, (random() - 0.5) * 50, random, season);
      }
      paintBarn(parent, c.x - s * 0.24, c.y - s * 0.14, s * 0.64);
      paintAnimalPen(parent, c.x + s * 0.26, c.y + s * 0.16, s * 0.7);
      paintPig(parent, c.x + s * 0.24, c.y + s * 0.18, s * 0.5);
      if (random() < 0.6) paintPig(parent, c.x + s * 0.34, c.y + s * 0.24, s * 0.42);
      paintHouse(parent, c.x - s * 0.3, c.y + s * 0.24, s * 0.48, ART_COLORS.roof);
      paintGardenPlot(parent, c.x - s * 0.34, c.y + s * 0.44, s * 0.46, random);
      paintChicken(parent, c.x - s * 0.12, c.y + s * 0.36, s * 0.5);
      if (season === 3 || tile.terrainType === "plains") {
        paintHayBale(parent, c.x + s * 0.22, c.y - s * 0.3, s * 0.62);
      }
    }

    if (hexMap.isFrontier(tile.id) && !["mountains", "rockyOutcrop"].includes(tile.terrainType)) {
      paintTrainingGround(parent, c.x + s * 0.3, c.y - s * 0.26, s * 0.64);
    }
  }
}

// ---------------------------------------------------------------------------
// The player's town
// ---------------------------------------------------------------------------

// It grows in stages, and every stage is visible from the map: a clearing
// with a hall, then a fenced village, then a walled town with a market,
// a school, a drill yard and smoke over the roofs.
function paintPlayerTown(parent, x, y, scale, stats, waterAngle, random, season) {
  const houses = Math.max(1, stats.houses || 1);
  const barns = Math.max(1, stats.barns || 1);
  const schools = stats.schools || 0;
  const camps = stats.camps || 0;
  const buildings = houses + barns + schools + camps;

  // The road comes in from the south-west unless there is water that way.
  let gate = Math.PI * 0.75;
  if (waterAngle !== null && Math.abs(Math.cos(waterAngle - gate)) > 0.8) gate = -Math.PI * 0.25;

  // 1. the ground the town stands on, and the fields around it
  paintEarthPatch(parent, x, y, scale * 0.95, random, "#c6ab7e");
  const fieldCount = Math.min(7, 2 + Math.floor(buildings / 2));
  for (let i = 0; i < fieldCount; i++) {
    const [fx, fy] = ringSlot(x, y, scale, 1.24, i, fieldCount, 0.4);
    paintFieldPatch(parent, fx, fy, scale * 0.52, scale * 0.34, (random() - 0.5) * 60, random, season);
  }
  // A mill on the rise once there is enough grain to be worth grinding.
  if (buildings >= 5) {
    const [mx, my] = ringSlot(x, y, scale, 1.42, 0, 1, -0.9);
    paintWindmill(parent, mx, my, scale * 0.5);
  }

  // 2. the streets: six lanes out of the square, and a ring road round it,
  //    so the plots between them read as a town rather than a wheel.
  let lanes = "";
  for (let i = 0; i < 6; i++) {
    const angle = gate + (Math.PI * 2 * i) / 6;
    lanes += `M${x.toFixed(1)} ${y.toFixed(1)}` +
             `L${(x + Math.cos(angle) * scale * 0.88).toFixed(1)} ${(y + Math.sin(angle) * scale * 0.74).toFixed(1)}`;
  }
  parent.appendChild(svgEl("path", {
    d: lanes, fill: "none", stroke: ART_COLORS.road,
    "stroke-width": scale * 0.075, "stroke-linecap": "round", opacity: 0.9,
  }));
  const ringPoints = [];
  for (let i = 0; i <= 24; i++) {
    const angle = (Math.PI * 2 * i) / 24;
    ringPoints.push([x + Math.cos(angle) * scale * 0.68, y + Math.sin(angle) * scale * 0.56]);
  }
  parent.appendChild(svgEl("path", {
    d: smoothPath(ringPoints, true), fill: "none", stroke: ART_COLORS.road,
    "stroke-width": scale * 0.055, opacity: 0.65,
  }));

  // 3. the wall: a fence at first, stone once the town is worth defending
  if (buildings >= 7) paintStoneWallRing(parent, x, y, scale * 0.92, gate, 3 + Math.floor(buildings / 5));
  else if (buildings >= 3) paintPalisadeRing(parent, x, y, scale * 0.9, gate, "#7d5f3a");

  // 4. the market square
  paintPlaza(parent, x, y + scale * 0.06, scale * 0.66);
  paintChieftainHall(parent, x, y - scale * 0.2, scale * 0.6);
  paintWell(parent, x - scale * 0.26, y + scale * 0.2, scale * 0.4);
  paintCampfire(parent, x + scale * 0.02, y + scale * 0.3, scale * 0.42);
  paintMarketStall(parent, x - scale * 0.34, y - scale * 0.02, "crimson", scale * 0.34);
  paintMarketStall(parent, x + scale * 0.34, y - scale * 0.02, "azure", scale * 0.34);
  paintBanner(parent, x + scale * 0.16, y + scale * 0.26, scale * 0.46, "#d9a441");
  paintBakeOven(parent, x + scale * 0.26, y + scale * 0.34, scale * 0.34);
  if (buildings >= 4) paintShrine(parent, x - scale * 0.44, y + scale * 0.34, scale * 0.34);
  // The animals that live in a square: hens under the stalls, a dog by the
  // fire, a pig rooting where the market spills.
  paintChicken(parent, x - scale * 0.2, y + scale * 0.16, scale * 0.4);
  paintChicken(parent, x - scale * 0.12, y + scale * 0.22, scale * 0.36);
  paintDog(parent, x + scale * 0.12, y + scale * 0.18, scale * 0.42);
  if (buildings >= 6) paintPig(parent, x + scale * 0.42, y + scale * 0.26, scale * 0.42);
  paintHandcart(parent, x - scale * 0.5, y + scale * 0.1, scale * 0.4);

  // The rest of what a town of this size has in it: somewhere to drink,
  // somewhere to keep a horse, a pond to water it at, and an orchard on
  // the far side of the fields.
  if (buildings >= 4) paintInn(parent, x - scale * 0.52, y - scale * 0.3, scale * 0.34);
  if (buildings >= 6) paintStable(parent, x + scale * 0.54, y - scale * 0.28, scale * 0.34);
  if (buildings >= 3) paintPond(parent, x + scale * 0.36, y + scale * 0.56, scale * 0.42, random);
  if (buildings >= 5) {
    const [ox, oy] = ringSlot(x, y, scale, 1.1, 0, 1, 1.9);
    paintOrchardRow(parent, ox, oy, scale * 0.3, 4, (random() - 0.5) * 40, random);
    paintOrchardRow(parent, ox, oy + scale * 0.16, scale * 0.3, 4, (random() - 0.5) * 40, random);
  }

  // 5. the buildings themselves, on rings out from the square
  // Four rings of plots now, not three, and more of them in each — a town
  // this size has streets, not a circle of huts.
  const RINGS = [
    { radius: 0.42, slots: 6 },
    { radius: 0.60, slots: 9 },
    { radius: 0.76, slots: 12 },
    { radius: 0.90, slots: 14 },
  ];
  const placed = [];
  const place = (drawer, index) => {
    let ring = RINGS[RINGS.length - 1];
    let slot = index;
    for (const candidate of RINGS) {
      if (slot < candidate.slots) { ring = candidate; break; }
      slot -= candidate.slots;
    }
    const [bx, by] = ringSlot(x, y, scale, ring.radius, slot, ring.slots, 0.35 + ring.radius);
    drawer(bx, by);
    placed.push([bx, by]);
  };

  let index = 0;
  for (let i = 1; i < barns; i++, index++) {
    place((bx, by) => {
      paintBarn(parent, bx, by, scale * 0.32);
      if (i % 2 === 0) paintWoodpile(parent, bx + scale * 0.18, by + scale * 0.16, scale * 0.26);
    }, index);
  }
  for (let i = 1; i < houses; i++, index++) {
    place((bx, by) => {
      paintHouse(parent, bx, by, scale * 0.3, i % 3 === 1 ? ART_COLORS.roofDark : ART_COLORS.roof);
      // Every household keeps something: a plot, a stack of firewood, or a
      // line of washing. Three cottages in a row never look the same.
      const kind = i % 3;
      if (kind === 0) paintGardenPlot(parent, bx + scale * 0.02, by + scale * 0.24, scale * 0.3, random);
      else if (kind === 1) paintWoodpile(parent, bx + scale * 0.18, by + scale * 0.14, scale * 0.26);
      else paintLaundryLine(parent, bx - scale * 0.04, by + scale * 0.2, scale * 0.34, random);
    }, index);
  }
  for (let i = 0; i < Math.min(schools, 3); i++, index++) {
    place((bx, by) => paintSchoolhouse(parent, bx, by, scale * 0.34), index);
  }
  for (let i = 0; i < Math.min(camps, 3); i++, index++) {
    place((bx, by) => {
      paintWarTent(parent, bx, by, scale * 0.3);
      paintTrainingGround(parent, bx + scale * 0.16, by + scale * 0.18, scale * 0.34);
    }, index);
  }

  // 6. smoke over a few of the roofs, so the place looks lived in
  for (let i = 0; i < Math.min(3, placed.length); i++) {
    const [sx, sy] = placed[i * 2 % placed.length];
    paintChimneySmoke(parent, sx, sy - scale * 0.18, scale * 0.4, i * 0.9);
  }

  // 7. a jetty, if the town stands on water
  if (waterAngle !== null) {
    paintJetty(parent, x + Math.cos(waterAngle) * scale * 0.95, y + Math.sin(waterAngle) * scale * 0.8, scale * 0.5, waterAngle);
  }
}

// ---------------------------------------------------------------------------
// The neighbours
// ---------------------------------------------------------------------------

// A rival grows the same way the player's does, so how much land it has
// taken is visible from across the map: a hamlet, a fenced village, or a
// walled town with a market of its own.
function paintRivalVillage(parent, x, y, scale, village, held, waterAngle, random, season) {
  const town = held >= 9;
  const walled = held >= 4;
  const s = scale * (town ? 0.95 : walled ? 0.82 : 0.66);
  const gate = Math.PI * 0.75;

  paintEarthPatch(parent, x, y, s * 0.92, random, "#c3a97e");

  const fields = town ? 5 : walled ? 3 : 2;
  for (let i = 0; i < fields; i++) {
    const [fx, fy] = ringSlot(x, y, s, 1.2, i, fields, 0.9);
    paintFieldPatch(parent, fx, fy, s * 0.48, s * 0.3, (random() - 0.5) * 60, random, season);
  }

  if (town) paintStoneWallRing(parent, x, y, s * 0.9, gate, 4);
  else if (walled) paintPalisadeRing(parent, x, y, s * 0.88, gate, "#7d5f3a");

  paintPlaza(parent, x, y + s * 0.06, s * 0.58);
  paintChieftainHall(parent, x, y - s * 0.18, s * (town ? 0.56 : 0.46));
  if (town) {
    paintMarketStall(parent, x - s * 0.32, y + s * 0.06, "emerald", s * 0.3);
    paintMarketStall(parent, x + s * 0.32, y + s * 0.06, "crimson", s * 0.3);
    paintWell(parent, x - s * 0.02, y + s * 0.28, s * 0.34);
  } else {
    paintWell(parent, x - s * 0.28, y + s * 0.2, s * 0.32);
  }

  const cottages = Math.min(12, 2 + held);
  for (let i = 0; i < cottages; i++) {
    const ring = i < 6 ? 0.52 : 0.74;
    const inRing = i < 6 ? 6 : 8;
    const [bx, by] = ringSlot(x, y, s, ring, i < 6 ? i : i - 6, inRing, 0.4 + ring);
    if (i % 4 === 3) paintBarn(parent, bx, by, s * 0.28);
    else paintHouse(parent, bx, by, s * 0.27, i % 3 === 1 ? ART_COLORS.roofDark : ART_COLORS.roof);
  }

  paintBanner(parent, x + s * 0.12, y + s * 0.3, s * 0.44, village.color);
  paintChimneySmoke(parent, x - s * 0.3, y - s * 0.1, s * 0.36, 0.5);
  paintChicken(parent, x - s * 0.16, y + s * 0.2, s * 0.36);
  if (held >= 5) paintWoodpile(parent, x + s * 0.38, y + s * 0.14, s * 0.28);
  if (walled) paintPond(parent, x + s * 0.34, y + s * 0.54, s * 0.34, random);
  if (town) {
    paintWindmill(parent, x - s * 1.35, y - s * 0.2, s * 0.42);
    paintInn(parent, x - s * 0.5, y - s * 0.28, s * 0.28);
    paintOrchardRow(parent, x + s * 1.1, y + s * 0.1, s * 0.26, 4, 20, random);
  }
  if (waterAngle !== null) {
    paintJetty(parent, x + Math.cos(waterAngle) * s * 0.95, y + Math.sin(waterAngle) * s * 0.8, s * 0.45, waterAngle);
  }
}

// The garlocks do not build a village. They build somewhere to keep the
// loot and the prisoners, and something to sharpen knives on.
function paintGarlockCamp(parent, x, y, scale, village, held, random) {
  const s = scale * (held >= 9 ? 1.0 : 0.85);
  paintEarthPatch(parent, x, y, s * 0.98, random, "#8c7350");

  // A ring of stakes with skulls on them, and a gap they ride out through.
  paintPalisadeRing(parent, x, y, s * 0.92, -Math.PI * 0.25, "#4a3a2a");
  paintSpikes(parent, x, y + s * 0.86, s * 0.7);

  const tents = Math.min(9, 3 + Math.floor(held / 2));
  for (let i = 0; i < tents; i++) {
    const ring = i < 5 ? 0.5 : 0.72;
    const inRing = i < 5 ? 5 : 6;
    const [tx, ty] = ringSlot(x, y, s, ring, i < 5 ? i : i - 5, inRing, 0.3 + ring);
    paintWarTent(parent, tx, ty, s * 0.32);
  }

  paintTotem(parent, x, y - s * 0.18, s * 0.52);
  paintCampfire(parent, x, y + s * 0.26, s * 0.5);
  paintBonePile(parent, x - s * 0.42, y + s * 0.34, s * 0.44);
  paintBonePile(parent, x + s * 0.46, y + s * 0.22, s * 0.38);
  paintBanner(parent, x + s * 0.24, y - s * 0.34, s * 0.5, village.color);
  paintBanner(parent, x - s * 0.3, y - s * 0.3, s * 0.42, "#8c2a1c");
  paintChimneySmoke(parent, x, y + s * 0.1, s * 0.6, 0.2);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { paintSettlements };
}
