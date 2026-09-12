// atlas.js
//
// The procedural texture atlas: every sprite the engine draws (trees,
// mountains, buildings, units, weather particles, UI markers) is painted
// with Canvas 2D at boot into a few 2048x2048 pages and handed out as
// PixiJS textures. There are no image files in the project at all.
//
// Why procedural? The art is tiny (a tree is 18x26 units), it must scale
// with the device pixel ratio without blurring, and everybody working on
// the game can change a colour without an image editor. Drawing ~250
// sprites takes well under 100 ms, which is cheaper than fetching a PNG.
//
// Style: flat "Civilization VI" look. Saturated fills, a thin dark outline
// (1 unit at nominal size), simple geometry, two-tone shading (light comes
// from the top-left, so the right and bottom faces are darker). Anything
// that stands on the ground is anchored at its bottom-centre so a layer
// can place it at a ground point and y-sort it; flat things (rocks, waves,
// UI hexes, particles) are anchored at their centre.
//
// Sizes are in WORLD UNITS (see the table in docs/ARCHITECTURE.md). The
// canvas is drawn at `scale` x those units and the texture source is
// given `resolution = scale`, so a sprite of a 30x30 texture measures
// 30x30 world units on screen at zoom 1 but keeps crisp pixels up to 2x.

import { HEX_SIZE } from "../world/constants.js";
import { createRandom, hexCorners } from "../world/hexMath.js";
import { LANDMARK_TYPES } from "../world/terrainDefs.js";

const TAU = Math.PI * 2;
const PAGE_SIZE = 2048;
// Transparent gutter around every sprite (in units) so linear filtering and
// the first mip levels never sample a neighbour's pixels.
const PAD = 2;

// The ink every outline uses. A warm near-black reads softer than pure
// black on the saturated fills and keeps the whole atlas in one palette.
const INK = "#2a2420";
const LINE = 1;

const BOTTOM = { x: 0.5, y: 1 };
const CENTER = { x: 0.5, y: 0.5 };

// ---------------------------------------------------------------------------
// Colour helpers (all colours are "#rrggbb" strings while drawing)
// ---------------------------------------------------------------------------

function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexOf(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

// t < 0 darkens toward black, t > 0 lightens toward white.
function shade(hex, t) {
  const [r, g, b] = rgbOf(hex);
  if (t < 0) return hexOf(r * (1 + t), g * (1 + t), b * (1 + t));
  return hexOf(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}

function mix(a, b, t) {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return hexOf(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

function rgba(hex, alpha) {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Shape vocabulary. Every helper fills a shape and (unless `outline` is
// null) strokes its outline in INK. Keeping the outline logic in one place
// is what makes the atlas look like one hand drew it.
// ---------------------------------------------------------------------------

function tracePoly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function finish(ctx, fill, outline = INK, width = LINE) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (outline) {
    ctx.lineWidth = width;
    ctx.strokeStyle = outline;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

function poly(ctx, pts, fill, outline = INK, width = LINE) {
  tracePoly(ctx, pts);
  finish(ctx, fill, outline, width);
}

function circle(ctx, x, y, r, fill, outline = INK, width = LINE) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  finish(ctx, fill, outline, width);
}

function ellipse(ctx, x, y, rx, ry, fill, outline = INK, width = LINE, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  finish(ctx, fill, outline, width);
}

function rect(ctx, x, y, w, h, fill, outline = INK, width = LINE) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  finish(ctx, fill, outline, width);
}

function rrect(ctx, x, y, w, h, r, fill, outline = INK, width = LINE) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  finish(ctx, fill, outline, width);
}

function line(ctx, x0, y0, x1, y1, color = INK, width = LINE, cap = "round") {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = cap;
  ctx.stroke();
}

function polyline(ctx, pts, color = INK, width = LINE, cap = "round") {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = cap;
  ctx.lineJoin = "round";
  ctx.stroke();
}

// A "blob" is the union of several shapes drawn as ONE object: a single
// outer outline (no seams where the shapes overlap), a darker crescent on
// the lower-right and a small highlight on the upper-left. Tree canopies,
// bushes, clouds of smoke and hills are all blobs.
//   shapes: [{ t: "c", x, y, r } | { t: "e", x, y, rx, ry } | { t: "p", pts }]
function traceShape(ctx, s) {
  if (s.t === "c") {
    ctx.moveTo(s.x + s.r, s.y);
    ctx.arc(s.x, s.y, s.r, 0, TAU);
  } else if (s.t === "e") {
    ctx.moveTo(s.x + s.rx, s.y);
    ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, TAU);
  } else {
    ctx.moveTo(s.pts[0][0], s.pts[0][1]);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0], s.pts[i][1]);
    ctx.closePath();
  }
}

function traceShapes(ctx, shapes, dx = 0, dy = 0) {
  ctx.beginPath();
  for (const s of shapes) {
    if (dx || dy) {
      ctx.save();
      ctx.translate(dx, dy);
      traceShape(ctx, s);
      ctx.restore();
    } else {
      traceShape(ctx, s);
    }
  }
}

function blob(ctx, shapes, fill, opts = {}) {
  const dark = opts.dark || shade(fill, -0.22);
  const light = opts.light || shade(fill, 0.22);
  const dx = opts.dx === undefined ? 1.6 : opts.dx;
  const dy = opts.dy === undefined ? 1.6 : opts.dy;
  const outline = opts.outline === undefined ? INK : opts.outline;
  // Outline first, as a fat stroke; the fills then cover its inner half,
  // leaving a clean 1-unit rim around the union only.
  if (outline) {
    traceShapes(ctx, shapes);
    ctx.lineWidth = LINE * 2;
    ctx.strokeStyle = outline;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.save();
  traceShapes(ctx, shapes);
  ctx.clip();
  ctx.fillStyle = dark;
  ctx.fillRect(-500, -500, 1000, 1000);
  // The mid tone is the union shifted up-left: what it fails to cover is
  // the lower-right crescent, which stays dark.
  traceShapes(ctx, shapes, -dx, -dy);
  ctx.fillStyle = fill;
  ctx.fill();
  if (opts.highlight) {
    const h = opts.highlight;
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, h.rx, h.ry, 0, 0, TAU);
    ctx.fillStyle = light;
    ctx.fill();
  }
  ctx.restore();
}

// A soft radial disc (for clouds, glows, shadows and smoke): no outline.
function softDisc(ctx, x, y, rx, ry, color, alphaCenter, stop = 0.55) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, rgba(color, alphaCenter));
  g.addColorStop(stop, rgba(color, alphaCenter * 0.75));
  g.addColorStop(1, rgba(color, 0));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function rand(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

// ---------------------------------------------------------------------------
// Sprite registry
// ---------------------------------------------------------------------------

const SPRITES = [];

function def(key, w, h, anchor, draw) {
  SPRITES.push({ key, w, h, anchor, draw, variant: 0 });
}

function defVariants(base, count, w, h, anchor, draw) {
  for (let i = 0; i < count; i++) {
    SPRITES.push({ key: `${base}_${i}`, w, h, anchor, draw, variant: i });
  }
}

// ---- Palette ---------------------------------------------------------------

const TRUNK = "#6b4423";
const TRUNK_DARK = "#4a2e17";
const STONE = "#9a958d";
const STONE_DARK = "#6b6660";
const STONE_LIGHT = "#c2bdb4";
const WOOD = "#a8763e";
const WOOD_DARK = "#7a5228";
const WALL = "#ecdfc2";
const WALL_DARK = "#cbb891";
const THATCH = "#c8a24e";
const WATER = "#5aa9cf";
const WATER_LIGHT = "#9fd3ea";
const SKIN = "#f2c9a2";
const SNOW = "#f7fafc";
const SNOW_SHADE = "#c9d6e2";

// ===========================================================================
// DECOR
// ===========================================================================

function drawTrunk(ctx, x, top, bottom, w, color = TRUNK) {
  rrect(ctx, x - w / 2, top, w, bottom - top, w * 0.3, color);
}

// Broadleaf: a cluster of three round crowns on a short trunk.
defVariants("decor/tree_broad", 4, 18, 26, BOTTOM, (ctx, w, h, v, rng) => {
  const greens = ["#4f9a3c", "#479334", "#57a344", "#4a8f3a"];
  const g = greens[v];
  drawTrunk(ctx, 9, 15, 25.5, 3);
  const spread = rand(rng, 0.9, 1.1);
  blob(ctx, [
    { t: "c", x: 9, y: 10, r: 7 },
    { t: "c", x: 4.5 * spread + 9 * (1 - spread), y: 14, r: 4.6 },
    { t: "c", x: 13.5, y: 13.5, r: 4.4 },
    { t: "c", x: 8, y: 5.5, r: 4.2 },
  ], g, { highlight: { x: 6.5, y: 7, rx: 2.6, ry: 1.8 } });
});

// Pine: three stacked triangles, the right half of each in shadow.
defVariants("decor/tree_pine", 4, 18, 26, BOTTOM, (ctx, w, h, v, rng) => {
  const greens = ["#2f6b45", "#2a6340", "#35714a", "#2c6742"];
  const g = greens[v];
  const dark = shade(g, -0.25);
  drawTrunk(ctx, 9, 18, 25.5, 3, TRUNK_DARK);
  const tiers = [
    { y: 20, wy: 8, top: 12 },
    { y: 14.5, wy: 6.6, top: 6.5 },
    { y: 9, wy: 5, top: 1.5 },
  ];
  // Outline pass first, fills after, so tiers overlap without seams.
  for (const t of tiers) poly(ctx, [[9 - t.wy, t.y], [9, t.top], [9 + t.wy, t.y]], null, INK, LINE * 2);
  for (const t of tiers) {
    poly(ctx, [[9 - t.wy, t.y], [9, t.top], [9 + t.wy, t.y]], g, null);
    poly(ctx, [[9, t.top], [9 + t.wy, t.y], [9, t.y]], dark, null);
  }
  // A single light rim on the left edge of the top tier reads as sunlight.
  line(ctx, 8.8, 2.4, 4.9, 8.6, shade(g, 0.35), 1);
  void rng;
});

// Birch: a slender pale trunk with dark marks, a tall light-green crown.
defVariants("decor/tree_birch", 3, 18, 26, BOTTOM, (ctx, w, h, v, rng) => {
  const greens = ["#9cc44f", "#93bd48", "#a6cb58"];
  const g = greens[v];
  rrect(ctx, 8, 12, 2.4, 13.5, 0.8, "#efe8da");
  for (let i = 0; i < 3; i++) line(ctx, 8.3, 14.5 + i * 3.5 + rng() * 1.2, 10.1, 15.2 + i * 3.5, "#4a4238", 0.8);
  blob(ctx, [
    { t: "e", x: 9, y: 8.5, rx: 5.2, ry: 7.5 },
    { t: "c", x: 6, y: 11, r: 3.4 },
    { t: "c", x: 12.2, y: 10.5, r: 3.2 },
  ], g, { highlight: { x: 7, y: 5, rx: 2, ry: 2.6 } });
});

// Timbermellow: the game's food tree. Round crown and visible orange fruit.
defVariants("decor/tree_timbermellow", 3, 18, 26, BOTTOM, (ctx, w, h, v, rng) => {
  const greens = ["#5fae48", "#58a643", "#66b64e"];
  const g = greens[v];
  drawTrunk(ctx, 9, 16, 25.5, 3.2);
  blob(ctx, [
    { t: "c", x: 9, y: 10, r: 7.6 },
    { t: "c", x: 4.6, y: 13, r: 4 },
    { t: "c", x: 13.4, y: 13, r: 4 },
  ], g, { highlight: { x: 6.5, y: 6.5, rx: 2.6, ry: 2 } });
  const fruit = [[6, 9], [11.5, 7.5], [9.5, 13], [13.5, 11.5], [4.5, 13.5]];
  for (let i = 0; i < 4 + (v % 2); i++) {
    const [fx, fy] = fruit[i];
    circle(ctx, fx + rand(rng, -0.6, 0.6), fy + rand(rng, -0.6, 0.6), 1.4, "#ff8a1f", "#8a3c0a", 0.6);
  }
});

defVariants("decor/bush", 3, 12, 10, BOTTOM, (ctx, w, h, v) => {
  const g = ["#3f8a38", "#458f3a", "#3a7f33"][v];
  blob(ctx, [
    { t: "c", x: 6, y: 5.5, r: 4 },
    { t: "c", x: 2.8, y: 6.8, r: 2.7 },
    { t: "c", x: 9.2, y: 6.6, r: 2.9 },
  ], g, { dx: 1.2, dy: 1.2, highlight: { x: 4.6, y: 3.8, rx: 1.6, ry: 1 } });
});

// Grass tufts have no outline: at their size an outline would read as a
// black scribble. A darker green than the plains fill is enough.
defVariants("decor/grass", 3, 10, 8, BOTTOM, (ctx, w, h, v, rng) => {
  const g = ["#7c9a3e", "#849f45", "#6f8f38"][v];
  const blades = 4 + v;
  for (let i = 0; i < blades; i++) {
    const x = 1.5 + (i / (blades - 1)) * 7;
    const lean = rand(rng, -1.6, 1.6);
    line(ctx, x, 7.8, x + lean, 7.8 - rand(rng, 3.5, 6.5), g, 1.1);
  }
});

defVariants("decor/flower", 3, 10, 10, BOTTOM, (ctx, w, h, v, rng) => {
  const petal = ["#f06aa8", "#ffd23f", "#f8f8f8"][v];
  line(ctx, 5, 9.8, 5, 5.5, "#4c8a34", 1);
  line(ctx, 5, 7.5, 3.2, 6.8, "#4c8a34", 1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rng() * 0.2;
    circle(ctx, 5 + Math.cos(a) * 1.9, 4.2 + Math.sin(a) * 1.9, 1.35, petal, null);
  }
  circle(ctx, 5, 4.2, 1.1, v === 1 ? "#e5641f" : "#ffcc33", null);
});

defVariants("decor/reed", 2, 10, 14, BOTTOM, (ctx, w, h, v, rng) => {
  for (let i = 0; i < 3; i++) {
    const x = 2.5 + i * 2.5;
    const top = 2 + rng() * 3 + (v ? 1 : 0);
    line(ctx, x, 13.5, x + 0.6, top + 2, "#7f9b3a", 1.1);
    rrect(ctx, x - 0.6 + 0.3, top - 0.5, 1.5, 3, 0.7, "#6b4a24", null);
  }
});

defVariants("decor/cactus", 2, 12, 14, BOTTOM, (ctx, w, h, v) => {
  const g = "#4f9a4a";
  const dark = shade(g, -0.25);
  // Outline pass then fills so the arms merge with the column.
  const parts = [
    { t: "p", pts: [[4.6, 13.5], [4.6, 3], [7.4, 3], [7.4, 13.5]] },
    { t: "p", pts: [[1.5, 6 + v], [1.5, 9 + v], [4.8, 9 + v], [4.8, 7.3 + v]] },
    { t: "p", pts: [[10.5, 4.5], [10.5, 8], [7.2, 8], [7.2, 6.3]] },
  ];
  blob(ctx, parts, g, { dark, dx: 0.9, dy: 0 });
  // Rounded tops: draw small caps over the square ends.
  ellipse(ctx, 6, 3, 1.4, 1.1, g, INK);
  ellipse(ctx, 1.5, 6 + v, 1.0, 0.8, g, INK);
  ellipse(ctx, 10.5, 4.5, 1.0, 0.8, g, INK);
  line(ctx, 6, 5, 6, 12, dark, 0.8);
});

// Flat rocks: an angular polygon, lit face on the left, shaded face right.
function drawRock(ctx, cx, cy, size, rng, lightColor = STONE_LIGHT, midColor = STONE, darkColor = STONE_DARK) {
  const n = 6;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI * 0.8;
    const r = size * rand(rng, 0.75, 1.05);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.62]);
  }
  poly(ctx, pts, midColor);
  // Right/bottom half in shade: the polygon's vertices to the right of the centre.
  const ridge = [[cx - size * 0.15, cy - size * 0.55], [cx + size * 0.1, cy + size * 0.1]];
  const shadePts = [ridge[0], ...pts.filter((p) => p[0] > cx - size * 0.1 && p[1] > cy - size * 0.5), ridge[1]];
  if (shadePts.length > 3) poly(ctx, shadePts, darkColor, null);
  poly(ctx, [[cx - size * 0.55, cy - size * 0.05], [cx - size * 0.2, cy - size * 0.55], [cx + size * 0.05, cy - size * 0.25]], lightColor, null);
  poly(ctx, pts, null, INK);
}

