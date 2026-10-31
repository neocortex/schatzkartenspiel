/**
 * The bridge ogre: a big, lovable-grumpy green ogre (about twice Tadeo's
 * height) with a knobbly wooden club, built from outlined toon primitives in
 * the island's character style. Procedurally animated: idle breathing and
 * weight shifts, blinking, eased blending between key poses (roar, wind-up,
 * slam, swipe, flinch, sit, wave, munch) and facial moods. Free of any
 * challenge logic so it can also stand on the island.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mat, toonMesh } from "../../characters/parts";

const C = {
  skin: "#7fb648",
  skinDark: "#5d8f33",
  belly: "#a9d46c",
  pants: "#7a5230",
  patch: "#b08452",
  belt: "#4a2f1c",
  gold: "#ffc83d",
  leather: "#94602f",
  fur: "#a27a52",
  furDark: "#7d5a39",
  ivory: "#fff4d6",
  mouth: "#5a1f1a",
  tongue: "#e86a6a",
  pupil: "#1d1410",
  bandage: "#f6e6c4",
  blush: "#f39a7f",
  wood: "#a0703f",
  woodDark: "#6e4528",
  leaf: "#5fb83a",
  hair: "#4a3020",
};

export type OgrePose = "idle" | "roar" | "windup" | "slam" | "swipeWind" | "swipe" | "hit" | "sit" | "wave" | "munch" | "stomp" | "lift" | "fling";
export type OgreMood = "grumpy" | "angry" | "hurt" | "happy" | "dizzy";

/** Joint angles and offsets a pose sets (radians / units). Missing keys fall back to IDLE. */
type PoseParams = Record<(typeof KEYS)[number], number>;

const KEYS = [
  "bodyY", "lean", "sway", "torsoX", "torsoY", "torsoZ", "headX", "headY", "headZ",
  "lsx", "lsz", "lex", "rsx", "rsy", "rsz", "rex", "wrist", "legL", "legR", "spread",
] as const;

const IDLE: PoseParams = {
  bodyY: 0, lean: 0, sway: 0, torsoX: 0.04, torsoY: 0, torsoZ: 0, headX: 0.05, headY: 0, headZ: 0,
  lsx: 0.15, lsz: -0.42, lex: -0.9, rsx: -0.45, rsy: 0, rsz: 0.32, rex: -2.05, wrist: 0, legL: 0, legR: 0, spread: 0.06,
};

const POSES: Record<OgrePose, Partial<PoseParams>> = {
  idle: {},
  stomp: { bodyY: 0.08, legL: -0.5, lean: 0.06 },
  roar: { torsoX: -0.25, headX: -0.35, lsx: -2.5, lsz: -0.75, lex: -0.5, rsx: -2.3, rsz: 0.7, rex: -0.9, bodyY: 0.05, spread: 0.12 },
  windup: { torsoX: -0.3, headX: -0.2, lsx: -2.75, lsz: -0.35, lex: -0.7, rsx: -2.95, rsz: 0.18, rex: -0.25, wrist: 0.8, bodyY: 0.12, legL: 0.15, legR: -0.1 },
  slam: { torsoX: 0.5, headX: 0.15, lsx: -0.55, lsz: -0.3, lex: -0.4, rsx: -0.35, rsz: 0.1, rex: -0.1, wrist: 0.9, bodyY: -0.28, spread: 0.2, legL: -0.25, legR: 0.25 },
  swipeWind: { torsoY: 0.95, torsoX: -0.08, headY: -0.6, rsx: -1.35, rsz: 1.25, rex: -0.9, wrist: -0.2, lsx: -0.8, lsz: -0.2, lex: -1.2, bodyY: -0.05 },
  swipe: { torsoY: -0.9, torsoX: 0.12, headY: 0.4, rsx: -1.45, rsz: -0.35, rex: -0.25, wrist: 0.25, lsx: 0.3, lsz: -0.9, lex: -0.3, bodyY: -0.12, spread: 0.15 },
  hit: { torsoX: -0.38, headX: -0.32, headZ: 0.15, lsz: -1.15, lsx: -0.6, lex: -0.3, rsz: 1.0, rsx: -0.5, rex: -1.0, bodyY: -0.06, legL: -0.2 },
  sit: { bodyY: -0.86, torsoX: -0.12, headX: 0.12, legL: -1.45, legR: -1.38, spread: 0.22, lsx: -0.75, lsz: -0.25, lex: -0.65, rsx: -0.7, rsz: 0.25, rex: -0.7, wrist: 0 },
  wave: { bodyY: -0.86, torsoX: -0.12, headX: -0.05, headZ: 0.12, legL: -1.45, legR: -1.38, spread: 0.22, lsx: -2.75, lsz: -0.55, lex: -0.35, rsx: -0.7, rsz: 0.25, rex: -0.7 },
  munch: { bodyY: -0.86, torsoX: -0.05, headX: 0.08, legL: -1.45, legR: -1.38, spread: 0.22, lsx: -1.55, lsz: 0.35, lex: -1.75, rsx: -0.7, rsz: 0.25, rex: -0.7 },
  // Reason: the club hand stays out of it: the left arm goes straight up under a heavy load, the other fist on the hip, leaning back to balance it
  lift: { torsoX: -0.2, headX: -0.3, bodyY: -0.2, lean: -0.06, legL: 0.12, legR: -0.12, spread: 0.2, lsx: -3.05, lsz: -0.15, lex: -0.12, rsx: 0.25, rsz: 0.7, rex: -1.7 },
  // The follow-through of a throw: the arm that was up swings forward and down, the whole body leans after it
  fling: { torsoX: 0.4, headX: 0.15, bodyY: -0.14, legL: -0.3, legR: 0.2, spread: 0.18, lsx: -1.25, lsz: -0.2, lex: -0.15, rsx: 0.45, rsz: 0.8, rex: -1.2 },
};

