/**
 * Quest 8 — the ogre on the river bridge. A turn-based boss fight in a sunny
 * gorge: Tadeo picks Angreifen / Heilen / Spezial from big cards, the ogre
 * answers with club swipes and a telegraphed slam. Each swing can be blocked
 * with Space at the right moment (a ring closes over Tadeo and turns green).
 * Lots of juice (hit-stop, slow motion, shake, sparks, numbers) and no game
 * over: the magic berries revive Tadeo. In the end the ogre sits down, gets a
 * berry, becomes friendly and lets Tadeo cross.
 */

import * as THREE from "three";
import { Engine, PostSettings } from "../../core/Engine";
import { audio } from "../../audio/Audio";
import { Challenge, ChallengeContext } from "../types";
import { Bin, Timeline, contactShadow } from "./kit";
import { Fx } from "./fx";
import { Director } from "./director";
import { Popups } from "./popups";
import { Gorge } from "./Gorge";
import { createOgre, Ogre } from "./Ogre";
import { Hero } from "./hero";
import { FightUI } from "./FightUI";
import { BlockPrompt } from "./blockPrompt";
import { FightRules, HeroAction, HERO_MAX, OGRE_MAX } from "./fight";
import { ogrePortrait } from "./portrait";
import { deckAt } from "./gorgeShape";
import { Stage, setX, shots, heroAttack, heroHeal, heroSpecial, heroRevive, raiseShield, ogreTurn, ogreDefeat } from "./moves";
import { intro, outro } from "./story";

export type OgrePhase = "intro" | "menu" | "act" | "outro" | "done";

const HERO_HOME = -3.9;
const OGRE_HOME = 3.9;

export class OgreChallenge implements Challenge {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
  readonly post: Partial<PostSettings> = {
    bloomIntensity: 0.7,
    bloomThreshold: 0.88,
    tiltShift: true,
    tiltFocus: 1.5,
    saturation: 0.08,
    contrast: 0.06,
    vignette: 0.42,
  };
  readonly finished: Promise<void>;
  /** Where the fight is (read by the E2E test). */
  phase: OgrePhase = "intro";
  readonly rules = new FightRules();
  readonly menu: FightUI;
  /** The shield timing ring (its `now` is read by the E2E test). */
  readonly blocker: BlockPrompt;

  private resolve!: () => void;
  private bin = new Bin();
  private tl = new Timeline();
  private fx = new Fx(this.bin);
  private cam = new Director(this.camera);
  private popups: Popups;
  private gorge: Gorge;
  private ogre: Ogre = createOgre();
  private hero = new Hero(this.bin);
  private stage: Stage;
  private shadows: [THREE.Object3D, THREE.Mesh][] = [];
  private engine!: Engine;
  private sceneTime = 0;
  private timeScale = 1;
  private slowLeft = 0;
  private hitStopLeft = 0;
  /** Keep Tadeo's bar at zero until the berry revival plays. */
  private holdHeroZero = false;