defVariants("decor/rock", 3, 12, 8, CENTER, (ctx, w, h, v, rng) => {
  drawRock(ctx, 6, 4.4, 4.2 + v * 0.5, rng);
});

defVariants("decor/boulder", 2, 16, 12, CENTER, (ctx, w, h, v, rng) => {
  drawRock(ctx, 8, 6.4, 6.5 + v * 0.6, rng);
  circle(ctx, 4 + v * 2, 8.5, 1, "#7f9b5a", null);
});

defVariants("decor/snowdrift", 2, 18, 8, CENTER, (ctx, w, h, v) => {
  poly(ctx, [[1, 7], [4, 3.5 - v * 0.6], [9, 1.5], [14, 3], [17, 7]], SNOW, "#a9b9c8", 0.8);
  poly(ctx, [[9, 1.5], [14, 3], [17, 7], [9, 7]], SNOW_SHADE, null);
});

defVariants("decor/dune", 2, 20, 8, CENTER, (ctx, w, h, v) => {
  const sand = "#f0d89a";
  const dark = "#cdb070";
  poly(ctx, [[0.5, 7.5], [5 + v, 2], [11, 1.2], [19.5, 7.5]], sand, "#b39558", 0.8);
  poly(ctx, [[11, 1.2], [19.5, 7.5], [8, 7.5]], dark, null);
});

defVariants("decor/pool", 2, 16, 10, CENTER, (ctx, w, h, v) => {
  ellipse(ctx, 8, 5, 7 + v * 0.4, 3.8, "#4f97bb", "#3a7d9e", 1);
  ellipse(ctx, 6.8, 4, 3, 1.3, "#8bc7e0", null);
});

// Waves: two white arcs, drawn with alpha so they sit lightly on the water.
defVariants("decor/wave", 3, 14, 6, CENTER, (ctx, w, h, v) => {
  ctx.globalAlpha = 0.85;
  const y = 3;
  const len = 9 + v * 1.5;
  ctx.beginPath();
  ctx.moveTo(1, y + 1);
  ctx.quadraticCurveTo(1 + len * 0.25, y - 2, 1 + len * 0.5, y + 1);
  ctx.quadraticCurveTo(1 + len * 0.75, y + 3, 1 + len, y);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "#e8f6fb";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.globalAlpha = 1;
});

def("decor/ice", 16, 10, CENTER, (ctx) => {
  poly(ctx, [[1, 5], [4, 1.5], [12, 1], [15, 4.5], [11, 9], [4, 8.5]], "#dbeef8", "#8fb7cf", 0.9);
  poly(ctx, [[12, 1], [15, 4.5], [11, 9], [8, 5]], "#b9d9ec", null);
  line(ctx, 5, 3, 9, 6, "#ffffff", 0.8);
});

// Hills: one big rounded mound; a second smaller one behind for variety.
defVariants("decor/hill", 3, 40, 26, BOTTOM, (ctx, w, h, v) => {
  const g = ["#9fbe5a", "#a5c35f", "#98b855"][v];
  const dark = shade(g, -0.24);
  const light = shade(g, 0.18);
  const draw = (cx, base, rx, ry) => {
    ctx.beginPath();
    ctx.ellipse(cx, base, rx, ry, 0, Math.PI, TAU);
    ctx.closePath();
    finish(ctx, g, INK, LINE);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, base, rx, ry, 0, Math.PI, TAU);
    ctx.clip();
    // Shaded right face: the same mound shifted left leaves a dark crescent.
    ctx.fillStyle = dark;
    ctx.fillRect(cx, base - ry - 1, rx + 2, ry + 2);
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.18, base, rx, ry, 0, Math.PI, TAU);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.3, base - ry * 0.55, rx * 0.35, ry * 0.25, 0, 0, TAU);
    ctx.fillStyle = light;
    ctx.fill();
    ctx.restore();
  };
  if (v !== 1) draw(27, 25.5, 12, 11);
  draw(17 + (v === 2 ? 3 : 0), 25.5, 16, 15);
});

// Mountains: a big grey peak with a darker right face and a smaller
// shoulder peak on the left. `snow` adds a white cap with a jagged edge.
function drawMountain(ctx, v, snow) {
  const light = ["#a29d95", "#9d9890", "#a7a29a"][v];
  const dark = shade(light, -0.34);
  const peakX = 23 + (v - 1) * 2;
  const main = [[2, 39.5], [peakX, 3], [42, 39.5]];
  const shoulder = [[0.5, 39.5], [11, 16], [22, 39.5]];
  const shoulder2 = [[24, 39.5], [34, 20], [43.5, 39.5]];
  // Outlines first (fat), fills on top, so overlapping peaks share one rim.
  for (const p of [shoulder, shoulder2, main]) poly(ctx, p, null, INK, LINE * 2);
  poly(ctx, shoulder2, light, null);
  poly(ctx, [[34, 20], [43.5, 39.5], [34, 39.5]], dark, null);
  poly(ctx, shoulder, light, null);
  poly(ctx, [[11, 16], [22, 39.5], [11, 39.5]], dark, null);
  poly(ctx, main, light, null);
  poly(ctx, [[peakX, 3], [42, 39.5], [peakX + 1, 39.5]], dark, null);
  // Ridge lines give the flat faces some rock texture.
  line(ctx, peakX, 3, peakX + 1, 39.5, shade(dark, -0.25), 0.8);
  line(ctx, peakX - 4, 14, peakX - 9, 26, shade(light, -0.15), 0.8);
  if (snow) {
    const capY = 15;
    const cap = [[peakX, 3], [peakX + 6, capY - 3], [peakX + 4, capY], [peakX + 8, capY + 3], [peakX, capY + 1], [peakX - 4, capY + 2], [peakX - 6, capY - 3]];
    poly(ctx, cap, SNOW, INK, 0.8);
    poly(ctx, [[peakX, 3], [peakX + 6, capY - 3], [peakX + 4, capY], [peakX + 8, capY + 3], [peakX, capY + 1]], SNOW_SHADE, null);
    line(ctx, peakX, 3, peakX, capY + 1, "#ffffff", 0.7);
  }
}

defVariants("decor/mountain", 3, 44, 40, BOTTOM, (ctx, w, h, v) => drawMountain(ctx, v, false));
defVariants("decor/mountain_snow", 3, 44, 40, BOTTOM, (ctx, w, h, v) => drawMountain(ctx, v, true));

def("decor/cliff", 26, 24, BOTTOM, (ctx) => {
  const face = "#a08c74";
  const top = "#b9a98d";
  const dark = shade(face, -0.3);
  poly(ctx, [[2, 23.5], [2, 9], [8, 6], [14, 8], [22, 4], [24, 23.5]], face);
  poly(ctx, [[14, 8], [22, 4], [24, 23.5], [16, 23.5]], dark, null);
  poly(ctx, [[2, 9], [8, 6], [14, 8], [22, 4], [18, 2.5], [10, 3.5], [4, 6]], top, INK);
  line(ctx, 7, 12, 6, 20, dark, 0.8);
  line(ctx, 11, 10, 12, 19, dark, 0.8);
  circle(ctx, 5, 8.5, 1.5, "#7fa04a", null);
});

