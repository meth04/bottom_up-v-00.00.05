// artStyle.js
//
// The game's art: clean 2D cartoon tiles and little sprites (trees, rocks,
// houses, villagers), all drawn as SVG so they scale with the map. The
// world painter, the buildings layer and the villagers layer are built out
// of these. Nothing in here knows about tiles or game state.

const ART_SVG_NS = "http://www.w3.org/2000/svg";

const ART_COLORS = {
  // ground
  plains: "#d8c979",
  meadow: "#93c85f",
  forest: "#68ab4d",
  thicket: "#468f42",
  outcrop: "#b6a081",
  mountain: "#a3a3a3",
  terrace: "#cdb86e",
  homeGround: "#8bc85b",
  water: "#3f9ad8",
  waterLight: "#8fd0f4",
  waterDeep: "#2b7ec0",
  foam: "#e9f7ff",
  tileEdge: "rgba(40, 30, 20, 0.16)",
  // sprites
  trunk: "#7a4f2a",
  canopyDark: "#2f7a37",
  canopy: "#43a047",
  canopyLight: "#7ccb5a",
  rock: "#8f8f8f",
  rockLight: "#bdbdbd",
  rockDark: "#6a6a6a",
  snow: "#f6f6f6",
  wheat: "#e3c24c",
  wheatDark: "#b8962f",
  flowers: ["#ff6fa3", "#ffb347", "#ffffff", "#c77dff"],
  terraceLine: "#9c8447",
  house: "#f3e7cb",
  houseShade: "#d9c9a3",
  roof: "#b8553d",
  roofDark: "#8f3f2e",
  door: "#5a3b22",
  barn: "#a94b3e",
  barnRoof: "#5e3a2b",
  road: "#b48a5a",
  roadEdge: "#8a6a44",
  ink: "#3a2f28",
  skin: "#f1c9a5",
  tunics: ["#d9a441", "#5b8def", "#e07b53", "#9b7bd6", "#4fb286", "#e2c04f"],
  soldier: "#4a5a7a",
  shield: "#c9a227",
  fog: "#1a222c",
};

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

// Deterministic pseudo-random generator: the same seed always draws the
// same map, and decorations never reshuffle between renders.
function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function svgEl(name, attributes) {
  const element = document.createElementNS(ART_SVG_NS, name);
  for (const key of Object.keys(attributes || {})) {
    element.setAttribute(key, attributes[key]);
  }
  return element;
}

// A group that css/style.css can animate around a fixed point.
function animatedGroup(className, originX, originY, delaySeconds) {
  const group = svgEl("g", { class: className });
  group.style.transformOrigin = `${originX}px ${originY}px`;
  group.style.transformBox = "view-box";
  group.style.animationDelay = `${delaySeconds.toFixed(2)}s`;
  return group;
}

