// labelLayer.js
//
// Names on the map: big faint region names, settlement names with a
// coloured dot, italic river and lake names. All PIXI.Text in world space,
// scaled every frame so they stay a readable size on screen.
//
// There are at most a few hundred labels, so the per-frame loop over them
// is cheap; what would not be cheap is rebuilding Text objects, so each
// label keeps its Text for life and `refresh()` only toggles which ones
// are eligible (a region is named once any of its tiles has been seen; a
// village once its home tile is revealed). Text textures are rasterised at
// the LARGEST size they will ever be shown at and scaled down, never up,
// so they stay crisp.

import { ZOOM_MID, ZOOM_NEAR } from "../world/constants.js";
import { worldTileCenter } from "../world/hexMath.js";

const REGION_FONT = "Cinzel, Georgia, 'Times New Roman', serif";
const WATER_FONT = "'Crimson Pro', Georgia, 'Times New Roman', serif";

const REGION_ALPHA = 0.55;
const VILLAGE_BASE_PX = 18;   // rasterised size; on-screen size is clamped 11..18
const WATER_BASE_PX = 16;     // on-screen 10..16
const DEFAULT_LABEL_LIMIT = 40;

function colorToNumber(value, fallback = 0xcccccc) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseInt(value.replace("#", ""), 16);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

export class LabelLayer {
  /**
   * @param {object} PIXI
   * @param {object} world generateWorld() output (regions, rivers, lakes, grid)
   * @param {import("../world/hexMap.js").HexMap} hexMap
   * @param {() => Array} villages live list of villages ({ id, name, color, kind, homeTileId })
   */
  constructor(PIXI, world, hexMap, villages) {
    this.PIXI = PIXI;
    this.world = world;
    this.hexMap = hexMap;
    this.villages = typeof villages === "function" ? villages : () => villages || [];
    this.container = new PIXI.Container();
    this.container.label = "labels";
    this.labelLimit = DEFAULT_LABEL_LIMIT;

    // Region -> tiles, built once so refresh() can test "any seen tile"
    // without touching tiles that belong to other regions.
    this.regionTiles = new Map();
    for (const tile of hexMap.allTiles) {
      if (tile.regionId === null || tile.regionId === undefined) continue;
      let list = this.regionTiles.get(tile.regionId);
      if (!list) { list = []; this.regionTiles.set(tile.regionId, list); }
      list.push(tile);
    }

    // Label records: { kind, key, x, y, text, dot?, eligible, baseSize, priority }
    this.regions = [];
    this.villageLabels = new Map();  // villageId -> record
    this.waters = [];
    this.all = [];

    this.buildRegionLabels();
    this.buildWaterLabels();
    this.refresh();
  }

  setQuality(quality) {
    if (quality && quality.labelLimit) this.labelLimit = quality.labelLimit;
  }

  // ---- building ------------------------------------------------------------------

  makeText(text, style) {
    const t = new this.PIXI.Text({ text, style });
    t.anchor.set(0.5, 0.5);
    t.visible = false;
    // Labels never need hit testing; skipping it keeps Pixi's event pass cheap.
    t.eventMode = "none";
    this.container.addChild(t);
    return t;
  }

  buildRegionLabels() {
    const regions = this.world.regions || [];
    for (const region of regions) {
      if (!region || !region.name || !region.center) continue;
      // Size grows with the region's footprint: small copse, sprawling plain.
      const size = Math.max(16, Math.min(56, 10 + Math.sqrt(region.tileCount || 1) * 2.2));
      const text = this.makeText(String(region.name).toUpperCase(), {
        fontFamily: REGION_FONT,
        fontSize: size,
        fill: 0x2b2418,
        letterSpacing: Math.round(size * 0.18),
        fontWeight: "600",
        align: "center",
      });
      text.alpha = REGION_ALPHA;
      text.position.set(region.center.x, region.center.y);
      const record = { kind: "region", key: region.id, x: region.center.x, y: region.center.y, text, eligible: false, baseSize: size, priority: 1, halfW: size * 3 };
      this.regions.push(record);
      this.all.push(record);
    }
  }

  buildWaterLabels() {
    const grid = this.world.grid;
    const add = (body, kind) => {
      if (!body || !body.name || !body.tileIds || !body.tileIds.length) return;
      const midId = body.tileIds[Math.floor(body.tileIds.length / 2)];
      const tile = this.hexMap.getTile(midId);
      if (!tile) return;
      const c = worldTileCenter(tile.q, tile.r, grid);
      const text = this.makeText(body.name, {
        fontFamily: WATER_FONT,
        fontStyle: "italic",
        fontSize: WATER_BASE_PX,
        fill: 0xeaf4fb,
        stroke: { color: 0x1d4a66, width: 3 },
        align: "center",
      });
      text.alpha = 0.9;
      text.position.set(c.x, c.y);
      const record = { kind, key: body.id, tileId: midId, x: c.x, y: c.y, text, eligible: false, baseSize: WATER_BASE_PX, priority: 2, halfW: 60 };
      this.waters.push(record);
      this.all.push(record);
    };
    for (const river of this.world.rivers || []) add(river, "river");
    for (const lake of this.world.lakes || []) add(lake, "lake");
  }

