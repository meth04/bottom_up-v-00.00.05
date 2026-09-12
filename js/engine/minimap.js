// minimap.js
//
// The world panel in the HUD. Three layers, as in the old SVG game:
//
//   terrain    painted once into an ImageData, one tile at a time by index
//   holdings   parchment over unseen tiles, owner tints, village dots —
//              repainted only when invalidate() is called
//   the box    the camera rectangle, drawn on every draw()
//
// With 86 400 tiles the win is doing the per-tile work as integer pixel
// writes into a Uint32Array and one putImageData, instead of 86 400 path
// arcs. Each tile's pixel offset is computed once (`tilePixel`), so a
// holdings repaint is a tight loop over two typed arrays.

import { TERRAIN } from "../world/terrainDefs.js";
import { worldTileCenter } from "../world/hexMath.js";

const PARCHMENT_CSS = "#e2d2b2";
const SEA_CSS = "#4c86ad";

// Little-endian RGBA packing for a Uint32 view over ImageData.
function packCss(css, alpha = 255) {
  let hex = css.trim();
  if (hex[0] === "#") hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
  const n = parseInt(hex, 16) || 0;
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

function packNumber(n, alpha = 255) {
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

function toNumber(value, fallback) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseInt(value.replace("#", ""), 16);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

// Blends packed colour `a` toward `b` by t (0..1), per channel.
function blendPacked(a, b, t) {
  const ar = a & 0xff, ag = (a >> 8) & 0xff, ab = (a >> 16) & 0xff;
  const br = b & 0xff, bg = (b >> 8) & 0xff, bb = (b >> 16) & 0xff;
  const r = (ar + (br - ar) * t) | 0;
  const g = (ag + (bg - ag) * t) | 0;
  const bl = (ab + (bb - ab) * t) | 0;
  return ((255 << 24) | (bl << 16) | (g << 8) | r) >>> 0;
}

export class Minimap {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} world generateWorld() output (width, height, grid, cols, rows)
   * @param {import("../world/hexMap.js").HexMap} hexMap
   * @param {() => Array} villages live list ({ id, color, kind, homeTileId })
   */
  constructor(canvas, world, hexMap, villages) {
    this.canvas = canvas;
    this.world = world;
    this.hexMap = hexMap;
    this.villages = typeof villages === "function" ? villages : () => villages || [];
    this.ctx = canvas.getContext("2d");
    this.width = canvas.width;
    this.height = canvas.height;
    this.clickHandlers = [];
    this.holdingsDirty = true;
    this.terrain = null;
    this.holdings = null;
    this.lastView = null;
    this.playerColor = 0xc29339;

    this.computeProjection();
    this.buildTilePixels();
    this.buildTerrain();

    // Click / drag on the panel moves the camera there.
    this.onPointer = (ev) => {
      if (ev.type === "pointermove" && !(ev.buttons & 1)) return;
      const rect = canvas.getBoundingClientRect();
      const px = (ev.clientX - rect.left) * (this.width / rect.width);
      const py = (ev.clientY - rect.top) * (this.height / rect.height);
      const worldX = (px - this.ox) / this.scale;
      const worldY = (py - this.oy) / this.scale;
      for (const fn of this.clickHandlers) fn(worldX, worldY);
    };
    canvas.addEventListener("pointerdown", this.onPointer);
    canvas.addEventListener("pointermove", this.onPointer);
    canvas.style.touchAction = "none";
  }

  computeProjection() {
    const { width, height } = this.world;
    this.scale = Math.min(this.width / width, this.height / height);
    this.ox = (this.width - width * this.scale) / 2;
    this.oy = (this.height - height * this.scale) / 2;
  }

  /**
   * Maps every tile to a pixel offset. Tiles are denser than pixels at the
   * usual panel size, so one pixel per tile fills the world; when the panel
   * is large enough for gaps to open we stamp a 2x2 block instead.
   */
  buildTilePixels() {
    const tiles = this.hexMap.allTiles;
    const grid = this.world.grid;
    const count = this.world.cols * this.world.rows;
    this.tilePixel = new Int32Array(count).fill(-1);
    const spacing = grid.hexSize * Math.sqrt(3) * this.scale;
    this.blockSize = spacing > 1.05 ? 2 : 1;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const c = worldTileCenter(tile.q, tile.r, grid);
      const px = Math.floor(this.ox + c.x * this.scale);
      const py = Math.floor(this.oy + c.y * this.scale);
      if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
      this.tilePixel[tile.index] = py * this.width + px;
    }
  }

  stamp(pixels, offset, value) {
    pixels[offset] = value;
    if (this.blockSize === 2) {
      const x = offset % this.width;
      if (x + 1 < this.width) pixels[offset + 1] = value;
      if (offset + this.width < pixels.length) {
        pixels[offset + this.width] = value;
        if (x + 1 < this.width) pixels[offset + this.width + 1] = value;
      }
    }
  }

  /** Terrain colours, once. Kept as a Uint32Array so holdings can copy it. */
  buildTerrain() {
    const image = this.ctx.createImageData(this.width, this.height);
    const pixels = new Uint32Array(image.data.buffer);
    pixels.fill(packCss(SEA_CSS));
    const colorFor = {};
    for (const type of Object.keys(TERRAIN)) colorFor[type] = packCss(TERRAIN[type].minimap || "#b49a6e");
    const missing = packCss("#b49a6e");
    const tiles = this.hexMap.allTiles;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const offset = this.tilePixel[tile.index];
      if (offset < 0) continue;
      this.stamp(pixels, offset, colorFor[tile.terrainType] || missing);
    }
    this.terrainPixels = pixels;
    this.terrainImage = image;
    this.holdingsImage = this.ctx.createImageData(this.width, this.height);
    this.holdingsPixels = new Uint32Array(this.holdingsImage.data.buffer);
    // Offscreen canvas so the per-frame draw is one drawImage.
    this.holdings = document.createElement("canvas");
    this.holdings.width = this.width;
    this.holdings.height = this.height;
    this.holdingsCtx = this.holdings.getContext("2d");
  }

  /**
   * Fog, ownership and village dots on top of the terrain. Runs over all
   * tiles, so only on invalidate() — never per frame.
   */
  buildHoldings() {
    const hexMap = this.hexMap;
    const src = this.terrainPixels;
    const dst = this.holdingsPixels;
    dst.set(src);
    const mapmaking = hexMap.mapmakingUnlocked;
    const parchment = packCss(PARCHMENT_CSS);
    const tiles = hexMap.allTiles;
    const ownerColors = new Map();
    const ownerPacked = (owner) => {
      let packed = ownerColors.get(owner);
      if (packed === undefined) {
        let n = owner === "player" ? this.playerColor : 0x888888;
        for (const village of this.villages()) {
          if (village && village.id === owner && village.color !== undefined) { n = toNumber(village.color, n); break; }
        }
        packed = packNumber(n);
        ownerColors.set(owner, packed);
      }
      return packed;
    };
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const offset = this.tilePixel[tile.index];
      if (offset < 0) continue;
      if (!mapmaking && !tile.seen) {
        this.stamp(dst, offset, parchment);
      } else if (tile.owner) {
        this.stamp(dst, offset, blendPacked(src[offset], ownerPacked(tile.owner), 0.7));
      }
    }
    this.holdingsCtx.putImageData(this.holdingsImage, 0, 0);

    // Village dots, drawn as real circles so they read at any panel size.
    const ctx = this.holdingsCtx;
    const grid = this.world.grid;
    for (const village of this.villages()) {
      if (!village) continue;
      const home = hexMap.getTile(village.homeTileId);
      if (!home || !hexMap.isRevealed(home.id)) continue;
      const c = worldTileCenter(home.q, home.r, grid);
      const px = this.ox + c.x * this.scale;
      const py = this.oy + c.y * this.scale;
      ctx.fillStyle = village.kind === "garlock" ? "#8c1f1f" : village.kind === "player" ? "#f2c14e" : "#2a4d3a";
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    this.holdingsDirty = false;
  }

  /** Call when land changes hands, fog lifts or villages change. */
  invalidate() {
    this.holdingsDirty = true;
  }

  /**
   * Draws the panel. `view` = { x, y, zoom, bounds } from the camera; the
   * bounds rectangle is projected as the red box.
   */
  draw(view) {
    if (view) this.lastView = view;
    view = this.lastView;
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
      // The HUD resized the canvas: rebuild projections and caches.
      this.width = this.canvas.width;
      this.height = this.canvas.height;
      this.computeProjection();
      this.buildTilePixels();
      this.buildTerrain();
      this.holdingsDirty = true;
    }
    if (this.holdingsDirty) this.buildHoldings();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(this.holdings, 0, 0);
    ctx.strokeStyle = "#cbb28d";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, this.width - 1, this.height - 1);

    if (!view || !view.bounds) return;
    const b = view.bounds;
    const vx = this.ox + b.minX * this.scale;
    const vy = this.oy + b.minY * this.scale;
    const vw = (b.maxX - b.minX) * this.scale;
    const vh = (b.maxY - b.minY) * this.scale;
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

  /** @param {(worldX: number, worldY: number) => void} fn */
  onClick(fn) {
    this.clickHandlers.push(fn);
    return () => {
      const i = this.clickHandlers.indexOf(fn);
      if (i >= 0) this.clickHandlers.splice(i, 1);
    };
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this.onPointer);
    this.canvas.removeEventListener("pointermove", this.onPointer);
    this.clickHandlers.length = 0;
  }
}
