// bridge.js
//
// The rules (game.js, professions.js, territory.js, ages.js) keep their
// state in top-level `let` bindings of classic scripts. Those bindings are
// shared between classic scripts, but they are NOT properties of window,
// so the module side of the game (js/main.js and everything under
// js/world and js/engine) cannot read them by name.
//
// This file is the last classic script. It sees every binding and hands
// the module side two functions:
//
//   legacyState()   a snapshot of the numbers the map needs
//   legacySpend()   pays for something the map tools built
//
// Nothing else should reach across the seam.

function legacyState() {
  return {
    humans, human_army, wood, stone, timbermellow_count, working_hours,
    stonehouse, barn, storage_capacity, peoplecap,
    school, armycamp, professionCounts,
    seasonchecker, season, turngame,
    farming_made, mapmaking_made,
    garlocks_attacking, garlock_next_raid_turn,
  };
}

// cost: { wood, stone, food, hours } — any missing entry is zero. The map
// tools check affordability before calling this, so it never goes negative
// silently; it clamps and reports.
function legacySpend(cost) {
  const take = (have, want) => Math.max(0, have - (want || 0));
  wood = take(wood, cost.wood);
  stone = take(stone, cost.stone);
  timbermellow_count = take(timbermellow_count, cost.food);
  working_hours = take(working_hours, cost.hours);
  return legacyState();
}
