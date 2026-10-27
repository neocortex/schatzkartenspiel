/**
 * Henni — Tadeo's brown speckled hen, with a red neckerchief like his. She
 * struts after him on the ground and pecks about while he stands still. She
 * flutters up onto his head when he rests for a while, wades into the water or
 * leaves her far behind, and hops down again once he has walked on for a bit.
 * Setting `guide` sends her running to a spot instead (to show the way).
 */

import * as THREE from "three";
import { HenModel, HenLook, HenPose } from "./HenModel";
import { Player } from "./Player";
import { mat, toonMesh } from "./parts";
import { henVoice } from "../audio/henVoice";

export const HENNI_LOOK: HenLook = {
  kind: "hen",
  body: "#9c5b32",
  wing: "#7a4223",
  tail: "#3a281d",
  chest: "#c48552",
  speckle: "#f4e3c4",
};

/** Henni's size (Mia's hens are 1): small enough to sit on Tadeo's head. */
const SCALE = 0.7;
/** Seconds Tadeo stands still before she flutters up onto his head. */
const PERCH_AFTER_REST = 5;
/** Seconds of walking on dry land before she hops down again. */
const HOP_DOWN_AFTER = 3;
/** Further behind than this, she gives up running and flies to his head. */
const CATCH_UP = 11;
const RUN_SPEED = 8.6;
/** How close she runs up to the spot she shows (so she doesn't bump into a hen there). */
const GUIDE_GAP = 0.9;
const GRAVITY = 22;
const RADIUS = 0.18;
/** Her spot beside and a little behind Tadeo (in his frame, +z = where he looks). */
const BESIDE = new THREE.Vector3(-0.85, 0, -0.7);
const UP = new THREE.Vector3(0, 1, 0);

/** Henni's model: the toon hen in her colours, wearing Tadeo's red neckerchief. */
export function createHenniModel(): HenModel {
  const hen = new HenModel(HENNI_LOOK);
  const red = mat("#e63946", 0.7);
  const scarf = toonMesh(new THREE.TorusGeometry(0.12, 0.034, 8, 18), red, false);
  scarf.rotation.x = Math.PI / 2 - 0.45;
  scarf.position.set(0, 0.63, 0.14);
  hen.body.add(scarf);
  const knot = toonMesh(new THREE.ConeGeometry(0.075, 0.13, 4), red, false);
  knot.rotation.x = Math.PI + 0.35;
  knot.position.set(0, 0.55, 0.27);
  hen.body.add(knot);
  return hen;
}

type Mode = "walk" | "hop" | "ride";

export class Henni {
  readonly model = createHenniModel();
  readonly position = new THREE.Vector3();
  /** True while her speech bubble shows: the beak chatters. */
  talking = false;
  /** When set, she runs to this spot and waits there, clucking. */
  guide: THREE.Vector3 | null = null;
  private mode: Mode = "walk";
  private velocity = new THREE.Vector3();
  private goal = new THREE.Vector3();
  private perch = new THREE.Object3D();
  private perchAt = new THREE.Vector3();
  private yaw = 0;
  private hopHeight = 0;
  private vy = 0;
  private rest = 0;
  private walked = 0;
  private hop = { from: new THREE.Vector3(), to: "head" as "head" | "ground", t: 0, duration: 1, arc: 1 };
  private pose: HenPose = { speed: 0, flap: 0, peck: 0, sit: 0, pant: false, look: 0, air: false };
  private peckIn = 2;
  private peckLeft = 0;
  private glanceIn = 2;
  private glance = 0;
  private chatter = 0;
  private panicked = false;
  private tadeoGrounded = true;
  private tmp = new THREE.Vector3();

  constructor(private player: Player) {
    // Reason: a perch point on top of the head moves with every bob and squash of Tadeo's animation
    this.perch.position.set(0, 0.37, -0.02);
    player.avatar.head.add(this.perch);
    this.model.root.scale.setScalar(SCALE);
  }

  get root(): THREE.Group {
    return this.model.root;
  }

  /** Height of the perch above Tadeo's head centre (higher when he wears a hat). */
  setPerchHeight(y: number): void {
    this.perch.position.y = y;
  }

