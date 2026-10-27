/**
 * The people on the jetty: Tadeo sitting at the edge with his rod (casting,
 * pulling, showing off a catch, cheering), Fischer Jonas beside him in his
 * old fishing hat with his own lazily bobbing float, and Henni sitting on the
 * mooring post, turning her head, clucking and flapping when it's exciting.
 * Poses are layered on top of the Humanoid's own idle animation each frame.
 */

import * as THREE from "three";
import { Humanoid } from "../../characters/Humanoid";
import { createTadeo, createVillager } from "../../characters/cast";
import { createOutfit } from "../../characters/hats";
import { createHenniModel } from "../../characters/Henni";
import { mat, toonMesh } from "../../characters/parts";
import { DECK, DECK_END, HENNI_POST } from "./dock";
import { Tackle } from "./tackle";
import { swell } from "./water";

export type Action = "hold" | "rest" | "windup" | "throw" | "pull" | "yank" | "show" | "cheer" | "wave";

/** Arm/torso targets per action: right arm pitch, left arm pitch, left arm spread, torso lean. */
const POSES: Record<Action, { r: number; l: number; lz: number; lean: number }> = {
  hold: { r: -0.72, l: -0.55, lz: -0.15, lean: 0 },
  // Rod lowered towards the water, so in the talk shots the bobber hangs below everyone's faces
  rest: { r: -0.3, l: -0.5, lz: -0.15, lean: 0 },
  windup: { r: -2.75, l: -0.4, lz: -0.3, lean: -0.12 },
  throw: { r: -0.35, l: -0.7, lz: -0.2, lean: 0.12 },
  pull: { r: -1.05, l: -1.0, lz: -0.05, lean: -0.16 },
  yank: { r: -2.45, l: -1.2, lz: -0.4, lean: -0.22 },
  show: { r: -1.2, l: -1.4, lz: -0.2, lean: -0.05 },
  cheer: { r: -2.6, l: -2.6, lz: -0.9, lean: -0.05 },
  wave: { r: -0.3, l: -2.7, lz: -0.6, lean: 0 },
};

