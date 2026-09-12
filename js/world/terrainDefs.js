// terrainDefs.js
//
// The catalogue of ground. Every terrain type the world generator can
// produce is described here ONCE: what it is called, what colour the
// terrain mesh paints it, what stands on it (decor sprites from the atlas),
// how hard it is to walk or build a road across, and whether anyone can
// settle it. Gameplay resource amounts per hex stay in data/map.json
// (terrainDefaults), keyed by the same type names.
//
// Type names are part of the save format and of the legacy rules code
// (territory.js, villages.js, map.json), so never rename an existing one.
//
// Colours are 0xRRGGBB. `color` is the flat Civ-VI-style fill; `colorAlt`
// is mixed in per hex (by detailSeed) so a plain is not one flat slab;
// `edge` is the darker rim the shader draws when the hex grid is shown.
//
// Decor recipes: { key, count, scale: [min, max], spread } — `key` is an
// atlas key WITHOUT the variant suffix; the feature layer appends `_0`..`_n`
// picking a variant per sprite. `count` is sprites per hex at full detail.

export const WATER_TYPES = new Set(["ocean", "shallows", "lake", "river"]);
export const UNSETTLEABLE_TYPES = new Set(["ocean", "shallows", "lake"]);

// Ground a village can be founded on.
export const HOMELY_TYPES = ["flowerMeadow", "plains", "forest", "birchWood", "overgrownHighlands", "hills"];

