/**
 * Treasure challenge (quest 11): a little island of white sand and palms in a
 * turquoise lagoon. The map card shows the X, Tadeo walks to it, digs up a
 * chest frozen in Zaubereis, smashes the ice with the golden hammer and
 * unlocks the chest with the golden key. It holds Paco's note, the stolen
 * Feuerherz, a rolled-up plan, gold and a crown. Then the volcano on the
 * horizon erupts, and `finished` resolves.
 */

import { Engine, PostSettings } from "../../core/Engine";
import { audio } from "../../audio/Audio";
import { Challenge, ChallengeContext, ChallengeFactory } from "../types";
import { TreasureStage, TreasureState } from "./stage";
import { arrive, walkToX, dig, hammer, unlock, openChest, erupt } from "./script";

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
      await erupt(s);
    } catch (e) {
      console.error("Treasure challenge script failed", e);
    }
    this.resolve();
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
