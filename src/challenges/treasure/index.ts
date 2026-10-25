/**
 * Treasure challenge (quest 10, the finale): a little island of white sand
 * and palms in a turquoise lagoon. Tadeo walks to the red X, digs up a chest
 * frozen in ice, smashes the ice with the golden hammer, unlocks the chest
 * with the golden key and is crowned amid gold, confetti and fireworks. After
 * the victory words `finished` resolves and the party keeps going under the
 * game's end card.
 */

import { Engine, PostSettings } from "../../core/Engine";
import { audio } from "../../audio/Audio";
import { Challenge, ChallengeContext, ChallengeFactory } from "../types";
import { TreasureStage, TreasureState } from "./stage";
import { arrive, walkToX, dig, hammer, unlock, openChest, victory, party } from "./script";

class TreasureChallenge implements Challenge {
  readonly scene;
  readonly camera;
  readonly finished: Promise<void>;
  readonly post: Partial<PostSettings> = {
    bloomIntensity: 0.75,
    bloomThreshold: 0.86,
    tiltShift: true,
    tiltFocus: 1.15,
    tiltOffset: 0.0,
    saturation: 0.14,
    contrast: 0.07,
    vignette: 0.4,
    exposure: 1.0,
  };
  private stage: TreasureStage;
  private resolve!: () => void;

  constructor(ctx: ChallengeContext) {
    this.stage = new TreasureStage(ctx.ui);
    this.scene = this.stage.scene;
    this.camera = this.stage.camera;
    this.finished = new Promise((r) => (this.resolve = r));
  }

  /** Live state (read by the E2E test to steer Tadeo and time the hammer). */
  get state(): TreasureState {
    return this.stage.state;
  }

  enter(engine: Engine): void {
    this.stage.engine = engine;
    audio.playMusic("music_overworld");
    this.stage.update(0, 0);
    void this.run();
  }

  private async run(): Promise<void> {
    const s = this.stage;
    try {
      await arrive(s);
      await walkToX(s);
      await dig(s);
      await hammer(s);
      await unlock(s);
      await openChest(s);
      await victory(s);
    } catch (e) {
      console.error("Treasure challenge script failed", e);
    }
    this.resolve();
    // Reason: the celebration keeps looping behind the end card until the page reloads
    void party(s);
  }

  update(dt: number, time: number): void {
    this.stage.update(dt, time);
  }

  exit(): void {
    this.stage.dispose();
  }
}

const factory: ChallengeFactory = (ctx) => new TreasureChallenge(ctx);
export default factory;
