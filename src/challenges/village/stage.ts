/**
 * VillageStage — the 3D ceremony scene and its toolbox for the trial script:
 * plaza, drums, answer stones, the crowd and Tadeo, the camera director,
 * celebration effects, plus awaitable helpers (sleep, wait for a key press,
 * framed dialogue) so the trials in `trials.ts` read like a little play.
 */

import * as THREE from "three";
import { Engine } from "../../core/Engine";
import { GameUI } from "../../ui/GameUI";
import { DialogueScript } from "../../data/dialogues";
import { createTadeo } from "../../characters/cast";
import { Humanoid } from "../../characters/Humanoid";
import { toonMesh, mat } from "../../characters/parts";
import { glowTexture } from "../../world/ambient/textures";
import { Plaza } from "./plaza";
import { Drums, DrumKey } from "./drums";
import { AnswerStones } from "./stones";
import { Crowd, SageId } from "./crowd";
import { Actor } from "../shared/actor";
import { Director, Shot, shot } from "../shared/director";
import { Particles, createConfetti, confettiBurst } from "../shared/particles";
import { VillageHud } from "./hud";
import { Owned } from "../shared/dispose";

export const FIRE_AT = new THREE.Vector3(0, 0, -5.4);
export const DRUM_CENTER = new THREE.Vector3(0, 0, 1.3);
export const SAGE_SPOT: [number, number] = [0, -2.35];
export const STONES_AT = new THREE.Vector3(0, 0, -0.7);
export const SAGE_HOMES: Record<SageId, [number, number]> = {
  wiseWoman: [-3.3, -2.7],
  wiseMan: [3.3, -2.7],
  elder: [-1.6, -3.9],
};

export const WIDE: Shot = shot(0, 5.3, 10.6, 0, 0.75, -1.3);
export const PLAY: Shot = shot(0, 7.1, 8.0, 0, 0.3, -0.5);

export interface VillageState {
  phase: "intro" | "practice" | "show" | "input" | "feedback" | "math" | "reward" | "done";
  trial: number;
  sequence: DrumKey[];
  progress: number;
  answers: number[];
  correct: number;
  selected: number;
}

interface Timer {
  left: number;
  resolve: () => void;
}

