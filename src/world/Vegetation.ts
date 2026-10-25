/**
 * Scatters trees, palms, pines, bushes, rocks and mushrooms across the island
 * following biome rules, renders them as instanced meshes with wind sway, and
 * registers their trunks as colliders.
 */

import * as THREE from "three";
import { Heightfield } from "./Heightfield";
import { Colliders } from "./Colliders";
import { LANDMARKS, P2, WORLD_HALF } from "./layout";
import { Noise2D, mulberry32, smoothstep } from "../core/noise";
import { UNFLIPPED_NORMAL_GLSL } from "../core/glsl";
import { WorldUniforms } from "./Terrain";
import { patchXray } from "./xray";
import * as flora from "./models/flora";

interface Species {
  models: flora.FloraModel[];
  scale: [number, number];
  collider: number;
  shadows: boolean;
  glow?: THREE.ColorRepresentation;
}

/** Places where nothing may grow (props and quest spots go there). */
const KEEP_OUT: { at: P2; r: number }[] = [
  { at: LANDMARKS.spawn, r: 9 },
  { at: LANDMARKS.volcanoGate, r: 6 },
  ...LANDMARKS.tablets.map((at) => ({ at, r: 3.5 })),
  { at: LANDMARKS.caveMouth, r: 7 },
  { at: LANDMARKS.forestGate, r: 4 },
  { at: LANDMARKS.bridge, r: 9 },
  { at: LANDMARKS.village, r: 21 },
  { at: LANDMARKS.villageGate, r: 4 },
  { at: LANDMARKS.mountainGate, r: 6 },
  // Trail entrance where the mountain challenge starts
  { at: [55.5, -13.5], r: 5 },
  { at: LANDMARKS.northDock, r: 7 },
  // Where the north pier actually meets the shore
  { at: [-24, -50], r: 6 },
  { at: LANDMARKS.treasureIsland, r: 4 },
];

export class Vegetation {
  readonly group = new THREE.Group();
  private species: Record<string, Species>;
  private placements = new Map<flora.FloraModel, THREE.Matrix4[]>();
  private noise = new Noise2D(4242);

  constructor(
    private hf: Heightfield,
    private colliders: Colliders,
    private world: WorldUniforms,
  ) {
    this.species = {
      tree: { models: [0, 1, 2, 3].map((s) => flora.roundTree(s)), scale: [0.85, 1.35], collider: 0.45, shadows: true },
      enchanted: { models: [0, 1, 2].map((s) => flora.enchantedTree(s)), scale: [0.9, 1.3], collider: 0.55, shadows: true },
      pine: { models: [0, 1].map((s) => flora.pineTree(s)), scale: [0.9, 1.5], collider: 0.4, shadows: true },
      snowPine: { models: [0, 1].map((s) => flora.pineTree(s + 5, true)), scale: [0.8, 1.3], collider: 0.4, shadows: true },
      palm: { models: [0, 1, 2].map((s) => flora.palmTree(s)), scale: [0.9, 1.25], collider: 0.35, shadows: true },
      bush: { models: [0, 1].map((s) => flora.bush(s)), scale: [0.8, 1.4], collider: 0.5, shadows: true },
      berryBush: { models: [flora.bush(7, "#e0263a"), flora.bush(8, "#4b5bff")], scale: [0.9, 1.2], collider: 0.5, shadows: true },
      rock: { models: [0, 1, 2, 3].map((s) => flora.rock(s)), scale: [0.5, 1.6], collider: 0.8, shadows: true },
      bareRock: { models: [4, 5].map((s) => flora.rock(s, false)), scale: [0.6, 2.2], collider: 0.85, shadows: true },
      deadTree: { models: [0, 1].map((s) => flora.deadTree(s)), scale: [0.9, 1.3], collider: 0.3, shadows: true },
      mushroom: { models: [0, 1].map((s) => flora.mushroom(s, false)), scale: [0.8, 1.6], collider: 0, shadows: false },
      glowShroom: { models: [flora.mushroom(3, true)], scale: [0.9, 1.8], collider: 0, shadows: false, glow: "#3fd9ff" },
    };
    this.scatter();
    this.build();
  }

  private scatter(): void {
    const rand = mulberry32(2024);
    const step = 2.1;
    for (let gz = -WORLD_HALF; gz < WORLD_HALF; gz += step) {
      for (let gx = -WORLD_HALF; gx < WORLD_HALF; gx += step) {
        const x = gx + rand() * step;
        const z = gz + rand() * step;
        const kind = this.pick(x, z, rand);
        if (kind) this.place(kind, x, z, rand);
      }
    }
  }

