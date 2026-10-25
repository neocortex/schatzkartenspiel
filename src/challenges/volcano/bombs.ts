/**
 * Lava bombs: glowing, crusty rocks the volcano lobs in high arcs. Each one
 * shows a warning ring where it will land (dangerous bombs only), trails
 * embers and smoke, and on impact leaves a cooling lava splat, sparks,
 * tumbling glowing debris and a flash of light — or a hissing splash when it
 * drops into the sea.
 */

import * as THREE from "three";
import { Noise2D, smoothstep } from "../../core/noise";
import { toonMesh } from "../../characters/parts";
import { glowTexture } from "../../world/ambient/textures";
import { Bursts } from "./kit/bursts";
import { Markers, Ring } from "./markers";

export const RING_RADIUS = 1.75;

export interface Bomb {
  root: THREE.Object3D;
  heat: { value: number };
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  state: "idle" | "flying" | "landed";
  ring: Ring | null;
  dangerous: boolean;
  water: boolean;
  age: number;
  spin: THREE.Vector3;
  whistled: boolean;
}

export interface Impact {
  pos: THREE.Vector3;
  dangerous: boolean;
  water: boolean;
}

const noise = new Noise2D(515);

function bombGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.62, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const emit = new Float32Array(pos.count);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const n = noise.noise(p.x * 2.4 + p.z * 1.2, p.y * 2.4) * 0.65 + noise.noise(p.z * 4.1 - 3, p.x * 4.1 + p.y * 2) * 0.35;
    p.multiplyScalar(1 + n * 0.22);
    pos.setXYZ(i, p.x, p.y, p.z);
    // Reason: the sunken parts are the cracks between crust plates, so they glow
    emit[i] = smoothstep(-0.02, -0.4, n);
  }
  g.setAttribute("aEmit", new THREE.BufferAttribute(emit, 1));
  g.computeVertexNormals();
  return g;
}