  /** Put Henni right next to Tadeo (after teleports), or on the ground at `at`. */
  snap(at?: THREE.Vector3): void {
    this.velocity.set(0, 0, 0);
    this.hopHeight = 0;
    this.vy = 0;
    const spot = at ?? this.besideTadeo(this.tmp);
    if (spot && this.dryLand(spot.x, spot.z)) {
      this.mode = "walk";
      this.position.set(spot.x, this.player.world.groundHeight(spot.x, spot.z), spot.z);
    } else {
      this.mode = "ride";
      this.perch.getWorldPosition(this.position);
    }
    this.goal.copy(this.position);
    this.yaw = this.player.facing;
    this.model.root.position.copy(this.position);
  }

  update(dt: number): void {
    const p = this.player;
    const tadeoSpeed = Math.hypot(p.velocity.x, p.velocity.z);
    this.rest = tadeoSpeed < 0.3 && p.grounded ? this.rest + dt : 0;
    p.avatar.head.updateWorldMatrix(true, false);
    this.perch.getWorldPosition(this.perchAt);

    this.pose.flap = 0;
    this.pose.peck = 0;
    this.pose.sit = 0;
    this.pose.air = false;
    if (this.mode === "walk") this.walk(dt, tadeoSpeed);
    else if (this.mode === "hop") this.flutter(dt);
    else this.ride(dt, tadeoSpeed);
    this.tadeoGrounded = p.grounded;

    this.lookAround(dt);
    if (this.talking) {
      this.chatter -= dt;
      if (this.chatter < 0) {
        this.model.cluck(0.09);
        this.chatter = 0.18;
      }
    }
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.yaw;
    this.model.update(dt, this.pose);
  }

