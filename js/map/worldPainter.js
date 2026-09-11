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
  switch (tile.terrainType) {
    case "plains":
      if (random() < 0.6) paintWheat(parent, x + (random() - 0.5) * size * 0.5, y + (random() - 0.5) * size * 0.4, size, random);
      break;
    case "flowerMeadow":
      paintFlowerDots(parent, x, y, size, random);
      if (random() < 0.35) paintBush(parent, x + (random() - 0.5) * size * 0.6, y + size * 0.2, size, random);
      break;
    case "forest":
      paintTree(parent, x - size * 0.22, y + size * 0.12, size * 0.9, random);
      paintTree(parent, x + size * 0.22, y - size * 0.1, size * 0.8, random);
      break;
    case "denseBush":
      paintTree(parent, x - size * 0.28, y - size * 0.08, size * 0.8, random);
      paintTree(parent, x + size * 0.24, y - size * 0.16, size * 0.85, random);
      paintTree(parent, x, y + size * 0.26, size * 0.9, random);
      break;
    case "rockyOutcrop":
      paintRock(parent, x - size * 0.16, y + size * 0.1, size, random);
      if (random() < 0.6) paintRock(parent, x + size * 0.24, y - size * 0.14, size * 0.7, random);
      break;
    case "mountains":
      paintMountain(parent, x, y + size * 0.1, size, random);
      break;
    case "overgrownHighlands":
      paintTerraceStripes(parent, x, y, size, random);
      if (random() < 0.5) paintWheat(parent, x + size * 0.2, y - size * 0.1, size * 0.7, random);
      break;
    case "timbermellowForest":
      // The home tile's trees stay out of the middle, where the houses go.
      paintTree(parent, x - size * 0.5, y + size * 0.3, size * 0.7, random);
      paintTree(parent, x + size * 0.52, y + size * 0.26, size * 0.7, random);
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
  for (const village of world.villages) {
    const tile = hexMap.getTile(village.homeTileId);
    const c = worldTileCenter(tile.q, tile.r, world.grid);
    if (village.kind === "player") {
      paintPlayerVillage(buildings, c.x, c.y, size, stats, random);
    } else {
      paintOtherVillage(buildings, c.x, c.y, size, village, random);
    }
    const label = svgEl("text", { x: c.x, y: c.y - size * 1.02, class: "art-village-label", "text-anchor": "middle" });
    label.textContent = village.name;
    buildings.appendChild(label);
  }
  svg.appendChild(buildings);

  container.innerHTML = "";
  container.appendChild(svg);
  return svg;
}

// The player's village grows: one cottage per house, one barn per barn,
// a fire in the middle. Slots spiral out from the centre.
function paintPlayerVillage(parent, x, y, size, stats, random) {
  const slots = [
    [-0.3, -0.12], [0.3, -0.12], [-0.3, 0.3], [0.3, 0.3], [0, -0.42], [0, 0.55],
    [-0.62, 0.08], [0.62, 0.08], [-0.6, 0.5], [0.6, 0.5], [-0.32, -0.5], [0.32, -0.5],
  ];
  const houses = Math.min(stats.houses || 1, 8);
  const barns = Math.min(stats.barns || 1, 4);
  let slot = 0;
  for (let i = 0; i < barns && slot < slots.length; i++, slot++) {
    paintBarn(parent, x + slots[slot][0] * size, y + slots[slot][1] * size, size * 0.62);
  }
  for (let i = 0; i < houses && slot < slots.length; i++, slot++) {
    paintHouse(parent, x + slots[slot][0] * size, y + slots[slot][1] * size, size * 0.6, i % 3 === 1 ? ART_COLORS.roofDark : ART_COLORS.roof);
  }
  paintCampfire(parent, x, y + size * 0.08, size * 0.7);
  paintBanner(parent, x + size * 0.12, y + size * 0.1, size * 0.6, "#d9a441");
}

function paintOtherVillage(parent, x, y, size, village, random) {
  const spots = [[-0.28, 0.02], [0.3, -0.06], [0.02, 0.4]];
  for (const [dx, dy] of spots) {
    paintHouse(parent, x + dx * size, y + dy * size, size * 0.56, village.kind === "garlock" ? "#4a3b36" : ART_COLORS.roof);
  }
  paintBanner(parent, x, y - size * 0.05, size * 0.6, village.color);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { paintWorld, paintSettlements };
}
