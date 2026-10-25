/**
 * Tadeo on the treasure island: the arrow-key steering, his tools (shovel,
 * golden hammer, golden key) and the layered limb animation for digging,
 * hammering and turning the key, on top of the stock Humanoid poses.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { createTadeo } from "../../characters/cast";
import { Humanoid } from "../../characters/Humanoid";
import { mat, toonMesh } from "../../characters/parts";
import { createHammer, createKey } from "../../world/models/items";
import { Input } from "../../core/Input";
import { Actor } from "../shared/actor";

export type Tool = "none" | "shovel" | "hammer" | "key" | "reach";

const WALK_SPEED = 3.4;

/** Keyframes [time 0..1, arm swing φ (rad forward from hanging), torso pitch, torso twist]. */
const DIG_KEYS: [number, number, number, number][] = [
  [0, 0.8, 0.12, 0],
  [0.22, 0.42, 0.42, 0],
  [0.58, 1.95, -0.05, 0.5],
  [1, 0.8, 0.12, 0],
];
// Reason: the impact angle keeps the head just above the ice block's top face (Tadeo stands 0.75 m from it)
const HAMMER_KEYS: [number, number, number, number][] = [
  [0, 3.1, -0.15, 0],
  [0.3, 2.45, 0.2, 0],
  [0.5, 2.7, 0.12, 0],
  [1, 3.1, -0.15, 0],
];
const DIG_TIME = 0.5;
const HAMMER_TIME = 0.45;

function sample(keys: [number, number, number, number][], k: number): [number, number, number] {
  for (let i = 1; i < keys.length; i++) {
    if (k <= keys[i][0]) {
      const [t0, a0, b0, c0] = keys[i - 1];
      const [t1, a1, b1, c1] = keys[i];
      const u = THREE.MathUtils.smoothstep((k - t0) / (t1 - t0), 0, 1);
      return [a0 + (a1 - a0) * u, b0 + (b1 - b0) * u, c0 + (c1 - c0) * u];
    }
  }
  const last = keys[keys.length - 1];
  return [last[1], last[2], last[3]];
}

/** A wooden shovel with a steel blade; origin at the gripping hand, the blade hangs along -y. */
function createShovel(): THREE.Group {
  const g = new THREE.Group();
  const handle = toonMesh(new THREE.CylinderGeometry(0.03, 0.034, 1.0, 8).translate(0, -0.42, 0), mat("#b07a45", 0.7));
  const grip = toonMesh(new RoundedBoxGeometry(0.2, 0.06, 0.06, 2, 0.02).translate(0, 0.09, 0), mat("#6e4528", 0.7));
  const blade = toonMesh(new RoundedBoxGeometry(0.28, 0.34, 0.035, 2, 0.015).translate(0, -1.04, 0.02), mat("#aeb8c4", 0.35));
  const collar = toonMesh(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 8).translate(0, -0.88, 0), mat("#7d8794", 0.4));
  const tip = new THREE.Object3D();
  tip.position.set(0, -1.12, 0.02);
  tip.name = "tip";
  g.add(handle, grip, blade, collar, tip);
  // Reason: tilt the blade a little forward so it bites into the sand instead of slicing edge-on
  g.rotation.x = 0.35;
  return g;
}

export class TadeoRig {
  readonly actor: Actor;
  tool: Tool = "none";
  private tools: Record<"shovel" | "hammer" | "key", THREE.Group>;
  private t = 9;
  private time = 0;

  constructor(x: number, z: number, facing: number) {
    this.actor = new Actor(createTadeo(), x, z, facing);
    this.actor.overlay = (h, dt) => this.animate(h, dt);
    const hammer = createHammer();
    hammer.scale.setScalar(0.9);
    // Reason: flip so the hammer extends beyond the fist along the arm; head at the far end
    hammer.rotation.x = Math.PI;
    hammer.position.y = 0.06;
    const hammerTip = new THREE.Object3D();
    hammerTip.position.y = 0.92;
    hammerTip.name = "tip";
    hammer.add(hammerTip);
    const key = createKey();
    key.rotation.z = Math.PI;
    key.position.y = -0.1;
    key.scale.setScalar(1.15);
    this.tools = { shovel: createShovel(), hammer, key };
    for (const t of Object.values(this.tools)) {
      t.visible = false;
      this.actor.avatar.handR.add(t);
    }
  }

  get avatar(): Humanoid {
    return this.actor.avatar;
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    for (const [name, g] of Object.entries(this.tools)) g.visible = name === tool;
    this.t = 9;
  }

  /** Start one dig / hammer stroke. */
  stroke(): void {
    this.t = 0;
  }

  /** Seconds until the current hammer swing hits. */
  get impactDelay(): number {
    return HAMMER_TIME * HAMMER_KEYS[1][0];
  }

  /** World position of the shovel blade / hammer head. */
  tip(out: THREE.Vector3): THREE.Vector3 {
    const g = this.tool === "shovel" || this.tool === "hammer" ? this.tools[this.tool] : null;
    if (!g) return this.actor.avatar.handR.getWorldPosition(out);
    return g.getObjectByName("tip")!.getWorldPosition(out);
  }

  /** Arrow-key walking (screen up = away from the camera = -z). */
  steer(input: Input | null, dt: number, enabled: boolean): void {
    const ax = enabled && input ? input.axis() : { x: 0, y: 0 };
    const target = new THREE.Vector3(ax.x, 0, ax.y);
    if (target.lengthSq() > 0) target.normalize().multiplyScalar(WALK_SPEED);
    this.actor.velocity.lerp(target, 1 - Math.exp(-dt * 12));
    if (!enabled && this.actor.velocity.lengthSq() < 0.01) this.actor.velocity.set(0, 0, 0);
  }

  update(dt: number): void {
    this.actor.update(dt);
  }

  private animate(h: Humanoid, dt: number): void {
    this.t += dt;
    this.time += dt;
    const breathe = Math.sin(this.time * 2.4) * 0.04;
    let pose: [number, number, number] | null = null;
    if (this.tool === "shovel") pose = sample(DIG_KEYS, Math.min(this.t / DIG_TIME, 1));
    else if (this.tool === "hammer") pose = sample(HAMMER_KEYS, Math.min(this.t / HAMMER_TIME, 1));
    else if (this.tool === "reach") pose = [1.45 + breathe * 0.3, 0.12, 0];
    if (!pose || h.pose === "holdUp" || h.pose === "cheer") return;
    const [phi, pitch, twist] = pose;
    const idle = this.t > 1 ? breathe : 0;
    h.armR.rotation.set(-(phi + idle), 0, this.tool === "reach" ? -0.1 : -0.42);
    // Reason: both hands grip the tool; the left arm mirrors the right, turned inwards to meet it
    if (this.tool !== "reach") h.armL.rotation.set(-(phi + idle) + 0.08, 0, 0.42);
    h.torso.rotation.x = pitch;
    h.torso.rotation.y = twist;
  }
}
