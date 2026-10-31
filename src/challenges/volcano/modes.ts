/**
 * The two ways the volcano course is played: what differs between one run and
 * the other, all in one place so the challenge itself stays the same.
 */

import * as THREE from "three";
import { DIALOGUES, DialogueScript } from "../../data/dialogues";
import { SkyPalette } from "../../world/Sky";
import { finaleEnding, prepareHomecoming } from "../finale/ending";
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

/** Quest 12: the same rocks at today's rate, under a sky gone dark red. Only setting the heart back changes anything. */
export const FINALE: VolcanoMode = {
  bombInterval: [1.15, 0.6],
  sky: {
    zenith: new THREE.Color("#240a18"),
    horizon: new THREE.Color("#c23a22"),
    sunGlow: new THREE.Color("#ff6a2a"),
  },
  carriesHeart: true,
  light: {
    sun: "#ffa578",
    sunIntensity: 1.9,
    hemiSky: "#e88a68",
    hemiGround: "#4a2420",
    hemiIntensity: 0.85,
    fog: "#a33c28",
  },
  opening: DIALOGUES.finale_climb,
  prepare: prepareHomecoming,
  ending: finaleEnding,
};
