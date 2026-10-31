/**
 * What differs between one run of the volcano course and another, so the challenge
 * itself stays the same. Quest 2's run is declared here, the last one in `finale/`.
 */

import * as THREE from "three";
import type { DialogueScript } from "../../data/dialogues";
import { SkyPalette } from "../../world/Sky";
import { rescueEnding } from "./rescue";
import type { VolcanoChallenge } from "./VolcanoChallenge";

/** The light on the course; the sun's direction stays the same in every run. */
export interface VolcanoLight {
  sun: THREE.ColorRepresentation;
  sunIntensity: number;
  hemiSky: THREE.ColorRepresentation;
  hemiGround: THREE.ColorRepresentation;
  hemiIntensity: number;
  fog: THREE.ColorRepresentation;
}

/** What an ending keeps on stage: updated every frame once the run has it. */
export interface EndingStage {
  update(dt: number, time: number): void;
}

export interface VolcanoMode {
  /** Seconds between dangerous bombs at the start of the course and at the goal. */
  bombInterval: [start: number, end: number];
  sky: SkyPalette;
  /** Tadeo runs with the Feuerherz on his back. */
  carriesHeart: boolean;
  /** Replaces the plain daylight of quest 2. */
  light?: VolcanoLight;
  /** Replaces the first run's explanations: he knows the way by now. */
  opening?: DialogueScript;
  /** Builds what the ending needs behind the black fade, so nothing has to load in the middle of the big moment. */
  prepare?(c: VolcanoChallenge): EndingStage;
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
