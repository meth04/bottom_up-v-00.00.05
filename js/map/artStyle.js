// artStyle.js
//
// The game's art: clean 2D cartoon tiles and little sprites (trees, rocks,
// houses, villagers), all drawn as SVG so they scale with the map. The
// world painter, the buildings layer and the villagers layer are built out
// of these. Nothing in here knows about tiles or game state.

const ART_SVG_NS = "http://www.w3.org/2000/svg";

const ART_COLORS = {
  // ground
  plains: "#d4be72",
  plainsHighlight: "#e0cc84",
  meadow: "#88bd5a",
  forest: "#468538",
  thicket: "#336932",
  outcrop: "#9e8b72",
  mountain: "#787572",
  terrace: "#bca563",
  homeGround: "#78b84e",
  water: "#3d82a1",
  waterLight: "#73b7cd",
  waterDeep: "#24526d",
  sand: "#d8c497",
  sandDark: "#b8a375",
  foam: "#eaf6fa",
  tileEdge: "rgba(45, 32, 20, 0.18)",
  // sprites
  trunk: "#6f4625",
  trunkShade: "#4a2c14",
  canopyDark: "#23542a",
  canopy: "#388e3c",
  canopyLight: "#66bb6a",
  pineCanopy: "#1e4d30",
  pineCanopyLight: "#357049",
  autumnCanopy: "#c85b23",
  autumnLight: "#e59123",
  rock: "#828282",
  rockLight: "#b5b5b5",
  rockDark: "#525252",
  snow: "#f8fafc",
  snowShade: "#cbd5e1",
  wheat: "#e6c34f",
  wheatDark: "#b5902b",
  flowers: ["#f472b6", "#fbbf24", "#ffffff", "#c084fc", "#f87171"],
  terraceLine: "#8e7539",
  house: "#f2e4c8",
  houseShade: "#d4c29a",
  roof: "#b34e38",
  roofDark: "#853525",
  door: "#52331c",
  barn: "#a24236",
  barnRoof: "#543023",
  road: "#ad8354",
  roadEdge: "#7d5d39",
  ink: "#332720",
  skin: "#f1c9a5",
  tunics: ["#d9a441", "#4f84e8", "#de6f45", "#936fd6", "#42aa7c", "#dbb542"],
  soldier: "#3e4f73",
  shield: "#c49a21",
  fog: "#e3d3b4",
  fogHatch: "rgba(100, 75, 45, 0.22)",
  runeCyan: "#38bdf8",
  runeGold: "#fbbf24",

  // --- the wider world: sea, shore, cold ground and dry ground -------------
  ocean: "#2b6285",
  oceanDeep: "#1d4360",
  oceanShallow: "#4f9ab6",
  oceanFoam: "#d9f0f6",
  beach: "#e5d3a3",
  beachWet: "#cdb684",
  lake: "#54a2bd",
  lakeDeep: "#357c99",
  marsh: "#7f8f4e",
  marshWater: "#5b7a63",
  reed: "#b5a24a",
  reedHead: "#6d5a2c",
  tundra: "#b9bfa2",
  tundraScrub: "#8a8f6d",
  snowfield: "#e8eef4",
  snowfieldShade: "#c2d0dc",
  badlands: "#c58a52",
  badlandsDark: "#9c6436",
  badlandsStripe: "#e0ae74",
  birchBark: "#ece5d8",
  birchMark: "#4a4238",
  birchCanopy: "#9ec24f",
  taigaCanopy: "#20452f",
  taigaLight: "#2f6041",
  bone: "#e6dfcc",
  boneShade: "#bdb49c",
  ruin: "#9a9384",
  ruinShade: "#6f6a5e",
  steam: "#eef6f8",
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

// Lightens (amount > 0) or darkens (amount < 0) a "#rrggbb" colour.
// Used to give every hex of the same ground a slightly different tone, so a
// wide plain reads as a plain rather than as one flat swatch of paint.
function shadeColor(hex, amount) {
  if (typeof hex !== "string" || hex[0] !== "#" || hex.length < 7) return hex;
  const channel = (start) => {
    const value = parseInt(hex.slice(start, start + 2), 16);
    const shifted = amount >= 0 ? value + (255 - value) * amount : value * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(shifted))).toString(16).padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

// The two corners of edge `edge` of a pointy-top hex, in HEX_DIRECTIONS order.
function hexEdgeCorners(x, y, size, edge) {
  const a = (Math.PI / 180) * (60 * edge - 30);
  const b = (Math.PI / 180) * (60 * (edge + 1) - 30);
  return [
    [x + size * Math.cos(a), y + size * Math.sin(a)],
    [x + size * Math.cos(b), y + size * Math.sin(b)],
  ];
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

// `variation` (-1..1) nudges the fill lighter or darker. It costs nothing —
// no extra elements — and is the cheapest way to stop a big stretch of one
// terrain looking like a single flat swatch.
function paintHexBase(parent, x, y, size, fill, variation) {
  // Base polygon
  parent.appendChild(svgEl("polygon", {
    points: hexPoints(x, y, size),
    fill: variation ? shadeColor(fill, variation) : fill,
    stroke: ART_COLORS.tileEdge,
    "stroke-width": 0.8,
    "stroke-linejoin": "round",
  }));

  // Topographic 3D Bevel
  const pts = [];
  for (let c = 0; c < 6; c++) {
    const angle = (Math.PI / 180) * (60 * c - 30);
    pts.push([x + size * Math.cos(angle), y + size * Math.sin(angle)]);
  }

  // Sunlit northwest rim (corners 3 -> 4 -> 5 -> 0)
  parent.appendChild(svgEl("path", {
    d: `M ${pts[3][0]} ${pts[3][1]} L ${pts[4][0]} ${pts[4][1]} L ${pts[5][0]} ${pts[5][1]} L ${pts[0][0]} ${pts[0][1]}`,
    fill: "none",
    stroke: "rgba(255, 255, 255, 0.44)",
    "stroke-width": 1.0,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  }));

  // Shaded southeast drop (corners 0 -> 1 -> 2 -> 3)
  parent.appendChild(svgEl("path", {
    d: `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]} L ${pts[2][0]} ${pts[2][1]} L ${pts[3][0]} ${pts[3][1]}`,
    fill: "none",
    stroke: "rgba(35, 25, 15, 0.22)",
    "stroke-width": 1.0,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  }));
}

// ---------------------------------------------------------------------------
// Sprites: nature & masterwork terrain
// ---------------------------------------------------------------------------








function paintHayBale(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x + 2, cy: y + 2, rx: s * 0.22, ry: s * 0.14, fill: "rgba(0,0,0,0.2)" }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.2, y: y - s * 0.14, width: s * 0.4, height: s * 0.28, rx: s * 0.1, fill: ART_COLORS.wheat, stroke: ART_COLORS.wheatDark, "stroke-width": 1 }));
  parent.appendChild(svgEl("line", { x1: x - s * 0.08, y1: y - s * 0.14, x2: x - s * 0.08, y2: y + s * 0.14, stroke: ART_COLORS.wheatDark, "stroke-width": 1 }));
  parent.appendChild(svgEl("line", { x1: x + s * 0.08, y1: y - s * 0.14, x2: x + s * 0.08, y2: y + s * 0.14, stroke: ART_COLORS.wheatDark, "stroke-width": 1 }));
}




// ---------------------------------------------------------------------------
// World Wonders & Landmarks
// ---------------------------------------------------------------------------

function paintStandingStones(parent, x, y, scale) {
  const s = scale;
  // Runic floor circle
  parent.appendChild(svgEl("ellipse", {
    cx: x, cy: y + s * 0.05, rx: s * 0.44, ry: s * 0.28,
    fill: "rgba(56, 189, 248, 0.1)", stroke: ART_COLORS.runeCyan, "stroke-width": 1.2, "stroke-dasharray": "4 3"
  }));
  // 5 standing megaliths
  const stones = [
    [-0.34, 0.04, 0.18, 0.38],
    [-0.18, -0.16, 0.16, 0.34],
    [0.18, -0.16, 0.16, 0.34],
    [0.34, 0.04, 0.18, 0.38],
    [0, 0.18, 0.22, 0.28]
  ];
  for (const [dx, dy, w, h] of stones) {
    const sx = x + dx * s;
    const sy = y + dy * s;
    parent.appendChild(svgEl("polygon", {
      points: `${sx - w * s * 0.5},${sy + h * s * 0.5} ${sx - w * s * 0.4},${sy - h * s * 0.5} ${sx + w * s * 0.4},${sy - h * s * 0.5} ${sx + w * s * 0.5},${sy + h * s * 0.5}`,
      fill: "#6b7280", stroke: ART_COLORS.ink, "stroke-width": 1
    }));
    // Glowing rune
    parent.appendChild(svgEl("line", {
      x1: sx, y1: sy - h * s * 0.25, x2: sx, y2: sy + h * s * 0.25,
      stroke: ART_COLORS.runeCyan, "stroke-width": 1.5, "stroke-linecap": "round"
    }));
  }
}

function paintMotherTree(parent, x, y, scale) {
  const s = scale;
  // Mystical ground glow
  parent.appendChild(svgEl("ellipse", {
    cx: x, cy: y + s * 0.35, rx: s * 0.55, ry: s * 0.2,
    fill: "rgba(251, 191, 36, 0.24)"
  }));
  // Massive ancient trunk
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.14},${y - s * 0.08} ${x + s * 0.14},${y - s * 0.08} ${x + s * 0.26},${y + s * 0.42} ${x - s * 0.26},${y + s * 0.42}`,
    fill: "#5c3317", stroke: ART_COLORS.ink, "stroke-width": 1.2
  }));
  // Golden foliage lobes
  parent.appendChild(svgEl("circle", { cx: x, cy: y - s * 0.2, r: s * 0.48, fill: "#b45309" }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.22, cy: y - s * 0.3, r: s * 0.38, fill: "#d97706" }));
  parent.appendChild(svgEl("circle", { cx: x + s * 0.22, cy: y - s * 0.3, r: s * 0.38, fill: "#d97706" }));
  parent.appendChild(svgEl("circle", { cx: x, cy: y - s * 0.45, r: s * 0.36, fill: "#f59e0b" }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.15, cy: y - s * 0.48, r: s * 0.22, fill: "#fbbf24", opacity: 0.9 }));
  // Spreading roots
  parent.appendChild(svgEl("path", {
    d: `M ${x - s * 0.12} ${y + s * 0.35} q ${-s * 0.2} ${s * 0.1} ${-s * 0.35} ${s * 0.12} M ${x + s * 0.12} ${y + s * 0.35} q ${s * 0.2} ${s * 0.1} ${s * 0.35} ${s * 0.12}`,
    fill: "none", stroke: "#5c3317", "stroke-width": 3, "stroke-linecap": "round"
  }));
}

function paintDragonBones(parent, x, y, scale) {
  const s = scale;
  // Curved ribs
  for (let i = 0; i < 4; i++) {
    const rx = x - s * 0.3 + i * s * 0.2;
    parent.appendChild(svgEl("path", {
      d: `M ${rx} ${y + s * 0.22} q ${s * 0.1} ${-s * 0.45} ${s * 0.18} ${-s * 0.38}`,
      fill: "none", stroke: "#f1ede4", "stroke-width": 2.6, "stroke-linecap": "round"
    }));
    parent.appendChild(svgEl("path", {
      d: `M ${rx} ${y + s * 0.22} q ${-s * 0.1} ${-s * 0.45} ${-s * 0.18} ${-s * 0.38}`,
      fill: "none", stroke: "#e2d9c8", "stroke-width": 2.4, "stroke-linecap": "round"
    }));
  }
  // Skull
  parent.appendChild(svgEl("polygon", {
    points: `${x + s * 0.3},${y + s * 0.1} ${x + s * 0.48},${y - s * 0.05} ${x + s * 0.44},${y + s * 0.22}`,
    fill: "#f8fafc", stroke: "#b8af9c", "stroke-width": 1.2
  }));
}

function paintCrystalMine(parent, x, y, scale) {
  const s = scale;
  // Rock arch portal
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.35},${y + s * 0.32} ${x - s * 0.25},${y - s * 0.2} ${x + s * 0.25},${y - s * 0.2} ${x + s * 0.35},${y + s * 0.32}`,
    fill: "#4b5563", stroke: ART_COLORS.ink, "stroke-width": 1.2
  }));
  // Dark mine opening
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.18, y: y - s * 0.05, width: s * 0.36, height: s * 0.37,
    fill: "#111827"
  }));
  // Timber supports
  parent.appendChild(svgEl("rect", { x: x - s * 0.2, y: y - s * 0.1, width: s * 0.06, height: s * 0.42, fill: ART_COLORS.trunk }));
  parent.appendChild(svgEl("rect", { x: x + s * 0.14, y: y - s * 0.1, width: s * 0.06, height: s * 0.42, fill: ART_COLORS.trunk }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.2, y: y - s * 0.12, width: s * 0.4, height: s * 0.07, fill: ART_COLORS.trunk }));
  // Glowing crystals
  const crystals = [[-0.28, 0.1], [-0.24, -0.05], [0.24, 0.12], [0.28, -0.02]];
  for (const [cx, cy] of crystals) {
    parent.appendChild(svgEl("polygon", {
      points: `${x + cx * s},${y + cy * s - 7} ${x + cx * s + 4},${y + cy * s} ${x + cx * s},${y + cy * s + 5} ${x + cx * s - 4},${y + cy * s}`,
      fill: "#a855f7", stroke: "#e9d5ff", "stroke-width": 0.8
    }));
  }
}

