/**
 * Swimming fish. Each `Fish` cruises between random spots over the open sand
 * (pausing now and then, gently keeping its distance from the others) and can
 * be called over by the fishing game: it approaches the hook, pokes at it
 * (nibbles), bites, or flees after a miss. `Minnows` is a little school of
 * silver fish circling along the reef edge that scatters from splashes.
 */

import * as THREE from "three";
import { merge, part } from "../../core/geo";
import { turnToward, wrapAngle } from "../../world/ambient/spawn";
import { FishKind, Species, SPECIES, fishModel } from "./species";

export type SwimState = "wander" | "approach" | "nibble" | "bite" | "hooked" | "flee" | "away";

/** Where the fish roam (over the open sand in front of the jetty). */
export const ZONE = { x0: -6.2, x1: 6.2, z0: -12.5, z1: -2.4, y0: -1.55, y1: -0.6 };

/** Lagoon fish are drawn a little larger than their models, so a seven-year-old can spot them easily. */
export const FISH_SCALE = 1.3;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export interface FishLook {
  body: THREE.Material;
  outline: THREE.Material;
}

/** A stand-alone fish model: outlined body plus a tail group that wags around its hinge. */
export function fishFigure(kind: FishKind, look: FishLook): { root: THREE.Group; tail: THREE.Group } {
  const m = fishModel(kind);
  const root = new THREE.Group();
  const body = new THREE.Mesh(m.body, look.body);
  body.add(new THREE.Mesh(m.body, look.outline));
  const tail = new THREE.Group();
  tail.position.z = m.tailZ;
  const tailMesh = new THREE.Mesh(m.tail, look.body);
  tailMesh.add(new THREE.Mesh(m.tail, look.outline));
  tail.add(tailMesh);
  root.add(body, tail);
  body.castShadow = true;
  tailMesh.castShadow = true;
  return { root, tail };
}

export class Fish {
  readonly root = new THREE.Group();
  readonly spec: Species;
  readonly length: number;
  readonly pos = new THREE.Vector3();
  state: SwimState = "wander";
  yaw = 0;
  /** Seconds until this fish may be called to the hook again (after fleeing). */
  shy = 0;
  /** 0..1 how far the pufferfish has blown itself up. */
  puff = 0;
  /** 0 = swimming level, 1 = hanging nose-up from the line (while caught). */
  hang = 0;
  private tail: THREE.Group;
  private body: THREE.Group;
  private target = new THREE.Vector3();
  private speed = 0;
  private pause = 0;
  private phase = Math.random() * 10;
  private hook = new THREE.Vector3();
  private poke = 0;
  private flee = 0;
  private pitch = 0;

  constructor(kind: FishKind, look: FishLook) {
    this.spec = SPECIES[kind];
    this.length = fishModel(kind).length * FISH_SCALE;
    this.root.scale.setScalar(FISH_SCALE);
    const figure = fishFigure(kind, look);
    this.body = figure.root;
    this.tail = figure.tail;
    this.root.add(this.body);
    this.pos.set(rnd(ZONE.x0, ZONE.x1), rnd(ZONE.y0, ZONE.y1), rnd(ZONE.z0, ZONE.z1));
    this.yaw = Math.random() * Math.PI * 2;
    this.pickTarget();
  }

  get kind(): FishKind {
    return this.spec.kind;
  }

  /** Point where the fish's mouth is. */
  mouth(out: THREE.Vector3): THREE.Vector3 {
    const r = this.length * 0.5;
    return out.set(this.pos.x + Math.sin(this.yaw) * r, this.pos.y, this.pos.z + Math.cos(this.yaw) * r);
  }

  /** Swim over to the hook hanging at `hook`. */
  callTo(hook: THREE.Vector3): void {
    this.hook.copy(hook);
    this.state = "approach";
    this.pause = 0;
  }

  /** One quick peck at the hook (the bobber twitches with it). */
  peck(): void {
    this.poke = 1;
  }

  /** Lose interest and dart away (a miss). */
  scare(from: THREE.Vector3): void {
    this.state = "flee";
    this.flee = 2.2;
    this.shy = 7;
    const away = Math.atan2(this.pos.x - from.x, this.pos.z - from.z) + rnd(-0.6, 0.6);
    this.target.set(
      THREE.MathUtils.clamp(this.pos.x + Math.sin(away) * 6, ZONE.x0 - 2, ZONE.x1 + 2),
      ZONE.y0,
      THREE.MathUtils.clamp(this.pos.z + Math.cos(away) * 6, ZONE.z0 - 3, ZONE.z1),
    );
  }

