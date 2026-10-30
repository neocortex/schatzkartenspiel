/**
 * The hidden sword chamber: the magic sword rests in a great crystal on a mound of
 * natural rock, under a shaft of daylight falling through a crack in the ceiling
 * (soft volumetric cone + dust specks + a shadow-casting spot light). The crystal
 * and the pool of light on the floor flare up when the sword is pulled out.
 */

import * as THREE from "three";
import { gradient, merge, part } from "../../core/geo";
import { createSword } from "../../world/models/items";
import { Bursts } from "../shared/bursts";
import { GlowField, crystalMaterial, instances, rockMaterial } from "./materials";
import { boulder, crystalBase } from "./models";

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
  // Reason: a high power fades the sides long before the silhouette, so the shaft has soft edges instead of looking like a tube
  float rim = pow(abs(dot(normalize(vNormalV), normalize(vViewDir))), 3.5);
  float fadeY = smoothstep(0.0, 0.12, vH) * (1.0 - smoothstep(0.3, 1.0, vH));
  float streak = 0.75 + 0.25 * sin(vH * 22.0 - uTime * 1.5 + sin(uTime * 0.7) * 2.0);
  vec3 col = vec3(1.0, 0.9, 0.66) * rim * fadeY * streak * uPower * 0.13;
  gl_FragColor = vec4(col, 1.0);
}`;

const POOL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uPower;
uniform float uFlare;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  // Reason: slow, broken rays make it read as light filtered through crystal, not a painted disc
  float rays = 0.72 + 0.28 * sin(a * 9.0 + uTime * 0.4) * sin(a * 5.0 - uTime * 0.27);
  float pool = smoothstep(1.0, 0.2, r);
  vec3 col = mix(vec3(1.0, 0.86, 0.6), vec3(0.55, 0.85, 1.0), smoothstep(0.2, 0.7, r));
  gl_FragColor = vec4(col * pool * pool * rays * (0.05 + uPower * 0.1 + uFlare * 0.8), 1.0);
}`;

const POOL_VERT = "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";

const SPIRE_GLOW = 0.62;
// Reason: deep blue up to pale ice; paler than this burns to plain white in the shaft of light
const ICE: [string, string] = ["#0a35a6", "#86d4ff"];

/** Spires of the great crystal: x, z, height, radius, how far it leans outwards. Tallest behind, so the sword stands out against them. */
const SPIRES: [number, number, number, number, number][] = [
  [0.02, -0.82, 3.7, 0.48, 0.05],
  [-0.78, -0.6, 3.05, 0.38, 0.2],
  [0.82, -0.56, 3.3, 0.4, 0.2],
  [-1.3, -0.24, 2.15, 0.31, 0.38],
  [1.34, -0.2, 2.35, 0.32, 0.42],
  [-0.38, -1.12, 2.5, 0.3, 0.24],
  [0.48, -1.16, 2.15, 0.27, 0.24],
  [-1.2, 0.56, 1.05, 0.22, 0.58],
  [1.16, 0.6, 1.25, 0.23, 0.6],
  [-0.62, 1.02, 0.62, 0.15, 0.7],
  [0.66, 1.05, 0.52, 0.15, 0.7],
];

function crystalSpires(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, z, h, r, lean] of SPIRES) {
    const a = Math.atan2(z, x);
    const xf = {
      pos: [x, 0.1, z] as [number, number, number],
      rot: [Math.sin(a) * lean, x * 2.1, -Math.cos(a) * lean] as [number, number, number],
    };
    const prism = new THREE.CylinderGeometry(r, r * 1.1, h, 6, 1).translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(r, r * 2.4, 6, 1).translate(0, h + r * 1.2, 0);
    const top = h + r * 2.4;
    parts.push(part(prism, gradient(ICE[0], ICE[1], 0, top), xf), part(tip, gradient(ICE[0], ICE[1], 0, top * 0.8), xf));
  }
  return merge(parts);
}

export class Chamber {
  readonly group = new THREE.Group();
  readonly sword: THREE.Group;
  readonly spot: THREE.SpotLight;
  /** World position of the sword grip. */
  readonly swordAt: THREE.Vector3;
  readonly materials: THREE.Material[] = [];
  private beamUniforms = { uTime: { value: 0 }, uPower: { value: 1 } };
  private poolUniforms = { uTime: { value: 0 }, uPower: { value: 0.35 }, uFlare: { value: 0 } };
  private swordBase: THREE.Vector3;
  private dust: THREE.Points;
  private dustBase: Float32Array;
  private spires: THREE.MeshStandardMaterial;
  private core: THREE.MeshStandardMaterial;
  private flareNow = 0;
  private flareWant = 0;
  private reveal = 0;
  /** How far the sword has flown to Tadeo (0..1); negative while it still rests in the crystal. */
  private swordLift = -1;