function paintShipwreck(parent, x, y, scale) {
  const s = scale;
  // Weathered wooden hull
  parent.appendChild(svgEl("ellipse", { cx: x + 2, cy: y + 2, rx: s * 0.45, ry: s * 0.18, fill: "rgba(0,0,0,0.22)" }));
  parent.appendChild(svgEl("path", {
    d: `M ${x - s * 0.45} ${y - s * 0.05} Q ${x} ${y + s * 0.25} ${x + s * 0.45} ${y} Q ${x} ${y + s * 0.08} ${x - s * 0.45} ${y - s * 0.05} Z`,
    fill: "#52371c", stroke: ART_COLORS.ink, "stroke-width": 1.2
  }));
  // Exposed hull ribs
  for (let i = -2; i <= 2; i++) {
    parent.appendChild(svgEl("line", {
      x1: x + i * s * 0.14, y1: y - s * 0.02, x2: x + i * s * 0.12, y2: y + s * 0.18,
      stroke: "#2f1f10", "stroke-width": 1.8
    }));
  }
  // Broken mast
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.05, y1: y + s * 0.08, x2: x + s * 0.18, y2: y - s * 0.42,
    stroke: ART_COLORS.trunk, "stroke-width": 2.2, "stroke-linecap": "round"
  }));
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
  // Sand & pebble riverbank border
  parent.appendChild(svgEl("path", {
    d: smoothPath(buildRiverBand(centerline, halfWidths, 8), true),
    fill: ART_COLORS.sand,
    stroke: ART_COLORS.sandDark,
    "stroke-width": 0.8,
    opacity: 0.95
  }));
  // Shallows
  parent.appendChild(svgEl("path", {
    d: smoothPath(buildRiverBand(centerline, halfWidths, 4), true),
    fill: ART_COLORS.waterLight,
  }));
  // Deep channel
  parent.appendChild(svgEl("path", {
    d: smoothPath(buildRiverBand(centerline, halfWidths, -3), true),
    fill: ART_COLORS.waterDeep,
  }));
  // Foam flow streamlines
  for (const offset of [-3, 3]) {
    parent.appendChild(svgEl("path", {
      d: smoothPath(offsetCenterline(centerline, offset), false),
      class: "art-river-flow",
      fill: "none", stroke: ART_COLORS.foam, "stroke-width": 2, "stroke-linecap": "round",
      "stroke-dasharray": "12 24", opacity: 0.8,
    }));
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

function paintPlaza(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", {
    cx: x, cy: y, rx: s * 0.52, ry: s * 0.35,
    fill: "#c5b79e", stroke: ART_COLORS.roadEdge, "stroke-width": 1.5, opacity: 0.85
  }));
  parent.appendChild(svgEl("ellipse", {
    cx: x, cy: y, rx: s * 0.34, ry: s * 0.22,
    fill: "none", stroke: "#a89478", "stroke-width": 1, "stroke-dasharray": "3 2"
  }));
}

function paintWell(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.04, rx: s * 0.14, ry: s * 0.08, fill: ART_COLORS.rockDark, stroke: ART_COLORS.ink, "stroke-width": 1 }));
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y, rx: s * 0.12, ry: s * 0.06, fill: ART_COLORS.waterDeep }));
  parent.appendChild(svgEl("line", { x1: x - s * 0.1, y1: y, x2: x - s * 0.1, y2: y - s * 0.18, stroke: ART_COLORS.trunk, "stroke-width": 1.5 }));
  parent.appendChild(svgEl("line", { x1: x + s * 0.1, y1: y, x2: x + s * 0.1, y2: y - s * 0.18, stroke: ART_COLORS.trunk, "stroke-width": 1.5 }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.14},${y - s * 0.18} ${x},${y - s * 0.28} ${x + s * 0.14},${y - s * 0.18}`,
    fill: ART_COLORS.roof, stroke: ART_COLORS.ink, "stroke-width": 1
  }));
}

function paintWatchtower(parent, x, y, scale, bannerColor) {
  const s = scale;
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.18},${y + s * 0.35} ${x - s * 0.13},${y - s * 0.35} ${x + s * 0.13},${y - s * 0.35} ${x + s * 0.18},${y + s * 0.35}`,
    fill: ART_COLORS.rock, stroke: ART_COLORS.ink, "stroke-width": 1.2
  }));
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.22, y: y - s * 0.42, width: s * 0.44, height: s * 0.09,
    fill: ART_COLORS.trunk, stroke: ART_COLORS.ink, "stroke-width": 1
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.25},${y - s * 0.42} ${x},${y - s * 0.72} ${x + s * 0.25},${y - s * 0.42}`,
    fill: ART_COLORS.roofDark, stroke: ART_COLORS.ink, "stroke-width": 1
  }));
  parent.appendChild(svgEl("line", {
    x1: x, y1: y - s * 0.15, x2: x, y2: y + s * 0.05,
    stroke: ART_COLORS.ink, "stroke-width": 1.8, "stroke-linecap": "round"
  }));
  if (bannerColor) {
    paintBanner(parent, x + s * 0.05, y - s * 0.72, s * 0.5, bannerColor);
  }
}

function paintWarTent(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.32},${y + s * 0.2} ${x},${y - s * 0.32} ${x + s * 0.32},${y + s * 0.2}`,
    fill: "#42332c", stroke: ART_COLORS.ink, "stroke-width": 1.2
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.08},${y + s * 0.2} ${x},${y - s * 0.08} ${x + s * 0.08},${y + s * 0.2}`,
    fill: "#1f1510"
  }));
  parent.appendChild(svgEl("line", {
    x1: x, y1: y - s * 0.38, x2: x, y2: y - s * 0.5,
    stroke: ART_COLORS.trunk, "stroke-width": 1.8
  }));
}

function paintSpikes(parent, x, y, scale) {
  const s = scale;
  const count = 4;
  for (let i = 0; i < count; i++) {
    const px = x + (i - (count - 1) / 2) * s * 0.14;
    parent.appendChild(svgEl("line", {
      x1: px, y1: y + s * 0.15, x2: px + (i % 2 === 0 ? -1 : 1) * s * 0.04, y2: y - s * 0.15,
      stroke: ART_COLORS.trunk, "stroke-width": 2, "stroke-linecap": "round"
    }));
  }
}


// ---------------------------------------------------------------------------
// High-Density Clustered Biome Sprites
// ---------------------------------------------------------------------------



function paintRiverBridge(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.32, y: y - s * 0.12, width: s * 0.64, height: s * 0.24, rx: s * 0.03,
    fill: "#854d0e", stroke: ART_COLORS.ink, "stroke-width": 0.9
  }));
  for (let i = -2; i <= 2; i++) {
    parent.appendChild(svgEl("line", {
      x1: x + i * s * 0.11, y1: y - s * 0.12, x2: x + i * s * 0.11, y2: y + s * 0.12,
      stroke: "#5c3317", "stroke-width": 0.8
    }));
  }
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.32, y1: y - s * 0.1, x2: x + s * 0.32, y2: y - s * 0.1,
    stroke: "#451a03", "stroke-width": 1.2
  }));
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.32, y1: y + s * 0.1, x2: x + s * 0.32, y2: y + s * 0.1,
    stroke: "#451a03", "stroke-width": 1.2
  }));
}

// ---------------------------------------------------------------------------
// Sprites: people. Drawn at the origin; the villagers layer moves the group.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// District Architectural Sprites: Sprawling 5x Medieval Realm
// ---------------------------------------------------------------------------

function paintChieftainHall(parent, x, y, scale) {
  const s = scale;
  // Deep ground shadow
  parent.appendChild(svgEl("ellipse", {
    cx: x, cy: y + s * 0.38, rx: s * 0.65, ry: s * 0.22,
    fill: "rgba(0,0,0,0.28)"
  }));
  // Dressed stone plinth / foundation
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.48, y: y + s * 0.12, width: s * 0.96, height: s * 0.24, rx: s * 0.02,
    fill: "#6b7280", stroke: ART_COLORS.ink, "stroke-width": 1.2
  }));
  // Stone masonry line accents
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.48, y1: y + s * 0.24, x2: x + s * 0.48, y2: y + s * 0.24,
    stroke: "#4b5563", "stroke-width": 0.8
  }));
  // Massive timber log walls
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.44, y: y - s * 0.18, width: s * 0.88, height: s * 0.32,
    fill: "#854d0e", stroke: ART_COLORS.ink, "stroke-width": 1.2
  }));
  // Vertical timber framing posts
  for (const px of [-0.28, -0.12, 0.12, 0.28]) {
    parent.appendChild(svgEl("line", {
      x1: x + s * px, y1: y - s * 0.18, x2: x + s * px, y2: y + s * 0.14,
      stroke: "#5c3317", "stroke-width": 1.5
    }));
  }
  // Arched entryway with heavy iron-banded doors
  parent.appendChild(svgEl("path", {
    d: `M ${x - s * 0.13} ${y + s * 0.14} v ${-s * 0.22} q ${s * 0.13} ${-s * 0.08} ${s * 0.26} 0 v ${s * 0.22} z`,
    fill: "#3f1d0b", stroke: ART_COLORS.ink, "stroke-width": 1
  }));
  // Hearth fire glow spilling out
  parent.appendChild(svgEl("circle", {
    cx: x, cy: y + s * 0.04, r: s * 0.1,
    fill: "#fbbf24", opacity: 0.85
  }));
  // Twin entrance sconce lanterns
  for (const lx of [-0.18, 0.18]) {
    parent.appendChild(svgEl("circle", {
      cx: x + s * lx, cy: y - s * 0.02, r: s * 0.04,
      fill: "#fef08a", stroke: "#d97706", "stroke-width": 0.8
    }));
  }
  // Majestic double-pitched timber shingle roof
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.54},${y - s * 0.15} ${x},${y - s * 0.65} ${x + s * 0.54},${y - s * 0.15}`,
    fill: "#78350f", stroke: ART_COLORS.ink, "stroke-width": 1.5, "stroke-linejoin": "round"
  }));
  // Roof shingle tiered ridge
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.42},${y - s * 0.17} ${x},${y - s * 0.56} ${x + s * 0.42},${y - s * 0.17}`,
    fill: "#92400e", opacity: 0.85
  }));
  // Crossed gable finial beams (Viking/Nordic hall horns)
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.1, y1: y - s * 0.58, x2: x + s * 0.12, y2: y - s * 0.74,
    stroke: "#451a03", "stroke-width": 2.5, "stroke-linecap": "round"
  }));
  parent.appendChild(svgEl("line", {
    x1: x + s * 0.1, y1: y - s * 0.58, x2: x - s * 0.12, y2: y - s * 0.74,
    stroke: "#451a03", "stroke-width": 2.5, "stroke-linecap": "round"
  }));
  // Chieftain golden crest over the arch
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.08},${y - s * 0.24} ${x},${y - s * 0.14} ${x + s * 0.08},${y - s * 0.24}`,
    fill: "#fbbf24", stroke: ART_COLORS.ink, "stroke-width": 0.8
  }));
}

function paintMarketStall(parent, x, y, colorTheme, scale) {
  const s = scale;
  const palettes = {
    crimson: ["#dc2626", "#fef3c7"],
    azure: ["#2563eb", "#fde047"],
    emerald: ["#16a34a", "#fef3c7"],
    amber: ["#ea580c", "#fef3c7"]
  };
  const [colA, colB] = palettes[colorTheme] || palettes.crimson;

  // Ground shadow
  parent.appendChild(svgEl("ellipse", {
    cx: x, cy: y + s * 0.26, rx: s * 0.38, ry: s * 0.12,
    fill: "rgba(0,0,0,0.22)"
  }));
  // Wooden market counter
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.28, y: y + s * 0.05, width: s * 0.56, height: s * 0.18, rx: s * 0.02,
    fill: "#854d0e", stroke: ART_COLORS.ink, "stroke-width": 1
  }));
  // Table slats
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.28, y1: y + s * 0.14, x2: x + s * 0.28, y2: y + s * 0.14,
    stroke: "#5c3317", "stroke-width": 0.8
  }));
  // Canopy corner posts
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.26, y1: y + s * 0.15, x2: x - s * 0.24, y2: y - s * 0.28,
    stroke: "#5c3317", "stroke-width": 1.8
  }));
  parent.appendChild(svgEl("line", {
    x1: x + s * 0.26, y1: y + s * 0.15, x2: x + s * 0.24, y2: y - s * 0.28,
    stroke: "#5c3317", "stroke-width": 1.8
  }));
  // Striped Fabric Canopy Awning
  const stripeCount = 5;
  const startX = x - s * 0.32;
  const step = (s * 0.64) / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    const x0 = startX + i * step;
    const x1 = x0 + step;
    parent.appendChild(svgEl("polygon", {
      points: `${x0},${y - s * 0.24} ${x1},${y - s * 0.24} ${x1 - step * 0.15},${y - s * 0.42} ${x0 - step * 0.15},${y - s * 0.42}`,
      fill: i % 2 === 0 ? colA : colB, stroke: ART_COLORS.ink, "stroke-width": 0.8
    }));
  }
  // Scalloped canopy front trim
  parent.appendChild(svgEl("path", {
    d: `M ${startX} ${y - s * 0.24} q ${step * 0.5} ${s * 0.05} ${step} 0 q ${step * 0.5} ${s * 0.05} ${step} 0 q ${step * 0.5} ${s * 0.05} ${step} 0 q ${step * 0.5} ${s * 0.05} ${step} 0 q ${step * 0.5} ${s * 0.05} ${step} 0`,
    fill: "none", stroke: ART_COLORS.ink, "stroke-width": 1.2
  }));
  // Display crates with fresh goods
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.23, y: y - s * 0.04, width: s * 0.18, height: s * 0.1,
    fill: "#78350f", stroke: ART_COLORS.ink, "stroke-width": 0.8
  }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.17, cy: y - s * 0.02, r: s * 0.035, fill: "#ef4444" }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.11, cy: y - s * 0.02, r: s * 0.035, fill: "#dc2626" }));

  parent.appendChild(svgEl("rect", {
    x: x + s * 0.05, y: y - s * 0.04, width: s * 0.18, height: s * 0.1,
    fill: "#78350f", stroke: ART_COLORS.ink, "stroke-width": 0.8
  }));
  parent.appendChild(svgEl("circle", { cx: x + s * 0.11, cy: y - s * 0.02, r: s * 0.038, fill: "#fbbf24" }));
  parent.appendChild(svgEl("circle", { cx: x + s * 0.17, cy: y - s * 0.02, r: s * 0.035, fill: "#f59e0b" }));
}

