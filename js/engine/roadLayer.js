// roadLayer.js
//
// Rivers, roads and bridges, drawn as vector Graphics per 16x16 chunk. The
// layer sits between the terrain mesh and the feature sprites, so rivers
// read as cut into the ground and trees stand on the banks.
//
// Both rivers and roads are stored as 6-bit masks on the tile (bit i =
// "continues toward HEX_DIRECTIONS[i]"). Each tile draws only its own half
// of every connection — centre to edge midpoint — so a hex never needs to
// know anything about the chunk next door, and a change on one tile only
// dirties one chunk. Round caps at the centre make the arms meet smoothly.
//
// Rivers are drawn as two strokes (a dark wide one, a light narrow one on
// top) because that is the cheapest way to get an outlined band with
// perfect joins. The optional flow animation cycles between three
// pre-drawn dash offsets rather than redrawing a Graphics every frame:
// a rebuild costs a geometry upload, toggling `visible` costs nothing.

import { HEX_SIZE, ZOOM_MID } from "../world/constants.js";
import { HEX_DIRECTIONS, hexEdgeMidpoint } from "../world/hexMath.js";
import { isWaterTerrain } from "../world/terrainDefs.js";
import { ChunkGrid, chunkDistance } from "./featureLayer.js";

const RIVER_CORE = 0x5aa9cf;
const RIVER_EDGE = 0x3f86a8;
const RIVER_WIDTHS = [0, 4, 7, 10];
const ROAD_FILL = 0xb08a5a;
const ROAD_EDGE = 0x7d5d39;
const ROAD_LINE = 0xd9b98a;
const ROAD_WIDTH = 5;
const ROAD_EDGE_WIDTH = 7;
const KEEP_DISTANCE = 3;
const BUILD_BUDGET = 8;
const DASH_PERIOD = 0.25;
const DASH_VARIANTS = 3;

export class RoadLayer {
  constructor(PIXI, atlas, world, hexMap, quality) {
    this.PIXI = PIXI;
    this.atlas = atlas;
    this.world = world;
    this.hexMap = hexMap;
    this.quality = quality;
    this.grid = new ChunkGrid(world, hexMap);
    this.container = new PIXI.Container();
    this.container.label = "roads";
    this.chunks = new Map();
    this.dirty = new Set();
    this.time = 0;
    this.detailed = null; // true when zoom >= ZOOM_MID (centre lines drawn)
  }

  markDirty(tileIds) {
    for (const id of tileIds || []) {
      const tile = this.hexMap.getTile(id);
      if (tile) this.dirty.add(this.grid.chunkOfTile(tile));
    }
  }

  markAllDirty() {
    for (const index of this.chunks.keys()) this.dirty.add(index);
  }

  setQuality(quality) {
    const animateChanged = !!quality.animateWater !== !!this.quality.animateWater;
    this.quality = quality;
    if (animateChanged) this.markAllDirty();
  }

  update(camera, dt) {
    this.time += dt;
    const detailed = camera.zoom >= ZOOM_MID;
    if (detailed !== this.detailed) {
      this.detailed = detailed;
      this.markAllDirty();
    }
    const view = this.grid.rangeFor(camera.getBounds(0), 1);

    for (const [index, chunk] of this.chunks) {
      const distance = chunkDistance(chunk.cx, chunk.cy, view);
      if (distance > KEEP_DISTANCE) this.destroyChunk(index);
      else chunk.container.visible = distance === 0;
    }

    let budget = BUILD_BUDGET;
    for (let cy = view.cy0; cy <= view.cy1 && budget > 0; cy++) {
      for (let cx = view.cx0; cx <= view.cx1 && budget > 0; cx++) {
        const index = this.grid.indexOf(cx, cy);
        if (this.chunks.has(index) && !this.dirty.has(index)) continue;
        this.destroyChunk(index);
        this.dirty.delete(index);
        this.buildChunk(cx, cy);
        budget--;
      }
    }
    for (const index of this.dirty) {
      this.destroyChunk(index);
      this.dirty.delete(index);
    }

    // Flow animation: show one of the three dash offsets in turn.
    if (this.quality.animateWater) {
      const phase = Math.floor(this.time / DASH_PERIOD) % DASH_VARIANTS;
      for (const chunk of this.chunks.values()) {
        if (!chunk.dashes || chunk.phase === phase) continue;
        chunk.phase = phase;
        for (let i = 0; i < chunk.dashes.length; i++) chunk.dashes[i].visible = i === phase;
      }
    }
  }