def("decor/palm", 24, 30, BOTTOM, (ctx) => {
  // A curved trunk: three short segments.
  polyline(ctx, [[10, 29.5], [11, 22], [13, 15], [16, 9]], INK, 4.2);
  polyline(ctx, [[10, 29.5], [11, 22], [13, 15], [16, 9]], "#a87a45", 2.4);
  const g = "#3f9a45";
  const fronds = [[-1, -0.4], [-0.75, 0.55], [0.15, -0.95], [0.9, -0.2], [0.75, 0.7]];
  for (const [dx, dy] of fronds) {
    const ex = 16 + dx * 8;
    const ey = 9 + dy * 6;
    ctx.beginPath();
    ctx.moveTo(16, 9);
    ctx.quadraticCurveTo(16 + dx * 5, 9 + dy * 5 - 3, ex, ey + 2);
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = INK;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  for (const [dx, dy] of fronds) {
    const ex = 16 + dx * 8;
    const ey = 9 + dy * 6;
    ctx.beginPath();
    ctx.moveTo(16, 9);
    ctx.quadraticCurveTo(16 + dx * 5, 9 + dy * 5 - 3, ex, ey + 2);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = dx < 0.2 ? shade(g, 0.15) : shade(g, -0.2);
    ctx.stroke();
  }
  circle(ctx, 15, 10.5, 1.2, "#6b4423", INK, 0.6);
  circle(ctx, 17.4, 11, 1.2, "#6b4423", INK, 0.6);
});

def("decor/dead_tree", 18, 26, BOTTOM, (ctx) => {
  const bark = "#8b7a68";
  polyline(ctx, [[9, 25.5], [9, 14], [8, 6]], INK, 4);
  polyline(ctx, [[9, 16], [4, 10], [3, 6]], INK, 3);
  polyline(ctx, [[9, 12], [14, 8], [15, 4]], INK, 3);
  polyline(ctx, [[8.5, 9], [12, 6]], INK, 2.4);
  polyline(ctx, [[9, 25.5], [9, 14], [8, 6]], bark, 2.2);
  polyline(ctx, [[9, 16], [4, 10], [3, 6]], bark, 1.4);
  polyline(ctx, [[9, 12], [14, 8], [15, 4]], bark, 1.4);
  polyline(ctx, [[8.5, 9], [12, 6]], bark, 1);
});

// ===========================================================================
// LANDMARKS (32x32, bottom anchored)
// ===========================================================================

const LANDMARK_DRAWERS = {
  standingStones(ctx) {
    const stones = [[6, 30, 5, 13], [13, 31, 4.5, 16], [21, 31, 5, 15], [27, 29, 4, 11], [16, 24, 12, 3.5]];
    for (const [x, base, sw, sh] of stones.slice(0, 4)) {
      poly(ctx, [[x - sw / 2, base], [x - sw / 2 + 0.5, base - sh], [x + sw / 2 - 0.5, base - sh + 1], [x + sw / 2, base]], STONE);
      poly(ctx, [[x + sw / 2 - 2, base - sh + 1.4], [x + sw / 2 - 0.5, base - sh + 1], [x + sw / 2, base], [x + sw / 2 - 2, base]], STONE_DARK, null);
    }
    rrect(ctx, 9, 13, 14, 3.5, 1, STONE_LIGHT);
    circle(ctx, 16, 28, 2, "#7fa04a", null);
  },
  motherTree(ctx) {
    rrect(ctx, 12.5, 18, 7, 13.5, 2, "#5b3a1e");
    line(ctx, 14, 22, 12, 31, INK, 1);
    line(ctx, 18.5, 20, 21, 31, INK, 1);
    blob(ctx, [
      { t: "c", x: 16, y: 11, r: 10 },
      { t: "c", x: 7, y: 15, r: 6 },
      { t: "c", x: 25, y: 15, r: 6 },
      { t: "c", x: 16, y: 4.5, r: 5 },
    ], "#3f9a5e", { highlight: { x: 11, y: 7, rx: 4, ry: 3 } });
    for (const [fx, fy] of [[9, 12], [20, 8], [15, 15], [24, 13], [12, 6]]) circle(ctx, fx, fy, 1.4, "#cdf5a0", null);
  },
  dragonBones(ctx) {
    const bone = "#ece6d3";
    for (let i = 0; i < 4; i++) {
      const x = 6 + i * 5;
      ctx.beginPath();
      ctx.arc(x, 30, 8 - i * 0.6, Math.PI, TAU);
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, 30, 8 - i * 0.6, Math.PI, TAU);
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = bone;
      ctx.stroke();
    }
    poly(ctx, [[22, 30], [23, 22], [28, 20], [31, 24], [30, 30]], bone);
    circle(ctx, 27, 24, 1.3, INK, null);
    line(ctx, 27, 28, 30, 28, INK, 0.8);
  },
  crystalMine(ctx) {
    drawRock(ctx, 16, 27, 12, createRandom(7), "#a8a49b", "#8e8a82", "#615d57");
    const crystals = [[10, 30, 4, 12, -0.25], [16, 30, 5, 17, 0], [22, 30, 4, 11, 0.3]];
    for (const [x, base, cw, ch, lean] of crystals) {
      const tipX = x + lean * ch;
      poly(ctx, [[x - cw / 2, base], [tipX, base - ch], [x + cw / 2, base]], "#b48ae8");
      poly(ctx, [[tipX, base - ch], [x + cw / 2, base], [tipX + 0.5, base]], "#8b5fd0", null);
      line(ctx, x - cw / 4, base - 2, tipX - 0.3, base - ch + 2, "#eadcff", 0.8);
    }
  },
  shipwreck(ctx) {
    const hull = "#6e4a2a";
    poly(ctx, [[3, 24], [8, 30], [22, 30], [28, 22], [24, 24], [8, 25]], hull);
    poly(ctx, [[22, 30], [28, 22], [24, 24]], shade(hull, -0.3), null);
    line(ctx, 15, 25, 19, 8, INK, 2.4);
    line(ctx, 15, 25, 19, 8, "#8b6a45", 1.2);
    poly(ctx, [[19, 8], [26, 14], [18.5, 18]], "#d9d0bf");
    line(ctx, 5, 26, 9, 21, INK, 1);
  },
  ruinedTower(ctx) {
    poly(ctx, [[8, 31], [9, 8], [15, 5], [22, 9], [22, 20], [19, 24], [24, 31]], STONE);
    poly(ctx, [[15, 5], [22, 9], [22, 20], [19, 24], [24, 31], [16, 31], [16, 6]], STONE_DARK, null);
    poly(ctx, [[8, 31], [9, 8], [15, 5], [22, 9], [22, 20], [19, 24], [24, 31]], null, INK);
    for (const [bx, by] of [[11, 12], [13, 17], [11, 22]]) rect(ctx, bx, by, 3, 1.6, STONE_LIGHT, null);
    poly(ctx, [[12, 27], [14, 23], [16, 27]], INK, null);
    for (const [gx, gy] of [[5, 30], [27, 29.5], [20, 30.5]]) circle(ctx, gx, gy, 1.8, "#7fa04a", null);
  },
  hotSpring(ctx) {
    ellipse(ctx, 16, 26, 12, 5, "#8d846f", INK, 1);
    ellipse(ctx, 16, 25.5, 9, 3.4, "#7fd6e8", "#4aa3bf", 1);
    ellipse(ctx, 13, 24.5, 3.5, 1.2, "#c8f1f8", null);
    softDisc(ctx, 11, 15, 4, 5, "#ffffff", 0.7);
    softDisc(ctx, 18, 11, 4.5, 6, "#ffffff", 0.6);
    softDisc(ctx, 23, 17, 3.5, 4, "#ffffff", 0.6);
  },
  boneOrchard(ctx) {
    const bone = "#ece6d3";
    for (const [x, hgt] of [[5, 10], [11, 15], [19, 12], [26, 16]]) {
      line(ctx, x, 30, x + 1, 30 - hgt, INK, 3.2);
      line(ctx, x, 30, x + 1, 30 - hgt, bone, 1.6);
      circle(ctx, x + 1, 30 - hgt, 1.6, bone, INK, 0.8);
    }
    circle(ctx, 15, 27.5, 3.2, bone);
    circle(ctx, 13.8, 27, 0.9, INK, null);
    circle(ctx, 16.4, 27, 0.9, INK, null);
    line(ctx, 14, 30, 16.5, 30, INK, 0.9);
  },
  volcano(ctx) {
    const rock = "#5b524e";
    poly(ctx, [[1, 31], [11, 8], [21, 8], [31, 31]], rock);
    poly(ctx, [[16, 8], [21, 8], [31, 31], [17, 31]], shade(rock, -0.35), null);
    poly(ctx, [[1, 31], [11, 8], [21, 8], [31, 31]], null, INK);
    ellipse(ctx, 16, 8, 5, 1.6, "#ff5a1f", INK, 0.9);
    polyline(ctx, [[14, 9], [12, 16], [13, 22]], "#ff7a1f", 1.6);
    polyline(ctx, [[19, 9], [21, 15], [20, 20]], "#ffb01f", 1.2);
    softDisc(ctx, 16, 4, 6, 3.5, "#8a8078", 0.7);
  },
  oasis(ctx) {
    ellipse(ctx, 16, 27, 12, 4.5, "#4f97bb", "#e2c98a", 1.2);
    ellipse(ctx, 13, 26, 4, 1.4, "#9dd3e8", null);
    const palm = (x, base, dir) => {
      polyline(ctx, [[x, base], [x + dir * 2, base - 8], [x + dir * 4, base - 14]], INK, 3.4);
      polyline(ctx, [[x, base], [x + dir * 2, base - 8], [x + dir * 4, base - 14]], "#a87a45", 1.8);
      const tx = x + dir * 4;
      const ty = base - 14;
      for (const [dx, dy] of [[-1, -0.3], [-0.6, 0.6], [0.2, -0.9], [0.9, -0.1], [0.7, 0.7]]) {
        line(ctx, tx, ty, tx + dx * 6, ty + dy * 4 + 1, INK, 3.2);
      }
      for (const [dx, dy] of [[-1, -0.3], [-0.6, 0.6], [0.2, -0.9], [0.9, -0.1], [0.7, 0.7]]) {
        line(ctx, tx, ty, tx + dx * 6, ty + dy * 4 + 1, dx < 0.2 ? "#4aa04a" : "#357a38", 1.8);
      }
    };
    palm(6, 26, 1);
    palm(27, 25, -1);
  },
};

for (const type of LANDMARK_TYPES) {
  def(`landmark/${type}`, 32, 32, BOTTOM, (ctx) => LANDMARK_DRAWERS[type](ctx));
}

// Waterfall frames: the foam streaks shift down one step per frame.
defVariants("landmark/waterfall", 3, 32, 32, BOTTOM, (ctx, w, h, v) => {
  poly(ctx, [[4, 31], [6, 10], [10, 6], [22, 6], [26, 10], [28, 31]], "#7d7770");
  poly(ctx, [[22, 6], [26, 10], [28, 31], [20, 31]], "#585350", null);
  poly(ctx, [[4, 31], [6, 10], [10, 6], [22, 6], [26, 10], [28, 31]], null, INK);
  poly(ctx, [[11, 7], [21, 7], [22, 28], [10, 28]], WATER, null);
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 4; i++) {
    const y0 = 8 + ((i * 6 + v * 2) % 20);
    line(ctx, 12.5 + i * 2.5, y0, 12.5 + i * 2.5, y0 + 3.5, "#e9f7fb", 1);
  }
  ctx.globalAlpha = 1;
  ellipse(ctx, 16, 29, 9, 2.8, WATER_LIGHT, "#3f86a8", 0.8);
  for (let i = 0; i < 3; i++) circle(ctx, 10 + i * 6 + (v % 2), 28.5, 1.1, "#ffffff", null);
});