// Smooth (Catmull-Rom -> cubic Bezier) path through the given points.
function smoothPath(points, closed) {
  const count = points.length;
  const at = (index) => {
    if (closed) return points[((index % count) + count) % count];
    return points[Math.max(0, Math.min(count - 1, index))];
  };
  let d = `M ${at(0)[0]} ${at(0)[1]}`;
  const segments = closed ? count : count - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`;
  }
  return closed ? d + " Z" : d;
}

function pick(list, random) {
  return list[Math.floor(random() * list.length) % list.length];
}

// The "x,y x,y ..." points of a pointy-top hexagon.
function hexPoints(centerX, centerY, size) {
  const points = [];
  for (let corner = 0; corner < 6; corner++) {
    const angle = (Math.PI / 180) * (60 * corner - 30);
    points.push(`${centerX + size * Math.cos(angle)},${centerY + size * Math.sin(angle)}`);
  }
  return points.join(" ");
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

function paintHexBase(parent, x, y, size, fill) {
  parent.appendChild(svgEl("polygon", {
    points: hexPoints(x, y, size),
    fill,
    stroke: ART_COLORS.tileEdge,
    "stroke-width": 1,
    "stroke-linejoin": "round",
  }));
}

// ---------------------------------------------------------------------------
// Sprites: nature
// ---------------------------------------------------------------------------

function paintTree(parent, x, y, scale, random) {
  const s = scale;
  parent.appendChild(svgEl("rect", { x: x - s * 0.08, y: y - s * 0.05, width: s * 0.16, height: s * 0.4, rx: s * 0.04, fill: ART_COLORS.trunk }));
  parent.appendChild(svgEl("circle", { cx: x, cy: y - s * 0.12, r: s * 0.34, fill: ART_COLORS.canopyDark }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.1, cy: y - s * 0.22, r: s * 0.26, fill: ART_COLORS.canopy }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.16, cy: y - s * 0.3, r: s * 0.12, fill: ART_COLORS.canopyLight, opacity: 0.8 }));
}

function paintBush(parent, x, y, scale, random) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y, rx: s * 0.3, ry: s * 0.2, fill: ART_COLORS.canopyDark }));
  parent.appendChild(svgEl("ellipse", { cx: x - s * 0.08, cy: y - s * 0.06, rx: s * 0.2, ry: s * 0.13, fill: ART_COLORS.canopy }));
}

function paintRock(parent, x, y, scale, random) {
  const s = scale;
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.3},${y + s * 0.15} ${x - s * 0.18},${y - s * 0.16} ${x + s * 0.06},${y - s * 0.22} ${x + s * 0.3},${y + s * 0.02} ${x + s * 0.2},${y + s * 0.18}`,
    fill: ART_COLORS.rock, stroke: ART_COLORS.rockDark, "stroke-width": 1, "stroke-linejoin": "round",
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.18},${y - s * 0.16} ${x + s * 0.06},${y - s * 0.22} ${x + s * 0.02},${y - s * 0.02} ${x - s * 0.12},${y}`,
    fill: ART_COLORS.rockLight, opacity: 0.9,
  }));
}

function paintMountain(parent, x, y, scale, random) {
  const s = scale;
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.5},${y + s * 0.32} ${x},${y - s * 0.42} ${x + s * 0.5},${y + s * 0.32}`,
    fill: ART_COLORS.rockDark,
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x},${y - s * 0.42} ${x + s * 0.5},${y + s * 0.32} ${x + s * 0.02},${y + s * 0.32}`,
    fill: ART_COLORS.rock,
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.13},${y - s * 0.2} ${x},${y - s * 0.42} ${x + s * 0.13},${y - s * 0.2} ${x + s * 0.05},${y - s * 0.14} ${x - s * 0.04},${y - s * 0.18}`,
    fill: ART_COLORS.snow,
  }));
}

function paintWheat(parent, x, y, scale, random) {
  const s = scale;
  for (let i = 0; i < 3; i++) {
    const bx = x + (i - 1) * s * 0.18 + (random() - 0.5) * s * 0.06;
    parent.appendChild(svgEl("path", {
      d: `M ${bx} ${y + s * 0.18} L ${bx} ${y - s * 0.1} M ${bx - s * 0.06} ${y - s * 0.02} L ${bx} ${y - s * 0.1} L ${bx + s * 0.06} ${y - s * 0.02}`,
      fill: "none", stroke: ART_COLORS.wheatDark, "stroke-width": 1.4, "stroke-linecap": "round",
    }));
  }
}

function paintFlowerDots(parent, x, y, scale, random) {
  const dots = 3 + Math.floor(random() * 3);
  for (let i = 0; i < dots; i++) {
    parent.appendChild(svgEl("circle", {
      cx: x + (random() - 0.5) * scale * 0.9,
      cy: y + (random() - 0.5) * scale * 0.7,
      r: 1.8, fill: pick(ART_COLORS.flowers, random),
    }));
  }
}

