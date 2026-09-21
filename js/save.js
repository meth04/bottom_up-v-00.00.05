// save.js
//
// Saving and loading, in the browser's localStorage. The world is rebuilt
// from its seed on load, so a save only holds what changed: the village's
// numbers (game.js), who owns which tile and what's left on it (hexMap),
// and the villages. Autosaved at the end of every turn (see game.js).
//
// Version 5: the village went onto calories (item 7). One timbermellow is
// 1000 calories and every store, every tile and every threshold was
// multiplied up in place, so a version-4 save has to be carried across —
// see saveMigrate(). Version 4 and older cannot be rebuilt (different
// generator) and are still ignored.
const SAVE_KEY = "bottom_up.save.v1";
const SAVE_BACKUP_KEY = "bottom_up.save.v1.bak";
const SAVE_VERSION = 5;
// Versions saveValid() will hand to loadSavedGame(). Anything below the
// oldest of these cannot be rebuilt against this world's generator.
const SAVE_MIN_VERSION = 4;

// A cheap stable hash of what the world was generated from, so load can
// refuse a save whose map no longer matches this build's generator.
// Not cryptographic — just enough to catch "same seed, different world".
function saveWorldHash(seed, world) {
  const cols = world && world.cols ? world.cols : 0;
  const rows = world && world.rows ? world.rows : 0;
  const count = world && world.villages ? world.villages.length : 0;
  let hash = (seed >>> 0) ^ (cols * 7919) ^ (rows * 104729) ^ (count * 1299709);
  hash = ((hash >>> 16) ^ hash) >>> 0;
  hash = Math.imul(hash, 2246822519) >>> 0;
  hash = ((hash >>> 13) ^ hash) >>> 0;
  return hash >>> 0;
}

function saveRead(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const state = JSON.parse(raw);
    return state && typeof state === "object" ? state : null;
  } catch (error) {
    return null;
  }
}

function saveValid(state) {
  if (!state || typeof state.seed !== "number") return false;
  const version = state.version || 0;
  return version >= SAVE_MIN_VERSION && version <= SAVE_VERSION;
}

// ---------------------------------------------------------------------------
// Carrying an older save onto the calorie system (item 7)
// ---------------------------------------------------------------------------

// A version-4 save counts everything in timbermellows; version 5 counts
// calories. Multiplying the barn alone is NOT enough — the same unit is
// hiding in three other trees of the save, and each one fails differently
// if it is missed:
//
//   * saved.map  — the tiles. hexMap.deserialize() never reads the version
//     field, so bumping SAVE_VERSION does not migrate the map by itself.
//     Miss this and every tile holds a thousandth of a meal: gathering
//     yields nothing and the famine never comes.
//   * saved.game.ages.agePeakLandFood and ageFoodGathered — the famine
//     threshold and the "gather 5" objective. Migrate the land but not the
//     peak and `landFood <= peak * 0.35` is never true, so the famine never
//     starts; migrate the peak but not the land and it fires on load.
//   * saved.raids.raidLog[].loot.food — history, read by the log.
//
// Anything the calorie change made meaningless is reset rather than scaled:
// the streaks, the new ×5 tech and the difficulty all start fresh.
function saveMigrate(state) {
  if (!state || (state.version || 0) >= SAVE_VERSION) return state;
  // js/territory.js declares CALORIES_PER_TIMBERMELLOW; it loads after this
  // file, so it is read at call time, never at load time.
  const scale = typeof CALORIES_PER_TIMBERMELLOW === "number" ? CALORIES_PER_TIMBERMELLOW : 1000;
  const up = (value) => (typeof value === "number" && isFinite(value) ? value * scale : value);

  const game = state.game || {};
  game.timbermellow_count = up(game.timbermellow_count);
  game.storage_capacity = up(game.storage_capacity);
  // The village was played before any of these existed.
  game.hungerStreak = 0;
  game.barnFeastStreak = 0;
  game.difficulty = "normal";
  game.bulkmade = 0;
  game.bulk_unlocked = false;

  const ages = game.ages || null;
  if (ages) {
    ages.agePeakLandFood = up(ages.agePeakLandFood);
    ages.ageFoodGathered = up(ages.ageFoodGathered);
  }

  // The tiles. serialize() writes amounts under `a` and the ceiling under
  // `m`; only the food types ever change scale (wood and stone are counted
  // in loads, not calories).
  const tiles = (state.map && state.map.tiles) || null;
  if (tiles) {
    for (const id of Object.keys(tiles)) {
      const entry = tiles[id];
      if (!entry) continue;
      for (const key of ["a", "m"]) {
        const bag = entry[key];
        if (!bag) continue;
        if (typeof bag.timbermellow === "number") bag.timbermellow = up(bag.timbermellow);
        if (typeof bag.grain === "number") bag.grain = up(bag.grain);
      }
    }
  }

  const raids = state.raids || null;
  if (raids && Array.isArray(raids.raidLog)) {
    for (const entry of raids.raidLog) {
      if (entry && entry.loot && typeof entry.loot.food === "number") entry.loot.food = up(entry.loot.food);
    }
  }

  // The objective checklist only records which goals are done, so there is
  // nothing to convert — but a fresh streak/difficulty pair above is what
  // matters here.

  state.version = SAVE_VERSION;
  return state;
}