function paintSmithy(parent, x, y, scale) {
  const s = scale;
  // Ground shadow
  parent.appendChild(svgEl("ellipse", {
    cx: x, cy: y + s * 0.25, rx: s * 0.45, ry: s * 0.16,
    fill: "rgba(0,0,0,0.25)"
  }));
  // Stone forge hearth (right)
  parent.appendChild(svgEl("rect", {
    x: x + s * 0.04, y: y - s * 0.06, width: s * 0.32, height: s * 0.32,
    fill: "#4b5563", stroke: ART_COLORS.ink, "stroke-width": 1.2
  }));
  // High stone chimney
  parent.appendChild(svgEl("polygon", {
    points: `${x + s * 0.14},${y - s * 0.06} ${x + s * 0.16},${y - s * 0.44} ${x + s * 0.28},${y - s * 0.44} ${x + s * 0.3},${y - s * 0.06}`,
    fill: "#374151", stroke: ART_COLORS.ink, "stroke-width": 1
  }));
  // Smoke puffs from forge chimney
  parent.appendChild(svgEl("circle", { cx: x + s * 0.22, cy: y - s * 0.52, r: s * 0.08, fill: "#94a3b8", opacity: 0.6 }));
  parent.appendChild(svgEl("circle", { cx: x + s * 0.26, cy: y - s * 0.62, r: s * 0.1, fill: "#94a3b8", opacity: 0.38 }));
  // Glowing forge mouth
  parent.appendChild(svgEl("path", {
    d: `M ${x + s * 0.08} ${y + s * 0.2} v ${-s * 0.16} q ${s * 0.08} ${-s * 0.06} ${s * 0.16} 0 v ${s * 0.16} z`,
    fill: "#1f2937"
  }));
  parent.appendChild(svgEl("ellipse", {
    cx: x + s * 0.16, cy: y + s * 0.14, rx: s * 0.06, ry: s * 0.035,
    fill: "#ea580c"
  }));
  parent.appendChild(svgEl("ellipse", {
    cx: x + s * 0.16, cy: y + s * 0.14, rx: s * 0.035, ry: s * 0.02,
    fill: "#fef08a"
  }));
  // Timber canopy shelter (left)
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.32, y1: y + s * 0.22, x2: x - s * 0.32, y2: y - s * 0.22,
    stroke: "#6f4625", "stroke-width": 2
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.38},${y - s * 0.22} ${x + s * 0.12},${y - s * 0.3} ${x + s * 0.12},${y - s * 0.18} ${x - s * 0.38},${y - s * 0.12}`,
    fill: "#78350f", stroke: ART_COLORS.ink, "stroke-width": 1
  }));
  // Anvil on oak tree stump
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.22, y: y + s * 0.06, width: s * 0.14, height: s * 0.16,
    fill: "#52371c"
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.28},${y + s * 0.06} ${x - s * 0.08},${y + s * 0.06} ${x - s * 0.12},${y + s * 0.02} ${x - s * 0.15},${y + s * 0.02} ${x - s * 0.16},${y - s * 0.01} ${x - s * 0.05},${y - s * 0.01} ${x - s * 0.08},${y + s * 0.02} ${x - s * 0.26},${y + s * 0.02}`,
    fill: "#1e293b", stroke: ART_COLORS.ink, "stroke-width": 0.8
  }));
  // Water quench barrel
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.06, y: y + s * 0.12, width: s * 0.1, height: s * 0.12, rx: s * 0.01,
    fill: "#5c3a21"
  }));
  parent.appendChild(svgEl("ellipse", {
    cx: x - s * 0.01, cy: y + s * 0.12, rx: s * 0.045, ry: s * 0.02,
    fill: "#38bdf8"
  }));
}

function paintLumberCamp(parent, x, y, scale) {
  const s = scale;
  // Ground shadow
  parent.appendChild(svgEl("ellipse", {
    cx: x, cy: y + s * 0.26, rx: s * 0.46, ry: s * 0.14,
    fill: "rgba(0,0,0,0.22)"
  }));
  // Open timber lean-to shed (left)
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.42},${y + s * 0.2} ${x - s * 0.42},${y - s * 0.18} ${x - s * 0.12},${y - s * 0.3} ${x - s * 0.12},${y + s * 0.2}`,
    fill: "#451a03", stroke: ART_COLORS.ink, "stroke-width": 1.2
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.46},${y - s * 0.18} ${x - s * 0.08},${y - s * 0.34} ${x - s * 0.08},${y - s * 0.28} ${x - s * 0.46},${y - s * 0.12}`,
    fill: "#78350f", stroke: ART_COLORS.ink, "stroke-width": 1
  }));
  // Stack of harvested timber logs (right)
  const drawLog = (lx, ly) => {
    parent.appendChild(svgEl("circle", {
      cx: lx, cy: ly, r: s * 0.075,
      fill: "#d97706", stroke: "#78350f", "stroke-width": 2
    }));
    parent.appendChild(svgEl("circle", {
      cx: lx, cy: ly, r: s * 0.03,
      fill: "#b45309"
    }));
  };
  // Tier 1 (bottom)
  drawLog(x + s * 0.1, y + s * 0.18);
  drawLog(x + s * 0.23, y + s * 0.18);
  drawLog(x + s * 0.36, y + s * 0.18);
  // Tier 2 (middle)
  drawLog(x + s * 0.165, y + s * 0.07);
  drawLog(x + s * 0.295, y + s * 0.07);
  // Tier 3 (top)
  drawLog(x + s * 0.23, y - s * 0.04);
  // Rope binding
  parent.appendChild(svgEl("path", {
    d: `M ${x + s * 0.03} ${y + s * 0.18} Q ${x + s * 0.23} ${y - s * 0.12} ${x + s * 0.43} ${y + s * 0.18}`,
    fill: "none", stroke: "#b45309", "stroke-width": 1.5
  }));
  // Timber sawbuck with crosscut blade (center)
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.22, y1: y + s * 0.04, x2: x - s * 0.12, y2: y + s * 0.22,
    stroke: "#78350f", "stroke-width": 2.2
  }));
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.12, y1: y + s * 0.04, x2: x - s * 0.22, y2: y + s * 0.22,
    stroke: "#78350f", "stroke-width": 2.2
  }));
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.26, y: y + s * 0.07, width: s * 0.2, height: s * 0.06, rx: s * 0.02,
    fill: "#b45309"
  }));
  // Broad axe embedded in chopping stump
  parent.appendChild(svgEl("rect", {
    x: x + s * 0.01, y: y + s * 0.16, width: s * 0.08, height: s * 0.09,
    fill: "#52371c"
  }));
  parent.appendChild(svgEl("line", {
    x1: x + s * 0.05, y1: y + s * 0.16, x2: x + s * 0.08, y2: y + s * 0.08,
    stroke: "#a16207", "stroke-width": 1.6, "stroke-linecap": "round"
  }));
}

function paintQuarryWorks(parent, x, y, scale) {
  const s = scale;
  // Ground shadow
  parent.appendChild(svgEl("ellipse", {
    cx: x, cy: y + s * 0.25, rx: s * 0.46, ry: s * 0.15,
    fill: "rgba(0,0,0,0.25)"
  }));
  // Dressed ashlar stone block 1
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.35, y: y + s * 0.08, width: s * 0.22, height: s * 0.15,
    fill: "#94a3b8", stroke: ART_COLORS.ink, "stroke-width": 1
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.35},${y + s * 0.08} ${x - s * 0.28},${y + s * 0.02} ${x - s * 0.06},${y + s * 0.02} ${x - s * 0.13},${y + s * 0.08}`,
    fill: "#cbd5e1"
  }));
  // Dressed ashlar stone block 2
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.12, y: y + s * 0.1, width: s * 0.2, height: s * 0.14,
    fill: "#64748b", stroke: ART_COLORS.ink, "stroke-width": 1
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.12},${y + s * 0.1} ${x - s * 0.05},${y + s * 0.04} ${x + s * 0.15},${y + s * 0.04} ${x + s * 0.08},${y + s * 0.1}`,
    fill: "#94a3b8"
  }));
  // Wooden hoisting crane / derrick (right)
  parent.appendChild(svgEl("line", {
    x1: x + s * 0.12, y1: y + s * 0.24, x2: x + s * 0.22, y2: y - s * 0.4,
    stroke: "#78350f", "stroke-width": 2.4
  }));
  parent.appendChild(svgEl("line", {
    x1: x + s * 0.32, y1: y + s * 0.24, x2: x + s * 0.22, y2: y - s * 0.4,
    stroke: "#78350f", "stroke-width": 2.4
  }));
  parent.appendChild(svgEl("line", {
    x1: x + s * 0.15, y1: y + s * 0.05, x2: x + s * 0.29, y2: y + s * 0.05,
    stroke: "#78350f", "stroke-width": 1.8
  }));
  // Crane boom arm
  parent.appendChild(svgEl("line", {
    x1: x + s * 0.22, y1: y - s * 0.38, x2: x + s * 0.02, y2: y - s * 0.48,
    stroke: "#92400e", "stroke-width": 2
  }));
  // Pulley & cable
  parent.appendChild(svgEl("circle", { cx: x + s * 0.02, cy: y - s * 0.48, r: s * 0.035, fill: "#1e293b" }));
  parent.appendChild(svgEl("line", {
    x1: x + s * 0.02, y1: y - s * 0.45, x2: x + s * 0.02, y2: y - s * 0.2,
    stroke: "#d97706", "stroke-width": 1.2
  }));
  // Suspended stone block in sling
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.04, y: y - s * 0.2, width: s * 0.12, height: s * 0.1,
    fill: "#94a3b8", stroke: ART_COLORS.ink, "stroke-width": 0.8
  }));
}

