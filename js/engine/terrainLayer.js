// terrainLayer.js
//
// The ground. 86 400 hexes cannot be 86 400 sprites, so the terrain is one
// triangle mesh per 16x16 chunk (about 345 meshes for the full world),
// drawn by a small custom GLSL shader. Per hex: 7 vertices (centre + six
// corners) and 18 indices (six triangles fanned from the centre).
//
// Two vertex buffers per chunk:
//   static   aPosition (2) + aEdge (1)          built once, never touched again
//   dynamic  aColor (3) + aFlags (1)            rewritten when tiles in the
//                                               chunk change owner / fog /
//                                               season
//
// Colour is computed on the CPU when a chunk is (re)built, so the shader
// only has to do the two things that must vary per pixel or per frame: the
// hex rim (from aEdge, a cheap grid with no line geometry) and the water
// shimmer (from uTime). Culling is by chunk AABB against the camera bounds,
// and at most REBUILDS_PER_FRAME chunks are rebuilt per frame so a mapmaking
// reveal that dirties the whole world is spread over a dozen frames.

import { CHUNK_SIZE, HEX_SIZE, ZOOM_FAR } from "../world/constants.js";
import { worldTileCenter, hexCorner } from "../world/hexMath.js";
import { TERRAIN } from "../world/terrainDefs.js";

const VERTS_PER_HEX = 7;
const INDICES_PER_HEX = 18;
const REBUILDS_PER_FRAME = 6;
const PARCHMENT = 0xe2d2b2;
const OWNER_BLEND = 0.18;
const WINTER_TINT = 0xf2f5f7;
const AUTUMN_TINT = 0xd9a441;
// Ground that turns golden in autumn: anything grassy or leafy.
const AUTUMN_TYPES = new Set([
  "plains", "flowerMeadow", "hills", "overgrownHighlands", "forest", "birchWood",
  "denseBush", "timbermellowForest", "marsh", "river", "tundra",
]);
// Fallback owner colours when the owner-colour callback knows nothing.
const DEFAULT_OWNER_COLORS = { player: 0xc29339 };
const FALLBACK_OWNER = 0x8a8a8a;

// Flag bits carried per vertex as a float (the contract's bit0/bit1 plus
// bit2 so the shader can tone down the shimmer on deep water).
const FLAG_WATER = 1;
const FLAG_FOG = 2;
const FLAG_DEEP = 4;

const VERTEX_SRC = `
in vec2 aPosition;
in float aEdge;
in vec3 aColor;
in float aFlags;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform float uTime;

out vec3 vColor;
out float vEdge;
out float vFlags;
out vec2 vWave;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vColor = aColor;
  vEdge = aEdge;
  vFlags = aFlags;
  // Two slow waves, evaluated per vertex in highp (world coordinates run
  // into the tens of thousands, which a mediump fragment cannot hold) and
  // interpolated across the hex. The wavelengths (~180 and ~400 units) are
  // long next to a 42-unit hex, so the interpolation is invisible.
  float p1 = (aPosition.x * 0.035 + aPosition.y * 0.02) - uTime * 0.9;
  float p2 = (aPosition.x * 0.011 - aPosition.y * 0.016) + uTime * 0.45;
  vWave = vec2(sin(p1), sin(p2));
}
`;

const FRAGMENT_SRC = `
precision mediump float;

in vec3 vColor;
in float vEdge;
in float vFlags;
in vec2 vWave;

uniform float uRimEdge;   // aEdge below which a pixel is "rim" (set from zoom so the rim is ~1.5 px)
uniform float uRimSoft;   // half a pixel, in aEdge units, for anti-aliasing
uniform float uRimDark;   // how much the rim darkens: 0.22 grid on, 0.06 grid off (faded when far)
uniform float uWater;     // 1 = animate water, 0 = still

out vec4 finalColor;

void main() {
  vec3 c = vColor;
  float water = step(0.5, mod(vFlags, 2.0));
  float fog = step(0.5, mod(floor(vFlags / 2.0), 2.0));
  float deep = step(0.5, mod(floor(vFlags / 4.0), 2.0));

  // Moving highlight band on water (not on parchment).
  float w1 = vWave.x * 0.5 + 0.5;
  float w2 = vWave.y * 0.5 + 0.5;
  float shine = pow(w1 * w2, 3.0) * water * (1.0 - fog) * mix(0.16, 0.09, deep) * uWater;
  c += shine;

  // Hex rim: aEdge is 0 on every edge and 1 at the centre, so a threshold
  // on it is a uniform-width band along all six sides.
  float rim = 1.0 - smoothstep(uRimEdge - uRimSoft, uRimEdge + uRimSoft, vEdge);
  float darken = uRimDark * rim * (1.0 - fog * 0.55);
  c *= 1.0 - darken;

  finalColor = vec4(c, 1.0);
}
`;