  ensureVillageLabel(village) {
    let record = this.villageLabels.get(village.id);
    const tile = this.hexMap.getTile(village.homeTileId);
    if (!tile) return null;
    if (!record) {
      const color = colorToNumber(village.color, village.kind === "player" ? 0xc29339 : village.kind === "garlock" ? 0x8c1f1f : 0x2a4d3a);
      const text = this.makeText(village.name || "", {
        fontFamily: REGION_FONT,
        fontSize: VILLAGE_BASE_PX,
        fill: 0xfff7e6,
        stroke: { color: 0x2a1f12, width: 4 },
        fontWeight: "700",
        align: "center",
      });
      // The dot sits at the hall; the name hangs below it. Both live in a
      // small container so one scale/position covers them.
      const group = new this.PIXI.Container();
      group.eventMode = "none";
      const dot = new this.PIXI.Graphics();
      dot.circle(0, 0, 5).fill(color).stroke({ color: 0xffffff, width: 1.5 });
      group.addChild(dot);
      this.container.removeChild(text);
      text.anchor.set(0.5, 0);
      text.position.set(0, 7);
      text.visible = true;
      group.addChild(text);
      group.visible = false;
      this.container.addChild(group);
      record = { kind: "village", key: village.id, x: 0, y: 0, text: group, label: text, dot, eligible: false, baseSize: VILLAGE_BASE_PX, priority: 0, halfW: 50, name: village.name, color };
      this.villageLabels.set(village.id, record);
      this.all.push(record);
    }
    const c = worldTileCenter(tile.q, tile.r, this.world.grid);
    record.x = c.x;
    record.y = c.y;
    record.text.position.set(c.x, c.y);
    if (record.name !== village.name) {
      record.name = village.name;
      record.label.text = village.name || "";
    }
    const color = colorToNumber(village.color, record.color);
    if (color !== record.color) {
      record.color = color;
      record.dot.clear().circle(0, 0, 5).fill(color).stroke({ color: 0xffffff, width: 1.5 });
    }
    return record;
  }

  // ---- refresh: eligibility -------------------------------------------------------

  /**
   * Re-evaluates which labels may show: regions with a seen tile, revealed
   * villages, named water with a revealed middle tile. The renderer calls
   * this (throttled) on owner/seen/reveal events and when villages change.
   */
  refresh() {
    const hexMap = this.hexMap;
    const mapmaking = hexMap.mapmakingUnlocked;
    for (const record of this.regions) {
      if (mapmaking) { record.eligible = true; continue; }
      const tiles = this.regionTiles.get(record.key);
      let seen = false;
      if (tiles) {
        for (let i = 0; i < tiles.length; i++) if (tiles[i].seen) { seen = true; break; }
      }
      record.eligible = seen;
    }
    for (const record of this.waters) record.eligible = mapmaking || hexMap.isRevealed(record.tileId);

    const alive = new Set();
    for (const village of this.villages()) {
      if (!village || !village.id) continue;
      const record = this.ensureVillageLabel(village);
      if (!record) continue;
      alive.add(village.id);
      record.eligible = hexMap.isRevealed(village.homeTileId);
    }
    for (const [id, record] of this.villageLabels) {
      if (alive.has(id)) continue;
      record.text.destroy({ children: true });
      this.villageLabels.delete(id);
      const i = this.all.indexOf(record);
      if (i >= 0) this.all.splice(i, 1);
    }
  }

  // ---- per frame ------------------------------------------------------------------

  /**
   * Culls against the view, scales text for the zoom, and enforces the
   * label limit with villages first, then regions, then water.
   */
  update(camera) {
    const zoom = camera.zoom;
    const bounds = camera.getBounds(80);
    const inv = 1 / zoom;
    let shown = 0;
    const limit = this.labelLimit;

    // Village labels: constant-ish screen size, 11..18 px.
    const villagePx = Math.max(11, Math.min(18, 16 * zoom));
    const villageScale = (villagePx / VILLAGE_BASE_PX) * inv;
    for (const record of this.villageLabels.values()) {
      const show = record.eligible && shown < limit
        && record.x > bounds.minX && record.x < bounds.maxX && record.y > bounds.minY && record.y < bounds.maxY;
      record.text.visible = show;
      if (!show) continue;
      shown++;
      record.text.scale.set(villageScale, villageScale);
    }

    // Region labels: world-sized, faded out when close, floored at 12 px.
    const regionFade = zoom >= ZOOM_NEAR ? 0 : zoom > ZOOM_NEAR * 0.7 ? 1 - (zoom - ZOOM_NEAR * 0.7) / (ZOOM_NEAR * 0.3) : 1;
    for (const record of this.regions) {
      let show = regionFade > 0.02 && record.eligible && shown < limit;
      if (show) {
        const half = record.halfW * Math.max(1, 12 / (record.baseSize * zoom));
        show = record.x + half > bounds.minX && record.x - half < bounds.maxX && record.y > bounds.minY - 40 && record.y < bounds.maxY + 40;
      }
      record.text.visible = show;
      if (!show) continue;
      shown++;
      const screenPx = record.baseSize * zoom;
      const scale = screenPx < 12 ? 12 / screenPx : 1;
      record.text.scale.set(scale, scale);
      record.text.alpha = REGION_ALPHA * regionFade;
    }

    // Water labels: hidden when far, screen-sized 10..16 px.
    const waterPx = Math.max(10, Math.min(16, 14 * zoom));
    const waterScale = (waterPx / WATER_BASE_PX) * inv;
    const waterVisible = zoom >= ZOOM_MID;
    for (const record of this.waters) {
      const show = waterVisible && record.eligible && shown < limit
        && record.x > bounds.minX && record.x < bounds.maxX && record.y > bounds.minY && record.y < bounds.maxY;
      record.text.visible = show;
      if (!show) continue;
      shown++;
      record.text.scale.set(waterScale, waterScale);
    }
    this.visibleCount = shown;
  }

  destroy() {
    this.container.destroy({ children: true });
    this.all.length = 0;
    this.regions.length = 0;
    this.waters.length = 0;
    this.villageLabels.clear();
  }
}