export class VillageStage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2500);
  readonly owned = new Owned();
  readonly director: Director;
  readonly plaza: Plaza;
  readonly drums: Drums;
  readonly stones: AnswerStones;
  readonly crowd: Crowd;
  readonly tadeo: Actor;
  readonly hud: VillageHud;
  readonly confetti: Particles;
  readonly sparkles: Particles;
  readonly state: VillageState = { phase: "intro", trial: 0, sequence: [], progress: 0, answers: [], correct: -1, selected: 1 };
  engine!: Engine;
  private mallets: THREE.Group[] = [];
  private hitT = 9;
  private timers: Timer[] = [];
  private waiter: { keys: readonly string[]; resolve: (k: string) => void } | null = null;
  private time = 0;

  constructor(readonly ui: GameUI) {
    this.scene.fog = new THREE.Fog("#9a7c9a", 38, 170);
    this.director = new Director(this.camera);
    this.plaza = new Plaza(this.owned, FIRE_AT, DRUM_CENTER);
    this.drums = new Drums(DRUM_CENTER, 1.62, this.owned);
    this.stones = new AnswerStones(STONES_AT, 1.95, this.owned);
    this.crowd = new Crowd(SAGE_HOMES, DRUM_CENTER);
    this.tadeo = new Actor(createTadeo(), DRUM_CENTER.x, 8.5, Math.PI);
    this.tadeo.overlay = (h, dt) => this.animateTadeo(h, dt);
    this.tadeo.addTo(this.scene);
    this.buildMallets();
    this.hud = new VillageHud(ui);

    this.confetti = createConfetti(900, () => 0.01);
    const sparkleMat = this.owned.add(new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparkles = new Particles({ geometry: new THREE.PlaneGeometry(0.3, 0.3), material: sparkleMat, max: 400, gravity: -0.4, drag: 1.2, billboard: true, fade: "color", renderOrder: 4 });
    this.owned.add(this.confetti.mesh.material as THREE.Material);
    this.scene.add(this.plaza.group, this.drums.group, this.stones.group, this.crowd.group, this.confetti.mesh, this.sparkles.mesh);
    this.director.cut(shot(-15, 13, 24, 0, 1.2, -3));
  }

  // ── Awaitable helpers ─────────────────────────────────────

  sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => this.timers.push({ left: seconds, resolve }));
  }

  /** Resolve with the next pressed key out of `keys` (ignored while a dialogue is open). */
  nextKey(keys: readonly string[]): Promise<string> {
    return new Promise((resolve) => (this.waiter = { keys, resolve }));
  }

  /**
   * Play a dialogue; whoever speaks gets the talking pose and the camera frames
   * them (or holds `fixed` for the whole conversation), then glides to `back`.
   */
  async say(script: string | DialogueScript, back: Shot | null = PLAY, fixed: Shot | null = null): Promise<void> {
    if (fixed) void this.director.move(fixed, 1.0);
    this.hud.setHintVisible(false);
    this.ui.dialogue.onLine = (speaker) => {
      const sage = this.crowd.sageFor(speaker);
      for (const s of Object.values(this.crowd.sages)) s.avatar.pose = s === sage ? "talk" : "normal";
      if (this.tadeo.avatar.pose !== "holdUp") this.tadeo.avatar.pose = speaker === "Tadeo" ? "talk" : "normal";
      const who = sage ?? (speaker === "Tadeo" ? this.tadeo : null);
      if (who && who !== this.tadeo) this.tadeo.faceTo(who.position.x, who.position.z);
      if (who && !fixed) void this.director.move(this.closeUp(who), 1.0);
    };
    await this.ui.say(script);
    this.ui.dialogue.onLine = null;
    for (const s of Object.values(this.crowd.sages)) s.avatar.pose = "normal";
    if (this.tadeo.avatar.pose === "talk") this.tadeo.avatar.pose = "normal";
    this.hud.setHintVisible(true);
    if (back) await this.director.move(back, 1.0);
  }

  /** Over-the-shoulder medium shot of a character, framed above the dialogue box. */
  closeUp(a: Actor): Shot {
    const f = a === this.tadeo ? Math.atan2(0.45, 1) : a.facing;
    const fwd = new THREE.Vector3(Math.sin(f), 0, Math.cos(f));
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const p = a.position;
    const h = a.avatar.height;
    // Reason: aim at the chest so the face sits in the upper third, clear of the dialogue box
    return {
      pos: p.clone().addScaledVector(fwd, 4.6).addScaledVector(side, 1.5).add(new THREE.Vector3(0, h * 1.2, 0)),
      look: p.clone().addScaledVector(side, 0.3).add(new THREE.Vector3(0, h * 0.5, 0)),
    };
  }

  // ── Effects ───────────────────────────────────────────────

  /** Tadeo bonks a drum: he turns to it, leans in and swings the mallets. */
  tadeoHit(key: DrumKey): void {
    const p = this.drums.position(key);
    this.tadeo.faceTo(p.x, p.z);
    this.hitT = 0;
    this.drums.play(key);
    this.crowd.watch(p);
  }

  showMallets(on: boolean): void {
    for (const m of this.mallets) m.visible = on;
  }

  /** Big cheer: confetti cannons, sparkles, the fire roars, villagers jump. */
  celebrate(strength = 1, sparkles = true): void {
    for (const sx of [-1, 1]) {
      confettiBurst(this.confetti, new THREE.Vector3(sx * 6.4, 2.9, -4.6), new THREE.Vector3(-sx * 0.5, 1, 0.55), Math.round(160 * strength), 10);
      confettiBurst(this.confetti, new THREE.Vector3(sx * 8, 2.4, 3), new THREE.Vector3(-sx * 0.6, 1, -0.2), Math.round(90 * strength), 9);
    }
    this.plaza.fire.flare();
    this.crowd.cheer(3);
    if (sparkles) this.sparkleAt(this.tadeo.position.clone().add(new THREE.Vector3(0, 1, 0)), 40, "#ffd75e");
  }

  sparkleAt(at: THREE.Vector3, count: number, color: THREE.ColorRepresentation, speed = 3): void {
    const c = new THREE.Color(color).multiplyScalar(3);
    this.sparkles.emit(count, (p) => {
      p.pos.copy(at);
      p.vel.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      p.color.copy(c);
      p.life = 0.8 + Math.random() * 0.9;
      p.size = 0.6 + Math.random() * 0.9;
    });
  }

  // ── Frame ─────────────────────────────────────────────────

  update(dt: number, time: number): void {
    this.time = time;
    const input = this.engine?.input;
    const talking = this.ui.dialogue.isOpen;
    if (this.waiter && input && !talking && !this.engine.isSwitching) {
      for (const k of this.waiter.keys) {
        if (input.consume(k)) {
          const w = this.waiter;
          this.waiter = null;
          w.resolve(k);
          break;
        }
      }
    }
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.left -= dt;
      if (t.left <= 0) {
        this.timers.splice(i, 1);
        t.resolve();
      }
    }
    this.plaza.update(dt, time, this.camera);
    this.drums.update(dt, time, this.camera);
    this.stones.update(dt, time);
    this.crowd.update(dt);
    this.tadeo.update(dt);
    this.confetti.update(dt, this.camera, time);
    this.sparkles.update(dt, this.camera, time);
    this.director.update(dt);
  }

  private animateTadeo(h: Humanoid, dt: number): void {
    this.hitT += dt;
    const k = Math.min(this.hitT / 0.34, 1);
    // Lean into the drum on the hit, then settle back
    const lean = Math.sin(Math.min(this.hitT / 0.3, 1) * Math.PI) * 0.32;
    this.tadeo.lean.set(Math.sin(this.tadeo.facing) * lean, 0, Math.cos(this.tadeo.facing) * lean);
    if (!this.mallets[0]?.visible) return;
    // Mallets ready in front; on a hit both arms snap down onto the skin and recoil
    const recoil = k < 1 ? Math.sin(k * Math.PI) : 0;
    const strike = k < 1 ? 1 - k : 0;
    const t = this.time;
    h.armR.rotation.x = -1.25 - recoil * 0.9 + strike * 0.35 + Math.sin(t * 3) * 0.04;
    h.armL.rotation.x = -1.25 - recoil * 0.7 + strike * 0.3 + Math.sin(t * 3 + 1) * 0.04;
    h.armR.rotation.z = 0.32;
    h.armL.rotation.z = -0.32;
    h.torso.rotation.x = 0.12 + strike * 0.18;
  }

  private buildMallets(): void {
    const stick = new THREE.CylinderGeometry(0.022, 0.026, 0.5, 6).translate(0, 0.25, 0);
    const head = new THREE.SphereGeometry(0.075, 12, 8).translate(0, 0.52, 0);
    const h = this.tadeo.avatar;
    for (const parent of [h.handR, h.armL]) {
      const g = new THREE.Group();
      g.add(toonMesh(stick, mat("#8a5a32", 0.7)), toonMesh(head, mat("#fff1d0", 0.6)));
      // Reason: point the stick forward-down from the fist so its head lands on the drum skin
      g.rotation.x = Math.PI / 2 + 0.55;
      if (parent === h.armL) g.position.y = -0.34;
      g.visible = false;
      parent.add(g);
      this.mallets.push(g);
    }
  }

  dispose(): void {
    this.ui.dialogue.onLine = null;
    this.hud.dispose();
    this.owned.disposeScene(this.scene);
  }
}