function paintFisheryDock(parent, x, y, scale) {
  const s = scale;
  // Wooden pier boardwalk planks jutting out
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.38},${y + s * 0.05} ${x + s * 0.32},${y + s * 0.05} ${x + s * 0.38},${y + s * 0.2} ${x - s * 0.32},${y + s * 0.2}`,
    fill: "#78350f", stroke: ART_COLORS.ink, "stroke-width": 1.2
  }));
  for (let i = -2; i <= 2; i++) {
    parent.appendChild(svgEl("line", {
      x1: x + i * s * 0.12 - s * 0.04, y1: y + s * 0.06, x2: x + i * s * 0.12 + s * 0.04, y2: y + s * 0.19,
      stroke: "#5c3317", "stroke-width": 0.8
    }));
  }
  // Wooden pilings / stilts
  for (const px of [-0.3, 0, 0.3]) {
    parent.appendChild(svgEl("line", {
      x1: x + s * px, y1: y + s * 0.18, x2: x + s * px, y2: y + s * 0.35,
      stroke: "#451a03", "stroke-width": 2.4, "stroke-linecap": "round"
    }));
  }
  // Mooring bollard
  parent.appendChild(svgEl("rect", {
    x: x + s * 0.24, y: y - s * 0.02, width: s * 0.06, height: s * 0.09, rx: s * 0.02,
    fill: "#451a03"
  }));
  // Moored wooden rowboat
  parent.appendChild(svgEl("path", {
    d: `M ${x + s * 0.12} ${y + s * 0.28} Q ${x + s * 0.32} ${y + s * 0.42} ${x + s * 0.52} ${y + s * 0.28} Q ${x + s * 0.32} ${y + s * 0.22} ${x + s * 0.12} ${y + s * 0.28} Z`,
    fill: "#854d0e", stroke: ART_COLORS.ink, "stroke-width": 1
  }));
  parent.appendChild(svgEl("line", {
    x1: x + s * 0.28, y1: y + s * 0.26, x2: x + s * 0.28, y2: y + s * 0.35,
    stroke: "#52371c", "stroke-width": 1.5
  }));
  // Oar resting in boat
  parent.appendChild(svgEl("line", {
    x1: x + s * 0.2, y1: y + s * 0.3, x2: x + s * 0.45, y2: y + s * 0.38,
    stroke: "#d97706", "stroke-width": 1.2
  }));
  // Fish drying rack (top left)
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.35, y1: y + s * 0.04, x2: x - s * 0.35, y2: y - s * 0.22,
    stroke: "#78350f", "stroke-width": 1.8
  }));
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.1, y1: y + s * 0.04, x2: x - s * 0.1, y2: y - s * 0.22,
    stroke: "#78350f", "stroke-width": 1.8
  }));
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.38, y1: y - s * 0.18, x2: x - s * 0.08, y2: y - s * 0.18,
    stroke: "#78350f", "stroke-width": 1.8
  }));
  // Hanging silver fish
  for (const fx of [-0.3, -0.23, -0.16]) {
    parent.appendChild(svgEl("polygon", {
      points: `${x + s * fx},${y - s * 0.16} ${x + s * fx + s * 0.02},${y - s * 0.06} ${x + s * fx - s * 0.02},${y - s * 0.06}`,
      fill: "#cbd5e1", stroke: "#475569", "stroke-width": 0.6
    }));
  }
}

function paintAnimalPen(parent, x, y, scale) {
  const s = scale;
  // Muddy straw paddock patch
  parent.appendChild(svgEl("ellipse", {
    cx: x, cy: y + s * 0.05, rx: s * 0.44, ry: s * 0.28,
    fill: "#bfa15f", stroke: "#8d6e3f", "stroke-width": 1
  }));
  parent.appendChild(svgEl("ellipse", {
    cx: x - s * 0.12, cy: y + s * 0.1, rx: s * 0.15, ry: s * 0.08,
    fill: "#9a783e", opacity: 0.5
  }));
  // Rustic post-and-rail fence
  const fencePts = [
    [-0.38, -0.16], [0.38, -0.16], [0.42, 0.18], [0.08, 0.26], [-0.42, 0.18]
  ];
  for (let i = 0; i < fencePts.length; i++) {
    const next = fencePts[(i + 1) % fencePts.length];
    parent.appendChild(svgEl("line", {
      x1: x + s * fencePts[i][0], y1: y + s * fencePts[i][1],
      x2: x + s * next[0], y2: y + s * next[1],
      stroke: "#6f4625", "stroke-width": 1.5
    }));
    parent.appendChild(svgEl("line", {
      x1: x + s * fencePts[i][0], y1: y + s * fencePts[i][1] + s * 0.06,
      x2: x + s * next[0], y2: y + s * next[1] + s * 0.06,
      stroke: "#6f4625", "stroke-width": 1.2
    }));
    // Fence post
    parent.appendChild(svgEl("line", {
      x1: x + s * fencePts[i][0], y1: y + s * fencePts[i][1] - s * 0.05,
      x2: x + s * fencePts[i][0], y2: y + s * fencePts[i][1] + s * 0.1,
      stroke: "#52371c", "stroke-width": 2.2, "stroke-linecap": "round"
    }));
  }
  // Feed trough filled with golden hay
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.22, y: y - s * 0.12, width: s * 0.2, height: s * 0.08,
    fill: "#5c3317", stroke: ART_COLORS.ink, "stroke-width": 0.8
  }));
  parent.appendChild(svgEl("ellipse", {
    cx: x - s * 0.12, cy: y - s * 0.12, rx: s * 0.08, ry: s * 0.035,
    fill: "#fde047"
  }));
  // Fluffy sheep
  parent.appendChild(svgEl("circle", { cx: x + s * 0.12, cy: y + s * 0.02, r: s * 0.09, fill: "#f8fafc", stroke: "#cbd5e1", "stroke-width": 1 }));
  parent.appendChild(svgEl("circle", { cx: x + s * 0.06, cy: y + s * 0.02, r: s * 0.07, fill: "#f8fafc" }));
  parent.appendChild(svgEl("circle", { cx: x + s * 0.18, cy: y, r: s * 0.06, fill: "#332720" }));
  parent.appendChild(svgEl("rect", { x: x + s * 0.08, y: y + s * 0.09, width: s * 0.02, height: s * 0.05, fill: "#332720" }));
  parent.appendChild(svgEl("rect", { x: x + s * 0.14, y: y + s * 0.09, width: s * 0.02, height: s * 0.05, fill: "#332720" }));
  // Rosy piglet
  parent.appendChild(svgEl("ellipse", {
    cx: x - s * 0.08, cy: y + s * 0.14, rx: s * 0.09, ry: s * 0.06,
    fill: "#f472b6", stroke: "#db2777", "stroke-width": 0.8
  }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.15, cy: y + s * 0.13, r: s * 0.045, fill: "#f472b6" }));
  parent.appendChild(svgEl("ellipse", { cx: x - s * 0.17, cy: y + s * 0.14, rx: s * 0.02, ry: s * 0.015, fill: "#fbcfe8" }));
  parent.appendChild(svgEl("path", {
    d: `M ${x - s * 0.01} ${y + s * 0.13} q ${s * 0.03} ${-s * 0.02} ${s * 0.02} ${-s * 0.04}`,
    fill: "none", stroke: "#db2777", "stroke-width": 1
  }));
}

function paintTrainingGround(parent, x, y, scale) {
  const s = scale;
  // Dirt training yard
  parent.appendChild(svgEl("ellipse", {
    cx: x, cy: y + s * 0.08, rx: s * 0.45, ry: s * 0.25,
    fill: "#b09569", stroke: "#7a5c36", "stroke-width": 1, opacity: 0.85
  }));
  // Archery Target on wooden tripod (left)
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.32, y1: y + s * 0.18, x2: x - s * 0.25, y2: y - s * 0.15,
    stroke: "#5c3317", "stroke-width": 1.8
  }));
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.18, y1: y + s * 0.18, x2: x - s * 0.25, y2: y - s * 0.15,
    stroke: "#5c3317", "stroke-width": 1.8
  }));
  // Target concentric rings
  parent.appendChild(svgEl("circle", { cx: x - s * 0.25, cy: y - s * 0.12, r: s * 0.14, fill: "#f8fafc", stroke: ART_COLORS.ink, "stroke-width": 1 }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.25, cy: y - s * 0.12, r: s * 0.1, fill: "#3b82f6" }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.25, cy: y - s * 0.12, r: s * 0.065, fill: "#ef4444" }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.25, cy: y - s * 0.12, r: s * 0.03, fill: "#fbbf24" }));
  // Arrow in target
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.36, y1: y - s * 0.17, x2: x - s * 0.26, y2: y - s * 0.13,
    stroke: "#78350f", "stroke-width": 1.2
  }));
  // Wooden combat training dummy (right)
  parent.appendChild(svgEl("line", {
    x1: x + s * 0.18, y1: y + s * 0.16, x2: x + s * 0.18, y2: y - s * 0.24,
    stroke: "#5c3317", "stroke-width": 2.2
  }));
  parent.appendChild(svgEl("rect", {
    x: x + s * 0.1, y: y - s * 0.15, width: s * 0.16, height: s * 0.18, rx: s * 0.04,
    fill: "#d97706", stroke: ART_COLORS.ink, "stroke-width": 1
  }));
  parent.appendChild(svgEl("line", {
    x1: x + s * 0.04, y1: y - s * 0.08, x2: x + s * 0.32, y2: y - s * 0.08,
    stroke: "#5c3317", "stroke-width": 2
  }));
  parent.appendChild(svgEl("circle", {
    cx: x + s * 0.3, cy: y - s * 0.08, r: s * 0.07,
    fill: "#9a3412", stroke: "#fbbf24", "stroke-width": 1.2
  }));
  parent.appendChild(svgEl("circle", {
    cx: x + s * 0.18, cy: y - s * 0.24, r: s * 0.06,
    fill: "#64748b", stroke: ART_COLORS.ink, "stroke-width": 1
  }));
  // Weapon rack (center top)
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.05, y1: y - s * 0.05, x2: x + s * 0.05, y2: y - s * 0.05,
    stroke: "#78350f", "stroke-width": 2
  }));
  for (const wx of [-0.03, 0.03]) {
    parent.appendChild(svgEl("line", {
      x1: x + s * wx, y1: y + s * 0.08, x2: x + s * wx, y2: y - s * 0.22,
      stroke: "#78350f", "stroke-width": 1.4
    }));
    parent.appendChild(svgEl("polygon", {
      points: `${x + s * wx},${y - s * 0.28} ${x + s * wx - s * 0.02},${y - s * 0.22} ${x + s * wx + s * 0.02},${y - s * 0.22}`,
      fill: "#e2e8f0", stroke: ART_COLORS.ink, "stroke-width": 0.6
    }));
  }
}

// ---------------------------------------------------------------------------
// Sprites: people. Drawn at the origin; the villagers layer moves the group.
// ---------------------------------------------------------------------------

// The tools of each trade, drawn in the hand. `paintVillager` hangs one of
// these off the arm group, which the stylesheet swings while the figure is
// working — so a forester is visibly chopping and a mason is visibly
// hammering, rather than both being a coloured blob standing still.
const VILLAGER_TOOLS = {
  forester: (s) => [
    { el: "line", attrs: { x1: 0, y1: 0, x2: 0, y2: -s * 0.46, stroke: ART_COLORS.trunk, "stroke-width": s * 0.05, "stroke-linecap": "round" } },
    { el: "path", attrs: { d: `M${-s * 0.02} ${-s * 0.46}q${s * 0.16} ${-s * 0.1} ${s * 0.2} ${s * 0.02}l${-s * 0.18} ${s * 0.12}z`, fill: "#b9b3a6", stroke: ART_COLORS.ink, "stroke-width": 0.6 } },
  ],
  mason: (s) => [
    { el: "line", attrs: { x1: 0, y1: 0, x2: 0, y2: -s * 0.38, stroke: ART_COLORS.trunk, "stroke-width": s * 0.05, "stroke-linecap": "round" } },
    { el: "rect", attrs: { x: -s * 0.1, y: -s * 0.46, width: s * 0.2, height: s * 0.11, rx: s * 0.02, fill: "#8d887e", stroke: ART_COLORS.ink, "stroke-width": 0.6 } },
  ],
  farmer: (s) => [
    { el: "line", attrs: { x1: 0, y1: 0, x2: s * 0.06, y2: -s * 0.48, stroke: ART_COLORS.trunk, "stroke-width": s * 0.045, "stroke-linecap": "round" } },
    { el: "path", attrs: { d: `M${s * 0.06} ${-s * 0.48}q${s * 0.16} ${s * 0.02} ${s * 0.14} ${s * 0.14}`, fill: "none", stroke: "#b9b3a6", "stroke-width": s * 0.05, "stroke-linecap": "round" } },
  ],
  scholar: (s) => [
    { el: "rect", attrs: { x: -s * 0.02, y: -s * 0.16, width: s * 0.2, height: s * 0.15, rx: s * 0.015, fill: "#efe3c8", stroke: ART_COLORS.ink, "stroke-width": 0.6 } },
    { el: "line", attrs: { x1: s * 0.08, y1: -s * 0.16, x2: s * 0.08, y2: -s * 0.01, stroke: "#8c2a1c", "stroke-width": 0.8 } },
  ],
  scout: (s) => [
    { el: "line", attrs: { x1: 0, y1: s * 0.1, x2: s * 0.02, y2: -s * 0.55, stroke: "#6f5433", "stroke-width": s * 0.045, "stroke-linecap": "round" } },
  ],
  soldier: (s) => [
    { el: "line", attrs: { x1: 0, y1: s * 0.12, x2: s * 0.02, y2: -s * 0.6, stroke: "#6f5433", "stroke-width": s * 0.05, "stroke-linecap": "round" } },
    { el: "path", attrs: { d: `M${s * 0.02} ${-s * 0.6}l${-s * 0.05} ${-s * 0.12}l${s * 0.1} 0z`, fill: "#c9c3b4", stroke: ART_COLORS.ink, "stroke-width": 0.5 } },
  ],
  carrier: (s) => [
    { el: "path", attrs: { d: `M${-s * 0.1} ${-s * 0.04}h${s * 0.22}l${-s * 0.03} ${s * 0.16}h${-s * 0.16}z`, fill: "#c9a24a", stroke: ART_COLORS.ink, "stroke-width": 0.6 } },
    { el: "path", attrs: { d: `M${-s * 0.08} ${-s * 0.04}q${s * 0.09} ${-s * 0.1} ${s * 0.18} 0`, fill: "none", stroke: "#8a6526", "stroke-width": 0.8 } },
  ],
};

// Hats and headgear, so a crowd is a crowd of people rather than a row of
// the same person.
const VILLAGER_HATS = ["none", "straw", "hood", "cap"];

// Drawn at the origin; the villagers layer moves the whole group. `options`
// may be a boolean (the old "is this a soldier?") or
// { soldier, trade, hat, hair }.
function paintVillager(parent, scale, tunicColor, options) {
  const s = scale;
  const opts = typeof options === "boolean" ? { soldier: options } : (options || {});
  const soldier = !!opts.soldier;
  const trade = opts.trade || (soldier ? "soldier" : "carrier");
  const hat = opts.hat || "none";

  const body = svgEl("g", { class: "villager__body" });
  body.appendChild(svgEl("ellipse", { cx: 0, cy: s * 0.42, rx: s * 0.22, ry: s * 0.07, fill: "rgba(0,0,0,0.25)" }));

  // Legs, hung off their hip so the stylesheet can swing them.
  for (const side of ["left", "right"]) {
    const leg = svgEl("g", { class: `villager__leg villager__leg--${side}` });
    leg.appendChild(svgEl("rect", {
      x: side === "left" ? -s * 0.12 : s * 0.03, y: s * 0.18,
      width: s * 0.09, height: s * 0.22, fill: ART_COLORS.ink,
    }));
    body.appendChild(leg);
  }

  // Tunic.
  body.appendChild(svgEl("rect", {
    x: -s * 0.17, y: -s * 0.08, width: s * 0.34, height: s * 0.32, rx: s * 0.08,
    fill: soldier ? ART_COLORS.soldier : tunicColor, stroke: ART_COLORS.ink, "stroke-width": 1,
  }));
  // An apron or a belt, depending on the trade.
  if (trade === "farmer" || trade === "carrier") {
    body.appendChild(svgEl("rect", { x: -s * 0.17, y: s * 0.1, width: s * 0.34, height: s * 0.05, fill: "rgba(60,44,28,0.55)" }));
  }

  // The working arm, with its tool. Two nested groups on purpose: the outer
  // one carries the transform that puts the shoulder in the right place, so
  // the inner one is free for the stylesheet to swing without fighting it.
  const shoulder = svgEl("g", {
    transform: `translate(${(s * 0.16).toFixed(2)} ${(s * 0.02).toFixed(2)})`,
  });
  const arm = svgEl("g", { class: "villager__arm" });
  arm.appendChild(svgEl("line", {
    x1: 0, y1: 0, x2: s * 0.02, y2: s * 0.02,
    stroke: ART_COLORS.skin, "stroke-width": s * 0.07, "stroke-linecap": "round",
  }));
  const tool = (VILLAGER_TOOLS[trade] || VILLAGER_TOOLS.carrier)(s);
  for (const piece of tool) arm.appendChild(svgEl(piece.el, piece.attrs));
  shoulder.appendChild(arm);
  body.appendChild(shoulder);

  // Head.
  body.appendChild(svgEl("circle", { cx: 0, cy: -s * 0.2, r: s * 0.14, fill: ART_COLORS.skin, stroke: ART_COLORS.ink, "stroke-width": 1 }));

  if (soldier) {
    body.appendChild(svgEl("path", {
      d: `M${-s * 0.16} ${-s * 0.3}q${s * 0.16} ${-s * 0.14} ${s * 0.32} 0v${s * 0.05}h${-s * 0.32}z`,
      fill: "#9aa3ae", stroke: ART_COLORS.ink, "stroke-width": 1,
    }));
    body.appendChild(svgEl("path", {
      d: `M${-s * 0.34} ${-s * 0.06}h${-s * 0.14}v${s * 0.2}q${s * 0.07} ${s * 0.1} ${s * 0.14} 0z`,
      fill: ART_COLORS.shield, stroke: ART_COLORS.ink, "stroke-width": 1,
    }));
  } else if (hat === "straw") {
    body.appendChild(svgEl("ellipse", { cx: 0, cy: -s * 0.29, rx: s * 0.22, ry: s * 0.055, fill: ART_COLORS.wheat, stroke: ART_COLORS.ink, "stroke-width": 0.7 }));
    body.appendChild(svgEl("path", { d: `M${-s * 0.09} ${-s * 0.29}q${s * 0.09} ${-s * 0.12} ${s * 0.18} 0z`, fill: ART_COLORS.wheatDark }));
  } else if (hat === "hood") {
    body.appendChild(svgEl("path", {
      d: `M${-s * 0.15} ${-s * 0.2}q0 ${-s * 0.2} ${s * 0.15} ${-s * 0.2}q${s * 0.15} 0 ${s * 0.15} ${s * 0.2}q${-s * 0.09} ${-s * 0.06} ${-s * 0.3} 0z`,
      fill: "#5c4a36", stroke: ART_COLORS.ink, "stroke-width": 0.7,
    }));
  } else if (hat === "cap") {
    body.appendChild(svgEl("path", { d: `M${-s * 0.14} ${-s * 0.26}q${s * 0.14} ${-s * 0.12} ${s * 0.28} 0z`, fill: "#8c4a3a" }));
  } else {
    body.appendChild(svgEl("path", {
      d: `M${-s * 0.15} ${-s * 0.26}q${s * 0.15} ${-s * 0.14} ${s * 0.3} 0`,
      fill: "none", stroke: ART_COLORS.trunk, "stroke-width": 2, "stroke-linecap": "round",
    }));
  }

  parent.appendChild(body);
  return body;
}

// A child: the same figure, smaller, and never given a tool.
function paintChild(parent, scale, tunicColor) {
  const group = svgEl("g", { class: "villager__child" });
  paintVillager(group, scale * 0.62, tunicColor, { trade: "none", hat: "cap" });
  parent.appendChild(group);
  return group;
}


// ---------------------------------------------------------------------------
// Sprites: the sea and the shore
// ---------------------------------------------------------------------------





// ---------------------------------------------------------------------------
// Sprites: wet, cold and dry ground
// ---------------------------------------------------------------------------





// ---------------------------------------------------------------------------
// Sprites: two more kinds of tree
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Sprites: undergrowth. Tiny things scattered over every tile so no two
// hexes of the same ground look alike.
// ---------------------------------------------------------------------------

// The three blades of one tuft, as path data. Kept separate from the element
// so a whole tile's undergrowth can go out as a single <path> — with three
// thousand tiles on the map, one element per blade is thousands of nodes the
// browser does not need.
function grassTuftPath(x, y, scale) {
  const s = scale;
  const n = (value) => (Math.round(value * 10) / 10).toString();
  // Below about seven pixels a tuft is a smudge, and three curved blades in
  // a smudge cost a hundred and fifty characters to draw nothing. Two
  // straight strokes read exactly the same and cost a third as much — which,
  // across the meadows of a thirty-thousand hex island, is a megabyte.
  if (s < 7) {
    return `M${n(x)} ${n(y)}l${n(-s * 0.22)} ${n(-s * 0.8)}M${n(x)} ${n(y)}l${n(s * 0.2)} ${n(-s * 0.9)}`;
  }
  return `M${n(x)} ${n(y)}q${n(-s * 0.16)} ${n(-s * 0.12)} ${n(-s * 0.2)} ${n(-s * 0.34)}` +
         `M${n(x)} ${n(y)}q${n(s * 0.02)} ${n(-s * 0.2)} ${n(s * 0.02)} ${n(-s * 0.4)}` +
         `M${n(x)} ${n(y)}q${n(s * 0.16)} ${n(-s * 0.12)} ${n(s * 0.22)} ${n(-s * 0.32)}`;
}



function paintPebble(parent, x, y, scale, random) {
  paintPebbles(parent, [[x, y]], scale, random);
}

// Every loose stone on one hex in a single element.
function paintPebbles(parent, points, scale, random) {
  if (!points.length) return;
  const s = scale;
  let d = "";
  for (const [x, y] of points) {
    const rx = s * (0.14 + random() * 0.1);
    const ry = s * (0.09 + random() * 0.06);
    d += ` M ${x - rx} ${y} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;
  }
  parent.appendChild(svgEl("path", {
    d: d.trim(),
    fill: ART_COLORS.rockLight, stroke: ART_COLORS.rockDark, "stroke-width": 0.4, opacity: 0.85,
  }));
}



