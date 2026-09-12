// hexRenderer.js
//
// The interactive layer over the painted world. It draws what the player
// *knows* about each tile, not the terrain (the picture does that):
//
//   hidden    not yet seen — fog
//   frontier  wild land next to yours — dashed outline, explorable
//   seizable  another village's land next to yours — dashed outline in
//             their colour
//
// Territory is drawn as borders: one line along every edge where the owner
// changes, in the owner's colour, so a village's land reads as one shape.
//
// ---------------------------------------------------------------------------
// Why this is not one element per hex
//
// The map carries about thirty thousand hexes. Giving each one its own <g>
// and <polygon> — which is what this file used to do — is sixty thousand DOM
// nodes rebuilt every time a tile changes hands, and no browser stays smooth
// through that. So:
//
//   * The fog is ONE path: a rectangle over the whole sheet with the tiles
//     the player has seen punched out of it (even-odd fill). Its size is
//     proportional to what has been *explored*, not to the map, so it starts
//     tiny and only ever grows to the size of the player's world. Once
//     mapmaking is researched there is no fog at all and the layer goes away.
//   * Borders are ONE path per village colour.
//   * Only the handful of tiles that need to look like something — the
//     player's own land, the frontier, and what can be seized — get an
//     element of their own, carrying data-tile-id and its hex--* class.
//   * Clicking works out which hex is under the pointer with hex maths
//     (hexMath.pixelToAxial), so no hex needs to be a click target.
// ---------------------------------------------------------------------------

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
    this.outlineTail = hexOutlineTail(this.hexSize);
    this.hoveredId = null;
    this.svg = null;
  }

  tileCenter(tile) {
    const pixel = axialToPixel(tile.q, tile.r, this.hexSize);
    return { x: pixel.x + this.origin.x, y: pixel.y + this.origin.y };
  }

  // Which tile is at a point in the map's own coordinate space.
  tileAt(x, y) {
    const axial = pixelToAxial(x - this.origin.x, y - this.origin.y, this.hexSize);
    return this.hexMap.tilesByCoord.get(hexKey(axial.q, axial.r)) || null;
  }

  tileState(tile) {
    if (!this.hexMap.isRevealed(tile.id)) return "hidden";
    if (this.hexMap.isClaimed(tile.id)) return "claimed";
    if (tile.owner) return this.hexMap.isSeizable(tile.id) ? "seizable" : "foreign";
    if (this.hexMap.isFrontier(tile.id)) return "frontier";
    return "revealed";
  }

  // One "M x y" + hex outline, for batching many hexes into one path.
  hexSubpath(center, shrink) {
    const size = shrink ? this.hexSize - shrink : this.hexSize;
    const tail = shrink ? hexOutlineTail(size) : this.outlineTail;
    const start = hexOutlineStart(center.x, center.y, size);
    return `M${start[0].toFixed(1)} ${start[1].toFixed(1)}${tail}`;
  }

  render() {
    const svg = document.createElementNS(SVG_NS, "svg");
    const box = this.viewBox;
    svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.classList.add("hexgrid");

    svg.appendChild(this.buildFogLayer());
    svg.appendChild(this.buildMarkedTiles());
    svg.appendChild(this.buildBorders());

    const selected = this.hexMap.selectedTileId ? this.hexMap.getTile(this.hexMap.selectedTileId) : null;
    if (selected) svg.appendChild(this.buildSelectionBrackets(selected));

    // One hover outline, moved about rather than one :hover rule per hex.
    const hover = document.createElementNS(SVG_NS, "path");
    hover.setAttribute("class", "hex-hover");
    hover.setAttribute("fill", "rgba(255,255,255,0.10)");
    hover.setAttribute("stroke", "rgba(255,255,255,0.5)");
    hover.setAttribute("stroke-width", Math.max(1, this.hexSize * 0.08));
    hover.style.pointerEvents = "none";
    hover.style.display = "none";
    svg.appendChild(hover);
    this.hoverElement = hover;

    this.installPointer(svg);

    this.container.innerHTML = "";
    this.container.appendChild(svg);
    this.svg = svg;
    this.invalidateTransform();
  }

  // ---- Fog -----------------------------------------------------------------

  // A sheet of blank paper over everything, with the tiles the player has
  // seen cut out of it. Nothing is drawn per unseen hex, so the cost is the
  // size of the player's world, not the size of the map.
  buildFogLayer() {
    const layer = document.createElementNS(SVG_NS, "g");
    layer.setAttribute("class", "hex-foglayer");
    layer.style.pointerEvents = "none";
    if (this.hexMap.mapmakingUnlocked) return layer;      // the whole world is drawn in

    const box = this.viewBox;
    let d = `M${box.x} ${box.y}h${box.width}v${box.height}h${-box.width}z`;
    for (const tile of this.hexMap.getSeenTiles()) {
      d += this.hexSubpath(this.tileCenter(tile));
    }

    const fog = document.createElementNS(SVG_NS, "path");
    fog.setAttribute("d", d);
    fog.setAttribute("fill-rule", "evenodd");
    fog.setAttribute("fill", "url(#fogPaper)");
    layer.appendChild(this.fogPattern());
    layer.appendChild(fog);

    // A soft edge where the known world stops.
    const rim = document.createElementNS(SVG_NS, "path");
    rim.setAttribute("d", d);
    rim.setAttribute("fill-rule", "evenodd");
    rim.setAttribute("fill", "none");
    rim.setAttribute("stroke", "rgba(120, 92, 54, 0.5)");
    rim.setAttribute("stroke-width", Math.max(1, this.hexSize * 0.12));
    layer.appendChild(rim);
    return layer;
  }

  // Terra incognita: aged paper with a faint cartographer's hatch on it.
  // A pattern costs a handful of nodes however much of the map it covers.
  fogPattern() {
    const defs = document.createElementNS(SVG_NS, "defs");
    const pattern = document.createElementNS(SVG_NS, "pattern");
    pattern.setAttribute("id", "fogPaper");
    pattern.setAttribute("width", "26");
    pattern.setAttribute("height", "26");
    pattern.setAttribute("patternUnits", "userSpaceOnUse");

    const ground = document.createElementNS(SVG_NS, "rect");
    ground.setAttribute("width", "26");
    ground.setAttribute("height", "26");
    ground.setAttribute("fill", "#e2d2b2");
    pattern.appendChild(ground);

    const hatch = document.createElementNS(SVG_NS, "path");
    hatch.setAttribute("d", "M0 26 L26 0 M-6 6 L6 -6 M20 32 L32 20");
    hatch.setAttribute("stroke", "rgba(120, 90, 55, 0.14)");
    hatch.setAttribute("stroke-width", "1.4");
    pattern.appendChild(hatch);

    const speck = document.createElementNS(SVG_NS, "circle");
    speck.setAttribute("cx", "7");
    speck.setAttribute("cy", "18");
    speck.setAttribute("r", "1");
    speck.setAttribute("fill", "rgba(120, 90, 55, 0.16)");
    pattern.appendChild(speck);

    defs.appendChild(pattern);
    return defs;
  }

  // ---- The tiles that need to look like something --------------------------

  // The player's own land, the frontier and what can be seized. Everything
  // else on the map needs no element: it is just painted ground.
  buildMarkedTiles() {
    const layer = document.createElementNS(SVG_NS, "g");
    layer.setAttribute("class", "hex-marked");
    layer.style.pointerEvents = "none";

    const claimed = [];
    const frontier = [];
    const seizableByColor = new Map();

    // All three of these live on or beside the player's own land, so they
    // are found from it rather than by asking every tile on the map what it
    // thinks it is.
    for (const tile of this.hexMap.getTilesOwnedBy("player")) claimed.push(tile);
    for (const tile of this.hexMap.getFrontierTiles("player")) {
      if (this.hexMap.isRevealed(tile.id)) frontier.push(tile);
    }
    for (const tile of this.hexMap.getSeizableTiles()) {
      if (!this.hexMap.isRevealed(tile.id)) continue;
      const color = this.ownerColor(tile.owner) || "#888888";
      if (!seizableByColor.has(color)) seizableByColor.set(color, []);
      seizableByColor.get(color).push(tile);
    }

    // Each of these tiles also gets its own marker element, so the rest of
    // the game can still find it by id and style it by state.
    for (const tile of claimed) layer.appendChild(this.buildTileMarker(tile, "claimed"));
    for (const tile of frontier) layer.appendChild(this.buildTileMarker(tile, "frontier"));
    for (const tiles of seizableByColor.values()) {
      for (const tile of tiles) layer.appendChild(this.buildTileMarker(tile, "seizable"));
    }

    if (frontier.length) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", frontier.map((tile) => this.hexSubpath(this.tileCenter(tile), this.hexSize * 0.06)).join(""));
      path.setAttribute("fill", "#ffffff");
      path.setAttribute("fill-opacity", "0.07");
      path.setAttribute("stroke", "#d49e32");
      path.setAttribute("stroke-width", Math.max(1.2, this.hexSize * 0.09));
      path.setAttribute("stroke-dasharray", `${(this.hexSize * 0.22).toFixed(1)} ${(this.hexSize * 0.16).toFixed(1)}`);
      path.setAttribute("class", "hexbatch hexbatch--frontier");
      layer.appendChild(path);
    }

    for (const [color, tiles] of seizableByColor) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", tiles.map((tile) => this.hexSubpath(this.tileCenter(tile), this.hexSize * 0.06)).join(""));
      path.setAttribute("fill", color);
      path.setAttribute("fill-opacity", "0.13");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", Math.max(1.2, this.hexSize * 0.085));
      path.setAttribute("stroke-dasharray", `${(this.hexSize * 0.22).toFixed(1)} ${(this.hexSize * 0.16).toFixed(1)}`);
      path.setAttribute("class", "hexbatch hexbatch--seizable");
      layer.appendChild(path);
    }

    return layer;
  }

  // An empty, invisible stand-in carrying the tile's id and state, so tests,
  // CSS and anything else looking for a tile can still find one.
  buildTileMarker(tile, state) {
    const marker = document.createElementNS(SVG_NS, "g");
    marker.setAttribute("data-tile-id", tile.id);
    marker.classList.add("hex", `hex--${state}`);
    if (tile.id === this.hexMap.selectedTileId) marker.classList.add("hex--selected");
    const center = this.tileCenter(tile);
    marker.setAttribute("transform", `translate(${center.x.toFixed(1)} ${center.y.toFixed(1)})`);
    return marker;
  }

  // ---- Borders -------------------------------------------------------------

  // One line along every edge where the owner changes, batched by colour so
  // a whole village's outline is a single element.
  buildBorders() {
    const layer = document.createElementNS(SVG_NS, "g");
    layer.setAttribute("class", "hex-borders");
    layer.style.pointerEvents = "none";

    const byColor = new Map();
    const inset = this.hexSize * 0.06;
    // Only owned land has a border, and owned land is indexed.
    const owned = [];
    for (const ids of this.hexMap.tilesByOwner.values()) {
      for (const id of ids) {
        const tile = this.hexMap.getTile(id);
        if (tile) owned.push(tile);
      }
    }
    for (const tile of owned) {
      if (!this.hexMap.isRevealed(tile.id)) continue;
      const color = tile.owner === "player" ? HEX_CLAIMED_OUTLINE : (this.ownerColor(tile.owner) || "#888888");
      const center = this.tileCenter(tile);
      let d = byColor.get(color) || "";
      for (let edge = 0; edge < 6; edge++) {
        const direction = EDGE_TO_DIRECTION[edge];
        const neighbor = this.hexMap.tilesByCoord.get(hexKey(tile.q + direction.q, tile.r + direction.r));
        if (neighbor && neighbor.owner === tile.owner) continue;
        const a = hexCorner(center.x, center.y, this.hexSize - inset, edge);
        const b = hexCorner(center.x, center.y, this.hexSize - inset, (edge + 1) % 6);
        d += `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
      }
      if (d) byColor.set(color, d);
    }

    for (const [color, d] of byColor) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", color === HEX_CLAIMED_OUTLINE ? Math.max(1.6, this.hexSize * 0.14) : Math.max(1.2, this.hexSize * 0.1));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("class", color === HEX_CLAIMED_OUTLINE ? "hexborder hexborder--player" : "hexborder");
      layer.appendChild(path);
    }
    return layer;
  }

  // ---- Selection and pointer ----------------------------------------------

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

    // Dark backing first, then the white bracket over it. Both are one path.
    for (const [color, width] of [["rgba(0,0,0,0.55)", this.hexSize * 0.22], [HEX_SELECTED_OUTLINE, this.hexSize * 0.11]]) {
      let d = "";
      for (let index = 0; index < 6; index++) {
        const corner = corners[index];
        const before = towards(corner, corners[(index + 5) % 6], 0.34);
        const after = towards(corner, corners[(index + 1) % 6], 0.34);
        d += `M${before[0].toFixed(1)},${before[1].toFixed(1)} L${corner[0].toFixed(1)},${corner[1].toFixed(1)} L${after[0].toFixed(1)},${after[1].toFixed(1)}`;
      }
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", Math.max(1.5, width));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      group.appendChild(path);
    }
    return group;
  }

  // Turns a browser event into a point in the map's own coordinate space.
  //
  // getScreenCTM() flushes layout, and this used to be called on every
  // single mousemove over the map — which is the definition of jank. The
  // matrix only changes when the view does, so it is kept and thrown away
  // by invalidateTransform() instead.
  screenMatrix(svg) {
    if (!this.inverseCTM) {
      const matrix = svg.getScreenCTM && svg.getScreenCTM();
      if (!matrix) return null;
      this.inverseCTM = matrix.inverse();
    }
    return this.inverseCTM;
  }

  invalidateTransform() {
    this.inverseCTM = null;
  }

  eventToMapPoint(svg, event) {
    const inverse = this.screenMatrix(svg);
    if (!inverse) return null;
    const point = svg.createSVGPoint ? svg.createSVGPoint() : null;
    if (!point) return null;
    point.x = event.clientX;
    point.y = event.clientY;
    const mapped = point.matrixTransform(inverse);
    return { x: mapped.x, y: mapped.y };
  }

  installPointer(svg) {
    svg.addEventListener("click", (event) => {
      if (!this.onTileClick) return;
      const point = this.eventToMapPoint(svg, event);
      if (!point) return;
      const tile = this.tileAt(point.x, point.y);
      if (tile) this.onTileClick(tile.id);
    });

    // Hovering is a nicety, so it is answered once a frame at most and
    // never gets in the way of a drag.
    let pending = null;
    let queued = false;
    svg.addEventListener("mousemove", (event) => {
      pending = { clientX: event.clientX, clientY: event.clientY };
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const point = this.eventToMapPoint(svg, pending);
        const tile = point ? this.tileAt(point.x, point.y) : null;
        if (!tile) {
          this.hoveredId = null;
          if (this.hoverElement) this.hoverElement.style.display = "none";
          return;
        }
        if (tile.id === this.hoveredId) return;
        this.hoveredId = tile.id;
        if (!this.hoverElement) return;
        this.hoverElement.setAttribute("d", this.hexSubpath(this.tileCenter(tile), this.hexSize * 0.05));
        this.hoverElement.style.display = "";
      });
    });

    svg.addEventListener("mouseleave", () => {
      this.hoveredId = null;
      if (this.hoverElement) this.hoverElement.style.display = "none";
    });
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { HexRenderer };
}
