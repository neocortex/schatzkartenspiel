/**
 * Tadeo's little mended sailboat (the island's north-dock boat) riding the
 * swell: it bobs, pitches and rolls with the waves, leans into turns, throws
 * spray off the bow and carries Tadeo — sitting at the stern while sailing, or
 * standing with the magic berries, ready to throw one to the shark.
 */

import * as THREE from "three";
import { Humanoid } from "../../characters/Humanoid";
import { createTadeo } from "../../characters/cast";
import { createBerries } from "../../world/models/items";
import { sailboat, NORTH_DOCK_BOAT } from "../../world/models/boats";
import { SignAtlas } from "../../world/models/signs";
import { ModelMaterials, modelGroup, clamp01, ease, lerp } from "../ogre/kit";
import { Fx } from "../ogre/fx";
import { seaHeight } from "./ocean";

export type SailorPose = "sit" | "stand" | "throw" | "cheer" | "duck";

/** How far the raised arm leans out, so the berries are held beside Tadeo's face and not in front of it. */
const READY_OUT = 0.7;

export class Boat {
  /** Position on the water and heading (yaw 0 = bow towards -z). */
  readonly root = new THREE.Group();
  /** Pitch and roll on the swell. */
  readonly tilt = new THREE.Group();
  readonly hero: Humanoid;
  readonly berries: THREE.Group;
  pose: SailorPose = "sit";
  /** Throw progress 0..1 while `pose === "throw"`. */
  throwK = 0;
  /** Which side Tadeo faces when standing (+1 = starboard/+x, -1 = port). */
  side = 1;
  /** Forward speed and sideways velocity (set by the challenge). */
  speed = 0;
  vx = 0;
  /** 0 afloat … 1 resting on the beach (no more bobbing, bow lifted). */
  aground = 0;
  /** False once Tadeo has jumped ashore (the challenge animates him then). */
  aboard = true;
  /** Extra heave from splashes (decays). */
  private kick = 0;
  private kickV = 0;
  private t = 0;
  private lastBow = 0;
  private turn = 0;

  constructor(
    atlas: SignAtlas,
    mats: ModelMaterials,
    private fx: Fx,
  ) {
    this.root.add(this.tilt);
    const model = modelGroup(sailboat(atlas, { ...NORTH_DOCK_BOAT, patched: true }, null, 23), mats);
    // Reason: boat models point their bow along +x; the course runs towards -z
    model.rotation.y = Math.PI / 2;
    this.tilt.add(model);

    this.hero = createTadeo();
    this.tilt.add(this.hero.root);
    this.berries = createBerries();
    this.berries.scale.setScalar(1.6);
    // Reason: the raised arm points the hand's -y at the sky, so the bunch is turned over to stand upright in the fist
    this.berries.rotation.x = Math.PI;
    this.berries.position.set(0, -0.04, 0.02);
    this.berries.visible = false;
    this.hero.handR.add(this.berries);
  }

  get x(): number {
    return this.root.position.x;
  }

  get z(): number {
    return this.root.position.z;
  }

  /** Splash hit: the boat jumps and wobbles. */
  bump(amount: number): void {
    this.kickV += amount * 6;
  }

  /** World position of the bow tip. */
  bowPos(target = new THREE.Vector3()): THREE.Vector3 {
    return this.tilt.localToWorld(target.set(0, 0.6, -2.6));
  }

