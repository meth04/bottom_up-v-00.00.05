// weatherLayer.js (ES module)
//
// The sky, drawn in SCREEN space on top of the world: drifting clouds with
// their shadows on the ground, rain or snow or petals or leaves falling
// past the camera, the colour of the light (a cool multiply at night, a
// warm wash by season) and the orange glow of windows after dark.
//
// It reads WeatherModel.state every frame and nothing else — the model
// decides what the weather is, this decides what it looks like. The only
// thing it needs from the world is where the buildings are (for the window
// glows), supplied by the renderer through setBuildingSource().
//
// Layer order, bottom to top: season wash, night multiply, dawn mist,
// window glows, cloud shadows, clouds, precipitation. Everything is pooled:
// the particle counts and cloud counts are fixed by quality and reused,
// so a change of weather never allocates.

import { ZOOM_FAR } from "../world/constants.js";
import { createRandom, clamp } from "../world/hexMath.js";

// Cloud sprites float with the wind and, being nearer the eye than the
// ground, slide faster than it when the camera pans.
const CLOUD_DRIFT_PX = 14;
const CLOUD_PARALLAX = 0.6;
const CLOUD_SHADOW_OFFSET = { x: 24, y: 30 };
const CLOUD_SHADOW_ALPHA = 0.12;

// Particles at full intensity and full quality.
const PARTICLES_MAX = 300;
const PARTICLE_MARGIN = 120;

const MAX_GLOWS = 60;
const GLOW_REFRESH_SECONDS = 0.4;

// Per-kind fall behaviour.
const FALL = {
  rain:   { texture: "fx/raindrop",  vy: [520, 760], windX: 160, wobble: 0,  spin: 0,   alpha: 0.7 },
  snow:   { texture: "fx/snowflake", vy: [35, 70],   windX: 40,  wobble: 22, spin: 0.6, alpha: 0.9 },
  petals: { texture: "fx/petal",     vy: [40, 80],   windX: 60,  wobble: 35, spin: 2.2, alpha: 0.9 },
  leaves: { texture: "fx/leaf",      vy: [45, 85],   windX: 70,  wobble: 35, spin: 2.6, alpha: 0.95 },
};

function rgbToNumber(tint) {
  const r = clamp(Math.round(tint.r * 255), 0, 255);
  const g = clamp(Math.round(tint.g * 255), 0, 255);
  const b = clamp(Math.round(tint.b * 255), 0, 255);
  return (r << 16) | (g << 8) | b;
}

export class WeatherLayer {
  constructor(PIXI, atlas, quality, screen) {
    this.PIXI = PIXI;
    this.atlas = atlas;
    this.quality = quality || {};
    this.width = (screen && screen.width) || 800;
    this.height = (screen && screen.height) || 600;
    this.time = 0;
    this.random = createRandom(0x5eed);

    this.container = new PIXI.Container();
    this.seasonQuad = new PIXI.Graphics();
    this.nightQuad = new PIXI.Graphics();
    this.nightQuad.blendMode = "multiply";
    this.fogQuad = new PIXI.Graphics();
    this.glowLayer = new PIXI.Container();
    this.shadowLayer = new PIXI.Container();
    this.cloudLayer = new PIXI.Container();
    this.precipLayer = new PIXI.Container();
    this.container.addChild(this.seasonQuad, this.nightQuad, this.fogQuad, this.glowLayer, this.shadowLayer, this.cloudLayer, this.precipLayer);

    this.clouds = [];
    this.particles = new Map();       // kind -> { container, list, vx, vy, spin, phase, count }
    this.glows = [];
    this.glowPositions = [];
    this.glowTimer = 0;
    this.buildingSource = null;
    this.lastCamera = { x: NaN, y: NaN };

    this.buildQuads();
    this.buildClouds();
    this.buildGlows();
  }

  // `fn(bounds) -> [{x, y}]` in world units: where the windows are.
  setBuildingSource(fn) {
    this.buildingSource = fn;
  }