  constructor(
    readonly center: THREE.Vector3,
    time: { value: number },
    glow: GlowField,
  ) {
    this.beamUniforms.uTime = time;
    this.poolUniforms.uTime = time;
    this.group.position.copy(center);

    // A mound of natural rock the crystal grew out of
    const rock = rockMaterial({ xray: true });
    this.materials.push(rock);
    const at = (x: number, y: number, z: number, s: number, yaw: number) =>
      new THREE.Matrix4().compose(
        new THREE.Vector3(center.x + x, center.y + y, center.z + z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
        new THREE.Vector3(s, s * 0.7, s),
      );
    const mound = crystalBase(5);
    const moundMesh = instances(mound, rock, [at(0, 0.02, 0, 3.8, 0.4)], glow, false);
    mound.dispose();
    const stones = boulder(4);
    const stonesMesh = instances(stones, rock, [at(-1.75, -0.04, 0.5, 0.72, 1), at(1.8, -0.04, 0.2, 0.84, 2.4), at(-0.9, -0.08, 1.45, 0.5, 4), at(1.15, -0.08, 1.3, 0.46, 5.3), at(0.1, -0.06, -1.65, 0.9, 3)], glow, false);
    stones.dispose();
    // Reason: baked glow is read from the matrices, so they hold world positions; undo the group's own offset here
    moundMesh.position.copy(center).negate();
    stonesMesh.position.copy(center).negate();
    this.group.add(moundMesh, stonesMesh);

    // The spires, glowing from inside
    this.spires = crystalMaterial(SPIRE_GLOW, time);
    this.materials.push(this.spires);
    const spires = new THREE.Mesh(crystalSpires(), this.spires);
    spires.castShadow = false;
    this.group.add(spires);

    // The sword, blade down in the stone
    this.sword = createSword();
    this.sword.rotation.set(Math.PI, 0, 0.08);
    this.swordBase = new THREE.Vector3(0, 1.75, 0);
    this.sword.position.copy(this.swordBase);
    this.group.add(this.sword);
    this.swordAt = center.clone().add(this.swordBase);

    // Reason: the clear heart of the crystal is drawn over the opaque sword, so the blade shows through it and the hilt stands free
    this.core = new THREE.MeshStandardMaterial({
      color: "#9fdcff",
      emissive: "#2f8cff",
      emissiveIntensity: 0.2,
      roughness: 0.08,
      transparent: true,
      opacity: 0.26,
      flatShading: true,
      depthWrite: false,
    });
    this.materials.push(this.core);
    const coreGeo = merge([
      part(new THREE.CylinderGeometry(0.52, 0.68, 1.22, 6, 1), "#ffffff", { pos: [0, 0.7, 0] }),
      part(new THREE.ConeGeometry(0.52, 0.28, 6, 1), "#ffffff", { pos: [0, 1.45, 0] }),
    ]);
    const core = new THREE.Mesh(coreGeo, this.core);
    core.renderOrder = 3;
    this.group.add(core);

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

    // The pool of light on the floor around the crystal
    const poolMat = new THREE.ShaderMaterial({
      uniforms: this.poolUniforms,
      vertexShader: POOL_VERT,
      fragmentShader: POOL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 7.4).rotateX(-Math.PI / 2), poolMat);
    pool.position.y = 0.06;
    pool.renderOrder = 2;
    this.group.add(pool);

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

    this.materials.push(beamMat, poolMat, dustMat);
  }

  /** How far the chamber has been revealed (0..1). */
  get revealed(): number {
    return this.reveal;
  }

  /** Light intensity once the chamber is revealed (0..1). */
  setReveal(k: number): void {
    this.reveal = k;
    this.spot.intensity = 40 * k;
    this.beamUniforms.uPower.value = 0.35 + 0.65 * k;
    this.poolUniforms.uPower.value = 0.35 + 0.65 * k;
  }

  /** Make the crystal and the pool of light flare (sword pulled). */
  flare(k: number): void {
    this.flareWant = k;
  }

  /** The sword comes free (the caller re-parents it to the scene first). */
  pull(): void {
    this.swordLift = 0;
    this.flare(1);
  }

  /** Once it is free the sword flies over Tadeo's head and stays there, turning and sparkling. */
  carrySword(dt: number, time: number, player: THREE.Vector3, sparks: Bursts): void {
    if (this.swordLift < 0) return;
    this.swordLift = Math.min(1, this.swordLift + dt * 1.6);
    const above = new THREE.Vector3(player.x, player.y + 2.05 + Math.sin(time * 3) * 0.04, player.z + 0.05);
    const k = 1 - (1 - this.swordLift) ** 3;
    this.sword.position.lerpVectors(this.swordAt, above, k);
    this.sword.rotation.set(0, time * 0.8 * k, Math.PI * (1 - k));
    if (Math.random() < dt * 14) {
      sparks.emit(this.sword.position.clone().add(new THREE.Vector3(0, 0.7, 0)), {
        count: 1,
        color: new THREE.Color(1.4, 2.6, 3.4),
        speed: [0.3, 0.9],
        life: [0.5, 0.9],
        size: [0.06, 0.12],
        spread: 0.8,
      });
    }
  }

  update(dt: number, time: number): void {
    if (this.swordLift < 0) {
      // Reason: the stuck sword hums — a tiny vibration hints that it's special
      this.sword.position.set(this.swordBase.x, this.swordBase.y + Math.sin(time * 2) * 0.015, this.swordBase.z);
    }
    // Reason: the flare leaps up at once and settles slowly, like a chime dying away
    this.flareNow = Math.max(this.flareWant, this.flareNow - dt * 0.5);
    this.flareWant = 0;
    this.poolUniforms.uFlare.value = this.flareNow;
    this.spires.emissiveIntensity = SPIRE_GLOW + Math.sin(time * 1.3) * 0.06 + this.flareNow * 1.6;
    this.core.emissiveIntensity = 0.2 + this.flareNow * 1.2;

    const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const b = i * 3;
      const y = (this.dustBase[b + 1] + time * 0.12) % 5.3;
      pos.setXYZ(i, this.dustBase[b] + Math.sin(time * 0.5 + i) * 0.15, 0.3 + y, this.dustBase[b + 2] + Math.cos(time * 0.4 + i) * 0.15);
    }
    pos.needsUpdate = true;
  }
}
