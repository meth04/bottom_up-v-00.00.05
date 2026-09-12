// unitLayer.js (ES module)
//
// Draws AgentSim's render list: every villager, cart, boat, deer and bird
// that is on screen this frame, as one sprite each (plus a soft shadow and,
// for anyone carrying something, a little icon over their head).
//
// The simulation owns the movement; this layer only decides how a record
// like { kind: "villager", variant: "forester", state: "walk", phase: 0.3 }
// looks. Sprites are pooled per agent id so a villager walking across the
// screen keeps the same sprite from one frame to the next, and anything
// that left the view is recycled rather than destroyed.
//
// Two things keep the map alive at a distance: below ZOOM_FAR the whole
// layer is hidden (a figure would be a pixel), and between there and zoom
// 1 every figure is scaled UP just enough to stay six pixels tall, so the
// roads still visibly carry traffic when the player pulls back.

import { ZOOM_FAR } from "../world/constants.js";

// Nominal sprite heights in world units (see the atlas table), used to keep
// figures legible when zoomed out and to hang the carry icon at head height.
const NOMINAL_HEIGHT = {
  villager: 16, soldier: 16, garlock: 16, cart: 12, boat: 10, tradeship: 16,
  deer: 10, boar: 10, sheep: 10, wolf: 10, bird: 6, heron: 12, fish: 6,
};
const MIN_PIXEL_HEIGHT = 6;
const MAX_COUNTER_SCALE = 4;

// Things that cast no shadow on the ground: they are in the air or on water.
const NO_SHADOW = new Set(["bird", "fish", "boat", "tradeship"]);
// Things that rock instead of walk.
const ROCKING = new Set(["boat", "tradeship"]);

export class UnitLayer {
  constructor(PIXI, atlas, quality) {
    this.PIXI = PIXI;
    this.atlas = atlas;
    this.quality = quality || {};
    this.container = new PIXI.Container();
    this.container.sortableChildren = true;
    this.entries = new Map();          // agent id -> { sprite, shadow, icon, stamp }
    this.free = [];
    this.textureCache = new Map();     // kind -> Map(variant -> [frame0, frame1])
    this.iconCache = new Map();        // carrying -> texture
    this.shadowTexture = null;
    this.time = 0;
    this.stamp = 0;
  }

  setQuality(quality) {
    this.quality = quality || this.quality;
  }

  // `unit/<kind>_<variant>_<frame>`, or `unit/<kind>_<frame>` for kinds
  // without a variant, falling back to frame 0 and then to the atlas's
  // own "missing" texture. Cached so no strings are built per frame.
  textureFor(kind, variant, frame) {
    let byKind = this.textureCache.get(kind);
    if (!byKind) { byKind = new Map(); this.textureCache.set(kind, byKind); }
    const variantKey = variant || "";
    let frames = byKind.get(variantKey);
    if (!frames) { frames = [undefined, undefined]; byKind.set(variantKey, frames); }
    let texture = frames[frame];
    if (texture === undefined) {
      const base = variantKey ? `unit/${kind}_${variantKey}` : `unit/${kind}`;
      const atlas = this.atlas;
      let key = `${base}_${frame}`;
      if (!atlas.has(key)) key = `${base}_0`;
      // A trade the atlas has no coat for walks as a carrier.
      if (!atlas.has(key) && variantKey) key = atlas.has(`unit/${kind}_carrier_${frame}`) ? `unit/${kind}_carrier_${frame}` : `unit/${kind}_carrier_0`;
      texture = atlas.texture(key);
      frames[frame] = texture;
    }
    return texture;
  }

  iconFor(carrying) {
    let texture = this.iconCache.get(carrying);
    if (!texture) {
      texture = this.atlas.texture(`ui/icon_${carrying}`);
      this.iconCache.set(carrying, texture);
    }
    return texture;
  }

  createEntry() {
    const PIXI = this.PIXI;
    const entry = this.free.pop();
    if (entry) return entry;
    const sprite = new PIXI.Sprite();
    sprite.anchor.set(0.5, 1);
    const shadow = new PIXI.Sprite(this.shadowTexture || (this.shadowTexture = this.atlas.texture("fx/shadow")));
    shadow.anchor.set(0.5, 0.5);
    shadow.alpha = 0.35;
    shadow.visible = false;
    const icon = new PIXI.Sprite();
    icon.anchor.set(0.5, 1);
    icon.visible = false;
    return { sprite, shadow, icon, stamp: 0, texture: null, iconKey: null, attached: false };
  }

