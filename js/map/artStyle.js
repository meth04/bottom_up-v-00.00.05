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
  // Base polygon
  parent.appendChild(svgEl("polygon", {
    points: hexPoints(x, y, size),
    fill,
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

function paintTree(parent, x, y, scale, random) {
  const s = scale;
  // Soft ground shadow
  parent.appendChild(svgEl("ellipse", {
    cx: x + s * 0.05, cy: y + s * 0.3, rx: s * 0.28, ry: s * 0.1,
    fill: "rgba(25, 40, 15, 0.22)"
  }));
  // Trunk with root flares
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.06},${y - s * 0.05} ${x + s * 0.06},${y - s * 0.05} ${x + s * 0.1},${y + s * 0.32} ${x - s * 0.1},${y + s * 0.32}`,
    fill: ART_COLORS.trunk
  }));
  // Canopy tiers
  parent.appendChild(svgEl("circle", { cx: x, cy: y - s * 0.1, r: s * 0.36, fill: ART_COLORS.canopyDark }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.1, cy: y - s * 0.2, r: s * 0.28, fill: ART_COLORS.canopy }));
  parent.appendChild(svgEl("circle", { cx: x + s * 0.1, cy: y - s * 0.14, r: s * 0.24, fill: ART_COLORS.canopy }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.15, cy: y - s * 0.28, r: s * 0.14, fill: ART_COLORS.canopyLight, opacity: 0.9 }));
}

function paintPineTree(parent, x, y, scale, random) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.35, rx: s * 0.22, ry: s * 0.08, fill: "rgba(20, 35, 20, 0.22)" }));
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.05, y: y + s * 0.1, width: s * 0.1, height: s * 0.25, rx: s * 0.02,
    fill: ART_COLORS.trunk
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.32},${y + s * 0.18} ${x},${y - s * 0.1} ${x + s * 0.32},${y + s * 0.18}`,
    fill: ART_COLORS.pineCanopy
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.25},${y} ${x},${y - s * 0.25} ${x + s * 0.25},${y}`,
    fill: ART_COLORS.pineCanopy
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.18},${y - s * 0.15} ${x},${y - s * 0.44} ${x + s * 0.18},${y - s * 0.15}`,
    fill: ART_COLORS.pineCanopyLight
  }));
}