function paintTerraceStripes(parent, x, y, scale, random) {
  for (let i = -1; i <= 1; i++) {
    const yy = y + i * scale * 0.28;
    parent.appendChild(svgEl("path", {
      d: `M ${x - scale * 0.42} ${yy + 2} q ${scale * 0.42} ${-6} ${scale * 0.84} 0`,
      fill: "none", stroke: ART_COLORS.terraceLine, "stroke-width": 1.4, opacity: 0.8,
    }));
  }
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

function offsetCenterline(centerline, offset) {
  return centerline.map((point, index) => {
    const prev = centerline[Math.max(0, index - 1)];
    const next = centerline[Math.min(centerline.length - 1, index + 1)];
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const length = Math.hypot(tx, ty) || 1;
    tx /= length;
    ty /= length;
    return [point[0] - ty * offset, point[1] + tx * offset];
  });
}

function buildRiverBand(centerline, halfWidths, inset) {
  const left = [];
  const right = [];
  for (let i = 0; i < centerline.length; i++) {
    const prev = centerline[Math.max(0, i - 1)];
    const next = centerline[Math.min(centerline.length - 1, i + 1)];
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const length = Math.hypot(tx, ty) || 1;
    tx /= length;
    ty /= length;
    const halfWidth = Math.max(3, halfWidths[i] + inset);
    left.push([centerline[i][0] - ty * halfWidth, centerline[i][1] + tx * halfWidth]);
    right.push([centerline[i][0] + ty * halfWidth, centerline[i][1] - tx * halfWidth]);
  }
  return left.concat(right.reverse());
}

// A river as one brushed band, with foam lines that css/style.css sets flowing.
function paintRiver(parent, centerline, halfWidths) {
  if (centerline.length < 2) return;
  const bands = [
    { inset: 6, fill: ART_COLORS.waterLight },
    { inset: 0, fill: ART_COLORS.water },
    { inset: -5, fill: ART_COLORS.waterDeep },
  ];
  for (const band of bands) {
    parent.appendChild(svgEl("path", {
      d: smoothPath(buildRiverBand(centerline, halfWidths, band.inset), true),
      fill: band.fill,
    }));
  }
  for (const offset of [-4, 4]) {
    parent.appendChild(svgEl("path", {
      d: smoothPath(offsetCenterline(centerline, offset), false),
      class: "art-river-flow",
      fill: "none", stroke: ART_COLORS.foam, "stroke-width": 2, "stroke-linecap": "round",
      "stroke-dasharray": "14 22", opacity: 0.7,
    }));
  }
}

function paintPool(parent, x, y, size) {
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y, rx: size * 0.92, ry: size * 0.66, fill: ART_COLORS.waterLight }));
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y, rx: size * 0.74, ry: size * 0.5, fill: ART_COLORS.water }));
  parent.appendChild(svgEl("ellipse", { cx: x + 2, cy: y + 2, rx: size * 0.4, ry: size * 0.26, fill: ART_COLORS.waterDeep }));
  for (let i = 0; i < 2; i++) {
    const ring = svgEl("ellipse", {
      cx: x, cy: y, rx: size * 0.2, ry: size * 0.13,
      class: "art-ripple", fill: "none", stroke: ART_COLORS.foam, "stroke-width": 1.5,
    });
    ring.style.transformOrigin = `${x}px ${y}px`;
    ring.style.transformBox = "view-box";
    ring.style.animationDelay = `${i * 1.5}s`;
    parent.appendChild(ring);
  }
}

// ---------------------------------------------------------------------------
// Sprites: buildings and roads
// ---------------------------------------------------------------------------

function paintHouse(parent, x, y, scale, roofColor) {
  const s = scale;
  parent.appendChild(svgEl("rect", { x: x - s * 0.3, y: y - s * 0.16, width: s * 0.6, height: s * 0.42, fill: ART_COLORS.house, stroke: ART_COLORS.ink, "stroke-width": 1 }));
  parent.appendChild(svgEl("rect", { x: x + s * 0.02, y: y - s * 0.16, width: s * 0.28, height: s * 0.42, fill: ART_COLORS.houseShade, opacity: 0.6 }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.36},${y - s * 0.14} ${x},${y - s * 0.46} ${x + s * 0.36},${y - s * 0.14}`,
    fill: roofColor || ART_COLORS.roof, stroke: ART_COLORS.ink, "stroke-width": 1, "stroke-linejoin": "round",
  }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.08, y: y + s * 0.04, width: s * 0.16, height: s * 0.22, fill: ART_COLORS.door }));
}

function paintBarn(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("rect", { x: x - s * 0.36, y: y - s * 0.12, width: s * 0.72, height: s * 0.4, fill: ART_COLORS.barn, stroke: ART_COLORS.ink, "stroke-width": 1 }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.4},${y - s * 0.1} ${x - s * 0.22},${y - s * 0.34} ${x + s * 0.22},${y - s * 0.34} ${x + s * 0.4},${y - s * 0.1}`,
    fill: ART_COLORS.barnRoof, stroke: ART_COLORS.ink, "stroke-width": 1, "stroke-linejoin": "round",
  }));
  parent.appendChild(svgEl("path", {
    d: `M ${x - s * 0.12} ${y + s * 0.28} v ${-s * 0.24} h ${s * 0.24} v ${s * 0.24} M ${x - s * 0.12} ${y + s * 0.04} l ${s * 0.24} ${s * 0.24} M ${x + s * 0.12} ${y + s * 0.04} l ${-s * 0.24} ${s * 0.24}`,
    fill: "none", stroke: ART_COLORS.house, "stroke-width": 1,
  }));
}

