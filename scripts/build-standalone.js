// build-standalone.js
//
// Writes map-preview.html: a generated world, painted, with the hex grid
// and the effects layer, all inlined so it opens straight off the file
// system by double-clicking — no dev server, no Node running, nothing to
// install. Handy for showing the map to someone.
//
// The game itself still loads data/map.json with fetch() and so still needs
// a server (see scripts/dev-server.js). Regenerate this after changing the
// map code:
//
//     node scripts/build-standalone.js [seed]
//
// The output is generated, never edited by hand, and is gitignored.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT_FILE = path.join(ROOT, "map-preview.html");
const seed = Number(process.argv[2]) || 424242;

const MAP_SCRIPTS = [
  "js/map/hexMath.js",
  "js/map/hexMap.js",
  "js/map/hexRenderer.js",
  "js/map/artStyle.js",
  "js/map/worldGen.js",
  "js/map/worldPainter.js",
  "js/map/mapEffects.js",
  "js/map/mapViewport.js",
  "js/map/villagers.js",
  "js/villages.js",
];

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const mapData = readProjectFile("data/map.json");
const styles = readProjectFile("css/style.css");
const inlinedScripts = MAP_SCRIPTS.map(
  (file) => `/* ---- ${file} ---- */\n${readProjectFile(file)}`
).join("\n\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>bottom up — map preview</title>
<style>
${styles}
  /* preview-only bar on top of the game's stylesheet */
  .preview-head { position: fixed; z-index: 20; top: 8px; left: 8px; right: 8px; height: 48px; display: flex; align-items: center; gap: 14px; padding: 0 12px; }
  .preview-head h1 { font-size: 18px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--rw-accent); margin: 0; }
  .preview-head p { font-size: 12px; color: var(--rw-dim); margin: 0; }
  .preview-head p b { color: #fff; }
  .preview-head .rw-btn { width: auto; margin-left: auto; }
  .preview-head .rw-btn + .rw-btn { margin-left: 0; }
</style>
</head>
<body>
  <div class="stage season--spring" id="mapstage">
    <div class="mapviewport" id="mapviewport">
      <div id="mapArtworkHost" class="maplayer"></div>
      <div id="mapSettlementsHost" class="maplayer maplayer--passive"></div>
      <div id="hexMapSvgHost" class="maplayer" hidden></div>
      <div id="mapVillagersHost" class="maplayer maplayer--passive"></div>
      <div id="mapEffectsHost" class="maplayer maplayer--passive"></div>
    </div>
  </div>
  <div class="rw-panel preview-head">
    <h1>bottom up — map preview</h1>
    <p>Generated file, opens without a server. World seed <b id="seedLabel"></b>. Scroll to zoom, drag to pan.</p>
    <button class="rw-btn" onclick="toggleHexOverlay()">Toggle hex grid</button>
    <button class="rw-btn" onclick="regenerate()">Another world</button>
  </div>

<script>
const MAP_DATA = ${mapData};
let previewSeed = ${seed};
</script>

<script>
${inlinedScripts}
</script>

<script>
// Same set-up as js/main.js, minus the village logic. Everything is
// revealed so the whole world can be seen.
var hexMap, hexRenderer, people;
function build() {
  if (people) people.stop();
  var world = generateWorld(Object.assign({}, MAP_DATA.world, { seed: previewSeed }));
  hexMap = new HexMap({ terrainDefaults: MAP_DATA.terrainDefaults, tiles: world.tiles });
  villagesSet(world.villages);
  world.villages.forEach(function (village) { hexMap.claimTile(village.homeTileId, village.id); });
  hexMap.unlockMapmaking();

  paintWorld(document.getElementById("mapArtworkHost"), world);
  paintSettlements(document.getElementById("mapSettlementsHost"), world, hexMap, { houses: 3, barns: 2, schools: 1, camps: 1 });
  hexRenderer = new HexRenderer(hexMap, document.getElementById("hexMapSvgHost"), {
    hexSize: world.grid.hexSize,
    origin: { x: world.grid.originX, y: world.grid.originY },
    viewBox: { x: 0, y: 0, width: world.width, height: world.height },
    ownerColor: villageColor,
  });
  hexRenderer.render();
  var effects = new MapEffects(document.getElementById("mapEffectsHost"), world.width, world.height);
  var home = hexMap.getAllTiles().find(function (tile) { return tile.isStartingTile; });
  var center = worldTileCenter(home.q, home.r, world.grid);
  effects.setVillage(center.x, center.y);
  effects.setSeason("spring");
  people = new Villagers(document.getElementById("mapVillagersHost"), world, hexMap);
  people.sync(4, 1);
  people.start();
  document.getElementById("seedLabel").textContent = previewSeed;
}
build();
setupMapViewport(document.getElementById("mapstage"), document.getElementById("mapviewport"));

function toggleHexOverlay() {
  var host = document.getElementById("hexMapSvgHost");
  host.hidden = !host.hidden;
}

function regenerate() {
  previewSeed = Math.floor(Math.random() * 1e9);
  build();
}
</script>
</body>
</html>
`;

fs.writeFileSync(OUTPUT_FILE, html, "utf8");
console.log("Wrote " + OUTPUT_FILE + " (" + Math.round(html.length / 1024) + " KB), seed " + seed);
console.log("Open it by double-clicking — no server needed.");
