/**
 * Ambient life in the gorge: butterflies wandering over the meadows, darting
 * dragonflies above the river, swallows circling high up, leaves drifting
 * downstream and now and then a little fish leaping out of the water.
 */

import * as THREE from "three";
import { mat, toonMesh } from "../../characters/parts";
import { Fx } from "./fx";
import { riverX, heightAt } from "./gorgeShape";
import { Bin, rand } from "./kit";

interface Flyer {
  obj: THREE.Group;
  wings: THREE.Object3D[];
  home: THREE.Vector3;
  seed: number;
  speed: number;
  range: number;
}

interface Leaf {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  spin: number;
}

interface Fish {
  mesh: THREE.Group;
  t: number;
  dur: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
}

const BUTTERFLY_COLORS = ["#ff9f1c", "#4cc9f0", "#ffd23f", "#ff6fb5", "#b388ff"];

function wingShape(w: number, h: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(w * 0.3, h * 0.9, w * 1.1, h * 0.8, w, h * 0.15);
  s.bezierCurveTo(w * 1.05, -h * 0.5, w * 0.4, -h * 0.7, 0, -h * 0.1);
  return new THREE.ShapeGeometry(s, 6);
}

export class Critters {
  readonly group = new THREE.Group();
  private flyers: Flyer[] = [];
  private birds: Flyer[] = [];
  private leaves: Leaf[] = [];
  private fish: Fish | null = null;
  private fishTimer = 3;
  private t = 0;
  private wingMats = new Map<string, THREE.MeshStandardMaterial>();

