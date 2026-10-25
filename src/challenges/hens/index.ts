/**
 * Side game "Hühner fangen mit der kleinen Mia" — entry point for the
 * challenge registry (see `HensChallenge.ts`).
 */

import { ChallengeFactory } from "../types";
import { HensChallenge } from "./HensChallenge";

const factory: ChallengeFactory = (ctx) => new HensChallenge(ctx);
export default factory;
