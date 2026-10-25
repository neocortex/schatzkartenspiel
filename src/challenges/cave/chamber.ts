/**
 * The hidden sword chamber: a stepped stone altar with the magic sword stuck
 * in it, a shaft of daylight falling through a crack in the ceiling (soft
 * volumetric cone + dust specks + a shadow-casting spot light), two carved
 * pillars and a rune circle on the floor that flares up when the sword is
 * pulled out.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mat, toonMesh } from "../../characters/parts";
import { createSword } from "../../world/models/items";

const BEAM_VERT = /* glsl */ `
varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vH;
void main() {
  vH = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const BEAM_FRAG = /* glsl */ `
uniform float uTime;
uniform float uPower;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vH;
void main() {
  // Reason: fade the sides (grazing angles) so the cone reads as a soft volume, not a tube
  float rim = pow(abs(dot(normalize(vNormalV), normalize(vViewDir))), 1.6);
  float fadeY = smoothstep(0.0, 0.06, vH) * (1.0 - smoothstep(0.3, 1.0, vH));
  float streak = 0.75 + 0.25 * sin(vH * 22.0 - uTime * 1.5 + sin(uTime * 0.7) * 2.0);
  vec3 col = vec3(1.0, 0.86, 0.55) * rim * fadeY * streak * uPower * 0.55;
  gl_FragColor = vec4(col, 1.0);
}`;

const RUNE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlare;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float ring = smoothstep(0.03, 0.0, abs(r - 0.86)) + smoothstep(0.02, 0.0, abs(r - 0.7));
  float ticks = step(0.7, r) * step(r, 0.86) * smoothstep(0.35, 0.0, abs(fract(a * 12.0 / 6.2831 + uTime * 0.05) - 0.5) - 0.25);
  float glow = ring + ticks * 0.8;
  vec3 col = vec3(1.0, 0.8, 0.4) * glow * (0.5 + uFlare * 3.0 + 0.2 * sin(uTime * 2.0));
  gl_FragColor = vec4(col, 1.0);
}`;

export class Chamber {
  readonly group = new THREE.Group();
  readonly sword: THREE.Group;
  readonly spot: THREE.SpotLight;
  /** World position of the sword grip. */
  readonly swordAt: THREE.Vector3;
  readonly materials: THREE.Material[] = [];
  private beamUniforms = { uTime: { value: 0 }, uPower: { value: 1 } };
  private runeUniforms = { uTime: { value: 0 }, uFlare: { value: 0 } };
  private swordBase: THREE.Vector3;
  private dust: THREE.Points;
  private dustBase: Float32Array;

  constructor(readonly center: THREE.Vector3, time: { value: number }) {
    this.beamUniforms.uTime = time;
    this.runeUniforms.uTime = time;
    this.group.position.copy(center);

    // Stepped altar with a carved top
    const stone = mat("#9a90b8", 0.85);
    const dark = mat("#6c6388", 0.85);
    const steps: [number, number, number, number][] = [
      [2.6, 0.3, 2.2, 0.15],
      [2.0, 0.35, 1.6, 0.47],
      [1.4, 0.45, 1.05, 0.86],
    ];
    steps.forEach(([w, h, d, y], i) => {
      const block = toonMesh(new RoundedBoxGeometry(w, h, d, 3, 0.08), i === 1 ? dark : stone);
      block.position.y = y;
      this.group.add(block);
    });
    const runeMat = mat("#7fd4ff", 0.3, 1.6);
    for (const sx of [-1, 1]) {
      const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), runeMat);
      rune.scale.set(1, 1.6, 0.3);
      rune.position.set(sx * 0.45, 0.47, 0.81);
      this.group.add(rune);
    }

    // The sword, blade down in the stone
    this.sword = createSword();
    this.sword.rotation.set(Math.PI, 0, 0.08);
    this.swordBase = new THREE.Vector3(0, 1.75, 0);
    this.sword.position.copy(this.swordBase);
    this.group.add(this.sword);
    this.swordAt = center.clone().add(this.swordBase);

    // Pillars either side
    for (const sx of [-1, 1]) {
      const pillar = toonMesh(new THREE.CylinderGeometry(0.42, 0.5, 3.6, 10), stone);
      pillar.position.set(sx * 3.1, 1.8, -0.9);
      const capital = toonMesh(new RoundedBoxGeometry(1.2, 0.35, 1.2, 2, 0.08), dark);
      capital.position.set(sx * 3.1, 3.7, -0.9);
      const plinth = toonMesh(new RoundedBoxGeometry(1.25, 0.3, 1.25, 2, 0.08), dark);
      plinth.position.set(sx * 3.1, 0.15, -0.9);
      this.group.add(pillar, capital, plinth);
    }

    // Shaft of light from a crack high above
    const beamGeo = new THREE.CylinderGeometry(1.1, 1.8, 9, 32, 1, true);
    beamGeo.translate(0, 4.5, 0);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: this.beamUniforms,
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.renderOrder = 4;
    this.group.add(beam);

    // Rune circle on the floor around the altar
    const runeCircleMat = new THREE.ShaderMaterial({
      uniforms: this.runeUniforms,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: RUNE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const circle = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6).rotateX(-Math.PI / 2), runeCircleMat);
    circle.position.y = 0.06;
    circle.renderOrder = 2;
    this.group.add(circle);

    // Dust specks dancing in the light
    const n = 70;
    this.dustBase = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 1.4;
      this.dustBase.set([Math.cos(a) * r, 0.3 + Math.random() * 5, Math.sin(a) * r], i * 3);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(this.dustBase.slice(), 3));
    const dustMat = new THREE.PointsMaterial({ color: new THREE.Color(2.2, 1.9, 1.3), size: 0.06, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dust = new THREE.Points(dustGeo, dustMat);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);

    this.spot = new THREE.SpotLight("#ffe2a8", 0, 16, 0.42, 0.7, 1.2);
    this.spot.position.set(center.x + 0.6, center.y + 11, center.z + 0.4);
    this.spot.target.position.copy(center);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.bias = -0.0015;

    this.materials.push(beamMat, runeCircleMat, dustMat);
  }

  /** Light intensity once the chamber is revealed (0..1). */
  setReveal(k: number): void {
    this.spot.intensity = 260 * k;
    this.beamUniforms.uPower.value = 0.35 + 0.65 * k;
  }

  /** Make the rune circle flare (sword pulled). */
  flare(k: number): void {
    this.runeUniforms.uFlare.value = k;
  }

  update(time: number, swordFree: boolean): void {
    if (!swordFree) {
      // Reason: the stuck sword hums — a tiny vibration hints that it's special
      this.sword.position.set(this.swordBase.x, this.swordBase.y + Math.sin(time * 2) * 0.015, this.swordBase.z);
    }
    const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const b = i * 3;
      const y = (this.dustBase[b + 1] + time * 0.12) % 5.3;
      pos.setXYZ(i, this.dustBase[b] + Math.sin(time * 0.5 + i) * 0.15, 0.3 + y, this.dustBase[b + 2] + Math.cos(time * 0.4 + i) * 0.15);
    }
    pos.needsUpdate = true;
  }
}