function paintDeer(parent, x, y, scale) {
  const s = scale;
  const g = svgEl("g", { class: "art-wildlife" });
  g.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.22, rx: s * 0.2, ry: s * 0.05, fill: "rgba(0,0,0,0.18)" }));
  g.appendChild(svgEl("path", {
    d: `M ${x - s * 0.18} ${y} q ${s * 0.18} ${-s * 0.12} ${s * 0.36} 0 l 0 ${s * 0.08} q ${-s * 0.18} ${s * 0.1} ${-s * 0.36} 0 z`,
    fill: "#a9743f", stroke: ART_COLORS.ink, "stroke-width": 0.4,
  }));
  g.appendChild(svgEl("line", { x1: x - s * 0.1, y1: y + s * 0.06, x2: x - s * 0.12, y2: y + s * 0.2, stroke: "#7b5227", "stroke-width": s * 0.05 }));
  g.appendChild(svgEl("line", { x1: x + s * 0.1, y1: y + s * 0.06, x2: x + s * 0.12, y2: y + s * 0.2, stroke: "#7b5227", "stroke-width": s * 0.05 }));
  g.appendChild(svgEl("circle", { cx: x + s * 0.2, cy: y - s * 0.12, r: s * 0.08, fill: "#b98049" }));
  g.appendChild(svgEl("path", {
    d: `M ${x + s * 0.17} ${y - s * 0.19} l ${-s * 0.05} ${-s * 0.12} M ${x + s * 0.23} ${y - s * 0.19} l ${s * 0.05} ${-s * 0.12}`,
    stroke: "#6b4a26", "stroke-width": 0.7, fill: "none",
  }));
  parent.appendChild(g);
}

function paintBirdFlock(parent, x, y, scale, random) {
  const s = scale;
  const g = svgEl("g", { class: "art-birds" });
  const count = 3 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) {
    const bx = x + (random() - 0.5) * s * 0.9;
    const by = y + (random() - 0.5) * s * 0.5;
    const w = s * (0.08 + random() * 0.05);
    g.appendChild(svgEl("path", {
      d: `M ${bx - w} ${by} q ${w * 0.5} ${-w * 0.7} ${w} 0 q ${w * 0.5} ${-w * 0.7} ${w} 0`,
      fill: "none", stroke: "rgba(40,32,24,0.55)", "stroke-width": 0.8, "stroke-linecap": "round",
    }));
  }
  parent.appendChild(g);
}

function paintStandingRuin(parent, x, y, scale, random) {
  const s = scale;
  for (let i = 0; i < 3; i++) {
    const rx = x + (i - 1) * s * 0.22 + (random() - 0.5) * s * 0.08;
    const h = s * (0.16 + random() * 0.2);
    parent.appendChild(svgEl("rect", {
      x: rx - s * 0.06, y: y - h, width: s * 0.12, height: h,
      fill: ART_COLORS.ruin, stroke: ART_COLORS.ruinShade, "stroke-width": 0.5,
    }));
  }
}

// ---------------------------------------------------------------------------
// Landmarks added with the wider world
// ---------------------------------------------------------------------------

function paintRuinedTower(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.5, rx: s * 0.42, ry: s * 0.12, fill: "rgba(0,0,0,0.2)" }));
  parent.appendChild(svgEl("path", {
    d: `M ${x - s * 0.24} ${y + s * 0.48} L ${x - s * 0.2} ${y - s * 0.52} L ${x - s * 0.04} ${y - s * 0.36}` +
       ` L ${x + s * 0.08} ${y - s * 0.58} L ${x + s * 0.22} ${y - s * 0.3} L ${x + s * 0.26} ${y + s * 0.48} Z`,
    fill: ART_COLORS.ruin, stroke: ART_COLORS.ink, "stroke-width": 0.9,
  }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.08, y: y + s * 0.14, width: s * 0.16, height: s * 0.34, fill: "#3a332a" }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.06, y: y - s * 0.18, width: s * 0.1, height: s * 0.14, fill: "#3a332a" }));
  for (let i = 0; i < 3; i++) {
    parent.appendChild(svgEl("ellipse", {
      cx: x + (i - 1) * s * 0.34, cy: y + s * 0.5, rx: s * 0.09, ry: s * 0.05,
      fill: ART_COLORS.ruinShade,
    }));
  }
}

function paintHotSpring(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.1, rx: s * 0.46, ry: s * 0.3, fill: "#7fb6c4", stroke: "#4d8290", "stroke-width": 1 }));
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.1, rx: s * 0.3, ry: s * 0.18, fill: "#a9dce6", opacity: 0.8 }));
  for (let i = 0; i < 3; i++) {
    const g = animatedGroup("art-steam", x, y, i * 0.7);
    g.appendChild(svgEl("path", {
      d: `M ${x + (i - 1) * s * 0.2} ${y} q ${s * 0.12} ${-s * 0.24} 0 ${-s * 0.46}`,
      fill: "none", stroke: ART_COLORS.steam, "stroke-width": s * 0.09, "stroke-linecap": "round", opacity: 0.6,
    }));
    parent.appendChild(g);
  }
  for (let i = 0; i < 4; i++) {
    paintPebble(parent, x + Math.cos(i * 1.6) * s * 0.52, y + s * 0.1 + Math.sin(i * 1.6) * s * 0.34, s * 0.5, () => 0.5);
  }
}

function paintBoneOrchard(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.36, rx: s * 0.5, ry: s * 0.14, fill: "rgba(0,0,0,0.15)" }));
  // A ribcage half-buried in the ground
  for (let i = 0; i < 5; i++) {
    const rx = x - s * 0.36 + i * s * 0.18;
    parent.appendChild(svgEl("path", {
      d: `M ${rx} ${y + s * 0.3} q ${-s * 0.1} ${-s * 0.34} ${s * 0.04} ${-s * 0.5}`,
      fill: "none", stroke: ART_COLORS.bone, "stroke-width": s * 0.07, "stroke-linecap": "round",
    }));
  }
  parent.appendChild(svgEl("path", {
    d: `M ${x - s * 0.42} ${y - s * 0.2} q ${s * 0.42} ${-s * 0.14} ${s * 0.84} 0`,
    fill: "none", stroke: ART_COLORS.boneShade, "stroke-width": s * 0.06, "stroke-linecap": "round",
  }));
  // A skull at the end of it
  parent.appendChild(svgEl("ellipse", { cx: x + s * 0.52, cy: y + s * 0.2, rx: s * 0.16, ry: s * 0.13, fill: ART_COLORS.bone, stroke: ART_COLORS.ruinShade, "stroke-width": 0.6 }));
  parent.appendChild(svgEl("circle", { cx: x + s * 0.47, cy: y + s * 0.18, r: s * 0.035, fill: "#3a332a" }));
  parent.appendChild(svgEl("circle", { cx: x + s * 0.58, cy: y + s * 0.18, r: s * 0.035, fill: "#3a332a" }));
}

// ---------------------------------------------------------------------------
// Buildings added with the trades (js/professions.js)
// ---------------------------------------------------------------------------

// A long low hall with a bell on the gable — where a villager goes to learn
// a trade properly.
function paintSchoolhouse(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.42, rx: s * 0.6, ry: s * 0.12, fill: "rgba(0,0,0,0.2)" }));
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.5, y: y - s * 0.06, width: s, height: s * 0.46, rx: s * 0.03,
    fill: ART_COLORS.house, stroke: ART_COLORS.ink, "stroke-width": 0.9,
  }));
  parent.appendChild(svgEl("path", {
    d: `M ${x - s * 0.58} ${y - s * 0.04} L ${x} ${y - s * 0.44} L ${x + s * 0.58} ${y - s * 0.04} Z`,
    fill: ART_COLORS.roofDark, stroke: ART_COLORS.ink, "stroke-width": 0.9,
  }));
  // Bell cote
  parent.appendChild(svgEl("rect", { x: x - s * 0.07, y: y - s * 0.62, width: s * 0.14, height: s * 0.18, fill: ART_COLORS.trunk }));
  parent.appendChild(svgEl("path", {
    d: `M ${x - s * 0.05} ${y - s * 0.47} a ${s * 0.05} ${s * 0.06} 0 0 0 ${s * 0.1} 0 z`,
    fill: "#c9a24a", stroke: ART_COLORS.ink, "stroke-width": 0.5,
  }));
  // Windows and a door
  parent.appendChild(svgEl("rect", { x: x - s * 0.09, y: y + s * 0.1, width: s * 0.18, height: s * 0.3, fill: ART_COLORS.door }));
  for (const dx of [-0.32, 0.32]) {
    parent.appendChild(svgEl("rect", { x: x + dx * s - s * 0.06, y: y + s * 0.08, width: s * 0.12, height: s * 0.12, fill: "#cfe0ea", stroke: ART_COLORS.ink, "stroke-width": 0.5 }));
  }
}

// ---------------------------------------------------------------------------
// Where one kind of ground meets another
// ---------------------------------------------------------------------------




// ---------------------------------------------------------------------------
// Sprites: what else is living out there
// ---------------------------------------------------------------------------

function paintSheep(parent, x, y, scale) {
  const s = scale;
  const g = svgEl("g", { class: "art-wildlife" });
  g.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.18, rx: s * 0.18, ry: s * 0.05, fill: "rgba(0,0,0,0.16)" }));
  g.appendChild(svgEl("ellipse", { cx: x, cy: y, rx: s * 0.19, ry: s * 0.14, fill: "#f4f0e6", stroke: ART_COLORS.ink, "stroke-width": 0.4 }));
  g.appendChild(svgEl("circle", { cx: x + s * 0.17, cy: y - s * 0.06, r: s * 0.07, fill: "#4a423a" }));
  g.appendChild(svgEl("line", { x1: x - s * 0.08, y1: y + s * 0.1, x2: x - s * 0.08, y2: y + s * 0.18, stroke: "#4a423a", "stroke-width": s * 0.04 }));
  g.appendChild(svgEl("line", { x1: x + s * 0.07, y1: y + s * 0.1, x2: x + s * 0.07, y2: y + s * 0.18, stroke: "#4a423a", "stroke-width": s * 0.04 }));
  parent.appendChild(g);
}

function paintBoar(parent, x, y, scale) {
  const s = scale;
  const g = svgEl("g", { class: "art-wildlife" });
  g.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.2, rx: s * 0.2, ry: s * 0.05, fill: "rgba(0,0,0,0.18)" }));
  g.appendChild(svgEl("path", {
    d: "M " + (x - s * 0.2) + " " + y +
       " q " + (s * 0.1) + " " + (-s * 0.16) + " " + (s * 0.24) + " " + (-s * 0.1) +
       " l " + (s * 0.16) + " " + (s * 0.04) +
       " q " + (s * 0.05) + " " + (s * 0.1) + " " + (-s * 0.02) + " " + (s * 0.14) +
       " l " + (-s * 0.36) + " 0 z",
    fill: "#4b3a2c", stroke: ART_COLORS.ink, "stroke-width": 0.4,
  }));
  g.appendChild(svgEl("path", {
    d: "M " + (x + s * 0.2) + " " + (y + s * 0.02) + " l " + (s * 0.07) + " " + (-s * 0.05),
    stroke: "#efe6d2", "stroke-width": 0.9,
  }));
  parent.appendChild(g);
}