export class Ogre {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly elbowL = new THREE.Group();
  readonly elbowR = new THREE.Group();
  readonly handL = new THREE.Group();
  readonly handR = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  /** The club (child of handR until dropped). Its local +y runs from grip to tip. */
  readonly club = new THREE.Group();
  /** Ring of dizzy stars above the head (shown with the "dizzy" mood). */
  readonly dizzy = new THREE.Group();
  /** Pose blend speed (higher = snappier). */
  blend = 6;
  mood: OgreMood = "grumpy";
  /** 0..1 stomping walk cycle layered on top of the pose. */
  walk = 0;
  /** Flap the mouth while speaking. */
  talking = false;

  private cur: PoseParams = { ...IDLE };
  private target: PoseParams = { ...IDLE };
  private poseName: OgrePose = "idle";
  private t = 0;
  private stride = 0;
  private blinkTimer = 2;
  private squash = 0;
  private eyes: THREE.Group[] = [];
  private pupils: THREE.Mesh[] = [];
  private brows: THREE.Mesh[] = [];
  private frown!: THREE.Mesh;
  private smile!: THREE.Mesh;
  private open!: THREE.Group;
  private tmp = new THREE.Vector3();

  constructor() {
    this.root.add(this.body);
    this.buildLegs();
    this.buildTorso();
    this.buildArms();
    this.buildHead();
    this.buildClub();
    this.applyPose();
  }

  get pose(): OgrePose {
    return this.poseName;
  }

  /** Blend towards a key pose; `speed` sets how snappy the move is. */
  setPose(p: OgrePose, speed = 6): void {
    this.poseName = p;
    this.blend = speed;
    this.target = { ...IDLE, ...POSES[p] };
  }

  /** Jump to a pose without blending. */
  snapPose(p: OgrePose): void {
    this.setPose(p);
    this.cur = { ...this.target };
  }

  /** Cartoon squash & stretch impulse (positive = squash down, negative = stretch). */
  bounce(amount: number): void {
    this.squash = amount;
  }

  /** World position of the club tip (for impact effects). */
  clubTip(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.club.localToWorld(out.set(0, 2.25, 0));
  }

  /** World position slightly in front of the face. */
  headPos(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.head.localToWorld(out.set(0, 0.25, 0.4));
  }

  /** World position of the belly front (where sword hits land). */
  bellyPos(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.torso.localToWorld(out.set(0, 0.7, 0.85));
  }

