/**
 * Contract between the game flow and the challenge minigames.
 *
 * Every challenge lives in `src/challenges/<name>/index.ts` and default-exports
 * a `ChallengeFactory`. The game flow fades into the challenge scene, waits for
 * `finished`, then fades back to the island and hands out the quest reward.
 * Challenges play their own dialogues (via `ctx.ui.say`) and never "game over":
 * a mistake gently restarts the current attempt, because the player is seven.
 */

import { Engine, GameScene } from "../core/Engine";
import { GameUI } from "../ui/GameUI";

export interface ChallengeContext {
  engine: Engine;
  ui: GameUI;
}

export interface Challenge extends GameScene {
  /** Resolves once the player has won the challenge. */
  readonly finished: Promise<void>;
}

export type ChallengeFactory = (ctx: ChallengeContext) => Challenge;

/** Quest challenges, followed by the side games villagers offer at any time. */
export type ChallengeName =
  | "volcano"
  | "cave"
  | "forest"
  | "ogre"
  | "village"
  | "mountain"
  | "sea"
  | "treasure"
  | "finale"
  | "festival"
  | "fishing"
  | "hens";
