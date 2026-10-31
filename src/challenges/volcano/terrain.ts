/**
 * Volcano terrain mesh: one grid with fine spacing around the trail and the
 * cone and coarse spacing out at the horizon. Colours are painted per vertex
 * (warm ash trail, dark basalt, scorched banks, sulfur, black beach, green
 * goal meadow); the shader adds fine grain and glowing, pulsing lava cracks.
 */

import * as THREE from "three";
import { Course, RIVER_HALF, VOLCANO } from "./course";
import { Noise2D, smoothstep } from "../../core/noise";
import { NOISE_GLSL } from "../../core/glsl";
import { WorldUniforms } from "../../world/Terrain";

const C = {
  basaltDark: new THREE.Color("#3a3036"),
  basalt: new THREE.Color("#544650"),
  basaltLight: new THREE.Color("#706068"),
  ash: new THREE.Color("#93868b"),
  trail: new THREE.Color("#c19c74"),
  trailLight: new THREE.Color("#d8b98f"),
  trailEdge: new THREE.Color("#8f705a"),
  scorch: new THREE.Color("#743524"),
  sulfur: new THREE.Color("#e8d04a"),
  beach: new THREE.Color("#3a3337"),
  beachWet: new THREE.Color("#2a2427"),
  grass: new THREE.Color("#6fc246"),
  grassLight: new THREE.Color("#a3da5c"),
  grassDark: new THREE.Color("#4c9a35"),
  dryGrass: new THREE.Color("#b9b25c"),
  rim: new THREE.Color("#9c6a5c"),
  crater: new THREE.Color("#4a1f1a"),
};

/** Grid line coordinates from `bands`: each [start, step] runs until the next band's start (last until `end`). */
function lines(bands: [number, number][], end: number): number[] {
  const out: number[] = [];
  bands.forEach(([start, step], i) => {
    const stop = i + 1 < bands.length ? bands[i + 1][0] : end + 1e-6;
    for (let v = start; v < stop; v += step) out.push(v);
  });
  return out;
}

const grain = new Noise2D(77);

export function createTerrain(course: Course, world: WorldUniforms, cool: { value: number }): { mesh: THREE.Mesh; material: THREE.Material } {
  // Reason: fine spacing on the playable strip, medium on the cone, coarse out at the horizon
  const xs = lines([[-200, 4], [-152, 1.2], [-66, 0.55], [50, 4]], 160);
  const zs = lines([[-210, 4], [-160, 1.2], [-90, 0.55], [72, 4]], 150);
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const lava = new Float32Array(nx * nz * 2);
  const h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = course.terrain(xs[i], zs[j]);

  const c = new THREE.Color();
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = xs[i];
      const z = zs[j];
      const y = h[k];
      pos.set([x, y, z], k * 3);
      // Slope from neighbouring heights
      const hx = h[j * nx + Math.min(i + 1, nx - 1)] - h[j * nx + Math.max(i - 1, 0)];
      const hz = h[Math.min(j + 1, nz - 1) * nx + i] - h[Math.max(j - 1, 0) * nx + i];
      const dx = xs[Math.min(i + 1, nx - 1)] - xs[Math.max(i - 1, 0)];
      const dz = zs[Math.min(j + 1, nz - 1)] - zs[Math.max(j - 1, 0)];
      const slope = Math.hypot(hx / dx, hz / dz);
      const [heat, crack] = paint(course, x, z, y, slope, c);
      col.set([c.r, c.g, c.b], k * 3);
      lava.set([heat, crack], k * 2);
    }
  }

  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aLava", new THREE.BufferAttribute(lava, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const material = terrainMaterial(world, cool);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = "volcano-terrain";
  return { mesh, material };
}

