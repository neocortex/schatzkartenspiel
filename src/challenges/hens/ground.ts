/**
 * The farmyard ground: a flat yard with soft grass colours, worn earth (the
 * coop apron, the path from the gate, around the trough), wet rims round the
 * puddles and straw strewn near the hay — rolling meadow hills outside the
 * fence. Puddles are sky-tinted water that ripples when someone splashes in.
 */

import * as THREE from "three";
import { Noise2D, smoothstep } from "../../core/noise";
import { Disposable } from "./dispose";
import { COOP, GATE, HAY, PUDDLES, TROUGH, YARD } from "./layout";

const GRASS_DARK = new THREE.Color("#4f8f33");
const GRASS_LIGHT = new THREE.Color("#8cc955");
const GRASS_SUN = new THREE.Color("#b5d860");
const DIRT = new THREE.Color("#c8996a");
const DIRT_DARK = new THREE.Color("#a97a4e");
const WET = new THREE.Color("#7a5638");
const STRAW = new THREE.Color("#d9bd62");
const FAR = new THREE.Color("#3f7a3a");

const RIPPLES = 4;

const PUDDLE_VERT = /* glsl */ `
varying vec3 vWorld;
varying float vR;
attribute float aR;
void main() {
  vR = aR;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const PUDDLE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec4 uRipple[${RIPPLES}];
varying vec3 vWorld;
varying float vR;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float grazing = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.0);
  // Reason: colours here are linear (the renderer encodes to sRGB), so they look darker than they read
  vec3 col = mix(vec3(0.04, 0.14, 0.3), vec3(0.24, 0.46, 0.68), grazing * 0.9 + 0.15);
  // Drifting cloud reflections
  vec2 q = vWorld.xz * 0.35 + vec2(uTime * 0.04, uTime * 0.015);
  float cloud = smoothstep(0.45, 0.95, sin(q.x * 2.1 + sin(q.y * 1.7)) * 0.5 + sin(q.y * 2.6 + q.x) * 0.5);
  col = mix(col, vec3(0.7, 0.8, 0.9), cloud * 0.3);
  // Expanding rings from splashes
  float ring = 0.0;
  for (int i = 0; i < ${RIPPLES}; i++) {
    float age = uTime - uRipple[i].z;
    if (age < 0.0 || age > 2.5) continue;
    float d = length(vWorld.xz - uRipple[i].xy);
    float front = age * 1.6;
    ring += sin((d - front) * 26.0) * smoothstep(0.35, 0.0, abs(d - front)) * exp(-age * 1.6) * uRipple[i].w;
  }
  col += ring * 0.22;
  // Sun glint
  col += vec3(1.0, 0.95, 0.8) * pow(max(sin(vWorld.x * 3.0 + uTime * 0.7) * sin(vWorld.z * 2.4 - uTime * 0.5), 0.0), 18.0) * 0.6;
  // Muddy brown shallows towards the rim
  float edge = smoothstep(1.0, 0.8, vR);
  col = mix(vec3(0.16, 0.09, 0.04), col, smoothstep(0.95, 0.55, vR));
  gl_FragColor = vec4(col, 0.82 * edge);
}`;

