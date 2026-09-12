// agents.js (ES module)
//
// Everything that moves on the map: the villagers walking out to their
// work, the soldiers on the border, the townsfolk in the square, the carts
// on the roads, the boats off the fisheries, the trade ships on the sea
// lanes, the deer in the woods and the birds overhead — and the one-off
// processions the rules trigger: an expedition marching out to newly
// claimed land, a garlock warband coming for the barns.
//
// None of it changes a rule. game.js never asks an agent anything; this is
// the picture of the numbers, kept in step by syncPopulation() and nudged
// by onEvent(). It has three jobs the contract cares about:
//
//   1. Move smoothly. Agents walk hex centre to hex centre along paths from
//      the road network (roads.findPath, preferRoads) and never teleport.
//   2. Cost nothing when off screen. Only agents inside the view (plus two
//      chunks of margin) are stepped; ambient life is spawned per visible
//      chunk and thrown away when the camera leaves. Agents are pooled and
//      the render list is one reused array, so a frame allocates nothing.
//   3. Be deterministic. Ambient spawns are seeded by chunk index and
//      world seed, so a wood always has the same deer in the same corner.
//
// Agent record (what the unit layer reads — see docs/ARCHITECTURE.md):
//   { id, kind, variant, x, y, facing, state, phase, z, tint, carrying }
// Everything else on the object is private to this module.

import { CHUNK_SIZE } from "./constants.js";
import { worldTileCenter, worldPointToAxial, createRandom, clamp } from "./hexMath.js";
import { WORKPLACES, isWaterTerrain } from "./terrainDefs.js";
import { hasResources } from "./roads.js";

// World units per second. Villagers are brisk, carts faster on a road than
// off it, sheep in no hurry at all.
const SPEED = {
  villager: 26, soldier: 26, townsfolk: 14, garlock: 26,
  cart: 34, cartOffRoad: 20, boat: 22, tradeship: 22,
  bird: 40, deer: 18, boar: 14, sheep: 10, wolf: 20, heron: 7, fish: 0,
};

// One walk cycle (two frames) every this many world units.
const STRIDE = 12;

// Caps, whatever the head count.
const MAX_VILLAGERS = 40;
const MAX_SOLDIERS = 8;
const MAX_CARTS = 12;
const MAX_BOATS = 8;
const MAX_TRADE_CARTS = 3;

// Animals flee a person closer than this (three hexes).
const FLEE_RADIUS = 3 * 41.6;
const FLEE_CHECK_SECONDS = 0.3;

// Paths remembered per (from, to). Cleared when roads change or it fills.
const PATH_CACHE_MAX = 512;

// Where each animal lives. A hex outside its habitat is never chosen.
const FOREST = ["forest", "birchWood", "denseBush", "taiga", "timbermellowForest"];
const HABITAT = {
  deer: FOREST,
  boar: FOREST,
  sheep: ["flowerMeadow", "plains"],
  wolf: ["taiga", "tundra", "snowfield"],
  heron: ["marsh"],
  fish: ["lake", "shallows"],
};

// Which work site each trade walks to; carriers go anywhere.
const TRADE_SITES = {
  forester: ["lumberCamp"],
  mason: ["quarry", "mine"],
  farmer: ["farm", "pasture"],
  carrier: ["lumberCamp", "quarry", "mine", "farm", "pasture", "fishery"],
};

// What a site's yield is called on the icon over a villager's head.
const YIELD_ICON = { food: "food", wood: "wood", stone: "stone", timbermellow: "food", grain: "food" };

const SQRT3 = Math.sqrt(3);

function colorToNumber(color) {
  if (typeof color === "number") return color;
  if (typeof color === "string" && color[0] === "#") return parseInt(color.slice(1, 7), 16) || 0xffffff;
  return 0xffffff;
}

export class AgentSim {
  constructor({ world, hexMap, roads, improvements, quality }) {
    this.world = world;
    this.hexMap = hexMap;
    this.roads = roads;
    this.improvements = improvements;
    this.quality = quality || { maxAgents: 120, ambientPerChunk: 4 };
    this.grid = world.grid;

    this.random = createRandom(((world.seed >>> 0) ^ 0x9e3779b9) >>> 0);
    this.time = 0;
    this.nextId = 1;

    // Live agents, the free pool, and the array getRenderList hands out.
    this.agents = [];
    this.pool = [];
    this.renderList = [];
    this.activeCount = 0;

    // Groups, so a resync only touches its own kind of agent.
    this.villagers = [];
    this.soldiers = [];
    this.townsfolk = [];
    this.carts = [];
    this.boats = [];
    this.caravans = new Map();      // route index -> agent
    this.ships = new Map();         // lane index -> agent
    this.rivals = new Map();        // village id -> agents[]
    this.chunks = new Map();        // chunk index -> agents[]
    this.events = [];

    // People animals run from: villagers, soldiers and marching parties.
    this.people = [];

    // Cached lookups, refreshed lazily when the map says they are stale.
    this.pathCache = new Map();
    this.pathsDirty = false;
    this.sitesDirty = true;
    this.landDirty = true;
    this.revealDirty = true;
    this.staleChunks = new Set();
    this.playerSites = [];
    this.playerSchools = [];
    this.borderTiles = [];
    this.frontierTiles = [];
    this.workTiles = [];
    this.routePoints = new Map();
    this.lanePoints = new Map();

    this.population = { humans: 0, soldiers: 0, trades: {}, season: 1 };
    this.season = 1;
    this.resyncTimer = 0;
    this.chunkTimer = 0;

    // Chunk grid, for ambient spawning.
    this.hexWidth = SQRT3 * this.grid.hexSize;
    this.rowHeight = 1.5 * this.grid.hexSize;
    this.chunkCols = Math.max(1, Math.ceil(world.cols / CHUNK_SIZE));
    this.chunkRows = Math.max(1, Math.ceil(world.rows / CHUNK_SIZE));
    this.chunkWidth = CHUNK_SIZE * this.hexWidth;
    this.chunkHeight = CHUNK_SIZE * this.rowHeight;
    this.viewRange = { cx0: -1, cy0: -1, cx1: -2, cy1: -2 };

    this.unsubscribe = hexMap.onChange((event) => this.onMapChange(event));
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
  }