  destroy() {
    for (const index of Array.from(this.chunks.keys())) this.destroyChunk(index);
    this.container.destroy({ children: true });
  }

  // ---- chunk lifecycle ---------------------------------------------------------

  destroyChunk(index) {
    const chunk = this.chunks.get(index);
    if (!chunk) return;
    this.chunks.delete(index);
    this.container.removeChild(chunk.container);
    chunk.container.destroy({ children: true });
  }

  buildChunk(cx, cy) {
    const PIXI = this.PIXI;
    const container = new PIXI.Container();
    const chunk = { cx, cy, container, dashes: null, phase: -1 };
    const revealed = this.hexMap.mapmakingUnlocked;

    const riverTiles = [];
    const roadTiles = [];
    this.grid.forEachTile(cx, cy, (tile) => {
      if (!tile.seen && !revealed) return;
      if (tile.riverMask && tile.riverWidth > 0) riverTiles.push(tile);
      if (tile.road) roadTiles.push(tile);
    });

    if (riverTiles.length) {
      const rivers = new PIXI.Graphics();
      this.drawRivers(rivers, riverTiles);
      container.addChild(rivers);
      if (this.quality.animateWater) {
        chunk.dashes = [];
        for (let i = 0; i < DASH_VARIANTS; i++) {
          const g = new PIXI.Graphics();
          this.drawRiverDashes(g, riverTiles, i / DASH_VARIANTS);
          g.visible = i === 0;
          container.addChild(g);
          chunk.dashes.push(g);
        }
        chunk.phase = 0;
      }
    }

    if (roadTiles.length) {
      const roads = new PIXI.Graphics();
      this.drawRoads(roads, roadTiles);
      container.addChild(roads);
      for (const tile of roadTiles) {
        if (tile.riverMask && tile.riverWidth > 0) this.placeBridge(tile, container);
      }
    }

    if (container.children.length === 0) {
      // An empty chunk still gets a record, so we do not re-scan it every frame.
      container.visible = false;
    }
    this.container.addChild(container);
    this.chunks.set(this.grid.indexOf(cx, cy), chunk);
  }

  // ---- rivers -------------------------------------------------------------------------

  // Every arm as one subpath; two stroke passes (edge under core). Widths
  // are grouped so tributaries can be thinner than the main stream.
  drawRivers(g, tiles) {
    const byWidth = new Map();
    for (const tile of tiles) {
      const w = Math.min(3, Math.max(1, tile.riverWidth));
      if (!byWidth.has(w)) byWidth.set(w, []);
      byWidth.get(w).push(tile);
    }
    for (const pass of ["edge", "core"]) {
      for (const [w, group] of byWidth) {
        for (const tile of group) {
          const c = this.grid.center(tile);
          for (let dir = 0; dir < 6; dir++) {
            if (!(tile.riverMask & (1 << dir))) continue;
            const [ex, ey] = hexEdgeMidpoint(c.x, c.y, HEX_SIZE, dir);
            g.moveTo(c.x, c.y);
            g.lineTo(ex, ey);
          }
        }
        const width = RIVER_WIDTHS[w];
        if (pass === "edge") g.stroke({ width: width + 3, color: RIVER_EDGE, cap: "round", join: "round" });
        else g.stroke({ width, color: RIVER_CORE, cap: "round", join: "round" });
      }
    }
  }

