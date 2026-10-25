/**
 * Juicy effects for the hen yard: real 3D feathers that puff out, tumble and
 * sway down and settle on the grass; dust puffs from running feet; golden
 * sparkles; water drops from puddle splashes. `Footsteps` turns movement into
 * dust and splashes so every runner (Tadeo, hens) kicks up the ground.
 */

import * as THREE from "three";
import { Bursts } from "../shared/bursts";
import { glowTexture, puffTexture } from "../../world/ambient/textures";
import { Disposable } from "./dispose";
import { Ground } from "./ground";

const MAX_FEATHERS = 240;

interface Feather {
  p: THREE.Vector3;
  v: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  seed: number;
  color: THREE.Color;
}

/** A curved feather blade (vane plus quill), about 1 unit long, lying in the xz-plane. */
function featherGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.quadraticCurveTo(0.2, -0.15, 0.13, 0.25);
  s.quadraticCurveTo(0.07, 0.45, 0, 0.5);
  s.quadraticCurveTo(-0.1, 0.3, -0.14, 0.05);
  s.quadraticCurveTo(-0.13, -0.3, 0, -0.5);
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateX(-Math.PI / 2);
  // Reason: bend the vane a little so the feather catches light from different angles as it tumbles
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getX(i) * pos.getX(i) * 0.9);
  g.computeVertexNormals();
  return g;
}

export class Feathers {
  readonly mesh: THREE.InstancedMesh;
  private list: Feather[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor(owned: Disposable[]) {
    const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.75, side: THREE.DoubleSide, emissive: "#ffffff", emissiveIntensity: 0.12 });
    owned.push(material);
    this.mesh = new THREE.InstancedMesh(featherGeometry(), material, MAX_FEATHERS);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FEATHERS * 3), 3);
  }

  /** Puff `count` feathers out of `at` in the given colours. */
  emit(at: THREE.Vector3, colors: THREE.ColorRepresentation[], count: number, speed = 2.6, up = 2.2): void {
    for (let i = 0; i < count && this.list.length < MAX_FEATHERS; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize();
      this.list.push({
        p: at.clone().addScaledVector(dir, 0.15),
        v: dir.multiplyScalar(speed * (0.5 + Math.random() * 0.7)).add(new THREE.Vector3(0, up * (0.6 + Math.random() * 0.6), 0)),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(9),
        age: 0,
        life: 3.5 + Math.random() * 2.5,
        size: 0.13 + Math.random() * 0.09,
        seed: Math.random() * 100,
        color: new THREE.Color(colors[i % colors.length]).multiplyScalar(0.92 + Math.random() * 0.16),
      });
    }
  }

  update(dt: number): void {
    let n = 0;
    const keep: Feather[] = [];
    for (const f of this.list) {
      f.age += dt;
      if (f.age >= f.life) continue;
      const onGround = f.p.y <= 0.03;
      if (!onGround) {
        // Light as a feather: strong air drag, slow fall, sideways swaying
        f.v.y -= 3.2 * dt;
        f.v.multiplyScalar(Math.exp(-3.2 * dt));
        f.v.y = Math.max(f.v.y, -0.75);
        f.p.addScaledVector(f.v, dt);
        f.p.x += Math.sin(f.age * 4.5 + f.seed) * 0.7 * dt;
        f.p.z += Math.cos(f.age * 3.7 + f.seed) * 0.4 * dt;
        f.rot.x += f.spin.x * dt;
        f.rot.y += f.spin.y * dt;
        f.rot.z = Math.sin(f.age * 4.5 + f.seed) * 0.8;
        f.spin.multiplyScalar(Math.exp(-0.8 * dt));
      } else {
        // Settled: lie flat on the grass
        f.p.y = 0.03;
        f.rot.x *= 1 - Math.min(dt * 6, 1);
        f.rot.z *= 1 - Math.min(dt * 6, 1);
      }
      const shrink = Math.min(1, (f.life - f.age) / 0.6) * Math.min(1, f.age * 10);
      this.s.setScalar(f.size * shrink);
      this.m.compose(f.p, this.q.setFromEuler(f.rot), this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, f.color);
      keep.push(f);
      n++;
    }
    this.list = keep;
    this.mesh.count = n;
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }
}

