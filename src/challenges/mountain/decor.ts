/**
 * Mountain scenery: instanced pines (snowy higher up), round trees, bushes,
 * rocks, flowers and grass tufts on the foothills and around the path, kept
 * out of the camera's line of sight; drifting clouds around the peak, gulls
 * circling the cliffs, the island's smoking volcano far to the west, and
 * falling snow that thickens above the snow line.
 */

import * as THREE from "three";
import { mulberry32, smoothstep } from "../../core/noise";
import { part, merge } from "../../core/geo";
import * as flora from "../../world/models/flora";
import { Clouds } from "../../world/Sky";
import { CritterMesh } from "../../world/ambient/CritterMesh";
import { gullModel } from "../../world/ambient/critterModels";
import { GULL_ANIM } from "../../world/ambient/critterAnims";
import { SmokeSystem, VOLCANO_SPARKS } from "../../world/ambient/Smoke";
import { glowTexture } from "../../world/ambient/textures";
import { WorldUniforms } from "../../world/Terrain";
import { Course, DEPTH } from "./course";

/** Where the island's volcano stands, seen from the mountain (far west-south-west). */
export const VOLCANO_AT = new THREE.Vector3(-290, 0, 85);
const GULLS = 9;

interface Gull {
  radius: number;
  y: number;
  omega: number;
  phase: number;
}

function flower(color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const parts = [part(new THREE.CylinderGeometry(0.02, 0.025, 0.32, 4), "#3f8f2e", { pos: [0, 0.16, 0] })];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(new THREE.SphereGeometry(0.075, 6, 4), color, { pos: [Math.cos(a) * 0.08, 0.34, Math.sin(a) * 0.08], scale: [1, 0.45, 1] }));
  }
  parts.push(part(new THREE.SphereGeometry(0.05, 6, 4), "#ffd23f", { pos: [0, 0.36, 0] }));
  return merge(parts);
}

function tuft(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(new THREE.ConeGeometry(0.06, 0.45, 3), "#5fae3a", { pos: [Math.cos(a) * 0.08, 0.2, Math.sin(a) * 0.08], rot: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] }));
  }
  return merge(parts);
}

const SNOW_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
attribute vec4 aSeed;
varying float vAlpha;
varying vec2 vUv;
const vec3 BOX = vec3(36.0, 26.0, 36.0);
void main() {
  vec3 p = aSeed.xyz * BOX;
  p += vec3(uTime * 2.2, -uTime * (1.6 + aSeed.w), uTime * 0.9);
  p.x += sin(uTime * 1.3 + aSeed.w * 20.0) * 0.6;
  // Reason: wrap the flakes into a box that travels with the camera
  p = mod(p - uCenter + BOX * 0.5, BOX) + uCenter - BOX * 0.5;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * (0.09 + aSeed.w * 0.07);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vAlpha = smoothstep(26.0, 6.0, -mv.z);
}
`;

const SNOW_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uAmount;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float a = texture2D(uTex, vUv).a;
  gl_FragColor = vec4(1.0, 1.0, 1.0, a * vAlpha * uAmount);
}
`;

export class Decor {
  readonly group = new THREE.Group();
  readonly snowMaterial: THREE.ShaderMaterial;
  private clouds: Clouds;
  private gullMesh: CritterMesh;
  private gulls: Gull[] = [];
  private smoke: SmokeSystem;
  private owned: { dispose(): void }[] = [];