function paintAutumnTree(parent, x, y, scale, random) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x + s * 0.05, cy: y + s * 0.3, rx: s * 0.28, ry: s * 0.1, fill: "rgba(45, 30, 15, 0.22)" }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.06},${y - s * 0.05} ${x + s * 0.06},${y - s * 0.05} ${x + s * 0.1},${y + s * 0.32} ${x - s * 0.1},${y + s * 0.32}`,
    fill: ART_COLORS.trunk
  }));
  parent.appendChild(svgEl("circle", { cx: x, cy: y - s * 0.1, r: s * 0.36, fill: "#993a18" }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.1, cy: y - s * 0.2, r: s * 0.28, fill: ART_COLORS.autumnCanopy }));
  parent.appendChild(svgEl("circle", { cx: x + s * 0.1, cy: y - s * 0.14, r: s * 0.24, fill: ART_COLORS.autumnCanopy }));
  parent.appendChild(svgEl("circle", { cx: x - s * 0.15, cy: y - s * 0.28, r: s * 0.14, fill: ART_COLORS.autumnLight, opacity: 0.95 }));
}

function paintBush(parent, x, y, scale, random) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y, rx: s * 0.3, ry: s * 0.2, fill: ART_COLORS.canopyDark }));
  parent.appendChild(svgEl("ellipse", { cx: x - s * 0.08, cy: y - s * 0.06, rx: s * 0.2, ry: s * 0.13, fill: ART_COLORS.canopy }));
}

function paintRock(parent, x, y, scale, random) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x + 2, cy: y + s * 0.18, rx: s * 0.32, ry: s * 0.12, fill: "rgba(0,0,0,0.22)" }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.32},${y + s * 0.16} ${x - s * 0.2},${y - s * 0.18} ${x + s * 0.08},${y - s * 0.24} ${x + s * 0.34},${y + s * 0.04} ${x + s * 0.22},${y + s * 0.18}`,
    fill: ART_COLORS.rock, stroke: ART_COLORS.rockDark, "stroke-width": 1, "stroke-linejoin": "round",
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.2},${y - s * 0.18} ${x + s * 0.08},${y - s * 0.24} ${x + s * 0.04},${y - s * 0.02} ${x - s * 0.14},${y}`,
    fill: ART_COLORS.rockLight, opacity: 0.95,
  }));
  // Quartz fissure
  parent.appendChild(svgEl("line", {
    x1: x - s * 0.05, y1: y - s * 0.18, x2: x + s * 0.12, y2: y + s * 0.06,
    stroke: "#ffffff", "stroke-width": 1, opacity: 0.8
  }));
}

function paintMountain(parent, x, y, scale, random) {
  const s = scale;

  // Companion peak
  const side = random() < 0.5 ? -1 : 1;
  const cx = x + side * s * 0.3;
  const cy = y + s * 0.1;
  const cs = s * 0.65;
  parent.appendChild(svgEl("polygon", {
    points: `${cx},${cy - cs * 0.5} ${cx + cs * 0.45},${cy + cs * 0.3} ${cx},${cy + cs * 0.3}`,
    fill: ART_COLORS.rockDark,
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${cx - cs * 0.45},${cy + cs * 0.3} ${cx},${cy - cs * 0.5} ${cx},${cy + cs * 0.3}`,
    fill: ART_COLORS.rock,
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${cx - cs * 0.18},${cy - cs * 0.2} ${cx},${cy - cs * 0.5} ${cx + cs * 0.18},${cy - cs * 0.2} ${cx + cs * 0.05},${cy - cs * 0.12} ${cx - cs * 0.06},${cy - cs * 0.15}`,
    fill: ART_COLORS.snow,
  }));

  // Main Peak Shadow Face (Southeast)
  parent.appendChild(svgEl("polygon", {
    points: `${x},${y - s * 0.52} ${x + s * 0.52},${y + s * 0.35} ${x + s * 0.04},${y + s * 0.38}`,
    fill: "#484749",
  }));
  // Main Peak Sunlit Face (Northwest)
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.52},${y + s * 0.35} ${x},${y - s * 0.52} ${x + s * 0.04},${y + s * 0.38}`,
    fill: "#7a7775",
  }));
  // Central ridge line
  parent.appendChild(svgEl("path", {
    d: `M ${x} ${y - s * 0.52} Q ${x + s * 0.06} ${y - s * 0.1} ${x + s * 0.04} ${y + s * 0.38}`,
    fill: "none", stroke: "rgba(25, 20, 15, 0.45)", "stroke-width": 1.2
  }));

  // Glistening Glacier / Snowcap
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.22},${y - s * 0.24} ${x},${y - s * 0.52} ${x + s * 0.02},${y - s * 0.22} ${x - s * 0.08},${y - s * 0.18}`,
    fill: ART_COLORS.snow,
  }));
  parent.appendChild(svgEl("polygon", {
    points: `${x},${y - s * 0.52} ${x + s * 0.22},${y - s * 0.24} ${x + s * 0.1},${y - s * 0.18} ${x + s * 0.02},${y - s * 0.22}`,
    fill: ART_COLORS.snowShade,
  }));

  // Scree & foothill alpine pine trees
  paintPineTree(parent, x - s * 0.38, y + s * 0.32, s * 0.5, random);
  paintPineTree(parent, x + s * 0.38, y + s * 0.34, s * 0.45, random);
  paintRock(parent, x + s * 0.16, y + s * 0.36, s * 0.4, random);
}

function paintWheat(parent, x, y, scale, random) {
  const s = scale;
  for (let i = 0; i < 4; i++) {
    const bx = x + (i - 1.5) * s * 0.16 + (random() - 0.5) * s * 0.06;
    parent.appendChild(svgEl("path", {
      d: `M ${bx} ${y + s * 0.18} L ${bx} ${y - s * 0.12} M ${bx - s * 0.06} ${y - s * 0.04} L ${bx} ${y - s * 0.12} L ${bx + s * 0.06} ${y - s * 0.04}`,
      fill: "none", stroke: ART_COLORS.wheatDark, "stroke-width": 1.5, "stroke-linecap": "round",
    }));
  }
}

function paintHayBale(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x + 2, cy: y + 2, rx: s * 0.22, ry: s * 0.14, fill: "rgba(0,0,0,0.2)" }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.2, y: y - s * 0.14, width: s * 0.4, height: s * 0.28, rx: s * 0.1, fill: ART_COLORS.wheat, stroke: ART_COLORS.wheatDark, "stroke-width": 1 }));
  parent.appendChild(svgEl("line", { x1: x - s * 0.08, y1: y - s * 0.14, x2: x - s * 0.08, y2: y + s * 0.14, stroke: ART_COLORS.wheatDark, "stroke-width": 1 }));
  parent.appendChild(svgEl("line", { x1: x + s * 0.08, y1: y - s * 0.14, x2: x + s * 0.08, y2: y + s * 0.14, stroke: ART_COLORS.wheatDark, "stroke-width": 1 }));
}

function paintWindmill(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.35, rx: s * 0.28, ry: s * 0.1, fill: "rgba(0,0,0,0.24)" }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.22},${y + s * 0.35} ${x - s * 0.14},${y - s * 0.25} ${x + s * 0.14},${y - s * 0.25} ${x + s * 0.22},${y + s * 0.35}`,
    fill: "#ded3bf", stroke: ART_COLORS.ink, "stroke-width": 1.2
  }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.06, y: y + s * 0.18, width: s * 0.12, height: s * 0.17, fill: ART_COLORS.door }));
  parent.appendChild(svgEl("polygon", {
    points: `${x - s * 0.18},${y - s * 0.25} ${x},${y - s * 0.48} ${x + s * 0.18},${y - s * 0.25}`,
    fill: ART_COLORS.roofDark, stroke: ART_COLORS.ink, "stroke-width": 1
  }));
  const rotor = animatedGroup("art-windmill-sails", x, y - s * 0.25, 0);
  rotor.appendChild(svgEl("line", { x1: x - s * 0.42, y1: y - s * 0.25, x2: x + s * 0.42, y2: y - s * 0.25, stroke: ART_COLORS.trunk, "stroke-width": 1.6 }));
  rotor.appendChild(svgEl("line", { x1: x, y1: y - s * 0.67, x2: x, y2: y + s * 0.17, stroke: ART_COLORS.trunk, "stroke-width": 1.6 }));
  rotor.appendChild(svgEl("rect", { x: x - s * 0.4, y: y - s * 0.32, width: s * 0.34, height: s * 0.07, fill: "#f8f5ee", stroke: ART_COLORS.ink, "stroke-width": 0.8 }));
  rotor.appendChild(svgEl("rect", { x: x + s * 0.06, y: y - s * 0.25, width: s * 0.34, height: s * 0.07, fill: "#f8f5ee", stroke: ART_COLORS.ink, "stroke-width": 0.8 }));
  rotor.appendChild(svgEl("rect", { x: x - s * 0.07, y: y - s * 0.65, width: s * 0.07, height: s * 0.34, fill: "#f8f5ee", stroke: ART_COLORS.ink, "stroke-width": 0.8 }));
  rotor.appendChild(svgEl("rect", { x: x, y: y - s * 0.18, width: s * 0.07, height: s * 0.34, fill: "#f8f5ee", stroke: ART_COLORS.ink, "stroke-width": 0.8 }));
  rotor.appendChild(svgEl("circle", { cx: x, cy: y - s * 0.25, r: 2.8, fill: ART_COLORS.ink }));
  parent.appendChild(rotor);
}

