/**
 * The lagoon water: shared uniforms (time, sun, ripple rings), the
 * see-through sea surface (sun glitter, sky reflection, expanding ripple
 * rings with foam) and a material patch that makes everything below the
 * surface look under water: dancing caustics and a turquoise tint that
 * deepens with depth and with the length of the view ray through the water.
 */

import * as THREE from "three";
import { NOISE_GLSL } from "../../core/glsl";

/** How many ripple rings can spread at the same time. */
const RIPPLE_SLOTS = 12;

export interface SeaUniforms {
  [name: string]: THREE.IUniform;
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uShallow: { value: THREE.Color };
  uDeep: { value: THREE.Color };
  uSky: { value: THREE.Color };
  /** Ripple rings: x, z, start time, strength (0 = unused). */
  uRipples: { value: THREE.Vector4[] };
}

export function createSeaUniforms(sunDir: THREE.Vector3, sky: THREE.Color): SeaUniforms {
  return {
    uTime: { value: 0 },
    uSunDir: { value: sunDir.clone().normalize() },
    uSunColor: { value: new THREE.Color("#ffcf8a") },
    uShallow: { value: new THREE.Color("#2fd6cc") },
    uDeep: { value: new THREE.Color("#0a5f8f") },
    uSky: { value: sky.clone() },
    uRipples: { value: Array.from({ length: RIPPLE_SLOTS }, () => new THREE.Vector4(0, 0, -99, 0)) },
  };
}

/** The sea surface plus the ripple ring pool. */
export class SeaSurface {
  readonly mesh: THREE.Mesh;
  private next = 0;

  constructor(private sea: SeaUniforms) {
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      vertexShader: SURFACE_VERT,
      fragmentShader: SURFACE_FRAG,
      defines: { RIPPLE_SLOTS },
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    // Reason: share the live uniforms (time, sun, ripples) by reference with every underwater material
    Object.assign(mat.uniforms, sea);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), mat);
    this.mesh.renderOrder = 1;
    this.mesh.name = "sea";
  }

  /** Start an expanding ring at (x, z); strength ~0.3 (nibble) … 1.5 (big splash). */
  ripple(x: number, z: number, strength: number): void {
    this.sea.uRipples.value[this.next].set(x, z, this.sea.uTime.value, strength);
    this.next = (this.next + 1) % RIPPLE_SLOTS;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Same gentle swell the surface shader uses, for floating things (bobber, boat, buoys). */
export function swell(x: number, z: number, t: number): number {
  return Math.sin(x * 0.45 + t * 1.3) * 0.035 + Math.sin(z * 0.38 - t * 1.05 + x * 0.12) * 0.03;
}

const SURFACE_VERT = /* glsl */ `
varying vec3 vWPos;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const SURFACE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSky;
uniform vec4 uRipples[RIPPLE_SLOTS];
varying vec3 vWPos;
${NOISE_GLSL}
#include <fog_pars_fragment>

float waves(vec2 p, float t) {
  return vnoise(p * 0.9 + vec2(t * 0.32, t * 0.2)) * 0.55
       + vnoise(p * 2.3 - vec2(t * 0.26, -t * 0.38)) * 0.3
       + vnoise(p * 5.1 + vec2(-t * 0.55, t * 0.5)) * 0.15;
}

// Height of all ripple rings at p; foam gets the bright crest lines.
float rings(vec2 p, inout float foam) {
  float h = 0.0;
  for (int i = 0; i < RIPPLE_SLOTS; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 3.2) continue;
    float d = distance(p, r.xy);
    float radius = 0.12 + age * (0.75 + r.w * 0.45);
    float fade = exp(-age * 1.25) * r.w;
    for (int k = 0; k < 2; k++) {
      float band = d - radius * (k == 0 ? 1.0 : 0.62);
      float env = exp(-band * band * 14.0);
      h += sin(band * 15.0) * env * fade * 0.045;
      foam += smoothstep(0.06, 0.0, abs(band)) * fade * (k == 0 ? 0.9 : 0.45);
    }
  }
  return h;
}

float heightAt(vec2 p, inout float foam) {
  return waves(p, uTime) * 0.1 + rings(p, foam);
}

void main() {
  vec2 p = vWPos.xz;
  float e = 0.04;
  float foam = 0.0;
  float dummy = 0.0;
  float h0 = heightAt(p, foam);
  float hx = heightAt(p + vec2(e, 0.0), dummy);
  float hz = heightAt(p + vec2(0.0, e), dummy);
  vec3 N = normalize(vec3(-(hx - h0) / e, 1.0, -(hz - h0) / e));
  vec3 V = normalize(cameraPosition - vWPos);
  float dist = length(vWPos.xz - cameraPosition.xz);

  // Reason: near the jetty the water is see-through (the tinted sea floor shows); far away it turns into sky reflection
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  vec3 body = mix(uShallow * 0.9, uDeep, smoothstep(14.0, 70.0, dist));
  vec3 col = mix(body, uSky, clamp(fres * 1.05, 0.0, 0.9));
  float alpha = mix(0.12, 0.95, clamp(fres * 1.25, 0.0, 1.0));
  alpha = max(alpha, smoothstep(30.0, 110.0, dist) * 0.97);

  // Sun glitter path, small twinkles and a soft sheen
  vec3 H = normalize(uSunDir + V);
  float nh = max(dot(N, H), 0.0);
  float spec = pow(nh, 520.0) * 9.0 + pow(nh, 70.0) * 0.35;
  float tw = smoothstep(0.86, 0.96, vnoise(p * 5.5 + uTime * vec2(1.3, -0.9))) * pow(nh, 18.0) * 2.6;
  col += uSunColor * (spec + tw);
  alpha = clamp(alpha + (spec + tw) * 0.4, 0.0, 1.0);

  foam = clamp(foam, 0.0, 1.0);
  col = mix(col, vec3(1.15), foam * 0.85);
  alpha = max(alpha, foam * 0.85);

  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
`;

/** Turquoise absorption + caustics for fragments below y = 0 (inserted before fog). */
const UNDERWATER_FRAG = /* glsl */ `
{
  float uwDepth = -vUwPos.y;
  if (uwDepth > 0.0) {
    vec3 uwV = normalize(cameraPosition - vUwPos);
    float uwPath = uwDepth / max(uwV.y, 0.18);
    float uwC = caustics(vUwPos.xz * 0.75, uTime * 1.1);
    uwC = smoothstep(0.32, 0.95, uwC);
    float uwLit = exp(-uwDepth * 0.2) * smoothstep(0.0, 0.3, uwDepth);
    gl_FragColor.rgb += uSunColor * uwC * uwLit * 0.42;
    // Reason: water swallows red light first, so even shallow things turn a little teal
    gl_FragColor.rgb *= mix(vec3(1.0), uShallow * 1.3, smoothstep(0.0, 2.2, uwDepth) * 0.5);
    vec3 uwTint = mix(uShallow * 0.85, uDeep, smoothstep(1.5, 9.0, uwDepth));
    float uwAbs = 1.0 - exp(-(uwPath * 0.075 + uwDepth * 0.06));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uwTint, clamp(uwAbs, 0.0, 0.94));
  }
}
`;

/** Gentle current: weight `aSway` (0 at the root) bends seaweed, fans and tentacles. */
const SWAY_VERT = /* glsl */ `
{
  vec3 swW = (modelMatrix * vec4(position, 1.0)).xyz;
  float ph = swW.x * 0.8 + swW.z * 0.6;
  transformed.x += sin(uTime * 1.25 + ph) * aSway;
  transformed.z += cos(uTime * 0.95 + ph * 1.3) * aSway * 0.7;
}
`;

/**
 * Patch a built-in material (standard or basic) so it looks under water below
 * y = 0. With `sway`, geometries need a float `aSway` attribute. `colorFrag`
 * may tweak `diffuseColor` per fragment (world position in `vUwPos`).
 */
export function underwater<T extends THREE.Material>(material: T, sea: SeaUniforms, key: string, sway = false, colorFrag = ""): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sea);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vUwPos;\n${sway ? "attribute float aSway;\nuniform float uTime;" : ""}`,
      )
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${sway ? SWAY_VERT : ""}`)
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        {
          vec4 uw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            uw = instanceMatrix * uw;
          #endif
          vUwPos = (modelMatrix * uw).xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vUwPos;\nuniform float uTime;\nuniform vec3 uSunColor;\nuniform vec3 uShallow;\nuniform vec3 uDeep;\n${NOISE_GLSL}`,
      )
      .replace("#include <color_fragment>", `#include <color_fragment>\n${colorFrag}`)
      .replace("#include <fog_fragment>", `${UNDERWATER_FRAG}\n#include <fog_fragment>`);
  };
  // Reason: every patched material shares the same onBeforeCompile shape; key them apart
  material.customProgramCacheKey = () => `fishing-uw-${key}-${sway ? 1 : 0}`;
  return material;
}

