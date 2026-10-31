/**
 * Authored island layout: where every landmark sits, how the paths and the
 * river run. World units: x = east, z = south, y = up. Water level is y = 0.
 * The geography mirrors the original 2D map so directions in the dialogue
 * ("Vulkan im Westen", "Berg im Norden", ...) still hold.
 */

export const WORLD_HALF = 175;
export const WORLD_SIZE = WORLD_HALF * 2;
export const WATER_LEVEL = 0;

export type P2 = readonly [number, number];

/** Main island coastline ellipse (before noise). */
export const ISLAND = { cx: 0, cz: 6, rx: 98, rz: 70 } as const;

export type RegionName = "lagoon" | "jungle" | "swamp" | "hills";

/**
 * The newer regions grow the island as extra coastline ellipses ("lobes") around
 * the original one, so nothing on the original island moves (see world/regions.ts).
 */
export const LOBES: Record<RegionName, { c: P2; rx: number; rz: number }> = {
  /** Lagunenstrand: white beach and a shallow lagoon south of the village. */
  lagoon: { c: [86, 84], rx: 44, rz: 34 },
  /** Dschungel: lush hills below the enchanted forest. */
  jungle: { c: [0, 96], rx: 56, rz: 40 },
  /** Seerosensumpf: flat, wet and full of frogs in the south-west. */
  swamp: { c: [-58, 90], rx: 32, rz: 26 },
  /** Blumenhügel: rolling flower hills with a windmill in the east. */
  hills: { c: [116, -2], rx: 38, rz: 48 },
};

/** Set pieces and features of the newer regions. */
export const SPOTS = {
  /** Centre of the shallow lagoon basin. */
  lagoonWater: [100, 96] as P2,
  /** Where the lagoon channel meets the open sea. */
  lagoonMouth: [122, 116] as P2,
  /** Sandy shore west of the lagoon (landing spot). */
  lagoonBeach: [82, 98] as P2,
  lagoonJetty: [86, 99] as P2,
  lagoonJettyEnd: [95, 100] as P2,
  /** Shallow crossing of the river, south of the bridge. */
  ford: [38, 50] as P2,
  jungleRuin: [-8, 110] as P2,
  junglePool: [16, 100] as P2,
  swampPond: [-56, 98] as P2,
  frogIslet: [-56, 98] as P2,
  /** Plank walk over the shallow strait between the old landing beach and the swamp. */
  boardwalk: [-64.5, 50.5] as P2,
  boardwalkEnd: [-61, 61.5] as P2,
  windmill: [126, 2] as P2,
  /** Tadeo's wrecked boat on the sand beside the landing pier. */
  wreck: [-71.5, 43] as P2,
  /** The giant boulder that closes the mountain trail until the ogre lifts it. */
  trailBoulder: [55.5, -8.6] as P2,
} as const;

export const LANDMARKS = {
  /** Beach where Tadeo's boat lands (quest 1). */
  spawn: [-66, 47] as P2,
  spawnPierEnd: [-84, 66] as P2,
  volcano: [-80, 4] as P2,
  /** Trigger at the foot of the volcano (quest 2). */
  volcanoGate: [-56, 14] as P2,
  lake: [2, 2] as P2,
  /** The three stone tablets around the lake (quest 4). */
  tablets: [
    [-14, -9] as P2,
    [17, -9] as P2,
    [2, 19] as P2,
  ],
  caveHill: [-64, -34] as P2,
  /** Cave mouth on the south face of the hill (quest 5). */
  caveMouth: [-60, -22] as P2,
  forest: [-14, 40] as P2,
  /** Forest entrance (quest 6). */
  forestGate: [-12, 26] as P2,
  bridge: [44, 0] as P2,
  village: [64, 42] as P2,
  /** Village gate (quest 7). */
  villageGate: [52, 30] as P2,
  mountain: [66, -46] as P2,
  /** Trailhead at the mountain foot (quest 9). */
  mountainGate: [52, -22] as P2,
  northDock: [-30, -58] as P2,
  northDockEnd: [-36, -76] as P2,
  treasureIsland: [-62, -112] as P2,
} as const;

/** Village layout: plaza, houses (door faces `facing` radians, 0 = +z/south), and where people stand. */
export const VILLAGE = {
  plaza: [64, 44] as P2,
  plazaRadius: 8,
  houses: [
    { at: [65, 31] as P2, facing: 0, size: 1.35, elder: true },
    { at: [77, 39] as P2, facing: -Math.PI / 2, size: 1 },
    { at: [77, 51] as P2, facing: -Math.PI / 2, size: 1.1 },
    { at: [66, 58] as P2, facing: Math.PI, size: 1 },
    { at: [52, 52] as P2, facing: Math.PI / 2, size: 1.05 },
  ],
  well: [64, 44] as P2,
  elder: [65, 37] as P2,
  wiseWoman: [58, 46] as P2,
  wiseMan: [70, 47] as P2,
} as const;

/** River from the mountain spring to the south coast (passes under the bridge). */
export const RIVER: P2[] = [
  [56, -32], [50, -18], [45, -6], [44, 0], [44, 8], [42, 20], [40, 34], [38, 50], [36, 66], [34, 86],
  [33, 102], [31, 118], [28, 134], [26, 152],
];

/** Dirt paths connecting the quest locations (Catmull-Rom smoothed later). */
export const PATHS: P2[][] = [
  // Beach → volcano foot
  [[-66, 44], [-63, 34], [-58, 22], [-56, 14]],
  // Volcano foot → lake west shore
  [[-56, 14], [-44, 8], [-30, 4], [-18, 2]],
  // Ring around the lake
  [[-18, 2], [-14, -10], [2, -16], [18, -10], [22, 2], [17, 15], [2, 21], [-13, 15], [-18, 2]],
  // Lake → cave
  [[-14, -10], [-28, -14], [-44, -16], [-56, -20], [-60, -22]],
  // Lake → forest gate
  [[2, 21], [-4, 24], [-12, 26]],
  // Lake → bridge → east side
  [[22, 2], [32, 1], [44, 0], [54, 2]],
  // Bridge → village
  [[54, 2], [56, 14], [52, 30], [58, 38], [64, 42]],
  // Bridge → mountain trail
  [[54, 2], [56, -10], [52, -22]],
  // Lake → north dock
  [[2, -16], [-6, -30], [-18, -44], [-28, -54], [-30, -58]],
  // Village → lagoon beach
  [[60, 51], [59, 60], [64, 72], [72, 84], [78, 95]],
  // Village → ford → lake (the way west that avoids the ogre's bridge)
  [[58, 47], [48, 48], [38, 50], [30, 52], [26, 54], [22, 40], [19, 27], [17, 15]],
  // Ford → jungle ruin → swamp → old landing beach
  [[30, 52], [24, 64], [20, 78], [14, 90], [3, 98], [-5, 101]],
  [[-5, 101], [-20, 102], [-36, 98], [-41, 94]],
  [[-41, 94], [-50, 82], [-57, 68], [-62, 56], [-65, 48]],
  // Bridge junction → windmill on the flower hills
  [[56, 10], [70, 7], [88, 5], [104, 3], [118, 2]],
];
