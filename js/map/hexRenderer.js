// hexRenderer.js
//
// The interactive layer over the painted world. It draws what the player
// *knows* about each tile, not the terrain (the picture does that):
//
//   hidden    not yet seen — fog
//   frontier  wild land next to yours — dashed outline, explorable
//   seizable  another village's land next to yours — dashed outline in
//             their colour
//   everything else is transparent, so the tile is just a click target
//
// Territory is drawn as borders: one line along every edge where the owner
// changes, in the owner's colour, so a village's land reads as one shape.
// Each tile's <g> carries data-tile-id and hex--<state> classes for CSS and
// for tests.

const HEX_CLAIMED_OUTLINE = "#f2c14e";
const HEX_FRONTIER_OUTLINE = "#ffffff";
const HEX_SELECTED_OUTLINE = "#ffffff";
const HEX_FOG_COLOR = "#1a222c";

const SVG_NS = "http://www.w3.org/2000/svg";

// Returns the "x,y x,y ..." SVG points string for a pointy-top hexagon.
function hexCornerPoints(centerX, centerY, size) {
  const points = [];
  for (let corner = 0; corner < 6; corner++) {
    const angleDegrees = 60 * corner - 30;
    const angleRadians = (Math.PI / 180) * angleDegrees;
    points.push(`${centerX + size * Math.cos(angleRadians)},${centerY + size * Math.sin(angleRadians)}`);
  }
  return points.join(" ");
}

function hexCorner(centerX, centerY, size, corner) {
  const angleRadians = (Math.PI / 180) * (60 * corner - 30);
  return [centerX + size * Math.cos(angleRadians), centerY + size * Math.sin(angleRadians)];
}

// Edge i of a pointy-top hex runs between corners i and i+1, and faces the
// neighbour in HEX_DIRECTIONS order: corners -30°, 30°, 90°, 150°, 210°, 270°.
const EDGE_TO_DIRECTION = [
  { q: 1, r: 0 },   // corners 0-1: east
  { q: 0, r: 1 },   // corners 1-2: south-east
  { q: -1, r: 1 },  // corners 2-3: south-west
  { q: -1, r: 0 },  // corners 3-4: west
  { q: 0, r: -1 },  // corners 4-5: north-west
  { q: 1, r: -1 },  // corners 5-0: north-east
];

class HexRenderer {
  // options:
  //   hexSize     corner radius of one hex
  //   origin      where (q=0, r=0) sits
  //   viewBox     {x, y, width, height} of the shared map space
  //   ownerColor  (villageId) => colour
  //   onTileClick (tileId) => void
  constructor(hexMap, container, options = {}) {
    this.hexMap = hexMap;
    this.container = container;
    this.hexSize = options.hexSize || 28;
    this.origin = options.origin || { x: 0, y: 0 };
    this.viewBox = options.viewBox;
    this.ownerColor = options.ownerColor || (() => "#888888");
    this.onTileClick = options.onTileClick || null;
  }

  tileCenter(tile) {
    const pixel = axialToPixel(tile.q, tile.r, this.hexSize);
    return { x: pixel.x + this.origin.x, y: pixel.y + this.origin.y };
  }

  tileState(tile) {
    if (!this.hexMap.isRevealed(tile.id)) return "hidden";
    if (this.hexMap.isClaimed(tile.id)) return "claimed";
    if (tile.owner) return this.hexMap.isSeizable(tile.id) ? "seizable" : "foreign";
    if (this.hexMap.isFrontier(tile.id)) return "frontier";
    return "revealed";
  }

  render() {
    const svg = document.createElementNS(SVG_NS, "svg");
    const box = this.viewBox;
    svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.classList.add("hexgrid");

    const tiles = this.hexMap.getAllTiles();
    const tileLayer = document.createElementNS(SVG_NS, "g");
    const borderLayer = document.createElementNS(SVG_NS, "g");
    borderLayer.style.pointerEvents = "none";
    const selectedId = this.hexMap.selectedTileId;

    for (const tile of tiles) {
      tileLayer.appendChild(this.buildHexElement(tile));
      this.appendBorders(borderLayer, tile);
    }
    svg.appendChild(tileLayer);
    svg.appendChild(borderLayer);

    const selected = selectedId ? this.hexMap.getTile(selectedId) : null;
    if (selected) svg.appendChild(this.buildSelectionBrackets(selected));

    this.container.innerHTML = "";
    this.container.appendChild(svg);
  }

