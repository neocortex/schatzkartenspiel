/**
 * The summit: a paved stone plaza on the peak with the golden-roofed shrine,
 * the floating golden hammer above its pedestal, a golden light beam that
 * marks the goal from anywhere on the climb, lantern posts and prayer-flag
 * bunting along the summit stairs and around the plaza.
 */

import * as THREE from "three";
import { mulberry32 } from "../../core/noise";
import { addModel, placeAt, cyl, rbox, stoneFn, Model, PAL } from "../../world/models/shapes";
import { shrine } from "../../world/models/monuments";
import { lanternPost, bunting } from "../../world/models/props";
import { createHammer } from "../../world/models/items";
import { glowTexture } from "../../world/ambient/textures";
import { Course, SUMMIT_Y, DEPTH } from "./course";

const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const BEAM_FRAG = /* glsl */ `
uniform float uTime;
uniform float uStrength;
varying vec2 vUv;
varying float vDepth;
void main() {
  // Soft at the edges of the cylinder, fading with height, with slow rising shimmer bands
  float edge = sin(vUv.x * 3.14159 * 6.0) * 0.5 + 0.5;
  float fade = pow(1.0 - vUv.y, 1.6);
  float bands = 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 3.0);
  // Reason: thin out close to the camera so the beam never veils the hammer in close-ups
  float near = smoothstep(5.0, 18.0, vDepth);
  float a = fade * bands * (0.35 + 0.65 * edge) * near * uStrength;
  gl_FragColor = vec4(vec3(1.6, 1.2, 0.45) * a, a);
}
`;

export class Summit {
  readonly group = new THREE.Group();
  /** Pedestal-top point where the hammer floats (world). */
  readonly hammerHome: THREE.Vector3;
  /** Where Tadeo stands to receive the hammer, and the direction he faces. */
  readonly standAt: THREE.Vector3;
  readonly faceDir: THREE.Vector3;
  readonly hammer: THREE.Group;
  readonly beamMaterial: THREE.ShaderMaterial;
  readonly glowMaterial: THREE.SpriteMaterial;
  /** True once Tadeo has taken the hammer (it stops floating at home). */
  taken = false;
  private beam: THREE.Mesh;
  private glow: THREE.Sprite;

  constructor(course: Course, model: Model) {
    const rand = mulberry32(48);
    const th = course.theta(course.end);
    const out = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    const facing = Math.atan2(out.x, out.z);
    this.faceDir = out.clone().negate();
    this.hammerHome = out.clone().multiplyScalar(2.3).setY(SUMMIT_Y + 1.75);
    this.standAt = out.clone().multiplyScalar(3.7).setY(SUMMIT_Y);

    // Paved plaza (rings of flagstone) with a low snowy parapet, open where the stairs arrive
    // Reason: the foundation flares down into the peak so the plaza never looks like it floats
    model.solid.push(cyl(7.4, 7.9, 4.6, stoneFn("#958f9c", 0, rand), { pos: [0, SUMMIT_Y - 2.3, 0] }, 28));
    model.solid.push(cyl(7.3, 7.4, 0.12, "#b8ad9b", { pos: [0, SUMMIT_Y - 0.02, 0] }, 28));
    model.solid.push(cyl(4.6, 4.6, 0.14, "#d6ccba", { pos: [0, SUMMIT_Y - 0.01, 0] }, 24));
    model.solid.push(cyl(2.4, 2.4, 0.16, "#c2b6a2", { pos: [0, SUMMIT_Y, 0] }, 20));
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const gap = Math.abs(Math.atan2(Math.sin(a - th), Math.cos(a - th)));
      if (gap < 0.5) continue;
      const h = 0.45 + rand() * 0.2;
      const at = { pos: [Math.cos(a) * 6.95, SUMMIT_Y + h / 2, Math.sin(a) * 6.95] as [number, number, number], rot: [0, -a + rand() * 0.1, 0] as [number, number, number] };
      model.solid.push(rbox(0.5, h, 1.45, stoneFn("#aaa3a8", 0, rand), at, 0.08));
      model.solid.push(rbox(0.56, 0.12, 1.5, "#f4f8ff", { pos: [at.pos[0], SUMMIT_Y + h + 0.04, at.pos[2]], rot: at.rot }, 0.05));
    }
    // Shrine at the centre, its open front towards the arriving path
    addModel(model, shrine(8), placeAt(-out.x * 1.2, SUMMIT_Y, -out.z * 1.2, facing, 1.75));
    // Pedestal for the hammer
    const ped = this.hammerHome.clone().setY(SUMMIT_Y);
    model.solid.push(rbox(0.9, 0.9, 0.9, "#e8e2d8", { pos: [ped.x, SUMMIT_Y + 0.45, ped.z], rot: [0, facing, 0] }, 0.1));
    model.solid.push(rbox(1.15, 0.2, 1.15, PAL.gold, { pos: [ped.x, SUMMIT_Y + 0.95, ped.z], rot: [0, facing, 0] }, 0.06));