function paintFlowerDots(parent, x, y, scale, random) {
  const dots = 4 + Math.floor(random() * 4);
  for (let i = 0; i < dots; i++) {
    parent.appendChild(svgEl("circle", {
      cx: x + (random() - 0.5) * scale * 0.9,
      cy: y + (random() - 0.5) * scale * 0.7,
      r: 2, fill: pick(ART_COLORS.flowers, random),
    }));
  }
}

function paintTerraceStripes(parent, x, y, scale, random) {
  for (let i = -1; i <= 1; i++) {
    const yy = y + i * scale * 0.28;
    parent.appendChild(svgEl("path", {
      d: `M ${x - scale * 0.44} ${yy + 2} q ${scale * 0.44} ${-7} ${scale * 0.88} 0`,
      fill: "none", stroke: ART_COLORS.terraceLine, "stroke-width": 1.6, opacity: 0.85,
    }));
  }
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

function paintPool(parent, x, y, size) {
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y, rx: size * 1.05, ry: size * 0.76, fill: ART_COLORS.sand, opacity: 0.9 }));
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y, rx: size * 0.92, ry: size * 0.64, fill: ART_COLORS.waterLight }));
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y, rx: size * 0.72, ry: size * 0.48, fill: ART_COLORS.water }));
  parent.appendChild(svgEl("ellipse", { cx: x + 2, cy: y + 2, rx: size * 0.42, ry: size * 0.28, fill: ART_COLORS.waterDeep }));
  for (let i = 0; i < 2; i++) {
    const ring = svgEl("ellipse", {
      cx: x, cy: y, rx: size * 0.22, ry: size * 0.14,
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

// A dirt path along a list of points with scale-adaptive width.
function paintRoad(parent, points, width) {
  if (points.length < 2) return;
  const d = points.map((p, i) => `${i ? "L" : "M"} ${p[0]} ${p[1]}`).join(" ");
  const w = width || 2.4;
  parent.appendChild(svgEl("path", { d, fill: "none", stroke: ART_COLORS.roadEdge, "stroke-width": w * 1.6, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.75 }));
  parent.appendChild(svgEl("path", { d, fill: "none", stroke: ART_COLORS.road, "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round" }));
}

// ---------------------------------------------------------------------------
// High-Density Clustered Biome Sprites
// ---------------------------------------------------------------------------

function paintDenseGrove(parent, x, y, scale, theme, random) {
  const s = scale;
  // Clustered micro-trees with individual ground shadows
  const positions = [
    [-0.24, -0.06],
    [0.22, -0.1],
    [-0.06, 0.16],
    [0.18, 0.2]
  ];
  for (let i = 0; i < positions.length; i++) {
    const [dx, dy] = positions[i];
    const tx = x + dx * s;
    const ty = y + dy * s;
    const ts = s * (0.52 + (random() * 0.12));
    if (theme === "pine") {
      paintPineTree(parent, tx, ty, ts, random);
    } else if (theme === "taiga") {
      paintTaigaPine(parent, tx, ty, ts * 1.05, random);
    } else if (theme === "birch") {
      paintBirchTree(parent, tx, ty, ts, random);
    } else if (theme === "autumn") {
      paintAutumnTree(parent, tx, ty, ts, random);
    } else if (theme === "mixed") {
      if (i === 0) paintPineTree(parent, tx, ty, ts, random);
      else if (i === 1) paintAutumnTree(parent, tx, ty, ts, random);
      else paintTree(parent, tx, ty, ts, random);
    } else {
      paintTree(parent, tx, ty, ts, random);
    }
  }
}

function paintCropField(parent, x, y, scale, random) {
  const s = scale;
  // Striated ploughed field furrows
  for (let i = -2; i <= 2; i++) {
    const fy = y + i * s * 0.14;
    const span = s * 0.36 - Math.abs(i) * s * 0.05;
    parent.appendChild(svgEl("line", {
      x1: x - span, y1: fy, x2: x + span, y2: fy,
      stroke: i % 2 === 0 ? "#b5902b" : "#c4a342",
      "stroke-width": 1.1,
      "stroke-linecap": "round"
    }));
  }
  if (random() < 0.4) {
    paintHayBale(parent, x + (random() - 0.5) * s * 0.25, y + (random() - 0.5) * s * 0.15, s * 0.55);
  } else {
    paintWheat(parent, x, y, s * 0.65, random);
  }
}

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

// ---------------------------------------------------------------------------
// Sprites: the sea and the shore
// ---------------------------------------------------------------------------

// Open water. `depth` (0 shallow … 1 deep) tints the hex, and a few short
// wave strokes keep it from reading as flat paint.
function paintOceanSurface(parent, x, y, size, depth, random) {
  const s = size;
  parent.appendChild(svgEl("polygon", {
    points: hexPoints(x, y, s * 1.005),
    fill: depth > 0.55 ? ART_COLORS.oceanDeep : ART_COLORS.ocean,
    opacity: 0.55 + depth * 0.35,
  }));
  // Every wave on this hex in one element — there are hundreds of sea tiles.
  const waves = 2 + Math.floor(random() * 3);
  let d = "";
  for (let i = 0; i < waves; i++) {
    const wx = x + (random() - 0.5) * s * 1.05;
    const wy = y + (random() - 0.5) * s * 1.0;
    const w = s * (0.18 + random() * 0.18);
    d += ` M ${wx - w} ${wy} q ${w * 0.5} ${-s * 0.09} ${w} 0 q ${w * 0.5} ${s * 0.09} ${w} 0`;
  }
  parent.appendChild(svgEl("path", {
    d: d.trim(),
    fill: "none",
    stroke: ART_COLORS.oceanShallow,
    "stroke-width": Math.max(0.6, s * 0.035),
    "stroke-linecap": "round",
    opacity: 0.45,
  }));
}

// The pale line where the sea meets the land. `edges` is the list of hex
// edge indices (0..5, corner i to corner i+1) that face dry ground.
function paintCoastFoam(parent, x, y, size, edges) {
  if (!edges.length) return;
  let d = "";
  for (const edge of edges) {
    const a = (Math.PI / 180) * (60 * edge - 30);
    const b = (Math.PI / 180) * (60 * (edge + 1) - 30);
    d += ` M ${x + size * 0.93 * Math.cos(a)} ${y + size * 0.93 * Math.sin(a)}` +
         ` L ${x + size * 0.93 * Math.cos(b)} ${y + size * 0.93 * Math.sin(b)}`;
  }
  parent.appendChild(svgEl("path", {
    d: d.trim(),
    fill: "none",
    stroke: ART_COLORS.oceanFoam,
    "stroke-width": Math.max(1.2, size * 0.11),
    "stroke-linecap": "round",
    opacity: 0.7,
    class: "art-foam",
  }));
}

// Wet sand, shells and a stick of driftwood.
function paintBeachDetail(parent, x, y, size, random) {
  const s = size;
  parent.appendChild(svgEl("path", {
    d: `M ${x - s * 0.8} ${y + s * 0.24} q ${s * 0.4} ${-s * 0.16} ${s * 0.8} 0 q ${s * 0.4} ${s * 0.16} ${s * 0.8} 0`,
    fill: "none", stroke: ART_COLORS.beachWet, "stroke-width": s * 0.09, "stroke-linecap": "round", opacity: 0.65,
  }));
  const shells = 2 + Math.floor(random() * 3);
  for (let i = 0; i < shells; i++) {
    const sx = x + (random() - 0.5) * s * 1.1;
    const sy = y + (random() - 0.5) * s * 0.95;
    parent.appendChild(svgEl("path", {
      d: `M ${sx - s * 0.05} ${sy} a ${s * 0.05} ${s * 0.05} 0 0 1 ${s * 0.1} 0 z`,
      fill: random() < 0.5 ? "#fff6e4" : "#e9c7b0", stroke: ART_COLORS.sandDark, "stroke-width": 0.4,
    }));
  }
  if (random() < 0.45) {
    parent.appendChild(svgEl("line", {
      x1: x - s * 0.3, y1: y - s * 0.18, x2: x + s * 0.12, y2: y - s * 0.3,
      stroke: "#a58a63", "stroke-width": s * 0.07, "stroke-linecap": "round",
    }));
  }
}

// Still inland water: a darker heart and a couple of ripples.
function paintLakeSurface(parent, x, y, size, random) {
  const s = size;
  parent.appendChild(svgEl("polygon", { points: hexPoints(x, y, s * 1.005), fill: ART_COLORS.lake }));
  parent.appendChild(svgEl("ellipse", {
    cx: x, cy: y + s * 0.05, rx: s * 0.62, ry: s * 0.46, fill: ART_COLORS.lakeDeep, opacity: 0.55,
  }));
  for (let i = 0; i < 2; i++) {
    const ry = y + (random() - 0.5) * s * 0.7;
    parent.appendChild(svgEl("path", {
      d: `M ${x - s * 0.36} ${ry} q ${s * 0.18} ${-s * 0.07} ${s * 0.36} 0 q ${s * 0.18} ${s * 0.07} ${s * 0.36} 0`,
      fill: "none", stroke: "#bfe6f2", "stroke-width": Math.max(0.6, s * 0.03), opacity: 0.5,
    }));
  }
}

// ---------------------------------------------------------------------------
// Sprites: wet, cold and dry ground
// ---------------------------------------------------------------------------

function paintMarshReeds(parent, x, y, size, random) {
  const s = size;
  // Standing water in patches
  for (let i = 0; i < 3; i++) {
    const px = x + (random() - 0.5) * s * 0.95;
    const py = y + (random() - 0.5) * s * 0.8;
    parent.appendChild(svgEl("ellipse", {
      cx: px, cy: py, rx: s * (0.16 + random() * 0.14), ry: s * (0.09 + random() * 0.07),
      fill: ART_COLORS.marshWater, opacity: 0.8,
    }));
  }
  // Reeds with brown heads
  const stems = 5 + Math.floor(random() * 5);
  for (let i = 0; i < stems; i++) {
    const sx = x + (random() - 0.5) * s * 1.15;
    const sy = y + (random() - 0.5) * s * 0.95;
    const h = s * (0.2 + random() * 0.2);
    const lean = (random() - 0.5) * s * 0.1;
    parent.appendChild(svgEl("line", {
      x1: sx, y1: sy, x2: sx + lean, y2: sy - h,
      stroke: ART_COLORS.reed, "stroke-width": Math.max(0.6, s * 0.028), "stroke-linecap": "round",
    }));
    parent.appendChild(svgEl("rect", {
      x: sx + lean - s * 0.022, y: sy - h - s * 0.06, width: s * 0.044, height: s * 0.075, rx: s * 0.02,
      fill: ART_COLORS.reedHead,
    }));
  }
}

function paintTundraScrub(parent, x, y, size, random) {
  const s = size;
  // Lichen blotches
  for (let i = 0; i < 4; i++) {
    parent.appendChild(svgEl("ellipse", {
      cx: x + (random() - 0.5) * s * 1.1,
      cy: y + (random() - 0.5) * s * 0.95,
      rx: s * (0.1 + random() * 0.12), ry: s * (0.06 + random() * 0.08),
      fill: random() < 0.5 ? ART_COLORS.tundraScrub : "#cdd3b6", opacity: 0.7,
    }));
  }
  // Low wind-bitten shrubs
  const shrubs = 2 + Math.floor(random() * 2);
  for (let i = 0; i < shrubs; i++) {
    const sx = x + (random() - 0.5) * s * 0.9;
    const sy = y + (random() - 0.5) * s * 0.7;
    parent.appendChild(svgEl("path", {
      d: `M ${sx} ${sy} l ${-s * 0.08} ${-s * 0.1} M ${sx} ${sy} l ${s * 0.09} ${-s * 0.12} M ${sx} ${sy} l 0 ${-s * 0.14}`,
      stroke: "#6d7350", "stroke-width": Math.max(0.6, s * 0.03), "stroke-linecap": "round", fill: "none",
    }));
  }
  if (random() < 0.4) {
    parent.appendChild(svgEl("ellipse", {
      cx: x + s * 0.24, cy: y + s * 0.2, rx: s * 0.14, ry: s * 0.1,
      fill: ART_COLORS.rock, stroke: ART_COLORS.rockDark, "stroke-width": 0.6,
    }));
  }
}

function paintSnowDrift(parent, x, y, size, random) {
  const s = size;
  for (let i = 0; i < 3; i++) {
    const dx = x + (random() - 0.5) * s * 1.0;
    const dy = y + (random() - 0.5) * s * 0.85;
    parent.appendChild(svgEl("path", {
      d: `M ${dx - s * 0.3} ${dy} q ${s * 0.16} ${-s * 0.18} ${s * 0.32} ${-s * 0.03} q ${s * 0.16} ${s * 0.11} ${s * 0.3} ${s * 0.03} z`,
      fill: ART_COLORS.snow, stroke: ART_COLORS.snowfieldShade, "stroke-width": 0.6, opacity: 0.95,
    }));
  }
  // A few ice glints, all in one element
  let glints = "";
  for (let i = 0; i < 3; i++) {
    const gx = x + (random() - 0.5) * s * 1.1;
    const gy = y + (random() - 0.5) * s * 0.9;
    const g = s * 0.05;
    glints += ` M ${gx - g} ${gy} h ${g * 2} M ${gx} ${gy - g} v ${g * 2}`;
  }
  parent.appendChild(svgEl("path", { d: glints.trim(), stroke: "#ffffff", "stroke-width": 0.8, opacity: 0.8 }));
}

function paintBadlandsMesa(parent, x, y, size, random) {
  const s = size;
  // Cracked pan
  for (let i = 0; i < 4; i++) {
    const cx = x + (random() - 0.5) * s * 1.1;
    const cy = y + (random() - 0.5) * s * 0.95;
    parent.appendChild(svgEl("path", {
      d: `M ${cx} ${cy} l ${s * 0.12} ${s * 0.06} l ${s * 0.08} ${-s * 0.1}`,
      fill: "none", stroke: ART_COLORS.badlandsDark, "stroke-width": 0.7, opacity: 0.6,
    }));
  }
  // A layered mesa
  const mx = x + (random() - 0.5) * s * 0.3;
  const my = y + s * 0.1;
  const w = s * (0.34 + random() * 0.12);
  const h = s * (0.3 + random() * 0.14);
  parent.appendChild(svgEl("path", {
    d: `M ${mx - w} ${my} L ${mx - w * 0.72} ${my - h} L ${mx + w * 0.72} ${my - h} L ${mx + w} ${my} Z`,
    fill: ART_COLORS.badlands, stroke: ART_COLORS.ink, "stroke-width": 0.8,
  }));
  parent.appendChild(svgEl("path", {
    d: `M ${mx - w * 0.9} ${my - h * 0.34} L ${mx + w * 0.9} ${my - h * 0.34}`,
    stroke: ART_COLORS.badlandsStripe, "stroke-width": s * 0.05, opacity: 0.8,
  }));
  parent.appendChild(svgEl("path", {
    d: `M ${mx - w * 0.8} ${my - h * 0.66} L ${mx + w * 0.8} ${my - h * 0.66}`,
    stroke: ART_COLORS.badlandsDark, "stroke-width": s * 0.04, opacity: 0.7,
  }));
  // Scrub or a dry bush
  if (random() < 0.5) {
    const bx = x - s * 0.34;
    const by = y + s * 0.26;
    parent.appendChild(svgEl("path", {
      d: `M ${bx} ${by} l 0 ${-s * 0.16} M ${bx} ${by - s * 0.09} l ${-s * 0.08} ${-s * 0.07} M ${bx} ${by - s * 0.11} l ${s * 0.08} ${-s * 0.06}`,
      stroke: "#7c6a3a", "stroke-width": Math.max(0.6, s * 0.03), "stroke-linecap": "round", fill: "none",
    }));
  }
}

// ---------------------------------------------------------------------------
// Sprites: two more kinds of tree
// ---------------------------------------------------------------------------

function paintBirchTree(parent, x, y, scale, random) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.42, rx: s * 0.26, ry: s * 0.08, fill: "rgba(0,0,0,0.16)" }));
  parent.appendChild(svgEl("rect", {
    x: x - s * 0.05, y: y - s * 0.1, width: s * 0.1, height: s * 0.52, rx: s * 0.02,
    fill: ART_COLORS.birchBark, stroke: ART_COLORS.birchMark, "stroke-width": 0.5,
  }));
  for (let i = 0; i < 3; i++) {
    const my = y + s * (0.02 + i * 0.15);
    parent.appendChild(svgEl("line", {
      x1: x - s * 0.05, y1: my, x2: x - s * 0.005, y2: my,
      stroke: ART_COLORS.birchMark, "stroke-width": Math.max(0.5, s * 0.03),
    }));
  }
  const puffs = [[0, -0.32, 0.3], [-0.2, -0.18, 0.22], [0.2, -0.2, 0.23]];
  for (const [dx, dy, r] of puffs) {
    parent.appendChild(svgEl("circle", {
      cx: x + dx * s, cy: y + dy * s, r: r * s,
      fill: random() < 0.5 ? ART_COLORS.birchCanopy : ART_COLORS.canopyLight,
      stroke: ART_COLORS.canopyDark, "stroke-width": 0.6,
    }));
  }
}