function unpack(color, out) {
  out[0] = ((color >> 16) & 0xff) / 255;
  out[1] = ((color >> 8) & 0xff) / 255;
  out[2] = (color & 0xff) / 255;
  return out;
}

function lerp3(a, b, t, out) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

export class TerrainLayer {
  /**
   * @param {object} PIXI the namespace from pixi.js
   * @param {object} world generateWorld() output (grid, cols, rows, tiles)
   * @param {import("../world/hexMap.js").HexMap} hexMap
   * @param {object} quality from device.js
   */
  constructor(PIXI, world, hexMap, quality) {
    this.PIXI = PIXI;
    this.world = world;
    this.hexMap = hexMap;
    this.quality = quality || {};
    this.container = new PIXI.Container();
    this.container.label = "terrain";
    this.season = 1;
    this.gridVisible = false;
    this.ownerColorFn = null;
    this.ownerColorCache = new Map();
    this.time = 0;

    this.cols = world.cols;
    this.rows = world.rows;
    this.chunkCols = Math.ceil(this.cols / CHUNK_SIZE);
    this.chunkRows = Math.ceil(this.rows / CHUNK_SIZE);
    this.chunks = new Array(this.chunkCols * this.chunkRows);
    this.dirty = new Set();

    // Scratch arrays reused by every colour computation (no GC in rebuilds).
    this.tmpA = [0, 0, 0];
    this.tmpB = [0, 0, 0];
    this.tmpC = [0, 0, 0];
    this.parchment = unpack(PARCHMENT, [0, 0, 0]);
    this.winterTint = unpack(WINTER_TINT, [0, 0, 0]);
    this.autumnTint = unpack(AUTUMN_TINT, [0, 0, 0]);

    this.shader = this.buildShader();
    this.palette = this.buildPalette();

    const gridBounds = this.computeGridBounds();
    for (let cy = 0; cy < this.chunkRows; cy++) {
      for (let cx = 0; cx < this.chunkCols; cx++) {
        this.chunks[cy * this.chunkCols + cx] = this.buildChunk(cx, cy, gridBounds);
      }
    }
    // Colours are filled on the first update() — all chunks at once, ignoring
    // the per-frame budget — so that setOwnerColors / setSeason / markAllDirty
    // called during boot cost nothing extra instead of each re-dirtying the
    // whole world.
    this.initialFillDone = false;
    this.markAllDirty();
  }

  // ---- shader ------------------------------------------------------------------

  buildShader() {
    return this.PIXI.Shader.from({
      gl: { vertex: VERTEX_SRC, fragment: FRAGMENT_SRC, name: "terrain-hex" },
      resources: {
        terrainUniforms: {
          uTime: { value: 0, type: "f32" },
          uRimEdge: { value: 0.06, type: "f32" },
          uRimSoft: { value: 0.02, type: "f32" },
          uRimDark: { value: 0.06, type: "f32" },
          uWater: { value: this.quality.animateWater === false ? 0 : 1, type: "f32" },
        },
      },
    });
  }

  // ---- palette -----------------------------------------------------------------

