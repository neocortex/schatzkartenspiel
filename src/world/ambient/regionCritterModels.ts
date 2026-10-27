/**
 * Creature models of the newer regions (forward = +z, up = +y, island units):
 * sea turtles on the lagoon beach, frogs in the swamp, sheep on the flower
 * hills, parrots over the jungle and dolphins off the lagoon. Like
 * `critterModels.ts`, every vertex carries an `aPart` id for the species'
 * GLSL animation in `critterAnims.ts`; grey parts take the instance tint.
 */

import * as THREE from "three";
import { merge, ColorFn } from "../../core/geo";
import { piece, flat, mirrored, sphere, along, V3 } from "./critterModels";

/** Warm off-white that the instance tint leaves alone (pure white would be tinted). */
const EYE_WHITE = "#fff6e6";

/** Sea turtle: patterned shell, cream rim; front flippers (part 1), back flippers (part 2), head (part 3). Shell ≈ 0.85 long. */
export function turtleModel(): THREE.BufferGeometry {
  const skin = "#8fae6a";
  const shellA = new THREE.Color("#55783a");
  const shellB = new THREE.Color("#8fb25a");
  const out = new THREE.Color();
  // Reason: a sin-product pattern reads as the shell's plates without extra geometry
  const plates: ColorFn = (p) => out.copy(Math.sin(p.x * 21) * Math.sin(p.z * 17) > 0.2 ? shellB : shellA);
  const parts = [
    piece(sphere(0.34, 16, 10), plates, 0, { pos: [0, 0.13, 0], scale: [1, 0.5, 1.22] }),
    piece(sphere(0.34, 16, 6), "#e3d39a", 0, { pos: [0, 0.1, 0], scale: [1.04, 0.16, 1.25] }),
    piece(new THREE.CylinderGeometry(0.055, 0.065, 0.16, 8), skin, 3, { pos: [0, 0.13, 0.4], rot: along() }),
    piece(sphere(0.1, 10, 8), skin, 3, { pos: [0, 0.16, 0.5], scale: [0.9, 0.82, 1.15] }),
    piece(new THREE.ConeGeometry(0.035, 0.1, 6), skin, 0, { pos: [0, 0.09, -0.45], rot: along(-Math.PI / 2) }),
  ];
  for (const s of [1, -1]) {
    parts.push(
      piece(sphere(0.022, 6, 4), "#111111", 3, { pos: [s * 0.062, 0.2, 0.57] }),
      piece(sphere(0.1, 8, 6), skin, 1, { pos: [s * 0.33, 0.07, 0.2], scale: [1.9, 0.28, 0.8], rot: [0, -s * 0.5, 0] }),
      piece(sphere(0.07, 8, 6), skin, 2, { pos: [s * 0.23, 0.06, -0.32], scale: [1.4, 0.28, 1.1], rot: [0, s * 0.6, 0] }),
    );
  }
  return merge(parts);
}

/** Frog: grey body (tinted per instance), cream belly, big eyes; back legs (part 1) kick, throat sac (part 2) puffs. ≈ 0.28 long. */
export function frogModel(): THREE.BufferGeometry {
  const skin = "#d8d8d8";
  const belly = "#fff1c2";
  const parts = [
    piece(sphere(0.1, 12, 8), skin, 0, { pos: [0, 0.08, 0], scale: [1.15, 0.75, 1.25] }),
    piece(sphere(0.08, 12, 8), skin, 0, { pos: [0, 0.11, 0.08], scale: [1.25, 0.8, 1] }),
    piece(sphere(0.085, 10, 6), belly, 0, { pos: [0, 0.055, 0.03], scale: [1.1, 0.6, 1.2] }),
    piece(sphere(0.045, 8, 6), belly, 2, { pos: [0, 0.075, 0.135], scale: [1.2, 0.8, 0.9] }),
  ];
  for (const s of [1, -1]) {
    parts.push(
      piece(sphere(0.04, 10, 8), EYE_WHITE, 0, { pos: [s * 0.055, 0.17, 0.09] }),
      piece(sphere(0.022, 6, 4), "#111111", 0, { pos: [s * 0.062, 0.18, 0.125] }),
      piece(new THREE.CylinderGeometry(0.013, 0.013, 0.08, 5), skin, 0, { pos: [s * 0.075, 0.035, 0.1], rot: [0.3, 0, s * 0.3] }),
      piece(sphere(0.026, 6, 4), skin, 0, { pos: [s * 0.085, 0.006, 0.13], scale: [1.2, 0.3, 1.2] }),
      piece(sphere(0.05, 8, 6), skin, 1, { pos: [s * 0.1, 0.05, -0.06], scale: [0.8, 0.7, 1.6] }),
      piece(sphere(0.036, 6, 4), skin, 1, { pos: [s * 0.12, 0.008, 0.0], scale: [1.4, 0.3, 2] }),
    );
  }
  return merge(parts);
}

