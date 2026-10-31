/**
 * Finale challenge (quest 12): the volcano course once more, at the full rate and
 * under a dark red sky, with the Feuerherz on Tadeo's back. Setting it back in the
 * old stone is what ends the eruption. Loaded lazily by the registry.
 */

import * as THREE from "three";
import { DIALOGUES } from "../../data/dialogues";
import { ChallengeFactory } from "../types";
import type { VolcanoMode } from "../volcano/modes";
import { VolcanoChallenge } from "../volcano/VolcanoChallenge";
import { finaleEnding, prepareHomecoming } from "./ending";

/** Quest 12: the same rocks at today's rate, under a sky gone dark red. Only setting the heart back changes anything. */
const FINALE: VolcanoMode = {
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

const create: ChallengeFactory = (ctx) => new VolcanoChallenge(ctx, FINALE);
export default create;
