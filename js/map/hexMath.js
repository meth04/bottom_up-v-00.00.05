// hexMath.js
//
// Pure axial hex-grid math. No game state lives here.
//
// Coordinate system: axial (q, r), pointy-top hexagons.
// This module is the single source of truth for "which hexes touch which" —
// tile data should never hand-list its own neighbors (that is how the old
// data/legacy_land_data.json ended up with 21 adjacency pairs that don't
// actually form a valid hex grid). Adjacency is always derived from (q, r).

// The 6 axial direction vectors, in a fixed clockwise order.
const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

// Builds a lookup key for a (q, r) pair, for use in Map/object lookups.
function hexKey(q, r) {
  return `${q},${r}`;
}

// Returns the 6 axial coordinates touching (q, r).
function hexNeighbors(q, r) {
  return HEX_DIRECTIONS.map((dir) => ({ q: q + dir.q, r: r + dir.r }));
}

// Distance, in hex steps, between two axial coordinates.
function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// Returns the ring of hexes at exactly `radius` steps from `center`.
// radius = 0 returns just the center hex. Useful for growing the map
// outward in complete rings later (see ask.txt, question about map size).
function hexRing(center, radius) {
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

// Returns every hex within `radius` steps of `center` (a filled hex-shaped
// area: center + ring(1) + ring(2) + ... + ring(radius)).
function hexSpiral(center, radius) {
  const results = [];
  for (let step = 0; step <= radius; step++) {
    results.push(...hexRing(center, step));
  }
  return results;
}

// Converts axial coordinates to a pixel center position for a pointy-top
// hex layout, given the hex size (center-to-corner radius, in pixels).
function axialToPixel(q, r, size) {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * (1.5 * r);
  return { x, y };
}

// Rounds fractional axial coordinates to the nearest whole hex, via cube
// coordinates. Needed to turn a pixel position back into a tile.
function axialRound(q, r) {
  let x = q;
  let z = r;
  let y = -x - z;
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

// The inverse of axialToPixel. With thirty thousand hexes on the map it is
// far cheaper to work out which one the mouse is over than to give every
// one of them its own clickable element.
function pixelToAxial(x, y, size) {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return axialRound(q, r);
}

// The outline of a pointy-top hexagon as relative SVG path commands, ready
// to follow an "M x y". It is the same for every hex of a given size, so a
// whole terrain's worth of hexes can be written as one path cheaply.
function hexOutlineTail(size) {
  const w = (Math.sqrt(3) / 2) * size;
  const h = size / 2;
  // One decimal, and no space before a minus sign — SVG does not need one.
  // Over thirty thousand hexes those two habits are worth a hundred kilobytes.
  const n = (value) => {
    const text = (Math.round(value * 10) / 10).toString();
    return text;
  };
  const sep = (value) => (value < 0 ? "" : " ") + n(value);
  return `l0 ${n(size)}l${n(-w)}${sep(h)}l${n(-w)}${sep(-h)}l0 ${n(-size)}l${n(w)}${sep(-h)}z`;
}

// Where an "M" should be placed for hexOutlineTail: the first corner.
function hexOutlineStart(centerX, centerY, size) {
  return [centerX + (Math.sqrt(3) / 2) * size, centerY - size / 2];
}

// Node-friendly export (used by the scratch layout-check script and any
// future tests); browsers just use the globals above via a plain <script>.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    HEX_DIRECTIONS,
    hexKey,
    hexNeighbors,
    hexDistance,
    hexRing,
    hexSpiral,
    axialToPixel,
    axialRound,
    pixelToAxial,
    hexOutlineTail,
    hexOutlineStart,
  };
}
