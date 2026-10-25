/**
 * Flocke, the little magic fox who helps Tadeo find the berries. A chunky
 * toy fox (outlined like the other characters) with a softly glowing tail
 * tip. It trots ahead along a path around the thorns to the next berry,
 * stops and looks back when Tadeo falls behind, and sits wagging its tail
 * next to the berry until he arrives.
 */

import * as THREE from "three";
import { mat, toonMesh } from "../../characters/parts";
import { blobShadow } from "../../characters/Humanoid";
import { Bursts } from "../shared/bursts";
import { NavGrid } from "./nav";

const ORANGE = "#e8762b";
const WHITE = "#fff4e6";
const DARK = "#3a2418";
const RUN_SPEED = 4.8;

type Mode = "run" | "wait" | "sit" | "hop";

function sphere(r: number, color: string, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], emissive = 0): THREE.Mesh {
  const m = toonMesh(new THREE.SphereGeometry(r, 16, 12), mat(color, 0.6, emissive));
  m.position.set(...pos);
  m.scale.set(...scale);
  return m;
}

function cone(r: number, h: number, color: string, pos: [number, number, number], rot: [number, number, number]): THREE.Mesh {
  const m = toonMesh(new THREE.ConeGeometry(r, h, 10), mat(color, 0.6));
  m.position.set(...pos);
  m.rotation.set(...rot);
  return m;
}

export class Fox {
  readonly root = new THREE.Group();
  readonly position = new THREE.Vector3();
  facing = 0;
  mode: Mode = "sit";
  private body = new THREE.Group();
  private head = new THREE.Group();
  private tail = new THREE.Group();
  private legs: THREE.Group[] = [];
  private tailTip!: THREE.Mesh;
  private shadow = blobShadow(0.42);
  private path: THREE.Vector3[] = [];
  private pathTarget = new THREE.Vector3(1e5, 0, 1e5);
  private repath = 0;
  private stride = 0;
  private speed = 0;
  private hopT = 0;

  constructor(private ground: (x: number, z: number) => number) {
    this.build();
  }

