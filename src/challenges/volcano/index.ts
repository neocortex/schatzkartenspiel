/**
 * Volcano challenge entry (quest 2): dodge the lava bombs across the lava
 * field at the foot of the erupting volcano, hop over the broken bridges and free
 * old Paco. Loaded lazily by the registry.
 */

import { ChallengeFactory } from "../types";
import { RESCUE } from "./modes";
import { VolcanoChallenge } from "./VolcanoChallenge";

const create: ChallengeFactory = (ctx) => new VolcanoChallenge(ctx, RESCUE);
export default create;
