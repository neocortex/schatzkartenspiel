/**
 * The two ways the volcano course is played: what differs between one run and
 * the other, all in one place so the challenge itself stays the same.
 */

import * as THREE from "three";
import { SkyPalette } from "../../world/Sky";
import { rescueEnding } from "./rescue";
import type { VolcanoChallenge } from "./VolcanoChallenge";

export interface VolcanoMode {
  /** Seconds between dangerous bombs at the start of the course and at the goal. */
  bombInterval: [start: number, end: number];
  sky: SkyPalette;
  /** Tadeo runs with the Feuerherz on his back. */
  carriesHeart: boolean;
  /** Runs at the altar once Tadeo reaches the goal. */
  ending(c: VolcanoChallenge): Promise<void>;
}

/** Quest 2: someone cries for help, and Tadeo runs up to free old Paco. */
export const RESCUE: VolcanoMode = {
  bombInterval: [2.3, 1.2],
  sky: {
    zenith: new THREE.Color("#3a78dc"),
    horizon: new THREE.Color("#ffc79a"),
    sunGlow: new THREE.Color("#ffb877"),
  },
  carriesHeart: false,
  ending: rescueEnding,
};
