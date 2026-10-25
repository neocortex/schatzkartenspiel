/**
 * Shape of the ogre's gorge: a river winding through a grassy ravine (flowing
 * towards +z, i.e. towards the camera), a tall cliff upstream where the river
 * tumbles down as a waterfall, and the wooden bridge spanning it along x at
 * z = 0. Provides the height function, a baked height texture for the water
 * shader (depth → colour and foam) and the vertex-painted terrain mesh.
 */

import * as THREE from "three";
import { Noise2D, smoothstep, clamp } from "../../core/noise";
import { NOISE_GLSL } from "../../core/glsl";

const noise = new Noise2D(4242);

/** Bridge: span along x centred on the origin, deck height profile. */
export const BRIDGE = { span: 20, width: 3.6, rise: 0.45, base: 3.05 } as const;

/** Walk-surface height of the bridge deck at x. */
export function deckAt(x: number): number {
  const t = clamp((x + BRIDGE.span / 2) / BRIDGE.span, 0, 1);
  return BRIDGE.base + BRIDGE.rise * Math.sin(Math.PI * t);
}

/** Cliff line where the upper stream drops into the gorge. */
export const FALLS = { z: -29, top: 12.6, drop: 10.6 } as const;

/** Upper stream water level (above the waterfall). */
export const UPPER_WATER = FALLS.top;

/** Centre line of the river. */
export function riverX(z: number): number {
  return Math.sin(z * 0.05) * 2.4 + Math.sin(z * 0.13 + 1) * 0.5 - 0.42;
}

/** River half-width (widens into a plunge pool below the falls and downstream). */
export function riverHalfWidth(z: number): number {
  const pool = Math.exp(-Math.pow((z + 25.5) / 4, 2)) * 2.4;
  return 4.3 + Math.sin(z * 0.09) * 0.5 + Math.max(0, z - 8) * 0.12 + pool;
}

/** Rocks stamped into the riverbed so the water foams around them. */
export const RIVER_ROCKS: [number, number, number][] = [
  [-2.6, 6.5, 0.9], [2.4, 9.5, 0.7], [-0.8, 14, 1.1], [3.2, -6, 0.8], [-3.4, -10, 1.0],
  [1.5, -15, 0.7], [-5.2, -21, 1.2], [0.6, -23.5, 0.9], [-0.2, 4.2, 0.5], [3.8, 17.5, 0.9],
];

/** Terrain height at (x, z). Water level is y = 0 (and UPPER_WATER above the falls). */
export function heightAt(x: number, z: number): number {
  // Reason: the cliff line meanders (bays and buttresses), but stays straight where the water falls
  const nearFall = smoothstep(9, 4, Math.abs(x - riverX(FALLS.z)));
  const cliffZ = FALLS.z + (noise.noise(x * 0.09, 3.1) * 2.6 + noise.noise(x * 0.35, 8.7) * 0.7) * (1 - nearFall);
  const up = smoothstep(cliffZ + 1.6, cliffZ - 1.8, z);
  const rx = riverX(z);
  const w = riverHalfWidth(z) + noise.noise(z * 0.21, 7.3) * 0.45;
  const d = Math.abs(x - rx);

  // Plateau: gentle bumps, hills rising at the sides and far upstream
  const ax = Math.abs(x);
  let plateau = 3.0 + noise.fbm(x * 0.05, z * 0.05, 3) * 0.6;
  plateau += Math.max(0, ax - 16) * 0.12 + Math.max(0, ax - 34) * 0.3;
  plateau += Math.max(0, -z - 60) * 0.35;
  // Reason: the path leading onto the bridge must meet the deck ends exactly
  const path = smoothstep(4.2, 1.6, Math.abs(z)) * smoothstep(17, 9, ax);
  plateau = plateau * (1 - path) + (BRIDGE.base - 0.02) * path;

  const wallW = 2.6 + noise.noise(x * 0.3, z * 0.3) * 0.6;
  const bank = Math.pow(smoothstep(w, w + wallW, d), 0.8);
  const bedDepth = d < w ? -1.5 * (1 - Math.pow(d / w, 2)) : 0;
  const pool = Math.exp(-Math.pow((z + 25.5) / 3.5, 2) - Math.pow((x - riverX(-26)) / 4.5, 2)) * 1.4;
  const lower = bedDepth * (1 - bank) + plateau * bank - pool;
  // Upstream everything is lifted by the cliff height; the upper stream keeps its own shallow bed
  const upperBed = d < w ? FALLS.top - 0.2 - 0.6 * (1 - Math.pow(d / w, 2)) : FALLS.top - 0.2;
  const upper = upperBed * (1 - bank) + (plateau + FALLS.drop) * bank;
  let h = lower + (upper - lower) * up;
  // Craggy cliff face: bulges where the face is steepest
  h += noise.noise(x * 0.45, h * 0.3) * 0.9 * Math.sin(Math.PI * up) * (1 - nearFall * 0.7);

  for (const [rxk, rzk, r] of RIVER_ROCKS) {
    const rr = Math.hypot(x - (riverX(rzk) + rxk), z - rzk);
    if (rr < r * 1.6) h = Math.max(h, 0.35 * r * (1 - Math.pow(rr / (r * 1.6), 2)) * 2.0 - 0.3);
  }
  return h;
}

/** Baked heights for the water shader (bounds and a float texture). */
export interface HeightBake {
  texture: THREE.DataTexture;
  /** xMin, zMin, size (square). */
  bounds: THREE.Vector3;
}

export function bakeHeights(x0: number, z0: number, size: number, n = 256): HeightBake {
  const data = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      data[iz * n + ix] = heightAt(x0 + (ix / (n - 1)) * size, z0 + (iz / (n - 1)) * size);
    }
  }
  const texture = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.FloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, bounds: new THREE.Vector3(x0, z0, size) };
}

