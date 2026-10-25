/**
 * Butterflies fluttering over the meadows around the focus. Each one wanders
 * on a soft, noisy path around a home patch of grass, never over water, and
 * now and then settles on the grass to bask with slowly opening wings
 * (fluttering up again if the player walks right up to it).
 * Far-away butterflies are recycled to fresh meadow spots near the focus.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { CritterMesh } from "./CritterMesh";
import { butterflyModel } from "./critterModels";
import { FLAP_ANIM } from "./critterAnims";
import { wingAtlas, WING_SPECIES } from "./textures";
import { findSpot, rnd, turnToward, wrapAngle, yawTo } from "./spawn";

const COUNT = 50;
const SPAWN_RADIUS = 28;
const DESPAWN_RADIUS = 40;
const HOME_RANGE = 7;

type Mode = "hidden" | "fly" | "land" | "rest";

interface Butterfly {
  mode: Mode;
  x: number;
  y: number;
  z: number;
  yaw: number;
  homeX: number;
  homeZ: number;
  seed: number;
  flap: number;
  timer: number;
  restY: number;
  scale: number;
}

export class Butterflies {
  readonly object: THREE.Object3D;
  private mesh: CritterMesh;
  private flock: Butterfly[] = [];
  private spot = new THREE.Vector2();
  private white = new THREE.Color(1, 1, 1);

  constructor(private hf: Heightfield) {
    this.mesh = new CritterMesh({
      name: "butterflies",
      geometry: butterflyModel(),
      count: COUNT,
      animate: FLAP_ANIM,
      castShadow: true,
      doubleSided: true,
      selfLit: 0.35,
      atlas: { map: wingAtlas(), columns: WING_SPECIES },
    });
    this.object = this.mesh.mesh;
    for (let i = 0; i < COUNT; i++) {
      this.flock.push({ mode: "hidden", x: 0, y: 0, z: 0, yaw: 0, homeX: 0, homeZ: 0, seed: Math.random() * 100, flap: 0, timer: 0, restY: 0, scale: 1 });
    }
  }

  private isMeadow = (x: number, z: number): boolean =>
    this.hf.maskAt(x, z, 3) > 0.45 && this.hf.heightAt(x, z) > 0.8 && this.hf.maskAt(x, z, 1) < 0.5;

  update(dt: number, time: number, focus: THREE.Vector3): void {
    let spawns = 0;
    this.flock.forEach((b, i) => {
      if (b.mode !== "hidden" && Math.hypot(b.x - focus.x, b.z - focus.z) > DESPAWN_RADIUS) b.mode = "hidden";
      if (b.mode === "hidden") {
        // Reason: cap spawn attempts per frame so a teleporting focus doesn't cause a hitch
        if (spawns++ < 4 && this.spawn(b, i, focus)) this.step(b, i, dt, time);
        else this.mesh.hide(i);
        return;
      }
      // Reason: a resting butterfly flutters up when the player walks right up to it
      if (b.mode === "rest" && Math.hypot(b.x - focus.x, b.z - focus.z) < 1.6) b.timer = 0;
      this.step(b, i, dt, time);
    });
    this.mesh.commit();
  }

  private spawn(b: Butterfly, i: number, focus: THREE.Vector3): boolean {
    if (!findSpot(focus.x, focus.z, 4, SPAWN_RADIUS, 6, this.isMeadow, this.spot)) return false;
    b.mode = "fly";
    b.homeX = b.x = this.spot.x;
    b.homeZ = b.z = this.spot.y;
    b.y = this.hf.heightAt(b.x, b.z) + rnd(0.6, 1.6);
    b.yaw = rnd(-Math.PI, Math.PI);
    b.timer = rnd(4, 14);
    b.scale = rnd(1.0, 1.3);
    this.mesh.setLook(i, this.white, Math.floor(Math.random() * WING_SPECIES));
    return true;
  }

  private step(b: Butterfly, i: number, dt: number, t: number): void {
    const ground = this.hf.heightAt(b.x, b.z);
    let wing: number;
    let turn = 0;
    if (b.mode === "rest") {
      // Basking: wings open and close slowly
      wing = 0.75 + 0.65 * Math.sin(t * 1.3 + b.seed);
      b.timer -= dt;
      if (b.timer <= 0) {
        b.mode = "fly";
        b.timer = rnd(5, 14);
      }
    } else {
      const s = b.seed;
      turn = (Math.sin(t * 1.7 + s * 10) * 1.3 + Math.sin(t * 0.63 + s * 3) * 0.9 + Math.sin(t * 4.1 + s) * 0.6) * 1.8;
      let yaw = b.yaw + turn * dt;
      // Stay around the home patch and away from water / bare ground
      const ax = b.x + Math.sin(yaw) * 1.5;
      const az = b.z + Math.cos(yaw) * 1.5;
      const blocked = this.hf.heightAt(ax, az) < 0.5 || this.hf.maskAt(ax, az, 3) < 0.15;
      if (blocked || Math.hypot(b.homeX - b.x, b.homeZ - b.z) > HOME_RANGE) {
        yaw = turnToward(yaw, yawTo(b.x, b.z, b.homeX, b.homeZ), (blocked ? 4 : 1.6) * dt);
      }
      b.yaw = wrapAngle(yaw);
      const speed = b.mode === "land" ? 0.5 : 1.3 + 0.5 * Math.sin(t * 0.8 + s);
      b.x += Math.sin(b.yaw) * speed * dt;
      b.z += Math.cos(b.yaw) * speed * dt;

      const targetY = b.mode === "land" ? b.restY : ground + 0.95 + 0.5 * Math.sin(t * 0.9 + s * 7);
      b.y += (targetY - b.y) * Math.min(dt * (b.mode === "land" ? 1.5 : 2), 1);
      b.y = Math.max(b.y, ground + 0.3);
      b.flap += dt * Math.PI * 2 * (b.mode === "land" ? 5 : 7.5);
      wing = 0.55 + 0.9 * Math.sin(b.flap);

      b.timer -= dt;
      if (b.mode === "fly" && b.timer <= 0) {
        if (this.isMeadow(b.x, b.z)) {
          b.mode = "land";
          b.restY = ground + rnd(0.35, 0.55);
        } else b.timer = 1;
      } else if (b.mode === "land" && Math.abs(b.y - b.restY) < 0.04) {
        b.mode = "rest";
        b.timer = rnd(3, 8);
      }
    }
    // Reason: each downstroke lifts the body a little — the classic bobbing flight
    const bob = b.mode === "rest" ? 0 : Math.sin(b.flap) * 0.07;
    this.mesh.set(i, b.x, b.y + bob, b.z, b.yaw, 0.18, THREE.MathUtils.clamp(-turn * 0.08, -0.5, 0.5), wing, b.scale);
  }
}
