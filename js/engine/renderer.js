// renderer.js
//
// WorldRenderer: owns the PixiJS Application, the camera, the layer stack
// and the frame loop, and is the ONE object js/main.js talks to. It knows
// nothing about the legacy globals; everything arrives through options and
// method calls, and everything that changes on the map arrives through
// hexMap.onChange events which it forwards to the layers as dirty tiles.
//
// Frame order (see ARCHITECTURE.md): camera.update -> weather model update
// -> sim.update(dt, bounds) -> layer updates in z-order -> fps meter ->
// adaptive quality. dt is clamped to 0.1 s so a stalled tab does not make
// the carts teleport.
//
// Layer stack, bottom to top, inside `worldRoot` (which the camera moves):
//   terrain, roads, features, units, overlay, labels, fx (float texts,
//   expedition markers, bursts)
// and above it, in screen space: weather.

import PIXI from "./pixi.js";
import { buildAtlas } from "./atlas.js";
import { Camera } from "./camera.js";
import { TerrainLayer } from "./terrainLayer.js";
import { RoadLayer } from "./roadLayer.js";
import { FeatureLayer } from "./featureLayer.js";
import { UnitLayer } from "./unitLayer.js";
import { OverlayLayer } from "./overlayLayer.js";
import { LabelLayer } from "./labelLayer.js";
import { WeatherLayer } from "./weatherLayer.js";
import { FpsMeter, AdaptiveQuality, qualityFor } from "./device.js";
import { worldPointToAxial, worldTileCenter } from "../world/hexMath.js";
import { HEX_SIZE } from "../world/constants.js";

const MAX_DT = 0.1;
const LABEL_REFRESH_MS = 250;
const FPS_CALLBACK_MS = 500;

// Colours for floatText kinds; anything unknown gets "info".
const FLOAT_COLORS = {
  good: 0x8fe36f, bad: 0xff7a6b, gold: 0xf2c14e, info: 0xf4ecd8,
  food: 0xf2b45c, wood: 0xb98a4a, stone: 0xc9c4b8,
};

const EMPTY_BOUNDS = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Creates the renderer. Async because Pixi's `app.init` and the atlas
 * build both are.
 */
export async function createWorldRenderer(options) {
  const renderer = new WorldRenderer(options);
  await renderer.init();
  return renderer;
}

export class WorldRenderer {
  constructor({ host, world, hexMap, villages, quality, callbacks } = {}) {
    this.host = host;
    this.world = world;
    this.hexMap = hexMap;
    this.villages = typeof villages === "function" ? villages : () => villages || [];
    this.quality = quality || qualityFor("mid");
    this.callbacks = callbacks || {};
    this.app = null;
    this.atlas = null;
    this.camera = null;
    this.layers = null;
    this.weatherModel = null;
    this.sim = null;
    this.fps = new FpsMeter();
    this.adaptive = null;
    this.season = 1;
    this.destroyed = false;
    this.effects = [];          // { update(dt) -> bool alive, destroy() }
    this.labelRefreshTimer = null;
    this.lastFpsCallback = 0;
    this.unsubscribeMap = null;
    this.minimap = null;
    this.hoverTileId = null;
    this.emptyRenderList = [];
  }