  /** Detach the club, keeping its world transform; returns it (caller adds it to the scene). */
  dropClub(): THREE.Group {
    this.root.updateMatrixWorld(true);
    const m = this.club.matrixWorld.clone();
    this.handR.remove(this.club);
    m.decompose(this.club.position, this.club.quaternion, this.club.scale);
    return this.club;
  }

  update(dt: number): void {
    this.t += dt;
    this.stride += dt * 7.5 * this.walk;
    const k = 1 - Math.exp(-dt * this.blend);
    for (const key of KEYS) this.cur[key] += (this.target[key] - this.cur[key]) * k;
    this.squash += (0 - this.squash) * Math.min(dt * 7, 1);
    this.applyPose();
    this.applyFace(dt);
    this.dizzy.rotation.y += dt * 4;
  }

  // ── Animation ─────────────────────────────────────────────

  private applyPose(): void {
    const p = this.cur;
    const t = this.t;
    // Reason: idle life (breathing, weight shift) is additive so every pose still breathes
    const breathe = Math.sin(t * 1.9);
    const shift = Math.sin(t * 0.85);
    const s = this.squash;
    this.body.position.y = p.bodyY + breathe * 0.012;
    this.body.rotation.set(p.lean, 0, p.sway + shift * 0.025);
    this.body.scale.set(1 + s * 0.16, 1 - s * 0.2, 1 + s * 0.16);
    this.torso.rotation.set(p.torsoX + breathe * 0.015, p.torsoY, p.torsoZ - shift * 0.02);
    this.torso.scale.set(1 + breathe * 0.012, 1 + breathe * 0.018, 1 + breathe * 0.012);
    this.head.rotation.set(p.headX + Math.sin(t * 1.3) * 0.03, p.headY + Math.sin(t * 0.43) * 0.12, p.headZ + shift * 0.03);
    this.armL.rotation.set(p.lsx + breathe * 0.03, 0, p.lsz - breathe * 0.02);
    this.elbowL.rotation.x = p.lex;
    this.armR.rotation.set(p.rsx - breathe * 0.025, p.rsy, p.rsz + breathe * 0.02);
    this.elbowR.rotation.x = p.rex;
    this.handR.rotation.x = p.wrist;
    this.legL.rotation.set(p.legL, 0, -p.spread);
    this.legR.rotation.set(p.legR, 0, p.spread);
    if (this.walk > 0) {
      // Reason: heavy waddle — legs swing, the body rolls side to side and bobs on every step
      const w = this.walk;
      const st = Math.sin(this.stride);
      this.legL.rotation.x += st * 0.55 * w;
      this.legR.rotation.x -= st * 0.55 * w;
      this.body.position.y += Math.abs(Math.cos(this.stride)) * 0.1 * w;
      this.body.rotation.z += st * 0.07 * w;
      this.armL.rotation.x -= st * 0.3 * w;
    }
    if (this.poseName === "wave") this.armL.rotation.z += Math.sin(t * 9) * 0.35;
    if (this.poseName === "munch") this.elbowL.rotation.x += Math.sin(t * 12) * 0.12;
  }

  private applyFace(dt: number): void {
    // Blink (eyes stay squeezed shut while hurt)
    this.blinkTimer -= dt;
    let open = 1;
    if (this.blinkTimer < 0.14) open = Math.abs(this.blinkTimer - 0.07) / 0.07;
    if (this.blinkTimer < 0) this.blinkTimer = 2 + Math.random() * 3;
    const m = this.mood;
    if (m === "hurt") open = 0.12;
    if (m === "angry") open *= 0.7;
    for (const e of this.eyes) e.scale.y = Math.max(open, 0.1);
    // Dizzy pupils roll around
    this.pupils.forEach((p, i) => {
      if (m === "dizzy") p.position.set(Math.cos(this.t * 9 + i * Math.PI) * 0.035, Math.sin(this.t * 9 + i * Math.PI) * 0.035, 0.06);
      else p.position.set(0, 0, 0.06);
    });
    const browTilt = { grumpy: 0.42, angry: 0.62, hurt: -0.35, happy: -0.18, dizzy: -0.1 }[m];
    const browY = { grumpy: 0.46, angry: 0.43, hurt: 0.53, happy: 0.53, dizzy: 0.51 }[m];
    this.brows.forEach((b, i) => {
      const side = i === 0 ? -1 : 1;
      b.rotation.z = Math.PI / 2 + side * browTilt;
      b.position.y += (browY - b.position.y) * Math.min(dt * 10, 1);
    });
    this.frown.visible = m === "grumpy";
    this.smile.visible = m === "happy";
    this.open.visible = m === "angry" || m === "hurt" || m === "dizzy" || this.poseName === "roar";
    this.open.scale.y = this.poseName === "roar" ? 1.35 : m === "dizzy" ? 0.6 : 1;
    if (this.talking) {
      const open = Math.sin(this.t * 13) > -0.2;
      this.open.visible = open;
      this.open.scale.y = 0.5 + Math.abs(Math.sin(this.t * 13)) * 0.5;
      this.frown.visible = !open && m === "grumpy";
      this.smile.visible = !open && m === "happy";
    }
    this.dizzy.visible = m === "dizzy";
  }