function bombMaterial(heat: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: "#3a2a2c", roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHeat = heat;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aEmit;\nvarying float vEmit;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvEmit = aEmit;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uHeat;\nvarying float vEmit;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += (vec3(4.6, 1.4, 0.2) * vEmit + vec3(0.35, 0.08, 0.02)) * uHeat;`,
      );
  };
  return m;
}

/** Small glowing rock chips thrown out by impacts (instanced, simple ballistics with one bounce). */
class Debris {
  readonly mesh: THREE.InstancedMesh;
  private items: { p: THREE.Vector3; v: THREE.Vector3; life: number; age: number; spin: number; size: number; floor: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private c = new THREE.Color();

  constructor(material: THREE.Material) {
    const g = new THREE.DodecahedronGeometry(0.16, 0);
    this.mesh = new THREE.InstancedMesh(g, material, 80);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }

  burst(at: THREE.Vector3, count: number, floor: number): void {
    for (let i = 0; i < count; i++) {
      if (this.items.length >= 80) this.items.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = 2.5 + Math.random() * 4.5;
      this.items.push({
        p: at.clone().setY(at.y + 0.3),
        v: new THREE.Vector3(Math.cos(a) * sp, 5 + Math.random() * 5, Math.sin(a) * sp),
        life: 1.4 + Math.random() * 0.8,
        age: 0,
        spin: Math.random() * 10,
        size: 0.6 + Math.random() * 0.9,
        floor,
      });
    }
  }

  update(dt: number): void {
    this.items = this.items.filter((d) => (d.age += dt) < d.life);
    this.items.forEach((d, i) => {
      d.v.y -= 22 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.floor) {
        d.p.y = d.floor;
        d.v.y = Math.abs(d.v.y) * 0.3;
        d.v.x *= 0.5;
        d.v.z *= 0.5;
      }
      d.spin += dt * 8;
      const k = 1 - smoothstep(0.6, 1, d.age / d.life);
      this.q.setFromEuler(new THREE.Euler(d.spin, d.spin * 0.7, 0));
      this.m.compose(d.p, this.q, new THREE.Vector3(d.size * k, d.size * k, d.size * k));
      this.mesh.setMatrixAt(i, this.m);
      // Glowing orange chips that cool to dark crust
      const heat = Math.max(0, 1 - d.age * 1.1);
      this.mesh.setColorAt(i, this.c.setRGB(0.25 + heat * 6, 0.12 + heat * 1.6, 0.1 + heat * 0.2));
    });
    this.mesh.count = this.items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Bombs {
  readonly group = new THREE.Group();
  readonly bombs: Bomb[] = [];
  readonly materials: THREE.Material[] = [];
  readonly light = new THREE.PointLight("#ff7a2a", 0, 16, 2);
  private debris: Debris;
  private glowMat: THREE.SpriteMaterial;
  private tmp = new THREE.Vector3();
  private frame = 0;

  constructor(
    private ground: (x: number, z: number) => number,
    private markers: Markers,
    private bursts: Bursts,
    private from: THREE.Vector3,
  ) {
    this.glowMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: new THREE.Color(2.6, 0.9, 0.18),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    const debrisMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 });
    debrisMat.emissive.set("#000000");
    this.materials.push(this.glowMat, debrisMat);
    const geo = bombGeometry();
    for (let i = 0; i < 22; i++) {
      const heat = { value: 1 };
      const mat = bombMaterial(heat);
      this.materials.push(mat);
      const root = new THREE.Group();
      root.add(toonMesh(geo, mat));
      const glow = new THREE.Sprite(this.glowMat);
      glow.scale.setScalar(3.4);
      glow.renderOrder = 4;
      root.add(glow);
      root.visible = false;
      this.group.add(root);
      this.bombs.push({
        root, heat, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 1, arc: 0, state: "idle",
        ring: null, dangerous: false, water: false, age: 0, spin: new THREE.Vector3(), whistled: false,
      });
    }
    this.debris = new Debris(debrisMat);
    this.group.add(this.debris.mesh, this.light);
  }

  /** Bombs still in the air (for targeting rules and the E2E autopilot). */
  get flying(): Bomb[] {
    return this.bombs.filter((b) => b.state === "flying");
  }

  /** Lob a bomb from the crater to `to`; returns false when the pool is exhausted. */
  launch(to: THREE.Vector3, dangerous: boolean, dur: number, water = false): boolean {
    const b = this.bombs.find((x) => x.state === "idle");
    if (!b) return false;
    b.from.copy(this.from).add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5));
    b.to.copy(to);
    b.t = 0;
    b.dur = dur;
    b.arc = 26 + b.from.distanceTo(to) * 0.16;
    b.state = "flying";
    b.dangerous = dangerous;
    b.water = water;
    b.whistled = false;
    b.heat.value = 1;
    b.spin.set(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3);
    b.root.visible = true;
    (b.root.children[1] as THREE.Sprite).visible = true;
    b.root.scale.setScalar(dangerous ? 1 : 0.85);
    b.ring = dangerous ? this.markers.ring(to.x, to.z) : null;
    return true;
  }

  /** Advance all bombs; returns the impacts that happened this frame. */
  update(dt: number, onWhistle?: (b: Bomb) => void): Impact[] {
    const impacts: Impact[] = [];
    this.frame++;
    for (const b of this.bombs) {
      if (b.state === "flying") {
        b.t += dt;
        const u = Math.min(b.t / b.dur, 1);
        this.tmp.lerpVectors(b.from, b.to, u);
        this.tmp.y += b.arc * 4 * u * (1 - u);
        b.root.position.copy(this.tmp);
        b.root.rotation.x += b.spin.x * dt;
        b.root.rotation.y += b.spin.y * dt;
        if (b.ring) b.ring.uniforms.uProgress.value = u;
        if (!b.whistled && b.dur - b.t < 0.42) {
          b.whistled = true;
          onWhistle?.(b);
        }
        this.trail(b, u);
        if (u >= 1) impacts.push(this.land(b));
      } else if (b.state === "landed") {
        b.age += dt;
        b.heat.value = Math.max(0, 1 - b.age / 3);
        // Reason: the cooled rock sinks into the ground instead of popping out of existence
        if (b.age > 3.2) b.root.position.y -= dt * 0.8;
        if (b.age > 4.6) {
          b.state = "idle";
          b.root.visible = false;
        }
      }
    }
    this.debris.update(dt);
    this.light.intensity = Math.max(0, this.light.intensity - dt * 260);
    return impacts;
  }

  private trail(b: Bomb, u: number): void {
    const p = b.root.position;
    const jitter = () => (Math.random() - 0.5) * 0.4;
    this.bursts.add("glow", {
      pos: new THREE.Vector3(p.x + jitter(), p.y + jitter(), p.z + jitter()),
      vel: new THREE.Vector3(jitter(), jitter() + 0.5, jitter()),
      life: 0.35 + Math.random() * 0.3,
      size: [0.9, 0.15],
      color: new THREE.Color(3.2, 1.0, 0.16),
    });
    // Reason: random gaps and sizes keep the smoke trail from looking like a string of beads
    if (u > 0.06 && Math.random() < 0.55) {
      this.bursts.add("puff", {
        pos: new THREE.Vector3(p.x + jitter() * 2, p.y + jitter() * 2, p.z + jitter() * 2),
        vel: new THREE.Vector3(jitter() * 2, 0.8, jitter() * 2),
        life: 0.8 + Math.random() * 0.8,
        size: [0.7 + Math.random() * 0.6, 2.4 + Math.random() * 1.6],
        color: new THREE.Color("#8a807b"),
        alpha: 0.3,
        drag: 1.2,
        spin: 0.6,
      });
    }
  }

  private land(b: Bomb): Impact {
    const pos = b.to.clone();
    if (b.ring) this.markers.release(b.ring);
    b.ring = null;
    (b.root.children[1] as THREE.Sprite).visible = false;
    if (b.water) {
      b.state = "idle";
      b.root.visible = false;
      this.bursts.puffs(pos.clone().setY(0.2), 9, "#ffffff", [0.8, 3.2], 1.6, 3.2, 1.6, 0.85);
      this.bursts.puffs(pos.clone().setY(0.6), 5, "#eef2f5", [2, 6], 1.2, 2.2, 3.2, 0.5);
      this.bursts.sparks(pos.clone().setY(0.3), 8, 6, new THREE.Color(2.4, 0.8, 0.2), 0.25);
      return { pos, dangerous: false, water: true };
    }
    b.state = "landed";
    b.age = 0;
    b.root.position.set(pos.x, pos.y - 0.2, pos.z);
    this.markers.splat(pos.x, pos.z);
    this.bursts.sparks(pos.clone().setY(pos.y + 0.3), 30, 10, new THREE.Color(3.4, 1.2, 0.22), 0.32, 0.55);
    this.bursts.puffs(pos.clone().setY(pos.y + 0.2), 7, "#57504d", [0.9, 3], 1.4, 1.6, 1.7, 0.75);
    this.debris.burst(pos, 9, this.ground(pos.x, pos.z) + 0.08);
    this.light.position.set(pos.x, pos.y + 1.6, pos.z);
    this.light.intensity = 180;
    return { pos, dangerous: b.dangerous, water: false };
  }
}
