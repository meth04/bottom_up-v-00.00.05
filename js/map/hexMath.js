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
  };
}
