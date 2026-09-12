// weather.js (ES module)
//
// The sky over the map: the time of day, the light it throws, what is
// falling and which way the wind blows. Purely cosmetic — the season comes
// from game.js (1..4) and nothing here changes a rule — but it is what
// makes the same hex look different at dusk in autumn and at noon in
// spring, which is most of what "alive" means for a map.
//
// Everything is a function of (season, elapsed seconds, seed): there is no
// randomness at run time, so two players on the same seed see the same
// shower at the same minute, and the tests can walk a whole day in a loop.
//
// The state object is reused: update() writes into the same object every
// frame and `state` hands it back, so a 60 fps renderer allocates nothing.

import { DAY_LENGTH_SECONDS } from "./constants.js";
import { latticeHash, clamp } from "./hexMath.js";

// Where the clock stands when a game starts: mid-morning, so nobody boots
// into the dark.
const START_TIME_OF_DAY = 0.36;

// Night is a cool blue laid over everything, at most this opaque at midnight.
const NIGHT_COLOR = { r: 0.08, g: 0.12, b: 0.3 };
const NIGHT_MAX_ALPHA = 0.45;

// The brief orange around sunrise and sunset.
const DUSK_COLOR = { r: 1.0, g: 0.55, b: 0.25 };
const DUSK_MAX_ALPHA = 0.12;

// A wash per season: a little green in spring, warmth in summer, orange in
// autumn and a pale cold blue in winter.
const SEASON_TINT = {
  1: { r: 0.62, g: 1.0, b: 0.62, a: 0.04 },
  2: { r: 1.0, g: 0.92, b: 0.62, a: 0.05 },
  3: { r: 1.0, g: 0.62, b: 0.25, a: 0.08 },
  4: { r: 0.75, g: 0.85, b: 1.0, a: 0.14 },
};

// What falls in each season when it is not raining, and how often it rains.
// Rain is decided per SPELL_SECONDS "spell" from a seeded hash, so it comes
// in showers rather than a permanent drizzle.
const SEASON_WEATHER = {
  1: { ambient: "petals", ambientIntensity: 0.5, rainChance: 0.25, rainIntensity: 0.7, cloudCover: 0.45 },
  2: { ambient: null, ambientIntensity: 0, rainChance: 0.08, rainIntensity: 0.6, cloudCover: 0.28 },
  3: { ambient: "leaves", ambientIntensity: 0.6, rainChance: 0.30, rainIntensity: 0.8, cloudCover: 0.55 },
  4: { ambient: null, ambientIntensity: 0, rainChance: 0.70, rainIntensity: 0.65, cloudCover: 0.7, snow: true },
};
const SPELL_SECONDS = 40;
const SPELL_RAMP_SECONDS = 6;

// A smooth 0..1 ramp between two edges.
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// "Draw `top` over `base`" for {r,g,b,a} colours, into `out`.
function composite(out, base, top) {
  const a = top.a + base.a * (1 - top.a);
  if (a <= 0) {
    out.r = 1; out.g = 1; out.b = 1; out.a = 0;
    return out;
  }
  out.r = (top.r * top.a + base.r * base.a * (1 - top.a)) / a;
  out.g = (top.g * top.a + base.g * base.a * (1 - top.a)) / a;
  out.b = (top.b * top.a + base.b * base.a * (1 - top.a)) / a;
  out.a = a;
  return out;
}

export class WeatherModel {
  constructor(seed) {
    this.seed = (seed >>> 0) || 1;
    this.season = 1;
    this.time = 0;                        // seconds since the world was made
    this.timeOffset = START_TIME_OF_DAY * DAY_LENGTH_SECONDS;
    this._state = {
      season: 1,
      timeOfDay: START_TIME_OF_DAY,
      daylight: 1,
      tint: { r: 1, g: 1, b: 1, a: 0 },
      // The two halves the lighting layer draws as separate quads: the
      // cool night multiply and the warm season/dusk overlay. `tint` is
      // both together for anyone who only wants one colour.
      nightTint: { r: NIGHT_COLOR.r, g: NIGHT_COLOR.g, b: NIGHT_COLOR.b, a: 0 },
      seasonTint: { r: 1, g: 1, b: 1, a: 0 },
      precipitation: { kind: null, intensity: 0 },
      wind: { x: 0.5, y: 0.1 },
      cloudCover: 0.4,
      fog: 0,
    };
    this._scratch = { r: 1, g: 1, b: 1, a: 0 };
    this._dusk = { r: DUSK_COLOR.r, g: DUSK_COLOR.g, b: DUSK_COLOR.b, a: 0 };
    this.update(0);
  }

