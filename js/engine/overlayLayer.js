// overlayLayer.js
//
// Everything the player reads ON TOP of the world but that is not part of
// the world itself: territory borders, the frontier and seizable hexes,
// the fog rim, the selection brackets, the hover hex, the data lenses,
// placement ghosts, road previews and tile flashes.
//
// Two kinds of content live here:
//   * per-chunk vector Graphics (borders, frontier, seizable, fog rim) and
//     per-chunk lens sprites — rebuilt only when a tile in the chunk is
//     dirtied or the lens/zoom band changes, culled like every other layer;
//   * a handful of "singleton" things (selection, hover, ghost, preview,
//     flashes) that are moved or animated per frame at negligible cost.
//
// Colours: the player's border is gold (0xf2c14e) and thicker; every other
// village uses its own `color` from the villages() list, so a border tells
// you whose land it is without a label.

import { HEX_SIZE, ZOOM_FAR } from "../world/constants.js";
import { HEX_DIRECTIONS, DIRECTION_TO_EDGE, hexCorners } from "../world/hexMath.js";
import { SEASON_NAMES } from "../world/terrainDefs.js";
import { ChunkGrid, chunkDistance, zoomBand, colorToNumber } from "./featureLayer.js";

const PLAYER_COLOR = 0xf2c14e;
const RIVAL_FALLBACK = 0xc0392b;
const FOG_COLOR = 0x1a222c;
const KEEP_DISTANCE = 3;
const BUILD_BUDGET = 6;
const FLASH_SECONDS = 0.6;
const IMPROVEMENT_TYPES = new Set(["farm", "lumberCamp", "quarry", "fishery", "pasture", "mine"]);
const RESOURCE_ICONS = { food: "ui/icon_food", wood: "ui/icon_wood", stone: "ui/icon_stone" };
const LENSES = new Set(["yields", "territory", "resources", "roads"]);

export class OverlayLayer {
  constructor(PIXI, atlas, world, hexMap, quality, villages) {
    this.PIXI = PIXI;
    this.atlas = atlas;
    this.world = world;
    this.hexMap = hexMap;
    this.quality = quality;
    this.villages = villages || (() => []);
    this.grid = new ChunkGrid(world, hexMap);

    this.container = new PIXI.Container();
    this.container.label = "overlay";
    // Draw order, bottom to top.
    this.lensRoot = new PIXI.Container();
    this.chunkRoot = new PIXI.Container();
    this.preview = new PIXI.Graphics();
    this.flashRoot = new PIXI.Container();
    this.ghost = new PIXI.Sprite(atlas.texture("ui/hex_fill"));
    this.ghost.visible = false;
    this.hover = new PIXI.Sprite(atlas.texture("ui/hex_outline"));
    this.hover.tint = 0xffffff;
    this.hover.alpha = 0.5;
    this.hover.visible = false;
    this.selection = this.buildSelection();
    this.selection.visible = false;
    this.container.addChild(this.lensRoot, this.chunkRoot, this.preview, this.flashRoot, this.ghost, this.hover, this.selection);

    this.chunks = new Map();
    this.dirty = new Set();
    this.lens = null;
    this.selectedId = null;
    this.hoverId = null;
    this.ghostSpec = null;
    this.roadPreviewIds = null;
    this.flashes = [];
    this.time = 0;
    this.band = -1;
    this.season = 2;
    // Frontier / seizable id sets are derived from ownership; recompute
    // lazily once per rebuild pass instead of per tile.
    this.frontierIds = null;
    this.seizableIds = null;
    this.numberTextures = new Map();
    this.colorCache = new Map();
  }

  // ---- public API --------------------------------------------------------------

  setSelected(tileId) {
    this.selectedId = tileId || null;
    const tile = this.selectedId ? this.hexMap.getTile(this.selectedId) : null;
    this.selection.visible = !!tile;
    if (tile) {
      const c = this.grid.center(tile);
      this.selection.position.set(c.x, c.y);
    }
  }

