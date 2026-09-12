// constants.js
//
// Numbers every part of the world and the engine agree on. Keep this file
// tiny and dependency-free: it is imported by the world generator (which
// runs in a Web Worker), the renderer and the simulation.

// Corner radius of one hex in WORLD UNITS. Zoom 1 draws one world unit as
// one CSS pixel, so a hex is ~42 units wide and 48 tall on screen at 1x.
export const HEX_SIZE = 24;

// Hexes per chunk side. Chunks are the unit of culling, of terrain-mesh
// rebuilding and of ambient life spawning. 16x16 = 256 hexes.
export const CHUNK_SIZE = 16;

// Blank margin around the grid, in world units.
export const WORLD_PAD = 96;

// Camera zoom limits (world units -> CSS px multiplier). The real minimum
// is "fit the whole world", computed at boot; this is a hard floor.
export const ZOOM_MIN = 0.06;
export const ZOOM_MAX = 4.0;

// Zoom thresholds the layers use to drop detail. Below FAR only baked
// colour and big landforms are drawn; above NEAR everything is.
export const ZOOM_FAR = 0.35;
export const ZOOM_MID = 0.7;
export const ZOOM_NEAR = 1.4;

// One in-game "day" of the cosmetic day/night cycle, in real seconds.
export const DAY_LENGTH_SECONDS = 150;

// Save format. Bumped whenever the world spec or the tile record changes.
export const SAVE_VERSION = 4;
