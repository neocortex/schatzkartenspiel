/**
 * Materials for the landmarks: the shared vertex-coloured standard material,
 * emissive glow / pulse materials, wind-swayed cloth, unlit cave darkness,
 * instanced flickering flames, and the animated lava and waterfall shaders.
 * Everything animates from the shared `uTime` world uniform.
 */

import * as THREE from "three";
import { NOISE_GLSL } from "../../core/glsl";
import { HF_GLSL } from "../Heightfield";
import { WorldUniforms } from "../Terrain";
import { part } from "../../core/geo";

export interface LandmarkMaterials {
  solid: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  pulse: THREE.MeshBasicMaterial;
  cloth: THREE.MeshStandardMaterial;
  dark: THREE.MeshBasicMaterial;
  flame: THREE.MeshBasicMaterial;
}

export function createMaterials(world: WorldUniforms): LandmarkMaterials {
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const dark = new THREE.MeshBasicMaterial({ vertexColors: true });

  const pulse = new THREE.MeshBasicMaterial({ vertexColors: true });
  pulse.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = world.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vPulse;\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 pw = modelMatrix * vec4(position, 1.0);
        vPulse = 0.72 + 0.28 * sin(uTime * 2.2 + pw.x * 0.9 + pw.z * 0.7 + pw.y * 1.3);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vPulse;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vPulse;");
  };

  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  cloth.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = world.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSway;\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        // Reason: phase from world position makes ripples travel along flags and differ between them
        vec4 cw = modelMatrix * vec4(position, 1.0);
        float ph = cw.x * 1.3 + cw.z * 0.9 + cw.y * 0.6;
        transformed.x += sin(uTime * 3.1 + ph) * aSway;
        transformed.z += cos(uTime * 2.6 + ph * 1.4) * aSway * 0.8;
        transformed.y += sin(uTime * 4.3 + ph * 2.1) * aSway * 0.35;`,
      );
  };

  const flame = new THREE.MeshBasicMaterial({ vertexColors: true });
  flame.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = world.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vFlick;\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
        vec3 ip = vec3(0.0);
        #endif
        float ph = ip.x * 1.7 + ip.z * 2.3;
        float fl = sin(uTime * 13.0 + ph) * 0.5 + sin(uTime * 7.3 + ph * 1.7) * 0.35 + sin(uTime * 21.0 + ph * 0.6) * 0.15;
        float hgt = max(position.y, 0.0);
        transformed.y *= 1.0 + fl * 0.2;
        transformed.x += sin(uTime * 6.0 + ph + position.y * 4.0) * hgt * 0.16;
        transformed.z += cos(uTime * 5.2 + ph) * hgt * 0.1;
        vFlick = 0.82 + fl * 0.18;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFlick;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vFlick;");
  };

  return { solid, glow, pulse, cloth, dark, flame };
}

/** Teardrop flame (origin at its base), white-hot at the bottom and red at the tip, for instancing at torch tips. */
export function flameGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.17, 9, 7);
  // Reason: stretch and narrow the upper half into a point so the sphere reads as a flame tongue
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = y > 0 ? 1 - (y / 0.17) * 0.8 : 1;
    pos.setXYZ(i, pos.getX(i) * k, y > 0 ? y * 3.2 : y, pos.getZ(i) * k);
  }
  g.translate(0, 0.15, 0);
  g.computeVertexNormals();
  const hot = new THREE.Color(5.5, 4.0, 1.6);
  const mid = new THREE.Color(3.6, 1.2, 0.18);
  const tip = new THREE.Color(2.2, 0.32, 0.05);
  const out = new THREE.Color();
  return part(g, (p) => {
    const t = THREE.MathUtils.clamp(p.y / 0.7, 0, 1);
    return t < 0.4 ? out.copy(hot).lerp(mid, t / 0.4) : out.copy(mid).lerp(tip, (t - 0.4) / 0.6);
  });
}

const LAVA_VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWPos;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += (sin(uTime * 1.3 + wp.x * 0.8) + sin(uTime * 0.9 + wp.z * 1.1)) * 0.035;
  vWPos = wp.xyz;
  vUv = uv;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const LAVA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLevel;
varying vec3 vWPos;
varying vec2 vUv;
${HF_GLSL}
${NOISE_GLSL}
#include <fog_pars_fragment>

// Distance to the nearest edge between slowly drifting crust plates
float plates(vec2 p) {
  vec2 g = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 h = hash22(g + o);
      h = 0.5 + 0.4 * sin(uTime * 0.35 + 6.2831 * h);
      float d = length(o + h - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}

void main() {
  #ifdef FLOW
  vec2 p = vec2(vUv.x * 1.6, vUv.y * 0.9 - uTime * 0.45);
  #else
  vec2 p = vWPos.xz * 0.5;
  #endif
  vec2 warp = vec2(fbm3(p * 0.7 + uTime * 0.05), fbm3(p * 0.7 - uTime * 0.04 + 5.0));
  float n = fbm3(p * 1.4 + warp * 1.6 + uTime * 0.07);
  float edge = plates(p * 1.2 + warp * 0.9);
  float hot = smoothstep(0.32, 0.0, edge) * 0.75 + n * 0.55;

  #ifdef FLOW
  // Banks of the stream cool into crust; the tongue cools towards its end
  float bank = smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x);
  hot *= mix(0.35, 1.0, bank) * mix(1.0, 0.25, smoothstep(0.65, 1.0, vUv.y));
  #else
  // Shallow lava along the crater wall glows brighter
  float depth = uLevel - hfHeight(vWPos.xz);
  hot += smoothstep(1.2, 0.1, depth) * 0.45;
  // Slow bubbling hot spots
  float bub = vnoise(vWPos.xz * 0.9 + vec2(0.0, uTime * 0.3));
  hot += smoothstep(0.78, 0.95, bub) * (0.5 + 0.5 * sin(uTime * 3.0 + bub * 20.0)) * 0.4;
  #endif

  hot = clamp(hot, 0.0, 1.2);
  vec3 col = mix(vec3(0.13, 0.04, 0.03), vec3(1.7, 0.2, 0.03), smoothstep(0.12, 0.42, hot));
  col = mix(col, vec3(3.4, 1.0, 0.1), smoothstep(0.42, 0.72, hot));
  col = mix(col, vec3(5.5, 3.4, 0.9), smoothstep(0.82, 1.1, hot));
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

/** Animated lava. `flow` = scroll along the UV v axis (streams) instead of world-space plates (pools). */
export function lavaMaterial(world: WorldUniforms, level: number, flow: boolean): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLevel: { value: level } }]),
    vertexShader: LAVA_VERT,
    fragmentShader: LAVA_FRAG,
    defines: flow ? { FLOW: "" } : {},
    fog: true,
  });
  Object.assign(mat.uniforms, world);
  return mat;
}

const FALL_VERT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec3 p = position;
  p += normal * sin(uTime * 4.0 + uv.y * 14.0 + uv.x * 5.0) * 0.06;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FALL_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
${NOISE_GLSL}
#include <fog_pars_fragment>
void main() {
  float u = vUv.x;
  float v = vUv.y;
  // Reason: streaks stretch along the fall and speed up towards the bottom (v = 1)
  float speed = uTime * (1.6 + v * 0.8);
  float s1 = vnoise(vec2(u * 16.0, v * 2.2 - speed));
  float s2 = vnoise(vec2(u * 37.0 + 3.0, v * 4.0 - speed * 1.4));
  float streak = s1 * 0.6 + s2 * 0.4;
  vec3 col = mix(vec3(0.22, 0.62, 0.86), vec3(0.9, 0.98, 1.0), smoothstep(0.35, 0.78, streak));
  float foam = smoothstep(0.8, 1.0, v) + smoothstep(0.07, 0.0, v) * 0.8;
  col = mix(col, vec3(1.05), clamp(foam, 0.0, 1.0));
  float edge = smoothstep(0.0, 0.14, u) * smoothstep(1.0, 0.86, u);
  float alpha = (0.62 + streak * 0.38) * edge;
  alpha = max(alpha, foam * edge * 0.9);
  gl_FragColor = vec4(col * 1.08, alpha);
  #include <fog_fragment>
}
`;