  // ── Model ─────────────────────────────────────────────────

  private buildLegs(): void {
    for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
      leg.position.set(side * 0.42, 0.95, 0);
      const pant = toonMesh(new THREE.CapsuleGeometry(0.29, 0.32, 6, 14), mat(C.pants, 0.8));
      pant.position.y = -0.36;
      leg.add(pant);
      const cuff = toonMesh(new THREE.TorusGeometry(0.27, 0.06, 6, 14), mat(C.patch, 0.8), false);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.62;
      leg.add(cuff);
      const shin = toonMesh(new THREE.CylinderGeometry(0.22, 0.24, 0.24, 12), mat(C.skin, 0.6));
      shin.position.y = -0.73;
      leg.add(shin);
      const foot = toonMesh(new RoundedBoxGeometry(0.52, 0.26, 0.7, 3, 0.11), mat(C.skin, 0.6));
      foot.position.set(0, -0.83, 0.12);
      leg.add(foot);
      for (let i = -1; i <= 1; i++) {
        const toe = toonMesh(new THREE.SphereGeometry(0.095, 10, 8), mat(C.skin, 0.6));
        toe.position.set(i * 0.15, -0.86, 0.46);
        leg.add(toe);
        const nail = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(C.ivory, 0.4));
        nail.scale.set(1, 0.6, 0.6);
        nail.position.set(i * 0.15, -0.82, 0.54);
        leg.add(nail);
      }
      this.body.add(leg);
    }
  }

  private buildTorso(): void {
    this.torso.position.y = 1.0;
    this.body.add(this.torso);
    const skin = mat(C.skin, 0.6);
    const belly = toonMesh(new THREE.SphereGeometry(0.92, 32, 24), skin);
    belly.scale.set(1.08, 1.0, 0.94);
    belly.position.y = 0.62;
    this.torso.add(belly);
    const patch = toonMesh(new THREE.SphereGeometry(0.74, 28, 20), mat(C.belly, 0.6), false);
    patch.scale.set(1, 1.05, 0.55);
    patch.position.set(0, 0.55, 0.5);
    this.torso.add(patch);
    const navel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(C.skinDark, 0.7));
    navel.position.set(0, 0.42, 0.9);
    this.torso.add(navel);
    const chest = toonMesh(new THREE.SphereGeometry(0.78, 28, 20), skin);
    chest.scale.set(1.28, 0.82, 0.9);
    chest.position.y = 1.3;
    this.torso.add(chest);
    // Shorts with a patch, belt and buckle
    const shorts = toonMesh(new THREE.CylinderGeometry(0.98, 0.9, 0.55, 24), mat(C.pants, 0.8));
    shorts.scale.z = 0.95;
    shorts.position.y = 0.02;
    this.torso.add(shorts);
    const knee = toonMesh(new RoundedBoxGeometry(0.32, 0.26, 0.06, 2, 0.03), mat(C.patch, 0.8), false);
    knee.position.set(-0.45, -0.02, 0.84);
    knee.rotation.set(-0.15, -0.45, 0.2);
    this.torso.add(knee);
    const belt = toonMesh(new THREE.TorusGeometry(0.97, 0.075, 8, 32), mat(C.belt, 0.6), false);
    belt.rotation.x = Math.PI / 2;
    belt.scale.y = 0.95;
    belt.position.y = 0.3;
    this.torso.add(belt);
    const buckle = toonMesh(new RoundedBoxGeometry(0.28, 0.22, 0.08, 2, 0.04), mat(C.gold, 0.3, 0.3));
    buckle.position.set(0, 0.3, 0.93);
    this.torso.add(buckle);
    // Leather sash over the left shoulder with a pouch, fur on the left shoulder
    const strapPath = new THREE.CatmullRomCurve3(
      [
        [-0.78, 1.72, 0.0], [-0.5, 1.45, 0.72], [-0.12, 1.08, 0.97], [0.3, 0.72, 1.0], [0.72, 0.38, 0.8],
        [0.95, 0.3, 0.1], [0.62, 0.55, -0.75], [0.0, 1.05, -0.92], [-0.6, 1.55, -0.6],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      true,
    );
    const strap = toonMesh(new THREE.TubeGeometry(strapPath, 48, 0.075, 6, true), mat(C.leather, 0.7), false);
    strap.scale.set(1, 1, 1);
    this.torso.add(strap);
    const pouch = toonMesh(new RoundedBoxGeometry(0.3, 0.3, 0.16, 2, 0.06), mat(C.leather, 0.7));
    pouch.position.set(0.7, 0.42, 0.62);
    pouch.rotation.set(0, 0.6, 0.2);
    this.torso.add(pouch);
    for (let i = 0; i < 6; i++) {
      const tuft = toonMesh(new THREE.SphereGeometry(0.23, 10, 8), mat(i % 2 ? C.fur : C.furDark, 0.9));
      const a = (i / 6) * Math.PI - 0.2;
      tuft.position.set(-0.85 + Math.cos(a) * 0.12, 1.55 + Math.sin(a) * 0.12, -0.3 + i * 0.12);
      this.torso.add(tuft);
    }
  }

  private buildArms(): void {
    const skin = mat(C.skin, 0.6);
    for (const [arm, elbow, hand, side] of [[this.armL, this.elbowL, this.handL, -1], [this.armR, this.elbowR, this.handR, 1]] as const) {
      arm.position.set(side * 1.02, 1.42, 0);
      const upper = toonMesh(new THREE.CapsuleGeometry(0.25, 0.4, 6, 12), skin);
      upper.position.y = -0.3;
      arm.add(upper);
      elbow.position.y = -0.6;
      arm.add(elbow);
      const fore = toonMesh(new THREE.CapsuleGeometry(0.31, 0.32, 6, 12), skin);
      fore.position.y = -0.3;
      elbow.add(fore);
      const band = toonMesh(new THREE.TorusGeometry(0.25, 0.07, 6, 14), mat(C.leather, 0.7), false);
      band.rotation.x = Math.PI / 2;
      band.position.y = -0.52;
      elbow.add(band);
      const fist = toonMesh(new THREE.SphereGeometry(0.32, 16, 12), skin);
      fist.scale.set(1, 0.92, 1.05);
      fist.position.y = -0.74;
      elbow.add(fist);
      const thumb = toonMesh(new THREE.SphereGeometry(0.12, 10, 8), skin);
      thumb.position.set(-side * 0.2, -0.66, 0.2);
      elbow.add(thumb);
      hand.position.y = -0.74;
      elbow.add(hand);
      this.torso.add(arm);
    }
  }

  private buildHead(): void {
    this.head.position.y = 2.0;
    this.head.scale.setScalar(1.16);
    this.torso.add(this.head);
    const skin = mat(C.skin, 0.6);
    const skull = toonMesh(new THREE.SphereGeometry(0.54, 28, 20), skin);
    skull.scale.set(1.08, 1.0, 1.0);
    skull.position.y = 0.2;
    this.head.add(skull);
    const jaw = toonMesh(new THREE.SphereGeometry(0.5, 28, 18), skin);
    jaw.scale.set(1.24, 0.66, 1.02);
    jaw.position.set(0, -0.1, 0.1);
    this.head.add(jaw);
    // Tusks poking up from the underbite
    for (const side of [-1, 1]) {
      const tusk = toonMesh(new THREE.ConeGeometry(0.065, 0.22, 8), mat(C.ivory, 0.4));
      tusk.position.set(side * 0.25, 0.06, 0.52);
      tusk.rotation.set(0.15, 0, -side * 0.2);
      this.head.add(tusk);
    }
    // Mouth variants: frown, smile, open roar
    const arc = new THREE.TorusGeometry(0.15, 0.032, 6, 18, Math.PI * 0.8);
    this.frown = new THREE.Mesh(arc, mat(C.mouth, 0.6));
    this.frown.position.set(0, -0.17, 0.64);
    this.frown.scale.set(1.2, 0.55, 1);
    this.frown.rotation.set(-0.35, 0, Math.PI * 0.1);
    this.smile = new THREE.Mesh(arc, mat(C.mouth, 0.6));
    this.smile.position.set(0, -0.02, 0.65);
    this.smile.scale.set(1.25, 0.8, 1);
    this.smile.rotation.set(-0.35, 0, Math.PI + Math.PI * 0.1);
    this.open = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat(C.mouth, 0.6));
    hole.scale.set(1.25, 0.7, 0.45);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), mat(C.tongue, 0.6));
    tongue.scale.set(1.2, 0.5, 0.5);
    tongue.position.set(0, -0.07, 0.04);
    this.open.add(hole, tongue);
    this.open.position.set(0, -0.1, 0.6);
    this.head.add(this.frown, this.smile, this.open);
    // Big bulbous nose with nostrils and a wart
    const nose = toonMesh(new THREE.SphereGeometry(0.14, 16, 12), mat(C.skinDark, 0.55));
    nose.scale.set(1.15, 0.9, 1);
    nose.position.set(0, 0.12, 0.62);
    this.head.add(nose);
    for (const side of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat(C.mouth, 0.6));
      nostril.position.set(side * 0.06, 0.06, 0.73);
      this.head.add(nostril);
    }
    const wart = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(C.skinDark, 0.6));
    wart.position.set(0.12, 0.26, 0.7);
    this.head.add(wart);
    // Eyes, heavy brows, rosy cheeks
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12), mat("#ffffff", 0.3));
      white.scale.set(1, 1.15, 0.55);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), mat(C.pupil, 0.25));
      pupil.scale.set(1, 1.1, 0.6);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), mat("#ffffff", 0.2, 0.6));
      shine.position.set(-0.018, 0.025, 0.04);
      pupil.add(shine);
      eye.add(white, pupil);
      eye.position.set(side * 0.21, 0.31, 0.47);
      eye.rotation.y = side * 0.35;
      this.head.add(eye);
      this.eyes.push(eye);
      this.pupils.push(pupil);
      const brow = toonMesh(new THREE.CapsuleGeometry(0.05, 0.2, 4, 8), mat(C.hair, 0.7), false);
      brow.position.set(side * 0.22, 0.45, 0.5);
      this.head.add(brow);
      this.brows.push(brow);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(C.blush, 0.7));
      cheek.scale.set(1, 0.6, 0.3);
      cheek.position.set(side * 0.4, 0.08, 0.5);
      cheek.rotation.y = side * 0.6;
      this.head.add(cheek);
      // Big pointy ears with an inner fold
      const ear = toonMesh(new THREE.ConeGeometry(0.17, 0.5, 10), skin);
      ear.scale.set(1, 1, 0.45);
      ear.position.set(side * 0.66, 0.26, -0.02);
      ear.rotation.set(0, 0, -side * 1.2);
      this.head.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 8), mat(C.skinDark, 0.6));
      inner.scale.set(1, 1, 0.3);
      inner.position.set(side * 0.67, 0.25, 0.03);
      inner.rotation.set(0, 0, -side * 1.2);
      this.head.add(inner);
    }
    // Gold earring on the left ear
    const ring = toonMesh(new THREE.TorusGeometry(0.07, 0.02, 6, 14), mat(C.gold, 0.3, 0.4), false);
    ring.position.set(-0.78, 0.1, 0.02);
    ring.rotation.y = Math.PI / 2;
    this.head.add(ring);
    // A scruffy tuft of hair and a crossed plaster
    for (let i = 0; i < 4; i++) {
      const tuft = toonMesh(new THREE.ConeGeometry(0.08, 0.32, 6), mat(C.hair, 0.8));
      tuft.position.set((i - 1.5) * 0.08, 0.74, 0.05 - i * 0.04);
      tuft.rotation.set(-0.3 + i * 0.12, 0, (i - 1.5) * 0.35);
      this.head.add(tuft);
    }
    for (const r of [0.7, -0.7]) {
      const strip = toonMesh(new RoundedBoxGeometry(0.28, 0.08, 0.03, 2, 0.015), mat(C.bandage, 0.8), false);
      strip.position.set(-0.32, 0.55, 0.36);
      strip.rotation.set(-0.6, -0.55, r);
      this.head.add(strip);
    }
    // Dizzy stars (hidden until the "dizzy" mood)
    this.dizzy.position.y = 1.02;
    for (let i = 0; i < 5; i++) {
      const star = new THREE.Mesh(starGeometry(0.11), mat("#ffe066", 0.3, 1.6));
      const a = (i / 5) * Math.PI * 2;
      star.position.set(Math.cos(a) * 0.62, Math.sin(a * 2) * 0.06, Math.sin(a) * 0.62);
      this.dizzy.add(star);
    }
    this.dizzy.visible = false;
    this.head.add(this.dizzy);
  }

  private buildClub(): void {
    const g = this.club;
    const wood = mat(C.wood, 0.75);
    const handle = toonMesh(new THREE.CylinderGeometry(0.1, 0.11, 0.8, 10), mat(C.woodDark, 0.75));
    handle.position.y = 0.2;
    g.add(handle);
    for (const y of [-0.05, 0.12, 0.29]) {
      const wrap = toonMesh(new THREE.TorusGeometry(0.115, 0.03, 6, 12), mat(C.belt, 0.7), false);
      wrap.rotation.x = Math.PI / 2;
      wrap.position.y = y;
      g.add(wrap);
    }
    const headGeo = new THREE.CylinderGeometry(0.36, 0.15, 1.5, 14, 6);
    // Reason: bulge the club head unevenly so it reads as a gnarly piece of wood
    const pos = headGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const k = 1 + Math.sin(a * 3 + y * 4) * 0.07 + Math.sin(a * 5 - y * 7) * 0.04;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    headGeo.computeVertexNormals();
    const clubHead = toonMesh(headGeo, wood);
    clubHead.position.y = 1.32;
    g.add(clubHead);
    const cap = toonMesh(new THREE.SphereGeometry(0.36, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), wood);
    cap.scale.y = 0.55;
    cap.position.y = 2.07;
    g.add(cap);
    const knots: [number, number][] = [[1.0, 0.4], [1.45, 2.6], [1.75, 4.6], [1.2, 5.6]];
    for (const [y, a] of knots) {
      const r = 0.15 + ((y - 0.57) / 1.5) * 0.21;
      const knot = toonMesh(new THREE.SphereGeometry(0.085, 10, 8), mat(C.woodDark, 0.8));
      knot.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      g.add(knot);
    }
    // A little sprout with two leaves — the club is still growing
    const twig = toonMesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6), mat(C.woodDark, 0.8));
    twig.position.set(0.3, 1.75, 0.05);
    twig.rotation.z = -0.8;
    g.add(twig);
    for (const s of [-1, 1]) {
      const leaf = toonMesh(new THREE.SphereGeometry(0.1, 10, 6), mat(C.leaf, 0.6));
      leaf.scale.set(1, 0.3, 0.55);
      leaf.position.set(0.44, 1.86 + s * 0.04, 0.05 + s * 0.06);
      leaf.rotation.set(s * 0.5, 0, -0.3 + s * 0.4);
      g.add(leaf);
    }
    // Reason: club +y points along the fist's forward axis, so arm poses swing it naturally
    g.rotation.x = Math.PI / 2;
    g.position.set(0, -0.02, 0);
    this.handR.add(g);
  }
}

/** Flat five-pointed star (extruded a little) for dizzy rings. */
export function starGeometry(r: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: r * 0.35, bevelEnabled: true, bevelSize: r * 0.12, bevelThickness: r * 0.12, bevelSegments: 1 });
  g.center();
  return g;
}

/** Build the bridge ogre (faces +z, feet at y = 0, about 3.7 units tall). */
export function createOgre(): Ogre {
  return new Ogre();
}
