/**
 * Authored island layout: where every landmark sits, how the paths and the
 * river run. World units: x = east, z = south, y = up. Water level is y = 0.
 * The geography mirrors the original 2D map so directions in the dialogue
 * ("Vulkan im Westen", "Berg im Norden", ...) still hold.
 */

export const WORLD_HALF = 135;
export const WORLD_SIZE = WORLD_HALF * 2;
export const WATER_LEVEL = 0;

export type P2 = readonly [number, number];

/** Main island coastline ellipse (before noise). */
export const ISLAND = { cx: 0, cz: 6, rx: 98, rz: 70 } as const;

export const LANDMARKS = {
  /** Beach where Tadeo's boat lands (quest 1). */
  spawn: [-66, 47] as P2,
  spawnPierEnd: [-84, 66] as P2,
  volcano: [-80, 4] as P2,
  /** Trigger at the foot of the volcano (quest 2). */
  volcanoGate: [-56, 14] as P2,
  lake: [2, 2] as P2,
  /** The three stone tablets around the lake (quest 3). */
  tablets: [
    [-14, -9] as P2,
    [17, -9] as P2,
    [2, 19] as P2,
  ],
  caveHill: [-64, -34] as P2,
  /** Cave mouth on the south face of the hill (quest 4). */
  caveMouth: [-60, -22] as P2,
  forest: [-14, 40] as P2,
  /** Forest entrance (quest 5). */
  forestGate: [-12, 26] as P2,
  bridge: [44, 0] as P2,
  village: [64, 42] as P2,
  /** Village gate (quest 7). */
  villageGate: [52, 30] as P2,
  mountain: [66, -46] as P2,
  /** Trailhead at the mountain foot (quest 8). */
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
];
