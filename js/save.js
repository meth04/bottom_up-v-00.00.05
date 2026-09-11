// save.js
//
// Saving and loading, in the browser's localStorage. The world is rebuilt
// from its seed on load, so a save only holds what changed: the village's
// numbers (game.js), who owns which tile and what's left on it (hexMap),
// and the villages. Autosaved at the end of every turn (see game.js).

const SAVE_KEY = "bottom_up.save.v1";

function saveGame(seed) {
  const state = {
    version: 1,
    seed,
    savedAt: new Date().toISOString(),
    game: gameGetState(),
    map: hexMap.serialize(),
    villages: villagesGet(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    // Private windows and full storage both land here; the game just
    // carries on unsaved.
    return false;
  }
}

function loadSavedGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    return state && state.version === 1 ? state : null;
  } catch (error) {
    return null;
  }
}

function clearSavedGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (error) {
    // nothing to clear
  }
}