// ===========================================================================
// BUILDINGS (30x30, bottom anchored)
// ===========================================================================

// A generic 3/4-view house: front wall with a gable, a darker side wall to
// the right, the roof plane above it. All the town buildings are variations
// of this so they read as one settlement.
function drawHouse(ctx, o) {
  const x0 = o.x0, x1 = o.x1, x2 = o.x2; // front wall left/right, side wall right
  const base = o.base, wallTop = o.wallTop, peak = o.peak, depth = o.depth;
  const wall = o.wall || WALL;
  const wallDark = o.wallDark || shade(wall, -0.22);
  const roof = o.roof;
  const roofDark = shade(roof, -0.25);
  const mid = (x0 + x1) / 2;
  // Side wall (in shade) and front wall with the gable.
  poly(ctx, [[x1, base], [x2, base - depth], [x2, wallTop - depth], [x1, wallTop]], wallDark);
  poly(ctx, [[x0, base], [x0, wallTop], [mid, peak], [x1, wallTop], [x1, base]], wall);
  // Roof plane over the side wall, then the front roof edge (the overhang).
  poly(ctx, [[mid, peak], [mid + (x2 - x1), peak - depth], [x2 + 1, wallTop - depth - 0.5], [x1 + 1, wallTop + 0.5]], roofDark);
  poly(ctx, [[x0 - 1.5, wallTop + 0.6], [mid, peak - 1.2], [x1 + 1.5, wallTop + 0.6], [x1 + 1.5, wallTop + 2.2], [mid, peak + 0.6], [x0 - 1.5, wallTop + 2.2]], roof);
  if (o.door !== false) {
    const dw = o.doorW || 3.2;
    rrect(ctx, mid - dw / 2 + (o.doorDx || 0), base - 5, dw, 5, 1, o.doorColor || "#5a3a1e", INK, 0.8);
  }
  if (o.window !== false) {
    rect(ctx, x0 + 2, wallTop + 3, 2.4, 2.4, "#7ec1e8", INK, 0.7);
  }
}

defVariants("building/house", 3, 30, 30, BOTTOM, (ctx, w, h, v) => {
  const roofs = ["#b8513a", "#8f6b4b", "#5d7fa8"];
  const walls = [WALL, "#e7d6b4", "#efe4cf"];
  drawHouse(ctx, { x0: 4, x1: 17, x2: 25, base: 29, wallTop: 17, peak: 9.5, depth: 5, roof: roofs[v], wall: walls[v], doorDx: v === 2 ? -3 : 0 });
  if (v === 1) rect(ctx, 20, 20, 2.2, 2.2, "#7ec1e8", INK, 0.7);
  // Chimney on the roof plane.
  rect(ctx, 19 + v, 7 + v, 2.4, 5, "#7a6a60", INK, 0.8);
});

def("building/barn", 30, 30, BOTTOM, (ctx) => {
  drawHouse(ctx, { x0: 3, x1: 19, x2: 27, base: 29, wallTop: 15, peak: 6, depth: 6, roof: "#5a4a44", wall: "#a9402f", door: false, window: false });
  // Big double door with a white cross brace.
  rect(ctx, 7.5, 20, 7, 9, "#7a2f22", INK, 0.8);
  line(ctx, 7.5, 20, 14.5, 29, "#f3e9d6", 0.8);
  line(ctx, 14.5, 20, 7.5, 29, "#f3e9d6", 0.8);
  line(ctx, 11, 20, 11, 29, INK, 0.7);
  rect(ctx, 9.5, 10, 3, 3, "#f3e9d6", INK, 0.7);
});

def("building/school", 30, 30, BOTTOM, (ctx) => {
  drawHouse(ctx, { x0: 3, x1: 18, x2: 26, base: 29, wallTop: 17, peak: 10, depth: 5, roof: "#4f6f9a", wall: "#efe6cf" });
  rect(ctx, 13, 20, 2.4, 2.4, "#7ec1e8", INK, 0.7);
  // Bell tower on the ridge.
  rect(ctx, 8.5, 5, 5, 6.5, "#efe6cf", INK, 0.9);
  poly(ctx, [[7, 5.5], [11, 1], [15, 5.5]], "#4f6f9a");
  circle(ctx, 11, 8.5, 1.3, "#e6b422", INK, 0.7);
});

def("building/armyCamp", 30, 30, BOTTOM, (ctx) => {
  const canvas = "#cfbd93";
  poly(ctx, [[3, 28.5], [14, 11], [25, 28.5]], canvas);
  poly(ctx, [[14, 11], [25, 28.5], [15.5, 28.5]], shade(canvas, -0.24), null);
  poly(ctx, [[3, 28.5], [14, 11], [25, 28.5]], null, INK);
  poly(ctx, [[11, 28.5], [14, 20], [17, 28.5]], "#5a4a3a", INK, 0.8);
  line(ctx, 25, 28.5, 25, 8, INK, 1.6);
  line(ctx, 25, 28.5, 25, 8, "#a87a45", 0.8);
  poly(ctx, [[25, 8], [30, 10.5], [25, 13]], "#d93a2f");
  // Camp fire in front.
  circle(ctx, 7, 28, 1.6, "#5a4a3a", INK, 0.7);
  poly(ctx, [[5.8, 27.5], [7, 23.5], [8.2, 27.5]], "#ff9a1f", null);
  poly(ctx, [[6.4, 27.5], [7, 25], [7.6, 27.5]], "#ffe25a", null);
});

def("building/market", 30, 30, BOTTOM, (ctx) => {
  // Table with goods, posts, and the striped awning on top.
  rect(ctx, 5, 22, 20, 6.5, WOOD, INK, 0.9);
  rect(ctx, 5, 22, 20, 1.6, WOOD_DARK, null);
  line(ctx, 6.5, 22, 6.5, 12, INK, 1.6);
  line(ctx, 23.5, 22, 23.5, 12, INK, 1.6);
  line(ctx, 6.5, 22, 6.5, 12, "#c99a5e", 0.7);
  line(ctx, 23.5, 22, 23.5, 12, "#c99a5e", 0.7);
  poly(ctx, [[3, 12.5], [8, 7], [22, 7], [27, 12.5]], "#e4e0d4");
  for (let i = 0; i < 4; i++) {
    const t0 = i / 4;
    const t1 = (i + 0.5) / 4;
    poly(ctx, [[3 + 24 * t0, 12.5], [8 + 14 * t0, 7], [8 + 14 * t1, 7], [3 + 24 * t1, 12.5]], "#d9453a", null);
  }
  // Scalloped edge.
  for (let i = 0; i < 6; i++) circle(ctx, 5 + i * 4, 12.8, 2, i % 2 ? "#d9453a" : "#e4e0d4", INK, 0.7);
  circle(ctx, 10, 20, 2.2, "#ff8a1f", INK, 0.7);
  circle(ctx, 14, 20.5, 2, "#e8c34a", INK, 0.7);
  rrect(ctx, 17, 18.5, 5, 3.5, 0.8, "#8b6a45", INK, 0.7);
});

def("building/watchtower", 30, 30, BOTTOM, (ctx) => {
  // Four legs with cross-bracing, a cabin and a peaked roof.
  for (const [a, b] of [[[8, 29], [10, 14]], [[22, 29], [20, 14]]]) line(ctx, a[0], a[1], b[0], b[1], INK, 2.4);
  for (const [a, b] of [[[8, 29], [10, 14]], [[22, 29], [20, 14]]]) line(ctx, a[0], a[1], b[0], b[1], "#8b6a45", 1.2);
  line(ctx, 9, 24, 21, 18, INK, 1);
  line(ctx, 21, 24, 9, 18, INK, 1);
  rect(ctx, 8, 9, 14, 7, WOOD, INK, 0.9);
  rect(ctx, 8, 9, 14, 1.4, WOOD_DARK, null);
  rect(ctx, 13, 11, 4, 3, INK, null);
  poly(ctx, [[6, 9.5], [15, 2.5], [24, 9.5]], "#7a3f30");
  poly(ctx, [[15, 2.5], [24, 9.5], [15, 9.5]], shade("#7a3f30", -0.3), null);
  line(ctx, 15, 2.5, 15, 0.5, INK, 1);
});

def("building/well", 30, 30, BOTTOM, (ctx) => {
  ellipse(ctx, 15, 25, 7, 3, STONE);
  rect(ctx, 8, 21, 14, 4.5, STONE, INK, 0.9);
  ellipse(ctx, 15, 21, 7, 3, STONE_LIGHT);
  ellipse(ctx, 15, 21, 4.5, 1.8, "#3f7fa8", INK, 0.7);
  line(ctx, 9.5, 21, 9.5, 11, INK, 2);
  line(ctx, 20.5, 21, 20.5, 11, INK, 2);
  line(ctx, 9.5, 21, 9.5, 11, "#8b6a45", 0.9);
  line(ctx, 20.5, 21, 20.5, 11, "#8b6a45", 0.9);
  poly(ctx, [[6.5, 11.5], [15, 6], [23.5, 11.5]], "#7a3f30");
  line(ctx, 15, 11, 15, 16, INK, 0.7);
  rrect(ctx, 13.4, 16, 3.2, 2.6, 0.6, "#8b6a45", INK, 0.7);
});

// Windmill frames: the sails rotate 22.5 degrees per frame (4 frames = 90
// degrees, which is one full period for a 4-armed cross).
defVariants("building/windmill", 4, 30, 30, BOTTOM, (ctx, w, h, v) => {
  poly(ctx, [[9, 29], [11, 12], [19, 12], [21, 29]], STONE_LIGHT);
  poly(ctx, [[15, 12], [19, 12], [21, 29], [15, 29]], STONE, null);
  poly(ctx, [[9, 29], [11, 12], [19, 12], [21, 29]], null, INK);
  poly(ctx, [[9, 12.5], [15, 7], [21, 12.5]], "#7a3f30");
  rrect(ctx, 13.5, 23, 3, 6, 1, "#5a3a1e", INK, 0.7);
  const cx = 15, cy = 11;
  const angle = (v * Math.PI) / 8;
  for (let i = 0; i < 4; i++) {
    const a = angle + (i * Math.PI) / 2;
    const ex = cx + Math.cos(a) * 10, ey = cy + Math.sin(a) * 10;
    line(ctx, cx, cy, ex, ey, INK, 1.2);
    // The sail cloth: a thin quad on one side of each arm.
    const nx = -Math.sin(a) * 2.2, ny = Math.cos(a) * 2.2;
    poly(ctx, [[cx + Math.cos(a) * 3, cy + Math.sin(a) * 3], [ex, ey], [ex + nx, ey + ny], [cx + Math.cos(a) * 3 + nx, cy + Math.sin(a) * 3 + ny]], "#f3ecdc", INK, 0.7);
  }
  circle(ctx, cx, cy, 1.3, "#5a3a1e", INK, 0.7);
});

