/**
 * Ground markers for the lava bombs, draped over the terrain:
 * - WarningRing: a pulsing hazard ring whose red fill grows towards the edge
 *   as the bomb comes down, so a child can read "here, soon".
 * - Splat: the glowing lava puddle and shock ring left by an impact; it
 *   cools from white-hot to dark crust and fades away.
 */

import * as THREE from "three";
import { NOISE_GLSL } from "../../core/glsl";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
uniform float uProgress;
uniform float uTime;
uniform float uFade;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float a = atan(c.y, c.x);
  float pulse = 0.7 + 0.3 * sin(uTime * mix(7.0, 26.0, uProgress));
  // Chunky outer ring with turning hazard dashes
  float ring = smoothstep(0.78, 0.83, r) * smoothstep(1.0, 0.95, r);
  float dash = step(0.42, fract(a / 6.2831 * 12.0 + uTime * 0.5));
  vec3 ringCol = mix(vec3(1.6, 1.25, 0.25), vec3(1.9, 0.35, 0.12), uProgress);
  vec3 dashCol = vec3(0.25, 0.05, 0.03);
  vec3 col = mix(dashCol, ringCol * pulse, dash);
  float alpha = ring;
  // Red fill growing outwards; its rim is the "time left" hand
  float fill = step(r, uProgress * 0.8);
  float rim = smoothstep(0.06, 0.0, abs(r - uProgress * 0.8)) * step(0.02, uProgress);
  col = mix(col, vec3(1.3, 0.22, 0.08), fill * (1.0 - ring));
  alpha = max(alpha, fill * 0.42);
  col = mix(col, vec3(2.2, 1.2, 0.3), rim);
  alpha = max(alpha, rim * 0.9);
  // Faint full disc so the whole danger zone reads even at the start
  alpha = max(alpha, smoothstep(0.8, 0.0, r) * 0.12);
  // Centre target dot
  float dot = smoothstep(0.12, 0.08, r);
  col = mix(col, vec3(1.8, 0.9, 0.2), dot);
  alpha = max(alpha, dot * 0.9);
  gl_FragColor = vec4(col, alpha * uFade);
}
`;

const SPLAT_FRAG = /* glsl */ `
uniform float uAge;
uniform float uSeed;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float a = atan(c.y, c.x);
  // Blobby splat outline with a few drips
  float edge = 0.32 + 0.1 * vnoise(vec2(a * 2.5 + uSeed, uSeed)) + 0.12 * pow(vnoise(vec2(a * 6.0 - uSeed, 3.0)), 3.0);
  float blob = smoothstep(edge, edge - 0.04, r);
  float heat = exp(-uAge / 1.4);
  float n = vnoise(c * 18.0 + uSeed);
  vec3 crust = vec3(0.09, 0.05, 0.05);
  vec3 hot = mix(vec3(2.4, 0.4, 0.06), vec3(5.0, 2.6, 0.7), smoothstep(0.4, 0.9, n));
  vec3 col = mix(crust, hot, clamp(heat * 1.3 * (0.6 + n * 0.6), 0.0, 1.0));
  float alpha = blob * (1.0 - smoothstep(4.0, 6.0, uAge));
  // Expanding shock ring in the first half second
  float wave = uAge / 0.45;
  float shock = smoothstep(0.07, 0.0, abs(r - wave)) * (1.0 - smoothstep(0.4, 1.0, wave)) * step(uAge, 0.45);
  col = mix(col, vec3(3.0, 1.6, 0.5), shock);
  alpha = max(alpha, shock * 0.85);
  // Scorch halo
  alpha = max(alpha, smoothstep(edge + 0.25, edge, r) * 0.35 * (1.0 - smoothstep(2.0, 6.0, uAge)));
  gl_FragColor = vec4(col, alpha);
}
`;

/** A disc of radius `radius` whose vertices follow the ground; reshaped on every placement. */
class GroundDisc {
  readonly mesh: THREE.Mesh;
  private base: Float32Array;

  constructor(material: THREE.ShaderMaterial, private radius: number) {
    // Reason: a ring with a pin-hole centre and three bands bends over bumps better than a fan
    const ringed = new THREE.RingGeometry(0.001, 1, 40, 3);
    this.base = (ringed.attributes.position.array as Float32Array).slice();
    this.mesh = new THREE.Mesh(ringed, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  place(x: number, z: number, ground: (x: number, z: number) => number, lift: number): void {
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const lx = this.base[i * 3] * this.radius;
      const lz = -this.base[i * 3 + 1] * this.radius;
      pos.setXYZ(i, x + lx, ground(x + lx, z + lz) + lift, z + lz);
    }
    pos.needsUpdate = true;
    this.mesh.visible = true;
  }
}

export interface Ring {
  disc: GroundDisc;
  uniforms: { uProgress: { value: number }; uTime: { value: number }; uFade: { value: number } };
  busy: boolean;
}

export interface Splat {
  disc: GroundDisc;
  uniforms: { uAge: { value: number }; uSeed: { value: number } };
  busy: boolean;
}

export class Markers {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  private rings: Ring[] = [];
  private splats: Splat[] = [];

  constructor(private ground: (x: number, z: number) => number, ringRadius: number) {
    for (let i = 0; i < 16; i++) {
      const uniforms = { uProgress: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 } };
      const mat = this.material(uniforms, RING_FRAG);
      const disc = new GroundDisc(mat, ringRadius);
      disc.mesh.renderOrder = 3;
      this.rings.push({ disc, uniforms, busy: false });
      this.group.add(disc.mesh);
    }
    for (let i = 0; i < 14; i++) {
      const uniforms = { uAge: { value: 0 }, uSeed: { value: i * 3.7 } };
      const disc = new GroundDisc(this.material(uniforms, SPLAT_FRAG), 3.2);
      disc.mesh.renderOrder = 2;
      this.splats.push({ disc, uniforms, busy: false });
      this.group.add(disc.mesh);
    }
  }

  private material(uniforms: Record<string, THREE.IUniform>, frag: string): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.materials.push(mat);
    return mat;
  }

  ring(x: number, z: number): Ring | null {
    const r = this.rings.find((q) => !q.busy);
    if (!r) return null;
    r.busy = true;
    r.uniforms.uProgress.value = 0;
    r.uniforms.uFade.value = 1;
    r.disc.place(x, z, this.ground, 0.07);
    return r;
  }

  release(r: Ring): void {
    r.busy = false;
    r.disc.mesh.visible = false;
  }

  splat(x: number, z: number): void {
    const s = this.splats.find((q) => !q.busy) ?? this.splats.reduce((a, b) => (a.uniforms.uAge.value > b.uniforms.uAge.value ? a : b));
    s.busy = true;
    s.uniforms.uAge.value = 0;
    s.uniforms.uSeed.value = Math.random() * 50;
    s.disc.place(x, z, this.ground, 0.05);
  }

  update(dt: number, time: number): void {
    for (const r of this.rings) r.uniforms.uTime.value = time;
    for (const s of this.splats) {
      if (!s.busy) continue;
      s.uniforms.uAge.value += dt;
      if (s.uniforms.uAge.value > 6) {
        s.busy = false;
        s.disc.mesh.visible = false;
      }
    }
  }
}
