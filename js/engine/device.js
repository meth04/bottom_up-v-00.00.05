// device.js
//
// What kind of machine are we running on, and how much can we afford to
// draw? Everything that scales cost with quality (agent count, decor
// density, particle count, renderer resolution) reads ONE quality object
// built here, so a phone and a gaming desktop run the same code with
// different numbers.
//
// Three pieces:
//   detectDevice()    a one-off guess from what the browser exposes
//   qualityFor(tier)  the numbers for a tier
//   FpsMeter          rolling frame-time statistics
//   AdaptiveQuality   steps the numbers down when frames get slow and back
//                     up when there is headroom, with hysteresis so it
//                     never flaps
//
// The guess is deliberately conservative: a wrong "high" costs the player
// a stuttering game, a wrong "mid" costs a few trees.

/**
 * Sniffs the hardware the browser is willing to tell us about.
 * @returns {{ tier: "low"|"mid"|"high", mobile: boolean, touch: boolean, dpr: number, cores: number, memory: number }}
 */
export function detectDevice() {
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const win = typeof window !== "undefined" ? window : {};
  const scr = typeof screen !== "undefined" ? screen : { width: 1920, height: 1080 };

  const cores = nav.hardwareConcurrency || 4;
  // deviceMemory is Chromium-only and capped at 8; missing means "assume mid".
  const memory = nav.deviceMemory || 4;
  const dpr = win.devicePixelRatio || 1;
  const ua = nav.userAgent || "";
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Silk|Opera Mini|IEMobile/i.test(ua);
  // iPadOS 13+ pretends to be a Mac; the touch point count gives it away.
  const touch = (nav.maxTouchPoints || 0) > 0 || "ontouchstart" in win;
  const mobile = mobileUA || (touch && /Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
  const screenPx = Math.max(scr.width || 0, scr.height || 0) * dpr;

  // Score 0..n; each hint nudges it. Mobile devices start a tier lower
  // because their GPUs throttle hard after a minute of sustained load.
  let score = 0;
  if (cores >= 8) score += 2; else if (cores >= 4) score += 1;
  if (memory >= 8) score += 2; else if (memory >= 4) score += 1;
  if (screenPx >= 2500) score += 1;
  if (mobile) score -= 2;
  // A very high DPR on a small screen means lots of pixels for a small GPU.
  if (mobile && dpr >= 3) score -= 1;

  let tier = "mid";
  if (score >= 4) tier = "high";
  else if (score <= 0) tier = "low";
  if (mobile && tier === "high") tier = "mid";

  return { tier, mobile, touch, dpr, cores, memory };
}

/**
 * The numbers for a tier. All layers read this object; `AdaptiveQuality`
 * hands out modified copies at runtime.
 * @param {"low"|"mid"|"high"} tier
 */
export function qualityFor(tier) {
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  switch (tier) {
    case "low":
      return {
        tier, resolution: 1, antialias: false, maxAgents: 120, ambientPerChunk: 2,
        decorDensity: 0.45, particles: 0.3, shadows: false, clouds: true, animateWater: false, labelLimit: 24,
      };
    case "high":
      return {
        tier, resolution: Math.min(dpr, 2), antialias: true, maxAgents: 800, ambientPerChunk: 5,
        decorDensity: 1, particles: 1, shadows: true, clouds: true, animateWater: true, labelLimit: 60,
      };
    case "mid":
    default:
      return {
        tier: "mid", resolution: Math.min(dpr, 1.5), antialias: false, maxAgents: 350, ambientPerChunk: 3,
        decorDensity: 0.75, particles: 0.6, shadows: true, clouds: true, animateWater: true, labelLimit: 40,
      };
  }
}

/**
 * Rolling frame-time statistics over the last 120 frames (two seconds at
 * 60 fps). The ring buffer is preallocated: no allocation per frame.
 */
export class FpsMeter {
  constructor() {
    this.size = 120;
    this.samples = new Float32Array(this.size);
    this.cursor = 0;
    this.count = 0;
    this.sum = 0;
    // p95 needs a sort; cache it per tick so repeated getters are free.
    this.sorted = new Float32Array(this.size);
    this.sortedAtTick = -1;
    this.ticks = 0;
  }

  /** @param {number} dtMs milliseconds since the previous frame */
  tick(dtMs) {
    if (!(dtMs > 0)) return;
    // A tab switch produces one enormous frame; it says nothing about speed.
    const clamped = Math.min(dtMs, 250);
    if (this.count === this.size) this.sum -= this.samples[this.cursor];
    else this.count++;
    this.samples[this.cursor] = clamped;
    this.sum += clamped;
    this.cursor = (this.cursor + 1) % this.size;
    this.ticks++;
  }

  get frameMs() {
    return this.count ? this.sum / this.count : 16.7;
  }

  get fps() {
    return this.count ? 1000 / this.frameMs : 60;
  }

  get p95() {
    if (!this.count) return 16.7;
    if (this.sortedAtTick !== this.ticks) {
      const view = this.sorted.subarray(0, this.count);
      view.set(this.samples.subarray(0, this.count));
      view.sort();
      this.sortedAtTick = this.ticks;
    }
    return this.sorted[Math.min(this.count - 1, Math.floor(this.count * 0.95))];
  }
}

// Fraction of the ceiling values at each step down. Step 0 is the detected
// tier untouched; the last step is as low as adaptive quality will go
// before the floor (the "low" tier numbers) takes over.
const STEP_SCALES = [1, 0.8, 0.62, 0.45];

/**
 * Steps decorDensity / particles / maxAgents / ambientPerChunk down when
 * frames are slow and back up when they are fast. Hysteresis: a step down
 * needs 2 s of slow frames, a step up 10 s of fast ones, and there is never
 * more than one step per 4 s. The detected tier is the ceiling and the
 * "low" numbers are the floor, so it can never hand out something worse
 * than a low-end phone gets by default.
 */
export class AdaptiveQuality {
  /**
   * @param {object} quality the detected tier's quality (the ceiling)
   * @param {(quality: object) => void} onChange called with a NEW quality object on every step
   */
  constructor(quality, onChange) {
    this.ceiling = { ...quality };
    this.floor = qualityFor("low");
    this.onChange = onChange;
    this.step = 0;
    this._quality = { ...quality };
    this.slowFor = 0;
    this.fastFor = 0;
    this.sinceStep = 0;
    // T4 portal: react faster (3s between steps, 1.5s of slow to step down)
    // and trip earlier (18ms) so phones stop juddering before the player notices.
    this.minInterval = 3;
    this.slowThreshold = 18;
    this.fastThreshold = 11;
  }

  get quality() {
    return this._quality;
  }

  /** @param {number} frameMs the meter's rolling average, once per frame */
  tick(frameMs) {
    const dt = Math.min(frameMs, 250) / 1000;
    this.sinceStep += dt;
    if (frameMs > this.slowThreshold) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (frameMs < this.fastThreshold) {
      this.fastFor += dt;
      this.slowFor = 0;
    } else {
      // Comfortable middle: neither counter grows, both decay so a single
      // hitch does not accumulate over minutes.
      this.slowFor = Math.max(0, this.slowFor - dt);
      this.fastFor = Math.max(0, this.fastFor - dt);
    }
    if (this.sinceStep < this.minInterval) return;
    if (this.slowFor >= 1.5 && this.step < STEP_SCALES.length - 1) {
      this.applyStep(this.step + 1);
    } else if (this.fastFor >= 10 && this.step > 0) {
      this.applyStep(this.step - 1);
    }
  }

  applyStep(step) {
    this.step = step;
    this.sinceStep = 0;
    this.slowFor = 0;
    this.fastFor = 0;
    const scale = STEP_SCALES[step];
    const c = this.ceiling;
    const f = this.floor;
    const q = { ...c };
    q.decorDensity = Math.max(f.decorDensity, c.decorDensity * scale);
    q.particles = Math.max(f.particles, c.particles * scale);
    q.maxAgents = Math.max(f.maxAgents, Math.round(c.maxAgents * scale));
    q.ambientPerChunk = Math.max(f.ambientPerChunk, Math.round(c.ambientPerChunk * scale));
    // T4: cut fill-rate before cutting life. Resolution is the biggest cost
    // on high-DPR phones, so step 1 caps at 1.25 and step 2 at 1.0.
    if (step >= 1) q.resolution = Math.min(c.resolution || 1.5, 1.25);
    if (step >= 2) q.resolution = Math.min(c.resolution || 1.5, 1);
    // The expensive booleans go at the last step only.
    if (step >= STEP_SCALES.length - 1) {
      q.shadows = f.shadows;
      q.animateWater = f.animateWater;
      q.clouds = false;
    }
    this._quality = q;
    if (this.onChange) this.onChange(q);
  }
}
