/**
 * The brook on the west side of the glade: a ribbon of clear, glowing
 * water flowing between sandy banks, an arched wooden bridge with two
 * little lanterns, and mossy stepping stones Tadeo can hop across.
 */

import * as THREE from "three";
import { NOISE_GLSL } from "../../core/glsl";
import { mulberry32 } from "../../core/noise";
import { displace, facet, merge, part } from "../../core/geo";
import { Model, PAL, beam, box, cyl, emptyModel, rbox, tint } from "../../world/models/shapes";
import { GlowField } from "../cave/materials";
import { modelMeshes } from "../cave/mine";
import { BRIDGE, ForestField, MAX_Z, MIN_Z, STONES, WATER_LEVEL, brookX } from "./layout";

const VERT = /* glsl */ `
attribute float aDepth;
varying float vDepth;
varying vec2 vUv;
varying vec3 vWPos;
void main() {
  vDepth = aDepth;
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
varying float vDepth;
varying vec2 vUv;
varying vec3 vWPos;
${NOISE_GLSL}
void main() {
  float depth = vDepth;
  vec3 shallow = vec3(0.16, 0.52, 0.5);
  vec3 deep = vec3(0.03, 0.17, 0.26);
  vec3 col = mix(shallow, deep, smoothstep(0.02, 0.3, depth));
  // Streaks drifting downstream (+z)
  float along = vWPos.z - uTime * 1.3;
  float streak = smoothstep(0.6, 0.95, vnoise(vec2(vWPos.x * 2.2, along * 0.7)));
  col += vec3(0.45, 0.95, 0.9) * streak * 0.32;
  float c = caustics(vec2(vWPos.x, along) * 1.4, uTime * 0.7);
  col += vec3(0.25, 0.75, 0.7) * pow(c, 4.0) * 0.45;
  // Foam where the water gets shallow at the banks
  float foam = smoothstep(0.1, 0.02, depth) * (0.55 + 0.45 * vnoise(vec2(vWPos.x * 6.0, along * 3.0)));
  col = mix(col, vec3(0.85, 1.0, 0.98), foam * 0.6);
  float alpha = smoothstep(0.0, 0.05, depth) * mix(0.62, 0.9, smoothstep(0.05, 0.3, depth));
  gl_FragColor = vec4(col, alpha);
}`;

export class Brook {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];

  constructor(field: ForestField, glow: GlowField, time: { value: number }) {
    this.group.add(this.water(field, time));
    this.group.add(modelMeshes(this.bridgeModel(field, glow), glow, time, this.materials));
    this.group.add(this.stones());
    // Reason: the water itself glows a little, so the banks catch a teal sheen
    for (let z = MIN_Z + 4; z < MAX_Z - 4; z += 3.5) glow.add(new THREE.Vector3(brookX(z), 0.1, z), "#2fd1c4", 2.6, 0.22);
  }

  private water(field: ForestField, time: { value: number }): THREE.Mesh {
    const across = 9;
    const rows = Math.ceil((MAX_Z - MIN_Z) / 0.5) + 1;
    const pos: number[] = [];
    const uv: number[] = [];
    const depth: number[] = [];
    for (let j = 0; j < rows; j++) {
      const z = MIN_Z + j * 0.5;
      const cx = brookX(z);
      for (let i = 0; i < across; i++) {
        const u = i / (across - 1);
        const x = cx - 1.9 + u * 3.8;
        pos.push(x, WATER_LEVEL, z);
        uv.push(u, z);
        depth.push(WATER_LEVEL - field.terrainAt(x, z));
      }
    }
    const index: number[] = [];
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < across - 1; i++) {
        const a = j * across + i;
        index.push(a, a + across, a + 1, a + 1, a + across, a + across + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("aDepth", new THREE.Float32BufferAttribute(depth, 1));
    geo.setIndex(index);
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: time },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.materials.push(material);
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = 1;
    return mesh;
  }

  /** Arched plank bridge with rails and a lantern post at each end. */
  private bridgeModel(field: ForestField, glow: GlowField): Model {
    const rand = mulberry32(8);
    const m = emptyModel();
    const { x: cx, z: cz, halfLength: L, halfWidth: W } = BRIDGE;
    const deck = (x: number) => field.bridgeDeck(x, cz) ?? 0;
    for (let x = cx - L + 0.15; x < cx + L; x += 0.3) {
      const slope = Math.atan2(deck(x + 0.1) - deck(x - 0.1), 0.2);
      m.solid.push(box(0.26, 0.08, W * 2, tint(PAL.plank, rand, 0.16), { pos: [x, deck(x) - 0.04, cz + (rand() - 0.5) * 0.06], rot: [0, 0, slope] }));
    }
    for (const side of [-1, 1]) {
      const z = cz + side * (W - 0.05);
      const posts: [number, number, number][] = [];
      for (let k = 0; k <= 4; k++) {
        const x = cx - L + 0.2 + (k / 4) * (L * 2 - 0.4);
        posts.push([x, deck(x) + 0.62, z]);
        m.solid.push(rbox(0.12, 0.75, 0.12, tint(PAL.woodDark, rand), { pos: [x, deck(x) + 0.28, z] }, 0.03));
      }
      for (let k = 0; k < posts.length - 1; k++) m.solid.push(beam(posts[k], posts[k + 1], 0.08, PAL.wood));
      // Stringer under the planks
      for (let k = 0; k < 8; k++) {
        const x0 = cx - L + (k / 8) * L * 2;
        const x1 = x0 + (L * 2) / 8;
        m.solid.push(beam([x0, deck(x0) - 0.14, z], [x1, deck(x1) - 0.14, z], 0.12, PAL.timber, 0.14));
      }
    }
    // A lantern post at two opposite corners
    for (const [dx, dz] of [[L + 0.25, W + 0.15], [-L - 0.25, -W - 0.15]] as [number, number][]) {
      const x = cx + dx;
      const z = cz + dz;
      const y = field.terrainAt(x, z);
      m.solid.push(cyl(0.07, 0.09, 1.5, PAL.woodDark, { pos: [x, y + 0.75, z] }));
      m.solid.push(box(0.3, 0.05, 0.3, PAL.iron, { pos: [x, y + 1.53, z] }));
      m.solid.push(box(0.3, 0.05, 0.3, PAL.iron, { pos: [x, y + 1.85, z] }));
      m.pulse.push(box(0.22, 0.28, 0.22, new THREE.Color(1.3, 0.85, 0.45), { pos: [x, y + 1.69, z] }));
      glow.add(new THREE.Vector3(x, y + 1.7, z), "#ffb867", 4.2, 1.1);
    }
    return m;
  }

  private stones(): THREE.Mesh {
    const parts = STONES.map((s, i) => {
      const g = new THREE.IcosahedronGeometry(s.r, 1);
      g.scale(1, 0.45, 0.9);
      displace(g, 0.05, 2.5, i * 7);
      facet(g);
      return part(g, (_p, n) => new THREE.Color(n.y > 0.5 ? "#6f9a5a" : "#7d7a86"), { pos: [s.x, -0.12, s.z] });
    });
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(merge(parts), mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }
}
