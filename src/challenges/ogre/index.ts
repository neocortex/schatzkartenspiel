/**
 * Quest 8 challenge entry: the ogre boss fight on the river bridge.
 */

import { ChallengeFactory } from "../types";
import { OgreChallenge } from "./OgreChallenge";

const factory: ChallengeFactory = (ctx) => new OgreChallenge(ctx);

export default factory;