  setHover(tileId) {
    this.hoverId = tileId || null;
    const tile = this.hoverId ? this.hexMap.getTile(this.hoverId) : null;
    this.hover.visible = !!tile;
    if (tile) {
      const c = this.grid.center(tile);
      this.hover.position.set(c.x, c.y);
    }
  }

  setLens(name) {
    const next = LENSES.has(name) ? name : null;
    if (next === this.lens) return;
    this.lens = next;
    for (const chunk of this.chunks.values()) this.clearLens(chunk);
    this.markAllDirty();
  }

  setPlacementGhost(ghost) {
    this.ghostSpec = ghost || null;
    if (!ghost) {
      this.ghost.visible = false;
      return;
    }
    const tile = this.hexMap.getTile(ghost.tileId);
    if (!tile) {
      this.ghost.visible = false;
      return;
    }
    let key;
    if (IMPROVEMENT_TYPES.has(ghost.type)) {
      key = ghost.type === "farm" ? `improvement/farm_${SEASON_NAMES[this.season] || "summer"}` : `improvement/${ghost.type}`;
    } else {
      key = ghost.type === "house" ? "building/house_0" : ghost.type === "hall" ? "building/hall_0" : ghost.type === "windmill" ? "building/windmill_0" : `building/${ghost.type}`;
    }
    const texture = this.atlas.texture(key);
    this.ghost.texture = texture;
    this.ghost.anchor.copyFrom(texture.defaultAnchor || { x: 0.5, y: 1 });
    const c = this.grid.center(tile);
    this.ghost.position.set(c.x, c.y + 12);
    this.ghost.alpha = 0.6;
    this.ghost.tint = ghost.valid ? 0x88ff88 : 0xff6666;
    this.ghost.visible = true;
  }

  setRoadPreview(tileIds) {
    this.roadPreviewIds = tileIds && tileIds.length ? tileIds.slice() : null;
    this.preview.clear();
    if (!this.roadPreviewIds) return;
    const pts = [];
    for (const id of this.roadPreviewIds) {
      const tile = this.hexMap.getTile(id);
      if (tile) {
        const c = this.grid.center(tile);
        pts.push([c.x, c.y]);
      }
    }
    if (pts.length < 2) {
      if (pts.length === 1) this.preview.circle(pts[0][0], pts[0][1], 4).fill({ color: 0xffffff, alpha: 0.9 });
      return;
    }
    for (let i = 1; i < pts.length; i++) dashSegment(this.preview, pts[i - 1], pts[i], 6, 5);
    this.preview.stroke({ width: 3, color: 0xffffff, alpha: 0.9, cap: "round" });
  }

  // Optional (not in the contract): lets the ghost farm match the season.
  setSeason(season) {
    this.season = season;
    if (this.ghostSpec) this.setPlacementGhost(this.ghostSpec);
  }

  setQuality(quality) {
    this.quality = quality;
  }

  markDirty(tileIds) {
    this.frontierIds = null;
    this.seizableIds = null;
    this.colorCache.clear();
    for (const id of tileIds || []) {
      const tile = this.hexMap.getTile(id);
      if (!tile) continue;
      // Borders and fog rims are drawn by BOTH sides of an edge, so the
      // neighbours' chunks need a redraw when they differ from this one.
      this.dirty.add(this.grid.chunkOfTile(tile));
      for (const n of tile.neighbors) this.dirty.add(this.grid.chunkOfTile(n));
    }
  }

  markAllDirty() {
    this.frontierIds = null;
    this.seizableIds = null;
    this.colorCache.clear();
    for (const index of this.chunks.keys()) this.dirty.add(index);
  }

  flashTile(tileId, color = 0xffffff) {
    const tile = this.hexMap.getTile(tileId);
    if (!tile) return;
    const sprite = new this.PIXI.Sprite(this.atlas.texture("ui/hex_fill"));
    const c = this.grid.center(tile);
    sprite.position.set(c.x, c.y);
    sprite.tint = color;
    sprite.alpha = 0.75;
    this.flashRoot.addChild(sprite);
    this.flashes.push({ sprite, age: 0 });
  }