  setSeason(season) {
    const next = Number(season);
    if (next >= 1 && next <= 4 && next !== this.season) {
      this.season = next;
      this.update(0);
    }
  }

  // Lets a test (or a debug slider) jump the clock. `fraction` 0..1, 0 = midnight.
  setTimeOfDay(fraction) {
    this.timeOffset = ((fraction % 1) + 1) % 1 * DAY_LENGTH_SECONDS - (this.time % DAY_LENGTH_SECONDS);
    this.update(0);
  }

  update(dt) {
    if (dt > 0) this.time += Math.min(dt, 1);
    const state = this._state;
    const season = this.season;
    const dayTime = this.time + this.timeOffset;
    const timeOfDay = ((dayTime / DAY_LENGTH_SECONDS) % 1 + 1) % 1;
    state.season = season;
    state.timeOfDay = timeOfDay;

    // The sun: 1 at noon (0.5), -1 at midnight (0). Daylight is a smooth
    // ramp through the horizon so dawn and dusk take a few seconds each.
    const sun = Math.cos((timeOfDay - 0.5) * Math.PI * 2);
    const daylight = smoothstep(-0.25, 0.45, sun);
    state.daylight = daylight;

    // Lighting. Night deepens as daylight fades; dusk/dawn is a bump
    // centred on the horizon; the season wash is constant.
    const night = state.nightTint;
    night.a = (1 - daylight) * NIGHT_MAX_ALPHA;
    const horizon = Math.exp(-Math.pow((sun - 0.05) / 0.18, 2));
    this._dusk.a = DUSK_MAX_ALPHA * horizon;
    const seasonTint = SEASON_TINT[season] || SEASON_TINT[1];
    composite(state.seasonTint, seasonTint, this._dusk);
    composite(state.tint, state.seasonTint, night);

    // Precipitation: which spell are we in, and is it a wet one?
    const weather = SEASON_WEATHER[season] || SEASON_WEATHER[1];
    const spell = Math.floor(dayTime / SPELL_SECONDS);
    const into = dayTime - spell * SPELL_SECONDS;
    const wetNow = latticeHash(spell, season, this.seed) < weather.rainChance;
    const wetBefore = latticeHash(spell - 1, season, this.seed) < weather.rainChance;
    // Showers fade in and out over SPELL_RAMP_SECONDS instead of switching.
    let wet = 0;
    if (wetNow) wet = wetBefore ? 1 : smoothstep(0, SPELL_RAMP_SECONDS, into);
    else if (wetBefore) wet = 1 - smoothstep(0, SPELL_RAMP_SECONDS, into);
    const precipitation = state.precipitation;
    if (wet > 0.02) {
      precipitation.kind = weather.snow ? "snow" : "rain";
      precipitation.intensity = weather.rainIntensity * wet;
    } else if (weather.ambient) {
      precipitation.kind = weather.ambient;
      precipitation.intensity = weather.ambientIntensity;
    } else {
      precipitation.kind = null;
      precipitation.intensity = 0;
    }

    // Wind: turns slowly, gusts a little, never stops entirely (clouds
    // that hang still look like a bug).
    const angle = this.seed * 0.001 + this.time * 0.012 + Math.sin(this.time * 0.031) * 0.8;
    const strength = 0.55 + 0.35 * Math.sin(this.time * 0.07 + this.seed) + 0.25 * wet;
    state.wind.x = Math.cos(angle) * strength;
    state.wind.y = Math.sin(angle) * strength * 0.3;

    state.cloudCover = clamp(weather.cloudCover + 0.3 * wet + 0.08 * Math.sin(this.time * 0.02), 0, 1);

    // Morning mist, thickest a little after sunrise, and a touch all day in winter.
    const dawn = Math.exp(-Math.pow((timeOfDay - 0.28) / 0.05, 2));
    state.fog = clamp(0.2 * dawn + (season === 4 ? 0.05 : 0) + 0.1 * wet * (weather.snow ? 1 : 0.3), 0, 1);
  }

  get state() {
    return this._state;
  }
}
