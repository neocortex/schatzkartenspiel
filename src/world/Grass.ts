/**
 * GPU grass and flower fields. A fixed set of blades lives in a square window
 * that follows the camera; each blade wraps to the window cell nearest the
 * focus point, reads terrain height + grass density from the heightfield
 * textures, sways in the wind and bends away from the player.
 */

import * as THREE from "three";
import { HF_GLSL } from "./Heightfield";
import { NOISE_GLSL, UNFLIPPED_NORMAL_GLSL } from "../core/glsl";
import { GRASS_COLOR_GLSL, PALETTE_DECLS, PALETTE_UNIFORMS, WorldUniforms } from "./Terrain";
import { mulberry32 } from "../core/noise";

const WINDOW = 74;

interface FieldUniforms {
  uCenter: { value: THREE.Vector2 };
  uPlayer: { value: THREE.Vector3 };
  uWindow: { value: number };
}

/** Shared vertex logic: place an instance in the moving window and compute wind. */
const FIELD_VERTEX_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uCenter;
uniform vec3 uPlayer;
uniform float uWindow;
attribute vec4 aOffset;  // xy = position in window, z = random, w = density threshold
attribute vec4 aParams;  // x = scale, y = rotation, z = lean, w = tint
varying float vT;
varying vec2 vXZ;
varying float vTint;
${HF_GLSL}
${NOISE_GLSL}