// Halls: the settlement centre grows from a hut to a hall to a keep.
defVariants("building/hall", 3, 30, 30, BOTTOM, (ctx, w, h, v) => {
  if (v === 0) {
    // Round hut with a thatched cone.
    rect(ctx, 8, 20, 14, 9, "#c9a877", INK, 0.9);
    ellipse(ctx, 15, 29, 7, 2.2, "#c9a877", INK, 0.9);
    poly(ctx, [[5, 20.5], [15, 8], [25, 20.5]], THATCH);
    poly(ctx, [[15, 8], [25, 20.5], [15.5, 20.5]], shade(THATCH, -0.25), null);
    poly(ctx, [[5, 20.5], [15, 8], [25, 20.5]], null, INK);
    rrect(ctx, 13.4, 23.5, 3.2, 5.5, 1.2, "#5a3a1e", INK, 0.8);
  } else if (v === 1) {
    // Long hall with a steep roof and carved gable.
    drawHouse(ctx, { x0: 2, x1: 17, x2: 28, base: 29, wallTop: 16, peak: 5, depth: 6, roof: "#8a5a3a", wall: "#dcc79a", doorW: 4, doorColor: "#4a2e17" });
    line(ctx, 9.5, 5.5, 9.5, 2, INK, 1);
    line(ctx, 9.5, 16.6, 9.5, 5, "#5a3a1e", 0.8);
    rect(ctx, 12.5, 19, 2.4, 2.4, "#7ec1e8", INK, 0.7);
  } else {
    // Stone keep: a square tower with battlements, a gate and a side wing.
    poly(ctx, [[19, 29], [27, 25], [27, 15], [19, 18]], STONE_DARK);
    poly(ctx, [[5, 29], [5, 7], [19, 7], [19, 29]], STONE);
    poly(ctx, [[5, 7], [19, 7], [27, 3.5], [13, 3.5]], STONE_LIGHT);
    poly(ctx, [[19, 7], [27, 3.5], [27, 15], [19, 18]], STONE_DARK, null);
    poly(ctx, [[5, 29], [5, 7], [19, 7], [27, 3.5], [27, 25], [19, 29]], null, INK);
    for (let i = 0; i < 4; i++) rect(ctx, 5 + i * 3.6, 4.5, 2.2, 2.8, STONE, INK, 0.7);
    rrect(ctx, 9.5, 21, 5, 8, 2.5, "#3a2a1e", INK, 0.8);
    rect(ctx, 8, 12, 2, 3, INK, null);
    rect(ctx, 14, 12, 2, 3, INK, null);
  }
});

def("building/garlock_tent", 30, 30, BOTTOM, (ctx) => {
  const hide = "#4a4448";
  poly(ctx, [[2, 28.5], [15, 9], [28, 28.5]], hide);
  poly(ctx, [[15, 9], [28, 28.5], [16, 28.5]], shade(hide, -0.3), null);
  poly(ctx, [[2, 28.5], [15, 9], [28, 28.5]], null, INK);
  poly(ctx, [[11.5, 28.5], [15, 19], [18.5, 28.5]], "#1e1a1c", INK, 0.7);
  // Stitched hides and the skull on the pole.
  line(ctx, 6, 24, 10, 18, "#8a7a70", 0.8);
  line(ctx, 8, 27, 12, 22, "#8a7a70", 0.8);
  line(ctx, 15, 9, 15, 3, INK, 1.2);
  circle(ctx, 15, 3.6, 2.4, "#ece6d3", INK, 0.8);
  circle(ctx, 14.1, 3.4, 0.7, INK, null);
  circle(ctx, 15.9, 3.4, 0.7, INK, null);
  line(ctx, 4, 28.5, 4, 22, "#ece6d3", 1);
  line(ctx, 26, 28.5, 26, 23, "#ece6d3", 1);
});

def("building/garlock_totem", 30, 30, BOTTOM, (ctx) => {
  const wood = "#6f4a2a";
  rrect(ctx, 11, 4, 8, 25, 1.5, wood);
  rect(ctx, 15, 4.5, 3.5, 24, shade(wood, -0.3), null);
  rrect(ctx, 11, 4, 8, 25, 1.5, null, INK);
  for (let i = 0; i < 3; i++) {
    const y = 7 + i * 7.5;
    circle(ctx, 13.3, y, 1, "#ffcf3f", INK, 0.5);
    circle(ctx, 16.7, y, 1, "#ffcf3f", INK, 0.5);
    rect(ctx, 12.5, y + 2.2, 5, 1.4, INK, null);
  }
  poly(ctx, [[11, 4], [6, 1], [8, 6]], "#d94a3a");
  poly(ctx, [[19, 4], [24, 1], [22, 6]], "#d94a3a");
});

def("building/palisade", 30, 30, BOTTOM, (ctx) => {
  for (let i = 0; i < 7; i++) {
    const x = 3 + i * 4;
    const top = 12 + (i % 2) * 1.5;
    poly(ctx, [[x - 1.6, 29], [x - 1.6, top + 3], [x, top], [x + 1.6, top + 3], [x + 1.6, 29]], "#a87a45");
    poly(ctx, [[x, top], [x + 1.6, top + 3], [x + 1.6, 29], [x + 0.3, 29], [x + 0.3, top + 2]], "#7a5228", null);
  }
  rect(ctx, 1, 18, 28, 1.8, "#7a5228", INK, 0.7);
  rect(ctx, 1, 24, 28, 1.8, "#7a5228", INK, 0.7);
});

def("building/dock", 30, 30, BOTTOM, (ctx) => {
  // Posts under the deck, the plank deck, a barrel and a mooring rope.
  for (const x of [5, 15, 25]) rect(ctx, x - 1, 20, 2, 9, WOOD_DARK, INK, 0.8);
  rect(ctx, 2, 16, 26, 6, WOOD, INK, 0.9);
  for (let i = 1; i < 7; i++) line(ctx, 2 + i * 3.7, 16.5, 2 + i * 3.7, 21.5, WOOD_DARK, 0.7);
  rrect(ctx, 20, 10, 5, 6.5, 1.2, "#8b6a45", INK, 0.8);
  line(ctx, 20, 12, 25, 12, INK, 0.6);
  line(ctx, 20, 14.5, 25, 14.5, INK, 0.6);
  rect(ctx, 5, 12, 1.8, 4.5, WOOD_DARK, INK, 0.7);
});

// Bridges are flat things in practice (they lie on the road) but keep the
// bottom anchor of the other buildings so the road layer can treat them
// like any standing sprite.
def("building/bridge", 30, 30, BOTTOM, (ctx) => {
  const deck = "#a9a39a";
  rrect(ctx, 1, 17, 28, 7, 1.5, deck);
  // The arch: a dark opening under the deck with the water showing through.
  ctx.beginPath();
  ctx.moveTo(8, 24);
  ctx.arc(15, 24, 7, Math.PI, TAU);
  ctx.closePath();
  finish(ctx, "#3f86a8", INK, 0.9);
  ctx.beginPath();
  ctx.moveTo(9.5, 24);
  ctx.arc(15, 24, 5.5, Math.PI, TAU);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = STONE_DARK;
  ctx.stroke();
  rect(ctx, 1, 17, 28, 2, STONE_LIGHT, INK, 0.7);
  rect(ctx, 1, 22.5, 28, 1.5, STONE_DARK, null);
  for (let i = 0; i < 7; i++) rect(ctx, 2 + i * 4, 15, 2.2, 2.4, STONE, INK, 0.7);
});

def("building/bridge_v", 30, 30, BOTTOM, (ctx) => {
  const deck = "#a9a39a";
  rrect(ctx, 10, 2, 10, 27, 1.5, deck);
  rect(ctx, 10, 2, 2.2, 27, STONE_LIGHT, null);
  rect(ctx, 18, 2, 2, 27, STONE_DARK, null);
  rrect(ctx, 10, 2, 10, 27, 1.5, null, INK);
  for (let i = 0; i < 6; i++) {
    rect(ctx, 8, 3 + i * 4.5, 2, 2.4, STONE, INK, 0.7);
    rect(ctx, 20, 3 + i * 4.5, 2, 2.4, STONE, INK, 0.7);
  }
  line(ctx, 12.5, 10, 17.5, 10, STONE_DARK, 0.8);
  line(ctx, 12.5, 20, 17.5, 20, STONE_DARK, 0.8);
});

def("building/lighthouse", 30, 30, BOTTOM, (ctx) => {
  poly(ctx, [[10, 29], [12, 8], [18, 8], [20, 29]], "#f2ede4");
  poly(ctx, [[15, 8], [18, 8], [20, 29], [15, 29]], "#cfc8bc", null);
  // Red bands, clipped to the tapering tower silhouette.
  ctx.save();
  tracePoly(ctx, [[10, 29], [12, 8], [18, 8], [20, 29]]);
  ctx.clip();
  for (const y of [13, 21]) rect(ctx, 8, y, 14, 3.5, "#d9453a", null);
  for (const y of [13, 21]) rect(ctx, 15, y, 7, 3.5, "#b0362d", null);
  ctx.restore();
  poly(ctx, [[10, 29], [12, 8], [18, 8], [20, 29]], null, INK);
  rect(ctx, 11, 8, 8, 1.6, STONE_DARK, INK, 0.7);
  rect(ctx, 12, 3.5, 6, 4.5, "#ffe27a", INK, 0.8);
  poly(ctx, [[11, 3.5], [15, 0.5], [19, 3.5]], "#7a3f30");
  softDisc(ctx, 15, 5.5, 7, 5, "#ffe27a", 0.5);
  rrect(ctx, 13.8, 24, 2.4, 5, 0.8, "#5a3a1e", INK, 0.7);
});

// ===========================================================================
// IMPROVEMENTS (34x30, bottom anchored)
// ===========================================================================

const FARM_SEASONS = {
  spring: { soil: "#8a5a34", row: "#6f4626", crop: "#7fc25a", cropTop: null },
  summer: { soil: "#7f5a30", row: "#5f4222", crop: "#4f9a3c", cropTop: "#78bf5a" },
  autumn: { soil: "#8a6a3a", row: "#6f5128", crop: "#e6b73a", cropTop: "#f5d76a" },
  winter: { soil: "#e8eef2", row: "#b9c6d2", crop: "#c9d2dc", cropTop: "#f7fafc" },
};

for (const season of Object.keys(FARM_SEASONS)) {
  def(`improvement/farm_${season}`, 34, 30, BOTTOM, (ctx) => {
    const c = FARM_SEASONS[season];
    // The field: a parallelogram (the 3/4 view of a rectangle).
    const field = [[2, 28], [9, 12], [32, 12], [25, 28]];
    poly(ctx, field, c.soil);
    ctx.save();
    tracePoly(ctx, field);
    ctx.clip();
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6;
      const x0 = 2 + 23 * t, x1 = 9 + 23 * t;
      line(ctx, x0 + 0.2, 27.5, x1 - 0.2, 12.5, c.row, 1.6);
      if (season !== "spring") {
        line(ctx, x0 + 0.2, 27.5, x1 - 0.2, 12.5, c.crop, season === "winter" ? 1 : 2.4);
        if (c.cropTop) line(ctx, x0 - 0.3, 27.5, x1 - 0.7, 12.5, c.cropTop, 0.8);
      } else {
        for (let k = 0; k < 4; k++) {
          const u = (k + 0.5) / 4;
          circle(ctx, x0 + (x1 - x0) * u, 27.5 - 15 * u, 0.9, c.crop, null);
        }
      }
    }
    ctx.restore();
    poly(ctx, field, null, INK);
    // Fence posts along the near edge and a scarecrow-style marker.
    for (const x of [3, 10, 17, 24]) rect(ctx, x, 26, 1.4, 3.5, "#8b6a45", INK, 0.6);
    line(ctx, 3.7, 27.5, 25.4, 27.5, "#8b6a45", 0.8);
  });
}

def("improvement/lumberCamp", 34, 30, BOTTOM, (ctx) => {
  // Log pile: stacked circles show the cut ends.
  const logs = [[8, 25], [13, 25], [18, 25], [10.5, 21], [15.5, 21], [13, 17]];
  for (const [x, y] of logs) rect(ctx, x - 2.5, y - 2.4, 9, 4.8, WOOD_DARK, null);
  for (const [x, y] of logs) {
    circle(ctx, x, y, 2.5, "#d9b57a");
    circle(ctx, x, y, 1.2, "#b98f57", null);
  }
  // Stump with rings and an axe.
  ellipse(ctx, 27, 24, 4, 2.2, "#d9b57a");
  rect(ctx, 23, 24, 8, 4.5, TRUNK, INK, 0.8);
  ellipse(ctx, 27, 24, 4, 2.2, "#d9b57a", INK, 0.8);
  line(ctx, 27, 23, 30, 16, INK, 1.5);
  line(ctx, 27, 23, 30, 16, "#8b6a45", 0.7);
  poly(ctx, [[29, 16.5], [32.5, 15], [31.5, 18.5]], STONE_LIGHT, INK, 0.7);
  // Saw bench.
  rect(ctx, 2, 26, 6, 1.5, "#8b6a45", INK, 0.6);
  line(ctx, 3, 27.5, 2.5, 29.5, INK, 0.8);
  line(ctx, 7, 27.5, 7.5, 29.5, INK, 0.8);
});

