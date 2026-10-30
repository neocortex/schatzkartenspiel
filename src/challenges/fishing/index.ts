/**
 * Side game "Angeln mit Fischer Jonas": Tadeo sits at the end of Jonas' jetty
 * in the golden late-afternoon light and fishes in a clear turquoise lagoon.
 * Arrow keys aim, Space casts and, when the float goes under, Space pulls.
 * Five fish win (there is no way to lose). Loaded lazily by the registry.
 */

import * as THREE from "three";
import { audio } from "../../audio/Audio";
import { Engine, PostSettings } from "../../core/Engine";
import { Challenge, ChallengeContext, ChallengeFactory } from "../types";
import { playFishing } from "./flow";
import { FishingGame } from "./game";

class FishingChallenge implements Challenge {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(46, 1, 0.1, 2400);
  readonly post: Partial<PostSettings> = {
    bloomIntensity: 0.75,
    bloomThreshold: 0.86,
    tiltShift: true,
    tiltFocus: 1.3,
    tiltOffset: 0.06,
    saturation: 0.18,
    contrast: 0.1,
    vignette: 0.4,
  };
  readonly finished: Promise<void>;
  private resolve!: () => void;
  private game: FishingGame | null = null;

  constructor(private ctx: ChallengeContext) {
    this.finished = new Promise((r) => (this.resolve = r));
  }

  /** Live state for the E2E test (`window.engine.scene.state`). */
  get state(): object {
    return this.game?.state ?? { game: "fishing", phase: "loading" };
  }

  enter(engine: Engine): void {
    // Reason: build here, behind the black fade, so the island doesn't freeze before it fades out
    const g = new FishingGame(this.ctx.ui, this.scene, this.camera);
    g.engine = engine;
    this.game = g;
    g.update(1 / 60, engine.time);
    audio.playMusic("music_village");
    audio.setAmbience(true);
    void playFishing(g).then(() => this.resolve());
  }

  update(dt: number, time: number): void {
    this.game?.update(dt, time);
  }

  exit(): void {
    this.game?.dispose();
    this.game = null;
    this.ctx.ui.status(null);
  }
}

const create: ChallengeFactory = (ctx) => new FishingChallenge(ctx);
export default create;
