/**
 * Quest 9 challenge entry: the boat crossing to the treasure island and the giant shark.
 */

import { ChallengeFactory } from "../types";
import { SeaChallenge } from "./SeaChallenge";

const factory: ChallengeFactory = (ctx) => new SeaChallenge(ctx);

export default factory;