def("improvement/quarry", 34, 30, BOTTOM, (ctx) => {
  // A cut rock face, stone blocks, and a wooden crane.
  poly(ctx, [[2, 29], [4, 16], [12, 12], [20, 14], [22, 29]], STONE);
  poly(ctx, [[12, 12], [20, 14], [22, 29], [13, 29]], STONE_DARK, null);
  poly(ctx, [[2, 29], [4, 16], [12, 12], [20, 14], [22, 29]], null, INK);
  line(ctx, 6, 20, 8, 27, STONE_DARK, 0.8);
  const block = (x, y) => {
    rect(ctx, x, y, 5, 3.6, STONE_LIGHT, INK, 0.8);
    rect(ctx, x + 3.6, y, 1.4, 3.6, STONE, null);
  };
  block(24, 25);
  block(29, 25.5);
  block(26.5, 21);
  line(ctx, 22, 29, 22, 8, INK, 1.6);
  line(ctx, 22, 29, 22, 8, "#8b6a45", 0.7);
  line(ctx, 22, 9, 31, 13, INK, 1.4);
  line(ctx, 22, 9, 31, 13, "#8b6a45", 0.6);
  line(ctx, 22, 14, 27, 11, INK, 0.9);
  line(ctx, 30, 13, 30, 19, INK, 0.6);
  rect(ctx, 28.5, 19, 3, 2.4, STONE_LIGHT, INK, 0.7);
});

def("improvement/fishery", 34, 30, BOTTOM, (ctx) => {
  drawHouse(ctx, { x0: 2, x1: 12, x2: 18, base: 28, wallTop: 19, peak: 13, depth: 4, roof: "#6f7f8f", wall: "#c9a877", window: false });
  // Drying net between two poles.
  line(ctx, 21, 29, 21, 15, INK, 1.4);
  line(ctx, 32, 29, 32, 15, INK, 1.4);
  ctx.strokeStyle = "#e6dcc0";
  ctx.lineWidth = 0.7;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(21, 16 + i * 2.5);
    ctx.lineTo(32, 16 + i * 2.5);
    ctx.stroke();
  }
  for (let i = 0; i <= 5; i++) {
    ctx.beginPath();
    ctx.moveTo(21 + i * 2.2, 16);
    ctx.lineTo(21 + i * 2.2, 26);
    ctx.stroke();
  }
  // A beached rowing boat.
  poly(ctx, [[14, 27], [17, 29.5], [30, 29.5], [33, 27]], "#7a5228", INK, 0.8);
  line(ctx, 15.5, 27.6, 31.5, 27.6, "#a87a45", 0.8);
});

def("improvement/pasture", 34, 30, BOTTOM, (ctx) => {
  // Rail fence round the near edge, two hay bales.
  const posts = [3, 10, 17, 24, 31];
  for (const x of posts) rect(ctx, x - 0.8, 19, 1.6, 10, "#a87a45", INK, 0.7);
  line(ctx, 3, 22, 31, 22, "#8b6a45", 1.4);
  line(ctx, 3, 26, 31, 26, "#8b6a45", 1.4);
  line(ctx, 3, 22, 31, 22, INK, 0.5);
  line(ctx, 3, 26, 31, 26, INK, 0.5);
  const bale = (x, y) => {
    circle(ctx, x, y, 3.6, "#e2b94a");
    circle(ctx, x, y, 2, "#c8982e", null);
    line(ctx, x - 3.6, y, x + 3.6, y, "#c8982e", 0.7);
  };
  bale(12, 14);
  bale(21, 15);
  circle(ctx, 27, 12, 1.5, "#7fa04a", null);
});

def("improvement/mine", 34, 30, BOTTOM, (ctx) => {
  // A brown hillock with a timbered entrance and a rail track.
  ctx.beginPath();
  ctx.ellipse(17, 29, 15, 15, 0, Math.PI, TAU);
  ctx.closePath();
  finish(ctx, "#8b6a48", INK, LINE);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(17, 29, 15, 15, 0, Math.PI, TAU);
  ctx.clip();
  ctx.fillStyle = shade("#8b6a48", -0.25);
  ctx.fillRect(17, 10, 18, 22);
  ctx.beginPath();
  ctx.ellipse(14, 29, 15, 15, 0, Math.PI, TAU);
  ctx.fillStyle = "#8b6a48";
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(11, 29);
  ctx.lineTo(11, 20);
  ctx.arc(17, 20, 6, Math.PI, TAU);
  ctx.lineTo(23, 29);
  ctx.closePath();
  finish(ctx, "#1e1a1c", INK, LINE);
  rect(ctx, 10, 18, 14, 2, "#a87a45", INK, 0.7);
  rect(ctx, 10, 18, 2, 11, "#a87a45", INK, 0.7);
  rect(ctx, 22, 18, 2, 11, "#a87a45", INK, 0.7);
  line(ctx, 14.5, 29.5, 14.5, 24, "#7c7570", 0.8);
  line(ctx, 19.5, 29.5, 19.5, 24, "#7c7570", 0.8);
  circle(ctx, 28, 27, 1.6, STONE_LIGHT, INK, 0.7);
  circle(ctx, 4.5, 27.5, 1.3, STONE, INK, 0.7);
});

// ===========================================================================
// UNITS (bottom anchored, facing RIGHT, two walk frames)
// ===========================================================================

// A little person: round head, tunic body, legs apart (frame 0) or together
// (frame 1). `prop(ctx)` draws the trade's tool after the body.
function drawPerson(ctx, frame, o) {
  const tunic = o.tunic;
  const cx = o.cx === undefined ? 5 : o.cx;
  const base = o.base === undefined ? 15.5 : o.base;
  const skin = o.skin || SKIN;
  const legDark = "#3a2c22";
  // Legs.
  if (frame === 0) {
    line(ctx, cx - 1, base - 4, cx - 2.2, base, legDark, 1.8);
    line(ctx, cx + 1, base - 4, cx + 2.4, base, legDark, 1.8);
  } else {
    line(ctx, cx - 0.9, base - 4, cx - 0.9, base, legDark, 1.8);
    line(ctx, cx + 0.9, base - 4, cx + 0.9, base, legDark, 1.8);
  }
  // Body: a rounded rectangle, slightly wider at the bottom.
  rrect(ctx, cx - 2.6, base - 9, 5.2, 5.8, 1.6, tunic, INK, 0.9);
  rect(ctx, cx + 0.6, base - 8.5, 1.6, 4.8, shade(tunic, -0.25), null);
  // Arm swinging with the walk (front arm only, back arm is hidden).
  const swing = frame === 0 ? 1.2 : -0.6;
  line(ctx, cx + 1.4, base - 8, cx + 2.4 + swing, base - 4.6, skin, 1.5);
  // Head, hair cap and an eye on the right (facing right).
  circle(ctx, cx, base - 12.2, 3, skin, INK, 0.9);
  ctx.beginPath();
  ctx.arc(cx, base - 12.2, 3, Math.PI * 1.05, Math.PI * 1.95);
  ctx.closePath();
  finish(ctx, o.hair || "#4a3020", null);
  circle(ctx, cx + 1.4, base - 12, 0.5, INK, null);
  if (o.prop) o.prop(ctx, cx, base, frame);
}