/** Where Tadeo sits (feet over the water, facing the sea). */
export const TADEO_AT = new THREE.Vector3(0.32, DECK - 0.02, DECK_END + 0.3);
/** Where a fresh catch is held up for everyone to see: at head height, between Tadeo and Henni. */
export const HOLD_AT = TADEO_AT.clone().add(new THREE.Vector3(0.6, 1.2, -0.5));
const JONAS_AT = new THREE.Vector3(-0.85, DECK - 0.02, DECK_END + 0.3);
/** Where Jonas's own float bobs. */
const JONAS_FLOAT = new THREE.Vector3(-3.4, 0, -4.6);

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Crew {
  readonly group = new THREE.Group();
  readonly tadeo = createTadeo();
  readonly jonas = createVillager(0);
  readonly henni = createHenniModel();
  /** Who is talking right now (dialogue or bubble): their mouth/beak moves. */
  speaker: string | null = null;
  /** Where Tadeo (and Henni) look: usually the bobber. */
  readonly lookAt = new THREE.Vector3(0, 0, -6);
  private action: Action = "hold";
  private actionTime = 0;
  private cur = { ...POSES.hold };
  private henniFlap = 0;
  private henniLook = 0;
  private henniLookTarget = 0;
  private henniLookTimer = 1;
  private henniChatter = 0;
  private jonasCheer = 0;
  private jonasRodTip = new THREE.Object3D();
  private jonasFloat: THREE.Group;
  private jonasLine: THREE.Line;
  private tmp = new THREE.Vector3();

  constructor(tackle: Tackle) {
    const t = this.tadeo;
    t.pose = "sit";
    t.root.position.copy(TADEO_AT);
    t.root.rotation.y = Math.PI;
    t.handR.add(tackle.rod);
    tackle.rod.rotation.set(0.2, 0, 0);

    const j = this.jonas;
    j.pose = "sit";
    j.root.position.copy(JONAS_AT);
    j.root.rotation.y = Math.PI + 0.3;
    const hat = createOutfit("fishingHat");
    j.head.add(hat);
    // Jonas's bamboo rod with his own float out on the water
    const rod = new THREE.Group();
    const blank = toonMesh(new THREE.CylinderGeometry(0.012, 0.03, 2.3, 6).rotateX(Math.PI / 2), mat("#c9a65a", 0.7));
    blank.position.z = 1.0;
    this.jonasRodTip.position.z = 2.15;
    rod.add(blank, this.jonasRodTip);
    rod.rotation.x = 0.1;
    j.handR.add(rod);
    this.jonasFloat = new THREE.Group();
    const cap = toonMesh(new THREE.SphereGeometry(0.08, 12, 8), mat("#ff8a1a", 0.4, 0.4));
    cap.scale.y = 1.3;
    this.jonasFloat.add(cap);
    this.jonasFloat.position.copy(JONAS_FLOAT);
    this.jonasLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 16 }, () => new THREE.Vector3())),
      new THREE.LineBasicMaterial({ color: 0xf0ece0, transparent: true, opacity: 0.75 }),
    );
    this.jonasLine.frustumCulled = false;

    this.henni.root.scale.setScalar(0.7);
    this.henni.root.position.copy(HENNI_POST);
    this.henni.root.rotation.y = Math.PI - 0.5;

    this.group.add(t.root, j.root, this.henni.root, this.jonasFloat, this.jonasLine);
  }

  /** Start a rod action (casting, pulling, showing a fish, cheering). */
  act(a: Action): void {
    this.action = a;
    this.actionTime = 0;
  }

  /** Henni flaps and hops for a moment. */
  exciteHenni(seconds = 1.6): void {
    if (this.henniFlap <= 0) this.henni.kick(0.6);
    this.henniFlap = seconds;
  }

  /** Jonas throws his arms up for a moment. */
  cheerJonas(seconds = 1.4): void {
    this.jonasCheer = seconds;
  }

  update(dt: number, time: number): void {
    this.actionTime += dt;
    // Reason: wind-up and throw are quick one-shots that settle back into holding the rod
    if (this.action === "throw" && this.actionTime > 0.45) this.act("hold");
    const target = POSES[this.action];
    const speed = this.action === "throw" || this.action === "yank" ? 22 : this.action === "windup" ? 9 : 6;
    const k = 1 - Math.exp(-dt * speed);
    for (const key of ["r", "l", "lz", "lean"] as const) this.cur[key] += (target[key] - this.cur[key]) * k;

    const t = this.tadeo;
    t.pose = this.speaker === "Tadeo" ? "talk" : "sit";
    t.update(dt, { speed: 0, grounded: true, vy: 0 });
    this.sit(t);
    const bounce = this.action === "cheer" ? Math.abs(Math.sin(time * 9)) * 0.12 : 0;
    t.body.position.y = -0.3 + bounce;
    t.armR.rotation.set(this.cur.r + (this.action === "cheer" ? Math.sin(time * 12) * 0.2 : 0), 0, 0.12);
    t.armL.rotation.set(this.cur.l, 0, this.cur.lz + (this.action === "wave" ? Math.sin(time * 10) * 0.35 : 0));
    t.torso.rotation.x = this.cur.lean;
    this.lookTowards(t, this.lookAt, this.speaker === "Tadeo" ? Math.sin(time * 9) * 0.06 : 0);

    const j = this.jonas;
    this.jonasCheer = Math.max(0, this.jonasCheer - dt);
    j.pose = this.speaker === "Fischer Jonas" ? "talk" : "sit";
    j.update(dt, { speed: 0, grounded: true, vy: 0 });
    this.sit(j);
    if (this.jonasCheer > 0) {
      j.armR.rotation.set(-2.5 + Math.sin(time * 11) * 0.2, 0, 0.3);
      j.armL.rotation.set(-2.5 - Math.sin(time * 11) * 0.2, 0, -0.3);
      j.body.position.y = -0.3 + Math.abs(Math.sin(time * 8)) * 0.08;
    } else {
      j.armR.rotation.set(-0.8 + Math.sin(time * 0.7) * 0.04, 0, 0.1);
      if (this.speaker !== "Fischer Jonas") j.armL.rotation.set(-0.5, 0, -0.15);
    }
    // Jonas glances over to Tadeo while either of them talks, otherwise watches his float
    const watch = this.speaker ? this.tmp.copy(this.tadeo.root.position).setY(DECK + 0.8) : JONAS_FLOAT;
    this.lookTowards(j, watch, this.speaker === "Fischer Jonas" ? Math.sin(time * 9) * 0.06 : 0);

    this.updateJonasFloat(time);
    this.updateHenni(dt, time);
  }

  /** Sit on the deck edge: legs forward over the water, a little lower in the hips. */
  private sit(h: Humanoid): void {
    h.legL.rotation.x = -1.45;
    h.legR.rotation.x = -1.35;
    h.body.position.y = -0.3;
  }

  /** Turn the head (within limits) towards a world point; `nod` adds to the pitch (talking). */
  private lookTowards(h: Humanoid, at: THREE.Vector3, nod: number): void {
    const p = h.root.position;
    const yaw = Math.atan2(at.x - p.x, at.z - p.z) - h.root.rotation.y;
    const rel = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    h.head.rotation.y = THREE.MathUtils.clamp(rel, -1.0, 1.0);
    const down = Math.atan2(p.y + 1.3 - at.y, Math.hypot(at.x - p.x, at.z - p.z));
    h.head.rotation.x = THREE.MathUtils.clamp(down * 0.6, -0.3, 0.45) + nod;
  }

  private updateJonasFloat(time: number): void {
    const f = this.jonasFloat.position;
    f.y = swell(f.x, f.z, time) + Math.max(0, Math.sin(time * 0.9) - 0.96) * -1.2;
    this.jonasRodTip.updateWorldMatrix(true, false);
    const a = this.jonasRodTip.getWorldPosition(this.tmp);
    const pos = this.jonasLine.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const k = i / (pos.count - 1);
      pos.setXYZ(i, a.x + (f.x - a.x) * k, a.y + (f.y + 0.08 - a.y) * k - Math.sin(k * Math.PI) * 0.35, a.z + (f.z - a.z) * k);
    }
    pos.needsUpdate = true;
  }

  private updateHenni(dt: number, time: number): void {
    const m = this.henni;
    this.henniFlap = Math.max(0, this.henniFlap - dt);
    const flapping = this.henniFlap > 0;
    // Hops up and down on the post with her wings going when it's exciting
    m.root.position.y = HENNI_POST.y + (flapping ? Math.abs(Math.sin(time * 9)) * 0.12 : 0);
    // Face the action (the bobber) with the occasional curious head turn
    const want = Math.atan2(this.lookAt.x - HENNI_POST.x, this.lookAt.z - HENNI_POST.z);
    let d = want - m.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    m.root.rotation.y += d * Math.min(dt * 3, 1);
    this.henniLookTimer -= dt;
    if (this.henniLookTimer < 0) {
      this.henniLookTarget = (Math.random() - 0.5) * 1.2;
      this.henniLookTimer = rnd(0.8, 2.6);
    }
    this.henniLook += (this.henniLookTarget - this.henniLook) * Math.min(dt * 10, 1);
    if (this.speaker === "Henni") {
      this.henniChatter -= dt;
      if (this.henniChatter < 0) {
        m.cluck(0.09);
        this.henniChatter = 0.18;
      }
    }
    m.update(dt, { speed: 0, flap: flapping ? 1 : 0, peck: 0, sit: flapping ? 0 : 1, pant: false, look: this.henniLook, air: flapping });
  }
}