  // The selected tile gets a corner bracket at each of its six corners —
  // the same "this is the thing you are looking at" mark RimWorld uses,
  // dark-backed so it still reads over the pale paper of the map.
  buildSelectionBrackets(tile) {
    const c = this.tileCenter(tile);
    const size = this.hexSize + 1;
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("hex-selection");
    group.style.pointerEvents = "none";

    const corners = [];
    for (let index = 0; index < 6; index++) corners.push(hexCorner(c.x, c.y, size, index));
    const towards = (from, to, fraction) => [
      from[0] + (to[0] - from[0]) * fraction,
      from[1] + (to[1] - from[1]) * fraction,
    ];

    // Dark backing first, then the white bracket over it.
    for (const [color, width] of [["rgba(0,0,0,0.55)", 6], [HEX_SELECTED_OUTLINE, 3]]) {
      for (let index = 0; index < 6; index++) {
        const corner = corners[index];
        const before = towards(corner, corners[(index + 5) % 6], 0.34);
        const after = towards(corner, corners[(index + 1) % 6], 0.34);
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", `M${before[0]},${before[1]} L${corner[0]},${corner[1]} L${after[0]},${after[1]}`);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", color);
        path.setAttribute("stroke-width", width);
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        group.appendChild(path);
      }
    }
    return group;
  }

  buildHexElement(tile) {
    const size = this.hexSize;
    const state = this.tileState(tile);
    const c = this.tileCenter(tile);

    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("data-tile-id", tile.id);
    group.classList.add("hex", `hex--${state}`);
    if (tile.id === this.hexMap.selectedTileId) group.classList.add("hex--selected");

    const polygon = document.createElementNS(SVG_NS, "polygon");
    polygon.setAttribute("points", hexCornerPoints(c.x, c.y, size - 0.5));
    polygon.setAttribute("stroke-linejoin", "round");

    if (state === "hidden") {
      polygon.setAttribute("fill", HEX_FOG_COLOR);
      polygon.setAttribute("fill-opacity", "0.86");
      polygon.setAttribute("stroke", HEX_FOG_COLOR);
      polygon.setAttribute("stroke-width", "1.5");
    } else if (state === "frontier") {
      polygon.setAttribute("fill", "#ffffff");
      polygon.setAttribute("fill-opacity", "0.06");
      polygon.setAttribute("stroke", HEX_FRONTIER_OUTLINE);
      polygon.setAttribute("stroke-width", "2");
      polygon.setAttribute("stroke-dasharray", "6 5");
      polygon.setAttribute("stroke-opacity", "0.9");
    } else if (state === "seizable") {
      polygon.setAttribute("fill", this.ownerColor(tile.owner));
      polygon.setAttribute("fill-opacity", "0.12");
      polygon.setAttribute("stroke", this.ownerColor(tile.owner));
      polygon.setAttribute("stroke-width", "2");
      polygon.setAttribute("stroke-dasharray", "6 5");
    } else {
      // Transparent click target; hover tint comes from CSS.
      polygon.setAttribute("fill", "#ffffff");
      polygon.setAttribute("fill-opacity", "0");
      polygon.setAttribute("stroke", "none");
    }
    group.appendChild(polygon);

    if (this.onTileClick) {
      group.addEventListener("click", () => this.onTileClick(tile.id));
    }
    return group;
  }

  // Border segments along the edges of an owned, visible tile that face a
  // tile with a different owner.
  appendBorders(layer, tile) {
    if (!tile.owner || !this.hexMap.isRevealed(tile.id)) return;
    const c = this.tileCenter(tile);
    const color = tile.owner === "player" ? HEX_CLAIMED_OUTLINE : this.ownerColor(tile.owner);
    const width = tile.owner === "player" ? 3.5 : 2.5;
    for (let edge = 0; edge < 6; edge++) {
      const direction = EDGE_TO_DIRECTION[edge];
      const neighbor = this.hexMap.tilesByCoord.get(hexKey(tile.q + direction.q, tile.r + direction.r));
      if (neighbor && neighbor.owner === tile.owner) continue;
      const a = hexCorner(c.x, c.y, this.hexSize - 1.5, edge);
      const b = hexCorner(c.x, c.y, this.hexSize - 1.5, (edge + 1) % 6);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", a[0]);
      line.setAttribute("y1", a[1]);
      line.setAttribute("x2", b[0]);
      line.setAttribute("y2", b[1]);
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", width);
      line.setAttribute("stroke-linecap", "round");
      layer.appendChild(line);
    }
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { HexRenderer };
}