const TRADES = {
  carrier: {
    tunic: "#c98a3a",
    prop: (ctx, cx, base) => {
      // A wicker basket on the back (the left side, since we face right).
      rrect(ctx, cx - 5.2, base - 10, 3.4, 4.6, 1, "#b98f57", INK, 0.8);
      line(ctx, cx - 5, base - 8, cx - 2, base - 8, WOOD_DARK, 0.6);
    },
  },
  farmer: {
    tunic: "#6fa04a",
    prop: (ctx, cx, base) => {
      line(ctx, cx + 3, base - 1, cx + 3.6, base - 11, "#8b6a45", 1.2);
      rect(ctx, cx + 3, base - 12.2, 3, 1.4, STONE_DARK, INK, 0.6);
    },
  },
  forester: {
    tunic: "#4a7a8a",
    prop: (ctx, cx, base) => {
      line(ctx, cx + 3, base - 2, cx + 4, base - 10, "#8b6a45", 1.2);
      poly(ctx, [[cx + 3.2, base - 10.6], [cx + 6.4, base - 9.6], [cx + 5.6, base - 7.2], [cx + 3.6, base - 8.6]], STONE_LIGHT, INK, 0.6);
    },
  },
  mason: {
    tunic: "#9a5a4a",
    prop: (ctx, cx, base) => {
      line(ctx, cx + 3, base - 3, cx + 4.6, base - 9, "#8b6a45", 1.2);
      rrect(ctx, cx + 3, base - 10.6, 3.8, 2.2, 0.5, STONE_DARK, INK, 0.6);
    },
  },
  scholar: {
    tunic: "#5a5aa8",
    prop: (ctx, cx, base) => {
      rrect(ctx, cx + 2.2, base - 7.4, 3.2, 2.6, 0.4, "#3f6fb8", INK, 0.6);
      line(ctx, cx + 3.8, base - 7.2, cx + 3.8, base - 5, "#f3ecdc", 0.5);
    },
  },
  scout: {
    tunic: "#7a8a4a",
    prop: (ctx, cx, base) => {
      ctx.beginPath();
      ctx.arc(cx + 1.8, base - 8.5, 5, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = "#8b6a45";
      ctx.stroke();
      line(ctx, cx + 2, base - 13.2, cx + 2, base - 3.8, "#e6dcc0", 0.5);
    },
  },
};

for (const trade of Object.keys(TRADES)) {
  defVariants(`unit/villager_${trade}`, 2, 10, 16, BOTTOM, (ctx, w, h, frame) => {
    drawPerson(ctx, frame, { tunic: TRADES[trade].tunic, prop: TRADES[trade].prop });
  });
}

defVariants("unit/soldier", 2, 10, 16, BOTTOM, (ctx, w, h, frame) => {
  drawPerson(ctx, frame, {
    tunic: "#4a5a80",
    prop: (ctx, cx, base) => {
      // Helmet over the hair, a round shield in front, a spear.
      ctx.beginPath();
      ctx.arc(cx, base - 12.4, 3.3, Math.PI, TAU);
      ctx.closePath();
      finish(ctx, "#8a929c", INK, 0.8);
      rect(ctx, cx - 3.3, base - 12.6, 6.6, 1.2, "#6c747e", INK, 0.6);
      line(ctx, cx + 4, base - 15, cx + 4, base - 2, "#8b6a45", 1);
      poly(ctx, [[cx + 3.3, base - 15], [cx + 4, base - 16.5], [cx + 4.7, base - 15]], STONE_LIGHT, INK, 0.5);
      circle(ctx, cx + 2.4, base - 6.5, 2.2, "#c9a03a", INK, 0.8);
      circle(ctx, cx + 2.4, base - 6.5, 0.7, "#7a5a1e", null);
    },
  });
});

defVariants("unit/garlock", 2, 12, 18, BOTTOM, (ctx, w, h, frame) => {
  drawPerson(ctx, frame, {
    cx: 6, base: 17.5, tunic: "#3a3436", skin: "#6f7d5a", hair: "#2a2226",
    prop: (ctx, cx, base) => {
      // Tusks, red eyes, and a big spiked club.
      line(ctx, cx + 0.6, base - 10.6, cx + 0.2, base - 9.2, "#ece6d3", 1);
      line(ctx, cx + 2.2, base - 10.6, cx + 2.6, base - 9.2, "#ece6d3", 1);
      circle(ctx, cx + 1.4, base - 12, 0.6, "#ff3a2a", null);
      line(ctx, cx + 3, base - 4, cx + 5.4, base - 11, "#6f4a2a", 1.6);
      ellipse(ctx, cx + 5.6, base - 12, 1.6, 2.4, "#6f4a2a", INK, 0.7);
      circle(ctx, cx + 6.6, base - 12.6, 0.5, STONE_LIGHT, null);
    },
  });
});

// Ox cart: the ox leads on the right, the cart box behind with one wheel.
defVariants("unit/cart", 2, 18, 12, BOTTOM, (ctx, w, h, frame) => {
  // Ox.
  ellipse(ctx, 12.5, 7.2, 4, 2.6, "#8a5a3a", INK, 0.9);
  circle(ctx, 16, 5.5, 1.9, "#8a5a3a", INK, 0.9);
  line(ctx, 15.3, 4.2, 14.2, 3.2, "#ece6d3", 0.9);
  line(ctx, 16.7, 4.2, 17.6, 3.2, "#ece6d3", 0.9);
  const legOff = frame ? 0.8 : -0.8;
  line(ctx, 10.5, 9, 10.5 + legOff, 11.6, "#5a3a24", 1.3);
  line(ctx, 14.5, 9, 14.5 - legOff, 11.6, "#5a3a24", 1.3);
  // Cart box and the shaft to the ox.
  line(ctx, 6, 8, 11, 8, WOOD_DARK, 1);
  rrect(ctx, 0.8, 3, 7.4, 5.5, 0.8, WOOD, INK, 0.9);
  rect(ctx, 0.8, 3, 7.4, 1.4, WOOD_DARK, null);
  circle(ctx, 4.5, 9.2, 2.4, "#6f4a2a", INK, 0.9);
  const a = frame * Math.PI / 4;
  for (let i = 0; i < 2; i++) {
    const ang = a + i * Math.PI / 2;
    line(ctx, 4.5 - Math.cos(ang) * 2, 9.2 - Math.sin(ang) * 2, 4.5 + Math.cos(ang) * 2, 9.2 + Math.sin(ang) * 2, "#d9b57a", 0.7);
  }
});

function drawBoat(ctx, frame, big) {
  const bob = frame ? -0.8 : 0;
  ctx.save();
  ctx.translate(0, bob);
  if (big) {
    poly(ctx, [[1, 10], [3, 15], [19, 15], [21.5, 9], [18, 10.5]], "#6f4a2a");
    rect(ctx, 3, 10.5, 16, 1.4, "#a87a45", null);
    line(ctx, 8, 10, 8, 1, INK, 1.2);
    line(ctx, 15, 10, 15, 2.5, INK, 1.2);
    poly(ctx, [[8.6, 1.5], [14, 4.5], [8.6, 8.5]], "#f3ecdc");
    poly(ctx, [[15.6, 3], [20, 5.5], [15.6, 8.5]], "#f3ecdc");
    poly(ctx, [[7.4, 2.5], [4, 5], [7.4, 8.5]], "#e6dcc0");
  } else {
    poly(ctx, [[1, 6.5], [3, 9.8], [13, 9.8], [15.5, 6], [12, 7]], "#8a5a3a");
    rect(ctx, 3, 7, 10, 1, "#c99a5e", null);
    line(ctx, 7, 7, 7, 0.8, INK, 1.1);
    poly(ctx, [[7.6, 1.2], [13, 4.2], [7.6, 6.6]], "#f3ecdc");
  }
  ctx.restore();
  // A small wave under the hull; it is what makes the bob read as water.
  ctx.globalAlpha = 0.8;
  line(ctx, big ? 2 : 1.5, big ? 15.4 : 9.6, big ? 9 : 6, big ? 15.4 : 9.6, "#e8f6fb", 1);
  ctx.globalAlpha = 1;
}

defVariants("unit/boat", 2, 16, 10, BOTTOM, (ctx, w, h, frame) => drawBoat(ctx, frame, false));
defVariants("unit/tradeship", 2, 22, 16, BOTTOM, (ctx, w, h, frame) => drawBoat(ctx, frame, true));

// Four-legged animals share one body plan: body ellipse, head, ears, legs
// that alternate per frame. `o` customises colour and the head decoration.
function drawQuadruped(ctx, frame, o) {
  const body = o.body;
  const legDark = shade(body, -0.35);
  const step = frame ? 1 : -1;
  line(ctx, 4, 7.5, 4 - step, 9.8, legDark, 1.3);
  line(ctx, 8, 7.5, 8 + step, 9.8, legDark, 1.3);
  line(ctx, 5.5, 7.5, 5.5 + step * 0.6, 9.8, legDark, 1.1);
  line(ctx, 9.5, 7.5, 9.5 - step * 0.6, 9.8, legDark, 1.1);
  ellipse(ctx, 6.5, 6, 4.2, 2.4 * (o.fluffy ? 1.15 : 1), body, INK, 0.9);
  if (o.fluffy) {
    circle(ctx, 4, 5, 1.6, body, null);
    circle(ctx, 8.5, 4.6, 1.6, body, null);
  }
  ellipse(ctx, 6.5, 6.6, 2.8, 1.2, shade(body, -0.18), null);
  circle(ctx, 10.4, 4.2, 1.6, o.head || body, INK, 0.9);
  circle(ctx, 11, 4, 0.4, INK, null);
  if (o.ears) {
    line(ctx, 9.6, 3, 9, 1.8, INK, 1.1);
    line(ctx, 10.8, 2.8, 11, 1.6, INK, 1.1);
  }
  if (o.decor) o.decor(ctx);
}

defVariants("unit/deer", 2, 12, 10, BOTTOM, (ctx, w, h, frame) => {
  drawQuadruped(ctx, frame, {
    body: "#c48a55",
    decor: (ctx) => {
      line(ctx, 9.8, 3, 8.6, 0.6, "#6b4423", 0.8);
      line(ctx, 9.2, 1.6, 8.2, 1.4, "#6b4423", 0.8);
      line(ctx, 10.8, 2.8, 11.6, 0.6, "#6b4423", 0.8);
      line(ctx, 11.2, 1.6, 12, 1.5, "#6b4423", 0.8);
      line(ctx, 2.6, 5, 1.5, 4, "#c48a55", 1);
    },
  });
});

defVariants("unit/boar", 2, 12, 10, BOTTOM, (ctx, w, h, frame) => {
  drawQuadruped(ctx, frame, {
    body: "#5a4438",
    decor: (ctx) => {
      line(ctx, 11.2, 5.2, 12, 6, "#ece6d3", 0.9);
      line(ctx, 3, 5, 5, 4.2, "#3a2c22", 1);
    },
  });
});

defVariants("unit/sheep", 2, 12, 10, BOTTOM, (ctx, w, h, frame) => {
  drawQuadruped(ctx, frame, { body: "#f2eee6", head: "#3a3434", fluffy: true, ears: false });
});

defVariants("unit/wolf", 2, 12, 10, BOTTOM, (ctx, w, h, frame) => {
  drawQuadruped(ctx, frame, {
    body: "#7c7d82",
    ears: true,
    decor: (ctx) => {
      line(ctx, 2.6, 5.4, 0.8, 3.6, "#7c7d82", 1.4);
      circle(ctx, 11, 4, 0.45, "#ffd23f", null);
    },
  });
});

defVariants("unit/bird", 2, 8, 6, BOTTOM, (ctx, w, h, frame) => {
  const y = frame ? 1.5 : 4.5;
  ctx.beginPath();
  ctx.moveTo(0.5, y);
  ctx.quadraticCurveTo(2.5, frame ? 4 : 1.5, 4, 3.5);
  ctx.quadraticCurveTo(5.5, frame ? 4 : 1.5, 7.5, y);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = "#2f2a30";
  ctx.lineCap = "round";
  ctx.stroke();
  circle(ctx, 4, 3.6, 0.9, "#2f2a30", null);
});

defVariants("unit/heron", 2, 10, 14, BOTTOM, (ctx, w, h, frame) => {
  const grey = "#8fa3b3";
  line(ctx, 4.5, 9, 4.5, 13.5, INK, 0.8);
  line(ctx, 6, 9, 6 + (frame ? 1.2 : 0), frame ? 11 : 13.5, INK, 0.8);
  ellipse(ctx, 5, 7.5, 3.4, 2, grey, INK, 0.9);
  ellipse(ctx, 4.2, 7.2, 2, 1, shade(grey, -0.2), null);
  polyline(ctx, [[7.5, 6.5], [8.2, 3.5], [7.6, 1.8]], grey, 1.3);
  circle(ctx, 7.6, 1.8, 1.2, grey, INK, 0.8);
  line(ctx, 8.4, 1.8, 10.2, 2.3, "#e6a53a", 0.9);
  circle(ctx, 8, 1.6, 0.35, INK, null);
});

defVariants("unit/fish", 2, 10, 6, BOTTOM, (ctx, w, h, frame) => {
  const blue = "#6aa8c8";
  const tailY = frame ? -1 : 1;
  poly(ctx, [[1, 3 - tailY * 1.6], [3, 3], [1, 3 + tailY * 1.6]], blue, INK, 0.7);
  ellipse(ctx, 5.5, 3, 3, 1.7, blue, INK, 0.8);
  ellipse(ctx, 5.5, 3.5, 2, 0.8, "#d8ecf5", null);
  circle(ctx, 7.4, 2.6, 0.35, INK, null);
});

// ===========================================================================
// FX (centre anchored)
// ===========================================================================

defVariants("fx/cloud", 3, 120, 60, CENTER, (ctx, w, h, v, rng) => {
  const puffs = [[60, 34, 34, 20], [32, 38, 22, 14], [88, 38, 24, 14], [50, 26, 20, 14], [74, 24, 22, 15]];
  for (const [x, y, rx, ry] of puffs) {
    softDisc(ctx, x + rand(rng, -4, 4), y + rand(rng, -3, 3), rx * rand(rng, 0.9, 1.1), ry, "#ffffff", 0.9, 0.5);
  }
  if (v === 2) softDisc(ctx, 40, 30, 20, 12, "#ffffff", 0.7, 0.5);
});

def("fx/raindrop", 4, 10, CENTER, (ctx) => {
  ctx.globalAlpha = 0.75;
  line(ctx, 3.2, 0.8, 0.8, 9.2, "#cfe8f6", 1.1);
  ctx.globalAlpha = 1;
});

def("fx/snowflake", 6, 6, CENTER, (ctx) => {
  softDisc(ctx, 3, 3, 3, 3, "#ffffff", 1, 0.45);
  circle(ctx, 3, 3, 1.3, "#ffffff", null);
});

def("fx/petal", 5, 5, CENTER, (ctx) => {
  ellipse(ctx, 2.5, 2.5, 2.2, 1.3, "#f7a8c8", "#d97aa5", 0.6, 0.6);
});

def("fx/leaf", 6, 6, CENTER, (ctx) => {
  ellipse(ctx, 3, 3, 2.7, 1.5, "#e5872a", "#a8521a", 0.6, -0.7);
  line(ctx, 1.4, 4.4, 4.6, 1.6, "#a8521a", 0.5);
});

defVariants("fx/smoke", 2, 12, 12, CENTER, (ctx, w, h, v) => {
  softDisc(ctx, 6, 6, 6, 6, "#d8d4d0", 0.55, 0.5);
  softDisc(ctx, 4 + v * 3, 5, 3.5, 3.5, "#ececea", 0.5, 0.4);
});

def("fx/spark", 4, 4, CENTER, (ctx) => {
  softDisc(ctx, 2, 2, 2, 2, "#ffd85a", 1, 0.4);
  circle(ctx, 2, 2, 0.8, "#fff6c8", null);
});

def("fx/glow", 32, 32, CENTER, (ctx) => {
  softDisc(ctx, 16, 16, 16, 16, "#ffffff", 1, 0.3);
});

def("fx/shadow", 16, 8, CENTER, (ctx) => {
  softDisc(ctx, 8, 4, 8, 4, "#000000", 0.6, 0.55);
});

// The banner: a dark pole with a white pennant. Tinting the sprite colours
// the cloth while the pole stays dark (dark * tint is still dark).
def("fx/flag", 10, 14, CENTER, (ctx) => {
  line(ctx, 2, 13.5, 2, 0.8, "#2a2420", 1.4);
  poly(ctx, [[2.6, 1.2], [9.5, 3.6], [2.6, 6.4]], "#ffffff", "#2a2420", 0.8);
});

// ===========================================================================
// UI (centre anchored; white so they can be tinted at runtime)
// ===========================================================================

const HEX_W = Math.ceil(Math.sqrt(3) * HEX_SIZE) + 2;
const HEX_H = HEX_SIZE * 2 + 2;

function traceHex(ctx, inset = 0) {
  const pts = hexCorners(HEX_W / 2, HEX_H / 2, HEX_SIZE - inset);
  tracePoly(ctx, pts);
}

def("ui/hex_fill", HEX_W, HEX_H, CENTER, (ctx) => {
  traceHex(ctx);
  finish(ctx, "#ffffff", null);
});

def("ui/hex_outline", HEX_W, HEX_H, CENTER, (ctx) => {
  traceHex(ctx, 1);
  finish(ctx, null, "#ffffff", 2);
});

def("ui/hex_dashed", HEX_W, HEX_H, CENTER, (ctx) => {
  traceHex(ctx, 1.5);
  ctx.setLineDash([4, 3]);
  finish(ctx, null, "#ffffff", 2);
  ctx.setLineDash([]);
});

def("ui/icon_food", 12, 12, CENTER, (ctx) => {
  circle(ctx, 6, 6.8, 4.2, "#ff8a1f", INK, 0.9);
  ellipse(ctx, 4.6, 5.4, 1.4, 0.9, "#ffc078", null, 0, -0.6);
  ellipse(ctx, 7.6, 2.4, 2, 1.1, "#5faf48", INK, 0.7, -0.5);
  line(ctx, 6, 3.2, 6, 1.4, INK, 0.9);
});

def("ui/icon_wood", 12, 12, CENTER, (ctx) => {
  rect(ctx, 1, 3.5, 9, 5, WOOD_DARK, INK, 0.9);
  ellipse(ctx, 9.6, 6, 1.9, 2.5, "#d9b57a", INK, 0.9);
  ellipse(ctx, 9.6, 6, 0.8, 1.1, "#b98f57", null);
  line(ctx, 2.5, 5, 7.5, 5, "#5b3a1e", 0.7);
  line(ctx, 2.5, 7.2, 7.5, 7.2, "#5b3a1e", 0.7);
});

def("ui/icon_stone", 12, 12, CENTER, (ctx) => {
  poly(ctx, [[1.5, 9.5], [1.5, 5], [5, 2], [10.5, 3.5], [10.5, 8.5], [6.5, 10.5]], STONE_LIGHT);
  poly(ctx, [[6.5, 6], [10.5, 3.5], [10.5, 8.5], [6.5, 10.5]], STONE_DARK, null);
  poly(ctx, [[1.5, 9.5], [1.5, 5], [6.5, 6], [6.5, 10.5]], STONE, null);
  poly(ctx, [[1.5, 9.5], [1.5, 5], [5, 2], [10.5, 3.5], [10.5, 8.5], [6.5, 10.5]], null, INK);
  line(ctx, 1.5, 5, 6.5, 6, INK, 0.6);
  line(ctx, 6.5, 6, 6.5, 10.5, INK, 0.6);
  line(ctx, 6.5, 6, 10.5, 3.5, INK, 0.6);
});

def("ui/icon_grain", 12, 12, CENTER, (ctx) => {
  line(ctx, 6, 11.5, 6, 4, "#b98f2e", 1.1);
  for (let i = 0; i < 3; i++) {
    const y = 3 + i * 2.2;
    ellipse(ctx, 4.4, y + 0.6, 1.7, 0.9, "#e6c34f", INK, 0.6, -0.7);
    ellipse(ctx, 7.6, y + 0.6, 1.7, 0.9, "#e6c34f", INK, 0.6, 0.7);
  }
  ellipse(ctx, 6, 1.8, 0.9, 1.5, "#e6c34f", INK, 0.6);
});

def("ui/marker_explore", 16, 18, CENTER, (ctx) => {
  line(ctx, 4, 17, 4, 1.5, INK, 2.2);
  line(ctx, 4, 17, 4, 1.5, "#f3ecdc", 1);
  poly(ctx, [[4.8, 2], [14.5, 5], [4.8, 8.5]], "#ffffff", INK, 0.9);
  circle(ctx, 4, 17, 1.4, INK, null);
});

def("ui/marker_seize", 16, 16, CENTER, (ctx) => {
  for (const [x0, y0, x1, y1] of [[2.5, 13.5, 13.5, 2.5], [13.5, 13.5, 2.5, 2.5]]) {
    line(ctx, x0, y0, x1, y1, INK, 3);
    line(ctx, x0, y0, x1, y1, "#ffffff", 1.4);
    line(ctx, x0, y0, x0 + (x1 - x0) * 0.22, y0 + (y1 - y0) * 0.22, "#8b6a45", 1.6);
  }
});

// One corner of the selection: two arms meeting at the sprite centre at a
// 120 degree angle (the interior angle of a hexagon) so the six copies wrap
// the hex corners exactly. Rotate by the corner's inward direction.
def("ui/select_bracket", 16, 16, CENTER, (ctx) => {
  const cx = 8, cy = 8, len = 6.5;
  const arms = [[Math.cos(-Math.PI / 3), Math.sin(-Math.PI / 3)], [Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)]];
  for (const [dx, dy] of arms) line(ctx, cx, cy, cx + dx * len, cy + dy * len, INK, 3.4);
  for (const [dx, dy] of arms) line(ctx, cx, cy, cx + dx * len, cy + dy * len, "#ffffff", 1.8);
});

