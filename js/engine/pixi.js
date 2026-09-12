// pixi.js
//
// The one place PixiJS is loaded from. Everything in js/engine imports
// `PIXI` from here, never from a URL, so swapping the version or going
// offline is a one-line change.
//
// The CDN copy is tried first (it is cached across every site that uses
// it); if it cannot be reached — no network, a blocked CDN, a file:// page —
// the vendored copy in /vendor is used instead. Top-level await keeps the
// rest of the engine simple: by the time any module runs, PIXI is here.

const CDN_URL = "https://cdn.jsdelivr.net/npm/pixi.js@8.20.1/dist/pixi.min.mjs";
const LOCAL_URL = new URL("../../vendor/pixi.min.mjs", import.meta.url).href;

async function loadPixi() {
  const attempts = [CDN_URL, LOCAL_URL];
  let lastError = null;
  for (const url of attempts) {
    try {
      // A slow CDN must not hang the boot screen: give it a few seconds,
      // then fall back to the local copy.
      const loaded = await Promise.race([
        import(/* webpackIgnore: true */ url),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout loading ${url}`)), 6000)),
      ]);
      if (loaded && loaded.Application) return loaded;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("PixiJS could not be loaded");
}

const PIXI = await loadPixi();

export default PIXI;
export const {
  Application, Container, Sprite, Graphics, Text, TextStyle, BitmapText,
  Texture, TextureSource, Rectangle, Point, Matrix, Color,
  Mesh, Geometry, Shader, ParticleContainer, Particle, TilingSprite,
  RenderTexture, Ticker, BlurFilter, ColorMatrixFilter, Assets,
} = PIXI;
