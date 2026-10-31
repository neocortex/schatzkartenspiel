/**
 * Festival challenge (the end of quest 12): the whole island celebrates on the
 * village plaza at night. Paco owns up, the gold goes to the village, the plan
 * turns out to be a rocket, and Chuleta lays a golden egg. `finished` resolves
 * when the fireworks start; the party then loops under the end card.
 */

import { Engine, PostSettings } from "../../core/Engine";
import { audio } from "../../audio/Audio";
import { Challenge, ChallengeContext, ChallengeFactory } from "../types";
import { Feast } from "./feast";
import { VillageStage } from "../village/stage";
import { welcome, talk, party } from "./script";

export interface FestivalState {
  phase: "talk" | "party";
  /** Who is on the plaza, by speaker name. */
  present: string[];
  fireworks: boolean;
}

class FestivalChallenge implements Challenge {
  readonly scene;
  readonly camera;
  readonly finished: Promise<void>;
  readonly post: Partial<PostSettings> = {
    bloomIntensity: 1.05,
    bloomThreshold: 0.72,
    tiltShift: false,
    saturation: 0.16,
    contrast: 0.09,
    vignette: 0.5,
    exposure: 1.12,
  };
  readonly stage: VillageStage;
  private feast: Feast;
  private resolve!: () => void;

  constructor(ctx: ChallengeContext) {
    this.stage = new VillageStage(ctx.ui);
    this.feast = new Feast(this.stage);
    this.scene = this.stage.scene;
    this.camera = this.stage.camera;
    this.finished = new Promise((r) => (this.resolve = r));
  }

  /** What the E2E proof reads. */
  get state(): FestivalState {
    return { phase: this.feast.phase, present: this.feast.present, fireworks: this.feast.fireworks.auto };
  }

  get guests() {
    return this.feast.guests;
  }

  get fireworks() {
    return this.feast.fireworks;
  }

  /** True while the opening wide shot holds still (the E2E proof takes its picture of everyone then). */
  get atWide(): boolean {
    return this.feast.atWide;
  }

  enter(engine: Engine): void {
    this.stage.engine = engine;
    audio.playMusic("music_village");
    this.update(0, 0);
    void this.run();
  }

  private async run(): Promise<void> {
    const f = this.feast;
    try {
      await welcome(f);
      await talk(f);
    } catch (e) {
      console.error("Festival script failed", e);
    }
    this.resolve();
    void party(f);
  }

  update(dt: number, time: number): void {
    this.stage.update(dt, time);
    this.feast.update(dt, time);
  }

  exit(): void {
    this.feast.dispose();
    this.stage.dispose();
  }
}

const factory: ChallengeFactory = (ctx) => new FestivalChallenge(ctx);
export default factory;