function paintHeron(parent, x, y, scale) {
  const s = scale;
  const g = svgEl("g", { class: "art-wildlife" });
  g.appendChild(svgEl("line", { x1: x, y1: y, x2: x, y2: y + s * 0.3, stroke: "#c9b170", "stroke-width": s * 0.035 }));
  g.appendChild(svgEl("ellipse", { cx: x, cy: y - s * 0.06, rx: s * 0.13, ry: s * 0.08, fill: "#cfd6dc", stroke: ART_COLORS.ink, "stroke-width": 0.4 }));
  g.appendChild(svgEl("path", {
    d: "M " + (x + s * 0.06) + " " + (y - s * 0.1) +
       " q " + (s * 0.06) + " " + (-s * 0.12) + " " + (s * 0.02) + " " + (-s * 0.18),
    fill: "none", stroke: "#cfd6dc", "stroke-width": s * 0.045,
  }));
  g.appendChild(svgEl("path", {
    d: "M " + (x + s * 0.08) + " " + (y - s * 0.28) + " l " + (s * 0.1) + " " + (s * 0.03),
    stroke: "#d9a441", "stroke-width": 0.8,
  }));
  parent.appendChild(g);
}

function paintEagle(parent, x, y, scale) {
  const s = scale;
  const g = svgEl("g", { class: "art-birds" });
  g.appendChild(svgEl("path", {
    d: "M " + (x - s * 0.3) + " " + y +
       " q " + (s * 0.16) + " " + (-s * 0.16) + " " + (s * 0.3) + " " + (-s * 0.02) +
       " q " + (s * 0.14) + " " + (-s * 0.14) + " " + (s * 0.3) + " " + (s * 0.02),
    fill: "none", stroke: "rgba(40,32,24,0.7)", "stroke-width": Math.max(0.9, s * 0.06), "stroke-linecap": "round",
  }));
  parent.appendChild(g);
}

// A heap of stacked stones: the mark travellers leave on empty ground.
function paintCairn(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.22, rx: s * 0.22, ry: s * 0.06, fill: "rgba(0,0,0,0.16)" }));
  const stones = [[0, 0.14, 0.17], [-0.04, 0.02, 0.13], [0.03, -0.08, 0.1], [0, -0.18, 0.07]];
  for (const stone of stones) {
    parent.appendChild(svgEl("ellipse", {
      cx: x + stone[0] * s, cy: y + stone[1] * s, rx: stone[2] * s, ry: stone[2] * s * 0.72,
      fill: ART_COLORS.rock, stroke: ART_COLORS.rockDark, "stroke-width": 0.4,
    }));
  }
}

function paintBeehive(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.2, rx: s * 0.19, ry: s * 0.05, fill: "rgba(0,0,0,0.16)" }));
  for (let i = 0; i < 3; i++) {
    parent.appendChild(svgEl("ellipse", {
      cx: x, cy: y + s * (0.13 - i * 0.1), rx: s * (0.18 - i * 0.04), ry: s * 0.06,
      fill: "#d9a441", stroke: "#8a6526", "stroke-width": 0.4,
    }));
  }
  parent.appendChild(svgEl("circle", { cx: x, cy: y + s * 0.13, r: s * 0.03, fill: "#4a3a20" }));
}

function paintScarecrow(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("line", { x1: x, y1: y + s * 0.28, x2: x, y2: y - s * 0.22, stroke: ART_COLORS.trunk, "stroke-width": s * 0.05 }));
  parent.appendChild(svgEl("line", { x1: x - s * 0.18, y1: y - s * 0.1, x2: x + s * 0.18, y2: y - s * 0.1, stroke: ART_COLORS.trunk, "stroke-width": s * 0.04 }));
  parent.appendChild(svgEl("circle", { cx: x, cy: y - s * 0.26, r: s * 0.08, fill: ART_COLORS.wheat, stroke: ART_COLORS.ink, "stroke-width": 0.4 }));
  parent.appendChild(svgEl("path", {
    d: "M " + (x - s * 0.13) + " " + (y - s * 0.3) + " h " + (s * 0.26),
    stroke: "#8a6526", "stroke-width": s * 0.04,
  }));
}

// A smouldering earth mound: where charcoal comes from.
function paintCharcoalBurner(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.2, rx: s * 0.3, ry: s * 0.08, fill: "#4a3a28" }));
  parent.appendChild(svgEl("path", {
    d: "M " + (x - s * 0.26) + " " + (y + s * 0.2) +
       " q " + (s * 0.26) + " " + (-s * 0.4) + " " + (s * 0.52) + " 0 z",
    fill: "#5c4632", stroke: ART_COLORS.ink, "stroke-width": 0.5,
  }));
  const smoke = animatedGroup("art-steam", x, y, 0.4);
  smoke.appendChild(svgEl("path", {
    d: "M " + x + " " + (y - s * 0.04) + " q " + (s * 0.12) + " " + (-s * 0.18) + " 0 " + (-s * 0.34),
    fill: "none", stroke: "rgba(230,230,230,0.6)", "stroke-width": s * 0.07, "stroke-linecap": "round",
  }));
  parent.appendChild(smoke);
}

// A pillar of rock left standing where the sea ate the cliff behind it.
function paintSeaStack(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.24, rx: s * 0.24, ry: s * 0.08, fill: "rgba(255,255,255,0.35)" }));
  parent.appendChild(svgEl("path", {
    d: "M " + (x - s * 0.13) + " " + (y + s * 0.24) +
       " L " + (x - s * 0.09) + " " + (y - s * 0.26) +
       " L " + (x + s * 0.06) + " " + (y - s * 0.3) +
       " L " + (x + s * 0.13) + " " + (y + s * 0.24) + " Z",
    fill: ART_COLORS.rock, stroke: ART_COLORS.rockDark, "stroke-width": 0.6,
  }));
}

// A whale blowing, far out. One or two on a map, no more.
function paintWhale(parent, x, y, scale) {
  const s = scale;
  const g = svgEl("g", { class: "art-wildlife" });
  g.appendChild(svgEl("path", {
    d: "M " + (x - s * 0.5) + " " + y +
       " q " + (s * 0.5) + " " + (-s * 0.26) + " " + s + " 0" +
       " q " + (-s * 0.5) + " " + (s * 0.12) + " " + (-s) + " 0 z",
    fill: "#1f3f56", opacity: 0.8,
  }));
  g.appendChild(svgEl("path", {
    d: "M " + (x + s * 0.46) + " " + y + " l " + (s * 0.22) + " " + (-s * 0.18) + " l 0 " + (s * 0.3) + " z",
    fill: "#1f3f56", opacity: 0.8,
  }));
  g.appendChild(svgEl("path", {
    d: "M " + (x - s * 0.24) + " " + (y - s * 0.1) +
       " q " + (-s * 0.1) + " " + (-s * 0.28) + " " + (s * 0.06) + " " + (-s * 0.4) +
       " M " + (x - s * 0.24) + " " + (y - s * 0.1) +
       " q " + (s * 0.06) + " " + (-s * 0.3) + " " + (s * 0.22) + " " + (-s * 0.38),
    fill: "none", stroke: ART_COLORS.oceanFoam, "stroke-width": s * 0.07, "stroke-linecap": "round", opacity: 0.85,
  }));
  parent.appendChild(g);
}

// A far-off sail, for the empty parts of the chart.
function paintSail(parent, x, y, scale) {
  const s = scale;
  const g = svgEl("g", { class: "art-wildlife" });
  g.appendChild(svgEl("path", {
    d: "M " + (x - s * 0.34) + " " + (y + s * 0.16) +
       " q " + (s * 0.34) + " " + (s * 0.16) + " " + (s * 0.68) + " 0 z",
    fill: "#4a3320",
  }));
  g.appendChild(svgEl("line", { x1: x, y1: y + s * 0.16, x2: x, y2: y - s * 0.42, stroke: "#4a3320", "stroke-width": s * 0.05 }));
  g.appendChild(svgEl("path", {
    d: "M " + (x + s * 0.02) + " " + (y - s * 0.4) +
       " L " + (x + s * 0.28) + " " + (y + s * 0.12) +
       " L " + (x + s * 0.02) + " " + (y + s * 0.12) + " Z",
    fill: "#f2e8d2", stroke: ART_COLORS.ink, "stroke-width": 0.4,
  }));
  g.appendChild(svgEl("path", {
    d: "M " + (x - s * 0.02) + " " + (y - s * 0.34) +
       " L " + (x - s * 0.24) + " " + (y + s * 0.12) +
       " L " + (x - s * 0.02) + " " + (y + s * 0.12) + " Z",
    fill: "#e6dac0", stroke: ART_COLORS.ink, "stroke-width": 0.4,
  }));
  parent.appendChild(g);
}

// A hunting blind on stilts, at the edge of the trees.
function paintHuntersBlind(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("line", { x1: x - s * 0.14, y1: y + s * 0.3, x2: x - s * 0.1, y2: y - s * 0.02, stroke: ART_COLORS.trunk, "stroke-width": s * 0.05 }));
  parent.appendChild(svgEl("line", { x1: x + s * 0.14, y1: y + s * 0.3, x2: x + s * 0.1, y2: y - s * 0.02, stroke: ART_COLORS.trunk, "stroke-width": s * 0.05 }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.17, y: y - s * 0.18, width: s * 0.34, height: s * 0.18, fill: "#6f5433", stroke: ART_COLORS.ink, "stroke-width": 0.4 }));
  parent.appendChild(svgEl("path", {
    d: "M " + (x - s * 0.22) + " " + (y - s * 0.18) +
       " L " + x + " " + (y - s * 0.34) +
       " L " + (x + s * 0.22) + " " + (y - s * 0.18) + " Z",
    fill: ART_COLORS.roofDark,
  }));
}

// ---------------------------------------------------------------------------
// Settlement pieces: what turns a cluster of huts into a place
// ---------------------------------------------------------------------------

// The bare, trodden ground a settlement stands on. An irregular blob, so a
// town does not look like it was stamped out with a cookie cutter.
function paintEarthPatch(parent, x, y, radius, random, fill) {
  const points = [];
  const lobes = 9;
  for (let i = 0; i < lobes; i++) {
    const angle = (Math.PI * 2 * i) / lobes;
    const r = radius * (0.82 + random() * 0.32);
    points.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.82]);
  }
  parent.appendChild(svgEl("path", {
    d: smoothPath(points, true),
    fill: fill || "#c6ab7e",
    opacity: 0.85,
  }));
}

// A ploughed field: a rotated block of furrows just outside the walls.
// What a field looks like this season: turned earth in spring, green in
// summer, gold at harvest, stubble under snow in winter.
const FIELD_SEASONS = {
  1: { ground: "#8a6a45", crop: "#6f8a3f", label: "sown" },
  2: { ground: "#7f9a48", crop: "#94b552", label: "green" },
  3: { ground: "#d8b64a", crop: "#b5902b", label: "ripe" },
  4: { ground: "#b9b6a6", crop: "#9c9887", label: "stubble" },
};

function paintFieldPatch(parent, x, y, width, height, angleDegrees, random, season) {
  const look = FIELD_SEASONS[season] || FIELD_SEASONS[2];
  const g = svgEl("g", { transform: `rotate(${angleDegrees.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})` });
  g.appendChild(svgEl("rect", {
    x: x - width / 2, y: y - height / 2, width, height, rx: height * 0.12,
    fill: look.ground, stroke: "#7d5d39", "stroke-width": 0.7, opacity: 0.92,
  }));
  let furrows = "";
  const rows = Math.max(2, Math.round(height / 4));
  for (let i = 1; i < rows; i++) {
    const fy = y - height / 2 + (height * i) / rows;
    furrows += `M${(x - width / 2 + 1).toFixed(1)} ${fy.toFixed(1)}h${(width - 2).toFixed(1)}`;
  }
  g.appendChild(svgEl("path", {
    d: furrows, fill: "none", stroke: look.crop, "stroke-width": season === 4 ? 0.6 : 1.1, opacity: 0.8,
  }));
  // At harvest the sheaves are standing in it.
  if (season === 3) {
    for (let i = 0; i < 3; i++) {
      const sx = x - width * 0.3 + i * width * 0.3;
      g.appendChild(svgEl("path", {
        d: `M${sx.toFixed(1)} ${(y + height * 0.28).toFixed(1)}l${(-height * 0.1).toFixed(1)} ${(-height * 0.4).toFixed(1)}` +
           `m${(height * 0.1).toFixed(1)} ${(height * 0.4).toFixed(1)}l${(height * 0.1).toFixed(1)} ${(-height * 0.4).toFixed(1)}`,
        fill: "none", stroke: "#c9a24a", "stroke-width": 1.2, "stroke-linecap": "round",
      }));
    }
  }
  // And in winter there is snow lying in the furrows.
  if (season === 4) {
    g.appendChild(svgEl("rect", {
      x: x - width / 2, y: y - height / 2, width, height, rx: height * 0.12,
      fill: ART_COLORS.snow, opacity: 0.45,
    }));
  }
  parent.appendChild(g);
}

// A ring of sharpened stakes with a gap for the gate. `gate` is the angle,
// in radians, the road comes in on.
function paintPalisadeRing(parent, x, y, radius, gate, color) {
  const stakes = Math.max(14, Math.round(radius * 0.55));
  let posts = "";
  let rail = "";
  const gap = 0.42;                       // how wide the gateway is, in radians
  let previous = null;
  for (let i = 0; i < stakes; i++) {
    const angle = (Math.PI * 2 * i) / stakes;
    let delta = Math.abs(angle - gate);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    if (delta < gap) { previous = null; continue; }
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius * 0.84;
    const h = radius * 0.2;
    posts += `M${px.toFixed(1)} ${py.toFixed(1)}l0 ${(-h).toFixed(1)}`;
    if (previous) rail += `M${previous[0].toFixed(1)} ${(previous[1] - h * 0.6).toFixed(1)}L${px.toFixed(1)} ${(py - h * 0.6).toFixed(1)}`;
    previous = [px, py];
  }
  parent.appendChild(svgEl("path", {
    d: rail, fill: "none", stroke: "#6f5433", "stroke-width": Math.max(0.8, radius * 0.045), opacity: 0.9,
  }));
  parent.appendChild(svgEl("path", {
    d: posts, fill: "none", stroke: color || "#7d5f3a",
    "stroke-width": Math.max(1, radius * 0.06), "stroke-linecap": "round",
  }));

  // Gateposts, one either side of the gap.
  for (const side of [-1, 1]) {
    const angle = gate + side * gap;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius * 0.84;
    parent.appendChild(svgEl("rect", {
      x: px - radius * 0.045, y: py - radius * 0.26, width: radius * 0.09, height: radius * 0.28,
      fill: "#5c4530", stroke: ART_COLORS.ink, "stroke-width": 0.5,
    }));
  }
}