export class Ground {
  readonly group = new THREE.Group();
  readonly time = { value: 0 };
  private ripples = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));
  private nextRipple = 0;
  private noise = new Noise2D(31);

  constructor(owned: Disposable[]) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    owned.push(mat);
    const mesh = new THREE.Mesh(this.geometry(), mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.group.add(this.puddles());
  }

  /** Ground height: flat yard, meadow hills beyond (kept low in front of the camera). */
  height(x: number, z: number): number {
    const dx = Math.max(YARD.minX - 3 - x, x - YARD.maxX - 3, 0);
    const dz = Math.max(YARD.minZ - 3 - z, z - YARD.maxZ - 3, 0);
    const d = Math.hypot(dx, dz);
    if (d === 0) return 0;
    const hills = 1.4 + this.noise.fbm(x * 0.045, z * 0.045, 3) * 2.6 + Math.max(0, -z - 16) * 0.16;
    return smoothstep(0, 20, d) * hills * smoothstep(17, 8, z);
  }

  /** How bare the earth is at (x, z): 0 = grass, 1 = worn dirt. */
  dirt(x: number, z: number): number {
    const n = this.noise.fbm(x * 0.35, z * 0.35, 2) * 0.35;
    let d = 0;
    // Apron in front of the coop, where the hens scratch all day
    const ax = (x - (COOP.x + 0.6)) / 4.6;
    const az = (z - (COOP.z + 2.7)) / 2.4;
    d = Math.max(d, 1 - smoothstep(0.75, 1.1, Math.hypot(ax, az) + n));
    // Winding path from the gate up to the coop
    if (z > COOP.z + 2 && z < YARD.maxZ + 6) {
      const px = x - (Math.sin(z * 0.32) * 1.1 - 0.4);
      d = Math.max(d, (1 - smoothstep(0.5, 1.0, Math.abs(px) + n)) * smoothstep(YARD.maxZ + 6, YARD.maxZ + 2, z));
    }
    d = Math.max(d, 1 - smoothstep(1.4, 2.1, Math.hypot(x - TROUGH[0], z - TROUGH[1]) + n));
    for (const p of PUDDLES) d = Math.max(d, 1 - smoothstep(p.r + 0.35, p.r + 1.0, Math.hypot(x - p.at[0], z - p.at[1]) + n));
    // A few small scratched patches
    d = Math.max(d, smoothstep(0.62, 0.78, this.noise.noise(x * 0.3 + 7, z * 0.3 - 3)) * 0.8 * this.insideYard(x, z));
    return THREE.MathUtils.clamp(d, 0, 1);
  }

  /** The lawn colour at (x, z) — the grass tufts take it on so they melt into the ground. */
  grassColor(x: number, z: number, out: THREE.Color): THREE.Color {
    const n = this.noise.fbm(x * 0.12, z * 0.12, 3);
    out.copy(GRASS_DARK).lerp(GRASS_LIGHT, smoothstep(-0.55, 0.55, n));
    out.lerp(GRASS_SUN, smoothstep(0.35, 0.7, this.noise.noise(x * 0.07 + 3, z * 0.07)) * 0.45);
    const far = Math.hypot(Math.max(Math.abs(x) - 16, 0), Math.max(-z - 13, z - 12, 0));
    out.lerp(FAR, smoothstep(6, 40, far) * 0.55);
    // Straw scattered around the hay piles
    for (const h of HAY) out.lerp(STRAW, (1 - smoothstep(h.r + 0.2, h.r + 1.4, Math.hypot(x - h.at[0], z - h.at[1]) + n * 0.4)) * 0.55);
    return out;
  }

  private insideYard(x: number, z: number): number {
    return x > YARD.minX && x < YARD.maxX && z > YARD.minZ && z < YARD.maxZ ? 1 : 0;
  }

  /** Start a ripple ring at (x, z) in whichever puddle contains it. */
  splash(x: number, z: number, strength = 1): void {
    this.ripples[this.nextRipple].set(x, z, this.time.value, strength);
    this.nextRipple = (this.nextRipple + 1) % RIPPLES;
  }

  /** Index of the puddle at (x, z), or -1. */
  puddleAt(x: number, z: number): number {
    return PUDDLES.findIndex((p) => Math.hypot(x - p.at[0], z - p.at[1]) < p.r * 0.9);
  }

  update(time: number): void {
    this.time.value = time;
  }

  private geometry(): THREE.BufferGeometry {
    const geo = new THREE.PlaneGeometry(150, 130, 300, 260).rotateX(-Math.PI / 2);
    geo.translate(0, 0, -10);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const g = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.height(x, z));
      this.grassColor(x, z, g);
      c.copy(DIRT).lerp(DIRT_DARK, smoothstep(-0.4, 0.6, this.noise.noise(x * 0.8, z * 0.8)));
      for (const p of PUDDLES) c.lerp(WET, 1 - smoothstep(p.r - 0.1, p.r + 0.55, Math.hypot(x - p.at[0], z - p.at[1])));
      const outsideGate = z > YARD.maxZ && x > GATE.x0 - 2 && x < GATE.x1 + 2 ? 1 : 0;
      const dirt = this.insideYard(x, z) || outsideGate ? this.dirt(x, z) : 0;
      c.lerp(g, 1 - dirt);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  private puddles(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uRipple: { value: this.ripples } },
      vertexShader: PUDDLE_VERT,
      fragmentShader: PUDDLE_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    PUDDLES.forEach((p, k) => {
      const seg = 40;
      const pos: number[] = [0, 0, 0];
      const r: number[] = [0];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        // Reason: a wobbly outline makes the puddle look poured, not stamped
        const rr = p.r * (1 + 0.12 * Math.sin(a * 3 + k * 2) + 0.07 * Math.sin(a * 5 + k));
        pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
        r.push(1);
      }
      const idx: number[] = [];
      for (let i = 1; i <= seg; i++) idx.push(0, i + 1, i);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("aR", new THREE.Float32BufferAttribute(r, 1));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, mat);
      m.position.set(p.at[0], 0.025, p.at[1]);
      m.renderOrder = 1;
      group.add(m);
    });
    return group;
  }
}