/** Sheep: a cloud of wool balls (grey, tinted per instance), dark face and legs; the head (part 1) dips to graze. ≈ 0.85 tall. */
export function sheepModel(): THREE.BufferGeometry {
  const wool = "#f0f0f0";
  const face = "#3b2e25";
  const puffs: [V3, number][] = [
    [[0, 0.5, 0], 0.3],
    [[0.14, 0.52, 0.16], 0.2],
    [[-0.14, 0.52, 0.16], 0.2],
    [[0.15, 0.5, -0.17], 0.21],
    [[-0.15, 0.5, -0.17], 0.21],
    [[0, 0.65, 0.04], 0.2],
    [[0, 0.61, -0.2], 0.19],
    [[0, 0.5, 0.26], 0.18],
    [[0, 0.48, -0.3], 0.17],
  ];
  const parts = puffs.map(([pos, r]) => piece(sphere(r, 10, 8), wool, 0, { pos }));
  parts.push(
    piece(sphere(0.12, 10, 8), face, 1, { pos: [0, 0.55, 0.42], scale: [0.85, 0.95, 1.2] }),
    piece(sphere(0.08, 8, 6), wool, 1, { pos: [0, 0.67, 0.39] }),
    piece(sphere(0.06, 8, 6), wool, 0, { pos: [0, 0.56, -0.4] }),
  );
  for (const s of [1, -1]) {
    parts.push(
      piece(sphere(0.06, 6, 4), face, 1, { pos: [s * 0.12, 0.6, 0.37], scale: [1.4, 0.4, 0.7] }),
      piece(sphere(0.024, 6, 4), EYE_WHITE, 1, { pos: [s * 0.068, 0.6, 0.5] }),
      piece(sphere(0.013, 6, 4), "#111111", 1, { pos: [s * 0.072, 0.6, 0.52] }),
    );
    for (const z of [0.18, -0.18]) parts.push(piece(new THREE.CylinderGeometry(0.035, 0.03, 0.34, 6), face, 0, { pos: [s * 0.13, 0.17, z] }));
  }
  return merge(parts);
}

/**
 * Parrot: grey body (tinted per instance), pale face, hooked beak, two long blue tail feathers.
 * Wings (part 1) like a macaw's: body-coloured coverts, a yellow band, blue flight feathers
 * with three spread fingers at the tip. Wingspan ≈ 0.95.
 */