  /**
   * Season-adjusted base colours per terrain type, as float triples, so the
   * per-tile work is a couple of lerps and no bit twiddling.
   */
  buildPalette() {
    const palette = {};
    for (const type of Object.keys(TERRAIN)) {
      const def = TERRAIN[type];
      const color = unpack(def.color, [0, 0, 0]);
      const alt = unpack(def.colorAlt !== undefined ? def.colorAlt : def.color, [0, 0, 0]);
      if (!def.water) {
        if (this.season === 4) {
          lerp3(color, this.winterTint, 0.55, color);
          lerp3(alt, this.winterTint, 0.55, alt);
        } else if (this.season === 3 && AUTUMN_TYPES.has(type)) {
          lerp3(color, this.autumnTint, 0.08, color);
          lerp3(alt, this.autumnTint, 0.08, alt);
        }
      } else if (def.deep) {
        // Deep ocean reads a touch darker than shallows and lakes.
        color[0] *= 0.92; color[1] *= 0.92; color[2] *= 0.94;
        alt[0] *= 0.92; alt[1] *= 0.92; alt[2] *= 0.94;
      }
      palette[type] = { color, alt, water: !!def.water, deep: !!def.deep };
    }
    palette.__missing = { color: [1, 0, 1], alt: [1, 0, 1], water: false, deep: false };
    return palette;
  }

  ownerColor(ownerId) {
    let rgb = this.ownerColorCache.get(ownerId);
    if (rgb) return rgb;
    let value = this.ownerColorFn ? this.ownerColorFn(ownerId) : null;
    if (typeof value === "string") value = parseInt(value.replace("#", ""), 16);
    if (typeof value !== "number" || Number.isNaN(value)) value = DEFAULT_OWNER_COLORS[ownerId] !== undefined ? DEFAULT_OWNER_COLORS[ownerId] : FALLBACK_OWNER;
    rgb = unpack(value, [0, 0, 0]);
    this.ownerColorCache.set(ownerId, rgb);
    return rgb;
  }

  // ---- geometry ----------------------------------------------------------------

  computeGridBounds() {
    // Used only to size things; chunk bounds come from actual vertices.
    return { hexSize: this.world.grid.hexSize || HEX_SIZE };
  }

  /**
   * Builds the static geometry of one chunk: positions, edge factor, index
   * buffer, plus an empty dynamic colour buffer, and the mesh.
   */
  buildChunk(cx, cy, gridBounds) {
    const { PIXI, hexMap, world } = this;
    const grid = world.grid;
    const size = gridBounds.hexSize;
    const tiles = [];
    const colEnd = Math.min(this.cols, (cx + 1) * CHUNK_SIZE);
    const rowEnd = Math.min(this.rows, (cy + 1) * CHUNK_SIZE);
    for (let row = cy * CHUNK_SIZE; row < rowEnd; row++) {
      for (let col = cx * CHUNK_SIZE; col < colEnd; col++) {
        const tile = hexMap.allTiles[row * this.cols + col];
        if (tile) tiles.push(tile);
      }
    }
    if (!tiles.length) return null;

    const vertexCount = tiles.length * VERTS_PER_HEX;
    const staticData = new Float32Array(vertexCount * 3);   // x, y, edge
    const dynamicData = new Float32Array(vertexCount * 4);  // r, g, b, flags
    const indices = new Uint32Array(tiles.length * INDICES_PER_HEX);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const c = worldTileCenter(tile.q, tile.r, grid);
      const base = i * VERTS_PER_HEX;
      let o = base * 3;
      staticData[o++] = c.x;
      staticData[o++] = c.y;
      staticData[o++] = 1;
      for (let k = 0; k < 6; k++) {
        const corner = hexCorner(c.x, c.y, size, k);
        staticData[o++] = corner[0];
        staticData[o++] = corner[1];
        staticData[o++] = 0;
        if (corner[0] < minX) minX = corner[0];
        if (corner[0] > maxX) maxX = corner[0];
        if (corner[1] < minY) minY = corner[1];
        if (corner[1] > maxY) maxY = corner[1];
      }
      let io = i * INDICES_PER_HEX;
      for (let k = 0; k < 6; k++) {
        indices[io++] = base;
        indices[io++] = base + 1 + k;
        indices[io++] = base + 1 + ((k + 1) % 6);
      }
    }

