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
    // T-fix: walls were invisible across the seam; the map read them through
    // a side channel instead. Now they ride with the rest of the numbers.
    palisade: (typeof palisade !== "undefined" ? palisade : 0),
    watchtower: (typeof watchtower !== "undefined" ? watchtower : 0),
    seasonchecker, season, turngame,
    farming_made, mapmaking_made,
    // Item 2: the module side decides the loss, so it needs the streak.
    hungerStreak, difficulty,
    garlocks_attacking, garlock_next_raid_turn,
  };
}

// gain: { food, wood, stone } — what the carts bring in between turns
// (js/main.js, siteIncomeTick). Food never overfills the barns.
//
// Item 7: `gain.food` is what the MAP hands over — one timbermellow at a
// time, because that is what a tile's yield is written in — and the barn
// counts calories, so it is scaled on the way in. Wood and stone are
// untouched by the calorie layer.
function legacyAdd(gain) {
  const calories = (gain.food || 0) * CALORIES_PER_TIMBERMELLOW;
  timbermellow_count = Math.min(storage_capacity, timbermellow_count + calories);
  wood += gain.wood || 0;
  stone += gain.stone || 0;
  return legacyState();
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