/** Vertex colour into `out`; returns [heat, crack] for the glow shader. */
function paint(course: Course, x: number, z: number, y: number, slope: number, out: THREE.Color): [number, number] {
  const n1 = grain.fbm(x * 0.09, z * 0.09, 3) * 0.5 + 0.5;
  const n2 = grain.noise(x * 0.5 + 9, z * 0.5);
  const td = course.trailDist(x, z);
  const s = course.trailS(x, z);
  const w = course.halfWidth(s);
  const rd = course.riverDist(x, z);
  const vr = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);

  // Basalt base with lighter ash drifts on flat ground
  out.copy(C.basaltDark).lerp(C.basalt, smoothstep(0.25, 0.65, n1));
  out.lerp(C.ash, smoothstep(0.55, 0.85, n1) * (1 - smoothstep(0.3, 0.9, slope)) * 0.7);
  out.lerp(C.basaltLight, smoothstep(0.5, 1.4, slope) * 0.5);

  // Volcano cone: ash-grey flanks, reddish rim, dark scorched crater
  const cone = 1 - smoothstep(VOLCANO.base * 0.55, VOLCANO.base, vr);
  out.lerp(C.ash, cone * smoothstep(8, 30, y) * 0.55);
  out.lerp(C.rim, Math.exp(-(((vr - VOLCANO.crater) / 4) ** 2)) * 0.8);
  if (vr < VOLCANO.crater) out.lerp(C.crater, smoothstep(VOLCANO.crater, VOLCANO.crater - 4, vr));

  // Sulfur crusts sprinkled on the ash fields
  const sulfur = smoothstep(0.7, 0.85, grain.noise(x * 0.07 + 31, z * 0.07 - 5)) * smoothstep(w + 3, w + 6, td) * smoothstep(0.1, 0.6, n2 + 0.5);
  out.lerp(C.sulfur, sulfur * 0.55);

  // Black sand beach near sea level
  const beach = 1 - smoothstep(0.6, 1.6, y + n2 * 0.25);
  out.lerp(C.beach, beach);
  out.lerp(C.beachWet, 1 - smoothstep(0.0, 0.35, y));

  // Warm walkable trail with a darker pebbly rim
  const edge = w + n2 * 0.35;
  const onTrail = 1 - smoothstep(edge - 0.5, edge + 0.3, td);
  const rim = (1 - smoothstep(edge + 0.2, edge + 1.4, td)) * (1 - onTrail);
  out.lerp(C.trailEdge, rim * 0.8);
  const trail = C.trail.clone().lerp(C.trailLight, smoothstep(0.3, 0.8, n1));
  out.lerp(trail, onTrail);

  // Scorched banks along the lava
  const heat = 1 - smoothstep(RIVER_HALF - 0.2, RIVER_HALF + 4.5, rd);
  out.lerp(C.scorch, heat * 0.85);

  // Green goal meadow at the north end, dry grass at the start
  const goal = smoothstep(course.goalS - 7, course.goalS + 1, s) * (1 - smoothstep(18, 30, td));
  const north = smoothstep(-70, -86, z) * (1 - cone);
  const green = Math.max(goal, north) * (1 - beach);
  const g = C.grassDark.clone().lerp(C.grass, smoothstep(0.3, 0.6, n1)).lerp(C.grassLight, smoothstep(0.65, 0.9, n1) * 0.6);
  out.lerp(g, green);
  const dry = smoothstep(52, 64, z) * (1 - onTrail) * (1 - beach) * smoothstep(0.3, 0.6, n1);
  out.lerp(C.dryGrass, dry * 0.7);

  // Glowing cracks: off the trail, strongest near lava and on the cone foot
  const crack = Math.max(heat * 0.9, smoothstep(0.55, 0.85, 1 - n1) * 0.55, cone * 0.4) * (1 - onTrail) * (1 - green) * (1 - beach);
  return [heat * (1 - onTrail * 0.6), crack];
}

const TERRAIN_GLSL = /* glsl */ `
uniform float uTime;
uniform float uCool;
varying vec3 vWPos;
varying vec2 vLava;
${NOISE_GLSL}
// Distance to the nearest Voronoi cell edge (thin lines = lava cracks)
float crackDist(vec2 p) {
  vec2 g = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 h = hash22(g + o);
      float d = length(o + h - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}
`;

function terrainMaterial(world: WorldUniforms, cool: { value: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = world.uTime;
    shader.uniforms.uCool = cool;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aLava;\nvarying vec3 vWPos;\nvarying vec2 vLava;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvLava = aLava;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${TERRAIN_GLSL}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 xz = vWPos.xz;
        // Fine grain and pebble speckles so close-ups don't look plastic
        float gr = vnoise(xz * 1.9) * 0.6 + vnoise(xz * 5.3) * 0.4;
        diffuseColor.rgb *= 0.86 + 0.26 * gr;
        float peb = smoothstep(0.82, 0.9, vnoise(xz * 7.0 + 3.1));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.35, peb * 0.6);
        // Lava cracks: warped Voronoi edges, wider and hotter near the rivers
        vec2 cp = xz * 0.42 + vec2(fbm3(xz * 0.2), fbm3(xz * 0.2 + 7.0)) * 1.3;
        float cd = crackDist(cp);
        float width = 0.03 + vLava.x * 0.07;
        float crack = smoothstep(width, width * 0.25, cd) * vLava.y;
        float pulse = 0.65 + 0.35 * sin(uTime * 1.8 + xz.x * 0.3 + xz.y * 0.2);
        vec3 crackCol = mix(vec3(2.8, 0.55, 0.08), vec3(4.5, 2.2, 0.5), smoothstep(0.4, 1.0, vLava.x));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.03, 0.02), crack * 0.6);
        vec3 lavaGlow = crackCol * crack * pulse + vec3(0.9, 0.18, 0.03) * vLava.x * vLava.x * (0.75 + 0.25 * pulse);`,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += lavaGlow * (1.0 - 0.8 * uCool);");
  };
  return mat;
}
