// worldGen.worker.js (module worker)
//
// Runs generateWorld off the main thread so the boot screen can animate
// while 86 400 hexes are being carved. Started by main.js as
//
//   new Worker(new URL("./worldGen.worker.js", import.meta.url), { type: "module" })
//
// Protocol (docs/ARCHITECTURE.md):
//   in:  { spec }                                   the "world" block of data/map.json plus seed
//   out: { type: "progress", fraction, caption }    about ten times during generation
//        { type: "done", world }                    the finished world (structured-cloned)
//        { type: "error", message }                 if anything threw
//
// The world is posted as one plain object. It is a few megabytes of tile
// records; structured cloning that takes tens of milliseconds, which is
// still far cheaper than generating on the main thread. Nothing in here
// touches the DOM.

import { generateWorld } from "./worldGen.js";

self.onmessage = (event) => {
  const spec = event.data && event.data.spec;
  if (!spec) {
    self.postMessage({ type: "error", message: "worldGen.worker: no spec in message" });
    return;
  }
  try {
    const world = generateWorld(spec, (fraction, caption) => {
      self.postMessage({ type: "progress", fraction, caption });
    });
    self.postMessage({ type: "done", world });
  } catch (error) {
    self.postMessage({ type: "error", message: error && error.stack ? error.stack : String(error) });
  }
};