function paintTaigaPine(parent, x, y, scale, random) {
  const s = scale;
  parent.appendChild(svgEl("ellipse", { cx: x, cy: y + s * 0.44, rx: s * 0.24, ry: s * 0.07, fill: "rgba(0,0,0,0.2)" }));
  parent.appendChild(svgEl("rect", { x: x - s * 0.045, y: y + s * 0.1, width: s * 0.09, height: s * 0.34, fill: ART_COLORS.trunkShade }));
  for (let tier = 0; tier < 3; tier++) {
    const ty = y + s * (0.16 - tier * 0.2);
    const tw = s * (0.34 - tier * 0.07);
    parent.appendChild(svgEl("path", {
      d: `M ${x - tw} ${ty} L ${x} ${ty - s * 0.3} L ${x + tw} ${ty} Z`,
      fill: tier === 2 ? ART_COLORS.taigaLight : ART_COLORS.taigaCanopy,
      stroke: ART_COLORS.ink, "stroke-width": 0.55,
    }));
  }
  if (random() < 0.3) {
    parent.appendChild(svgEl("path", {
      d: `M ${x - s * 0.22} ${y - s * 0.16} q ${s * 0.22} ${s * 0.06} ${s * 0.44} 0`,
      fill: "none", stroke: ART_COLORS.snow, "stroke-width": s * 0.05, opacity: 0.8,
    }));
  }
}

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
  return `M ${x} ${y} q ${-s * 0.16} ${-s * 0.12} ${-s * 0.2} ${-s * 0.34}` +
         ` M ${x} ${y} q ${s * 0.02} ${-s * 0.2} ${s * 0.02} ${-s * 0.4}` +
         ` M ${x} ${y} q ${s * 0.16} ${-s * 0.12} ${s * 0.22} ${-s * 0.32}`;
}