export function parrotModel(): THREE.BufferGeometry {
  const body = "#e0e0e0";
  const blue = "#2b6fd6";
  return merge([
    piece(sphere(0.12), body, 0, { scale: [0.9, 0.95, 1.5] }),
    piece(sphere(0.095), body, 0, { pos: [0, 0.08, 0.16] }),
    piece(sphere(0.06, 8, 6), EYE_WHITE, 0, { pos: [0, 0.08, 0.215], scale: [1.25, 0.9, 0.6] }),
    piece(new THREE.ConeGeometry(0.035, 0.09, 6), "#3a332c", 0, { pos: [0, 0.05, 0.27], rot: [Math.PI / 2 + 0.5, 0, 0] }),
    piece(sphere(0.015, 6, 4), "#111111", 0, { pos: [0.05, 0.11, 0.22] }),
    piece(sphere(0.015, 6, 4), "#111111", 0, { pos: [-0.05, 0.11, 0.22] }),
    // Tail: short body-coloured coverts over two long blue feathers
    flat([[-0.05, 0.01, -0.12], [0.05, 0.01, -0.12], [0.04, 0.0, -0.3], [-0.04, 0.0, -0.3]], body, 0),
    ...mirrored([[0.0, -0.005, -0.15], [0.045, -0.005, -0.16], [0.05, -0.03, -0.62], [0.015, -0.03, -0.66]], blue, 0),
    // Wings: coverts, yellow band, blue trailing edge and three primary fingers
    ...mirrored([[0.06, 0.04, 0.11], [0.19, 0.045, 0.09], [0.18, 0.045, -0.07], [0.06, 0.04, -0.1]], body, 1),
    ...mirrored([[0.19, 0.045, 0.09], [0.29, 0.048, 0.05], [0.27, 0.048, -0.09], [0.18, 0.045, -0.07]], "#ffcf33", 1),
    ...mirrored([[0.06, 0.04, -0.1], [0.18, 0.045, -0.07], [0.19, 0.045, -0.14], [0.08, 0.04, -0.15]], blue, 1),
    ...mirrored([[0.18, 0.045, -0.07], [0.27, 0.048, -0.09], [0.25, 0.047, -0.16], [0.19, 0.045, -0.14]], blue, 1),
    ...mirrored([[0.28, 0.048, 0.05], [0.47, 0.05, 0.01], [0.46, 0.05, -0.035], [0.285, 0.048, 0.0]], blue, 1),
    ...mirrored([[0.285, 0.048, 0.0], [0.45, 0.05, -0.06], [0.43, 0.05, -0.105], [0.28, 0.048, -0.045]], blue, 1),
    ...mirrored([[0.28, 0.048, -0.045], [0.4, 0.05, -0.13], [0.37, 0.05, -0.165], [0.27, 0.048, -0.09]], blue, 1),
  ]);
}

/** Dolphin: blue-grey back, pale belly, beak, dorsal and side fins; the tail flukes (part 1) beat. ≈ 2 long. */
export function dolphinModel(): THREE.BufferGeometry {
  const back = "#6f8ba6";
  const fin = "#5d7893";
  return merge([
    piece(sphere(0.3, 16, 12), back, 0, { pos: [0, 0, 0], scale: [0.9, 0.85, 3.1] }),
    piece(sphere(0.27, 14, 8), "#e8eef3", 0, { pos: [0, -0.07, 0.08], scale: [0.85, 0.65, 2.7] }),
    piece(new THREE.CylinderGeometry(0.05, 0.11, 0.3, 10), back, 0, { pos: [0, -0.03, 1.0], rot: along() }),
    piece(sphere(0.03, 6, 4), "#111111", 0, { pos: [0.17, 0.05, 0.62] }),
    piece(sphere(0.03, 6, 4), "#111111", 0, { pos: [-0.17, 0.05, 0.62] }),
    piece(new THREE.CylinderGeometry(0.1, 0.18, 0.5, 8), back, 1, { pos: [0, 0, -0.92], rot: along(-Math.PI / 2) }),
    flat([[0, 0.22, 0.1], [0, 0.5, -0.22], [0, 0.22, -0.32]], fin, 0),
    ...mirrored([[0.2, -0.12, 0.38], [0.48, -0.26, 0.2], [0.2, -0.12, 0.2]], fin, 0),
    ...mirrored([[0, 0, -1.08], [0.38, 0, -1.32], [0.3, 0, -1.42], [0, 0, -1.22]], fin, 1),
  ]);
}