export const TERRAIN = {
  // ---- water ---------------------------------------------------------------
  ocean: {
    name: "Open sea", water: true, deep: true,
    color: 0x2f6f9e, colorAlt: 0x2a6392, edge: 0x27587f, minimap: "#4c86ad",
    move: Infinity, road: Infinity, boat: 1,
    decor: [{ key: "decor/wave", count: 0.35, scale: [0.7, 1.1] }],
  },
  shallows: {
    name: "Shallows", water: true, deep: false,
    color: 0x4f9fc4, colorAlt: 0x4a96bb, edge: 0x3f86a8, minimap: "#6fb0cf",
    move: Infinity, road: Infinity, boat: 1,
    decor: [{ key: "decor/wave", count: 0.5, scale: [0.6, 0.9] }],
  },
  lake: {
    name: "Lake", water: true, deep: false,
    color: 0x4a9bc0, colorAlt: 0x4592b8, edge: 0x3a80a3, minimap: "#79b3c8",
    move: Infinity, road: Infinity, boat: 1,
    decor: [{ key: "decor/wave", count: 0.25, scale: [0.5, 0.8] }],
  },
  river: {
    name: "River", water: true, deep: false,
    // A river hex is painted as its bank; the river band itself is drawn by
    // the waterways layer on top, so this colour is the wet ground beside it.
    color: 0x86ab5c, colorAlt: 0x7fa356, edge: 0x6b8f4a, minimap: "#8ec5d6",
    move: 3, road: 5, boat: 1,
    decor: [{ key: "decor/reed", count: 0.8, scale: [0.6, 0.9] }],
  },

  // ---- shore ---------------------------------------------------------------
  beach: {
    name: "Shore",
    color: 0xe8d8a8, colorAlt: 0xe2d09c, edge: 0xc9b783, minimap: "#e5d3a3",
    move: 1.2, road: 1.2,
    decor: [{ key: "decor/rock", count: 0.3, scale: [0.5, 0.8] }, { key: "decor/palm", count: 0.25, scale: [0.8, 1.1] }],
  },
  cliffs: {
    name: "Sea cliffs",
    color: 0x9a8b7a, colorAlt: 0x8f8170, edge: 0x6f6355, minimap: "#9a8b7a",
    move: 3, road: 4,
    decor: [{ key: "decor/cliff", count: 1, scale: [0.9, 1.1] }],
  },

  // ---- open ground ---------------------------------------------------------
  plains: {
    name: "Plains",
    color: 0xd6c56f, colorAlt: 0xcfbd65, edge: 0xb3a352, minimap: "#d4be72",
    move: 1, road: 1,
    decor: [{ key: "decor/grass", count: 1.2, scale: [0.6, 1.0] }],
  },
  flowerMeadow: {
    name: "Flowering meadow",
    color: 0x8fc768, colorAlt: 0x86bd5f, edge: 0x6ea04c, minimap: "#88bd5a",
    move: 1, road: 1,
    decor: [{ key: "decor/flower", count: 1.6, scale: [0.6, 1.0] }, { key: "decor/grass", count: 0.6, scale: [0.6, 0.9] }],
  },
  hills: {
    name: "Rolling hills",
    color: 0xa9b862, colorAlt: 0xa0b05a, edge: 0x83924a, minimap: "#a9b862",
    move: 1.6, road: 1.8,
    decor: [{ key: "decor/hill", count: 1, scale: [0.9, 1.15] }],
  },
  overgrownHighlands: {
    name: "Terraced hills",
    color: 0xb3a562, colorAlt: 0xab9c5a, edge: 0x8d8149, minimap: "#bca563",
    move: 1.8, road: 2,
    decor: [{ key: "decor/hill", count: 0.8, scale: [0.8, 1.0] }, { key: "decor/grass", count: 0.5, scale: [0.6, 0.9] }],
  },

  // ---- woodland ------------------------------------------------------------
  forest: {
    name: "Forest",
    color: 0x4f8f3f, colorAlt: 0x498738, edge: 0x3a6f2e, minimap: "#468538",
    move: 1.7, road: 1.7,
    decor: [{ key: "decor/tree_broad", count: 3.2, scale: [0.8, 1.15] }],
  },
  birchWood: {
    name: "Birch wood",
    color: 0x86b455, colorAlt: 0x7fab4e, edge: 0x66913c, minimap: "#7fa844",
    move: 1.5, road: 1.6,
    decor: [{ key: "decor/tree_birch", count: 2.8, scale: [0.8, 1.1] }],
  },
  denseBush: {
    name: "Dense bush",
    color: 0x3d7a37, colorAlt: 0x377231, edge: 0x2b5a28, minimap: "#336932",
    move: 2.2, road: 2.2,
    decor: [{ key: "decor/tree_broad", count: 2.4, scale: [0.7, 1.0] }, { key: "decor/bush", count: 2.0, scale: [0.7, 1.0] }],
  },
  taiga: {
    name: "Pine taiga",
    color: 0x3f6f4c, colorAlt: 0x396745, edge: 0x2c5237, minimap: "#2b5a3c",
    move: 2.2, road: 2.2,
    decor: [{ key: "decor/tree_pine", count: 3.4, scale: [0.8, 1.2] }],
  },
  timbermellowForest: {
    name: "Timbermellow grove",
    color: 0x74b551, colorAlt: 0x6cab49, edge: 0x558f3a, minimap: "#78b84e",
    move: 1.4, road: 1.5,
    decor: [{ key: "decor/tree_timbermellow", count: 3.0, scale: [0.85, 1.15] }],
  },

  // ---- wet, cold, dry ------------------------------------------------------
  marsh: {
    name: "Marshland",
    color: 0x7e9358, colorAlt: 0x768b51, edge: 0x5d7040, minimap: "#7f8f4e",
    move: 3, road: 4,
    decor: [{ key: "decor/reed", count: 2.6, scale: [0.7, 1.0] }, { key: "decor/pool", count: 0.6, scale: [0.7, 1.0] }],
  },
  tundra: {
    name: "Cold tundra",
    color: 0xb9c0a4, colorAlt: 0xb0b79b, edge: 0x8f977c, minimap: "#b9bfa2",
    move: 1.4, road: 1.4,
    decor: [{ key: "decor/grass", count: 0.8, scale: [0.5, 0.8] }, { key: "decor/rock", count: 0.4, scale: [0.5, 0.8] }],
  },
  snowfield: {
    name: "Snowfield",
    color: 0xeef2f6, colorAlt: 0xe4eaf0, edge: 0xc2cdd8, minimap: "#e8eef4",
    move: 2.2, road: 3,
    decor: [{ key: "decor/snowdrift", count: 0.8, scale: [0.7, 1.1] }, { key: "decor/dead_tree", count: 0.2, scale: [0.6, 0.9] }],
  },
  badlands: {
    name: "Badlands",
    color: 0xc98c58, colorAlt: 0xc08451, edge: 0x9c6636, minimap: "#c58a52",
    move: 1.6, road: 1.6,
    decor: [{ key: "decor/rock", count: 0.9, scale: [0.6, 1.0] }, { key: "decor/dead_tree", count: 0.25, scale: [0.6, 0.9] }],
  },
  desert: {
    name: "Desert",
    color: 0xe7cf8e, colorAlt: 0xdfc684, edge: 0xc0a86a, minimap: "#e7cf8e",
    move: 1.5, road: 1.4,
    decor: [{ key: "decor/dune", count: 0.6, scale: [0.8, 1.1] }, { key: "decor/cactus", count: 0.35, scale: [0.6, 0.9] }],
  },

  // ---- rock ----------------------------------------------------------------
  rockyOutcrop: {
    name: "Rocky outcrop",
    color: 0xa39482, colorAlt: 0x9b8c7a, edge: 0x7a6d5e, minimap: "#9e8b72",
    move: 2.5, road: 3,
    decor: [{ key: "decor/rock", count: 1.4, scale: [0.7, 1.1] }, { key: "decor/boulder", count: 0.5, scale: [0.8, 1.1] }],
  },
  mountains: {
    name: "Mountains",
    color: 0x8b8781, colorAlt: 0x827e78, edge: 0x615e59, minimap: "#787572",
    move: 6, road: 9,
    // snowCapped tiles use decor/mountain_snow instead (feature layer).
    decor: [{ key: "decor/mountain", count: 1, scale: [1.0, 1.25] }],
  },
};