  async init() {
    const { host, quality } = this;
    const app = new PIXI.Application();
    await app.init({
      preference: "webgl",
      antialias: !!quality.antialias,
      resolution: quality.resolution || 1,
      autoDensity: true,
      backgroundColor: 0x1a2a38,
      resizeTo: host,
      powerPreference: "high-performance",
    });
    this.app = app;
    const canvas = app.canvas;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    host.appendChild(canvas);

    this.atlas = await buildAtlas(PIXI, { scale: quality.tier === "low" ? 1.5 : 2 });

    const { world, hexMap, villages } = this;
    this.camera = new Camera(host, { worldWidth: world.width, worldHeight: world.height });
    this.camera.resize(app.screen.width, app.screen.height);

    this.worldRoot = new PIXI.Container();
    this.worldRoot.label = "world";
    this.screenRoot = new PIXI.Container();
    this.screenRoot.label = "screen";
    app.stage.addChild(this.worldRoot);
    app.stage.addChild(this.screenRoot);

    const terrain = new TerrainLayer(PIXI, world, hexMap, quality);
    const roads = new RoadLayer(PIXI, this.atlas, world, hexMap, quality);
    const features = new FeatureLayer(PIXI, this.atlas, world, hexMap, quality, villages);
    const units = new UnitLayer(PIXI, this.atlas, quality);
    const overlay = new OverlayLayer(PIXI, this.atlas, world, hexMap, quality, villages);
    const labels = new LabelLayer(PIXI, world, hexMap, villages);
    if (labels.setQuality) labels.setQuality(quality);
    const weather = new WeatherLayer(PIXI, this.atlas, quality, { width: app.screen.width, height: app.screen.height });
    this.layers = { terrain, roads, features, units, overlay, labels, weather };

    this.fxRoot = new PIXI.Container();
    this.fxRoot.label = "fx";
    for (const layer of [terrain, roads, features, units, overlay, labels]) this.worldRoot.addChild(layer.container);
    this.worldRoot.addChild(this.fxRoot);
    this.screenRoot.addChild(weather.container);

    // Owner colours for the terrain tint come from the live village list.
    terrain.setOwnerColors((ownerId) => {
      if (ownerId === "player") return 0xc29339;
      for (const v of this.villages()) if (v && v.id === ownerId) return v.color;
      return null;
    });

    this.adaptive = new AdaptiveQuality(quality, (q) => this.applyQuality(q));
    this.unsubscribeMap = hexMap.onChange((event) => this.onMapChange(event));
    this.camera.onChange((view) => {
      if (this.callbacks.onViewChange) this.callbacks.onViewChange(view);
      if (this.minimap) this.minimap.draw(view);
    });
    this.camera.attachInput(canvas, {
      onTap: (sx, sy, ev) => {
        const tile = this.tileAtScreen(sx, sy);
        if (tile && this.callbacks.onTileClick) {
          this.callbacks.onTileClick(tile.id, { x: sx, y: sy, button: ev ? ev.button : 0, shift: !!(ev && ev.shiftKey) });
        }
      },
      onLongPress: (sx, sy) => {
        const tile = this.tileAtScreen(sx, sy);
        if (tile && this.callbacks.onTileLongPress) this.callbacks.onTileLongPress(tile.id);
      },
      onHover: (sx, sy) => {
        const tile = sx < 0 ? null : this.tileAtScreen(sx, sy);
        const id = tile ? tile.id : null;
        if (id === this.hoverTileId) return;
        this.hoverTileId = id;
        overlay.setHover(id);
        if (this.callbacks.onTileHover) this.callbacks.onTileHover(id);
      },
    });

    this.onWindowResize = () => this.resize();
    window.addEventListener("resize", this.onWindowResize);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(host);
    }
    this.onVisibility = () => {
      if (document.hidden) app.ticker.stop();
      else { this.fps = new FpsMeter(); app.ticker.start(); }
    };
    document.addEventListener("visibilitychange", this.onVisibility);