function paintGrassTuft(parent, x, y, scale, color) {
  paintGrassTufts(parent, [[x, y]], scale, color);
}

// Every tuft in one element.
function paintGrassTufts(parent, points, scale, color) {
  if (!points.length) return;
  parent.appendChild(svgEl("path", {
    d: points.map(([x, y]) => grassTuftPath(x, y, scale)).join(" "),
    fill: "none", stroke: color || "#5f8a3c",
    "stroke-width": Math.max(0.5, scale * 0.09), "stroke-linecap": "round", opacity: 0.8,
  }));
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

function paintMushroom(parent, x, y, scale) {
  const s = scale;
  parent.appendChild(svgEl("rect", { x: x - s * 0.04, y: y - s * 0.12, width: s * 0.08, height: s * 0.14, fill: "#f3ead6" }));
  parent.appendChild(svgEl("path", {
    d: `M ${x - s * 0.16} ${y - s * 0.1} a ${s * 0.16} ${s * 0.14} 0 0 1 ${s * 0.32} 0 z`,
    fill: "#c0392b", stroke: ART_COLORS.ink, "stroke-width": 0.4,
  }));
}

function paintFallenLog(parent, x, y, scale, random) {
  const s = scale;
  const angle = (random() - 0.5) * 0.9;
  const dx = Math.cos(angle) * s * 0.36;
  const dy = Math.sin(angle) * s * 0.36;
  parent.appendChild(svgEl("line", {
    x1: x - dx, y1: y - dy, x2: x + dx, y2: y + dy,
    stroke: ART_COLORS.trunk, "stroke-width": s * 0.16, "stroke-linecap": "round",
  }));
  parent.appendChild(svgEl("circle", { cx: x + dx, cy: y + dy, r: s * 0.08, fill: "#c79a6b" }));
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
// Relief: the faint contour rings that tell high ground from low
// ---------------------------------------------------------------------------

function paintReliefShade(parent, x, y, size, elevation) {
  // Below the halfway mark the ground is shaded, above it is lit — a cheap
  // hillshade that makes ridges and valleys legible at a glance.
  const lift = elevation - 0.5;
  if (Math.abs(lift) < 0.11) return;
  parent.appendChild(svgEl("polygon", {
    points: hexPoints(x, y, size * 1.01),
    fill: lift > 0 ? "#ffffff" : "#25190d",
    opacity: Math.min(0.2, Math.abs(lift) * 0.34),
  }));
}

function paintContourRing(parent, x, y, size, step) {
  parent.appendChild(svgEl("polygon", {
    points: hexPoints(x, y, size * (0.42 + step * 0.22)),
    fill: "none",
    stroke: "rgba(80, 58, 32, 0.22)",
    "stroke-width": 0.7,
    "stroke-dasharray": "3 4",
  }));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ART_COLORS, createRandom, svgEl, animatedGroup, smoothPath, pick, hexPoints,
    paintHexBase, paintTree, paintPineTree, paintAutumnTree, paintBush, paintRock, paintMountain, paintWheat, paintHayBale, paintWindmill, paintFlowerDots,
    paintTerraceStripes, paintRiver, paintPool, paintStandingStones, paintMotherTree, paintDragonBones, paintCrystalMine, paintShipwreck,
    paintHouse, paintBarn, paintCampfire, paintBanner, paintRoad, paintVillager, paintPlaza, paintWell, paintWatchtower, paintWarTent, paintSpikes,
    paintChieftainHall, paintMarketStall, paintSmithy, paintLumberCamp, paintQuarryWorks, paintFisheryDock, paintAnimalPen, paintTrainingGround,
    paintDenseGrove, paintCropField, paintRiverBridge,
    paintOceanSurface, paintCoastFoam, paintBeachDetail, paintLakeSurface,
    paintMarshReeds, paintTundraScrub, paintSnowDrift, paintBadlandsMesa,
    paintBirchTree, paintTaigaPine,
    paintGrassTuft, paintGrassTufts, paintPebble, paintPebbles, paintMushroom, paintFallenLog, paintDeer, paintBirdFlock, paintStandingRuin,
    paintRuinedTower, paintHotSpring, paintBoneOrchard, paintSchoolhouse,
    paintReliefShade, paintContourRing,
  };
}
