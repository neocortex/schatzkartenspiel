/**
 * Leaves drifting down from the trees near the focus: each leaf tumbles and
 * sways like a pendulum as it falls, drifts with the breeze, settles flat on
 * the ground and shrinks away. The CPU only picks spawn spots under trees and
 * writes the spawn time; the fall is animated in the vertex shader.
 */

import * as THREE from "three";
import { Heightfield, HF_GLSL } from "../Heightfield";
import { WorldUniforms } from "../Terrain";
import { Noise2D, smoothstep } from "../../core/noise";
import { WIND } from "./Smoke";
import { findSpot, rnd } from "./spawn";

const COUNT = 56;
const SPAWN_RADIUS = 28;
const LINGER = 3.5;

const MEADOW_LEAVES = ["#6fae3a", "#9cc44a", "#e8c547", "#e88a2a", "#c65a2a"].map((c) => new THREE.Color(c));
const ENCHANTED_LEAVES = ["#9a6ad6", "#3fb6a8", "#d77ad0", "#6fae3a"].map((c) => new THREE.Color(c));

const VERT = /* glsl */ `
uniform float uTime;
uniform vec2 uWind;
attribute vec4 aSpawn;  // xyz start position, w spawn time
attribute vec4 aLeaf;   // x seed, y fall speed, z landing time, w size
attribute vec3 aColor;
varying vec3 vColor;
${HF_GLSL}
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
void main() {
  float t = max(uTime - aSpawn.w, 0.0);
  float tm = min(t, aLeaf.z);
  float s = aLeaf.x;
  // Pendulum sway plus a gentle drift with the wind
  float sway = sin(tm * 2.1 + s * 6.0);
  vec3 p = aSpawn.xyz;
  p.xz += vec2(sway * 0.6, cos(tm * 1.5 + s * 3.0) * 0.3) + uWind * tm * 0.35;
  p.y -= tm * aLeaf.y;
  float ground = hfHeight(p.xz) + 0.04;
  float landed = smoothstep(aLeaf.z - 0.4, aLeaf.z, t);
  p.y = max(p.y, ground);
  // Tumbling while falling, lying flat once landed
  mat3 r = rotY(tm * 2.4 + s * 10.0) * rotX(sway * 1.1 * (1.0 - landed)) * rotZ(sin(tm * 3.1 + s) * 0.6 * (1.0 - landed));
  float fade = 1.0 - smoothstep(aLeaf.z + ${(LINGER - 1).toFixed(1)}, aLeaf.z + ${LINGER.toFixed(1)}, t);
  vec3 local = r * (position * aLeaf.w * fade);
  vec3 n = r * vec3(0.0, 1.0, 0.0);
  vColor = aColor * (0.62 + 0.45 * abs(n.y));
  gl_Position = projectionMatrix * viewMatrix * vec4(p + local, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;

/** Pointed oval leaf in the xz plane (tip towards +z), 1 unit long. */
function leafGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pts = [0, 0, -0.5, 0.22, 0, -0.15, 0.18, 0, 0.2, 0, 0, 0.5, -0.18, 0, 0.2, -0.22, 0, -0.15];
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]);
  return g;
}

export class Leaves {
  readonly object: THREE.Mesh;
  private spawn: THREE.InstancedBufferAttribute;
  private leaf: THREE.InstancedBufferAttribute;
  private color: THREE.InstancedBufferAttribute;
  private deadAt = new Float32Array(COUNT);
  private spot = new THREE.Vector2();
  // Reason: same seed and scale as the grove noise in Vegetation.ts, so leaves fall where the tree groves are
  private grove = new Noise2D(4242);

  constructor(
    private hf: Heightfield,
    world: WorldUniforms,
  ) {
    const base = leafGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute("position", base.attributes.position);
    this.spawn = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 4).fill(-1000), 4);
    this.leaf = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 4), 4);
    this.color = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
    geo.setAttribute("aSpawn", this.spawn);
    geo.setAttribute("aLeaf", this.leaf);
    geo.setAttribute("aColor", this.color);
    geo.instanceCount = COUNT;
    // Reason: stagger the first wave so leaves don't all start falling on the same frame
    for (let i = 0; i < COUNT; i++) this.deadAt[i] = Math.random() * 8;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: world.uTime,
        uHeightTex: world.uHeightTex,
        uMaskTex: world.uMaskTex,
        uWind: { value: new THREE.Vector2(WIND.x, WIND.z) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
    this.object = new THREE.Mesh(geo, mat);
    this.object.frustumCulled = false;
    this.object.name = "leaves";
  }

  /** Rough chance that a tree canopy is overhead (enchanted forest or a meadow grove). */
  private treeChance(x: number, z: number): number {
    const forest = this.hf.maskAt(x, z, 1);
    const grove = smoothstep(0.05, 0.45, this.grove.fbm(x * 0.028, z * 0.028, 3)) * this.hf.maskAt(x, z, 3);
    return Math.max(forest * 0.8, grove);
  }

  private underTree = (x: number, z: number): boolean => this.hf.heightAt(x, z) > 1.2 && Math.random() < this.treeChance(x, z);

  update(time: number, focus: THREE.Vector3): void {
    let dirty = false;
    let spawns = 0;
    for (let i = 0; i < COUNT; i++) {
      const far = Math.hypot(this.spawn.getX(i) - focus.x, this.spawn.getZ(i) - focus.z) > SPAWN_RADIUS + 12;
      if (time < this.deadAt[i] && !far) continue;
      if (spawns++ > 2 || !findSpot(focus.x, focus.z, 0, SPAWN_RADIUS, 4, this.underTree, this.spot)) {
        this.deadAt[i] = time + rnd(0.5, 2);
        // Reason: park a far leaf (invisible: spawn time in the distant past) at the focus so it waits for its timer
        if (far) this.spawn.setXYZW(i, focus.x, focus.y, focus.z, -1000);
        dirty = true;
        continue;
      }
      const x = this.spot.x;
      const z = this.spot.y;
      const ground = this.hf.heightAt(x, z);
      const y = ground + rnd(2.6, 4.6);
      const speed = rnd(0.35, 0.6);
      const landing = (y - ground) / speed;
      this.spawn.setXYZW(i, x, y, z, time);
      this.leaf.setXYZW(i, Math.random() * 100, speed, landing, rnd(0.3, 0.42));
      const palette = this.hf.maskAt(x, z, 1) > 0.5 ? ENCHANTED_LEAVES : MEADOW_LEAVES;
      const c = palette[Math.floor(Math.random() * palette.length)];
      this.color.setXYZ(i, c.r, c.g, c.b);
      this.deadAt[i] = time + landing + LINGER;
      dirty = true;
    }
    if (dirty) {
      this.spawn.needsUpdate = true;
      this.leaf.needsUpdate = true;
      this.color.needsUpdate = true;
    }
  }
}