  private walk(dt: number, tadeoSpeed: number): void {
    const p = this.player;
    const w = p.world;
    const behind = Math.hypot(p.position.x - this.position.x, p.position.z - this.position.z);
    if (!this.guide && (behind > CATCH_UP || p.wading || this.rest > PERCH_AFTER_REST || !this.dryLand(this.position.x, this.position.z))) {
      this.startHop("head");
      return;
    }

    // Run to her spot beside Tadeo (or next to the guide); while he stands still she stays and pecks about
    if (this.guide) {
      const gx = this.position.x - this.guide.x;
      const gz = this.position.z - this.guide.z;
      const gd = Math.hypot(gx, gz);
      if (gd > GUIDE_GAP) this.goal.set(this.guide.x + (gx / gd) * GUIDE_GAP, 0, this.guide.z + (gz / gd) * GUIDE_GAP);
      else this.goal.copy(this.position);
    } else if (tadeoSpeed > 0.3) this.besideTadeo(this.goal);
    const dx = this.goal.x - this.position.x;
    const dz = this.goal.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const want = dist > 0.25 ? Math.min(dist * 2.4, RUN_SPEED) : 0;
    const accel = 1 - Math.exp(-dt * 9);
    this.velocity.x += ((dist > 0 ? (dx / dist) * want : 0) - this.velocity.x) * accel;
    this.velocity.z += ((dist > 0 ? (dz / dist) * want : 0) - this.velocity.z) * accel;
    const nx = this.position.x + this.velocity.x * dt;
    const nz = this.position.z + this.velocity.z * dt;
    if (this.dryLand(nx, nz)) {
      this.position.x = nx;
      this.position.z = nz;
    } else {
      this.velocity.set(0, 0, 0);
    }
    w.colliders.resolve(this.position, RADIUS);

    // Her own little flappy hop whenever Tadeo jumps next to her
    if (this.tadeoGrounded && !p.grounded && behind < 4 && this.hopHeight === 0) this.vy = 5;
    this.vy -= GRAVITY * dt;
    this.hopHeight = Math.max(0, this.hopHeight + this.vy * dt);
    if (this.hopHeight === 0) {
      if (this.vy < -3) this.model.kick(0.5);
      this.vy = 0;
    }
    this.position.y = w.groundHeight(this.position.x, this.position.z) + this.hopHeight;

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.3) this.turnTo(Math.atan2(this.velocity.x, this.velocity.z), dt, 10);
    else if (this.guide) this.turnTo(Math.atan2(p.position.x - this.position.x, p.position.z - this.position.z), dt, 4);
    // Reason: a hen in a hurry runs with her wings flapping — and complains about it
    const panic = behind > 5.5 && !this.guide;
    if (panic && !this.panicked) henVoice.bagawk(1.2);
    this.panicked = panic;
    this.pose.speed = speed;
    this.pose.air = this.hopHeight > 0.02;
    this.pose.flap = this.pose.air || panic ? 1 : this.guide && speed < 0.3 ? 0.35 : 0;
    if (speed < 0.3 && !this.guide) this.pose.peck = this.pecking(dt);
  }

  private ride(dt: number, tadeoSpeed: number): void {
    const p = this.player;
    this.position.copy(this.perchAt);
    this.turnTo(p.facing, dt, 12);
    this.pose.sit = 1;
    // Wobbles for balance when Tadeo jumps
    this.pose.flap = p.grounded ? 0 : 0.6;
    this.walked = tadeoSpeed > 0.6 && !p.wading ? this.walked + dt : 0;
    if (this.guide || this.walked > HOP_DOWN_AFTER) {
      const spot = this.besideTadeo(this.tmp);
      if (spot && this.dryLand(spot.x, spot.z)) this.startHop("ground");
    }
  }

  private startHop(to: "head" | "ground"): void {
    this.mode = "hop";
    const h = this.hop;
    h.from.copy(this.position);
    h.to = to;
    h.t = 0;
    const d = h.from.distanceTo(this.hopTarget(this.tmp));
    h.duration = Math.min(0.45 + d * 0.05, 1.3);
    h.arc = 0.6 + Math.min(d, 20) * 0.08;
    this.walked = 0;
    this.rest = 0;
    henVoice.bagawk(to === "head" ? 1.25 : 1.15);
  }

  /** The flight between the ground and Tadeo's head: an arc with wild flapping. */
  private flutter(dt: number): void {
    const h = this.hop;
    h.t = Math.min(h.t + dt / h.duration, 1);
    const k = h.t * h.t * (3 - 2 * h.t);
    const target = this.hopTarget(this.tmp);
    if (h.t < 0.85) this.turnTo(Math.atan2(target.x - this.position.x, target.z - this.position.z), dt, 10);
    this.position.lerpVectors(h.from, target, k);
    this.position.y += h.arc * 4 * h.t * (1 - h.t);
    this.pose.air = true;
    this.pose.flap = 1;
    if (h.t < 1) return;
    this.model.kick(0.8);
    henVoice.bok(1.2);
    this.mode = h.to === "head" ? "ride" : "walk";
    this.velocity.set(0, 0, 0);
    this.hopHeight = 0;
    this.vy = 0;
    this.goal.copy(this.position);
  }

  private hopTarget(out: THREE.Vector3): THREE.Vector3 {
    if (this.hop.to === "head") return out.copy(this.perchAt);
    const spot = this.guide ? out.copy(this.guide) : this.besideTadeo(out);
    return spot.setY(this.player.world.groundHeight(spot.x, spot.z));
  }

  /** Her spot beside Tadeo, in world space. */
  private besideTadeo(out: THREE.Vector3): THREE.Vector3 {
    const p = this.player;
    return out.copy(BESIDE).applyAxisAngle(UP, p.facing).add(p.position);
  }

  private dryLand(x: number, z: number): boolean {
    const w = this.player.world;
    return w.canStand(x, z) && w.groundHeight(x, z) > -0.05;
  }

  /** Bursts of two or three quick pecks at the ground now and then. */
  private pecking(dt: number): number {
    this.peckIn -= dt;
    if (this.peckIn < 0) {
      this.peckLeft = 0.5 + Math.random() * 0.5;
      this.peckIn = 1.5 + Math.random() * 2.5;
    }
    if (this.peckLeft <= 0) return 0;
    this.peckLeft -= dt;
    return Math.max(0, Math.sin(this.peckLeft * 18));
  }

  /** Curious little head turns. */
  private lookAround(dt: number): void {
    this.glanceIn -= dt;
    if (this.glanceIn < 0) {
      this.glance = this.pose.speed > 2 ? 0 : (Math.random() - 0.5) * 1.6;
      this.glanceIn = 0.8 + Math.random() * 2.2;
    }
    this.pose.look += (this.glance - this.pose.look) * Math.min(dt * 8, 1);
  }

  private turnTo(target: number, dt: number, rate: number): void {
    const d = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
    this.yaw += d * Math.min(dt * rate, 1);
  }
}