/** Scrolling, streaky falling-water material for ribbons with uv.y = 0 at the lip. */
export function waterfallMaterial(world: WorldUniforms): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: FALL_VERT,
    fragmentShader: FALL_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  mat.uniforms.uTime = world.uTime;
  return mat;
}

const FOAM_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
${NOISE_GLSL}
#include <fog_pars_fragment>
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float a = atan(c.y, c.x);
  // Rings of foam spreading outwards from the splash point
  float rings = vnoise(vec2(a * 3.0, r * 6.0 - uTime * 1.8)) * 0.6 + vnoise(vec2(a * 7.0, r * 11.0 - uTime * 2.6)) * 0.4;
  float alpha = smoothstep(1.0, 0.35, r) * smoothstep(0.3, 0.6, rings + (1.0 - r) * 0.5);
  gl_FragColor = vec4(vec3(1.0), alpha * 0.9);
  #include <fog_fragment>
}
`;

/** Flat spreading-foam disc for the waterfall basin. */
export function foamMaterial(world: WorldUniforms): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: FALL_VERT.replace("p += normal", "p += 0.0 * normal"),
    fragmentShader: FOAM_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  mat.uniforms.uTime = world.uTime;
  return mat;
}

/**
 * Strip geometry between matching left/right edge points, with uv.x across
 * (0 = left, 1 = right) and uv.y along (0 = first point, 1 = last).
 */
export function ribbon(left: THREE.Vector3[], right: THREE.Vector3[]): THREE.BufferGeometry {
  const n = left.length;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = i / (n - 1);
    pos.push(left[i].x, left[i].y, left[i].z, right[i].x, right[i].y, right[i].z);
    uv.push(0, v, 1, v);
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
