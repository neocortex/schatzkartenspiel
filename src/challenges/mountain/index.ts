/**
 * Quest 8 — "Der Berg": climb the island's highest peak along a spiral of
 * ledges, ladders and bridges, dodge rolling rocks and snowballs, and claim
 * the golden hammer from the summit shrine.
 */

import { ChallengeFactory } from "../types";
import { MountainChallenge } from "./MountainChallenge";

const factory: ChallengeFactory = (ctx) => new MountainChallenge(ctx);
export default factory;
