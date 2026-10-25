/**
 * Terrain mesh: the heightfield as a lit, shadowed mesh whose colours are
 * painted in the fragment shader (grass patches, sand, wet sand, dirt paths,
 * rock on cliffs, snow, volcanic ash, underwater caustics, cloud shadows).
 */

import * as THREE from "three";
import { Heightfield, HF_N, HF_GLSL } from "./Heightfield";
import { WORLD_SIZE } from "./layout";
import { NOISE_GLSL } from "../core/glsl";

export const TERRAIN_COLORS = {
  grass: new THREE.Color("#5fae3a"),
  grassDark: new THREE.Color("#3d8a2e"),
  grassLight: new THREE.Color("#a6cf4c"),
  forest: new THREE.Color("#2c6b3c"),
  sand: new THREE.Color("#f3dcaa"),
  sandWet: new THREE.Color("#c7a874"),
  dirt: new THREE.Color("#c4925e"),
  dirtDark: new THREE.Color("#94673f"),
  rock: new THREE.Color("#9a8f84"),
  rockDark: new THREE.Color("#5f5853"),
  snow: new THREE.Color("#f5f9ff"),
  ash: new THREE.Color("#3d3438"),
  ashLight: new THREE.Color("#6a5a55"),
  lava: new THREE.Color("#ff5a1a"),
};

/** Uniforms shared by every shader that reads the heightfield or animates with time. */
export interface WorldUniforms {
  uTime: { value: number };
  uHeightTex: { value: THREE.Texture };
  uMaskTex: { value: THREE.Texture };
  uSunDir: { value: THREE.Vector3 };
}

export function createTerrain(hf: Heightfield, world: WorldUniforms): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, HF_N - 1, HF_N - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // Reason: after rotateX(-90°) the plane's row r maps to z = -HALF + r * cell,
  // matching the heightfield grid index exactly, so heights copy 1:1.
  for (let i = 0; i < pos.count; i++) pos.setY(i, hf.heights[i]);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, world, PALETTE_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNormal;`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform vec3 uSunDir;
        ${PALETTE_DECLS}
        varying vec3 vWPos;
        varying vec3 vWNormal;
        ${HF_GLSL}
        ${NOISE_GLSL}
        ${GRASS_COLOR_GLSL}`,
      )
      .replace("#include <color_fragment>", TERRAIN_COLOR_GLSL)
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += terrainEmissive;`,
      );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = "terrain";
  return mesh;
}

/** Grass colour at a world position — shared by the terrain and the grass blades so they blend. */
export const GRASS_COLOR_GLSL = /* glsl */ `
vec3 grassColor(vec2 xz, float forest) {
  float a = fbm3(xz * 0.12);
  vec3 g = mix(uC_grassDark, uC_grass, smoothstep(0.25, 0.7, a));
  g = mix(g, uC_grassLight, smoothstep(0.55, 0.85, fbm3(xz * 0.035 + 3.0)) * 0.55);
  g *= 0.9 + 0.2 * vnoise(xz * 1.1);
  return mix(g, uC_forest * (0.85 + 0.3 * vnoise(xz * 0.7)), forest * 0.85);
}
`;

/** Uniform declarations for the terrain palette (uC_grass, uC_sand, ...). */
export const PALETTE_DECLS = Object.keys(TERRAIN_COLORS)
  .map((k) => `uniform vec3 uC_${k};`)
  .join("\n");

/** Uniform values for the terrain palette, keyed like PALETTE_DECLS. */
export const PALETTE_UNIFORMS: Record<string, { value: THREE.Color }> = Object.fromEntries(
  Object.entries(TERRAIN_COLORS).map(([k, c]) => [`uC_${k}`, { value: c }]),
);

const TERRAIN_COLOR_GLSL = /* glsl */ `
  vec2 xz = vWPos.xz;
  float h = vWPos.y;
  vec4 m = hfMask(xz);
  float slope = 1.0 - clamp(vWNormal.y, 0.0, 1.0);
  float n1 = fbm3(xz * 0.12);
  float n2 = vnoise(xz * 1.1);
  float n3 = vnoise(xz * 4.3);

  vec3 grass = grassColor(xz, m.g);

  // Beach sand: dry above, darker wet band right at the waterline
  float sandLine = 1.05 + (n1 - 0.5) * 0.7;
  float sandW = 1.0 - smoothstep(sandLine - 0.2, sandLine + 0.2, h);
  vec3 sand = mix(uC_sandWet, uC_sand, smoothstep(0.0, 0.45, h)) * (0.94 + 0.12 * n3);
  vec3 col = mix(grass, sand, sandW);

  // Dirt paths with pebbly variation
  float pathW = smoothstep(0.47, 0.53, m.r + (vnoise(xz * 0.9) - 0.5) * 0.18 + (n3 - 0.5) * 0.06);
  float pathEdge = smoothstep(0.38, 0.5, m.r) * (1.0 - pathW);
  vec3 dirt = mix(uC_dirtDark, uC_dirt, smoothstep(0.2, 0.8, n2)) * (0.9 + 0.2 * n3);
  col = mix(col, col * 0.82, pathEdge * 0.6);
  col = mix(col, dirt, pathW);

  // Volcanic ash
  vec3 ash = mix(uC_ash, uC_ashLight, n2 * 0.7 + n3 * 0.3);
  col = mix(col, ash, m.b);

  // Rock on steep slopes, with horizontal strata
  float rockW = smoothstep(0.3, 0.48, slope + (n2 - 0.5) * 0.2);
  vec3 rock = mix(uC_rockDark, uC_rock, smoothstep(0.2, 0.8, n1)) * (0.85 + 0.3 * n3);
  rock *= 0.88 + 0.12 * sin(h * 2.6 + n1 * 5.0);
  rock = mix(rock, ash * 1.1, m.b);
  col = mix(col, rock, rockW);

  // Snow on high, flatter ground
  float snowLine = 29.0 + (n1 - 0.5) * 8.0;
  float snowW = smoothstep(snowLine - 1.0, snowLine + 1.5, h) * (1.0 - smoothstep(0.55, 0.85, slope));
  col = mix(col, uC_snow, snowW);

  // Underwater: tint towards teal and fade with depth
  float depth = -h;
  col = mix(col, col * vec3(0.55, 0.85, 0.9), smoothstep(-0.1, 1.5, depth));
  col *= mix(1.0, 0.45, smoothstep(1.0, 8.0, depth));

  // Drifting cloud shadows
  float cloud = smoothstep(0.52, 0.72, fbm3(xz * 0.012 + vec2(uTime * 0.012, uTime * 0.006)));
  col *= 1.0 - cloud * 0.28;

  diffuseColor.rgb = col;

  // Emissive: caustics in shallow water + glowing cracks near the crater
  vec3 terrainEmissive = vec3(0.0);
  float caus = caustics(xz * 0.55, uTime) * smoothstep(-0.05, 0.4, depth) * smoothstep(3.5, 0.8, depth);
  terrainEmissive += vec3(0.75, 0.95, 1.0) * caus * 0.55;
  float cracks = smoothstep(0.035, 0.0, abs(vnoise(xz * 0.9) - 0.5)) * smoothstep(17.0, 24.0, h) * m.b;
  terrainEmissive += uC_lava * cracks * (2.5 + sin(uTime * 2.0 + xz.x) * 0.8);
`;