  setQuality(quality) {
    this.quality = quality || this.quality;
    this.buildClouds();
    // Particle pools are sized from quality; let them be rebuilt on demand.
    for (const pool of this.particles.values()) {
      this.precipLayer.removeChild(pool.container);
      pool.container.destroy();
    }
    this.particles.clear();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.buildQuads();
    for (const cloud of this.clouds) {
      cloud.x = ((cloud.x % (width + 400)) + width + 400) % (width + 400) - 200;
      cloud.y = ((cloud.y % (height + 200)) + height + 200) % (height + 200) - 100;
    }
  }

  // ---- Building the pools -----------------------------------------------------------

  buildQuads() {
    for (const quad of [this.seasonQuad, this.nightQuad, this.fogQuad]) {
      quad.clear();
      quad.rect(0, 0, this.width, this.height).fill(0xffffff);
      quad.alpha = 0;
    }
  }

  buildClouds() {
    for (const cloud of this.clouds) {
      this.cloudLayer.removeChild(cloud.sprite);
      this.shadowLayer.removeChild(cloud.shadow);
      cloud.sprite.destroy();
      cloud.shadow.destroy();
    }
    this.clouds.length = 0;
    if (this.quality.clouds === false) return;
    const particles = this.quality.particles === undefined ? 1 : this.quality.particles;
    const count = clamp(Math.round(4 + 4 * particles), 4, 8);
    // A fixed seed: the sky looks the same on every boot.
    const random = createRandom(0xc10d);
    for (let i = 0; i < count; i++) {
      const texture = this.atlas.texture(`fx/cloud_${i % 3}`);
      const sprite = new this.PIXI.Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      const shadow = new this.PIXI.Sprite(texture);
      shadow.anchor.set(0.5, 0.5);
      shadow.tint = 0x000000;
      shadow.blendMode = "multiply";
      this.cloudLayer.addChild(sprite);
      this.shadowLayer.addChild(shadow);
      this.clouds.push({
        sprite, shadow,
        x: random() * this.width,
        y: random() * this.height,
        scale: 1.2 + random() * 1.0,
        alpha: 0.35 + random() * 0.2,
        speed: 0.6 + random() * 0.6,
        drift: random() * Math.PI * 2,
      });
    }
  }

  buildGlows() {
    const texture = this.atlas.texture("fx/glow");
    for (let i = 0; i < MAX_GLOWS; i++) {
      const sprite = new this.PIXI.Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      sprite.blendMode = "add";
      sprite.tint = 0xffb060;
      sprite.visible = false;
      this.glowLayer.addChild(sprite);
      this.glows.push(sprite);
    }
  }

  // A pool of particles for one kind of weather, made the first time that
  // weather comes. Spares are parked far above the screen.
  poolFor(kind) {
    let pool = this.particles.get(kind);
    if (pool) return pool;
    const PIXI = this.PIXI;
    const spec = FALL[kind];
    const texture = this.atlas.texture(spec.texture);
    const quality = this.quality.particles === undefined ? 1 : this.quality.particles;
    const max = Math.max(8, Math.round(PARTICLES_MAX * quality));
    const container = new PIXI.ParticleContainer({
      texture,
      dynamicProperties: { position: true, rotation: true, scale: false, color: false },
    });
    const list = [];
    const vx = new Float32Array(max);
    const vy = new Float32Array(max);
    const spin = new Float32Array(max);
    const phase = new Float32Array(max);
    const random = this.random;
    for (let i = 0; i < max; i++) {
      const particle = new PIXI.Particle({
        texture,
        x: random() * this.width,
        y: random() * this.height,
        anchorX: 0.5, anchorY: 0.5,
        scaleX: 0.8 + random() * 0.5, scaleY: 0.8 + random() * 0.5,
        rotation: random() * Math.PI * 2,
        alpha: spec.alpha,
      });
      vy[i] = spec.vy[0] + random() * (spec.vy[1] - spec.vy[0]);
      spin[i] = (random() - 0.5) * 2 * spec.spin;
      phase[i] = random() * Math.PI * 2;
      list.push(particle);
      container.addParticle(particle);
    }
    if (typeof container.update === "function") container.update();
    container.visible = false;
    this.precipLayer.addChild(container);
    pool = { kind, container, list, vx, vy, spin, phase, max, active: 0 };
    this.particles.set(kind, pool);
    return pool;
  }