    // Lantern posts on the plaza and prayer flags strung to the shrine roof
    const roof = new THREE.Vector3(-out.x * 1.2, SUMMIT_Y + 3.4, -out.z * 1.2);
    for (const da of [-1.1, 1.1, -2.2, 2.2]) {
      const a = th + da;
      const x = Math.cos(a) * 5.9;
      const z = Math.sin(a) * 5.9;
      addModel(model, lanternPost(2.6), placeAt(x, SUMMIT_Y, z, Math.atan2(-x, -z) + Math.PI / 2));
      addModel(model, bunting([x, SUMMIT_Y + 2.55, z], [roof.x, roof.y, roof.z], 0.6, Math.round(da * 7 + 9)));
    }
    this.summitStairs(course, model);

    // Floating hammer, its glow and the beam to the sky
    this.hammer = createHammer();
    this.hammer.scale.setScalar(1.5);
    this.hammer.position.copy(this.hammerHome);
    this.group.add(this.hammer);
    this.glowMaterial = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: new THREE.Color(1.6, 1.15, 0.4),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.glow = new THREE.Sprite(this.glowMaterial);
    this.glow.scale.setScalar(4);
    this.glow.renderOrder = 5;
    this.group.add(this.glow);
    this.beamMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uStrength: { value: 1 } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beamGeo = new THREE.CylinderGeometry(0.9, 0.6, 140, 24, 1, true);
    beamGeo.translate(0, 70, 0);
    this.beam = new THREE.Mesh(beamGeo, this.beamMaterial);
    this.beam.position.copy(this.hammerHome).setY(SUMMIT_Y + 1);
    this.beam.renderOrder = 4;
    this.beam.frustumCulled = false;
    this.group.add(this.beam);
  }

  /** Lanterns and bunting along the last flight of stairs (inner edge, away from the camera). */
  private summitStairs(course: Course, model: Model): void {
    const stairs = course.pieces.filter((p) => p.kind === "stairs");
    const posts: THREE.Vector3[] = [];
    for (const p of stairs) {
      for (let s = p.s0 + 1; s < p.s1; s += 4.2) {
        const y = course.top(p, s);
        const a = course.point(s, course.radius(y) - DEPTH / 2 + 0.35, y - 0.05);
        const th = course.theta(s);
        addModel(model, lanternPost(2.3), placeAt(a.x, a.y, a.z, -th + Math.PI));
        posts.push(a.clone().setY(a.y + 2.25));
      }
    }
    for (let i = 0; i < posts.length - 1; i++) {
      const a = posts[i];
      const b = posts[i + 1];
      addModel(model, bunting([a.x, a.y, a.z], [b.x, b.y, b.z], 0.45, i * 3 + 1));
    }
  }

  update(dt: number, time: number): void {
    this.beamMaterial.uniforms.uTime.value = time;
    if (!this.taken) {
      this.hammer.position.copy(this.hammerHome).setY(this.hammerHome.y + Math.sin(time * 2.1) * 0.15);
      this.hammer.rotation.y += dt * 1.4;
    } else {
      // The beam fades once the hammer has left its pedestal
      const u = this.beamMaterial.uniforms.uStrength;
      u.value = Math.max(0, u.value - dt * 0.6);
    }
    this.glow.position.copy(this.hammer.position).add(new THREE.Vector3(0, 0.9, 0));
    this.glow.scale.setScalar(3.6 + Math.sin(time * 3.3) * 0.4);
  }
}