  private build(): void {
    const b = this.body;
    b.position.y = 0.5;
    b.add(sphere(0.26, ORANGE, [0, 0, 0], [1, 0.95, 1.65]));
    b.add(sphere(0.2, WHITE, [0, -0.08, 0.1], [0.85, 0.75, 1.3]));
    b.add(sphere(0.17, WHITE, [0, 0.04, 0.34]));

    // Head with big cheeks, pointy snout and ears
    const h = this.head;
    h.position.set(0, 0.22, 0.44);
    h.add(sphere(0.22, ORANGE, [0, 0, 0], [1.05, 0.95, 1]));
    for (const s of [-1, 1]) {
      h.add(sphere(0.11, WHITE, [s * 0.13, -0.08, 0.09]));
      h.add(cone(0.085, 0.24, ORANGE, [s * 0.12, 0.23, -0.03], [0, 0, -s * 0.28]));
      h.add(cone(0.04, 0.09, DARK, [s * 0.155, 0.335, -0.03], [0, 0, -s * 0.28]));
      const eye = sphere(0.042, "#1a1010", [s * 0.09, 0.04, 0.18]);
      eye.add(sphere(0.016, "#ffffff", [0.012, 0.015, 0.03], [1, 1, 1], 1));
      h.add(eye);
    }
    h.add(cone(0.1, 0.26, WHITE, [0, -0.06, 0.25], [Math.PI / 2, 0, 0]));
    h.add(sphere(0.04, "#2a1a14", [0, -0.05, 0.38]));
    b.add(h);

    // Four legs with dark socks, pivoting at the hip
    for (const [x, z] of [[-0.13, 0.26], [0.13, 0.26], [-0.13, -0.26], [0.13, -0.26]]) {
      const leg = new THREE.Group();
      leg.position.set(x, -0.08, z);
      const upper = toonMesh(new THREE.CylinderGeometry(0.06, 0.05, 0.22, 8), mat(ORANGE, 0.6));
      upper.position.y = -0.1;
      const lower = toonMesh(new THREE.CylinderGeometry(0.05, 0.045, 0.2, 8), mat(DARK, 0.6));
      lower.position.y = -0.3;
      leg.add(upper, lower, sphere(0.055, DARK, [0, -0.4, 0.02], [1, 0.7, 1.3]));
      this.legs.push(leg);
      b.add(leg);
    }

    // Big fluffy tail with a glowing tip
    const t = this.tail;
    t.position.set(0, 0.06, -0.4);
    t.add(sphere(0.13, ORANGE, [0, 0.03, -0.14], [1, 1, 1.5]));
    t.add(sphere(0.16, ORANGE, [0, 0.1, -0.36], [1, 1, 1.4]));
    this.tailTip = sphere(0.12, "#c8fbff", [0, 0.16, -0.55], [1, 1, 1.2], 1.6);
    t.add(this.tailTip);
    b.add(t);

    this.root.add(this.body);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = false;
    });
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.root, this.shadow);
  }

  teleport(x: number, z: number, facing: number): void {
    this.position.set(x, this.ground(x, z), z);
    this.facing = facing;
    this.path = [];
  }

  /** Celebrate with a few happy hops. */
  hop(): void {
    this.mode = "hop";
    this.hopT = 0;
  }

  get tipPosition(): THREE.Vector3 {
    return this.tailTip.getWorldPosition(new THREE.Vector3());
  }

  /**
   * Lead the way to `goal` (or just sit by Tadeo when null). The fox waits
   * when Tadeo is far behind and comes back if he wanders off.
   */
  update(dt: number, time: number, player: THREE.Vector3, goal: THREE.Vector3 | null, nav: NavGrid, sparks: Bursts): void {
    const toPlayer = Math.hypot(player.x - this.position.x, player.z - this.position.z);
    let dest: THREE.Vector3 | null = null;
    if (this.mode === "hop") {
      this.hopT += dt;
      if (this.hopT > 1.6) this.mode = "sit";
    } else if (!goal) {
      if (toPlayer > 2.6) dest = player;
      this.mode = dest ? "run" : "sit";
    } else {
      const toGoal = Math.hypot(goal.x - this.position.x, goal.z - this.position.z);
      if (toGoal < 1.7) this.mode = "sit";
      else if (toPlayer > 13) dest = player;
      else if (toPlayer > 7.5) this.mode = "wait";
      else dest = goal;
      if (dest) this.mode = "run";
    }

    if (dest) this.follow(dt, dest, nav, toPlayer);
    else this.speed = Math.max(0, this.speed - dt * 12);
    // Reason: when not running, keep an eye on Tadeo — it makes the helper feel alive
    if (this.mode !== "run") this.turnTo(Math.atan2(player.x - this.position.x, player.z - this.position.z), dt * 5);

    this.position.y = this.ground(this.position.x, this.position.z);
    this.animate(dt, time);
    if (Math.random() < dt * (this.mode === "run" ? 10 : 3)) {
      sparks.emit(this.tipPosition, { count: 1, color: new THREE.Color(1.2, 2.4, 2.6), speed: [0.1, 0.4], up: 0.4, life: [0.5, 1], size: [0.05, 0.1], gravity: -0.2 });
    }
  }

  private follow(dt: number, dest: THREE.Vector3, nav: NavGrid, toPlayer: number): void {
    this.repath -= dt;
    if (this.repath <= 0 || dest.distanceToSquared(this.pathTarget) > 1) {
      this.path = nav.path(this.position, dest);
      this.pathTarget.copy(dest);
      this.repath = 0.8;
    }
    // Skip waypoints already reached; aim a few cells ahead for a smooth line
    while (this.path.length > 1 && Math.hypot(this.path[0].x - this.position.x, this.path[0].z - this.position.z) < 0.6) this.path.shift();
    const aim = this.path[Math.min(2, this.path.length - 1)] ?? dest;
    const dx = aim.x - this.position.x;
    const dz = aim.z - this.position.z;
    const d = Math.hypot(dx, dz);
    // Reason: slow down a little when Tadeo lags, speed up when he's right behind
    const want = RUN_SPEED * THREE.MathUtils.clamp(1.25 - toPlayer / 14, 0.65, 1.1);
    this.speed += (want - this.speed) * Math.min(1, dt * 6);
    if (d > 0.05) {
      const step = Math.min(d, this.speed * dt);
      this.position.x += (dx / d) * step;
      this.position.z += (dz / d) * step;
      this.turnTo(Math.atan2(dx, dz), dt * 10);
    }
  }

  private turnTo(target: number, k: number): void {
    const delta = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
    this.facing += delta * Math.min(1, k);
  }

  private animate(dt: number, time: number): void {
    const running = this.mode === "run" && this.speed > 0.4;
    const sit = this.mode === "sit" || this.mode === "wait";
    this.stride += dt * (running ? this.speed * 3.1 : 0);
    const s = this.stride;
    const ease = (cur: number, to: number, k = 10) => cur + (to - cur) * Math.min(1, dt * k);

    // Body: bob while trotting, sit back on the haunches when resting
    const hop = this.mode === "hop" ? Math.abs(Math.sin(this.hopT * Math.PI * 2.5)) * 0.45 : 0;
    const bob = running ? Math.abs(Math.sin(s)) * 0.06 : 0;
    this.body.position.y = ease(this.body.position.y, (this.mode === "sit" ? 0.42 : 0.5) + bob, 14);
    this.body.rotation.x = ease(this.body.rotation.x, this.mode === "sit" ? -0.45 : 0, 8);
    this.root.position.set(this.position.x, this.position.y + hop, this.position.z);
    this.root.rotation.y = this.facing + (this.mode === "hop" ? Math.sin(this.hopT * 9) * 0.3 : 0);

    // Legs: diagonal pairs swing together (a trot); folded when sitting
    this.legs.forEach((leg, i) => {
      const front = i < 2;
      const pair = i === 0 || i === 3 ? 0 : Math.PI;
      let to = running ? Math.sin(s + pair) * 0.7 : 0;
      if (this.mode === "sit") to = front ? 0.45 : -1.1;
      leg.rotation.x = ease(leg.rotation.x, to, 18);
    });

    // Head looks around; tilts curiously while waiting
    const tilt = sit ? Math.sin(time * 1.3) * 0.18 : 0;
    this.head.rotation.z = ease(this.head.rotation.z, tilt, 4);
    this.head.rotation.x = ease(this.head.rotation.x, this.mode === "sit" ? 0.35 : running ? Math.sin(s * 2) * 0.05 : 0, 8);

    // Tail: streams behind while running, wags happily otherwise
    const wag = running ? Math.sin(s * 2) * 0.25 : Math.sin(time * (this.mode === "hop" ? 16 : 7)) * 0.55;
    this.tail.rotation.y = wag;
    this.tail.rotation.x = ease(this.tail.rotation.x, running ? 0.25 : this.mode === "sit" ? -0.1 : -0.15, 6);

    this.shadow.position.set(this.position.x, this.position.y + 0.04, this.position.z);
    this.shadow.scale.setScalar(1 - hop * 0.6);
  }

  dispose(): void {
    const m = this.shadow.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
  }
}
