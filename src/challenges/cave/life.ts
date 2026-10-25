/**
 * Small signs of life in the cave: cute fluttering bats circling under the
 * rock lips, and water drops that fall from the stalactites, splash with a
 * ripple ring on the floor and set rings travelling across the pool.
 */

import * as THREE from "three";
import { mat, toonMesh } from "../../characters/parts";
import { Bursts } from "../shared/bursts";

// ── Bats ──────────────────────────────────────────────────────

interface Bat {
  root: THREE.Group;
  wings: THREE.Group[];
  center: THREE.Vector3;
  radius: number;
  speed: number;
  phase: number;
}

function wingGeometry(): THREE.ShapeGeometry {
  // Reason: scalloped trailing edge = the classic cartoon bat wing
  const s = new THREE.Shape();
  s.moveTo(0, 0.04);
  s.lineTo(0.42, 0.14);
  s.quadraticCurveTo(0.36, -0.02, 0.3, -0.08);
  s.quadraticCurveTo(0.24, -0.02, 0.18, -0.08);
  s.quadraticCurveTo(0.1, -0.02, 0.0, -0.06);
  s.lineTo(0, 0.04);
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateX(-Math.PI / 2);
  return g;
}

function createBat(wingGeo: THREE.BufferGeometry, wingMat: THREE.Material): { root: THREE.Group; wings: THREE.Group[] } {
  const root = new THREE.Group();
  const fur = mat("#4a3a63", 0.8);
  const body = toonMesh(new THREE.SphereGeometry(0.13, 12, 10), fur);
  body.scale.set(1, 0.9, 1.15);
  const head = toonMesh(new THREE.SphereGeometry(0.1, 12, 10), fur);
  head.position.set(0, 0.06, 0.13);
  root.add(body, head);
  for (const side of [-1, 1]) {
    const ear = toonMesh(new THREE.ConeGeometry(0.04, 0.1, 6), fur);
    ear.position.set(side * 0.05, 0.17, 0.12);
    ear.rotation.z = -side * 0.3;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mat("#ffe36b", 0.3, 2.4));
    eye.position.set(side * 0.04, 0.08, 0.215);
    root.add(ear, eye);
  }
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.08, 0.02, 0);
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.scale.x = side;
    pivot.add(wing);
    root.add(pivot);
    wings.push(pivot);
  }
  return { root, wings };
}

export class Bats {
  readonly group = new THREE.Group();
  private bats: Bat[] = [];
  private wingGeo = wingGeometry();
  readonly wingMat = new THREE.MeshStandardMaterial({ color: "#3a2c50", roughness: 0.7, side: THREE.DoubleSide, emissive: "#3a2c50", emissiveIntensity: 0.25 });

  constructor(spots: { at: THREE.Vector3; radius: number }[]) {
    spots.forEach((s, i) => {
      const { root, wings } = createBat(this.wingGeo, this.wingMat);
      this.group.add(root);
      this.bats.push({ root, wings, center: s.at.clone(), radius: s.radius, speed: 0.9 + (i % 3) * 0.25, phase: i * 2.1 });
    });
  }

  update(time: number): void {
    for (const b of this.bats) {
      const t = time * b.speed + b.phase;
      // Reason: a lissajous loop with a bobbing height looks like fluttering rather than orbiting
      const x = Math.sin(t) * b.radius;
      const z = Math.sin(t * 2) * b.radius * 0.45;
      const y = Math.sin(t * 3.1) * 0.35;
      b.root.position.set(b.center.x + x, b.center.y + y, b.center.z + z);
      const dx = Math.cos(t) * b.radius;
      const dz = Math.cos(t * 2) * b.radius * 0.9;
      b.root.rotation.y = Math.atan2(dx, dz);
      b.root.rotation.z = -dx * 0.08;
      const flap = Math.sin(time * 17 + b.phase) * 0.85;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
    }
  }

  dispose(): void {
    this.wingGeo.dispose();
    this.wingMat.dispose();
  }
}

// ── Drips ─────────────────────────────────────────────────────

interface Drip {
  from: THREE.Vector3;
  floor: number;
  pool: boolean;
  y: number;
  vy: number;
  wait: number;
  drop: THREE.Mesh;
}

interface Ring {
  mesh: THREE.Mesh;
  age: number;
}

export class Drips {
  readonly group = new THREE.Group();
  /** Called when a drop lands in the pool (x, z). */
  onPoolDrop: ((x: number, z: number) => void) | null = null;
  private drips: Drip[] = [];
  private rings: Ring[] = [];
  private ringGeo = new THREE.RingGeometry(0.75, 1, 28).rotateX(-Math.PI / 2);
  private dropGeo = new THREE.SphereGeometry(0.045, 8, 6).scale(1, 1.8, 1);
  private dropMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.5, 1.9), toneMapped: false });
  private ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.1, 1.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

  constructor(spots: { from: THREE.Vector3; floor: number; pool: boolean }[], private splash: Bursts) {
    for (const s of spots) {
      const drop = new THREE.Mesh(this.dropGeo, this.dropMat);
      drop.visible = false;
      this.group.add(drop);
      this.drips.push({ ...s, y: s.from.y, vy: 0, wait: Math.random() * 3, drop });
    }
  }

  update(dt: number): void {
    for (const d of this.drips) {
      if (d.wait > 0) {
        d.wait -= dt;
        // Reason: the drop swells at the tip for a moment before it falls
        d.drop.visible = d.wait < 0.6;
        d.drop.position.copy(d.from);
        d.drop.scale.setScalar(Math.max(0.2, 1 - d.wait / 0.6));
        if (d.wait <= 0) {
          d.y = d.from.y;
          d.vy = 0;
        }
        continue;
      }
      d.vy -= 18 * dt;
      d.y += d.vy * dt;
      d.drop.position.set(d.from.x, d.y, d.from.z);
      if (d.y <= d.floor) {
        d.drop.visible = false;
        d.wait = 1.4 + Math.random() * 2.6;
        this.ring(d.from.x, d.floor + 0.03, d.from.z);
        this.splash.emit(new THREE.Vector3(d.from.x, d.floor + 0.05, d.from.z), {
          count: 5,
          color: new THREE.Color(0.7, 1.4, 1.7),
          speed: [0.6, 1.3],
          up: 1.6,
          life: [0.25, 0.45],
          size: [0.04, 0.07],
          gravity: 9,
          drag: 0.5,
        });
        if (d.pool) this.onPoolDrop?.(d.from.x, d.from.z);
      }
    }
    for (const r of this.rings) {
      r.age += dt;
      const t = r.age / 0.9;
      r.mesh.visible = t < 1;
      r.mesh.scale.setScalar(0.08 + t * 0.55);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.8;
    }
  }

  private ring(x: number, y: number, z: number): void {
    let r = this.rings.find((q) => q.age >= 0.9);
    if (!r) {
      const mesh = new THREE.Mesh(this.ringGeo, this.ringMat.clone());
      this.group.add(mesh);
      r = { mesh, age: 0 };
      this.rings.push(r);
    }
    r.age = 0;
    r.mesh.position.set(x, y, z);
  }

  dispose(): void {
    this.ringGeo.dispose();
    this.dropGeo.dispose();
    this.dropMat.dispose();
    this.ringMat.dispose();
    for (const r of this.rings) (r.mesh.material as THREE.Material).dispose();
  }
}
