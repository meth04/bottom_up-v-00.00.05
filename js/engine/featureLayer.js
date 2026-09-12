// featureLayer.js
//
// Everything that STANDS on the terrain and is not a moving unit: decor
// (trees, rocks, hills, mountains...), landmarks, improvements out on the
// land and the buildings of the towns. All of it is sprites from the atlas,
// grouped in one Container per 16x16 chunk so that:
//
//   * culling is a chunk-rect test, not 86 400 sprite tests;
//   * a change on one tile rebuilds one chunk of ~256 tiles, not the world;
//   * y-sorting (zIndex = ground y) only has to sort within a chunk, and
//     chunks themselves are ordered by row so a tall tree at the bottom of
//     one chunk still draws behind a house at the top of the next.
//
// Decor placement is seeded from `tile.detailSeed`, so a chunk looks the
// same every time it is rebuilt and on every machine. Zoom bands
// (ZOOM_FAR / ZOOM_MID) drop detail as the camera pulls out: far away only
// the mountains matter, because everything else is smaller than a pixel.

import { HEX_SIZE, CHUNK_SIZE, ZOOM_FAR, ZOOM_MID } from "../world/constants.js";
import { createRandom, hexEdgeMidpoint, worldTileCenter } from "../world/hexMath.js";
import { TERRAIN, SEASON_NAMES } from "../world/terrainDefs.js";

// ---------------------------------------------------------------------------
// Chunk grid: the maths shared by every chunked layer. Exported so the road
// and overlay layers use exactly the same chunk boundaries.
// ---------------------------------------------------------------------------

export class ChunkGrid {
  constructor(world, hexMap) {
    this.cols = world.cols;
    this.rows = world.rows;
    this.grid = world.grid;
    this.chunkCols = Math.ceil(this.cols / CHUNK_SIZE);
    this.chunkRows = Math.ceil(this.rows / CHUNK_SIZE);
    // World-unit size of a chunk. Odd rows are shifted half a hex right,
    // which is why culling adds a hex of slack on each side.
    this.chunkW = Math.sqrt(3) * this.grid.hexSize * CHUNK_SIZE;
    this.chunkH = 1.5 * this.grid.hexSize * CHUNK_SIZE;
    // Tiles by (row * cols + col): the tile array from worldGen is row-major
    // but a defensive rebuild by `index` costs nothing at boot.
    this.tiles = new Array(this.cols * this.rows).fill(null);
    for (const tile of hexMap.getAllTiles()) this.tiles[tile.row * this.cols + tile.col] = tile;
  }

  indexOf(cx, cy) {
    return cy * this.chunkCols + cx;
  }

  chunkOfTile(tile) {
    return this.indexOf(Math.floor(tile.col / CHUNK_SIZE), Math.floor(tile.row / CHUNK_SIZE));
  }

  // Calls fn(tile) for every tile in the chunk.
  forEachTile(cx, cy, fn) {
    const col0 = cx * CHUNK_SIZE;
    const row0 = cy * CHUNK_SIZE;
    const col1 = Math.min(this.cols, col0 + CHUNK_SIZE);
    const row1 = Math.min(this.rows, row0 + CHUNK_SIZE);
    for (let row = row0; row < row1; row++) {
      for (let col = col0; col < col1; col++) {
        const tile = this.tiles[row * this.cols + col];
        if (tile) fn(tile);
      }
    }
  }

  // Chunk index range intersecting a world rect, padded by `marginChunks`.
  rangeFor(bounds, marginChunks = 0) {
    const g = this.grid;
    const hx = Math.sqrt(3) * g.hexSize;
    const hy = g.hexSize;
    const cx0 = Math.floor((bounds.minX - g.originX - hx) / this.chunkW) - marginChunks;
    const cx1 = Math.floor((bounds.maxX - g.originX + hx) / this.chunkW) + marginChunks;
    const cy0 = Math.floor((bounds.minY - g.originY - hy) / this.chunkH) - marginChunks;
    const cy1 = Math.floor((bounds.maxY - g.originY + hy) / this.chunkH) + marginChunks;
    return {
      cx0: Math.max(0, cx0), cx1: Math.min(this.chunkCols - 1, cx1),
      cy0: Math.max(0, cy0), cy1: Math.min(this.chunkRows - 1, cy1),
    };
  }

  center(tile) {
    return worldTileCenter(tile.q, tile.r, this.grid);
  }
}

