/**
 * Where everything stands in Mia's farmyard: the fenced yard bounds, the
 * coop, the hay bales the golden hen hides behind, props, puddles and the
 * start spots of the hens. Shared by the scene builder, the hen brains and
 * the challenge flow. Units are island metres; the camera looks towards -z.
 */

export type P2 = [number, number];

/** Inner fence line; nobody (Tadeo, hens) leaves this rectangle. */
export const YARD = { minX: -12, maxX: 12, minZ: -9, maxZ: 9 } as const;

/** Coop footprint centre (front faces +z) and its size. */
export const COOP = { x: -3.6, z: -6.3, w: 5.0, d: 2.8, floor: 0.78 } as const;

/** Where the ramp meets the ground — the chick is brought here. */
export const RAMP_FOOT: P2 = [COOP.x + 1.65, COOP.z + 4.0];

/** Kleine Mia cheers next to the ramp. */
export const MIA_SPOT: P2 = [COOP.x + 3.6, COOP.z + 3.0];

/** Tadeo starts near the open gate. */
export const START: P2 = [0.5, 5.2];

/** Hay bale piles: the golden hen dodges between them. `r` = collider radius. */
export const HAY: { at: P2; r: number; kind: "round" | "stack" | "pair" }[] = [
  { at: [7.6, -5.4], r: 1.35, kind: "pair" },
  { at: [-8.2, 4.4], r: 1.2, kind: "stack" },
  { at: [5.6, 5.6], r: 0.95, kind: "round" },
  { at: [-9.0, -4.6], r: 0.95, kind: "round" },
];

export const TROUGH: P2 = [2.8, -1.4];
export const PUDDLES: { at: P2; r: number }[] = [
  { at: [-1.2, 2.4], r: 1.05 },
  { at: [9.4, 0.4], r: 0.8 },
  { at: [-6.4, -1.6], r: 0.6 },
];
export const WHEELBARROW: P2 = [9.6, 6.6];
export const SCARECROW: P2 = [-10.0, -0.6];
export const VEGGIES: P2 = [-10.0, -0.6];
export const CAT_BARREL: P2 = [10.9, -7.9];

/** Sunflowers: a row along the back fence and a clump in the front-left corner. */
export const SUNFLOWERS: P2[] = [
  [1.4, -8.3], [2.6, -8.5], [3.7, -8.2], [4.9, -8.5], [10.2, -6.0], [11.1, -4.9], [11.2, -3.6],
  [-11.2, 7.4], [-10.1, 8.2], [-11.3, 5.9], [-0.9, -8.5],
];

/** Hen start spots (5 hens), the chick's flower corner and its peeping radius. */
export const HEN_STARTS: P2[] = [
  [-4.6, -2.3],
  [-5.8, 0.4],
  [2.4, 6.2],
  [-4.6, 5.6],
  [9.0, -2.6],
];
export const CHICK_START: P2 = [-9.6, 7.0];

/** Gate gap in the front fence (x range). */
export const GATE = { x0: -1.4, x1: 1.4 } as const;
