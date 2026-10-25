/**
 * Mountain island terrain: a steep stylised peak (crags, snow cap) rising out
 * of rolling green foothills, a sandy beach and a shallow sea floor. The
 * climbing path is carved into the slope so platforms never sink into rock.
 * Colours are painted per vertex (grass, rock, snow, sand) with noise.
 */

import * as THREE from "three";
import { Noise2D, smoothstep, clamp } from "../../core/noise";
import { coneH, Course, DEPTH } from "./course";

const noise = new Noise2D(808);
const SIZE = 270;
const SEGMENTS = 380;

/** Coastline radius at angle a (wobbly circle). */
function coastR(a: number): number {
  return 100 + noise.noise(Math.cos(a) * 1.3 + 4, Math.sin(a) * 1.3) * 9 + Math.sin(a * 3 + 1) * 4;
}

/** Terrain height before the path is carved (also used for the water depth texture). */
export function baseHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  // Cone with crags: ridged noise around the flanks, strongest mid-slope
  const crag = noise.ridged(a * 3.2 + 7, r * 0.09, 3) * 2.6 * smoothstep(8, 13, r) * smoothstep(34, 22, r);
  const cone = coneH(r) > 0 ? coneH(r) + crag - 1.2 : -Infinity;
  // Rolling foothills that fall towards the beach
  const hills = noise.fbm(x * 0.025, z * 0.025, 3) * 1.6 + noise.noise(x * 0.08, z * 0.08) * 0.35;
  // Reason: keep the ground right outside the cone low and smooth so it never hides the first ledges
  const foot = 1.3 + 3.6 * smoothstep(84, 24, r) + hills * smoothstep(92, 62, r) * smoothstep(38, 56, r);
  let h = Math.max(cone, foot);
  // Beach and sea floor
  const rc = coastR(a);
  const beach = smoothstep(rc - 16, rc - 2, r);
  h = THREE.MathUtils.lerp(h, 0.35, beach);
  if (r > rc - 2) h -= (r - rc + 2) * 0.45;
  return Math.max(h, -9);
}

/** Heights of the terrain grid with the path carved in (row = z, column = x), and before carving. */
function carvedGrid(course: Course): { h: Float32Array; base: Float32Array } {
  const n = SEGMENTS + 1;
  const cell = SIZE / SEGMENTS;
  const half = SIZE / 2;
  const h = new Float32Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) h[r * n + c] = baseHeight(-half + c * cell, -half + r * cell);
  }
  const base = h.slice();
  // Reason: stamp the path's footprint into the grid — below each platform top the slope may
  // rise only behind the platform (as a wall), never under or in front of it
  const p = new THREE.Vector3();
  for (let s = -2; s <= course.length + 2; s += 0.3) {
    const top = course.nominalY(s);
    const rc = course.radius(top);
    // Reason: over a gap carve a deep, narrow notch so it reads as a crevasse to jump over
    const gap = s > 0 && s < course.length && course.support(s, 0) === -Infinity;
    const reach = gap ? DEPTH / 2 + 0.3 : DEPTH / 2 + 1.4;
    const drop = gap ? 4.5 : 0.35;
    course.point(s, rc, top, p);
    const c0 = Math.floor((p.x - reach + half) / cell);
    const c1 = Math.ceil((p.x + reach + half) / cell);
    const r0 = Math.floor((p.z - reach + half) / cell);
    const r1 = Math.ceil((p.z + reach + half) / cell);
    for (let r = Math.max(r0, 0); r <= Math.min(r1, n - 1); r++) {
      for (let c = Math.max(c0, 0); c <= Math.min(c1, n - 1); c++) {
        const x = -half + c * cell;
        const z = -half + r * cell;
        if ((x - p.x) ** 2 + (z - p.z) ** 2 > reach * reach) continue;
        const dr = Math.hypot(x, z) - rc;
        const inner = -DEPTH / 2 + 0.2;
        const limit = top - drop + (dr < inner ? (inner - dr) * 2.2 : 0);
        const i = r * n + c;
        if (h[i] > limit) h[i] = limit;
      }
    }
  }
  return { h, base };
}