  constructor(
    private course: Course,
    height: (x: number, z: number) => number,
    world: WorldUniforms,
  ) {
    this.scatter(height);
    this.clouds = new Clouds(12, 31);
    const rand = mulberry32(5);
    this.clouds.group.children.forEach((c, i) => {
      // Reason: a ring of clouds around the peak, below the summit, so the climb rises above them
      const a = (i / 12) * Math.PI * 2 + rand() * 0.4;
      const r = 70 + rand() * 110;
      c.position.set(Math.cos(a) * r, 30 + rand() * 22, Math.sin(a) * r);
      c.scale.setScalar(0.45 + rand() * 0.5);
    });
    this.group.add(this.clouds.group);
    this.owned.push((this.clouds.group.children[0] as THREE.Mesh).material as THREE.Material);

    this.gullMesh = new CritterMesh({ name: "mountain-gulls", geometry: gullModel(), count: GULLS, animate: GULL_ANIM, doubleSided: true, selfLit: 0.35 });
    this.owned.push(this.gullMesh.mesh.material as THREE.Material);
    this.group.add(this.gullMesh.mesh);
    for (let i = 0; i < GULLS; i++) {
      this.gulls.push({ radius: 24 + rand() * 22, y: 16 + rand() * 24, omega: (rand() < 0.5 ? -1 : 1) * (0.12 + rand() * 0.06), phase: rand() * Math.PI * 2 });
    }

    this.smoke = new SmokeSystem(world);
    this.group.add(this.smoke.group);
    this.volcano(world);

    // Falling snow (point sprites in a camera-following box)
    const n = 900;
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) seeds[i] = rand();
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute("position", base.attributes.position);
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = n;
    this.snowMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: world.uTime, uCenter: { value: new THREE.Vector3() }, uTex: { value: glowTexture() }, uAmount: { value: 0 } },
      vertexShader: SNOW_VERT,
      fragmentShader: SNOW_FRAG,
      transparent: true,
      depthWrite: false,
    });
    geo.setAttribute("uv", base.attributes.uv);
    const snow = new THREE.Mesh(geo, this.snowMaterial);
    snow.frustumCulled = false;
    snow.renderOrder = 6;
    this.group.add(snow);
    this.owned.push(this.snowMaterial, geo, base);
  }

  /** Scatter vegetation and rocks, avoiding the path and the strip between path and camera. */
  private scatter(height: (x: number, z: number) => number): void {
    const rand = mulberry32(88);
    const c = this.course;
    // Path samples and their camera positions, for keep-out tests
    const samples: { p: THREE.Vector2; cam: THREE.Vector2; lens: THREE.Vector2; y: number }[] = [];
    for (let s = -4; s <= c.length + 2; s += 0.6) {
      const y = c.nominalY(s);
      const r = c.radius(y);
      const p = c.point(s, r, y);
      const q = c.point(s, r + 12, y);
      const l = c.point(s, r + 10, y);
      samples.push({ p: new THREE.Vector2(p.x, p.z), cam: new THREE.Vector2(q.x, q.z), lens: new THREE.Vector2(l.x, l.z), y });
    }
    const seg = new THREE.Vector2();
    const blocked = (x: number, z: number, y: number, pad: number): boolean => {
      const v = new THREE.Vector2(x, z);
      for (const sm of samples) {
        if (Math.abs(sm.y - y) > 9) continue;
        // Distance to the segment path → camera
        seg.copy(sm.cam).sub(sm.p);
        const t = THREE.MathUtils.clamp(v.clone().sub(sm.p).dot(seg) / seg.lengthSq(), 0, 1);
        if (v.distanceTo(sm.p.clone().addScaledVector(seg, t)) < pad + (t < 0.15 ? DEPTH / 2 : 0)) return true;
      }
      return false;
    };

    const kinds = {
      pine: [0, 1, 2].map((s) => flora.pineTree(s)),
      snowPine: [0, 1].map((s) => flora.pineTree(s + 5, true)),
      tree: [0, 1, 2].map((s) => flora.roundTree(s)),
      bush: [flora.bush(1), flora.bush(7, "#e0263a")],
      rock: [0, 1, 2].map((s) => flora.rock(s)),
      bare: [4, 5].map((s) => flora.rock(s, false)),
    };
    const lists = new Map<flora.FloraModel, THREE.Matrix4[]>();
    const put = (model: flora.FloraModel, x: number, y: number, z: number, s: number) => {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y - 0.1 * s, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2),
        new THREE.Vector3(s, s * (0.9 + rand() * 0.25), s),
      );
      if (!lists.has(model)) lists.set(model, []);
      lists.get(model)!.push(m);
    };
    const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];

    for (let i = 0; i < 2600; i++) {
      const a = rand() * Math.PI * 2;
      const r = 10 + Math.sqrt(rand()) * 100;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = height(x, z);
      if (y < 1.2) continue;
      const steep = Math.abs(height(x + 1, z) - y) + Math.abs(height(x, z + 1) - y);
      const roll = rand();
      let model: flora.FloraModel | null = null;
      let scale = 1;
      if (y > 30) {
        if (steep < 1.4 && roll < 0.1) [model, scale] = [pick(kinds.bare), 0.7 + rand() * 0.9];
      } else if (y > 9) {
        if (steep < 1.3 && roll < 0.3) [model, scale] = [pick(y > 17 ? kinds.snowPine : kinds.pine), 0.8 + rand() * 0.5];
        else if (steep < 1.6 && roll < 0.22) [model, scale] = [pick(kinds.bare), 0.8 + rand() * 1.2];
      } else if (r < 85) {
        if (steep > 1.3) continue;
        if (roll < 0.34) [model, scale] = [pick(kinds.pine), 0.9 + rand() * 0.7];
        else if (roll < 0.42) [model, scale] = [pick(kinds.tree), 0.8 + rand() * 0.5];
        else if (roll < 0.5) [model, scale] = [pick(kinds.bush), 0.8 + rand() * 0.6];
        else if (roll < 0.56) [model, scale] = [pick(kinds.rock), 0.5 + rand() * 1.1];
      }
      if (!model) continue;
      if (blocked(x, z, y, 2.2 + scale)) continue;
      // Reason: sink rocks into slopes so their downhill side never floats
      put(model, x, y - (kinds.bare.includes(model) || kinds.rock.includes(model) ? steep * 0.5 * scale : 0), z, scale);
    }
    // Flowers and grass tufts on the foothills near the start and on grassy ledges
    const flowers = ["#ff5d8f", "#ffd23f", "#ffffff", "#7f6bff", "#ff8c3a"].map(flower);
    const tufts = tuft();
    const small = new Map<THREE.BufferGeometry, THREE.Matrix4[]>();
    const putSmall = (g: THREE.BufferGeometry, x: number, y: number, z: number, s: number) => {
      if (!small.has(g)) small.set(g, []);
      small.get(g)!.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.3), new THREE.Vector3(s, s, s)));
    };
    for (let i = 0; i < 1400; i++) {
      const a = rand() * Math.PI * 2;
      const r = 22 + rand() * 50;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = height(x, z);
      if (y < 1.5 || y > 14 || blocked(x, z, y, 0.6)) continue;
      if (Math.abs(height(x + 0.5, z) - y) + Math.abs(height(x, z + 0.5) - y) > 0.5) continue;
      putSmall(rand() < 0.45 ? pick(flowers) : tufts, x, y, z, 0.8 + rand() * 0.7);
    }
    // Reason: the camera looks across this meadow at the start of the climb — dress it, but keep
    // the path and the few metres right in front of the lens clear
    const clear = (x: number, z: number, y: number): boolean =>
      samples.some((sm) => Math.abs(sm.y - y) < 9 && (Math.hypot(x - sm.p.x, z - sm.p.y) < DEPTH / 2 + 0.5 || Math.hypot(x - sm.lens.x, z - sm.lens.y) < 3.5));
    for (let i = 0; i < 360; i++) {
      const s = -4 + rand() * 34;
      const y0 = c.nominalY(s);
      const q = c.point(s, c.radius(y0) + DEPTH / 2 + 0.4 + rand() * 9, y0);
      const y = height(q.x, q.z);
      if (y < 1.5 || clear(q.x, q.z, y)) continue;
      putSmall(rand() < 0.5 ? pick(flowers) : tufts, q.x, y, q.z, 0.8 + rand() * 0.6);
    }
    for (const p of c.pieces) {
      if (p.y0 > 18 || p.kind === "boards" || p.kind === "bridge") continue;
      for (let s = p.s0 + 0.3; s < p.s1 - 0.3; s += 0.35) {
        if (rand() > 0.55) continue;
        const y = c.top(p, s);
        const q = c.point(s, c.radius(y) - DEPTH / 2 + 0.15 + rand() * 0.5, y);
        putSmall(rand() < 0.5 ? pick(flowers) : tufts, q.x, q.y, q.z, 0.7 + rand() * 0.5);
      }
    }

    const tint = new THREE.Color();
    const add = (geo: THREE.BufferGeometry, list: THREE.Matrix4[], shadows: boolean) => {
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
      this.owned.push(material);
      const mesh = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((m, i) => {
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, tint.setScalar(0.85 + rand() * 0.25));
      });
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    };
    for (const [model, list] of lists) add(model.geometry, list, true);
    for (const [g, list] of small) add(g, list, false);
    // Unused models still own geometry
    for (const ms of Object.values(kinds)) for (const m of ms) if (!lists.has(m)) this.owned.push(m.geometry);
    for (const g of [...flowers, tufts]) if (!small.has(g)) this.owned.push(g);
  }

  /** The island's volcano on the far horizon, smoking and glowing. */
  private volcano(world: WorldUniforms): void {
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const r = 72 - t * 60 + Math.sin(t * 9) * 1.5;
      profile.push(new THREE.Vector2(r, -4 + Math.pow(t, 1.35) * 50));
    }
    profile.push(new THREE.Vector2(8, 44), new THREE.Vector2(3, 39));
    const g = new THREE.LatheGeometry(profile, 40);
    // Reason: wash the colours towards the sky so the far island sits back in the haze
    const haze = new THREE.Color("#a9c4dd");
    const geo = part(g, (p) => {
      const t = smoothstep(-2, 44, p.y);
      return new THREE.Color("#e6d09a")
        .lerp(new THREE.Color("#4f9a45"), smoothstep(0.02, 0.07, t))
        .lerp(new THREE.Color("#6b5450"), smoothstep(0.22, 0.4, t))
        .lerp(new THREE.Color("#3a2f33"), smoothstep(0.65, 1, t))
        .lerp(haze, 0.4);
    });
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.owned.push(material);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(VOLCANO_AT);
    this.group.add(mesh);
    const vent = VOLCANO_AT.clone().add(new THREE.Vector3(0, 42, 0));
    this.smoke.add([vent], "volcano");
    this.group.add(this.smoke.sparks([vent.clone().setY(vent.y + 2)], VOLCANO_SPARKS));
    const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color("#ff5a14"), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.owned.push(glowMat);
    const glow = new THREE.Sprite(glowMat);
    glow.position.copy(vent).setY(vent.y + 2);
    glow.scale.setScalar(20);
    this.group.add(glow);
    void world;
  }

  update(dt: number, time: number, camera: THREE.Camera, snowAmount: number): void {
    this.clouds.update(dt);
    this.snowMaterial.uniforms.uCenter.value.copy(camera.position);
    this.snowMaterial.uniforms.uAmount.value = snowAmount;
    this.gulls.forEach((g, i) => {
      const th = g.phase + g.omega * time;
      const x = Math.cos(th) * g.radius;
      const z = Math.sin(th) * g.radius;
      const y = g.y + Math.sin(time * 0.5 + i) * 1.5;
      const dir = Math.sign(g.omega);
      const yaw = Math.atan2(-Math.sin(th) * dir, Math.cos(th) * dir);
      const wing = 0.1 + 0.5 * Math.max(0, Math.sin(time * 0.6 + i * 2)) * Math.sin(time * 7 + i);
      this.gullMesh.set(i, x, y, z, yaw, 0.05, dir * 0.35, wing, 0.8);
    });
    this.gullMesh.commit();
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
  }
}