  // ---- The frame -----------------------------------------------------------------

  // `buildingPositions` is optional: the renderer may pass them directly
  // instead of registering a source.
  update(state, camera, dt, buildingPositions) {
    dt = Math.min(dt || 0, 0.1);
    this.time += dt;
    if (!state) return;
    this.updateLighting(state);
    this.updateClouds(state, camera, dt);
    this.updatePrecipitation(state, dt);
    this.updateGlows(state, camera, dt, buildingPositions);
  }

  // Two quads: the season/dusk wash drawn normally (a light tint over the
  // world) and the night drawn with multiply (darkens instead of veiling).
  // A model that only gives one combined tint still works: it goes on the
  // multiply quad.
  updateLighting(state) {
    const night = state.nightTint || state.tint;
    const season = state.seasonTint;
    if (night) {
      this.nightQuad.tint = rgbToNumber(night);
      this.nightQuad.alpha = clamp(night.a, 0, 1);
    }
    if (season) {
      this.seasonQuad.tint = rgbToNumber(season);
      this.seasonQuad.alpha = clamp(season.a, 0, 1);
    } else {
      this.seasonQuad.alpha = 0;
    }
    const fog = state.fog || 0;
    this.fogQuad.tint = 0xdfe6ea;
    this.fogQuad.alpha = clamp(fog * 0.6, 0, 0.6);
  }

  updateClouds(state, camera, dt) {
    if (!this.clouds.length) return;
    const zoom = camera.zoom || 1;
    // Parallax: the camera moved, so the clouds slide the other way, a bit
    // faster than the ground does.
    let shiftX = 0;
    let shiftY = 0;
    if (Number.isFinite(this.lastCamera.x)) {
      shiftX = -(camera.x - this.lastCamera.x) * zoom * CLOUD_PARALLAX;
      shiftY = -(camera.y - this.lastCamera.y) * zoom * CLOUD_PARALLAX;
    }
    this.lastCamera.x = camera.x;
    this.lastCamera.y = camera.y;

    const wind = state.wind || { x: 0.5, y: 0 };
    const cover = clamp((state.cloudCover === undefined ? 0.5 : state.cloudCover) * 1.5, 0.15, 1);
    const w = this.width;
    const h = this.height;
    const zoomScale = clamp(0.7 + zoom * 0.35, 0.7, 1.6);
    for (const cloud of this.clouds) {
      const margin = 120 * cloud.scale * zoomScale;
      cloud.x += shiftX + wind.x * CLOUD_DRIFT_PX * cloud.speed * dt;
      cloud.y += shiftY + (wind.y * CLOUD_DRIFT_PX * cloud.speed + Math.sin(this.time * 0.1 + cloud.drift) * 2) * dt;
      // Wrap around the screen with a margin so a cloud never pops in view.
      if (cloud.x > w + margin) cloud.x -= w + 2 * margin;
      else if (cloud.x < -margin) cloud.x += w + 2 * margin;
      if (cloud.y > h + margin) cloud.y -= h + 2 * margin;
      else if (cloud.y < -margin) cloud.y += h + 2 * margin;

      const scale = cloud.scale * zoomScale;
      cloud.sprite.position.set(cloud.x, cloud.y);
      cloud.sprite.scale.set(scale, scale);
      cloud.sprite.alpha = cloud.alpha * cover;
      cloud.shadow.position.set(cloud.x + CLOUD_SHADOW_OFFSET.x, cloud.y + CLOUD_SHADOW_OFFSET.y);
      cloud.shadow.scale.set(scale, scale);
      cloud.shadow.alpha = CLOUD_SHADOW_ALPHA * cover;
    }
  }