/** GLSL: sample the baked height at a world xz. */
export const HEIGHT_GLSL = /* glsl */ `
uniform sampler2D uHeight;
uniform vec3 uBounds;
float groundAt(vec2 xz) {
  vec2 uv = (xz - uBounds.xy) / uBounds.z;
  return texture2D(uHeight, uv).r;
}
`;

const COL = {
  grass: new THREE.Color("#5fae3a"),
  grassLight: new THREE.Color("#93cc4a"),
  grassDark: new THREE.Color("#3f8a2e"),
  dirt: new THREE.Color("#c4925e"),
  rockA: new THREE.Color("#a39b90"),
  rockB: new THREE.Color("#8a8076"),
  rockC: new THREE.Color("#bba48a"),
  moss: new THREE.Color("#6a9a3c"),
  pebble: new THREE.Color("#b9a98e"),
  bed: new THREE.Color("#b7a37c"),
};

/** Paint one terrain vertex from its height, slope and position. */
function terrainColor(x: number, y: number, z: number, ny: number, out: THREE.Color): THREE.Color {
  const n1 = noise.noise(x * 0.11, z * 0.11);
  const n2 = noise.noise(x * 0.5 + 9, z * 0.5);
  // Grass with sunny and shady patches
  out.copy(COL.grass).lerp(COL.grassLight, smoothstep(0.1, 0.7, n1) * 0.8).lerp(COL.grassDark, smoothstep(0.2, 0.8, -n1) * 0.6);
  out.multiplyScalar(0.93 + n2 * 0.07);
  // Dirt path onto the bridge
  const path = smoothstep(1.7, 0.9, Math.abs(z + Math.sin(x * 0.3) * 0.25 + n2 * 0.25)) * smoothstep(40, 30, Math.abs(x));
  out.lerp(COL.dirt, path * 0.9);
  // Layered rock on steep slopes: strata bands with mossy ledges
  const steep = smoothstep(0.82, 0.55, ny);
  if (steep > 0) {
    const band = Math.sin(y * 2.3 + n1 * 1.6) * 0.5 + 0.5;
    const rock = COL.rockA.clone().lerp(COL.rockB, smoothstep(0.35, 0.65, band)).lerp(COL.rockC, smoothstep(0.75, 0.95, band) * 0.7);
    rock.multiplyScalar(0.9 + n2 * 0.1);
    if (ny > 0.62) rock.lerp(COL.moss, 0.45);
    out.lerp(rock, steep);
  }
  // Wet pebbles at the waterline and the sandy riverbed
  const shore = smoothstep(0.7, 0.05, Math.abs(y - 0.1)) * (1 - steep * 0.5);
  out.lerp(COL.pebble, shore * 0.85);
  if (y < -0.05) out.copy(COL.bed).multiplyScalar(0.8 + n2 * 0.08);
  const upperShore = smoothstep(0.6, 0.05, Math.abs(y - (UPPER_WATER + 0.05)));
  out.lerp(COL.pebble, upperShore * 0.8 * (1 - steep));
  return out;
}

/**
 * Per-pixel layered rock on steep faces (vertex colours are too coarse for
 * thin strata): tan / grey / dark bands with crisp seams, vertical cracks and
 * moss on the ledges. Gentle slopes keep their painted vertex colours.
 */
const ROCK_GLSL = /* glsl */ `
#include <color_fragment>
{
  float ny = normalize(vWNrm).y;
  float steep = smoothstep(0.8, 0.55, ny);
  if (steep > 0.0) {
    vec2 q = vWPos.xz * 0.12;
    float warp = fbm3(q) * 1.4 + vnoise(vWPos.xz * 0.6) * 0.25;
    float b = fract(vWPos.y * 0.42 + warp);
    vec3 rock = b < 0.42 ? vec3(0.80, 0.69, 0.54) : b < 0.72 ? vec3(0.66, 0.62, 0.57) : b < 0.9 ? vec3(0.55, 0.50, 0.46) : vec3(0.74, 0.66, 0.57);
    float seam = smoothstep(0.035, 0.0, abs(b - 0.42)) + smoothstep(0.03, 0.0, abs(b - 0.72)) + smoothstep(0.03, 0.0, abs(b - 0.9)) + smoothstep(0.03, 0.0, b);
    rock *= 1.0 - clamp(seam, 0.0, 1.0) * 0.32;
    float crack = smoothstep(0.08, 0.0, abs(vnoise(vec2(vWPos.x * 1.3 + vWPos.z * 1.3, vWPos.y * 0.22)) - 0.5));
    rock *= 1.0 - crack * 0.28;
    rock *= 0.9 + vnoise(vWPos.xz * 2.0 + vWPos.y) * 0.18;
    rock = mix(rock, vec3(0.42, 0.62, 0.24), smoothstep(0.45, 0.7, ny) * 0.75);
    diffuseColor.rgb = mix(diffuseColor.rgb, rock * rock * 1.05, steep);
  }
}
`;

/** The ravine terrain as one lit, vertex-coloured mesh. */
export function createTerrain(x0: number, z0: number, w: number, d: number, step: number): THREE.Mesh {
  const nx = Math.round(w / step);
  const nz = Math.round(d / step);
  const geo = new THREE.PlaneGeometry(w, d, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(x0 + w / 2, 0, z0 + d / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    terrainColor(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getY(i), c);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n${NOISE_GLSL}`)
      .replace("#include <color_fragment>", ROCK_GLSL);
  };
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.userData.ownMaterial = true;
  return mesh;
}