export const TERRAIN_TYPES = Object.keys(TERRAIN);

// Display names, for panels and the log.
export const TERRAIN_NAMES = Object.fromEntries(TERRAIN_TYPES.map((type) => [type, TERRAIN[type].name]));

export function isWaterTerrain(type) {
  return WATER_TYPES.has(type);
}

export function isSettleable(type) {
  return !UNSETTLEABLE_TYPES.has(type);
}

// Walking cost of entering a tile of this type (Infinity = impassable).
export function moveCost(type) {
  const def = TERRAIN[type];
  return def ? def.move : 1;
}

// What it costs to lay (and later to cart goods along) a road here.
export function roadCost(type) {
  const def = TERRAIN[type];
  return def ? def.road : 1;
}

export function terrainColor(type) {
  const def = TERRAIN[type];
  return def ? def.color : 0xff00ff;
}

// Which terrains a given trade goes to work on. Mirrors what the legacy
// villagers layer used, extended for the new ground.
export const WORKPLACES = {
  forester: ["forest", "denseBush", "timbermellowForest", "birchWood", "taiga"],
  mason: ["mountains", "rockyOutcrop", "badlands", "overgrownHighlands", "hills", "cliffs"],
  farmer: ["plains", "flowerMeadow", "overgrownHighlands", "timbermellowForest", "hills"],
};

// Which ground yields what, for the world generator's viable-start check.
export const TERRAIN_SUPPLIES = {
  food:  ["timbermellowForest", "flowerMeadow", "forest", "birchWood", "denseBush", "taiga", "marsh", "tundra", "plains", "hills"],
  wood:  ["timbermellowForest", "forest", "birchWood", "denseBush", "taiga", "marsh"],
  stone: ["mountains", "rockyOutcrop", "overgrownHighlands", "badlands", "tundra", "snowfield", "beach", "hills", "cliffs"],
};

// Landmarks the generator can scatter, and where each belongs.
export const LANDMARK_TYPES = [
  "standingStones", "motherTree", "dragonBones", "crystalMine", "shipwreck",
  "ruinedTower", "hotSpring", "boneOrchard", "volcano", "oasis",
];

// Seasons, by the legacy 1-4 index game.js uses.
export const SEASON_NAMES = { 1: "spring", 2: "summer", 3: "autumn", 4: "winter" };