  /** Decide which species (if any) grows at a spot. */
  private pick(x: number, z: number, rand: () => number): string | null {
    const hf = this.hf;
    if (KEEP_OUT.some((k) => Math.hypot(x - k.at[0], z - k.at[1]) < k.r)) return null;
    const h = hf.heightAt(x, z);
    if (h < 0.1) return null;
    const slope = hf.slopeAt(x, z);
    const path = hf.maskAt(x, z, 0);
    if (path > 0.3) return rand() < 0.04 && path < 0.45 ? "rock" : null;
    const forest = hf.maskAt(x, z, 1);
    const ash = hf.maskAt(x, z, 2);
    const grove = this.noise.fbm(x * 0.028, z * 0.028, 3);
    const r = rand();

    // Beach: palms and the odd boulder
    if (h < 1.5 && slope < 0.4) {
      if (r < 0.07) return "palm";
      if (r < 0.085) return "bareRock";
      return null;
    }
    if (ash > 0.4) {
      if (r < 0.025) return "deadTree";
      if (r < 0.07) return "bareRock";
      return null;
    }
    if (slope > 0.75) return r < 0.05 ? "bareRock" : null;
    // Mountain slopes and peaks
    if (h > 9) {
      if (h > 24) return r < 0.18 && slope < 0.6 ? "snowPine" : r < 0.24 ? "bareRock" : null;
      if (r < 0.32 && slope < 0.65) return "pine";
      if (r < 0.38) return "rock";
      return null;
    }
    if (forest > 0.5) {
      if (r < 0.2 * forest) return "enchanted";
      if (r < 0.5) return "glowShroom";
      if (r < 0.56) return "mushroom";
      if (r < 0.62) return "berryBush";
      return null;
    }
    // Meadows: trees cluster in groves
    const treeChance = smoothstep(0.05, 0.45, grove) * 0.34 + 0.012;
    if (r < treeChance) return "tree";
    if (r < treeChance + 0.035) return "bush";
    if (r < treeChance + 0.045) return "berryBush";
    if (r < treeChance + 0.06) return "rock";
    if (r < treeChance + 0.066) return "mushroom";
    return null;
  }

  private place(kind: string, x: number, z: number, rand: () => number): void {
    const sp = this.species[kind];
    const model = sp.models[Math.floor(rand() * sp.models.length)];
    const s = sp.scale[0] + rand() * (sp.scale[1] - sp.scale[0]);
    if (sp.collider > 0 && this.colliders.hits(x, z, sp.collider * s)) return;
    const y = this.hf.heightAt(x, z) - 0.08 * s;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2),
      new THREE.Vector3(s, s * (0.9 + rand() * 0.2), s),
    );
    let list = this.placements.get(model);
    if (!list) this.placements.set(model, (list = []));
    list.push(m);
    if (sp.collider > 0) this.colliders.add(x, z, sp.collider * s);
  }

  private build(): void {
    const tint = new THREE.Color();
    const rand = mulberry32(77);
    for (const sp of Object.values(this.species)) {
      for (const model of sp.models) {
        const list = this.placements.get(model);
        if (!list?.length) continue;
        const mesh = new THREE.InstancedMesh(model.geometry, this.material(model, sp.glow), list.length);
        list.forEach((m, i) => {
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, tint.setScalar(0.85 + rand() * 0.25));
        });
        mesh.castShadow = sp.shadows;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        this.group.add(mesh);
      }
    }
  }

  private material(model: flora.FloraModel, glow?: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      side: model.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (glow) {
      mat.emissive = new THREE.Color(glow);
      mat.emissiveIntensity = 1.6;
    }
    if (model.swayAmp <= 0) return mat;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.world.uTime;
      shader.uniforms.uSway = { value: new THREE.Vector2(model.swayStart, model.swayAmp) };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform vec2 uSway;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float sway = max(position.y - uSway.x, 0.0) * uSway.y;
          float ph = ip.x * 0.37 + ip.z * 0.23;
          transformed.x += sin(uTime * 1.4 + ph) * sway + sin(uTime * 3.1 + ph * 2.0) * sway * 0.25;
          transformed.z += cos(uTime * 1.1 + ph * 1.3) * sway * 0.6;`,
        );
      if (model.doubleSided) {
        shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", UNFLIPPED_NORMAL_GLSL);
      }
      patchXray(shader);
    };
    return mat;
  }
}
