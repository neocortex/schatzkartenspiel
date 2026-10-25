/**
 * The people at the ceremony: the three sages (who step forward for their
 * trial and talk), villagers sitting on the log benches and a few standing
 * at the edge of the circle. Everyone turns their head to watch the action
 * and jumps up to cheer when Tadeo passes a trial.
 */

import * as THREE from "three";
import { Humanoid } from "../../characters/Humanoid";
import { createElder, createWiseWoman, createWiseMan, createVillager } from "../../characters/cast";
import { Actor } from "../shared/actor";
import { BENCHES } from "./decor";

export type SageId = "wiseWoman" | "wiseMan" | "elder";

export const SPEAKER_SAGE: Record<string, SageId> = {
  "Weise Frau": "wiseWoman",
  "Weiser Mann": "wiseMan",
  Dorfältester: "elder",
};

interface Watcher {
  actor: Actor;
  sitting: boolean;
  seed: number;
}

export class Crowd {
  readonly group = new THREE.Group();
  readonly sages: Record<SageId, Actor>;
  readonly watchers: Watcher[] = [];
  private cheerLeft = 0;
  private watchAt = new THREE.Vector3(0, 0, 1);
  private time = 0;

  constructor(homes: Record<SageId, [number, number]>, lookAt: THREE.Vector3) {
    const face = (x: number, z: number) => Math.atan2(lookAt.x - x, lookAt.z - z);
    this.sages = {
      wiseWoman: new Actor(createWiseWoman(), ...homes.wiseWoman, face(...homes.wiseWoman)),
      wiseMan: new Actor(createWiseMan(), ...homes.wiseMan, face(...homes.wiseMan)),
      elder: new Actor(createElder(), ...homes.elder, face(...homes.elder)),
    };
    for (const s of Object.values(this.sages)) s.addTo(this.group);

    // Two villagers per bench, sitting slightly in front of the log
    let i = 0;
    for (const b of BENCHES) {
      for (const lx of [-0.55, 0.55]) {
        const x = b.x + lx * Math.cos(b.rot) + Math.sin(b.rot) * 0.32;
        const z = b.z - lx * Math.sin(b.rot) + Math.cos(b.rot) * 0.32;
        this.addWatcher(createVillager(i), x, z, b.rot, true, i++);
      }
    }
    // A few standing at the front corners of the circle
    for (const [x, z] of [[-4.6, 4.6], [4.8, 4.4], [-5.6, 3.4], [5.9, 3.2]] as const) {
      this.addWatcher(createVillager(i), x, z, face(x, z), false, i++);
    }
  }

  private addWatcher(h: Humanoid, x: number, z: number, facing: number, sitting: boolean, i: number): void {
    const actor = new Actor(h, x, z, facing);
    h.root.scale.multiplyScalar(0.9 + ((i * 37) % 10) / 60);
    if (sitting) {
      h.pose = "sit";
      // Reason: lift sitters so their hips rest on the log instead of the ground
      actor.ground = () => 0.4;
      actor.shadow.visible = false;
    }
    const w: Watcher = { actor, sitting, seed: i * 1.7 };
    actor.overlay = (av) => this.animateWatcher(w, av);
    actor.addTo(this.group);
    this.watchers.push(w);
  }

  /** Which sage (if any) speaks a dialogue line. */
  sageFor(speaker: string): Actor | null {
    const id = SPEAKER_SAGE[speaker];
    return id ? this.sages[id] : null;
  }

  /** Point everyone's eyes at something (the active drum, Tadeo, the elder). */
  watch(p: THREE.Vector3): void {
    this.watchAt.copy(p);
  }

  cheer(seconds = 2.6): void {
    this.cheerLeft = seconds;
    for (const w of this.watchers) if (!w.sitting) w.actor.avatar.pose = "cheer";
  }

  get cheering(): boolean {
    return this.cheerLeft > 0;
  }

  private animateWatcher(w: Watcher, av: Humanoid): void {
    // Turn the head (not the body) towards the action, within a natural range
    const p = w.actor.position;
    const yaw = Math.atan2(this.watchAt.x - p.x, this.watchAt.z - p.z) - w.actor.facing;
    const rel = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    av.head.rotation.y = THREE.MathUtils.clamp(rel, -1.0, 1.0) * 0.8;
    if (w.sitting && this.cheerLeft > 0) {
      // Seated cheer: arms up and waving, bouncing on the log
      const t = this.time * 9 + w.seed;
      av.armL.rotation.set(0, 0, -2.5 + Math.sin(t) * 0.25);
      av.armR.rotation.set(0, 0, 2.5 - Math.sin(t + 1) * 0.25);
      av.body.position.y = -0.3 + Math.abs(Math.sin(t * 0.8)) * 0.12;
    }
  }

  update(dt: number): void {
    this.time += dt;
    if (this.cheerLeft > 0) {
      this.cheerLeft -= dt;
      if (this.cheerLeft <= 0) for (const w of this.watchers) if (!w.sitting) w.actor.avatar.pose = "normal";
    }
    for (const s of Object.values(this.sages)) s.update(dt);
    for (const w of this.watchers) w.actor.update(dt);
  }
}