  // ---- Map changes -------------------------------------------------------------

  onMapChange(event) {
    switch (event.kind) {
      case "road":
        this.pathsDirty = true;
        break;
      case "owner":
        this.landDirty = true;
        this.pathsDirty = true;
        break;
      case "improvement":
      case "building":
        this.sitesDirty = true;
        break;
      case "seen":
        this.revealDirty = true;
        for (const id of event.tileIds) {
          const tile = this.hexMap.getTile(id);
          if (tile) this.staleChunks.add(this.chunkIndexOf(tile.col, tile.row));
        }
        break;
      case "reveal":
        this.revealDirty = true;
        for (const index of this.chunks.keys()) this.staleChunks.add(index);
        break;
      default:
        break;
    }
  }

  setQuality(quality) {
    this.quality = quality || this.quality;
    // Fewer animals per chunk: trim what is already out there.
    const cap = this.ambientCap();
    for (const list of this.chunks.values()) {
      while (list.length > cap) this.release(list.pop());
    }
    this.syncPopulation(this.population);
  }

  ambientCap() {
    const cap = this.quality.ambientPerChunk;
    return cap === undefined ? 4 : Math.max(0, cap | 0);
  }

  maxAgents() {
    return this.quality.maxAgents === undefined ? 120 : this.quality.maxAgents;
  }

  // ---- Pool ------------------------------------------------------------------------

  acquire(kind, variant, x, y) {
    let agent = this.pool.pop();
    if (!agent) {
      agent = {
        id: 0, kind: "", variant: null, x: 0, y: 0, facing: 1, state: "idle", phase: 0, z: 0, tint: null, carrying: null,
        group: "", speed: 0, path: null, pathIndex: 0, pathDir: 1, timer: 0, mode: "", homeX: 0, homeY: 0,
        siteIndex: -1, yieldType: null, chunk: -1, habitat: null, fleeTimer: 0, baseSpeed: 0, carryUntil: 0,
        data: null, pts: [{ x: 0, y: 0, road: false }, { x: 0, y: 0, road: false }],
      };
    }
    agent.id = this.nextId++;
    agent.kind = kind;
    agent.variant = variant === undefined ? null : variant;
    agent.x = x;
    agent.y = y;
    agent.facing = 1;
    agent.state = "idle";
    agent.phase = 0;
    agent.z = y;
    agent.tint = null;
    agent.carrying = null;
    agent.group = "";
    agent.speed = SPEED[kind] || 20;
    agent.baseSpeed = agent.speed;
    agent.path = null;
    agent.pathIndex = 0;
    agent.pathDir = 1;
    agent.timer = this.random() * 1.5;
    agent.mode = "";
    agent.homeX = x;
    agent.homeY = y;
    agent.siteIndex = -1;
    agent.yieldType = null;
    agent.chunk = -1;
    agent.habitat = null;
    agent.fleeTimer = 0;
    agent.carryUntil = 0;
    agent.data = null;
    this.agents.push(agent);
    return agent;
  }

  release(agent) {
    const index = this.agents.indexOf(agent);
    if (index >= 0) {
      // Swap-remove: order does not matter to anything but iteration cost.
      const last = this.agents.pop();
      if (last !== agent) this.agents[index] = last;
    }
    const pi = this.people.indexOf(agent);
    if (pi >= 0) this.people.splice(pi, 1);
    agent.path = null;
    agent.data = null;
    this.pool.push(agent);
  }

  releaseAll(list) {
    for (const agent of list) this.release(agent);
    list.length = 0;
  }

  // ---- Geometry helpers -------------------------------------------------------------

  center(tile) {
    return worldTileCenter(tile.q, tile.r, this.grid);
  }

  tileAt(x, y) {
    const { q, r } = worldPointToAxial(x, y, this.grid);
    return this.hexMap.getTileAt(q, r);
  }

  chunkIndexOf(col, row) {
    return Math.floor(row / CHUNK_SIZE) * this.chunkCols + Math.floor(col / CHUNK_SIZE);
  }

  homeTile() {
    if (!this._home || this._home.owner !== "player") {
      this._home = this.hexMap.homeTileOf("player") || this.hexMap.allTiles.find((tile) => tile.isStartingTile) || null;
    }
    return this._home;
  }

  // A jittered point near a centre: `spread` in hex radii.
  jitter(x, y, spread) {
    const size = this.grid.hexSize;
    return {
      x: x + (this.random() - 0.5) * size * spread * 1.6,
      y: y + (this.random() - 0.5) * size * spread * 1.2,
    };
  }

  // Waypoints ({x, y, road}) for a list of tile ids.
  pointsFor(tileIds) {
    const points = [];
    for (const id of tileIds) {
      const tile = this.hexMap.getTile(id);
      if (!tile) continue;
      const c = this.center(tile);
      points.push({ x: c.x, y: c.y, road: !!tile.road });
    }
    return points;
  }

  // A walking route between two tiles, along roads where there are any.
  // Cached, because forty villagers walk the same six routes all day.
  getPath(fromId, toId) {
    const key = fromId + ">" + toId;
    let points = this.pathCache.get(key);
    if (points) return points;
    const ids = this.roads.findPath(fromId, toId, { preferRoads: true, allowWater: false, maxCost: 400 });
    points = this.pointsFor(ids || [fromId, toId]);
    if (points.length < 2) {
      const tile = this.hexMap.getTile(toId) || this.hexMap.getTile(fromId);
      const c = tile ? this.center(tile) : { x: 0, y: 0 };
      points = [{ x: c.x, y: c.y, road: false }, { x: c.x, y: c.y, road: false }];
    }
    if (this.pathCache.size >= PATH_CACHE_MAX) this.pathCache.clear();
    this.pathCache.set(key, points);
    return points;
  }

  // A one-hop path from where the agent stands to a point, on the agent's
  // own two waypoints so nothing shared is written to.
  hop(agent, x, y, state) {
    const pts = agent.pts;
    pts[0].x = agent.x; pts[0].y = agent.y;
    pts[1].x = x; pts[1].y = y;
    agent.path = pts;
    agent.pathIndex = 1;
    agent.pathDir = 1;
    agent.state = state || "walk";
  }

