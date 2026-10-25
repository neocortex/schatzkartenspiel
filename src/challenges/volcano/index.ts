/**
 * Volcano challenge entry (quest 2): dodge the lava bombs across the lava
 * field at the foot of the erupting volcano. Loaded lazily by the registry.
 */

import { ChallengeFactory } from "../types";
import { VolcanoChallenge } from "./VolcanoChallenge";

const create: ChallengeFactory = (ctx) => new VolcanoChallenge(ctx);
export default create;