// Chebyshev distance (in chunks) from a chunk to a range; 0 when inside.
export function chunkDistance(cx, cy, range) {
  const dx = cx < range.cx0 ? range.cx0 - cx : cx > range.cx1 ? cx - range.cx1 : 0;
  const dy = cy < range.cy0 ? range.cy0 - cy : cy > range.cy1 ? cy - range.cy1 : 0;
  return Math.max(dx, dy);
}

// Zoom bands: 0 = far (only mountains), 1 = mid (landforms and tree
// clusters), 2 = near (everything).
export function zoomBand(zoom) {
  if (zoom < ZOOM_FAR) return 0;
  if (zoom < ZOOM_MID) return 1;
  return 2;
}

// Colour of a village as 0xRRGGBB whether the record stores a number or a
// CSS hex string (the legacy villages.js uses strings).
export function colorToNumber(color, fallback = 0xffffff) {
  if (typeof color === "number") return color;
  if (typeof color === "string" && color[0] === "#") {
    const hex = color.length === 4 ? color.slice(1).split("").map((c) => c + c).join("") : color.slice(1, 7);
    return parseInt(hex, 16);
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Feature layer
// ---------------------------------------------------------------------------

const SEASON_TINT = { 1: 0xffffff, 2: 0xffffff, 3: 0xffc78a, 4: 0xdfe8f0 };
const SEASONAL_TREES = new Set(["decor/tree_broad", "decor/tree_birch", "decor/tree_timbermellow"]);
const LANDFORMS = new Set(["decor/mountain", "decor/hill"]);
const TREES = new Set(["decor/tree_broad", "decor/tree_pine", "decor/tree_birch", "decor/tree_timbermellow"]);
const SHADOWED = new Set([...TREES, "decor/palm", "decor/dead_tree", "decor/cactus"]);
// How far inside the hex decor may sit: 0.15 R from every edge, expressed
// as a smaller hex of the same shape.
const INSET_RADIUS = HEX_SIZE * (1 - 0.15 / (Math.sqrt(3) / 2));
// Chunks farther than this (in chunks) from the view are destroyed.
const KEEP_DISTANCE = 3;
// Chunk builds per frame; more would stutter when the camera flies.
const BUILD_BUDGET = 6;
const WATERFALL_PERIOD = 0.18;
const WINDMILL_PERIOD = 0.14;

export class FeatureLayer {
  constructor(PIXI, atlas, world, hexMap, quality, villages) {
    this.PIXI = PIXI;
    this.atlas = atlas;
    this.world = world;
    this.hexMap = hexMap;
    this.quality = quality;
    this.villages = villages || (() => []);
    this.grid = new ChunkGrid(world, hexMap);
    this.container = new PIXI.Container();
    this.container.sortableChildren = true;
    this.container.label = "features";
    this.chunks = new Map(); // chunk index -> record
    this.dirty = new Set();
    this.pool = [];
    this.season = 2;
    this.band = -1;
    this.time = 0;
    this.shadowTexture = atlas.texture("fx/shadow");
  }

  // ---- public ----------------------------------------------------------------

  markDirty(tileIds) {
    for (const id of tileIds || []) {
      const tile = this.hexMap.getTile(id);
      if (tile) this.dirty.add(this.grid.chunkOfTile(tile));
    }
  }

  markAllDirty() {
    for (const index of this.chunks.keys()) this.dirty.add(index);
  }

  setSeason(season) {
    if (season === this.season) return;
    this.season = season;
    const tint = SEASON_TINT[season] || 0xffffff;
    const farmKey = `improvement/farm_${SEASON_NAMES[season] || "summer"}`;
    // Cheap in-place update: tint the seasonal trees, swap farm textures.
    // No rebuild, so a season change never hitches.
    for (const chunk of this.chunks.values()) {
      for (const sprite of chunk.seasonal) sprite.tint = tint;
      for (const sprite of chunk.farms) sprite.texture = this.atlas.texture(farmKey);
    }
  }

  setQuality(quality) {
    const densityChanged = quality.decorDensity !== this.quality.decorDensity;
    const shadowsChanged = quality.shadows !== this.quality.shadows;
    const tierChanged = quality.tier !== this.quality.tier;
    this.quality = quality;
    if (densityChanged || shadowsChanged || tierChanged) this.markAllDirty();
  }

  update(camera, dt) {
    this.time += dt;
    const band = zoomBand(camera.zoom);
    if (band !== this.band) {
      this.band = band;
      this.markAllDirty();
    }
    const view = this.grid.rangeFor(camera.getBounds(0), 1);

    // Drop chunks that drifted far away; their sprites go back to the pool.
    for (const [index, chunk] of this.chunks) {
      if (chunkDistance(chunk.cx, chunk.cy, view) > KEEP_DISTANCE) {
        this.destroyChunk(index);
      } else {
        chunk.container.visible = chunkDistance(chunk.cx, chunk.cy, view) === 0;
      }
    }

    // Build missing / dirty chunks in view, a few per frame.
    let budget = BUILD_BUDGET;
    for (let cy = view.cy0; cy <= view.cy1 && budget > 0; cy++) {
      for (let cx = view.cx0; cx <= view.cx1 && budget > 0; cx++) {
        const index = this.grid.indexOf(cx, cy);
        const existing = this.chunks.get(index);
        if (existing && !this.dirty.has(index)) continue;
        if (existing) this.destroyChunk(index);
        this.dirty.delete(index);
        this.buildChunk(cx, cy);
        budget--;
      }
    }
    // Dirty chunks outside the view are simply dropped; they are rebuilt
    // on demand when the camera comes back.
    for (const index of this.dirty) {
      if (this.chunks.has(index)) this.destroyChunk(index);
      this.dirty.delete(index);
    }

    // Frame animations: waterfalls and windmills.
    for (const chunk of this.chunks.values()) {
      if (!chunk.container.visible) continue;
      for (const anim of chunk.animated) {
        const frame = Math.floor(this.time / anim.period) % anim.frames.length;
        if (frame !== anim.frame) {
          anim.frame = frame;
          anim.sprite.texture = anim.frames[frame];
        }
      }
    }
  }

  getBuildingPositions(bounds) {
    const out = [];
    for (const chunk of this.chunks.values()) {
      for (const p of chunk.buildings) {
        if (p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY) out.push(p);
      }
    }
    return out;
  }

  destroy() {
    for (const index of Array.from(this.chunks.keys())) this.destroyChunk(index);
    for (const sprite of this.pool) sprite.destroy();
    this.pool.length = 0;
    this.container.destroy({ children: true });
  }

  // ---- sprite pool -------------------------------------------------------------

  acquire(texture) {
    let sprite = this.pool.pop();
    if (!sprite) sprite = new this.PIXI.Sprite(texture);
    else sprite.texture = texture;
    sprite.anchor.copyFrom(texture.defaultAnchor || { x: 0.5, y: 1 });
    sprite.tint = 0xffffff;
    sprite.alpha = 1;
    sprite.scale.set(1, 1);
    sprite.rotation = 0;
    sprite.visible = true;
    return sprite;
  }

  release(sprite) {
    if (this.pool.length < 6000) this.pool.push(sprite);
    else sprite.destroy();
  }

  // ---- chunk lifecycle -----------------------------------------------------------

  destroyChunk(index) {
    const chunk = this.chunks.get(index);
    if (!chunk) return;
    this.chunks.delete(index);
    const children = chunk.container.removeChildren();
    for (const child of children) this.release(child);
    this.container.removeChild(chunk.container);
    chunk.container.destroy({ children: false });
  }

  buildChunk(cx, cy) {
    const PIXI = this.PIXI;
    const container = new PIXI.Container();
    container.sortableChildren = true;
    // Chunk rows draw back to front; within a row, left to right is fine.
    container.zIndex = cy * 4096 + cx;
    const chunk = {
      cx, cy, container,
      seasonal: [], farms: [], animated: [], buildings: [],
    };
    const revealed = this.hexMap.mapmakingUnlocked;
    this.grid.forEachTile(cx, cy, (tile) => {
      if (!tile.seen && !revealed) return;
      this.buildTile(tile, chunk);
    });
    this.container.addChild(container);
    this.chunks.set(this.grid.indexOf(cx, cy), chunk);
  }

  // ---- per-tile content --------------------------------------------------------------

  buildTile(tile, chunk) {
    const c = this.grid.center(tile);
    const hasStructure = !!(tile.building || tile.improvement || tile.landmark);
    const hasWaterfall = tile.feature === "waterfall";

    if (tile.building) this.placeBuilding(tile, c, chunk);
    else if (tile.improvement) this.placeImprovement(tile, c, chunk);
    else if (tile.landmark) this.placeStanding(`landmark/${tile.landmark}`, c.x, c.y + 12, chunk, { shadow: true });

    if (hasWaterfall && this.band > 0) {
      const frames = [0, 1, 2].map((i) => this.atlas.texture(`landmark/waterfall_${i}`));
      const sprite = this.acquire(frames[0]);
      sprite.position.set(c.x, c.y + 14);
      sprite.zIndex = c.y + 14;
      chunk.container.addChild(sprite);
      chunk.animated.push({ sprite, frames, period: WATERFALL_PERIOD, frame: 0 });
    }

    // Structures replace the natural decor of their hex: a farm on a
    // meadow, a hall in a forest clearing.
    if (hasStructure || hasWaterfall) return;
    this.placeDecor(tile, c, chunk);
  }

  placeDecor(tile, c, chunk) {
    const def = TERRAIN[tile.terrainType];
    if (!def || !def.decor || def.decor.length === 0) return;
    const rng = createRandom(tile.detailSeed);
    const band = this.band;
    const density = this.quality.decorDensity === undefined ? 1 : this.quality.decorDensity;
    const highTier = this.quality.tier === "high";
    const blockers = this.blockersFor(tile, c);

    for (let i = 0; i < def.decor.length; i++) {
      const recipe = def.decor[i];
      let baseKey = recipe.key;
      if (baseKey === "decor/mountain" && tile.snowCapped) baseKey = "decor/mountain_snow";
      const isLandform = LANDFORMS.has(recipe.key);
      const isTree = TREES.has(recipe.key);

      // Which recipes survive at this zoom band.
      let zoomFactor = 1;
      if (band === 0) {
        if (!(recipe.key === "decor/mountain" || (recipe.key === "decor/hill" && highTier))) continue;
      } else if (band === 1) {
        if (i > 0 || !(isLandform || isTree)) continue;
        if (!isLandform) zoomFactor = 0.5;
      }

      // Candidate positions are generated for the FULL count whatever the
      // density or band, so lowering quality thins the same trees rather
      // than reshuffling them.
      const fullCount = Math.max(1, Math.ceil(recipe.count));
      const wanted = isLandform ? 1 : stochasticRound(recipe.count * density * zoomFactor, rng);
      const variants = this.atlas.variants(baseKey);
      for (let k = 0; k < fullCount; k++) {
        const pos = isLandform
          ? [c.x + (rng() - 0.5) * HEX_SIZE * 0.2, c.y + (rng() - 0.5) * HEX_SIZE * 0.2 + HEX_SIZE * 0.45]
          : randomPointInHex(c.x, c.y, INSET_RADIUS * (recipe.spread || 1), rng);
        const variant = variants ? Math.floor(rng() * variants) : -1;
        const scale = recipe.scale ? recipe.scale[0] + rng() * (recipe.scale[1] - recipe.scale[0]) : 1;
        const flip = rng() < 0.5;
        if (k >= wanted) continue;
        if (blockers && blocked(pos[0], pos[1], blockers)) continue;
        const key = variant >= 0 ? `${baseKey}_${variant}` : baseKey;
        const texture = this.atlas.texture(key);
        const standing = texture.defaultAnchor && texture.defaultAnchor.y > 0.9;
        if (standing && SHADOWED.has(recipe.key) && this.quality.shadows) {
          this.placeShadow(pos[0], pos[1], scale * 0.9, chunk);
        }
        const sprite = this.acquire(texture);
        sprite.position.set(pos[0], pos[1]);
        sprite.scale.set(flip && isTree ? -scale : scale, scale);
        sprite.zIndex = standing ? pos[1] : pos[1] - HEX_SIZE * 2;
        if (SEASONAL_TREES.has(recipe.key)) {
          sprite.tint = SEASON_TINT[this.season] || 0xffffff;
          chunk.seasonal.push(sprite);
        }
        chunk.container.addChild(sprite);
      }
    }
  }

  // Road and river bands the decor must keep off: segments from the centre
  // to each edge midpoint, with a clearance radius.
  blockersFor(tile, c) {
    if (!tile.road && !tile.riverMask) return null;
    const list = [];
    for (let dir = 0; dir < 6; dir++) {
      const road = tile.road & (1 << dir);
      const river = tile.riverMask & (1 << dir);
      if (!road && !river) continue;
      const [ex, ey] = hexEdgeMidpoint(c.x, c.y, HEX_SIZE, dir);
      const radius = river ? 3 + (tile.riverWidth || 1) * 3 : 5.5;
      list.push({ x0: c.x, y0: c.y, x1: ex, y1: ey, r: radius });
    }
    return list;
  }

  placeShadow(x, y, scale, chunk) {
    const shadow = this.acquire(this.shadowTexture);
    shadow.position.set(x + 1.5 * scale, y - 0.5);
    shadow.scale.set(scale * 1.1, scale * 0.9);
    shadow.alpha = 0.35;
    // Just under its owner in the sort order, above the flat decor.
    shadow.zIndex = y - 0.5;
    chunk.container.addChild(shadow);
  }

  placeStanding(key, x, y, chunk, opts = {}) {
    const texture = this.atlas.texture(key);
    if (opts.shadow && this.quality.shadows) this.placeShadow(x, y, opts.shadowScale || 2, chunk);
    const sprite = this.acquire(texture);
    sprite.position.set(x, y);
    sprite.zIndex = y;
    if (opts.tint !== undefined) sprite.tint = opts.tint;
    chunk.container.addChild(sprite);
    return sprite;
  }

  placeImprovement(tile, c, chunk) {
    let key = `improvement/${tile.improvement}`;
    const y = c.y + 12;
    if (tile.improvement === "farm") {
      key = `improvement/farm_${SEASON_NAMES[this.season] || "summer"}`;
      const sprite = this.placeStanding(key, c.x, y, chunk, { shadow: false });
      chunk.farms.push(sprite);
      return;
    }
    // Fisheries and docks sit on the shore, half over the water: no ground shadow.
    const shadow = tile.improvement !== "fishery";
    this.placeStanding(key, c.x, y, chunk, { shadow, shadowScale: 2.2 });
  }

  placeBuilding(tile, c, chunk) {
    const type = tile.building;
    const y = c.y + 12;
    let key = `building/${type}`;
    if (type === "house") key = `building/house_${tile.detailSeed % 3}`;
    if (type === "hall") key = `building/hall_${this.hallTier(tile)}`;
    if (type === "windmill") key = "building/windmill_0";

    // Bridges, docks and palisades are structural, not homes: no glow, no shadow.
    const flat = type === "bridge" || type === "bridge_v" || type === "dock" || type === "palisade";
    const sprite = this.placeStanding(key, c.x, y, chunk, { shadow: !flat, shadowScale: 2.2 });
    if (!flat) chunk.buildings.push({ x: c.x, y: c.y, type, tileId: tile.id });

    if (type === "windmill") {
      const frames = [0, 1, 2, 3].map((i) => this.atlas.texture(`building/windmill_${i}`));
      chunk.animated.push({ sprite, frames, period: WINDMILL_PERIOD, frame: 0 });
    }
    if (type === "hall") {
      // The village banner on the hall roof, tinted with the village colour.
      const village = this.villageOf(tile.owner);
      const tint = village ? colorToNumber(village.color, 0xf2c14e) : 0xf2c14e;
      const flag = this.acquire(this.atlas.texture("fx/flag"));
      const tier = this.hallTier(tile);
      const offset = [[6, 24], [9, 26], [-4, 30]][tier];
      flag.position.set(c.x + offset[0], y - offset[1] - 5);
      flag.tint = tint;
      flag.zIndex = y + 0.1;
      chunk.container.addChild(flag);
    }
  }

  // Hall size grows with the settlement: hut, hall, keep.
  hallTier(tile) {
    const owner = tile.owner || tile.villageId;
    const count = owner ? this.hexMap.getBuildings(owner).size : 0;
    return count < 4 ? 0 : count < 10 ? 1 : 2;
  }

  villageOf(id) {
    if (!id) return null;
    const list = this.villages() || [];
    for (const v of list) if (v.id === id) return v;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------

// Rounds 2.4 to 2 or 3 with probability 0.6/0.4, so fractional recipe counts
// average out across a forest instead of every hex getting the same number.
function stochasticRound(value, rng) {
  const floor = Math.floor(value);
  return floor + (rng() < value - floor ? 1 : 0);
}

// Uniform point in a pointy-top hex of corner radius `radius` by rejection
// sampling of its bounding box (~ 3 tries on average).
function randomPointInHex(cx, cy, radius, rng) {
  const halfW = radius * (Math.sqrt(3) / 2);
  for (let i = 0; i < 12; i++) {
    const x = (rng() * 2 - 1) * halfW;
    const y = (rng() * 2 - 1) * radius;
    if (Math.abs(y) <= radius - Math.abs(x) / Math.sqrt(3)) return [cx + x, cy + y];
  }
  return [cx, cy];
}

function blocked(x, y, blockers) {
  for (const b of blockers) {
    const dx = b.x1 - b.x0;
    const dy = b.y1 - b.y0;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((x - b.x0) * dx + (y - b.y0) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = b.x0 + dx * t - x;
    const py = b.y0 + dy * t - y;
    if (px * px + py * py < b.r * b.r) return true;
  }
  return false;
}