    const staticBuffer = new PIXI.Buffer({
      data: staticData,
      usage: PIXI.BufferUsage.VERTEX | PIXI.BufferUsage.COPY_DST,
      label: `terrain-static-${cx}-${cy}`,
    });
    const dynamicBuffer = new PIXI.Buffer({
      data: dynamicData,
      usage: PIXI.BufferUsage.VERTEX | PIXI.BufferUsage.COPY_DST,
      label: `terrain-dynamic-${cx}-${cy}`,
    });
    const geometry = new PIXI.Geometry({
      attributes: {
        aPosition: { buffer: staticBuffer, format: "float32x2", stride: 12, offset: 0 },
        aEdge: { buffer: staticBuffer, format: "float32", stride: 12, offset: 8 },
        aColor: { buffer: dynamicBuffer, format: "float32x3", stride: 16, offset: 0 },
        aFlags: { buffer: dynamicBuffer, format: "float32", stride: 16, offset: 12 },
      },
      indexBuffer: indices,
    });
    const mesh = new PIXI.Mesh({ geometry, shader: this.shader });
    mesh.label = `chunk-${cx}-${cy}`;
    // We cull ourselves; Pixi must not spend time measuring these.
    mesh.cullable = false;
    this.container.addChild(mesh);

    return { cx, cy, tiles, mesh, geometry, dynamicBuffer, dynamicData, minX, minY, maxX, maxY, visible: true };
  }

  /**
   * Writes colour + flags for every hex of a chunk into its dynamic buffer
   * and uploads it. This is the only per-tile work the layer ever does
   * after boot, and only for dirty chunks.
   */
  fillColors(chunk) {
    const data = chunk.dynamicData;
    const tiles = chunk.tiles;
    const mapmaking = this.hexMap.mapmakingUnlocked;
    const palette = this.palette;
    const tmpA = this.tmpA;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const def = palette[tile.terrainType] || palette.__missing;
      const seed = tile.detailSeed >>> 0;
      let flags = def.water ? FLAG_WATER : 0;
      if (def.deep) flags |= FLAG_DEEP;
      let r, g, b;
      if (!tile.seen && !mapmaking) {
        // Blank paper. A whisper of the same per-hex noise keeps it from
        // looking like a flat texture fill.
        flags |= FLAG_FOG;
        const noise = 1 + ((((seed >>> 8) & 0xff) / 255) - 0.5) * 0.03;
        r = this.parchment[0] * noise;
        g = this.parchment[1] * noise;
        b = this.parchment[2] * noise;
      } else {
        // Mix colour/colorAlt by the low byte of the seed, then +-3 %
        // brightness from the next byte.
        const mix = (seed & 0xff) / 255;
        lerp3(def.color, def.alt, mix, tmpA);
        const noise = 1 + ((((seed >>> 8) & 0xff) / 255) - 0.5) * 0.06;
        r = tmpA[0] * noise;
        g = tmpA[1] * noise;
        b = tmpA[2] * noise;
        if (tile.owner) {
          const oc = this.ownerColor(tile.owner);
          r += (oc[0] - r) * OWNER_BLEND;
          g += (oc[1] - g) * OWNER_BLEND;
          b += (oc[2] - b) * OWNER_BLEND;
        }
      }
      let o = i * VERTS_PER_HEX * 4;
      for (let k = 0; k < VERTS_PER_HEX; k++) {
        data[o++] = r;
        data[o++] = g;
        data[o++] = b;
        data[o++] = flags;
      }
    }
    chunk.dynamicBuffer.update();
  }

  // ---- public API --------------------------------------------------------------

  chunkIndexOf(tile) {
    return Math.floor(tile.row / CHUNK_SIZE) * this.chunkCols + Math.floor(tile.col / CHUNK_SIZE);
  }

  /** Queues the chunks containing these tiles for a colour rebuild. */
  markDirty(tileIds) {
    if (!tileIds) return;
    for (const id of tileIds) {
      const tile = typeof id === "string" ? this.hexMap.getTile(id) : id;
      if (tile) this.dirty.add(this.chunkIndexOf(tile));
    }
  }

  markAllDirty() {
    this.ownerColorCache.clear();
    for (let i = 0; i < this.chunks.length; i++) if (this.chunks[i]) this.dirty.add(i);
  }

  setSeason(season) {
    const next = Math.max(1, Math.min(4, season | 0)) || 1;
    if (next === this.season) return;
    this.season = next;
    this.palette = this.buildPalette();
    this.markAllDirty();
  }

  setGrid(visible) {
    this.gridVisible = !!visible;
  }

  setOwnerColors(fn) {
    this.ownerColorFn = typeof fn === "function" ? fn : null;
    this.ownerColorCache.clear();
    this.markAllDirty();
  }

  setQuality(quality) {
    this.quality = quality || this.quality;
    this.shader.resources.terrainUniforms.uniforms.uWater = this.quality.animateWater === false ? 0 : 1;
  }

  /**
   * Per frame: culls chunks, updates shader uniforms, rebuilds a few dirty
   * chunks (visible ones first).
   */
  update(camera, dt) {
    this.time += dt > 0 ? Math.min(dt, 0.1) : 0;
    const zoom = camera.zoom;
    const bounds = camera.getBounds(HEX_SIZE);
    const chunks = this.chunks;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;
      const visible = chunk.maxX >= bounds.minX && chunk.minX <= bounds.maxX
        && chunk.maxY >= bounds.minY && chunk.minY <= bounds.maxY;
      if (visible !== chunk.visible) {
        chunk.visible = visible;
        chunk.mesh.visible = visible;
      }
    }

    // Rim geometry from the zoom so the line is ~1.5 screen px wide and
    // anti-aliased over one pixel whatever the zoom. aEdge runs 0..1 over
    // the apothem (hexSize * sqrt(3)/2 world units).
    const apothem = (this.world.grid.hexSize || HEX_SIZE) * 0.8660254;
    const pxToEdge = 1 / (zoom * apothem);
    const rimPx = this.gridVisible ? 1.5 : 1.0;
    const u = this.shader.resources.terrainUniforms.uniforms;
    u.uTime = this.time;
    u.uRimEdge = Math.min(0.35, rimPx * pxToEdge);
    u.uRimSoft = Math.min(0.2, 0.6 * pxToEdge);
    // Far out the rim would be sub-pixel noise: fade it toward nothing.
    const farFade = Math.max(0, Math.min(1, (zoom - ZOOM_FAR * 0.5) / (ZOOM_FAR * 0.7)));
    u.uRimDark = (this.gridVisible ? 0.22 : 0.06) * (0.35 + 0.65 * farFade);
    this.shader.resources.terrainUniforms.update();

    if (this.dirty.size) this.rebuildDirty();
  }

  rebuildDirty() {
    if (!this.initialFillDone) {
      // First frame: everything, synchronously, so no chunk is ever shown
      // with the zeroed (black) colour buffer.
      this.initialFillDone = true;
      for (const index of this.dirty) {
        const chunk = this.chunks[index];
        if (chunk) this.fillColors(chunk);
      }
      this.dirty.clear();
      return;
    }
    let budget = REBUILDS_PER_FRAME;
    // Visible chunks first: the player is looking at them.
    for (const index of this.dirty) {
      if (budget <= 0) return;
      const chunk = this.chunks[index];
      if (!chunk) { this.dirty.delete(index); continue; }
      if (!chunk.visible) continue;
      this.fillColors(chunk);
      this.dirty.delete(index);
      budget--;
    }
    for (const index of this.dirty) {
      if (budget <= 0) return;
      const chunk = this.chunks[index];
      if (chunk) this.fillColors(chunk);
      this.dirty.delete(index);
      budget--;
    }
  }

  destroy() {
    for (const chunk of this.chunks) {
      if (!chunk) continue;
      chunk.mesh.destroy();
      chunk.geometry.destroy(true);
    }
    this.chunks.length = 0;
    this.dirty.clear();
    this.shader.destroy();
    this.container.destroy({ children: true });
  }
}