// A proper stone curtain wall: a thick ring, square towers spaced round it,
// and an arched gatehouse where the road comes in.
function paintStoneWallRing(parent, x, y, radius, gate, towerCount) {
  const gap = 0.34;
  const start = gate + gap;
  const end = gate + Math.PI * 2 - gap;
  const points = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const angle = start + ((end - start) * i) / steps;
    points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.84]);
  }
  const d = smoothPath(points, false);
  parent.appendChild(svgEl("path", {
    d, fill: "none", stroke: "#6f6a5e", "stroke-width": radius * 0.15, "stroke-linecap": "round",
  }));
  parent.appendChild(svgEl("path", {
    d, fill: "none", stroke: "#b9b3a6", "stroke-width": radius * 0.09, "stroke-linecap": "round",
  }));

  // Crenellations along the top of the wall.
  let merlons = "";
  for (let i = 0; i < points.length; i += 3) {
    const [px, py] = points[i];
    merlons += `M${px.toFixed(1)} ${(py - radius * 0.06).toFixed(1)}l0 ${(-radius * 0.07).toFixed(1)}`;
  }
  parent.appendChild(svgEl("path", {
    d: merlons, fill: "none", stroke: "#cdc7ba", "stroke-width": radius * 0.05, "stroke-linecap": "butt",
  }));

  const towers = Math.max(3, towerCount || 4);
  for (let i = 0; i < towers; i++) {
    const angle = start + ((end - start) * (i + 0.5)) / towers;
    const tx = x + Math.cos(angle) * radius;
    const ty = y + Math.sin(angle) * radius * 0.84;
    parent.appendChild(svgEl("rect", {
      x: tx - radius * 0.09, y: ty - radius * 0.22, width: radius * 0.18, height: radius * 0.28,
      fill: "#b9b3a6", stroke: "#6f6a5e", "stroke-width": 0.7,
    }));
    parent.appendChild(svgEl("path", {
      d: `M${(tx - radius * 0.11).toFixed(1)} ${(ty - radius * 0.22).toFixed(1)}` +
         `L${tx.toFixed(1)} ${(ty - radius * 0.36).toFixed(1)}` +
         `L${(tx + radius * 0.11).toFixed(1)} ${(ty - radius * 0.22).toFixed(1)}z`,
      fill: ART_COLORS.roofDark,
    }));
  }

  // The gatehouse: two towers and a dark arch between them.
  for (const side of [-1, 1]) {
    const angle = gate + side * gap;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius * 0.84;
    parent.appendChild(svgEl("rect", {
      x: px - radius * 0.075, y: py - radius * 0.3, width: radius * 0.15, height: radius * 0.36,
      fill: "#cdc7ba", stroke: "#6f6a5e", "stroke-width": 0.8,
    }));
  }
  const gx = x + Math.cos(gate) * radius;
  const gy = y + Math.sin(gate) * radius * 0.84;
  parent.appendChild(svgEl("path", {
    d: `M${(gx - radius * 0.08).toFixed(1)} ${(gy + radius * 0.04).toFixed(1)}` +
       `v${(-radius * 0.14).toFixed(1)}a${(radius * 0.08).toFixed(1)} ${(radius * 0.1).toFixed(1)} 0 0 1 ${(radius * 0.16).toFixed(1)} 0` +
       `v${(radius * 0.14).toFixed(1)}z`,
    fill: "#3a332a",
  }));
}

// Smoke from a chimney. One per house is too much; two or three per village
// is exactly enough to make it look lived in.
function paintChimneySmoke(parent, x, y, scale, delaySeconds) {
  const g = animatedGroup("art-steam", x, y, delaySeconds || 0);
  g.appendChild(svgEl("path", {
    d: `M${x} ${y}q${scale * 0.18} ${-scale * 0.26} ${scale * 0.02} ${-scale * 0.52}` +
       `q${-scale * 0.16} ${-scale * 0.24} ${scale * 0.06} ${-scale * 0.46}`,
    fill: "none", stroke: "rgba(232, 228, 218, 0.65)",
    "stroke-width": scale * 0.09, "stroke-linecap": "round",
  }));
  parent.appendChild(g);
}

// A carved pole of stacked faces: the garlocks put one at the heart of
// every camp.
function paintTotem(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.5, rx: s * 0.22, ry: s * 0.07, fill: "rgba(0,0,0,0.3)" }));
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.11, y: y - s * 0.62, width: s * 0.22, height: s * 1.12,
    fill: "#5c4025", stroke: ART_COLORS.ink, "stroke-width": 0.7,
  }));
  for (let i = 0; i < 3; i++) {
    const fy = y - s * 0.46 + i * s * 0.34;
    parent.appendChild(svgEl("rect", {
      x: x - s * 0.13, y: fy, width: s * 0.26, height: s * 0.06,
      fill: i % 2 ? "#8c2a1c" : "#c9a24a",
    }));
    parent.appendChild(svgEl("circle", { cx: x - s * 0.05, cy: fy + s * 0.16, r: s * 0.028, fill: "#1d1a16" }));
    parent.appendChild(svgEl("circle", { cx: x + s * 0.05, cy: fy + s * 0.16, r: s * 0.028, fill: "#1d1a16" }));
  }
  parent.appendChild(svgEl("path", {
    d: `M${x - s * 0.3} ${y - s * 0.62}L${x} ${y - s * 0.84}L${x + s * 0.3} ${y - s * 0.62}z`,
    fill: "#8c2a1c", stroke: ART_COLORS.ink, "stroke-width": 0.7,
  }));
}

// A heap of skulls and cracked bones, for the edge of a garlock camp.
function paintBonePile(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.16, rx: s * 0.34, ry: s * 0.1, fill: "rgba(0,0,0,0.2)" }));
  for (const spot of [[-0.16, 0.04, 0.11], [0.14, 0.06, 0.1], [0, -0.06, 0.12]]) {
    parent.appendChild(svgEl("ellipse", {
      cx: x + spot[0] * s, cy: y + spot[1] * s, rx: spot[2] * s, ry: spot[2] * s * 0.82,
      fill: ART_COLORS.bone, stroke: ART_COLORS.boneShade, "stroke-width": 0.5,
    }));
  }
  parent.appendChild(svgEl("circle", { cx: x - s * 0.04, cy: y - s * 0.08, r: s * 0.03, fill: "#2f2a22" }));
  parent.appendChild(svgEl("circle", { cx: x + s * 0.04, cy: y - s * 0.08, r: s * 0.03, fill: "#2f2a22" }));
}

// A jetty running out into the water, with a boat tied up at the end.
function paintJetty(parent, x, y, scale, angle) {
  const s = scale;
  const g = svgEl("g", { transform: `rotate(${((angle * 180) / Math.PI).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})` });
  g.appendChild(svgEl("rect", {
    x, y: y - s * 0.07, width: s * 0.9, height: s * 0.14,
    fill: "#8a6a42", stroke: ART_COLORS.ink, "stroke-width": 0.6,
  }));
  for (let i = 1; i < 4; i++) {
    g.appendChild(svgEl("rect", {
      x: x + s * 0.22 * i, y: y + s * 0.05, width: s * 0.05, height: s * 0.14, fill: "#5c4530",
    }));
  }
  g.appendChild(svgEl("path", {
    d: `M${(x + s * 0.9).toFixed(1)} ${(y - s * 0.2).toFixed(1)}` +
       `q${(s * 0.2).toFixed(1)} ${(s * 0.18).toFixed(1)} 0 ${(s * 0.32).toFixed(1)}z`,
    fill: "#6f5433", stroke: ART_COLORS.ink, "stroke-width": 0.6,
  }));
  parent.appendChild(g);
}

// ---------------------------------------------------------------------------
// Village life: the small things that say people live here
// ---------------------------------------------------------------------------

// Split logs stacked against a wall.
function paintWoodpile(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.16, rx: s * 0.3, ry: s * 0.07, fill: "rgba(0,0,0,0.2)" }));
  for (let row = 0; row < 3; row++) {
    const count = 3 - (row % 2 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const lx = x - s * 0.22 + i * s * 0.19 + (row % 2 ? s * 0.09 : 0);
      const ly = y + s * 0.1 - row * s * 0.14;
      parent.appendChild(svgEl("circle", { cx: lx, cy: ly, r: s * 0.085, fill: "#c79a6b", stroke: ART_COLORS.trunkShade, "stroke-width": 0.6 }));
      parent.appendChild(svgEl("circle", { cx: lx, cy: ly, r: s * 0.035, fill: ART_COLORS.trunkShade }));
    }
  }
}

// A two-wheeled handcart, tipped on its shafts.
function paintHandcart(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.2, rx: s * 0.32, ry: s * 0.07, fill: "rgba(0,0,0,0.18)" }));
  parent.appendChild(svgEl("path", {
    d: `M${x - s * 0.3} ${y}h${s * 0.5}l${s * 0.04} ${s * 0.16}h${-s * 0.5}z`,
    fill: "#8a6a42", stroke: ART_COLORS.ink, "stroke-width": 0.7,
  }));
  parent.appendChild(svgEl("line", { x1: x + s * 0.2, y1: y + s * 0.04, x2: x + s * 0.44, y2: y - s * 0.08, stroke: "#6f5433", "stroke-width": s * 0.05, "stroke-linecap": "round" }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.1, cy: y + s * 0.19, r: s * 0.12, fill: "none", stroke: "#5c4530", "stroke-width": s * 0.05 }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.1, cy: y + s * 0.19, r: s * 0.03, fill: "#5c4530" }));
}

// Washing strung between two poles, moving in the wind.
function paintLaundryLine(parent, x, y, scale, random) {
  const s = scale;
  const span = s * 0.8;
  parent.appendChild(svgEl("line", { x1: x - span / 2, y1: y + s * 0.2, x2: x - span / 2, y2: y - s * 0.25, stroke: "#6f5433", "stroke-width": s * 0.04 }));
  parent.appendChild(svgEl("line", { x1: x + span / 2, y1: y + s * 0.2, x2: x + span / 2, y2: y - s * 0.25, stroke: "#6f5433", "stroke-width": s * 0.04 }));
  parent.appendChild(svgEl("path", {
    d: `M${x - span / 2} ${y - s * 0.22}q${span / 2} ${s * 0.1} ${span} 0`,
    fill: "none", stroke: "#4a3a28", "stroke-width": 0.7,
  }));
  const colours = ["#e8e2d2", "#c8d6e0", "#dcc6a8", "#cfa9a0"];
  for (let i = 0; i < 3; i++) {
    const cx = x - span * 0.3 + i * span * 0.3;
    const cloth = animatedGroup("art-laundry", cx, y - s * 0.2, i * 0.5);
    cloth.appendChild(svgEl("path", {
      d: `M${cx - s * 0.08} ${y - s * 0.19}h${s * 0.16}l${-s * 0.01} ${s * 0.24}q${-s * 0.07} ${s * 0.05} ${-s * 0.14} 0z`,
      fill: colours[(i + Math.floor(random() * 4)) % colours.length],
      stroke: "rgba(70,55,38,0.4)", "stroke-width": 0.5,
    }));
    parent.appendChild(cloth);
  }
}

// A kitchen garden: four raised beds behind a cottage.
function paintGardenPlot(parent, x, y, scale, random) {
  const s = scale;
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.36, y: y - s * 0.2, width: s * 0.72, height: s * 0.4, rx: s * 0.03,
    fill: "#7d6242", stroke: "#5c4530", "stroke-width": 0.7,
  }));
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      parent.appendChild(svgEl("circle", {
        cx: x - s * 0.22 + col * s * 0.22,
        cy: y - s * 0.08 + row * s * 0.17,
        r: s * 0.055,
        fill: random() < 0.5 ? "#5f8a3c" : "#7aa84a",
      }));
    }
  }
}

function paintChicken(parent, x, y, scale) {
  const s = scale;
  const g = svgEl("g", { class: "art-wildlife" });
  g.appendChild(svgEl("ellipse", { cx: x, cy: y, rx: s * 0.11, ry: s * 0.09, fill: "#f2ead6", stroke: ART_COLORS.ink, "stroke-width": 0.4 }));
  g.appendChild(svgEl("circle", { cx: x + s * 0.09, cy: y - s * 0.07, r: s * 0.05, fill: "#f2ead6", stroke: ART_COLORS.ink, "stroke-width": 0.4 }));
  g.appendChild(svgEl("path", { d: `M${x + s * 0.13} ${y - s * 0.06}l${s * 0.05} ${s * 0.02}l${-s * 0.05} ${s * 0.02}z`, fill: "#d9a441" }));
  g.appendChild(svgEl("path", { d: `M${x + s * 0.07} ${y - s * 0.11}q${s * 0.02} ${-s * 0.04} ${s * 0.04} 0`, fill: "#c0392b" }));
  g.appendChild(svgEl("line", { x1: x - s * 0.02, y1: y + s * 0.08, x2: x - s * 0.02, y2: y + s * 0.14, stroke: "#d9a441", "stroke-width": s * 0.02 }));
  parent.appendChild(g);
}

function paintPig(parent, x, y, scale) {
  const s = scale;
  const g = svgEl("g", { class: "art-wildlife" });
  g.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.14, rx: s * 0.17, ry: s * 0.04, fill: "rgba(0,0,0,0.18)" }));
  g.appendChild(svgEl("ellipse", { cx: x, cy: y, rx: s * 0.17, ry: s * 0.11, fill: "#e0b0a8", stroke: ART_COLORS.ink, "stroke-width": 0.4 }));
  g.appendChild(svgEl("circle", { cx: x + s * 0.16, cy: y - s * 0.03, r: s * 0.07, fill: "#e8bcb4", stroke: ART_COLORS.ink, "stroke-width": 0.4 }));
  g.appendChild(svgEl("circle", { cx: x + s * 0.22, cy: y - s * 0.02, r: s * 0.02, fill: "#8c5f58" }));
  for (const dx of [-0.09, 0.07]) {
    g.appendChild(svgEl("line", { x1: x + dx * s, y1: y + s * 0.08, x2: x + dx * s, y2: y + s * 0.15, stroke: "#c79a90", "stroke-width": s * 0.035 }));
  }
  parent.appendChild(g);
}