  update(dt: number, time: number): void {
    this.t += dt;
    const { x, z } = this.root.position;
    const yaw = this.root.rotation.y;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    // Sample the swell at bow, stern and both sides
    const bow = seaHeight(x + fx * 2, z + fz * 2, time);
    const stern = seaHeight(x - fx * 2, z - fz * 2, time);
    const port = seaHeight(x + fz * 0.9, z - fx * 0.9, time);
    const star = seaHeight(x - fz * 0.9, z + fx * 0.9, time);
    this.kickV += (-this.kick * 40 - this.kickV * 5) * dt;
    this.kick += this.kickV * dt;
    const k = Math.min(dt * 6, 1);
    const afloat = 1 - this.aground;
    // Reason: riding a little low sits the hull deep in the swell
    this.root.position.y = lerp(this.root.position.y, ((bow + stern + port + star) * 0.25 - 0.1) * afloat + this.aground * 0.4 + this.kick, k);
    this.turn = lerp(this.turn, this.vx, Math.min(dt * 4, 1));
    this.tilt.rotation.x = lerp(this.tilt.rotation.x, (Math.atan2(bow - stern, 4) * 0.8) * afloat - this.aground * 0.07 - this.kick * 0.25, k);
    this.tilt.rotation.z = lerp(this.tilt.rotation.z, (Math.atan2(port - star, 1.8) * 0.5 + this.turn * 0.035) * afloat + Math.sin(this.t * 7) * this.kick * 0.15, k);

    // Spray when the bow cuts into a wave
    if (this.speed > 2 && bow - this.lastBow < -0.012 && Math.random() < 0.5) {
      const at = this.bowPos();
      this.fx.puff.emit({ at, count: 3, speed: [2, 4], dir: new THREE.Vector3(Math.sign(Math.random() - 0.5) * 0.8, 1, 0.3), spread: 0.35, gravity: 9, drag: 0.6, jitter: 0.3, life: [0.4, 0.7], size: [0.22, 0.08], color: ["#ffffff", "#d9f6ff"], alpha: 0.9 });
    }
    this.lastBow = bow;
    if (this.aboard) this.updateSailor(dt);
  }

  private updateSailor(dt: number): void {
    const h = this.hero;
    const standing = this.pose !== "sit";
    h.pose = this.pose === "cheer" ? "cheer" : this.pose === "sit" ? "sit" : "normal";
    // Standing on the floorboards amidships (on the side he faces, clear of the sail), or sitting on the stern thwart
    h.root.position.set(standing ? this.side * 0.42 : 0, standing ? 0.05 : 0.2, standing ? 0.35 : 1.25);
    h.root.rotation.y = standing ? (this.side > 0 ? Math.PI / 2 : -Math.PI / 2) : Math.PI;
    h.update(dt, { speed: 0, grounded: true, vy: 0 });
    const a = h;
    const t = this.t;
    if (this.pose === "sit") {
      // Lean into turns, one hand on the gunwale, looking ahead
      a.torso.rotation.z = -this.turn * 0.05;
      a.armL.rotation.set(-0.3, 0, -0.9);
      a.armR.rotation.set(-0.5, 0, 0.6 + Math.sin(t * 2) * 0.05);
    } else if (this.pose === "stand") {
      // Berries held up high, knees bent, bouncing on the toes
      a.body.position.y += -0.06 + Math.abs(Math.sin(t * 5)) * 0.04;
      a.armR.rotation.set(-2.5 + Math.sin(t * 5) * 0.08, 0, READY_OUT);
      a.armL.rotation.set(-0.6, 0, -0.5);
      a.legL.rotation.x = -0.25;
      a.legR.rotation.x = 0.2;
    } else if (this.pose === "throw") {
      // A quick wind-up behind the head, then the arm whips forward and up, towards the mouth
      const s = this.throwK;
      const back = ease.outQuad(clamp01(s / 0.2));
      const forward = ease.outCubic(clamp01((s - 0.2) / 0.4));
      a.armR.rotation.set(lerp(lerp(-2.5, -3.4, back), -1.75, forward), 0, lerp(READY_OUT, 0.05, forward));
      a.armL.rotation.set(lerp(-0.6, 0.2, forward), 0, -0.7);
      a.torso.rotation.x = lerp(-0.2 * back, 0.28, forward);
      a.legL.rotation.x = -0.35;
      a.legR.rotation.x = 0.3;
    } else if (this.pose === "duck") {
      a.body.position.y -= 0.25;
      a.armL.rotation.set(-2.6, 0, -0.6);
      a.armR.rotation.set(-2.4, 0, 0.6);
      a.head.rotation.x = 0.3;
    }
  }
}
