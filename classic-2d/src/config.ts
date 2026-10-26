/**
 * Game-wide constants and configuration values.
 */

export const FONT = '"Press Start 2P", monospace';
export const TILE_SIZE = 16;
export const CHAR_WIDTH = 16;
export const CHAR_HEIGHT = 24;
export const GAME_WIDTH = 320;
export const GAME_HEIGHT = 240;
export const SCALE = 3;
export const MAP_COLS = 80;
export const MAP_ROWS = 60;

/** Pixel color palette — SNES-inspired. */
export const COLORS = {
  // Terrain
  GRASS_LIGHT: 0x4caf50,
  GRASS_DARK: 0x388e3c,
  WATER_LIGHT: 0x42a5f5,
  WATER_DARK: 0x1e88e5,
  SAND: 0xf0e68c,
  SAND_DARK: 0xd4c562,
  DIRT: 0x8d6e63,
  DIRT_DARK: 0x6d4c41,
  STONE: 0x9e9e9e,
  STONE_DARK: 0x757575,
  LAVA: 0xff5722,
  LAVA_GLOW: 0xff9800,
  SNOW: 0xeceff1,
  CAVE_FLOOR: 0x5d4037,
  CAVE_WALL: 0x3e2723,

  // Foliage
  TREE_TRUNK: 0x795548,
  TREE_LEAVES: 0x2e7d32,
  TREE_LEAVES_LIGHT: 0x66bb6a,
  BUSH: 0x1b5e20,

  // Decorations
  FLOWER_RED: 0xe53935,
  FLOWER_YELLOW: 0xfdd835,
  FLOWER_PURPLE: 0x7b1fa2,
  FLOWER_CENTER: 0xffeb3b,
  MUSHROOM_CAP: 0xd32f2f,
  MUSHROOM_SPOT: 0xffffff,
  MUSHROOM_STEM: 0xefebe9,

  // Structures
  BRIDGE: 0xa1887f,
  ROOF: 0xc62828,
  WALL: 0xbcaaa4,
  DOOR: 0x6d4c41,
  PATH: 0xd7ccc8,
  PATH_PINK: 0xe91e63,

  // Characters
  TADEO_HAIR: 0xfdd835,
  TADEO_SKIN: 0xffcc80,
  TADEO_SHIRT: 0xe65100,
  TADEO_PANTS: 0x1565c0,
  TADEO_BOOTS: 0x3e2723,

  // Enemies
  OGRE_SKIN: 0x6b8e23,
  OGRE_DARK: 0x556b2f,
  SHARK_BODY: 0x607d8b,
  SHARK_BELLY: 0xcfd8dc,

  // NPCs
  NPC_SKIN: 0xd2691e,
  NPC_CLOTH: 0xff6f00,

  // Items
  SWORD_BLADE: 0xb0bec5,
  SWORD_HILT: 0x8d6e63,
  SWORD_GLOW: 0x64b5f6,
  BERRY: 0x7b1fa2,
  BERRY_GLOW: 0xce93d8,
  KEY_GOLD: 0xffc107,
  HAMMER_HEAD: 0xffc107,
  HAMMER_HANDLE: 0x795548,
  CHEST: 0x8d6e63,
  CHEST_GOLD: 0xffd54f,
  HEART: 0xe53935,

  // UI
  UI_BG: 0x1a1a2e,
  UI_BORDER: 0xe0e0e0,
  UI_TEXT: 0xffffff,
  UI_SHADOW: 0x000000,
  UI_HIGHLIGHT: 0xffc107,
} as const;

/** Scene keys used throughout the game. */
export const SCENES = {
  BOOT: "BootScene",
  TITLE: "TitleScene",
  OVERWORLD: "OverworldScene",
  VOLCANO: "VolcanoScene",
  CAVE: "CaveScene",
  FOREST: "ForestScene",
  COMBAT: "CombatScene",
  VILLAGE: "VillageScene",
  MOUNTAIN: "MountainScene",
  SEA: "SeaScene",
  TREASURE: "TreasureScene",
  VICTORY: "VictoryScene",
} as const;

/** Tile indices for the overworld tilemap. */
export const TILES = {
  GRASS: 0,
  GRASS_ALT: 1,
  WATER: 2,
  WATER_DEEP: 3,
  SAND: 4,
  DIRT: 5,
  STONE: 6,
  LAVA: 7,
  SNOW: 8,
  PATH: 9,
  TREE: 10,
  BUSH: 11,
  BRIDGE: 12,
  HOUSE_WALL: 13,
  HOUSE_ROOF: 14,
  DOOR: 15,
  CAVE_ENTRANCE: 16,
  MOUNTAIN: 17,
  VOLCANO_TOP: 18,
  CHEST: 19,
  SIGN: 20,
  DOCK: 21,
  BOAT: 22,
  PATH_PINK: 23,
  FLOWER_RED: 24,
  FLOWER_YELLOW: 25,
  FLOWER_PURPLE: 26,
  SMALL_ROCK: 27,
  MUSHROOM: 28,
  TALL_GRASS: 29,
  WATER_ALT: 30,
  LAVA_ALT: 31,
} as const;

/** Depth sorting layers. */
export const DEPTH = {
  GROUND: 0,
  PATH: 1,
  SHADOWS: 2,
  OBJECTS: 3,
  ENTITIES: 4,
  PLAYER: 5,
  EFFECTS: 6,
  UI: 100,
  DIALOGUE: 200,
} as const;