  updatePrecipitation(state, dt) {
    const precipitation = state.precipitation || { kind: null, intensity: 0 };
    const kind = precipitation.kind && FALL[precipitation.kind] ? precipitation.kind : null;
    // Hide whatever is not falling now.
    for (const pool of this.particles.values()) {
      if (pool.kind !== kind && pool.container.visible) pool.container.visible = false;
    }
    if (!kind || precipitation.intensity <= 0) return;
    const pool = this.poolFor(kind);
    pool.container.visible = true;
    const spec = FALL[kind];
    const wind = state.wind || { x: 0.5, y: 0 };
    const quality = this.quality.particles === undefined ? 1 : this.quality.particles;
    const active = Math.min(pool.max, Math.round(PARTICLES_MAX * precipitation.intensity * quality));
    const w = this.width;
    const h = this.height;
    const list = pool.list;
    const time = this.time;
    const random = this.random;

    for (let i = 0; i < pool.max; i++) {
      const particle = list[i];
      if (i >= active) {
        // Parked out of sight until the shower thickens.
        if (particle.y > -1000) particle.y = -5000;
        continue;
      }
      if (particle.y <= -1000) {
        // Coming back into service: somewhere above the screen.
        particle.y = -20 - random() * h;
        particle.x = random() * (w + 2 * PARTICLE_MARGIN) - PARTICLE_MARGIN;
      }
      const wobble = spec.wobble ? Math.sin(time * 1.5 + pool.phase[i]) * spec.wobble : 0;
      const vx = wind.x * spec.windX + wobble;
      const vy = pool.vy[i];
      particle.x += vx * dt;
      particle.y += vy * dt;
      if (kind === "rain") particle.rotation = Math.atan2(-vx, vy);
      else particle.rotation += pool.spin[i] * dt;
      if (particle.y > h + 20) {
        particle.y = -20 - random() * 40;
        particle.x = random() * (w + 2 * PARTICLE_MARGIN) - PARTICLE_MARGIN;
      }
      if (particle.x > w + PARTICLE_MARGIN) particle.x -= w + 2 * PARTICLE_MARGIN;
      else if (particle.x < -PARTICLE_MARGIN) particle.x += w + 2 * PARTICLE_MARGIN;
    }
    pool.active = active;
  }

  // Warm windows after dark. Positions come in world units and are refreshed
  // a few times a second; mapping them to the screen is done every frame so
  // they stay glued to their houses while the camera moves.
  updateGlows(state, camera, dt, buildingPositions) {
    const darkness = 1 - (state.daylight === undefined ? 1 : state.daylight);
    const zoom = camera.zoom || 1;
    if (darkness < 0.05 || zoom < ZOOM_FAR) {
      for (const glow of this.glows) if (glow.visible) glow.visible = false;
      return;
    }
    this.glowTimer -= dt;
    if (buildingPositions) {
      this.glowPositions = buildingPositions;
    } else if (this.buildingSource && this.glowTimer <= 0) {
      this.glowTimer = GLOW_REFRESH_SECONDS;
      const bounds = typeof camera.getBounds === "function" ? camera.getBounds(60) : null;
      this.glowPositions = (bounds ? this.buildingSource(bounds) : this.buildingSource()) || [];
    }
    const positions = this.glowPositions;
    const count = Math.min(MAX_GLOWS, positions.length);
    const scale = 0.5 * clamp(zoom, 0.5, 2);
    for (let i = 0; i < MAX_GLOWS; i++) {
      const glow = this.glows[i];
      if (i >= count) { if (glow.visible) glow.visible = false; continue; }
      const p = positions[i];
      const screen = camera.worldToScreen(p.x, p.y - 8);
      glow.visible = true;
      glow.position.set(screen.x, screen.y);
      glow.scale.set(scale, scale);
      glow.alpha = darkness * (0.55 + 0.15 * Math.sin(this.time * 3 + i * 1.7));
    }
  }

  destroy() {
    this.container.destroy({ children: true });
    this.clouds.length = 0;
    this.particles.clear();
    this.glows.length = 0;
  }
}