  update(camera, dt) {
    this.time += dt;
    const band = zoomBand(camera.zoom);
    if (band !== this.band) {
      this.band = band;
      this.markAllDirty();
    }
    const showDetail = camera.zoom >= ZOOM_FAR;
    this.lensRoot.visible = showDetail && !!this.lens;

    const view = this.grid.rangeFor(camera.getBounds(0), 1);
    for (const [index, chunk] of this.chunks) {
      const distance = chunkDistance(chunk.cx, chunk.cy, view);
      if (distance > KEEP_DISTANCE) this.destroyChunk(index);
      else chunk.visible = distance === 0;
      if (this.chunks.has(index)) {
        chunk.graphics.visible = chunk.visible;
        if (chunk.lens) chunk.lens.visible = chunk.visible;
      }
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

    // Selection pulse: the brackets breathe in and out around the corners.
    if (this.selection.visible) {
      const offset = 3 + 1.4 * Math.sin(this.time * 4);
      for (const b of this.brackets) {
        const px = Math.cos(b.angle) * (HEX_SIZE + offset);
        const py = Math.sin(b.angle) * (HEX_SIZE + offset);
        b.sprite.position.set(px, py);
        b.shadow.position.set(px + 1, py + 1.5);
      }
    }

    // Flashes fade out and are removed.
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += dt;
      const t = f.age / FLASH_SECONDS;
      if (t >= 1) {
        this.flashRoot.removeChild(f.sprite);
        f.sprite.destroy();
        this.flashes.splice(i, 1);
      } else {
        f.sprite.alpha = 0.75 * (1 - t) * (1 - t);
      }
    }
  }

  destroy() {
    for (const index of Array.from(this.chunks.keys())) this.destroyChunk(index);
    for (const tex of this.numberTextures.values()) tex.destroy(true);
    this.numberTextures.clear();
    this.container.destroy({ children: true });
  }

  // ---- selection ---------------------------------------------------------------------