// ===========================================================================
// Packing and texture creation
// ===========================================================================

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Shelf packer: sprites are placed left to right on a shelf; when one does
// not fit, a new shelf starts below the tallest sprite of the current one.
// Sprites are sorted by height first so shelves waste little space.
class Pages {
  constructor(scale) {
    this.scale = scale;
    this.pages = [];
    this.newPage();
  }

  newPage() {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_SIZE;
    canvas.height = PAGE_SIZE;
    const ctx = canvas.getContext("2d");
    this.current = { canvas, ctx, shelfY: 0, shelfH: 0, cursorX: 0 };
    this.pages.push(this.current);
    return this.current;
  }

  place(pw, ph) {
    let page = this.current;
    if (page.cursorX + pw > PAGE_SIZE) {
      page.shelfY += page.shelfH;
      page.shelfH = 0;
      page.cursorX = 0;
    }
    if (page.shelfY + ph > PAGE_SIZE) page = this.newPage();
    const slot = { page, x: page.cursorX, y: page.shelfY };
    page.cursorX += pw;
    page.shelfH = Math.max(page.shelfH, ph);
    return slot;
  }
}

class Atlas {
  constructor(PIXI, scale) {
    this.PIXI = PIXI;
    this.scale = scale;
    this.textures = new Map();
    this.variantCounts = new Map();
    this.sources = [];
    this.warned = new Set();
    this.missing = null;
    this.pages = null;
  }

  texture(key) {
    const tex = this.textures.get(key);
    if (tex) return tex;
    if (!this.warned.has(key)) {
      this.warned.add(key);
      console.warn(`[atlas] missing texture "${key}"`);
    }
    return this.missing;
  }

  has(key) {
    return this.textures.has(key);
  }

  variants(base) {
    return this.variantCounts.get(base) || 0;
  }

  keys() {
    return Array.from(this.textures.keys());
  }

  destroy() {
    for (const source of this.sources) source.destroy();
    this.textures.clear();
  }
}

export async function buildAtlas(PIXI, { scale = 2 } = {}) {
  const started = performance.now();
  const atlas = new Atlas(PIXI, scale);
  const pages = new Pages(scale);
  const padPx = PAD * scale;

  // Tall sprites first: the shelf packer wastes less vertical space that
  // way. The missing-texture hex goes in too, so it lives on a real page.
  const entries = SPRITES.slice();
  entries.push({ key: "missing", w: HEX_W, h: HEX_H, anchor: CENTER, variant: 0, draw: (ctx) => {
    traceHex(ctx);
    finish(ctx, "#ff00ff", "#5a005a", 1.5);
  } });
  entries.sort((a, b) => b.h - a.h || b.w - a.w);

  const placed = [];
  for (const entry of entries) {
    const pw = Math.ceil((entry.w + PAD * 2) * scale);
    const ph = Math.ceil((entry.h + PAD * 2) * scale);
    const slot = pages.place(pw, ph);
    const ctx = slot.page.ctx;
    ctx.save();
    // Clip to the sprite box so an over-enthusiastic shape never bleeds
    // into a neighbour, then draw in nominal units.
    ctx.beginPath();
    ctx.rect(slot.x + padPx, slot.y + padPx, entry.w * scale, entry.h * scale);
    ctx.clip();
    ctx.translate(slot.x + padPx, slot.y + padPx);
    ctx.scale(scale, scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const rng = createRandom(hashString(entry.key));
    entry.draw(ctx, entry.w, entry.h, entry.variant, rng);
    ctx.restore();
    placed.push({ entry, slot });
  }

  // One texture source per page; frames are in logical (world) units
  // because the source's `resolution` divides the pixel size.
  const sources = pages.pages.map((page) => new PIXI.CanvasSource({
    resource: page.canvas,
    resolution: scale,
    scaleMode: "linear",
    autoGenerateMipmaps: true,
    alphaMode: "premultiply-alpha-on-upload",
    label: "atlas-page",
  }));
  atlas.sources = sources;
  atlas.pages = pages.pages.map((p) => p.canvas);

  // Textures are registered in definition order (not pack order) so
  // `keys()` lists the atlas the way this file reads: decor, landmarks...
  placed.sort((a, b) => SPRITES.indexOf(a.entry) - SPRITES.indexOf(b.entry));
  for (const { entry, slot } of placed) {
    const source = sources[pages.pages.indexOf(slot.page)];
    const frame = new PIXI.Rectangle(slot.x / scale + PAD, slot.y / scale + PAD, entry.w, entry.h);
    const texture = new PIXI.Texture({ source, frame, defaultAnchor: { x: entry.anchor.x, y: entry.anchor.y }, label: entry.key });
    atlas.textures.set(entry.key, texture);
    const m = /^(.*)_(\d+)$/.exec(entry.key);
    if (m) atlas.variantCounts.set(m[1], Math.max(atlas.variantCounts.get(m[1]) || 0, Number(m[2]) + 1));
  }
  atlas.missing = atlas.textures.get("missing");
  atlas.textures.delete("missing");

  const ms = performance.now() - started;
  console.info(`[atlas] ${atlas.textures.size} sprites on ${sources.length} page(s) in ${ms.toFixed(0)} ms`);
  return atlas;
}

// Exposed for the preview page and for tests: the nominal size table.
export function atlasSpriteList() {
  return SPRITES.map((s) => ({ key: s.key, w: s.w, h: s.h, anchor: s.anchor }));
}