function saveGame(seed) {
  const worldForHash = typeof world !== "undefined" ? world : null;
  const state = {
    version: SAVE_VERSION,
    seed,
    savedAt: new Date().toISOString(),
    worldHash: saveWorldHash(seed >>> 0, worldForHash),
    worldCols: worldForHash && worldForHash.cols ? worldForHash.cols : null,
    worldRows: worldForHash && worldForHash.rows ? worldForHash.rows : null,
    game: gameGetState(),
    map: hexMap.serialize(),
    villages: villagesGet(),
    // Raids, defences and grudges (js/raids.js); the objective checklist
    // (js/objectives.js). Both are optional so an older save still loads.
    raids: typeof raidsGetState === "function" ? raidsGetState() : null,
    objectives: typeof objectivesGetState === "function" ? objectivesGetState() : null,
    // T-fix: view state so reload keeps lens/grid/selection instead of
    // resetting the desk every load.
    view: {
      lens: typeof currentLens !== "undefined" ? currentLens : null,
      grid: typeof gridOn !== "undefined" ? !!gridOn : false,
      selected: (typeof hexMap !== "undefined" && hexMap && hexMap.selectedTileId) || null,
    },
  };
  const payload = JSON.stringify(state);
  try {
    // Keep the last good save before overwriting it.
    try {
      const previous = localStorage.getItem(SAVE_KEY);
      if (previous) localStorage.setItem(SAVE_BACKUP_KEY, previous);
    } catch (error) {
      // backup is best-effort; the primary save still matters
    }
    localStorage.setItem(SAVE_KEY, payload);
    return true;
  } catch (error) {
    // Private windows and full storage both land here. Tell the player
    // instead of carrying on unsaved in silence (main.js shows it).
    if (typeof updatelog === "function") {
      updatelog("Could not save — the browser refused storage. The game continues unsaved.", "bad");
    }
    return false;
  }
}

function loadSavedGame() {
  const primary = saveRead(SAVE_KEY);
  if (saveValid(primary)) return saveMigrate(primary);
  // Primary missing/corrupt/old: try the backup before giving up.
  const backup = saveRead(SAVE_BACKUP_KEY);
  if (saveValid(backup)) {
    const migrated = saveMigrate(backup);
    // Promote the backup so the next save keeps a chain.
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
    } catch (error) {
      // promotion is best-effort
    }
    return migrated;
  }
  return null;
}

// True if a save was made by an older build or a different generator and
// must not be trusted against this world's tiles.
function saveWorldMismatch(saved, seed, world) {
  if (!saved) return false;
  if (!saveValid(saved)) return true;
  if ((saved.seed >>> 0) !== (seed >>> 0)) return true;
  const expected = saveWorldHash(seed >>> 0, world);
  // Saves from before worldHash existed have none — trust seed + version.
  if (saved.worldHash == null) return false;
  return saved.worldHash !== expected;
}

function clearSavedGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (error) {
    // nothing to clear
  }
  try {
    localStorage.removeItem(SAVE_BACKUP_KEY);
  } catch (error) {
    // nothing to clear
  }
}
