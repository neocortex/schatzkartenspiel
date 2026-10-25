/**
 * Instanced, vertex-animated little creatures (butterflies, birds, crabs,
 * chickens, ...). The CPU writes one compact pose per instance each frame;
 * the vertex shader runs a per-species GLSL animation (wing flaps, pecks,
 * leg wiggles) and then applies the pose. One draw call per species, plus one
 * in the shadow pass when the species casts shadows.
 */

import * as THREE from "three";
import { UNFLIPPED_NORMAL_GLSL } from "../../core/glsl";

export interface CritterOptions {
  /** Unique name — also keys the compiled shader program. */
  name: string;
  /** Merged model with position, normal, color and a per-vertex `aPart` id (see `tagPart`). */
  geometry: THREE.BufferGeometry;
  count: number;
  /**
   * GLSL statements animating one vertex. In scope: `inout vec3 p`, `inout vec3 n`
   * (object space, forward = +z), `float part` (the vertex's aPart) and `float a`
   * (the instance's animation parameter).
   */
  animate: string;
  castShadow?: boolean;
  /** Thin double-sided parts (wings): light both faces with the authored normal. */
  doubleSided?: boolean;
  /** Fraction of the albedo added back as emission so tiny critters stay vivid in shade. */
  selfLit?: number;
  /** Alpha-tested texture atlas applied to parts with aPart > 0.5; the instance variant picks the column. */
  atlas?: { map: THREE.Texture; columns: number };
}

/** Add a constant per-vertex `aPart` attribute (animation group id) to a geometry. */
export function tagPart(g: THREE.BufferGeometry, part: number): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  g.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  return g;
}

const vertexCommon = (animate: string) => /* glsl */ `
attribute vec4 aPose;   // xyz world position, w yaw
attribute vec4 aAnim;   // x pitch (nose up), y roll, z animation parameter, w scale
attribute vec4 aTint;   // rgb tint for grey parts, w atlas column
attribute float aPart;
varying vec4 vTint;
varying vec2 vAtlasUv;
varying float vPart;

vec3 critterRotate(vec3 v) {
  float cy = cos(aPose.w), sy = sin(aPose.w);
  float cp = cos(aAnim.x), sp = sin(aAnim.x);
  float cr = cos(aAnim.y), sr = sin(aAnim.y);
  v = vec3(v.x * cr - v.y * sr, v.x * sr + v.y * cr, v.z);
  v = vec3(v.x, v.y * cp + v.z * sp, -v.y * sp + v.z * cp);
  return vec3(v.x * cy + v.z * sy, v.y, -v.x * sy + v.z * cy);
}
void critterAnimate(inout vec3 p, inout vec3 n, float part, float a) {
  ${animate}
}
`;

const BEGIN_VERTEX = /* glsl */ `
  vec3 cP = position;
  vec3 cN = normal;
  critterAnimate(cP, cN, aPart, aAnim.z);
  vec3 transformed = critterRotate(cP) * aAnim.w + aPose.xyz;
  vTint = aTint;
  vAtlasUv = uv;
  vPart = aPart;
`;

const BEGIN_NORMAL = /* glsl */ `
  vec3 nP = position;
  vec3 objectNormal = normal;
  critterAnimate(nP, objectNormal, aPart, aAnim.z);
  objectNormal = critterRotate(objectNormal);
`;

const FRAGMENT_COMMON = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uSelfLit;
varying vec4 vTint;
varying vec2 vAtlasUv;
varying float vPart;
vec4 atlasTexel() {
  return texture2D(uAtlas, vec2((vAtlasUv.x + vTint.w) / ATLAS_COLUMNS, vAtlasUv.y));
}
`;

const ATLAS_DISCARD = /* glsl */ `
#ifdef USE_ATLAS
  if (vPart > 0.5 && atlasTexel().a < 0.5) discard;