vec2 fieldXZ() {
  return aOffset.xy + uWindow * floor((uCenter - aOffset.xy) / uWindow + 0.5);
}
float fieldScale(vec2 xz) {
  float density = hfMask(xz).a;
#ifdef PATCHY
  // Flowers grow in patches, and in whole fields on the flower hills
  density *= max(smoothstep(0.45, 0.72, fbm3(xz * 0.045 + 11.0)), hfRegion(xz).a * 0.85);
#endif
  float edge = 1.0 - smoothstep(uWindow * 0.34, uWindow * 0.5, length(xz - uCenter));
  return aParams.x * step(aOffset.w, density) * edge * smoothstep(0.0, 0.85, density);
}
vec2 windBend(vec2 xz, float t) {
  float gust = fbm3(xz * 0.04 + vec2(uTime * 0.35, uTime * 0.12));
  float w = sin(uTime * 2.1 + xz.x * 0.35 + xz.y * 0.2 + aOffset.z * 6.28) * 0.25 + gust * 0.9;
  vec2 bend = vec2(0.8, 0.35) * w * 0.55;
  vec2 away = xz - uPlayer.xz;
  float d = length(away);
  bend += (away / max(d, 0.001)) * smoothstep(1.3, 0.2, d) * 0.9 * step(abs(uPlayer.y - hfHeight(xz)), 1.5);
  return bend * t * t;
}
`;

function createField(
  geometry: THREE.BufferGeometry,
  count: number,
  seed: number,
  world: WorldUniforms,
  field: FieldUniforms,
  configure: (rand: () => number, offsets: Float32Array, params: Float32Array, i: number) => void,
  fragmentColor: string,
  patchy = false,
): THREE.Mesh {
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = geometry.index;
  geo.setAttribute("position", geometry.attributes.position);
  geo.setAttribute("normal", geometry.attributes.normal);
  geo.setAttribute("uv", geometry.attributes.uv);
  if (geometry.attributes.color) geo.setAttribute("color", geometry.attributes.color);

  const rand = mulberry32(seed);
  const offsets = new Float32Array(count * 4);
  const params = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) configure(rand, offsets, params, i);
  geo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 4));
  geo.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 4));
  geo.instanceCount = count;

  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
    vertexColors: !!geometry.attributes.color,
  });
  if (patchy) mat.defines = { PATCHY: "" };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, world, field, PALETTE_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${FIELD_VERTEX_GLSL}`)
      .replace(
        "#include <beginnormal_vertex>",
        `vec3 objectNormal = normalize(vec3(normal.x * 0.35, 1.0, normal.z * 0.35));`,
      )
      .replace(
        "#include <begin_vertex>",
        `
        vec2 xz = fieldXZ();
        float s = fieldScale(xz);
        float t = uv.y;
        float c = cos(aParams.y), sn = sin(aParams.y);
        vec3 p = position * s;
        p.xz = mat2(c, -sn, sn, c) * p.xz;
        vec2 bend = windBend(xz, t) * s + vec2(aParams.z) * t * s;
        p.xz += bend;
        p.y *= 1.0 - 0.25 * min(length(bend), 1.0);
        vec3 transformed = vec3(xz.x, hfHeight(xz), xz.y) + p;
        vT = t;
        vXZ = xz;
        vTint = aParams.w;
        `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        ${PALETTE_DECLS}
        varying float vT;
        varying vec2 vXZ;
        varying float vTint;
        ${HF_GLSL}
        ${NOISE_GLSL}
        ${GRASS_COLOR_GLSL}`,
      )
      .replace("#include <color_fragment>", fragmentColor)
      .replace("#include <normal_fragment_begin>", UNFLIPPED_NORMAL_GLSL);
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return mesh;
}

/** A single tapered grass blade, 1 unit tall, uv.y = 0 at root → 1 at tip. */
function bladeGeometry(): THREE.BufferGeometry {
  const w = [0.075, 0.062, 0.04, 0];
  const y = [0, 0.38, 0.72, 1];
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < 3; i++) {
    pos.push(-w[i], y[i], 0, w[i], y[i], 0);
    uv.push(0, y[i], 1, y[i]);
  }
  pos.push(0, 1, 0);
  uv.push(0.5, 1);
  const idx = [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Tiny flower: stem + a five-petal star with a yellow centre (colour via vertex colours). */
function flowerGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const push = (x: number, y: number, z: number, v: number, c: number) => {
    pos.push(x, y, z);
    uv.push(0.5, v);
    col.push(c, c, c);
    return pos.length / 3 - 1;
  };
  // Stem (thin quad), colour channel 0 marks "stem"
  const s0 = push(-0.012, 0, 0, 0, 0);
  const s1 = push(0.012, 0, 0, 0, 0);
  const s2 = push(-0.01, 0.5, 0, 0.9, 0);
  const s3 = push(0.01, 0.5, 0, 0.9, 0);
  idx.push(s0, s1, s2, s2, s1, s3);
  // Petals: channel 1, centre: channel 0.5
  const centre = push(0, 0.53, 0, 1, 0.5);
  const petals = 5;
  for (let i = 0; i < petals; i++) {
    const a0 = (i / petals) * Math.PI * 2;
    const a1 = a0 + Math.PI / petals;
    const a2 = a0 + (Math.PI * 2) / petals;
    const r = 0.2;
    const p0 = push(Math.cos(a0) * r * 0.4, 0.52, Math.sin(a0) * r * 0.4, 1, 1);
    const p1 = push(Math.cos(a1) * r, 0.5, Math.sin(a1) * r, 1, 1);
    const p2 = push(Math.cos(a2) * r * 0.4, 0.52, Math.sin(a2) * r * 0.4, 1, 1);
    idx.push(centre, p0, p1, centre, p1, p2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const GRASS_FRAG = /* glsl */ `
  vec4 gm = hfMask(vXZ);
  vec3 base = grassColor(vXZ, gm.g, hfRegion(vXZ));
  vec3 tip = mix(base * 1.35 + vec3(0.04, 0.05, 0.0), uC_grassLight * 1.1, 0.35 + vTint * 0.3);
  // Occasional dry, golden blades
  tip = mix(tip, vec3(0.75, 0.62, 0.22), step(0.93, vTint) * 0.6);
  vec3 g = mix(base * 0.72, tip, smoothstep(0.0, 1.0, vT));
  float cloud = smoothstep(0.52, 0.72, fbm3(vXZ * 0.012 + vec2(uTime * 0.012, uTime * 0.006)));
  diffuseColor.rgb = g * (1.0 - cloud * 0.28);
`;

const FLOWER_FRAG = /* glsl */ `
  vec3 petal = vTint < 0.25 ? vec3(1.0, 0.97, 0.92)
             : vTint < 0.45 ? vec3(1.0, 0.82, 0.15)
             : vTint < 0.65 ? vec3(1.0, 0.45, 0.65)
             : vTint < 0.82 ? vec3(0.62, 0.42, 1.0)
             : vec3(1.0, 0.3, 0.22);
  vec3 stem = vec3(0.18, 0.45, 0.12);
  vec3 centreCol = vec3(1.0, 0.78, 0.1);
  float part = vColor.r;
  diffuseColor.rgb = part < 0.25 ? stem : part < 0.75 ? centreCol : petal;
`;

export class GrassField {
  readonly group = new THREE.Group();
  private field: FieldUniforms = {
    uCenter: { value: new THREE.Vector2() },
    uPlayer: { value: new THREE.Vector3(9999, 0, 9999) },
    uWindow: { value: WINDOW },
  };

  constructor(world: WorldUniforms, bladeCount = 115000, flowerCount = 5200) {
    const grass = createField(
      bladeGeometry(),
      bladeCount,
      42,
      world,
      this.field,
      (rand, o, p, i) => {
        o.set([(rand() - 0.5) * WINDOW, (rand() - 0.5) * WINDOW, rand(), rand() * 0.95], i * 4);
        p.set([0.4 + rand() * rand() * 0.75, rand() * Math.PI * 2, (rand() - 0.5) * 0.25, rand()], i * 4);
      },
      GRASS_FRAG,
    );
    grass.name = "grass";

    const flowers = createField(
      flowerGeometry(),
      flowerCount,
      99,
      world,
      this.field,
      (rand, o, p, i) => {
        o.set([(rand() - 0.5) * WINDOW, (rand() - 0.5) * WINDOW, rand(), 0.55 + rand() * 0.4], i * 4);
        p.set([0.8 + rand() * 0.6, rand() * Math.PI * 2, (rand() - 0.5) * 0.1, rand()], i * 4);
      },
      FLOWER_FRAG,
      true,
    );
    flowers.name = "flowers";
    this.group.add(grass, flowers);
  }

  /** Centre the field on what the camera looks at and tell it where the player is. */
  update(focus: THREE.Vector3, player: THREE.Vector3 | null): void {
    this.field.uCenter.value.set(focus.x, focus.z);
    if (player) this.field.uPlayer.value.copy(player);
  }
}