  constructor(private ctx: ChallengeContext) {
    this.finished = new Promise((r) => (this.resolve = r));
    this.popups = new Popups(ctx.ui.layer, this.camera);
    this.gorge = new Gorge(this.scene, this.fx, this.bin);
    this.scene.add(this.fx.group);
    const portrait = ogrePortrait();
    // Reason: the shared dialogue box looks portraits up by key; register the ogre's at runtime
    ctx.ui.portraits.ogre = portrait;
    this.menu = new FightUI(ctx.ui, portrait);
    this.blocker = new BlockPrompt(ctx.ui, this.camera);

    const bridge = this.gorge.bridge;
    bridge.add(this.hero.root, this.ogre.root);
    for (const [obj, r] of [[this.hero.root, 0.55], [this.ogre.root, 1.3]] as const) {
      const sh = contactShadow(r, 0.55);
      bridge.add(sh);
      this.shadows.push([obj, sh]);
    }
    setX(this.hero.root, HERO_HOME);
    setX(this.ogre.root, OGRE_HOME);
    this.hero.root.rotation.y = Math.PI / 2 - 0.35;
    this.ogre.root.rotation.y = -Math.PI / 2 + 0.4;

    this.stage = {
      tl: this.tl,
      hero: this.hero,
      ogre: this.ogre,
      fx: this.fx,
      cam: this.cam,
      pop: this.popups,
      bridge,
      scene: this.scene,
      heroHome: HERO_HOME,
      ogreHome: OGRE_HOME,
      ogreRest: { pose: "idle", mood: "grumpy" },
      hitStop: (s) => (this.hitStopLeft = Math.max(this.hitStopLeft, s)),
      slowmo: (scale, s) => {
        this.timeScale = scale;
        this.slowLeft = s;
      },
      onHealth: () => this.showHealth(),
      block: (lead, slow) => this.blocker.run(this.stage, lead, () => this.hero.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.95, 0)), slow, () => raiseShield(this.stage)),
    };
    shots.wide(this.stage);
    this.cam.cut(new THREE.Vector3(-9, 21, -10), new THREE.Vector3(-3, 8, -30));
  }

  enter(engine: Engine): void {
    this.engine = engine;
    void this.run();
  }

  exit(): void {
    this.menu.destroy();
    this.blocker.destroy();
    this.popups.clear();
    this.ctx.ui.status(null);
    this.ctx.ui.dialogue.onLine = null;
    this.bin.dispose(this.scene);
  }

  update(dt: number): void {
    let sdt = dt * this.timeScale;
    if (this.slowLeft > 0) {
      this.slowLeft -= dt;
      if (this.slowLeft <= 0) this.timeScale = 1;
    }
    if (this.hitStopLeft > 0) {
      this.hitStopLeft -= dt;
      sdt = dt * 0.03;
    }
    this.sceneTime += sdt;
    // Reason: latch Space for the shield ring before the timeline runs this frame's steps
    if (this.engine) this.blocker.update(this.engine.input);
    this.tl.update(sdt);
    this.gorge.update(sdt, this.sceneTime);
    this.ogre.update(sdt);
    this.hero.update(sdt);
    this.fx.update(sdt);
    this.popups.update(dt);
    this.cam.update(dt);
    if (this.engine) this.menu.update(dt, this.engine.input, this.ctx.ui.dialogue.isOpen);
    for (const [obj, sh] of this.shadows) {
      const x = obj.position.x;
      const ground = deckAt(x);
      sh.position.set(x, ground + 0.04, obj.position.z);
      sh.scale.setScalar(THREE.MathUtils.clamp(1 - (obj.position.y - ground) / 4, 0.35, 1));
      sh.visible = obj.visible && obj.position.y > ground - 0.5;
    }
  }

  private async run(): Promise<void> {
    const ui = this.ctx.ui;
    await intro(this.stage, ui);
    audio.playMusic("music_combat");
    this.menu.showBars(HERO_MAX, OGRE_MAX);
    this.menu.setCharge(0);
    shots.wide(this.stage);
    this.hero.pose = "stance";
    await ui.hud.showBanner("Bosskampf!", "Der Oger", 2000);
    await this.fight();
    this.phase = "outro";
    this.menu.hide();
    await ogreDefeat(this.stage);
    ui.status(null);
    await outro(this.stage, ui);
    this.phase = "done";
    this.resolve();
  }

  private async fight(): Promise<void> {
    const r = this.rules;
    const s = this.stage;
    while (!r.won) {
      this.phase = "menu";
      this.hero.pose = "stance";
      const slamNext = r.nextOgreMove === "slam";
      this.menu.warn(slamNext ? "Gleich haut der Oger zu! Pass gut auf! 🛡️" : null);
      const action = await this.menu.choose();
      this.menu.warn(null);
      this.phase = "act";
      await this.heroTurn(action);
      if (r.won) break;
      const res = await ogreTurn(s, r.nextOgreMove, (blocked) => {
        const result = r.ogre(blocked);
        this.holdHeroZero = result.revived;
        return result;
      });
      this.hero.setShield(false);
      this.menu.setCharge(r.charge);
      if (res.revived) {
        this.holdHeroZero = false;
        await heroRevive(s);
      }
    }
  }

  private async heroTurn(action: HeroAction): Promise<void> {
    const value = this.rules.hero(action);
    this.menu.setCharge(this.rules.charge);
    const s = this.stage;
    if (action === "attack") await heroAttack(s, value);
    else if (action === "special") await heroSpecial(s, value);
    else await heroHeal(s, value);
  }

  private showHealth(): void {
    this.menu.setHealth("hero", this.holdHeroZero ? 0 : this.rules.heroHp, HERO_MAX);
    this.menu.setHealth("ogre", this.rules.ogreHp, OGRE_MAX);
  }
}