  constructor(
    private fx: Fx,
    private bin: Bin,
  ) {
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1;
      const home = new THREE.Vector3(side * rand(8, 18), 0, rand(-12, 10));
      home.y = heightAt(home.x, home.z) + rand(0.8, 1.8);
      this.flyers.push(this.butterfly(BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length], home, i));
    }
    for (let i = 0; i < 3; i++) {
      const z = rand(-14, 8);
      this.flyers.push(this.dragonfly(new THREE.Vector3(riverX(z) + rand(-2, 2), 0.7, z), 20 + i));
    }
    for (let i = 0; i < 4; i++) this.birds.push(this.bird(i));
    for (let i = 0; i < 12; i++) this.leaves.push(this.leaf(i));
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    for (const f of this.flyers) {
      const s = f.seed;
      const k = t * f.speed;
      // Reason: sums of incommensurate sines give a wandering, never-repeating flight path
      const x = f.home.x + (Math.sin(k * 0.7 + s) + Math.sin(k * 1.9 + s * 2) * 0.4) * f.range;
      const z = f.home.z + (Math.cos(k * 0.6 + s * 3) + Math.sin(k * 1.3 + s) * 0.4) * f.range;
      const y = f.home.y + Math.sin(k * 2.3 + s) * 0.3 * f.range * 0.4;
      const prev = f.obj.position.clone();
      f.obj.position.set(x, y, z);
      const dx = x - prev.x;
      const dz = z - prev.z;
      if (dx * dx + dz * dz > 1e-6) f.obj.rotation.y = Math.atan2(dx, dz);
      const flap = Math.sin(t * (f.wings.length > 2 ? 60 : 16) + s);
      f.wings.forEach((w, i) => (w.rotation.z = (i % 2 ? -1 : 1) * (0.25 + flap * 0.85)));
    }
    for (const b of this.birds) {
      const a = t * b.speed + b.seed;
      b.obj.position.set(b.home.x + Math.cos(a) * b.range, b.home.y + Math.sin(a * 2) * 1.2, b.home.z + Math.sin(a) * b.range * 0.6);
      b.obj.rotation.set(0, -a + (b.speed > 0 ? 0 : Math.PI), 0.35);
      const flap = Math.sin(t * 7 + b.seed) > 0.2 ? Math.sin(t * 14 + b.seed) * 0.7 : 0.1;
      b.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * flap));
    }
    for (const l of this.leaves) {
      l.z += dt * 1.4;
      l.x += Math.sin(t * 0.8 + l.spin * 9) * dt * 0.3;
      if (l.z > 26) this.resetLeaf(l, -22);
      l.mesh.position.set(riverX(l.z) + l.x, 0.04 + Math.sin(t * 2 + l.spin * 5) * 0.02, l.z);
      l.mesh.rotation.y += dt * l.spin;
    }
    this.updateFish(dt);
  }

  private updateFish(dt: number): void {
    this.fishTimer -= dt;
    if (!this.fish && this.fishTimer < 0) {
      const z = rand(2, 14);
      const x = riverX(z) + rand(-2, 2);
      const g = new THREE.Group();
      const body = toonMesh(new THREE.SphereGeometry(0.16, 12, 8), mat("#ff8c3a", 0.4));
      body.scale.set(0.6, 0.8, 1.4);
      const tail = toonMesh(new THREE.ConeGeometry(0.14, 0.2, 4), mat("#ffb347", 0.4));
      tail.rotation.x = -Math.PI / 2;
      tail.position.z = -0.3;
      tail.scale.x = 0.3;
      g.add(body, tail);
      this.group.add(g);
      const dir = Math.random() < 0.5 ? -1 : 1;
      const from = new THREE.Vector3(x, -0.2, z);
      this.fish = { mesh: g, t: 0, dur: 0.9, from, to: from.clone().add(new THREE.Vector3(dir * 1.6, 0, 0.6)) };
      this.fx.splash(new THREE.Vector3(x, 0.02, z), 0.3);
    }
    const f = this.fish;
    if (!f) return;
    f.t += dt;
    const k = Math.min(f.t / f.dur, 1);
    f.mesh.position.lerpVectors(f.from, f.to, k);
    f.mesh.position.y += Math.sin(k * Math.PI) * 1.3;
    f.mesh.lookAt(f.to.x, f.mesh.position.y + Math.cos(k * Math.PI) * 1.2, f.to.z);
    if (k >= 1) {
      this.fx.splash(new THREE.Vector3(f.to.x, 0.02, f.to.z), 0.35);
      this.group.remove(f.mesh);
      f.mesh.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.fish = null;
      this.fishTimer = rand(4, 8);
    }
  }

  private butterfly(color: string, home: THREE.Vector3, seed: number): Flyer {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.12, 3, 6), mat("#2a1f1a", 0.6));
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const wings: THREE.Object3D[] = [];
    const wingMat = this.wing(color, 0.35);
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const w = new THREE.Mesh(wingShape(0.17, 0.14), wingMat);
      w.rotation.x = -Math.PI / 2;
      w.scale.x = side;
      pivot.add(w);
      wings.push(pivot);
      g.add(pivot);
    }
    g.scale.setScalar(1.5);
    this.group.add(g);
    return { obj: g, wings, home, seed: seed * 1.7, speed: rand(0.35, 0.6), range: rand(1.5, 3) };
  }

  private dragonfly(home: THREE.Vector3, seed: number): Flyer {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.3, 3, 6), mat("#1fb6c9", 0.3, 0.6));
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const wings: THREE.Object3D[] = [];
    const wingMat = this.wing("#d9f6ff", 0.5);
    for (const z of [0.05, -0.03]) {
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.z = z;
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.05), wingMat);
        w.rotation.x = -Math.PI / 2;
        w.position.x = side * 0.11;
        pivot.add(w);
        wings.push(pivot);
        g.add(pivot);
      }
    }
    this.group.add(g);
    return { obj: g, wings, home, seed, speed: rand(0.6, 0.9), range: rand(1.5, 2.5) };
  }

  private bird(i: number): Flyer {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.35, 3, 6), mat("#2d3a5a", 0.6));
    body.rotation.x = Math.PI / 2;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat("#f2efe6", 0.6));
    belly.position.set(0, -0.05, 0.08);
    g.add(body, belly);
    const wings: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.22), this.wing("#2d3a5a", 0.1));
      w.rotation.x = -Math.PI / 2;
      w.position.x = side * 0.35;
      pivot.add(w);
      wings.push(pivot);
      g.add(pivot);
    }
    this.group.add(g);
    const speed = (i % 2 ? 1 : -1) * rand(0.25, 0.4);
    return { obj: g, wings, home: new THREE.Vector3(rand(-8, 8), rand(17, 24), rand(-30, -12)), seed: i * 2.1, speed, range: rand(9, 16) };
  }

  /** Double-sided wing material (own instance; shared `mat()` materials stay single-sided). */
  private wing(color: string, glow: number): THREE.MeshStandardMaterial {
    let m = this.wingMats.get(color);
    if (!m) {
      m = this.bin.material(new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide, emissive: color, emissiveIntensity: glow }));
      this.wingMats.set(color, m);
    }
    return m;
  }

  private leaf(i: number): Leaf {
    const geo = new THREE.SphereGeometry(0.14, 6, 4);
    const colors = ["#e8a23a", "#d9622b", "#9cc94a", "#f2c94c"];
    const mesh = new THREE.Mesh(geo, mat(colors[i % colors.length], 0.7));
    mesh.scale.set(1, 0.12, 0.6);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const l = { mesh, x: 0, z: 0, spin: rand(-0.6, 0.6) };
    this.resetLeaf(l, rand(-22, 24));
    return l;
  }

  private resetLeaf(l: Leaf, z: number): void {
    l.z = z;
    l.x = rand(-2.5, 2.5);
  }
}