  /** Back to roaming (after a fumbled bite or when the hook leaves the water). */
  release(): void {
    this.state = "wander";
    this.pickTarget();
  }

  /** Drop into the lagoon at a spot (respawn, or the golden fish arriving from afar). */
  placeAt(x: number, y: number, z: number, yaw: number): void {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.state = "wander";
    this.pickTarget();
  }

  update(dt: number, time: number): void {
    this.shy = Math.max(0, this.shy - dt);
    let wag = 7;
    switch (this.state) {
      case "wander":
        wag = this.wander(dt);
        break;
      case "approach": {
        // Stop a little short of the hook, facing it
        const stand = this.length * 0.5 + 0.12;
        const dx = this.hook.x - this.pos.x;
        const dz = this.hook.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        const goal = this.target.set(this.hook.x - (dx / d) * stand, this.hook.y - 0.05, this.hook.z - (dz / d) * stand);
        // Reason: far fish hurry over, near ones glide in slowly, so every bite comes within a few seconds
        this.swim(dt, goal, THREE.MathUtils.clamp(0.3 + d * 0.6, 0.5, 2.6), 3);
        if (d < stand + 0.12) this.state = "nibble";
        wag = 9;
        break;
      }
      case "nibble":
      case "bite": {
        // Hover at the hook, facing it; pecks dart the nose onto the hook
        const want = Math.atan2(this.hook.x - this.pos.x, this.hook.z - this.pos.z);
        this.yaw = turnToward(this.yaw, want, dt * 5);
        const reach = this.state === "bite" ? 1 : Math.sin(Math.min(this.poke, 1) * Math.PI);
        this.poke = Math.max(0, this.poke - dt * 3.2);
        const stand = this.length * 0.5 + 0.1 - reach * 0.14;
        this.target.set(this.hook.x - Math.sin(this.yaw) * stand, this.hook.y - 0.04, this.hook.z - Math.cos(this.yaw) * stand);
        this.pos.lerp(this.target, 1 - Math.exp(-dt * (this.state === "bite" ? 14 : 8)));
        wag = this.state === "bite" ? 22 : 10;
        break;
      }
      case "flee":
        this.flee -= dt;
        this.swim(dt, this.target, this.spec.speed * 3.2, 6);
        if (this.flee < 0) this.release();
        wag = 18;
        break;
      default:
        wag = 14;
        break;
    }
    this.pose(dt, time, wag);
  }

  /** Follow the hook while it is pulled under (bite) or set by the catch animation. */
  setHook(p: THREE.Vector3): void {
    this.hook.copy(p);
  }

  private wander(dt: number): number {
    if (this.pause > 0) {
      this.pause -= dt;
      this.swim(dt, this.target, 0.12, 1.2);
      return 4;
    }
    this.swim(dt, this.target, this.spec.speed, 1.6);
    if (Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 0.5) {
      this.pickTarget();
      if (Math.random() < 0.45) this.pause = rnd(0.8, 2.6);
    }
    return 5 + this.speed * 4;
  }

  private pickTarget(): void {
    // Reason: short hops keep the fish spread over the whole sand instead of crossing it in long lines
    const r = rnd(1.5, 4.5);
    const a = this.yaw + rnd(-1.6, 1.6);
    this.target.set(
      THREE.MathUtils.clamp(this.pos.x + Math.sin(a) * r, ZONE.x0, ZONE.x1),
      rnd(ZONE.y0, ZONE.y1),
      THREE.MathUtils.clamp(this.pos.z + Math.cos(a) * r, ZONE.z0, ZONE.z1),
    );
  }

  private swim(dt: number, goal: THREE.Vector3, speed: number, turn: number): void {
    const want = Math.atan2(goal.x - this.pos.x, goal.z - this.pos.z);
    this.yaw = turnToward(this.yaw, want, dt * turn);
    const facing = Math.cos(wrapAngle(want - this.yaw));
    // Reason: slow down while turning so fish curve round instead of overshooting their goal
    const s = speed * (0.35 + 0.65 * Math.max(facing, 0));
    this.speed += (s - this.speed) * Math.min(1, dt * 2.5);
    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    const dy = goal.y - this.pos.y;
    this.pos.y += dy * Math.min(1, dt * 1.1);
    this.pitch += (THREE.MathUtils.clamp(dy * 0.8, -0.35, 0.35) - this.pitch) * Math.min(1, dt * 3);
  }

