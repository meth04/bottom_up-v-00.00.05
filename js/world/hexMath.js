// hexMath.js (ES module)
//
// Pure axial hex-grid math for POINTY-TOP hexagons. No game state here.
// This is the single source of truth for "which hexes touch which": tile
// data never lists its own neighbours, adjacency is derived from (q, r).
//
// Layout: tile (col, row) on the rectangular grid has axial
//   q = col - floor(row / 2),  r = row
// so every row is the same length and chunking by (col, row) is trivial.

// The 6 axial directions, in a fixed order. Road masks, river masks and
// everything else that stores "one bit per neighbour" use THIS order:
// bit i <=> HEX_DIRECTIONS[i].
export const HEX_DIRECTIONS = [
  { q: 1, r: 0 },   // 0: east
  { q: 1, r: -1 },  // 1: north-east
  { q: 0, r: -1 },  // 2: north-west
  { q: -1, r: 0 },  // 3: west
  { q: -1, r: 1 },  // 4: south-west
  { q: 0, r: 1 },   // 5: south-east
];

// Angle (degrees, y-down screen space) from a hex centre to the middle of
// the edge facing HEX_DIRECTIONS[i]. Used to draw roads and rivers from a
// centre towards a neighbour.
export const HEX_DIRECTION_ANGLES = [0, -60, -120, 180, 120, 60];

// The index in HEX_DIRECTIONS of the direction opposite to i.
export const OPPOSITE_DIRECTION = [3, 4, 5, 0, 1, 2];

// Corner i of a pointy-top hex sits at angle -30 + 60*i degrees. Edge i
// runs between corners i and i+1 and faces HEX_DIRECTIONS[EDGE_TO_DIRECTION[i]].
export const EDGE_TO_DIRECTION = [0, 5, 4, 3, 2, 1];
export const DIRECTION_TO_EDGE = [0, 5, 4, 3, 2, 1];

export function hexKey(q, r) {
  return `${q},${r}`;
}

export function hexId(q, r) {
  return `hex_${q}_${r}`;
}

// Parses "hex_q_r" back into { q, r }.
export function parseHexId(id) {
  const parts = id.split("_");
  return { q: Number(parts[1]), r: Number(parts[2]) };
}

export function colRowToAxial(col, row) {
  return { q: col - Math.floor(row / 2), r: row };
}

export function axialToColRow(q, r) {
  return { col: q + Math.floor(r / 2), row: r };
}

export function hexNeighbors(q, r) {
  return HEX_DIRECTIONS.map((dir) => ({ q: q + dir.q, r: r + dir.r }));
}

// Which direction index (0-5) leads from a to b, or -1 if not adjacent.
export function directionBetween(a, b) {
  const dq = b.q - a.q;
  const dr = b.r - a.r;
  for (let i = 0; i < 6; i++) {
    if (HEX_DIRECTIONS[i].q === dq && HEX_DIRECTIONS[i].r === dr) return i;
  }
  return -1;
}

export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexRing(center, radius) {
  if (radius === 0) return [{ q: center.q, r: center.r }];
  const results = [];
  let hex = {
    q: center.q + HEX_DIRECTIONS[4].q * radius,
    r: center.r + HEX_DIRECTIONS[4].r * radius,
  };
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      results.push({ q: hex.q, r: hex.r });
      hex = { q: hex.q + HEX_DIRECTIONS[side].q, r: hex.r + HEX_DIRECTIONS[side].r };
    }
  }
  return results;
}

// Every hex within `radius` steps of `center`, nearest ring first.
export function hexSpiral(center, radius) {
  const results = [];
  for (let step = 0; step <= radius; step++) results.push(...hexRing(center, step));
  return results;
}

// Axial -> pixel centre for a pointy-top layout of the given corner radius.
export function axialToPixel(q, r, size) {
  return {
    x: size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
    y: size * 1.5 * r,
  };
}

export function axialRound(q, r) {
  const x = q;
  const z = r;
  const y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

export function pixelToAxial(x, y, size) {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return axialRound(q, r);
}

// Corner i (0-5) of the hex centred at (cx, cy).
export function hexCorner(cx, cy, size, i) {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return [cx + size * Math.cos(angle), cy + size * Math.sin(angle)];
}

// All six corners as [[x, y], ...].
export function hexCorners(cx, cy, size) {
  const corners = [];
  for (let i = 0; i < 6; i++) corners.push(hexCorner(cx, cy, size, i));
  return corners;
}

// Midpoint of the edge facing HEX_DIRECTIONS[dir].
export function hexEdgeMidpoint(cx, cy, size, dir) {
  const angle = (Math.PI / 180) * HEX_DIRECTION_ANGLES[dir];
  const distance = size * (Math.sqrt(3) / 2);
  return [cx + distance * Math.cos(angle), cy + distance * Math.sin(angle)];
}

// World-space centre of a tile, given the world's grid { hexSize, originX, originY }.
export function worldTileCenter(q, r, grid) {
  const p = axialToPixel(q, r, grid.hexSize);
  return { x: p.x + grid.originX, y: p.y + grid.originY };
}

// The inverse: which axial hex is under a world-space point.
export function worldPointToAxial(x, y, grid) {
  return pixelToAxial(x - grid.originX, y - grid.originY, grid.hexSize);
}

// Deterministic PRNG (mulberry32). Same seed, same sequence, every browser.
export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer lattice hash in [0, 1): the same (ix, iy, seed) always gives the
// same value, whatever order the map is walked in.
export function latticeHash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

export function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