function paintCampfire(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("path", { d: `M ${x - s * 0.14} ${y + s * 0.1} l ${s * 0.28} ${-s * 0.12} M ${x - s * 0.14} ${y - s * 0.02} l ${s * 0.28} ${s * 0.12}`, stroke: ART_COLORS.trunk, "stroke-width": 2, "stroke-linecap": "round" }));
  const flame = svgEl("path", { d: `M ${x} ${y - s * 0.24} q ${s * 0.14} ${s * 0.12} 0 ${s * 0.28} q ${-s * 0.14} ${-s * 0.16} 0 ${-s * 0.28} z`, fill: "#ff9a3c", class: "art-flame" });
  flame.style.transformOrigin = `${x}px ${y + s * 0.04}px`;
  flame.style.transformBox = "view-box";
  parent.appendChild(flame);
}

function paintBanner(parent, x, y, scale, color) {
  const s = scale;
  parent.appendChild(svgEl("line", { x1: x, y1: y + s * 0.2, x2: x, y2: y - s * 0.5, stroke: ART_COLORS.ink, "stroke-width": 1.5 }));
  parent.appendChild(svgEl("path", { d: `M ${x} ${y - s * 0.5} l ${s * 0.3} ${s * 0.1} l ${-s * 0.3} ${s * 0.1} z`, fill: color, stroke: ART_COLORS.ink, "stroke-width": 1 }));
}

// A dirt path along a list of points.
function paintRoad(parent, points) {
  if (points.length < 2) return;
  const d = points.map((p, i) => `${i ? "L" : "M"} ${p[0]} ${p[1]}`).join(" ");
  parent.appendChild(svgEl("path", { d, fill: "none", stroke: ART_COLORS.roadEdge, "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.7 }));
  parent.appendChild(svgEl("path", { d, fill: "none", stroke: ART_COLORS.road, "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" }));
}

// ---------------------------------------------------------------------------
// Sprites: people. Drawn at the origin; the villagers layer moves the group.
// ---------------------------------------------------------------------------

function paintVillager(parent, scale, tunicColor, isSoldier) {
  const s = scale;
  const body = svgEl("g", { class: "villager__body" });
  body.appendChild(svgEl("ellipse", { cx: 0, cy: s * 0.42, rx: s * 0.22, ry: s * 0.07, fill: "rgba(0,0,0,0.25)" }));
  body.appendChild(svgEl("rect", { x: -s * 0.12, y: s * 0.18, width: s * 0.09, height: s * 0.22, fill: ART_COLORS.ink, class: "villager__leg villager__leg--left" }));
  body.appendChild(svgEl("rect", { x: s * 0.03, y: s * 0.18, width: s * 0.09, height: s * 0.22, fill: ART_COLORS.ink, class: "villager__leg villager__leg--right" }));
  body.appendChild(svgEl("rect", { x: -s * 0.17, y: -s * 0.08, width: s * 0.34, height: s * 0.32, rx: s * 0.08, fill: isSoldier ? ART_COLORS.soldier : tunicColor, stroke: ART_COLORS.ink, "stroke-width": 1 }));
  body.appendChild(svgEl("circle", { cx: 0, cy: -s * 0.2, r: s * 0.14, fill: ART_COLORS.skin, stroke: ART_COLORS.ink, "stroke-width": 1 }));
  if (isSoldier) {
    body.appendChild(svgEl("path", { d: `M ${-s * 0.16} ${-s * 0.34} q ${s * 0.16} ${-s * 0.12} ${s * 0.32} 0 v ${s * 0.06} h ${-s * 0.32} z`, fill: ART_COLORS.soldier, stroke: ART_COLORS.ink, "stroke-width": 1 }));
    body.appendChild(svgEl("path", { d: `M ${s * 0.16} ${-s * 0.04} h ${s * 0.16} v ${s * 0.18} q ${-s * 0.08} ${s * 0.1} ${-s * 0.16} 0 z`, fill: ART_COLORS.shield, stroke: ART_COLORS.ink, "stroke-width": 1 }));
  } else {
    body.appendChild(svgEl("path", { d: `M ${-s * 0.15} ${-s * 0.26} q ${s * 0.15} ${-s * 0.14} ${s * 0.3} 0`, fill: "none", stroke: ART_COLORS.trunk, "stroke-width": 2, "stroke-linecap": "round" }));
  }
  parent.appendChild(body);
  return body;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ART_COLORS, createRandom, svgEl, animatedGroup, smoothPath, pick, hexPoints,
    paintHexBase, paintTree, paintBush, paintRock, paintMountain, paintWheat, paintFlowerDots,
    paintTerraceStripes, paintRiver, paintPool, paintHouse, paintBarn, paintCampfire, paintBanner,
    paintRoad, paintVillager,
  };
}