  /** Place the model: body sway, tail wag, a slow vertical bob and the puffer's puff. */
  private pose(dt: number, time: number, wag: number): void {
    this.phase += dt * wag;
    this.root.position.copy(this.pos);
    this.root.position.y += Math.sin(time * 1.3 + this.phase * 0.05) * 0.02;
    this.root.rotation.set(0, this.yaw + Math.sin(this.phase) * 0.06, 0);
    this.body.rotation.x = -this.pitch - this.hang * Math.PI * 0.5;
    this.tail.rotation.y = Math.sin(this.phase) * 0.55;
    const s = 1 + this.puff * 0.65;
    this.body.scale.set(s, s, 1 + this.puff * 0.35);
  }
}

/** Keep fish from swimming through each other. */
export function separate(fish: Fish[], dt: number): void {
  for (let i = 0; i < fish.length; i++) {
    const a = fish[i];
    if (a.state !== "wander" && a.state !== "flee") continue;
    for (let j = 0; j < fish.length; j++) {
      const b = fish[j];
      if (i === j || b.state === "away" || b.state === "hooked") continue;
      const dx = a.pos.x - b.pos.x;
      const dz = a.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      const min = (a.length + b.length) * 0.6;
      if (d > 0.001 && d < min) {
        const push = ((min - d) / min) * dt * 1.6;
        a.pos.x += (dx / d) * push;
        a.pos.z += (dz / d) * push;
      }
    }
  }
}

/** A school of small silver fish circling along the reef edge. */
export class Minnows {
  readonly mesh: THREE.InstancedMesh;
  private center = new THREE.Vector3(-5.5, -1.1, -7);
  private scatter = new THREE.Vector3();
  private fear = 0;
  private seeds: { r: number; speed: number; phase: number; y: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private e = new THREE.Euler();

  constructor(material: THREE.Material, count = 26) {
    const body = new THREE.SphereGeometry(0.05, 10, 6);
    body.scale(0.6, 0.9, 2.2);
    const tail = new THREE.ConeGeometry(0.05, 0.08, 3);
    tail.rotateX(-Math.PI / 2);
    tail.scale(0.3, 1, 1);
    tail.translate(0, 0, -0.14);
    const geo = merge([part(body, "#dfe8f2"), part(tail, "#a9b8c8")]);
    this.mesh = new THREE.InstancedMesh(geo, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    for (let i = 0; i < count; i++) this.seeds.push({ r: rnd(0.3, 1.1), speed: rnd(1.4, 2.2), phase: Math.random() * 6.28, y: rnd(-0.35, 0.35) });
  }

  /** Splash nearby: the school darts away from (x, z). */
  startle(x: number, z: number): void {
    const dx = this.center.x - x;
    const dz = this.center.z - z;
    const d = Math.hypot(dx, dz);
    if (d > 5) return;
    this.scatter.set((dx / (d || 1)) * 2.5, 0, (dz / (d || 1)) * 2.5);
    this.fear = 1;
  }

  update(dt: number, time: number): void {
    this.fear = Math.max(0, this.fear - dt * 0.6);
    // Reason: a slow figure-eight along the left reef keeps the school in view but out of the main fishing spot
    const home = this.p.set(-5.3 + Math.sin(time * 0.13) * 1.6, -1.05, -7.5 + Math.sin(time * 0.26) * 4.2);
    home.addScaledVector(this.scatter, this.fear);
    this.center.lerp(home, 1 - Math.exp(-dt * 1.2));
    this.seeds.forEach((sd, i) => {
      const a = time * sd.speed * (1 + this.fear * 1.5) + sd.phase;
      const x = this.center.x + Math.cos(a) * sd.r * 1.3;
      const z = this.center.z + Math.sin(a) * sd.r;
      const y = this.center.y + sd.y + Math.sin(a * 2) * 0.05;
      // Facing along the orbit (tangent)
      const yaw = Math.atan2(-Math.sin(a) * 1.3, Math.cos(a));
      this.e.set(0, yaw, Math.sin(time * 9 + sd.phase) * 0.15);
      this.q.setFromEuler(this.e);
      this.m.compose(new THREE.Vector3(x, y, z), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