  // Sets an agent walking along `points`, forwards or backwards.
  follow(agent, points, dir, state) {
    agent.path = points;
    agent.pathDir = dir;
    agent.pathIndex = dir > 0 ? 1 : points.length - 2;
    if (points.length < 2) agent.pathIndex = 0;
    agent.state = state || "walk";
  }

  // Moves an agent along its path. Returns true on arrival at the last waypoint.
  moveAlong(agent, dt) {
    const path = agent.path;
    if (!path || !path.length) return true;
    let budget = agent.speed * dt;
    // A fast agent may pass several waypoints in one frame.
    for (let guard = 0; guard < 8 && budget > 0; guard++) {
      if (agent.pathIndex < 0 || agent.pathIndex >= path.length) return true;
      const target = path[agent.pathIndex];
      const dx = target.x - agent.x;
      const dy = target.y - agent.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(dx) > 0.05) agent.facing = dx < 0 ? -1 : 1;
      // Carts slow down when the next hex has no road under it.
      if (agent.kind === "cart") agent.speed = target.road ? SPEED.cart : SPEED.cartOffRoad;
      if (distance <= budget) {
        agent.x = target.x;
        agent.y = target.y;
        agent.phase = (agent.phase + distance / STRIDE) % 1;
        budget -= distance;
        agent.pathIndex += agent.pathDir;
        if (agent.pathIndex < 0 || agent.pathIndex >= path.length) return true;
      } else {
        const k = budget / distance;
        agent.x += dx * k;
        agent.y += dy * k;
        agent.phase = (agent.phase + budget / STRIDE) % 1;
        budget = 0;
      }
    }
    return false;
  }

  // ---- Cached lookups ---------------------------------------------------------------

  refreshSites() {
    this.sitesDirty = false;
    this.playerSites.length = 0;
    this.playerSchools.length = 0;
    if (!this.improvements) return;
    for (const entry of this.improvements.listFor("player")) {
      const tile = this.hexMap.getTile(entry.tileId);
      if (!tile) continue;
      const c = this.center(tile);
      if (entry.kind === "site") {
        this.playerSites.push({ tileId: tile.id, tile, type: entry.type, yields: entry.yields, x: c.x, y: c.y });
      } else if (entry.type === "school") {
        this.playerSchools.push({ tileId: tile.id, tile, x: c.x, y: c.y });
      }
    }
    // Same order every time, so cart i always serves the same site.
    this.playerSites.sort((a, b) => a.tile.index - b.tile.index);
  }

  refreshLand() {
    this.landDirty = false;
    const home = this.homeTile();
    this.borderTiles.length = 0;
    this.frontierTiles.length = 0;
    this.workTiles.length = 0;
    if (!home) return;
    const owned = this.hexMap.getTilesOwnedBy("player");
    for (const tile of owned) {
      if (isWaterTerrain(tile.terrainType)) continue;
      let border = false;
      for (const neighbor of tile.neighbors) {
        if (neighbor.owner !== "player") {
          border = true;
          if (!neighbor.owner && !isWaterTerrain(neighbor.terrainType) && this.frontierTiles.length < 60) this.frontierTiles.push(neighbor);
        }
      }
      if (border) this.borderTiles.push(tile);
      if (tile !== home && hasResources(tile) && this.workTiles.length < 80) this.workTiles.push(tile);
    }
  }

  // ---- Population ------------------------------------------------------------------

  syncPopulation({ humans, soldiers, trades, season }) {
    this.population = { humans: humans || 0, soldiers: soldiers || 0, trades: trades || {}, season: season || 1 };
    this.season = season || 1;
    const home = this.homeTile();
    if (!home) return;
    const hc = this.center(home);

    // Villagers: one figure per human, within the quality budget.
    const wantVillagers = Math.max(0, Math.min(humans || 0, Math.floor(this.maxAgents() / 3), MAX_VILLAGERS));
    const roster = [];
    for (const trade of ["forester", "mason", "farmer", "scholar", "scout"]) {
      const n = Math.min((trades && trades[trade]) || 0, 3);
      for (let i = 0; i < n && roster.length < wantVillagers; i++) roster.push(trade);
    }
    while (roster.length < wantVillagers) roster.push("carrier");
    while (this.villagers.length > wantVillagers) {
      const agent = this.villagers.pop();
      this.release(agent);
    }
    while (this.villagers.length < wantVillagers) {
      const p = this.jitter(hc.x, hc.y, 0.8);
      const agent = this.acquire("villager", "carrier", p.x, p.y);
      agent.group = "villager";
      agent.homeX = hc.x; agent.homeY = hc.y;
      agent.speed = agent.baseSpeed = SPEED.villager * (0.85 + this.random() * 0.3);
      agent.mode = "home";
      this.villagers.push(agent);
      this.people.push(agent);
    }
    // Trades are handed out in roster order; a re-trained figure changes
    // its coat where it stands rather than walking home to do it.
    for (let i = 0; i < this.villagers.length; i++) this.villagers[i].variant = roster[i];

    // Soldiers.
    const wantSoldiers = Math.max(0, Math.min(soldiers || 0, MAX_SOLDIERS));
    while (this.soldiers.length > wantSoldiers) this.release(this.soldiers.pop());
    while (this.soldiers.length < wantSoldiers) {
      const p = this.jitter(hc.x, hc.y, 0.6);
      const agent = this.acquire("soldier", null, p.x, p.y);
      agent.group = "soldier";
      agent.homeX = hc.x; agent.homeY = hc.y;
      agent.mode = "rest";
      this.soldiers.push(agent);
      this.people.push(agent);
    }

    // Townsfolk: whoever is at the well, minding a stall, by the fire.
    const population = (humans || 0) + (soldiers || 0);
    const wantTownsfolk = clamp(Math.floor(population / 2), 3, 5);
    while (this.townsfolk.length > wantTownsfolk) this.release(this.townsfolk.pop());
    const TOWN_TRADES = ["carrier", "farmer", "scholar", "carrier", "forester"];
    while (this.townsfolk.length < wantTownsfolk) {
      const p = this.jitter(hc.x, hc.y, 0.9);
      const agent = this.acquire("villager", TOWN_TRADES[this.townsfolk.length % TOWN_TRADES.length], p.x, p.y);
      agent.group = "townsfolk";
      agent.homeX = hc.x; agent.homeY = hc.y;
      agent.speed = agent.baseSpeed = SPEED.townsfolk;
      this.townsfolk.push(agent);
    }

    this.syncWorkers();
    this.syncNeighbours();
  }

  // Carts and boats follow the work sites, not the head count.
  syncWorkers() {
    if (this.sitesDirty) this.refreshSites();
    const home = this.homeTile();
    if (!home) return;
    const hc = this.center(home);
    const sites = this.playerSites;

    const wantCarts = Math.min(MAX_CARTS, Math.floor(sites.length / 2), Math.max(0, Math.floor(this.maxAgents() / 8)));
    while (this.carts.length > wantCarts) this.release(this.carts.pop());
    while (this.carts.length < wantCarts) {
      const p = this.jitter(hc.x, hc.y, 0.7);
      const agent = this.acquire("cart", null, p.x, p.y);
      agent.group = "cart";
      agent.homeX = hc.x; agent.homeY = hc.y;
      agent.siteIndex = this.carts.length * 2;
      agent.mode = "home";
      agent.timer = 0.5 + this.random() * 2;
      this.carts.push(agent);
    }

    // One boat per fishery, on the water beside it.
    const fisheries = sites.filter((site) => site.type === "fishery");
    const wantBoats = Math.min(MAX_BOATS, fisheries.length);
    while (this.boats.length > wantBoats) this.release(this.boats.pop());
    for (let i = 0; i < wantBoats; i++) {
      const water = this.waterNeighbor(fisheries[i].tile);
      if (!water) continue;
      const wc = this.center(water);
      if (i < this.boats.length) {
        // Same slot, possibly a different fishery: sail over rather than jump.
        const boat = this.boats[i];
        if (boat.data !== water) { boat.data = water; boat.homeX = wc.x; boat.homeY = wc.y; this.hop(boat, wc.x, wc.y, "sail"); }
        continue;
      }
      const agent = this.acquire("boat", null, wc.x, wc.y);
      agent.group = "boat";
      agent.homeX = wc.x; agent.homeY = wc.y;
      agent.data = water;
      agent.mode = "moored";
      agent.timer = 1 + this.random() * 3;
      this.boats.push(agent);
    }
  }

  waterNeighbor(tile) {
    let best = null;
    for (const neighbor of tile.neighbors) {
      if (!isWaterTerrain(neighbor.terrainType)) continue;
      if (!best || neighbor.terrainType === "shallows" || neighbor.terrainType === "lake") best = neighbor;
    }
    return best;
  }

  villageHomeRevealed(villageId) {
    const village = (this.world.villages || []).find((v) => v.id === villageId);
    return !!(village && this.hexMap.isRevealed(village.homeTileId));
  }

  // Caravans on the trade routes, ships on the sea lanes and the figures in
  // the rival villages, all of which appear as the fog lifts.
  syncNeighbours() {
    this.revealDirty = false;
    const routes = this.world.tradeRoutes || [];
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const known = route.tileIds && route.tileIds.length >= 2 && this.villageHomeRevealed(route.from) && this.villageHomeRevealed(route.to);
      const existing = this.caravans.get(i);
      if (!known) {
        if (existing) { this.release(existing); this.caravans.delete(i); }
        continue;
      }
      if (existing) continue;
      let points = this.routePoints.get(i);
      if (!points) { points = this.pointsFor(route.tileIds); this.routePoints.set(i, points); }
      if (points.length < 2) continue;
      const agent = this.acquire("cart", null, points[0].x, points[0].y);
      agent.group = "caravan";
      agent.data = points;
      agent.carrying = "food";
      agent.mode = "out";
      agent.timer = this.random() * 2;
      this.caravans.set(i, agent);
    }

    const lanes = this.world.seaLanes || [];
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      const known = lane.tileIds && lane.tileIds.length >= 2 && this.villageHomeRevealed(lane.from) && this.villageHomeRevealed(lane.to);
      const existing = this.ships.get(i);
      if (!known) {
        if (existing) { this.release(existing); this.ships.delete(i); }
        continue;
      }
      if (existing) continue;
      let points = this.lanePoints.get(i);
      if (!points) { points = this.pointsFor(lane.tileIds); this.lanePoints.set(i, points); }
      if (points.length < 2) continue;
      const agent = this.acquire("tradeship", null, points[0].x, points[0].y);
      agent.group = "ship";
      agent.data = points;
      agent.mode = "out";
      agent.timer = this.random() * 3;
      this.ships.set(i, agent);
    }

    for (const village of this.world.villages || []) {
      if (village.kind === "player") continue;
      const tile = this.hexMap.getTile(village.homeTileId);
      const known = tile && this.hexMap.isRevealed(tile.id);
      const existing = this.rivals.get(village.id);
      if (!known) {
        if (existing) { this.releaseAll(existing); this.rivals.delete(village.id); }
        continue;
      }
      if (existing) continue;
      const list = [];
      const c = this.center(tile);
      const count = 2 + (village.kind === "garlock" ? 1 : ((tile.detailSeed >>> 0) % 2));
      const tint = colorToNumber(village.color);
      for (let i = 0; i < count; i++) {
        const p = this.jitter(c.x, c.y, 1.0);
        const agent = village.kind === "garlock"
          ? this.acquire("garlock", null, p.x, p.y)
          : this.acquire("villager", i === 1 ? "farmer" : "carrier", p.x, p.y);
        agent.group = "rival";
        agent.homeX = c.x; agent.homeY = c.y;
        agent.speed = agent.baseSpeed = SPEED.townsfolk;
        if (village.kind !== "garlock") agent.tint = tint;
        list.push(agent);
      }
      this.rivals.set(village.id, list);
    }
  }

  // ---- Ambient life per chunk -------------------------------------------------------

  // Which chunks the view covers, with `margin` chunks around it.
  chunkRange(bounds, margin, out) {
    const ox = this.grid.originX;
    const oy = this.grid.originY;
    out.cx0 = clamp(Math.floor((bounds.minX - ox) / this.chunkWidth) - margin, 0, this.chunkCols - 1);
    out.cx1 = clamp(Math.floor((bounds.maxX - ox) / this.chunkWidth) + margin, 0, this.chunkCols - 1);
    out.cy0 = clamp(Math.floor((bounds.minY - oy) / this.chunkHeight) - margin, 0, this.chunkRows - 1);
    out.cy1 = clamp(Math.floor((bounds.maxY - oy) / this.chunkHeight) + margin, 0, this.chunkRows - 1);
    return out;
  }

  manageChunks(bounds) {
    const range = this.chunkRange(bounds, 1, this.viewRange);
    // Despawn what is now more than two chunks off screen, or has gone stale.
    for (const [index, list] of this.chunks) {
      const cx = index % this.chunkCols;
      const cy = Math.floor(index / this.chunkCols);
      const far = cx < range.cx0 - 1 || cx > range.cx1 + 1 || cy < range.cy0 - 1 || cy > range.cy1 + 1;
      if (far || this.staleChunks.has(index)) {
        this.releaseAll(list);
        this.chunks.delete(index);
      }
    }
    this.staleChunks.clear();
    // Spawn what has come into view.
    for (let cy = range.cy0; cy <= range.cy1; cy++) {
      for (let cx = range.cx0; cx <= range.cx1; cx++) {
        const index = cy * this.chunkCols + cx;
        if (!this.chunks.has(index)) this.spawnChunk(cx, cy, index);
      }
    }
  }

  spawnChunk(cx, cy, index) {
    const list = [];
    this.chunks.set(index, list);
    const cap = this.ambientCap();
    if (cap <= 0) return;
    // Seeded by chunk and world, so the same wood has the same deer.
    const rng = createRandom(((this.world.seed >>> 0) ^ Math.imul(index + 1, 2654435761)) >>> 0);
    const map = this.hexMap;
    const cols = this.world.cols;
    const rows = this.world.rows;
    const attempts = cap * 3;
    let anyRevealed = false;
    for (let attempt = 0; attempt < attempts && list.length < cap; attempt++) {
      const col = cx * CHUNK_SIZE + Math.floor(rng() * CHUNK_SIZE);
      const row = cy * CHUNK_SIZE + Math.floor(rng() * CHUNK_SIZE);
      const roll = rng();
      if (col >= cols || row >= rows) continue;
      const tile = map.allTiles[row * cols + col];
      if (!tile || !map.isRevealed(tile.id)) continue;
      anyRevealed = true;
      if (this.agents.length >= this.maxAgents()) break;
      const kind = this.animalFor(tile.terrainType, roll);
      if (!kind) continue;
      const c = this.center(tile);
      const p = this.jitter(c.x, c.y, 0.6);
      const agent = this.acquire(kind, null, p.x, p.y);
      agent.group = "ambient";
      agent.chunk = index;
      agent.habitat = HABITAT[kind];
      agent.data = tile;
      agent.homeX = c.x; agent.homeY = c.y;
      agent.mode = kind === "fish" ? "swim" : "graze";
      agent.timer = 0.5 + rng() * 4;
      agent.facing = rng() < 0.5 ? -1 : 1;
      list.push(agent);
    }
    // A bird or two over anything the player has seen.
    if (anyRevealed && rng() < 0.55 && this.agents.length < this.maxAgents()) {
      const x = this.grid.originX + (cx + rng()) * this.chunkWidth;
      const y = this.grid.originY + (cy + rng()) * this.chunkHeight;
      const agent = this.acquire("bird", null, this.clampX(x), this.clampY(y));
      agent.group = "ambient";
      agent.chunk = index;
      agent.homeX = agent.x; agent.homeY = agent.y;
      agent.mode = "fly";
      this.flyOn(agent, rng);
      list.push(agent);
    }
  }

  animalFor(terrain, roll) {
    if (FOREST.includes(terrain)) return terrain === "taiga" && roll < 0.35 ? "wolf" : roll < 0.65 ? "deer" : "boar";
    if (terrain === "flowerMeadow" || terrain === "plains") return roll < 0.75 ? "sheep" : null;
    if (terrain === "tundra" || terrain === "snowfield") return roll < 0.5 ? "wolf" : null;
    if (terrain === "marsh") return "heron";
    if (terrain === "lake" || terrain === "shallows") return roll < 0.7 ? "fish" : null;
    return null;
  }

  clampX(x) { return clamp(x, 40, this.world.width - 40); }
  clampY(y) { return clamp(y, 40, this.world.height - 40); }

  // A long lazy flight from where the bird is, staying within a couple of
  // chunks of where it was spawned and inside the world.
  flyOn(agent, rng) {
    const random = rng || this.random;
    const angle = random() * Math.PI * 2;
    const length = 500 + random() * 700;
    let tx = agent.x + Math.cos(angle) * length;
    let ty = agent.y + Math.sin(angle) * length * 0.6;
    // Drift back towards home so a bird never leaves its chunk for good.
    tx = tx * 0.7 + agent.homeX * 0.3;
    ty = ty * 0.7 + agent.homeY * 0.3;
    this.hop(agent, this.clampX(tx), this.clampY(ty), "fly");
  }

  // ---- Events from the rules -------------------------------------------------------

  onEvent(event) {
    if (!event) return;
    const home = this.homeTile();
    if (!home) return;
    switch (event.kind) {
      case "claim":
      case "seize":
        this.startExpedition(home, event.tileId);
        break;
      case "raid":
        this.startWarband(home, event.fromVillageId, !!event.repelled);
        break;
      case "gather": {
        // Somebody near the hall is seen bringing the load in.
        const icon = YIELD_ICON[event.type] || null;
        if (!icon) break;
        const pool = this.villagers.length ? this.villagers : this.townsfolk;
        for (const agent of pool) {
          if (agent.state !== "idle") continue;
          agent.carrying = icon;
          agent.carryUntil = this.time + 2.5;
          break;
        }
        break;
      }
      case "trade":
        this.startTradeCarts(home, event.partners || []);
        break;
      default:
        break;
    }
  }

  // Three villagers and a soldier walk out to the new land and back.
  startExpedition(home, tileId) {
    const target = this.hexMap.getTile(tileId);
    if (!target) return;
    const points = this.getPath(home.id, target.id);
    for (let i = 0; i < 4; i++) {
      const agent = this.acquire(i === 3 ? "soldier" : "villager", i === 3 ? null : "carrier", points[0].x, points[0].y);
      agent.group = "event";
      agent.mode = "expedition-wait";
      agent.data = points;
      agent.speed = agent.baseSpeed = 30 * (0.94 + i * 0.04);
      agent.timer = i * 0.35;
      this.events.push(agent);
      this.people.push(agent);
    }
  }

  // Five garlocks from their camp to the hall in about six seconds, then gone.
  startWarband(home, fromVillageId, repelled) {
    const camp = this.hexMap.homeTileOf(fromVillageId) ||
      (() => { const v = (this.world.villages || []).find((x) => x.id === fromVillageId); return v ? this.hexMap.getTile(v.homeTileId) : null; })();
    if (!camp) return;
    const ids = this.roads.findPath(camp.id, home.id, { preferRoads: true, allowWater: false, maxCost: 900 });
    const points = this.pointsFor(ids || [camp.id, home.id]);
    if (points.length < 2) return;
    let length = 0;
    for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const speed = Math.max(SPEED.garlock, length / 6);
    for (let i = 0; i < 5; i++) {
      const p = this.jitter(points[0].x, points[0].y, 0.6);
      const agent = this.acquire("garlock", null, p.x, p.y);
      agent.group = "event";
      agent.mode = repelled ? "warband-repelled" : "warband";
      agent.data = points;
      agent.speed = agent.baseSpeed = speed * (0.96 + i * 0.02);
      agent.timer = i * 0.15;
      this.events.push(agent);
    }
  }

  // A cart to each trading partner's hall and back.
  startTradeCarts(home, partners) {
    let started = 0;
    for (const partnerId of partners) {
      if (started >= MAX_TRADE_CARTS) break;
      const hall = this.hexMap.homeTileOf(partnerId);
      if (!hall || !this.hexMap.isRevealed(hall.id)) continue;
      const ids = this.roads.findPath(home.id, hall.id, { preferRoads: true, allowWater: false, maxCost: 600 });
      if (!ids) continue;
      const points = this.pointsFor(ids);
      const agent = this.acquire("cart", null, points[0].x, points[0].y);
      agent.group = "event";
      agent.mode = "trade-out";
      agent.data = points;
      agent.carrying = "wood";
      agent.timer = started * 0.6;
      this.events.push(agent);
      started++;
    }
  }

  // ---- The frame -------------------------------------------------------------------

  update(dt, viewBounds) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.time += dt;

    if (this.pathsDirty) { this.pathCache.clear(); this.pathsDirty = false; }
    if (this.sitesDirty) { this.refreshSites(); this.syncWorkers(); }
    if (this.landDirty) this.refreshLand();

    this.resyncTimer -= dt;
    if (this.revealDirty && this.resyncTimer <= 0) {
      this.resyncTimer = 1.5;
      this.syncNeighbours();
    }

    const bounds = viewBounds || { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };
    this.chunkTimer -= dt;
    if (this.chunkTimer <= 0 || this.staleChunks.size) {
      this.chunkTimer = 0.25;
      if (viewBounds) this.manageChunks(viewBounds);
    }

    // Two chunks of margin: an agent just off screen keeps walking so it
    // does not freeze mid-stride and pop when the camera pans back.
    const mx = 2 * this.chunkWidth;
    const my = 2 * this.chunkHeight;
    const minX = bounds.minX - mx, maxX = bounds.maxX + mx;
    const minY = bounds.minY - my, maxY = bounds.maxY + my;

    let active = 0;
    const agents = this.agents;
    // Index loop, because a step may release an agent (swap-remove).
    for (let i = agents.length - 1; i >= 0; i--) {
      const agent = agents[i];
      if (!agent) continue;
      if (agent.group !== "event" && (agent.x < minX || agent.x > maxX || agent.y < minY || agent.y > maxY)) continue;
      active++;
      this.step(agent, dt);
    }
    this.activeCount = active;
  }

  step(agent, dt) {
    if (agent.carryUntil && this.time > agent.carryUntil) {
      agent.carryUntil = 0;
      if (agent.state === "idle") agent.carrying = null;
    }
    if (agent.group === "ambient" && agent.kind !== "bird" && agent.kind !== "fish") this.checkFlee(agent, dt);

    if (agent.state === "walk" || agent.state === "sail" || agent.state === "fly") {
      if (this.moveAlong(agent, dt)) this.onArrive(agent);
    } else {
      agent.timer -= dt;
      if (agent.timer <= 0) this.onTimer(agent);
    }
    agent.z = agent.y;
  }

  // ---- Behaviour: what to do when a timer runs out ------------------------------

  onTimer(agent) {
    switch (agent.group) {
      case "villager": return this.villagerTimer(agent);
      case "soldier": return this.soldierTimer(agent);
      case "townsfolk":
      case "rival": return this.millAbout(agent, 0.9, 1 + this.random() * 3);
      case "cart": return this.cartTimer(agent);
      case "caravan": return this.shuttleTimer(agent, "food", "wood");
      case "ship": return this.shuttleTimer(agent, null, null);
      case "boat": return this.boatTimer(agent);
      case "ambient": return this.ambientTimer(agent);
      case "event": return this.eventTimer(agent);
      default: agent.timer = 1;
    }
  }

  onArrive(agent) {
    switch (agent.group) {
      case "villager": return this.villagerArrive(agent);
      case "soldier": agent.state = "idle"; agent.timer = 1 + this.random() * 2; return;
      case "townsfolk":
      case "rival": agent.state = "idle"; agent.timer = 1 + this.random() * 3; return;
      case "cart": return this.cartArrive(agent);
      case "caravan":
      case "ship": agent.state = "idle"; agent.timer = 2 + this.random() * 2; return;
      case "boat": agent.state = "idle"; agent.mode = "moored"; agent.timer = 2 + this.random() * 4; return;
      case "ambient": return this.ambientArrive(agent);
      case "event": return this.eventArrive(agent);
      default: agent.state = "idle"; agent.timer = 1;
    }
  }

  // A short walk to somewhere near home, then a pause.
  millAbout(agent, spread, pause) {
    const p = this.jitter(agent.homeX, agent.homeY, spread);
    this.hop(agent, p.x, p.y, "walk");
    agent.data = pause;
  }

  villagerTimer(agent) {
    if (agent.mode === "working") {
      // Done: pick up the load and head home along the same road.
      agent.carrying = agent.yieldType;
      agent.mode = "toHome";
      if (agent.path && agent.path.length > 1 && agent.path !== agent.pts) this.follow(agent, agent.path, -1, "walk");
      else this.hop(agent, agent.homeX, agent.homeY, "walk");
      return;
    }
    // At home: where to now?
    const home = this.homeTile();
    if (!home) { agent.timer = 2; return; }
    const target = this.pickWorkplace(agent);
    if (!target) {
      // Nothing to do out there: hang about the square.
      agent.mode = "home";
      this.millAbout(agent, 0.8, 1 + this.random() * 2.5);
      return;
    }
    agent.yieldType = target.yields || null;
    agent.mode = "toWork";
    const points = this.getPath(home.id, target.tileId);
    // Walk to the hall centre first only if far from it; usually we are
    // standing beside it and can join the road at once.
    this.follow(agent, points, 1, "walk");
  }

  villagerArrive(agent) {
    if (agent.mode === "toWork") {
      agent.state = "work";
      agent.mode = "working";
      agent.timer = 2 + this.random() * 2;
      return;
    }
    if (agent.mode === "toHome") {
      agent.carrying = null;
      agent.mode = "home";
      // Step off the road into the square so the hall is not a queue.
      this.millAbout(agent, 0.7, 0.5 + this.random() * 2);
      return;
    }
    // Finished a stroll about the square.
    agent.state = "idle";
    agent.timer = typeof agent.data === "number" ? agent.data : 1 + this.random() * 2;
  }

  // Where a villager of this trade goes to work: a site of their trade,
  // failing that a tile of their trade's ground, failing that nowhere.
  pickWorkplace(agent) {
    const trade = agent.variant || "carrier";
    if (trade === "scholar") {
      if (this.playerSchools.length) {
        const school = this.playerSchools[Math.floor(this.random() * this.playerSchools.length)];
        return { tileId: school.tileId, yields: null };
      }
      return null;
    }
    if (trade === "scout") {
      if (!this.frontierTiles.length) return null;
      const tile = this.frontierTiles[Math.floor(this.random() * this.frontierTiles.length)];
      return { tileId: tile.id, yields: null };
    }
    if (this.season === 4 && trade === "farmer") return null;      // nothing grows
    const types = TRADE_SITES[trade] || TRADE_SITES.carrier;
    let count = 0;
    let chosen = null;
    // Reservoir pick among suitable sites: no filtered array per call.
    for (const site of this.playerSites) {
      if (!types.includes(site.type)) continue;
      count++;
      if (this.random() * count < 1) chosen = site;
    }
    if (chosen) return chosen;
    const ground = WORKPLACES[trade] || null;
    count = 0;
    let tile = null;
    for (const candidate of this.workTiles) {
      if (ground && !ground.includes(candidate.terrainType)) continue;
      count++;
      if (this.random() * count < 1) tile = candidate;
    }
    if (!tile && !ground && this.workTiles.length) tile = this.workTiles[Math.floor(this.random() * this.workTiles.length)];
    if (!tile) return null;
    const yields = tile.resources.wood && tile.resources.wood.amount > 0 && trade === "forester" ? "wood"
      : tile.resources.stone && tile.resources.stone.amount > 0 && trade === "mason" ? "stone"
      : "food";
    return { tileId: tile.id, yields };
  }

  soldierTimer(agent) {
    const pool = this.borderTiles;
    const from = this.tileAt(agent.x, agent.y) || this.homeTile();
    if (!pool.length || !from) {
      this.millAbout(agent, 0.6, 1 + this.random() * 2);
      return;
    }
    const target = pool[Math.floor(this.random() * pool.length)];
    if (target.id === from.id) {
      this.millAbout(agent, 0.5, 1 + this.random() * 2);
      return;
    }
    this.follow(agent, this.getPath(from.id, target.id), 1, "walk");
  }

  cartTimer(agent) {
    const sites = this.playerSites;
    if (!sites.length) { agent.timer = 2; return; }
    const home = this.homeTile();
    if (!home) { agent.timer = 2; return; }
    if (agent.mode === "atSite") {
      const site = sites[agent.siteIndex % sites.length];
      agent.carrying = site.yields || "food";
      agent.mode = "toHome";
      this.follow(agent, this.getPath(home.id, site.tileId), -1, "walk");
      return;
    }
    // At the hall: off to our site.
    const site = sites[agent.siteIndex % sites.length];
    agent.mode = "toSite";
    this.follow(agent, this.getPath(home.id, site.tileId), 1, "walk");
  }

  cartArrive(agent) {
    if (agent.mode === "toSite") {
      agent.state = "idle";
      agent.mode = "atSite";
      agent.timer = 1.5;
      return;
    }
    agent.carrying = null;
    agent.state = "idle";
    agent.mode = "home";
    agent.timer = 1 + this.random() * 1.5;
  }

  // Caravans and ships: end to end and back, forever.
  shuttleTimer(agent, outLoad, backLoad) {
    const points = agent.data;
    if (!points || points.length < 2) { agent.timer = 3; return; }
    if (agent.mode === "out") {
      agent.carrying = outLoad;
      this.follow(agent, points, 1, agent.kind === "tradeship" ? "sail" : "walk");
      agent.mode = "back";
    } else {
      agent.carrying = backLoad;
      this.follow(agent, points, -1, agent.kind === "tradeship" ? "sail" : "walk");
      agent.mode = "out";
    }
  }

  // Fishing boats: a short trip to a neighbouring patch of water and back.
  boatTimer(agent) {
    const here = this.tileAt(agent.x, agent.y);
    const water = here && isWaterTerrain(here.terrainType) ? here : agent.data;
    if (!water) { agent.timer = 3; return; }
    let count = 0;
    let target = null;
    for (const neighbor of water.neighbors) {
      if (!isWaterTerrain(neighbor.terrainType)) continue;
      count++;
      if (this.random() * count < 1) target = neighbor;
    }
    // Never drift far from the fishery: head home every other trip.
    if (!target || agent.mode === "away") {
      agent.mode = "moored";
      this.hop(agent, agent.homeX, agent.homeY, "sail");
      return;
    }
    const c = this.center(target);
    const p = this.jitter(c.x, c.y, 0.4);
    agent.mode = "away";
    this.hop(agent, p.x, p.y, "sail");
  }

  ambientTimer(agent) {
    const kind = agent.kind;
    if (kind === "bird") { this.flyOn(agent); return; }
    if (kind === "fish") {
      // A jump (the unit layer bobs a "working" fish) every few seconds.
      if (agent.state === "work") { agent.state = "idle"; agent.timer = 3 + this.random() * 5; }
      else { agent.state = "work"; agent.timer = 0.6; }
      return;
    }
    agent.speed = agent.baseSpeed;
    agent.mode = "graze";
    // Wander to a neighbouring hex of the same habitat, or about this one.
    const tile = agent.data;
    let target = tile;
    if (tile && this.random() < 0.6) {
      let count = 0;
      for (const neighbor of tile.neighbors) {
        if (!agent.habitat || !agent.habitat.includes(neighbor.terrainType)) continue;
        if (!this.hexMap.isRevealed(neighbor.id)) continue;
        count++;
        if (this.random() * count < 1) target = neighbor;
      }
    }
    if (!target) { agent.timer = 2; return; }
    agent.data = target;
    const c = this.center(target);
    const p = this.jitter(c.x, c.y, 0.7);
    this.hop(agent, p.x, p.y, "walk");
  }

  ambientArrive(agent) {
    if (agent.kind === "bird") { this.flyOn(agent); return; }
    agent.state = "idle";
    agent.speed = agent.baseSpeed;
    agent.timer = agent.kind === "heron" ? 4 + this.random() * 6 : 1 + this.random() * 5;
    if (agent.mode === "flee") agent.mode = "graze";
  }

  // Deer, boar, sheep and wolves bolt when a person comes within three
  // hexes. Checked a few times a second, not every frame.
  checkFlee(agent, dt) {
    agent.fleeTimer -= dt;
    if (agent.fleeTimer > 0) return;
    agent.fleeTimer = FLEE_CHECK_SECONDS;
    if (agent.mode === "flee") return;
    const people = this.people;
    for (let i = 0; i < people.length; i++) {
      const person = people[i];
      const dx = agent.x - person.x;
      const dy = agent.y - person.y;
      if (dx * dx + dy * dy > FLEE_RADIUS * FLEE_RADIUS) continue;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const run = 2 * this.hexWidth;
      agent.mode = "flee";
      agent.speed = agent.baseSpeed * 2.2;
      this.hop(agent, this.clampX(agent.x + (dx / distance) * run), this.clampY(agent.y + (dy / distance) * run), "walk");
      return;
    }
  }

  // ---- Processions -----------------------------------------------------------------

  eventTimer(agent) {
    const points = agent.data;
    switch (agent.mode) {
      case "expedition-wait":
        agent.mode = "expedition-out";
        this.follow(agent, points, 1, "walk");
        break;
      case "expedition-there":
        agent.mode = "expedition-back";
        this.follow(agent, points, -1, "walk");
        break;
      case "warband":
      case "warband-repelled":
        agent.mode = agent.mode === "warband" ? "warband-march" : "warband-march-repelled";
        this.follow(agent, points, 1, "walk");
        break;
      case "warband-arrived":
        this.removeEvent(agent);
        break;
      case "warband-flee":
        agent.mode = "warband-gone";
        this.follow(agent, points, -1, "walk");
        agent.speed = agent.baseSpeed * 1.2;
        agent.timer = 1.5;
        break;
      case "trade-out":
        agent.mode = "trade-going";
        this.follow(agent, points, 1, "walk");
        break;
      case "trade-there":
        agent.carrying = "food";
        agent.mode = "trade-back";
        this.follow(agent, points, -1, "walk");
        break;
      default:
        this.removeEvent(agent);
    }
  }

  eventArrive(agent) {
    switch (agent.mode) {
      case "expedition-out":
        agent.mode = "expedition-there";
        agent.state = "idle";
        agent.timer = 1.2;
        break;
      case "warband-march":
        agent.mode = "warband-arrived";
        agent.state = "work";                 // hacking at the barns
        agent.timer = 1.5;
        break;
      case "warband-march-repelled":
        agent.mode = "warband-flee";
        agent.state = "idle";
        agent.timer = 0.6;
        break;
      case "trade-going":
        agent.mode = "trade-there";
        agent.state = "idle";
        agent.carrying = null;
        agent.timer = 1.5;
        break;
      case "warband-gone":
      case "expedition-back":
      case "trade-back":
      default:
        this.removeEvent(agent);
    }
  }

  removeEvent(agent) {
    const index = this.events.indexOf(agent);
    if (index >= 0) this.events.splice(index, 1);
    this.release(agent);
  }

  // ---- Output ----------------------------------------------------------------------

  // Agents inside the view, in one reused array. A small margin keeps a
  // sprite whose feet are just off screen from popping.
  getRenderList(viewBounds) {
    const list = this.renderList;
    list.length = 0;
    const margin = 48;
    const minX = viewBounds.minX - margin, maxX = viewBounds.maxX + margin;
    const minY = viewBounds.minY - margin, maxY = viewBounds.maxY + margin;
    const agents = this.agents;
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      if (agent.x < minX || agent.x > maxX || agent.y < minY || agent.y > maxY) continue;
      agent.z = agent.y;
      list.push(agent);
    }
    return list;
  }

  get counts() {
    return { total: this.agents.length, active: this.activeCount };
  }
}