const C = {
  grass: new THREE.Color("#5cb83a"),
  grassLight: new THREE.Color("#8fd14a"),
  grassDark: new THREE.Color("#3f8f2e"),
  rock: new THREE.Color("#867f8c"),
  rockLight: new THREE.Color("#aca39b"),
  rockDark: new THREE.Color("#4e4a5e"),
  rockWarm: new THREE.Color("#a3907f"),
  snow: new THREE.Color("#f4f8ff"),
  snowShade: new THREE.Color("#c4d6f2"),
  sand: new THREE.Color("#f0d9a0"),
  sandWet: new THREE.Color("#c9ad74"),
  seabed: new THREE.Color("#d8c48c"),
};

/** Terrain colour from height, steepness (normal.y) and position. */
function colorAt(x: number, y: number, z: number, ny: number, out: THREE.Color): THREE.Color {
  const n1 = noise.fbm(x * 0.07, z * 0.07, 2);
  const n2 = noise.noise(x * 0.6 + 3, z * 0.6 - y * 0.3);
  // Grass with light and dark patches
  out.copy(C.grassDark).lerp(C.grass, smoothstep(-0.4, 0.3, n1));
  out.lerp(C.grassLight, smoothstep(0.25, 0.7, noise.noise(x * 0.03 + 9, z * 0.03)) * 0.5);
  // Rock on steep ground and higher up
  const rocky = clamp(smoothstep(0.8, 0.55, ny) + smoothstep(14, 22, y + n1 * 4), 0, 1);
  // Layered rock strata: crisp, gently tilted bands of warm, light and cool stone
  const band = (y * 0.36 + n1 * 0.6 + Math.sin(x * 0.05 + z * 0.04) * 0.4 + 10) % 1;
  const rock = C.rock.clone();
  rock.lerp(C.rockLight, smoothstep(0.3, 0.38, band) - smoothstep(0.55, 0.63, band));
  rock.lerp(C.rockWarm, (smoothstep(0.7, 0.76, band) - smoothstep(0.88, 0.94, band)) * 0.7);
  // Reason: steep faces darken, so crags read against the snow and the sunny ledges
  rock.lerp(C.rockDark, smoothstep(0.55, 0.15, ny) * 0.55).multiplyScalar(0.95 + n2 * 0.08);
  out.lerp(rock, rocky);
  // Snow cap: settles on flatter spots above the snow line and covers all but sheer faces near the top
  const snowLine = 26 + n1 * 5;
  const lie = Math.max(smoothstep(0.42, 0.6, ny), smoothstep(38, 44, y) * smoothstep(0.15, 0.35, ny));
  const snow = smoothstep(snowLine, snowLine + 2, y) * lie;
  out.lerp(C.snowShade.clone().lerp(C.snow, smoothstep(0.5, 0.85, ny)), snow);
  // Beach sand and the sea floor
  const sandy = smoothstep(1.6, 0.9, y + n2 * 0.25);
  out.lerp(y < 0.3 ? C.sandWet : C.sand, sandy);
  if (y < -0.3) out.copy(C.seabed).multiplyScalar(0.85 + n2 * 0.1);
  return out.multiplyScalar(0.94 + n2 * 0.08);
}

export interface Terrain {
  mesh: THREE.Mesh;
  /** Carved terrain height at (x, z) (bilinear over the grid). */
  height(x: number, z: number): number;
}

export function createTerrain(course: Course): Terrain {
  const { h: grid, base } = carvedGrid(course);
  const n = SEGMENTS + 1;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // Reason: after rotateX(-90°) plane row r runs along z = -half + r * cell, matching the grid
  for (let i = 0; i < pos.count; i++) pos.setY(i, grid[i]);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    colorAt(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getY(i), c);
    // Reason: shade the carved crevices under gaps so they read as deep and dark
    c.multiplyScalar(1 - smoothstep(1, 4, base[i] - grid[i]) * 0.5);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = "mountain-terrain";

  const cell = SIZE / SEGMENTS;
  const half = SIZE / 2;
  const height = (x: number, z: number): number => {
    const fx = clamp((x + half) / cell, 0, SEGMENTS - 0.001);
    const fz = clamp((z + half) / cell, 0, SEGMENTS - 0.001);
    const c0 = Math.floor(fx);
    const r0 = Math.floor(fz);
    const tx = fx - c0;
    const tz = fz - r0;
    const a = grid[r0 * n + c0] + (grid[r0 * n + c0 + 1] - grid[r0 * n + c0]) * tx;
    const b = grid[(r0 + 1) * n + c0] + (grid[(r0 + 1) * n + c0 + 1] - grid[(r0 + 1) * n + c0]) * tx;
    return a + (b - a) * tz;
  };
  return { mesh, height };
}
