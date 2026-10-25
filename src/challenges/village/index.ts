/**
 * Village challenge (quest 7): an evening ceremony around the campfire on
 * the village plaza. The Weise Frau and the Weiser Mann play drum patterns
 * for Tadeo to repeat (Simon says, arrow keys), the elder asks a maths
 * question answered on glowing stones, and Tadeo receives the golden key.
 */

import { Engine, PostSettings } from "../../core/Engine";
import { audio } from "../../audio/Audio";
import { Challenge, ChallengeContext, ChallengeFactory } from "../types";
import { VillageStage, VillageState } from "./stage";
import { intro, practice, simonTrial, mathTrial, keyReward } from "./trials";

class VillageChallenge implements Challenge {
  readonly scene;
  readonly camera;
  readonly finished: Promise<void>;
  readonly post: Partial<PostSettings> = {
    bloomIntensity: 0.95,
    bloomThreshold: 0.8,
    tiltShift: true,
    tiltFocus: 0.9,
    tiltOffset: 0.05,
    saturation: 0.12,
    contrast: 0.08,
    vignette: 0.6,
    exposure: 1.08,
  };
  private stage: VillageStage;
  private resolve!: () => void;

  constructor(ctx: ChallengeContext) {
    this.stage = new VillageStage(ctx.ui);
    this.scene = this.stage.scene;
    this.camera = this.stage.camera;
    this.finished = new Promise((r) => (this.resolve = r));
  }

  /** Live trial state (read by the E2E test to know the pattern and the answer). */
  get state(): VillageState {
    return this.stage.state;
  }

  enter(engine: Engine): void {
    this.stage.engine = engine;
    audio.playMusic("music_village");
    this.stage.update(0, 0);
    void this.run();
  }

  private async run(): Promise<void> {
    const s = this.stage;
    try {
      await intro(s);
      await practice(s);
      await simonTrial(s, "wiseWoman", 3, 1);
      await simonTrial(s, "wiseMan", 4, 2);
      await mathTrial(s);
      await keyReward(s);
    } catch (e) {
      console.error("Village challenge script failed", e);
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

const factory: ChallengeFactory = (ctx) => new VillageChallenge(ctx);
export default factory;