  // A thin white dashed line down the middle of each arm. `offset` (0..1)
  // shifts the dash pattern; the dashes run downhill so the water appears
  // to flow toward the lower neighbour.
  drawRiverDashes(g, tiles, offset) {
    const dash = 4;
    const gap = 5;
    const period = dash + gap;
    for (const tile of tiles) {
      const c = this.grid.center(tile);
      for (let dir = 0; dir < 6; dir++) {
        if (!(tile.riverMask & (1 << dir))) continue;
        const [ex, ey] = hexEdgeMidpoint(c.x, c.y, HEX_SIZE, dir);
        const outward = this.flowsOutward(tile, dir);
        const [sx, sy, tx, ty] = outward ? [c.x, c.y, ex, ey] : [ex, ey, c.x, c.y];
        const dx = tx - sx, dy = ty - sy;
        const len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len;
        for (let s = -period + offset * period; s < len; s += period) {
          const a = Math.max(0, s);
          const b = Math.min(len, s + dash);
          if (b <= a) continue;
          g.moveTo(sx + ux * a, sy + uy * a);
          g.lineTo(sx + ux * b, sy + uy * b);
        }
      }
    }
    g.stroke({ width: 1.2, color: 0xffffff, alpha: 0.4, cap: "round" });
  }

  // Water flows from this tile toward `dir` when the neighbour is lower or
  // is open water (a lake or the sea). Missing neighbours count as downhill
  // so a river leaving the map edge still flows away.
  flowsOutward(tile, dir) {
    const d = HEX_DIRECTIONS[dir];
    const neighbor = this.hexMap.getTileAt(tile.q + d.q, tile.r + d.r);
    if (!neighbor) return true;
    if (isWaterTerrain(neighbor.terrainType) && neighbor.terrainType !== "river") return true;
    if (neighbor.elevation === tile.elevation) return neighbor.riverWidth >= tile.riverWidth;
    return neighbor.elevation < tile.elevation;
  }

  // ---- roads -----------------------------------------------------------------------------

  drawRoads(g, tiles) {
    // Pass 1: the dark edge; pass 2: the dirt; pass 3 (near zoom): a dotted
    // centre line. Dead ends get a round plaza so a road does not just stop.
    for (const pass of [0, 1]) {
      for (const tile of tiles) {
        const c = this.grid.center(tile);
        let bits = 0;
        for (let dir = 0; dir < 6; dir++) {
          if (!(tile.road & (1 << dir))) continue;
          bits++;
          const [ex, ey] = hexEdgeMidpoint(c.x, c.y, HEX_SIZE, dir);
          g.moveTo(c.x, c.y);
          g.lineTo(ex, ey);
        }
        if (bits === 1) g.circle(c.x, c.y, pass === 0 ? 6 : 5);
      }
      if (pass === 0) {
        g.stroke({ width: ROAD_EDGE_WIDTH, color: ROAD_EDGE, cap: "round", join: "round" });
        g.fill({ color: ROAD_EDGE });
      } else {
        g.stroke({ width: ROAD_WIDTH, color: ROAD_FILL, cap: "round", join: "round" });
        g.fill({ color: ROAD_FILL });
      }
    }
    if (!this.detailed) return;
    const dash = 2;
    const gap = 3.5;
    for (const tile of tiles) {
      const c = this.grid.center(tile);
      for (let dir = 0; dir < 6; dir++) {
        if (!(tile.road & (1 << dir))) continue;
        const [ex, ey] = hexEdgeMidpoint(c.x, c.y, HEX_SIZE, dir);
        const dx = ex - c.x, dy = ey - c.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len;
        for (let s = 3; s < len - 1; s += dash + gap) {
          g.moveTo(c.x + ux * s, c.y + uy * s);
          g.lineTo(c.x + ux * Math.min(len, s + dash), c.y + uy * Math.min(len, s + dash));
        }
      }
    }
    g.stroke({ width: 1, color: ROAD_LINE, alpha: 0.8, cap: "round" });
  }

  // ---- bridges ----------------------------------------------------------------------------

  // A road over a river tile gets a bridge sprite. East/west roads use the
  // wide arch; anything with a diagonal-only mask reads as north-south.
  placeBridge(tile, container) {
    const eastWest = (tile.road & 0b001001) !== 0;
    const key = eastWest ? "building/bridge" : "building/bridge_v";
    const sprite = new this.PIXI.Sprite(this.atlas.texture(key));
    const c = this.grid.center(tile);
    sprite.position.set(c.x, c.y + (eastWest ? 6 : 15));
    container.addChild(sprite);
  }
}