    app.ticker.maxFPS = 0;
    app.ticker.add(this.frame, this);
    // First frame: everything culled/positioned before the player sees it.
    this.camera.update(1 / 60);
    this.camera.applyTo(this.worldRoot);
  }

  // ---- frame loop ---------------------------------------------------------------

  frame(ticker) {
    if (this.destroyed) return;
    const dtMs = ticker.deltaMS;
    const dt = Math.min(MAX_DT, dtMs / 1000);
    const camera = this.camera;
    const L = this.layers;

    camera.update(dt);
    camera.applyTo(this.worldRoot);
    const bounds = camera.getBounds(HEX_SIZE * 4);

    let weatherState = null;
    if (this.weatherModel) {
      this.weatherModel.update(dt);
      weatherState = this.weatherModel.state;
    }
    let agents = this.emptyRenderList;
    if (this.sim) {
      this.sim.update(dt, bounds);
      agents = this.sim.getRenderList(bounds) || this.emptyRenderList;
    }

    L.terrain.update(camera, dt);
    L.roads.update(camera, dt);
    L.features.update(camera, dt);
    L.units.update(agents, camera, dt);
    L.overlay.update(camera, dt);
    L.labels.update(camera, dt);
    if (weatherState) L.weather.update(weatherState, camera, dt);

    if (this.effects.length) {
      for (let i = this.effects.length - 1; i >= 0; i--) {
        if (!this.effects[i].update(dt)) {
          this.effects[i].destroy();
          this.effects.splice(i, 1);
        }
      }
    }

    this.fps.tick(dtMs);
    this.adaptive.tick(this.fps.frameMs);
    this.lastFpsCallback += dtMs;
    if (this.lastFpsCallback >= FPS_CALLBACK_MS) {
      this.lastFpsCallback = 0;
      if (this.callbacks.onFps) this.callbacks.onFps(this.fps.fps, this.fps.frameMs, this.quality);
    }
  }

  /** Pushes a (possibly adapted) quality to everything that scales with it. */
  applyQuality(quality) {
    this.quality = quality;
    for (const key of Object.keys(this.layers)) {
      const layer = this.layers[key];
      if (layer && typeof layer.setQuality === "function") layer.setQuality(quality);
    }
    if (this.sim && typeof this.sim.setQuality === "function") this.sim.setQuality(quality);
  }

  // ---- map change bus -----------------------------------------------------------------

  onMapChange(event) {
    const L = this.layers;
    const ids = event.tileIds;
    switch (event.kind) {
      case "owner":
        L.terrain.markDirty(ids);
        L.overlay.markDirty(ids);
        L.features.markDirty(ids);
        this.scheduleLabelRefresh();
        if (this.minimap) this.minimap.invalidate();
        break;
      case "seen":
        L.terrain.markDirty(ids);
        L.overlay.markDirty(ids);
        L.features.markDirty(ids);
        L.roads.markDirty(ids);
        this.scheduleLabelRefresh();
        if (this.minimap) this.minimap.invalidate();
        break;
      case "reveal":
        this.refreshAll();
        break;
      case "road":
        L.roads.markDirty(ids);
        L.overlay.markDirty(ids);
        break;
      case "improvement":
      case "building":
        L.features.markDirty(ids);
        L.overlay.markDirty(ids);
        break;
      case "selection":
        L.overlay.setSelected(this.hexMap.selectedTileId);
        break;
      case "resources":
        // Only the yields lens shows amounts; it redraws what is dirty.
        if (ids && ids.length) L.overlay.markDirty(ids);
        break;
      default:
        break;
    }
  }

  scheduleLabelRefresh() {
    if (this.labelRefreshTimer) return;
    this.labelRefreshTimer = setTimeout(() => {
      this.labelRefreshTimer = null;
      if (!this.destroyed) this.layers.labels.refresh();
    }, LABEL_REFRESH_MS);
  }

  // ---- public API ---------------------------------------------------------------------

  setSeason(season) {
    this.season = season;
    this.layers.terrain.setSeason(season);
    this.layers.features.setSeason(season);
    if (this.weatherModel) this.weatherModel.setSeason(season);
  }

  setWeather(weatherModel) {
    this.weatherModel = weatherModel;
    if (weatherModel && this.season) weatherModel.setSeason(this.season);
  }

  setAgentSource(agentSim) {
    this.sim = agentSim;
    if (agentSim && typeof agentSim.setQuality === "function") agentSim.setQuality(this.quality);
  }

  setGrid(on) {
    this.layers.terrain.setGrid(!!on);
  }

  setLens(name) {
    this.layers.overlay.setLens(name || null);
  }

  setSelected(tileId) {
    this.layers.overlay.setSelected(tileId || null);
  }

  setHover(tileId) {
    this.hoverTileId = tileId || null;
    this.layers.overlay.setHover(tileId || null);
  }

  setPlacementGhost(ghost) {
    this.layers.overlay.setPlacementGhost(ghost || null);
  }

  setRoadPreview(tileIds) {
    this.layers.overlay.setRoadPreview(tileIds || null);
  }

  markDirty(tileIds) {
    const L = this.layers;
    L.terrain.markDirty(tileIds);
    L.roads.markDirty(tileIds);
    L.features.markDirty(tileIds);
    L.overlay.markDirty(tileIds);
  }

  refreshAll() {
    const L = this.layers;
    L.terrain.markAllDirty();
    L.roads.markAllDirty();
    L.features.markAllDirty();
    L.overlay.markAllDirty();
    L.labels.refresh();
    if (this.minimap) this.minimap.invalidate();
  }

  /**
   * Optional: hand the renderer the HUD minimap so it is redrawn on view
   * changes and invalidated on ownership/fog events. (Not in the contract;
   * main.js may drive the minimap itself instead.)
   */
  attachMinimap(minimap) {
    this.minimap = minimap;
    if (minimap) {
      minimap.onClick((wx, wy) => this.camera.focusOn(wx, wy, undefined, { animate: true, duration: 0.45 }));
      minimap.draw(this.camera.view);
    }
  }

  flashTile(tileId, color) {
    this.layers.overlay.flashTile(tileId, color);
  }

  /**
   * A short text that rises and fades over 1.4 s at a world position. `kind`
   * picks the colour ("good", "bad", "gold", "food", "wood", "stone", "info").
   */
  floatText(x, y, text, kind) {
    const color = FLOAT_COLORS[kind] || FLOAT_COLORS.info;
    const label = new PIXI.Text({
      text: String(text),
      style: { fontFamily: "Cinzel, Georgia, serif", fontSize: 18, fontWeight: "700", fill: color, stroke: { color: 0x1a1208, width: 4 } },
    });
    label.anchor.set(0.5, 1);
    label.eventMode = "none";
    label.position.set(x, y);
    this.fxRoot.addChild(label);
    const camera = this.camera;
    let t = 0;
    const duration = 1.4;
    this.effects.push({
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / duration);
        const inv = 1 / camera.zoom;
        label.scale.set(inv, inv);
        label.position.y = y - k * 36 * inv;
        label.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        return t < duration;
      },
      destroy: () => label.destroy(),
    });
  }

  /**
   * A tinted banner glides from one tile to another over 0.9 s, then bursts
   * a ring at the destination. `from`/`to` are tile ids or { x, y }.
   */
  animateExpedition(from, to, color, onArrive) {
    const a = this.resolvePoint(from);
    const b = this.resolvePoint(to);
    if (!a || !b) { if (onArrive) onArrive(); return; }
    const texture = this.atlas.texture("ui/marker_explore");
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5, 1);
    sprite.tint = typeof color === "string" ? parseInt(color.replace("#", ""), 16) || 0xffffff : (color || 0xffffff);
    sprite.eventMode = "none";
    sprite.position.set(a.x, a.y);
    this.fxRoot.addChild(sprite);
    const camera = this.camera;
    let t = 0;
    const duration = 0.9;
    let arrived = false;
    this.effects.push({
      update: (dt) => {
        t += dt;
        const k = easeInOut(Math.min(1, t / duration));
        // A slight arc so it reads as travelling, not sliding.
        const lift = Math.sin(k * Math.PI) * 18;
        sprite.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - lift);
        const s = Math.max(1, Math.min(2.5, 1 / camera.zoom));
        sprite.scale.set(s, s);
        if (t >= duration && !arrived) {
          arrived = true;
          this.burst(b.x, b.y, sprite.tint);
          if (onArrive) onArrive();
        }
        return t < duration;
      },
      destroy: () => sprite.destroy(),
    });
  }

  /** An expanding, fading ring. */
  burst(x, y, color = 0xf2c14e) {
    const g = new PIXI.Graphics();
    g.eventMode = "none";
    g.position.set(x, y);
    this.fxRoot.addChild(g);
    let t = 0;
    const duration = 0.55;
    this.effects.push({
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / duration);
        const radius = HEX_SIZE * (0.4 + k * 1.6);
        g.clear().circle(0, 0, radius).stroke({ color, width: 3 * (1 - k) + 1, alpha: 1 - k });
        return t < duration;
      },
      destroy: () => g.destroy(),
    });
  }

  resolvePoint(ref) {
    if (!ref) return null;
    if (typeof ref === "object" && typeof ref.x === "number") return ref;
    const tile = typeof ref === "string" ? this.hexMap.getTile(ref) : ref;
    if (!tile) return null;
    return worldTileCenter(tile.q, tile.r, this.world.grid);
  }

  getBuildingPositions(bounds) {
    return this.layers.features.getBuildingPositions(bounds || EMPTY_BOUNDS);
  }

  tileAtScreen(sx, sy) {
    const p = this.camera.screenToWorld(sx, sy);
    const axial = worldPointToAxial(p.x, p.y, this.world.grid);
    return this.hexMap.getTileAt(axial.q, axial.r) || null;
  }

  resize() {
    if (this.destroyed || !this.app) return;
    // resizeTo handles the renderer itself; we only follow.
    if (typeof this.app.resize === "function") this.app.resize();
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.camera.resize(w, h);
    this.camera.applyTo(this.worldRoot);
    if (this.layers && this.layers.weather) this.layers.weather.resize(w, h);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.labelRefreshTimer) clearTimeout(this.labelRefreshTimer);
    if (this.unsubscribeMap) this.unsubscribeMap();
    window.removeEventListener("resize", this.onWindowResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    for (const fx of this.effects) fx.destroy();
    this.effects.length = 0;
    if (this.camera) this.camera.destroy();
    if (this.layers) {
      for (const key of Object.keys(this.layers)) {
        const layer = this.layers[key];
        if (layer && typeof layer.destroy === "function") layer.destroy();
      }
    }
    if (this.app) {
      this.app.ticker.remove(this.frame, this);
      this.app.destroy(true, { children: true, texture: true });
    }
    this.app = null;
    this.layers = null;
  }
}