export class Fx {
  readonly group = new THREE.Group();
  readonly feathers: Feathers;
  private dust = new Bursts(puffTexture(), false);
  private sparks = new Bursts(glowTexture(), true);
  private drops = new Bursts(glowTexture(), false);

  constructor(owned: Disposable[]) {
    this.feathers = new Feathers(owned);
    this.group.add(this.feathers.mesh, this.dust.mesh, this.sparks.mesh, this.drops.mesh);
  }

  /** Small cloud of dust at the feet (size 1 = a running step, 3 = a belly-flop landing). */
  puff(at: THREE.Vector3, size = 1, color: THREE.ColorRepresentation = "#e3cba4"): void {
    this.dust.emit(new THREE.Vector3(at.x, 0.12, at.z), {
      count: Math.round(2 + size * 3),
      color,
      speed: [0.4 * size, 1.1 * size],
      up: 0.35,
      life: [0.5, 0.9 + size * 0.15],
      size: [0.25 * Math.sqrt(size), 0.5 * Math.sqrt(size)],
      grow: 2.0,
      drag: 3,
      flat: true,
      spread: 0.2,
    });
  }

  /** One soft puff of chimney smoke drifting up. */
  smoke(at: THREE.Vector3): void {
    this.dust.emit(at, { count: 1, color: "#f4f1ec", speed: [0.1, 0.3], up: 0.9, life: [3, 4.5], size: [0.5, 0.8], grow: 3, drag: 0.4, spread: 0.2 });
  }

  sparkle(at: THREE.Vector3, count = 6, color: THREE.ColorRepresentation = new THREE.Color(2.6, 2.0, 0.6)): void {
    this.sparks.emit(at, { count, color, speed: [0.5, 2.2], up: 1.2, life: [0.5, 1.1], size: [0.07, 0.16], gravity: 2, spread: 0.4 });
  }

  splash(at: THREE.Vector3, size = 1): void {
    this.drops.emit(new THREE.Vector3(at.x, 0.1, at.z), {
      count: Math.round(5 + size * 6),
      color: "#d6efff",
      speed: [1, 2.2 * size],
      up: 2.4,
      life: [0.35, 0.7],
      size: [0.08, 0.15],
      gravity: 12,
      drag: 0.5,
      spread: 0.25,
    });
  }

  update(dt: number): void {
    this.feathers.update(dt);
    this.dust.update(dt);
    this.sparks.update(dt);
    this.drops.update(dt);
  }

  dispose(): void {
    this.dust.dispose();
    this.sparks.dispose();
    this.drops.dispose();
  }
}

/** Turns runners' movement into dust puffs on bare earth and splashes in puddles. */
export class Footsteps {
  private walked = new Map<string, number>();
  private wet = new Map<string, number>();
  private at = new THREE.Vector3();

  constructor(private fx: Fx, private ground: Ground) {}

  step(id: string, x: number, z: number, speed: number, dt: number, light = false): void {
    const d = (this.walked.get(id) ?? 0) + speed * dt;
    const stride = light ? 0.55 : 0.8;
    const puddle = this.ground.puddleAt(x, z);
    const inPuddle = puddle >= 0;
    // Entering a puddle always splashes
    if (inPuddle && !this.wet.get(id) && speed > 0.5) {
      this.fx.splash(this.at.set(x, 0, z), light ? 0.6 : 1.2);
      this.ground.splash(x, z, light ? 0.6 : 1);
    }
    this.wet.set(id, inPuddle ? 1 : 0);
    if (d < stride) {
      this.walked.set(id, d);
      return;
    }
    this.walked.set(id, 0);
    if (speed < 2.2) return;
    if (inPuddle) {
      this.fx.splash(this.at.set(x, 0, z), light ? 0.4 : 0.8);
      this.ground.splash(x, z, light ? 0.4 : 0.8);
    } else if (this.ground.dirt(x, z) > 0.4) {
      this.fx.puff(this.at.set(x, 0, z), light ? 0.5 : 1);
    } else if (!light && Math.random() < 0.35) {
      this.fx.puff(this.at.set(x, 0, z), 0.6, "#d8e6b0");
    }
  }
}