  attach(entry) {
    if (entry.attached) return;
    this.container.addChild(entry.shadow, entry.sprite, entry.icon);
    entry.attached = true;
  }

  detach(entry) {
    if (!entry.attached) return;
    this.container.removeChild(entry.shadow, entry.sprite, entry.icon);
    entry.attached = false;
    entry.shadow.visible = false;
    entry.icon.visible = false;
    entry.iconKey = null;
  }

  update(agents, camera, dt) {
    this.time += dt || 0;
    const zoom = camera.zoom;
    const visible = zoom >= ZOOM_FAR;
    this.container.visible = visible;
    if (!visible) return;
    this.stamp++;
    const stamp = this.stamp;
    const shadows = this.quality.shadows !== false;
    const time = this.time;

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      let entry = this.entries.get(agent.id);
      if (!entry) {
        entry = this.createEntry();
        this.entries.set(agent.id, entry);
        this.attach(entry);
      }
      entry.stamp = stamp;
      const sprite = entry.sprite;
      const kind = agent.kind;
      const state = agent.state;
      const moving = state === "walk" || state === "sail" || state === "fly";

      // Frame: the walk cycle while moving (birds always beat their wings).
      const frame = moving ? (Math.floor(agent.phase * 2) % 2) : 0;
      const texture = this.textureFor(kind, agent.variant, frame);
      if (entry.texture !== texture) {
        sprite.texture = texture;
        entry.texture = texture;
      }

      // Counter-scale: never let a figure drop under six screen pixels.
      const height = NOMINAL_HEIGHT[kind] || 12;
      let scale = MIN_PIXEL_HEIGHT / (height * zoom);
      if (scale < 1) scale = 1;
      else if (scale > MAX_COUNTER_SCALE) scale = MAX_COUNTER_SCALE;
      sprite.scale.set(agent.facing < 0 ? -scale : scale, scale);

      // Position, with a bob for working and a lift for flying.
      let yOffset = 0;
      if (state === "work") {
        const bob = Math.abs(Math.sin(time * 8 + agent.id));
        yOffset = -bob * (kind === "fish" ? 7 : 1.6) * scale;
      }
      if (kind === "bird") yOffset -= (14 + Math.sin(time * 2 + agent.id) * 3) * scale;
      sprite.position.set(agent.x, agent.y + yOffset);
      sprite.zIndex = agent.z;
      sprite.rotation = ROCKING.has(kind) ? Math.sin(time * 2 + agent.id) * 0.06 : 0;
      sprite.tint = agent.tint == null ? 0xffffff : agent.tint;
      sprite.alpha = kind === "fish" && state !== "work" ? 0.7 : 1;

      // Shadow under land units.
      const shadow = entry.shadow;
      if (shadows && !NO_SHADOW.has(kind)) {
        shadow.visible = true;
        shadow.position.set(agent.x, agent.y);
        const shadowScale = scale * (kind === "cart" || kind === "garlock" ? 1.1 : 0.8);
        shadow.scale.set(shadowScale, shadowScale);
        shadow.zIndex = agent.z - 0.5;
      } else if (shadow.visible) {
        shadow.visible = false;
      }

      // The load over a carrier's head.
      const icon = entry.icon;
      if (agent.carrying) {
        if (entry.iconKey !== agent.carrying) {
          icon.texture = this.iconFor(agent.carrying);
          entry.iconKey = agent.carrying;
        }
        icon.visible = true;
        icon.position.set(agent.x, agent.y + yOffset - height * scale - 3 * scale);
        icon.scale.set(0.5 * scale, 0.5 * scale);
        icon.zIndex = agent.z + 0.1;
      } else if (icon.visible) {
        icon.visible = false;
        entry.iconKey = null;
      }
    }

    // Whoever was not in this frame's list has left the view.
    for (const [id, entry] of this.entries) {
      if (entry.stamp === stamp) continue;
      this.entries.delete(id);
      this.detach(entry);
      entry.texture = null;
      this.free.push(entry);
    }
  }

  destroy() {
    for (const entry of this.entries.values()) this.detach(entry);
    this.entries.clear();
    this.container.destroy({ children: true });
  }
}