  buildSelection() {
    const PIXI = this.PIXI;
    const root = new PIXI.Container();
    this.brackets = [];
    const texture = this.atlas.texture("ui/select_bracket");
    // Shadows first so every white bracket draws above every shadow.
    const entries = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const shadow = new PIXI.Sprite(texture);
      shadow.tint = 0x000000;
      shadow.alpha = 0.45;
      shadow.rotation = angle + Math.PI;
      root.addChild(shadow);
      entries.push({ angle, shadow });
    }
    for (const entry of entries) {
      const sprite = new PIXI.Sprite(texture);
      sprite.rotation = entry.angle + Math.PI;
      root.addChild(sprite);
      this.brackets.push({ angle: entry.angle, sprite, shadow: entry.shadow });
    }
    return root;
  }

  // ---- chunk lifecycle ----------------------------------------------------------------

  destroyChunk(index) {
    const chunk = this.chunks.get(index);
    if (!chunk) return;
    this.chunks.delete(index);
    this.chunkRoot.removeChild(chunk.graphics);
    chunk.graphics.destroy();
    this.clearLens(chunk);
  }

  clearLens(chunk) {
    if (!chunk.lens) return;
    this.lensRoot.removeChild(chunk.lens);
    chunk.lens.destroy({ children: true });
    chunk.lens = null;
  }

  ensureSets() {
    if (!this.frontierIds) this.frontierIds = new Set(this.hexMap.getFrontierTiles("player").map((t) => t.id));
    if (!this.seizableIds) this.seizableIds = new Set(this.hexMap.getSeizableTiles().map((t) => t.id));
  }

  buildChunk(cx, cy) {
    const PIXI = this.PIXI;
    this.ensureSets();
    const g = new PIXI.Graphics();
    const chunk = { cx, cy, graphics: g, lens: null, visible: true };
    const revealed = this.hexMap.mapmakingUnlocked;
    const showDetail = this.band > 0;

    const borders = new Map(); // color -> { width, segments: [] }
    const fog = [];
    const frontier = [];
    const seizable = [];
    const lensTiles = [];

    this.grid.forEachTile(cx, cy, (tile) => {
      const seen = tile.seen || revealed;
      if (!seen) return;
      const c = this.grid.center(tile);
      for (let dir = 0; dir < 6; dir++) {
        const d = HEX_DIRECTIONS[dir];
        const neighbor = this.hexMap.getTileAt(tile.q + d.q, tile.r + d.r);
        const edge = DIRECTION_TO_EDGE[dir];
        if (tile.owner && (!neighbor || neighbor.owner !== tile.owner)) {
          const color = this.colorOf(tile.owner);
          // T3: thicker borders read at far zoom (player 4, others 2.5).
          if (!borders.has(color)) borders.set(color, { width: tile.owner === "player" ? 4 : 2.5, segments: [] });
          borders.get(color).segments.push([c, edge]);
        }
        if (!revealed && neighbor && !neighbor.seen) fog.push([c, edge]);
      }
      if (showDetail) {
        if (this.frontierIds.has(tile.id)) frontier.push(c);
        else if (this.seizableIds.has(tile.id)) seizable.push([c, this.colorOf(tile.owner)]);
      }
      if (this.lens) lensTiles.push(tile);
    });

    // Fog rim first (under the borders), inset so the band sits on the seen side.
    if (fog.length) {
      for (const [c, edge] of fog) {
        const pts = hexCorners(c.x, c.y, HEX_SIZE - 3.5);
        g.moveTo(pts[edge][0], pts[edge][1]);
        g.lineTo(pts[(edge + 1) % 6][0], pts[(edge + 1) % 6][1]);
      }
      g.stroke({ width: 7, color: FOG_COLOR, alpha: 0.35, cap: "round" });
    }
    for (const [color, group] of borders) {
      const inset = group.width / 2 + 0.6;
      for (const [c, edge] of group.segments) {
        const pts = hexCorners(c.x, c.y, HEX_SIZE - inset * 1.1547);
        g.moveTo(pts[edge][0], pts[edge][1]);
        g.lineTo(pts[(edge + 1) % 6][0], pts[(edge + 1) % 6][1]);
      }
      // T3: full alpha so territory reads on bright meadows.
      g.stroke({ width: group.width, color, alpha: 1, cap: "round", join: "round" });
    }
    if (frontier.length) {
      for (const c of frontier) dashPolygon(g, hexCorners(c.x, c.y, HEX_SIZE * 0.94), 4, 3);
      g.stroke({ width: 1.5, color: 0xffffff, alpha: 0.8, cap: "round" });
    }
    for (const [c, color] of seizable) {
      dashPolygon(g, hexCorners(c.x, c.y, HEX_SIZE * 0.94), 4, 3);
      g.stroke({ width: 1.5, color, alpha: 0.9, cap: "round" });
    }

    this.chunkRoot.addChild(g);
    if (this.lens && lensTiles.length) chunk.lens = this.buildLens(lensTiles);
    if (chunk.lens) this.lensRoot.addChild(chunk.lens);
    this.chunks.set(this.grid.indexOf(cx, cy), chunk);
  }

  // ---- lenses -------------------------------------------------------------------------------

  buildLens(tiles) {
    const PIXI = this.PIXI;
    const root = new PIXI.Container();
    const fill = this.atlas.texture("ui/hex_fill");
    const lens = this.lens;
    for (const tile of tiles) {
      const c = this.grid.center(tile);
      if (lens === "territory") {
        if (!tile.owner) continue;
        // T3: 0.35 -> 0.5 so the territory lens survives daylight.
        this.addFill(root, fill, c, this.colorOf(tile.owner), 0.5);
      } else if (lens === "resources") {
        const { amount, max } = totals(tile.resources);
        if (max <= 0) continue;
        this.addFill(root, fill, c, greenToRed(amount / max), 0.35);
      } else if (lens === "roads") {
        if (tile.road) this.addFill(root, fill, c, 0x3ddc63, 0.3);
        else if (tile.owner && totals(tile.resources).amount > 0) this.addFill(root, fill, c, 0xe74c3c, 0.25);
      } else if (lens === "yields") {
        if (!tile.owner) continue;
        this.addYields(root, tile, c);
      }
    }
    return root.children.length ? root : (root.destroy(), null);
  }

  addFill(root, texture, c, color, alpha) {
    const s = new this.PIXI.Sprite(texture);
    s.position.set(c.x, c.y);
    s.tint = color;
    s.alpha = alpha;
    root.addChild(s);
  }

  // Up to three icon+number pairs across the lower half of the hex, so they
  // do not cover the building or trees standing in the upper half.
  addYields(root, tile, c) {
    const PIXI = this.PIXI;
    const entries = Object.keys(tile.resources || {})
      .map((type) => [type, tile.resources[type].amount])
      .filter(([, amount]) => amount > 0)
      .slice(0, 3);
    if (!entries.length) return;
    const step = 14;
    const startX = c.x - ((entries.length - 1) * step) / 2;
    for (let i = 0; i < entries.length; i++) {
      const [type, amount] = entries[i];
      const icon = new PIXI.Sprite(this.atlas.texture(RESOURCE_ICONS[type] || "ui/icon_grain"));
      icon.scale.set(0.8);
      icon.position.set(startX + i * step - 3.5, c.y + 10);
      root.addChild(icon);
      const number = new PIXI.Sprite(this.numberTexture(amount));
      number.anchor.set(0, 0.5);
      number.position.set(startX + i * step + 1, c.y + 10);
      root.addChild(number);
    }
  }

  // Numbers are drawn once per distinct value into a tiny canvas texture:
  // cheaper than a PIXI.Text per hex and identical on every tile.
  numberTexture(value) {
    const text = value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(Math.round(value));
    let texture = this.numberTextures.get(text);
    if (texture) return texture;
    const scale = 3;
    const canvas = document.createElement("canvas");
    const w = 4 + text.length * 5.5;
    const h = 10;
    canvas.width = Math.ceil(w * scale);
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.font = "bold 9px system-ui, Arial, sans-serif";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(20, 16, 14, 0.85)";
    ctx.strokeText(text, 1.5, h / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, 1.5, h / 2);
    const source = new this.PIXI.CanvasSource({ resource: canvas, resolution: scale, scaleMode: "linear" });
    texture = new this.PIXI.Texture({ source, label: `num:${text}` });
    this.numberTextures.set(text, texture);
    return texture;
  }

  // ---- helpers ------------------------------------------------------------------------------

  colorOf(ownerId) {
    if (ownerId === "player") return PLAYER_COLOR;
    let color = this.colorCache.get(ownerId);
    if (color !== undefined) return color;
    color = RIVAL_FALLBACK;
    for (const v of this.villages() || []) {
      if (v.id === ownerId) {
        color = colorToNumber(v.color, RIVAL_FALLBACK);
        break;
      }
    }
    this.colorCache.set(ownerId, color);
    return color;
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function totals(resources) {
  let amount = 0;
  let max = 0;
  for (const type of Object.keys(resources || {})) {
    amount += resources[type].amount || 0;
    max += resources[type].max || 0;
  }
  return { amount, max };
}

// 1 -> green, 0.5 -> yellow, 0 -> red.
function greenToRed(t) {
  const u = Math.max(0, Math.min(1, t));
  const r = u < 0.5 ? 231 : Math.round(231 + (61 - 231) * ((u - 0.5) * 2));
  const g = u < 0.5 ? Math.round(76 + (196 - 76) * (u * 2)) : 196;
  const b = u < 0.5 ? 60 : Math.round(60 + (99 - 60) * ((u - 0.5) * 2));
  return (r << 16) | (g << 8) | b;
}

// Adds dash subpaths along a segment to a Graphics (caller strokes).
function dashSegment(g, a, b, dash, gap, offset = 0) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return;
  const ux = dx / len;
  const uy = dy / len;
  for (let s = offset; s < len; s += dash + gap) {
    const e = Math.min(len, s + dash);
    if (e <= s) continue;
    g.moveTo(a[0] + ux * s, a[1] + uy * s);
    g.lineTo(a[0] + ux * e, a[1] + uy * e);
  }
}

function dashPolygon(g, pts, dash, gap) {
  for (let i = 0; i < pts.length; i++) dashSegment(g, pts[i], pts[(i + 1) % pts.length], dash, gap, 1);
}