export interface SeaMaterialOptions {
  sway?: boolean;
  roughness?: number;
  /** Emission as a fraction of the albedo, keeps small things vivid. */
  selfLit?: number;
  side?: THREE.Side;
  colorFrag?: string;
}

/** Vertex-coloured standard material that looks right under water. */
export function seaMaterial(sea: SeaUniforms, key: string, opts: SeaMaterialOptions = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.8, metalness: 0, side: opts.side ?? THREE.FrontSide });
  const selfLit = opts.selfLit ?? 0;
  // Reason: emissive is multiplied by the vertex colour below, so it acts as a per-vertex self-glow
  const frag = `${opts.colorFrag ?? ""}\n${selfLit > 0 ? `totalEmissiveRadiance = diffuseColor.rgb * ${selfLit.toFixed(3)};` : ""}`;
  return underwater(m, sea, key, opts.sway, frag);
}

/** Cartoon outline (inverted hull) that also fades into the water tint below the surface. */
export function seaOutline(sea: SeaUniforms, width = 0.016): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: "#2a1b12", side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sea);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vUwPos;")
      .replace("#include <begin_vertex>", `vec3 transformed = position + normal * ${width.toFixed(4)};`)
      .replace("#include <project_vertex>", "#include <project_vertex>\nvUwPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vUwPos;\nuniform float uTime;\nuniform vec3 uSunColor;\nuniform vec3 uShallow;\nuniform vec3 uDeep;\n${NOISE_GLSL}`,
      )
      .replace("#include <fog_fragment>", `${UNDERWATER_FRAG}\n#include <fog_fragment>`);
  };
  m.customProgramCacheKey = () => `fishing-uw-outline-${width}`;
  return m;
}