#endif
`;

/**
 * Tint only greyish vertex colours, so one white hen model can become a brown
 * one while its red comb and yellow beak stay as authored.
 */
const COLOR_FRAGMENT = /* glsl */ `
#include <color_fragment>
{
  vec3 c = diffuseColor.rgb;
  float grey = 1.0 - smoothstep(0.02, 0.08, max(abs(c.r - c.g), abs(c.g - c.b)));
  diffuseColor.rgb *= mix(vec3(1.0), vTint.rgb, grey);
#ifdef USE_ATLAS
  if (vPart > 0.5) diffuseColor.rgb = atlasTexel().rgb;
#endif
}
`;

export class CritterMesh {
  readonly mesh: THREE.Mesh;
  readonly count: number;
  private pose: THREE.InstancedBufferAttribute;
  private anim: THREE.InstancedBufferAttribute;
  private tint: THREE.InstancedBufferAttribute;

  constructor(o: CritterOptions) {
    this.count = o.count;
    const geo = new THREE.InstancedBufferGeometry();
    for (const [name, attr] of Object.entries(o.geometry.attributes)) geo.setAttribute(name, attr);
    if (!geo.attributes.uv) {
      geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    }
    geo.index = o.geometry.index;
    this.pose = new THREE.InstancedBufferAttribute(new Float32Array(o.count * 4), 4);
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(o.count * 4), 4);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(o.count * 4).fill(1), 4);
    for (const a of [this.pose, this.anim]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aPose", this.pose);
    geo.setAttribute("aAnim", this.anim);
    geo.setAttribute("aTint", this.tint);
    geo.instanceCount = o.count;

    const uniforms = {
      uAtlas: { value: o.atlas?.map ?? null },
      uSelfLit: { value: o.selfLit ?? 0 },
    };
    const defines: Record<string, string> = { ATLAS_COLUMNS: (o.atlas?.columns ?? 1).toFixed(1) };
    if (o.atlas) defines.USE_ATLAS = "";

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      side: o.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
    mat.defines = defines;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${vertexCommon(o.animate)}`)
        .replace("#include <beginnormal_vertex>", BEGIN_NORMAL)
        .replace("#include <begin_vertex>", BEGIN_VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${FRAGMENT_COMMON}`)
        .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>\n${ATLAS_DISCARD}`)
        .replace("#include <color_fragment>", COLOR_FRAGMENT)
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uSelfLit;",
        );
      if (o.doubleSided) {
        shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", UNFLIPPED_NORMAL_GLSL);
      }
    };
    // Reason: every species shares the same onBeforeCompile source, so three would
    // otherwise reuse the first species' compiled program for all of them.
    mat.customProgramCacheKey = () => `critter-${o.name}`;

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = o.name;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    if (o.castShadow) {
      this.mesh.castShadow = true;
      const depth = new THREE.MeshDepthMaterial({ side: mat.side });
      depth.defines = { ...defines };
      depth.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", `#include <common>\n${vertexCommon(o.animate)}`)
          .replace("#include <begin_vertex>", BEGIN_VERTEX);
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", `#include <common>\n${FRAGMENT_COMMON}`)
          .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>\n${ATLAS_DISCARD}`);
      };
      depth.customProgramCacheKey = () => `critter-depth-${o.name}`;
      this.mesh.customDepthMaterial = depth;
    }
    for (let i = 0; i < o.count; i++) this.hide(i);
  }

  /** Write one instance's pose. `anim` feeds the species' GLSL animation. */
  set(i: number, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, anim: number, scale: number): void {
    this.pose.setXYZW(i, x, y, z, yaw);
    this.anim.setXYZW(i, pitch, roll, anim, scale);
  }

  /** Collapse an instance to nothing (scale 0). */
  hide(i: number): void {
    this.anim.setW(i, 0);
  }

  /** Tint multiplies grey vertex colours; `variant` picks the atlas column. */
  setLook(i: number, tint: THREE.Color, variant = 0): void {
    this.tint.setXYZW(i, tint.r, tint.g, tint.b, variant);
    this.tint.needsUpdate = true;
  }

  /** Upload this frame's poses to the GPU. */
  commit(): void {
    this.pose.needsUpdate = true;
    this.anim.needsUpdate = true;
  }
}
