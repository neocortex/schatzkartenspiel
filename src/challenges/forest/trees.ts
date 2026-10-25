/**
 * The trees around the glade: a dense ring of purple and teal enchanted
 * trees closing the clearing in, soft bushes along its edges and the huge
 * old tree in the east. All are instanced, sway in the wind, pick up the
 * baked glow of nearby mushrooms and open up where they would hide Tadeo.
 */

import * as THREE from "three";
import { mulberry32 } from "../../core/noise";
import { UNFLIPPED_NORMAL_GLSL } from "../../core/glsl";
import { Colliders } from "../../world/Colliders";
import { patchXray } from "../../world/xray";
import * as flora from "../../world/models/flora";
import { GlowField, instances } from "../cave/materials";
import { ForestField, MAX_X, MAX_Z, MIN_X, MIN_Z, OLD_TREE } from "./layout";

/**
 * Lit vertex-coloured plant material: wind sway above `swayStart`, baked glow
 * (`aGlow` per instance) and the x-ray cut-out around Tadeo. With `hole`
 * (trees and bushes) the cut-out is much wider and anything right at the
 * camera disappears too.
 */
export function floraMaterial(time: { value: number }, swayStart: number, swayAmp: number, doubleSided = false, hole = false): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uSway = { value: new THREE.Vector2(swayStart, swayAmp) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform vec2 uSway;\nattribute vec3 aGlow;\nvarying vec3 vGlow;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vGlow = aGlow;
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float sway = max(position.y - uSway.x, 0.0) * uSway.y;
        float ph = ip.x * 0.37 + ip.z * 0.23;
        transformed.x += sin(uTime * 1.3 + ph) * sway + sin(uTime * 2.9 + ph * 2.0) * sway * 0.25;
        transformed.z += cos(uTime * 1.05 + ph * 1.3) * sway * 0.6;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;");
    if (doubleSided) shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", UNFLIPPED_NORMAL_GLSL);
    patchXray(shader);
    if (!hole) return;
    shader.uniforms.uTreeHole = TREE_HOLE;
    // Reason: a canopy between the camera and Tadeo would hide him and the path ahead, so plants get a much
    // wider see-through hole than the island's x-ray (solid core, short dithered rim) and vanish right at the lens
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTreeHole;")
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        {
          vec3 P = (viewMatrix * vec4(uXrayTarget, 1.0)).xyz;
          vec3 F = -vViewPosition;
          float t = dot(F, P) / dot(P, P);
          float keep = smoothstep(5.0, 6.0, length(vViewPosition));
          if (t > 0.0 && t < 0.88) keep = min(keep, smoothstep(uTreeHole * 0.8, uTreeHole, length(F - P * t)));
          if (xrayBayer(gl_FragCoord.xy) > keep) discard;
        }`,
      );
  };
  m.customProgramCacheKey = () => `forest-flora-${doubleSided ? 1 : 0}-${hole ? 1 : 0}`;
  return m;
}

/** Radius of the see-through hole plants get around the camera→Tadeo line. */
const TREE_HOLE = { value: 3.2 };

/** Repaint a model along a dark→light palette, keeping its shading (by vertex brightness). */
function recolor(model: flora.FloraModel, [dark, light]: [string, string]): flora.FloraModel {
  const col = model.geometry.attributes.color as THREE.BufferAttribute;
  const a = new THREE.Color(dark);
  const b = new THREE.Color(light);
  const c = new THREE.Color();
  for (let k = 0; k < col.count; k++) {
    const lum = THREE.MathUtils.clamp((col.getY(k) - 0.3) / 0.45, 0, 1);
    c.copy(a).lerp(b, lum);
    col.setXYZ(k, c.r, c.g, c.b);
  }
  return model;
}

interface Placement {
  model: flora.FloraModel;
  matrix: THREE.Matrix4;
  shadow: boolean;
}

export class ForestTrees {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  private placements: Placement[] = [];
  private rand = mulberry32(2025);

  constructor(
    private field: ForestField,
    private colliders: Colliders,
  ) {
    const trees = [0, 1, 2, 3, 4, 5].map((s) => flora.enchantedTree(s));
    // Reason: the island's bushes are lime green; repaint them in the forest's teal and violet palette
    const palettes: [string, string][] = [["#17463f", "#4fb39a"], ["#1d4a2c", "#6cbf62"], ["#30245c", "#8a6fd8"]];
    const bushes = palettes.map((p, i) => recolor(flora.bush(i + 40), p));
    this.border(trees);
    this.edgeBushes(bushes);
    const old = flora.enchantedTree(4);
    this.placements.push({ model: old, matrix: this.place(OLD_TREE.x, OLD_TREE.z, 1.8, 0.6), shadow: true });
    colliders.add(OLD_TREE.x, OLD_TREE.z, OLD_TREE.r);
  }

  /** Build the instanced meshes; call after every glow source is registered. */
  build(glow: GlowField, time: { value: number }): void {
    const byModel = new Map<string, Placement[]>();
    const ids = new Map<flora.FloraModel, number>();
    for (const p of this.placements) {
      if (!ids.has(p.model)) ids.set(p.model, ids.size);
      const key = `${ids.get(p.model)}-${p.shadow ? 1 : 0}`;
      const list = byModel.get(key) ?? [];
      list.push(p);
      byModel.set(key, list);
    }
    const mats = new Map<flora.FloraModel, THREE.Material>();
    const tint = new THREE.Color();
    for (const list of byModel.values()) {
      const model = list[0].model;
      let material = mats.get(model);
      if (!material) {
        material = floraMaterial(time, model.swayStart, model.swayAmp, model.doubleSided, true);
        mats.set(model, material);
        this.materials.push(material);
      }
      const mesh = instances(model.geometry, material, list.map((p) => p.matrix), glow, list[0].shadow);
      list.forEach((_, i) => mesh.setColorAt(i, tint.setScalar(0.85 + this.rand() * 0.3)));
      this.group.add(mesh);
    }
  }

  private place(x: number, z: number, s: number, yaw = this.rand() * Math.PI * 2): THREE.Matrix4 {
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, this.field.terrainAt(x, z) - 0.1 * s, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(s, s * (0.9 + this.rand() * 0.25), s),
    );
  }

  /** Dense forest wall outside the glade (blue-noise-ish: reject spots too close to others). */
  private border(models: flora.FloraModel[]): void {
    const spots: { x: number; z: number }[] = [];
    for (let tries = 0; tries < 9000 && spots.length < 230; tries++) {
      const x = MIN_X + 2 + this.rand() * (MAX_X - MIN_X - 4);
      const z = MIN_Z + 2 + this.rand() * (MAX_Z - MIN_Z - 4);
      const open = this.field.openAt(x, z);
      if (open > -2.3 || this.field.brookAt(x, z) > 0.05 || Math.hypot(x - OLD_TREE.x, z - OLD_TREE.z) < 4.5) continue;
      // Reason: the camera looks north over the trees south of a clearing, so keep those further back
      if (this.field.openAt(x, z - 3.5) > -1.2) continue;
      const gap = open > -5 ? 2.3 : 2.9;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < gap)) continue;
      spots.push({ x, z });
      const s = 0.85 + this.rand() * 0.45 + Math.min(-open, 8) * 0.04;
      this.placements.push({ model: models[Math.floor(this.rand() * models.length)], matrix: this.place(x, z, s), shadow: open > -6 });
    }
  }

  /** Bushes hugging the glade's edge so the forest wall starts softly. */
  private edgeBushes(models: flora.FloraModel[]): void {
    let placed = 0;
    for (let tries = 0; tries < 8000 && placed < 120; tries++) {
      const x = MIN_X + 4 + this.rand() * (MAX_X - MIN_X - 8);
      const z = MIN_Z + 4 + this.rand() * (MAX_Z - MIN_Z - 8);
      const open = this.field.openAt(x, z);
      if (open > -0.1 || open < -2.2 || this.field.brookAt(x, z) > 0.1) continue;
      const s = 0.9 + this.rand() * 0.7;
      this.placements.push({ model: models[placed % models.length], matrix: this.place(x, z, s), shadow: true });
      placed++;
    }
  }
}