function paintDog(parent, x, y, scale) {
  const s = scale;
  const g = svgEl("g", { class: "art-wildlife" });
  g.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.13, rx: s * 0.15, ry: s * 0.04, fill: "rgba(0,0,0,0.18)" }));
  g.appendChild(svgEl("ellipse", { cx: x, cy: y, rx: s * 0.14, ry: s * 0.075, fill: "#a9743f", stroke: ART_COLORS.ink, "stroke-width": 0.4 }));
  g.appendChild(svgEl("circle", { cx: x + s * 0.14, cy: y - s * 0.05, r: s * 0.055, fill: "#b98049", stroke: ART_COLORS.ink, "stroke-width": 0.4 }));
  g.appendChild(svgEl("path", { d: `M${x + s * 0.11} ${y - s * 0.09}l${-s * 0.02} ${-s * 0.06}l${s * 0.06} ${s * 0.02}z`, fill: "#8a5c33" }));
  g.appendChild(svgEl("path", { d: `M${x - s * 0.13} ${y - s * 0.02}q${-s * 0.08} ${-s * 0.08} ${-s * 0.02} ${-s * 0.12}`, fill: "none", stroke: "#a9743f", "stroke-width": s * 0.04, "stroke-linecap": "round" }));
  parent.appendChild(g);
}

// A small roadside shrine with a lit candle.
function paintShrine(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("rect", { x: x - s * 0.14, y: y - s * 0.1, width: s * 0.28, height: s * 0.34, fill: "#b9b3a6", stroke: "#6f6a5e", "stroke-width": 0.7 }));
  parent.appendChild(svgEl("path", { d: `M${x - s * 0.2} ${y - s * 0.1}L${x} ${y - s * 0.38}L${x + s * 0.2} ${y - s * 0.1}z`, fill: ART_COLORS.roofDark, stroke: ART_COLORS.ink, "stroke-width": 0.7 }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.06, y: y - s * 0.02, width: s * 0.12, height: s * 0.16, fill: "#3a332a" }));
  const flame = animatedGroup("art-flame", x, y, 0.3);
  flame.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.02, rx: s * 0.03, ry: s * 0.05, fill: "#f6c445" }));
  parent.appendChild(flame);
}

// The bread oven by the square: a clay dome with a fire in it.
function paintBakeOven(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.2, rx: s * 0.3, ry: s * 0.08, fill: "rgba(0,0,0,0.2)" }));
  parent.appendChild(svgEl("path", { d: `M${x - s * 0.26} ${y + s * 0.2}q0 ${-s * 0.42} ${s * 0.26} ${-s * 0.42}q${s * 0.26} 0 ${s * 0.26} ${s * 0.42}z`, fill: "#b98a5e", stroke: ART_COLORS.ink, "stroke-width": 0.8 }));
  parent.appendChild(svgEl("path", { d: `M${x - s * 0.09} ${y + s * 0.2}q0 ${-s * 0.16} ${s * 0.09} ${-s * 0.16}q${s * 0.09} 0 ${s * 0.09} ${s * 0.16}z`, fill: "#3a2418" }));
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.15, rx: s * 0.05, ry: s * 0.04, fill: "#e0742a" }));
  const smoke = animatedGroup("art-steam", x, y, 0.6);
  smoke.appendChild(svgEl("path", { d: `M${x + s * 0.16} ${y - s * 0.22}q${s * 0.1} ${-s * 0.16} 0 ${-s * 0.3}`, fill: "none", stroke: "rgba(230,228,220,0.6)", "stroke-width": s * 0.06, "stroke-linecap": "round" }));
  parent.appendChild(smoke);
}

// A windmill on the rise outside the walls, sails turning.
function paintWindmill(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.5, rx: s * 0.3, ry: s * 0.09, fill: "rgba(0,0,0,0.22)" }));
  parent.appendChild(svgEl("path", {
    d: `M${x - s * 0.22} ${y + s * 0.5}L${x - s * 0.13} ${y - s * 0.3}h${s * 0.26}L${x + s * 0.22} ${y + s * 0.5}z`,
    fill: ART_COLORS.house, stroke: ART_COLORS.ink, "stroke-width": 0.9,
  }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.06, y: y + s * 0.24, width: s * 0.12, height: s * 0.26, fill: ART_COLORS.door }));
  parent.appendChild(svgEl("path", { d: `M${x - s * 0.18} ${y - s * 0.3}L${x} ${y - s * 0.52}L${x + s * 0.18} ${y - s * 0.3}z`, fill: ART_COLORS.roofDark, stroke: ART_COLORS.ink, "stroke-width": 0.8 }));

  const sails = animatedGroup("art-sails", x, y - s * 0.34, 0);
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 2) * i;
    const dx = Math.cos(angle) * s * 0.46;
    const dy = Math.sin(angle) * s * 0.46;
    sails.appendChild(svgEl("line", {
      x1: x, y1: y - s * 0.34, x2: x + dx, y2: y - s * 0.34 + dy,
      stroke: "#6f5433", "stroke-width": s * 0.05, "stroke-linecap": "round",
    }));
    sails.appendChild(svgEl("path", {
      d: `M${x + dx * 0.45} ${y - s * 0.34 + dy * 0.45}l${-dy * 0.16} ${dx * 0.16}l${dx * 0.5} ${dy * 0.5}l${dy * 0.16} ${-dx * 0.16}z`,
      fill: "#efe3c8", stroke: "rgba(70,55,38,0.5)", "stroke-width": 0.5,
    }));
  }
  parent.appendChild(sails);
  parent.appendChild(svgEl("circle", { cx: x, cy: y - s * 0.34, r: s * 0.05, fill: "#4a3a28" }));
}

// The village pond, with a duck on it and rushes round the edge.
function paintPond(parent, x, y, scale, random) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y, rx: s * 0.52, ry: s * 0.34, fill: "#5f8fa3", stroke: "#4a7182", "stroke-width": 0.9 }));
  parent.appendChild(svgEl("ellipse", { cx: x - s * 0.08, cy: y - s * 0.04, rx: s * 0.34, ry: s * 0.2, fill: "#79aabd", opacity: 0.7 }));
  for (let i = 0; i < 7; i++) {
    const angle = (Math.PI * 2 * i) / 7 + random() * 0.4;
    const rx = x + Math.cos(angle) * s * 0.52;
    const ry = y + Math.sin(angle) * s * 0.34;
    parent.appendChild(svgEl("line", {
      x1: rx, y1: ry, x2: rx + (random() - 0.5) * s * 0.06, y2: ry - s * 0.16,
      stroke: ART_COLORS.reed, "stroke-width": s * 0.03, "stroke-linecap": "round",
    }));
  }
  // A duck.
  const duck = svgEl("g", { class: "art-wildlife" });
  duck.appendChild(svgEl("ellipse", { cx: x + s * 0.12, cy: y + s * 0.02, rx: s * 0.09, ry: s * 0.055, fill: "#f2ead6", stroke: ART_COLORS.ink, "stroke-width": 0.4 }));
  duck.appendChild(svgEl("circle", { cx: x + s * 0.19, cy: y - s * 0.04, r: s * 0.04, fill: "#f2ead6", stroke: ART_COLORS.ink, "stroke-width": 0.4 }));
  duck.appendChild(svgEl("path", { d: `M${x + s * 0.22} ${y - s * 0.04}l${s * 0.04} ${s * 0.015}l${-s * 0.04} ${s * 0.015}z`, fill: "#d9a441" }));
  parent.appendChild(duck);
}

// A row of fruit trees, planted in a line the way an orchard is.
function paintOrchardRow(parent, x, y, scale, count, angleDegrees, random) {
  const s = scale;
  const g = svgEl("g", { transform: `rotate(${angleDegrees.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})` });
  for (let i = 0; i < count; i++) {
    const tx = x + (i - (count - 1) / 2) * s * 0.42;
    g.appendChild(svgEl("ellipse", { cx: tx, cy: y + s * 0.2, rx: s * 0.13, ry: s * 0.04, fill: "rgba(0,0,0,0.18)" }));
    g.appendChild(svgEl("rect", { x: tx - s * 0.025, y: y, width: s * 0.05, height: s * 0.2, fill: ART_COLORS.trunk }));
    g.appendChild(svgEl("circle", {
      cx: tx, cy: y - s * 0.08, r: s * 0.16,
      fill: random() < 0.5 ? "#5f9a3c" : "#6faa46", stroke: "#3f6b2c", "stroke-width": 0.6,
    }));
    if (random() < 0.6) {
      g.appendChild(svgEl("circle", { cx: tx + s * 0.06, cy: y - s * 0.11, r: s * 0.03, fill: "#c0392b" }));
    }
  }
  parent.appendChild(g);
}

// The inn: a long house with a painted sign hanging out front.
function paintInn(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.44, rx: s * 0.62, ry: s * 0.12, fill: "rgba(0,0,0,0.2)" }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.52, y: y - s * 0.06, width: s * 1.04, height: s * 0.5, fill: ART_COLORS.house, stroke: ART_COLORS.ink, "stroke-width": 0.9 }));
  parent.appendChild(svgEl("path", {
    d: `M${x - s * 0.6} ${y - s * 0.04}L${x - s * 0.2} ${y - s * 0.44}h${s * 0.4}L${x + s * 0.6} ${y - s * 0.04}z`,
    fill: ART_COLORS.roof, stroke: ART_COLORS.ink, "stroke-width": 0.9,
  }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.1, y: y + s * 0.14, width: s * 0.2, height: s * 0.3, fill: ART_COLORS.door }));
  for (const dx of [-0.34, 0.28]) {
    parent.appendChild(svgEl("rect", { x: x + dx * s, y: y + s * 0.08, width: s * 0.14, height: s * 0.14, fill: "#cfe0ea", stroke: ART_COLORS.ink, "stroke-width": 0.5 }));
  }
  // The sign, on its bracket.
  parent.appendChild(svgEl("line", { x1: x + s * 0.52, y1: y - s * 0.02, x2: x + s * 0.72, y2: y - s * 0.02, stroke: "#4a3a28", "stroke-width": s * 0.03 }));
  const sign = animatedGroup("art-laundry", x + s * 0.68, y - s * 0.02, 0.2);
  sign.appendChild(svgEl("rect", { x: x + s * 0.6, y: y, width: s * 0.17, height: s * 0.17, fill: "#8a6526", stroke: ART_COLORS.ink, "stroke-width": 0.6 }));
  sign.appendChild(svgEl("circle", { cx: x + s * 0.685, cy: y + s * 0.085, r: s * 0.045, fill: "#e5c06b" }));
  parent.appendChild(sign);
}

// Stables: a low open-fronted shed with a horse standing in it.
function paintStable(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.34, rx: s * 0.5, ry: s * 0.1, fill: "rgba(0,0,0,0.2)" }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.42, y: y - s * 0.02, width: s * 0.84, height: s * 0.36, fill: "#3a2f22" }));
  parent.appendChild(svgEl("path", {
    d: `M${x - s * 0.5} ${y - s * 0.02}L${x} ${y - s * 0.34}L${x + s * 0.5} ${y - s * 0.02}z`,
    fill: ART_COLORS.barnRoof, stroke: ART_COLORS.ink, "stroke-width": 0.8,
  }));
  for (const dx of [-0.28, 0, 0.28]) {
    parent.appendChild(svgEl("line", { x1: x + dx * s, y1: y - s * 0.02, x2: x + dx * s, y2: y + s * 0.34, stroke: "#6f5433", "stroke-width": s * 0.05 }));
  }
  // A horse in the middle stall.
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.16, rx: s * 0.12, ry: s * 0.08, fill: "#7b5335" }));
  parent.appendChild(svgEl("circle", { cx: x + s * 0.1, cy: y + s * 0.08, r: s * 0.05, fill: "#8a6040" }));
}

// ---------------------------------------------------------------------------
// Relief: the faint contour rings that tell high ground from low
// ---------------------------------------------------------------------------



if (typeof module !== "undefined" && module.exports) {
  // Everything this file defines. Kept generated-flat on purpose: the
  // browser uses the globals, and Node only needs them for the tests.
  module.exports = {
    ART_COLORS, VILLAGER_TOOLS, VILLAGER_HATS, FIELD_SEASONS, createRandom, svgEl,
    animatedGroup, smoothPath, pick, shadeColor, hexEdgeCorners, hexPoints,
    paintHexBase, paintHayBale, paintStandingStones, paintMotherTree, paintDragonBones, paintCrystalMine,
    paintShipwreck, offsetCenterline, buildRiverBand, paintRiver, paintHouse, paintBarn,
    paintCampfire, paintBanner, paintPlaza, paintWell, paintWatchtower, paintWarTent,
    paintSpikes, paintRiverBridge, paintChieftainHall, paintMarketStall, paintSmithy, paintLumberCamp,
    paintQuarryWorks, paintFisheryDock, paintAnimalPen, paintTrainingGround, paintVillager, paintChild,
    grassTuftPath, paintPebble, paintPebbles, paintDeer, paintBirdFlock, paintStandingRuin,
    paintRuinedTower, paintHotSpring, paintBoneOrchard, paintSchoolhouse, paintSheep, paintBoar,
    paintHeron, paintEagle, paintCairn, paintBeehive, paintScarecrow, paintCharcoalBurner,
    paintSeaStack, paintWhale, paintSail, paintHuntersBlind, paintEarthPatch, paintFieldPatch,
    paintPalisadeRing, paintStoneWallRing, paintChimneySmoke, paintTotem, paintBonePile, paintJetty,
    paintWoodpile, paintHandcart, paintLaundryLine, paintGardenPlot, paintChicken, paintPig,
    paintDog, paintShrine, paintBakeOven, paintWindmill, paintPond, paintOrchardRow,
    paintInn, paintStable,
  };
}
