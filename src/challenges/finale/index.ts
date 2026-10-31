/**
 * Finale challenge (quest 12): the volcano course once more, at the full rate and
 * under a dark red sky, with the Feuerherz on Tadeo's back. Setting it back in the
 * old stone is what ends the eruption. Loaded lazily by the registry.
 */

import { ChallengeFactory } from "../types";
import { FINALE } from "../volcano/modes";
import { VolcanoChallenge } from "../volcano/VolcanoChallenge";

const create: ChallengeFactory = (ctx) => new VolcanoChallenge(ctx, FINALE);
export default create;
