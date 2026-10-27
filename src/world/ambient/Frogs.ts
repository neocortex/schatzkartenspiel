/**
 * Frogs on the swamp banks near the focus: they sit by the water puffing up
 * their throats to croak, then leap off in one to three short arcs; a frog
 * the player gets close to jumps away. Far-away frogs are recycled to spots
 * near the water close to the focus.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { Colliders } from "../Colliders";
import { REGION_INDEX } from "../regions";
import { CritterMesh } from "./CritterMesh";
import { frogModel } from "./regionCritterModels";
import { FROG_ANIM } from "./critterAnims";
import { findSpot, rnd } from "./spawn";

const COUNT = 8;
const SPAWN_RADIUS = 24;
const DESPAWN_RADIUS = 36;
const HOP_TIME = 0.34;
const HOP_LENGTH = 0.9;
/** Sitting frogs closer than this to the player leap away. */
const FLEE_RADIUS = 2.5;
const SWAMP = REGION_INDEX.swamp;

const SKINS = [new THREE.Color(0.45, 0.85, 0.25), new THREE.Color(0.3, 0.7, 0.3), new THREE.Color(0.7, 0.9, 0.3), new THREE.Color(0.95, 0.55, 0.2)];

interface Frog {
  active: boolean;
  x: number;
  z: number;
  yaw: number;
  hopsLeft: number;
  hopT: number;
  fromX: number;
  fromZ: number;
  timer: number;
  seed: number;
  scale: number;
}

export class Frogs {
  readonly object: THREE.Object3D;
  private mesh: CritterMesh;
  private frogs: Frog[] = [];
  private spot = new THREE.Vector2();

  constructor(
    private hf: Heightfield,
    private colliders: Colliders | null,
  ) {
    this.mesh = new CritterMesh({ name: "frogs", geometry: frogModel(), count: COUNT, animate: FROG_ANIM, castShadow: true, selfLit: 0.15 });
    this.object = this.mesh.mesh;
    for (let i = 0; i < COUNT; i++) {
      this.frogs.push({ active: false, x: 0, z: 0, yaw: 0, hopsLeft: 0, hopT: 0, fromX: 0, fromZ: 0, timer: 0, seed: Math.random() * 100, scale: 1 });
      this.mesh.setLook(i, SKINS[i % SKINS.length]);
    }
  }

  /** Dry, gentle swamp ground a frog may land on. */
  private isBank = (x: number, z: number): boolean => {
    const h = this.hf.heightAt(x, z);
    return h > 0.04 && h < 1.3 && this.hf.regionAt(x, z, SWAMP) > 0.4 && this.hf.slopeAt(x, z) < 0.5 && !this.colliders?.hits(x, z, 0.3);
  };

  /** A bank spot with water within a few steps — where frogs like to sit. */
  private isWaterside = (x: number, z: number): boolean => {
    if (!this.isBank(x, z)) return false;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      if (this.hf.heightAt(x + Math.cos(a) * 2.5, z + Math.sin(a) * 2.5) < -0.05) return true;
    }
    return false;
  };

  update(dt: number, time: number, focus: THREE.Vector3): void {
    let spawns = 0;
    this.frogs.forEach((f, i) => {
      if (f.active && Math.hypot(f.x - focus.x, f.z - focus.z) > DESPAWN_RADIUS) f.active = false;
      if (!f.active) {
        if (spawns++ < 2 && findSpot(focus.x, focus.z, 3, SPAWN_RADIUS, 8, this.isWaterside, this.spot)) {
          Object.assign(f, { active: true, x: this.spot.x, z: this.spot.y, yaw: rnd(-Math.PI, Math.PI), hopsLeft: 0, timer: rnd(0.5, 3), scale: rnd(1.6, 2.1) });
        } else {
          this.mesh.hide(i);
          return;
        }
      }
      this.step(f, i, dt, time, focus);
    });
    this.mesh.commit();
  }

  private step(f: Frog, i: number, dt: number, t: number, focus: THREE.Vector3): void {
    let lift = 0;
    let pitch = 0;
    let anim: number;
    if (f.hopsLeft > 0) {
      f.hopT += dt / HOP_TIME;
      if (f.hopT >= 1) {
        f.hopsLeft--;
        f.hopT = 0;
        f.fromX = f.x = f.fromX + Math.sin(f.yaw) * HOP_LENGTH;
        f.fromZ = f.z = f.fromZ + Math.cos(f.yaw) * HOP_LENGTH;
        if (f.hopsLeft > 0) this.aimHop(f);
        else f.timer = rnd(2, 6);
      } else {
        const u = f.hopT;
        f.x = f.fromX + Math.sin(f.yaw) * HOP_LENGTH * u;
        f.z = f.fromZ + Math.cos(f.yaw) * HOP_LENGTH * u;
        lift = 4 * 0.32 * u * (1 - u);
        pitch = (0.5 - u) * 0.8;
      }
      // Legs kick out on take-off and fold back in for the landing
      anim = Math.sin(Math.min(f.hopT * 1.6, 1) * Math.PI);
    } else {
      // Sitting: the throat sac puffs up in little bursts of croaks
      const croak = Math.sin(t * 7 + f.seed) * 0.5 + 0.5;
      const burst = Math.max(Math.sin(t * 0.8 + f.seed * 3), 0);
      anim = -croak * burst;
      f.timer -= dt;
      const scared = Math.hypot(f.x - focus.x, f.z - focus.z) < FLEE_RADIUS;
      if (f.timer <= 0 || scared) {
        f.hopsLeft = scared ? 3 : 1 + Math.floor(Math.random() * 3);
        f.yaw = scared ? Math.atan2(f.x - focus.x, f.z - focus.z) : f.yaw + rnd(-1.5, 1.5);
        f.fromX = f.x;
        f.fromZ = f.z;
        f.hopT = 0;
        this.aimHop(f);
      }
    }
    this.mesh.set(i, f.x, this.hf.heightAt(f.x, f.z) + lift, f.z, f.yaw, pitch, 0, anim, f.scale);
  }

  /** Wiggle the heading a little; turn round if the landing spot isn't bank. */
  private aimHop(f: Frog): void {
    f.yaw += rnd(-0.4, 0.4);
    const ok = (yaw: number) => this.isBank(f.x + Math.sin(yaw) * HOP_LENGTH, f.z + Math.cos(yaw) * HOP_LENGTH);
    if (!ok(f.yaw)) {
      f.yaw += Math.PI + rnd(-0.7, 0.7);
      if (!ok(f.yaw)) {
        f.hopsLeft = 0;
        f.timer = rnd(1, 3);
      }
    }
  }
}
