/**
 * Procedural island heightfield. Generates terrain heights plus biome masks
 * (paths, forest, volcanic ash, grass density) on a regular grid, exposes
 * them as GPU textures for the shaders, and answers height / walkability
 * queries for gameplay.
 */

import * as THREE from "three";
import { Noise2D, smoothstep, lerp, clamp } from "../core/noise";
import { ISLAND, LANDMARKS, PATHS, RIVER, VILLAGE, WORLD_HALF, WORLD_SIZE, P2 } from "./layout";

/** Samples per side. Grid spacing = WORLD_SIZE / (N - 1). */
export const HF_N = 513;
const CELL = WORLD_SIZE / (HF_N - 1);

/** Deepest water the player can wade through. */
const MAX_WADE_DEPTH = 0.45;
const MAX_WALK_SLOPE = 0.8;

const dist2 = (x: number, z: number, p: P2): number => Math.hypot(x - p[0], z - p[1]);

export class Heightfield {
  readonly heights = new Float32Array(HF_N * HF_N);
  /** RGBA: path, forest, ash, grass density (0-255). */
  readonly masks = new Uint8Array(HF_N * HF_N * 4);
  readonly slopes = new Float32Array(HF_N * HF_N);
  private walkable = new Uint8Array(HF_N * HF_N);
  private noise = new Noise2D(1337);
  private pathDist = new Float32Array(HF_N * HF_N).fill(99);
  private riverDist = new Float32Array(HF_N * HF_N).fill(99);

  heightTexture!: THREE.DataTexture;
  maskTexture!: THREE.DataTexture;

  constructor() {
    this.stampDistances(PATHS, this.pathDist, 6);
    this.stampDistances([RIVER], this.riverDist, 10);
    this.computeHeights();
    this.computeSlopesAndMasks();
    this.createTextures();
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Bilinear terrain height at a world position. */
  heightAt(x: number, z: number): number {
    const gx = clamp((x + WORLD_HALF) / CELL, 0, HF_N - 1.001);
    const gz = clamp((z + WORLD_HALF) / CELL, 0, HF_N - 1.001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const i = iz * HF_N + ix;
    const h = this.heights;
    const a = lerp(h[i], h[i + 1], fx);
    const b = lerp(h[i + HF_N], h[i + HF_N + 1], fx);
    return lerp(a, b, fz);
  }

  /** Whether terrain alone allows walking here (props are checked separately). */
  isWalkable(x: number, z: number): boolean {
    const ix = Math.round((x + WORLD_HALF) / CELL);
    const iz = Math.round((z + WORLD_HALF) / CELL);
    if (ix < 0 || iz < 0 || ix >= HF_N || iz >= HF_N) return false;
    return this.walkable[iz * HF_N + ix] === 1;
  }

  /** Mask channel value in [0, 1] (0 path, 1 forest, 2 ash, 3 grass). */
  maskAt(x: number, z: number, channel: 0 | 1 | 2 | 3): number {
    const ix = clamp(Math.round((x + WORLD_HALF) / CELL), 0, HF_N - 1);
    const iz = clamp(Math.round((z + WORLD_HALF) / CELL), 0, HF_N - 1);
    return this.masks[(iz * HF_N + ix) * 4 + channel] / 255;
  }

  slopeAt(x: number, z: number): number {
    const ix = clamp(Math.round((x + WORLD_HALF) / CELL), 0, HF_N - 1);
    const iz = clamp(Math.round((z + WORLD_HALF) / CELL), 0, HF_N - 1);
    return this.slopes[iz * HF_N + ix];
  }

  /** Mark a disc as non-walkable (used for props such as houses). */
  blockDisc(x: number, z: number, radius: number): void {
    this.forEachCellInDisc(x, z, radius, (i) => (this.walkable[i] = 0));
  }

  /** Force a disc to be walkable (bridges, piers). */
  openDisc(x: number, z: number, radius: number): void {
    this.forEachCellInDisc(x, z, radius, (i) => (this.walkable[i] = 1));
  }

  /** Remove grass/flowers inside a disc (under floors, around props). */
  clearGrass(x: number, z: number, radius: number): void {
    this.forEachCellInDisc(x, z, radius, (i) => (this.masks[i * 4 + 3] = 0));
    this.maskTexture.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  /** Rasterise min-distance-to-polyline into a grid, up to `radius` units. */
  private stampDistances(lines: P2[][], target: Float32Array, radius: number): void {
    for (const line of lines) {
      const curve = new THREE.CatmullRomCurve3(line.map(([x, z]) => new THREE.Vector3(x, 0, z)));
      const samples = Math.ceil(curve.getLength() / 0.4);
      for (const p of curve.getSpacedPoints(samples)) {
        this.forEachCellInDisc(p.x, p.z, radius, (i, cx, cz) => {
          const d = Math.hypot(cx - p.x, cz - p.z);
          if (d < target[i]) target[i] = d;
        });
      }
    }
  }

  private forEachCellInDisc(x: number, z: number, radius: number, fn: (i: number, cx: number, cz: number) => void): void {
    const r = Math.ceil(radius / CELL);
    const ix0 = Math.round((x + WORLD_HALF) / CELL);
    const iz0 = Math.round((z + WORLD_HALF) / CELL);
    for (let iz = Math.max(0, iz0 - r); iz <= Math.min(HF_N - 1, iz0 + r); iz++) {
      for (let ix = Math.max(0, ix0 - r); ix <= Math.min(HF_N - 1, ix0 + r); ix++) {
        const cx = ix * CELL - WORLD_HALF;
        const cz = iz * CELL - WORLD_HALF;
        if (Math.hypot(cx - x, cz - z) <= radius) fn(iz * HF_N + ix, cx, cz);
      }
    }
  }

  private computeHeights(): void {
    for (let iz = 0; iz < HF_N; iz++) {
      for (let ix = 0; ix < HF_N; ix++) {
        const x = ix * CELL - WORLD_HALF;
        const z = iz * CELL - WORLD_HALF;
        const i = iz * HF_N + ix;
        this.heights[i] = this.heightFn(x, z, this.pathDist[i], this.riverDist[i]);
      }
    }
  }

  /** The island's shape: coast + hills + landmarks carved/raised on top. */
  private heightFn(x: number, z: number, pathD: number, riverD: number): number {
    const n = this.noise;

    // Coastline: noisy ellipse
    const dx = (x - ISLAND.cx) / ISLAND.rx;
    const dz = (z - ISLAND.cz) / ISLAND.rz;
    let d = Math.sqrt(dx * dx + dz * dz);
    d += n.fbm(x * 0.017, z * 0.017, 4) * 0.12 + n.fbm(x * 0.07, z * 0.07, 2) * 0.025;

    const land = smoothstep(1.0, 0.84, d);
    const hills = n.fbm(x * 0.028 + 7, z * 0.028 - 3, 3) * 1.8 + n.fbm(x * 0.09, z * 0.09, 2) * 0.35;
    const inland = 1.5 + smoothstep(0.85, 0.45, d) * 1.6 + hills * smoothstep(0.9, 0.6, d);
    const seaFloor = -1.4 - smoothstep(0.9, 1.12, d) * 14;
    let h = lerp(seaFloor, Math.max(inland, 0.5), land);

    // Volcano rising out of the western sea
    const rv = dist2(x, z, LANDMARKS.volcano);
    if (rv < 40) {
      const t = clamp(1 - rv / 36, 0, 1);
      const gullies = (n.ridged(x * 0.09, z * 0.09, 3) - 0.5) * 2.2 * t;
      let cone = 31 * Math.pow(t, 1.7) + gullies + n.fbm(x * 0.05, z * 0.05, 3) * 1.2 * t;
      cone += Math.exp(-((rv - 6.5) ** 2) / 4) * 1.6; // crater rim
      cone -= smoothstep(7, 3, rv) * 9; // crater bowl
      // Reason: fade the cone's base into the deep sea floor so there is no step at its radius
      h = Math.max(h, cone - 1.5 - 12 * (1 - smoothstep(0, 0.3, t)));
    }

    // Mountain range in the north-east (main peak + shoulder)
    h = Math.max(h, this.peak(x, z, LANDMARKS.mountain, 44, 52));
    h = Math.max(h, this.peak(x, z, [90, -26], 26, 24));
    h = Math.max(h, this.peak(x, z, [44, -58], 22, 18));

    // Cave hill: steep-sided rocky mesa in the north-west
    const rc = dist2(x, z, LANDMARKS.caveHill);
    if (rc < 22) {
      const mesa = 13 * smoothstep(16, 8, rc) + n.ridged(x * 0.12, z * 0.12, 3) * 3 * smoothstep(17, 9, rc);
      h += mesa;
    }

    // Lake bowl
    const rl = dist2(x, z, LANDMARKS.lake);
    if (rl < 30) {
      const shore = 14 + n.fbm(x * 0.06, z * 0.06, 2) * 3;
      h = lerp(h, -2.6, smoothstep(shore + 4, shore - 4, rl));
    }

    // River channel
    if (riverD < 10) {
      const w = 3.0 + n.noise(x * 0.05, z * 0.05) * 0.8;
      h = lerp(h, -1.5, smoothstep(w + 3.5, w - 1, riverD));
    }

    // Flatten the village plateau
    const rvil = dist2(x, z, LANDMARKS.village);
    if (rvil < 28) {
      h = lerp(h, 2.3 + n.noise(x * 0.1, z * 0.1) * 0.15, smoothstep(28, 17, rvil));
    }

    // Treasure island: a sandy dune island off the north-west coast
    const rt = dist2(x, z, LANDMARKS.treasureIsland);
    if (rt < 30) {
      const dune =
        rt < 18
          ? lerp(-2.5, 2.6 + n.fbm(x * 0.12, z * 0.12, 2) * 0.6, smoothstep(18, 8, rt))
          : lerp(-16, -2.5, smoothstep(30, 18, rt));
      h = Math.max(h, dune);
    }

    // Paths sit slightly lower than the surrounding grass
    if (pathD < 3) h -= 0.12 * smoothstep(3, 1, pathD);

    return h;
  }

  /** Craggy mountain peak built from ridged noise. */
  private peak(x: number, z: number, c: P2, radius: number, height: number): number {
    const r = dist2(x, z, c);
    if (r > radius) return -99;
    const t = 1 - r / radius;
    const rug = this.noise.ridged(x * 0.045 + c[0], z * 0.045 + c[1], 5);
    return height * Math.pow(t, 1.4) * (0.6 + 0.6 * rug) - 1 - 14 * (1 - smoothstep(0, 0.3, t));
  }

  private computeSlopesAndMasks(): void {
    const h = this.heights;
    const n = this.noise;
    for (let iz = 0; iz < HF_N; iz++) {
      for (let ix = 0; ix < HF_N; ix++) {
        const i = iz * HF_N + ix;
        const hl = h[iz * HF_N + Math.max(ix - 1, 0)];
        const hr = h[iz * HF_N + Math.min(ix + 1, HF_N - 1)];
        const hd = h[Math.max(iz - 1, 0) * HF_N + ix];
        const hu = h[Math.min(iz + 1, HF_N - 1) * HF_N + ix];
        const slope = Math.hypot(hr - hl, hu - hd) / (2 * CELL);
        this.slopes[i] = slope;

        const x = ix * CELL - WORLD_HALF;
        const z = iz * CELL - WORLD_HALF;

        // Reason: store a wide, smooth falloff; the shader thresholds it at 0.5 with
        // noise so path edges stay crisp and organic instead of texel-blocky.
        const plazaD = dist2(x, z, VILLAGE.plaza) - VILLAGE.plazaRadius;
        const path = Math.max(smoothstep(3.4, 0.2, this.pathDist[i]), smoothstep(2.5, -1.5, plazaD));
        const forestD = dist2(x, z, LANDMARKS.forest) + n.fbm(x * 0.05, z * 0.05, 2) * 6;
        const forest = smoothstep(26, 16, forestD);
        const ashD = dist2(x, z, LANDMARKS.volcano) + n.fbm(x * 0.06, z * 0.06, 2) * 5;
        const ash = smoothstep(30, 22, ashD);

        const height = h[i];
        const grass =
          smoothstep(0.9, 1.5, height) *
          smoothstep(0.75, 0.45, slope) *
          smoothstep(24, 18, height) *
          smoothstep(0.62, 0.4, path) *
          (1 - ash);

        const m = i * 4;
        this.masks[m] = Math.round(path * 255);
        this.masks[m + 1] = Math.round(forest * 255);
        this.masks[m + 2] = Math.round(ash * 255);
        this.masks[m + 3] = Math.round(grass * 255);

        this.walkable[i] = height > -MAX_WADE_DEPTH && slope < MAX_WALK_SLOPE ? 1 : 0;
      }
    }
  }

  private createTextures(): void {
    this.heightTexture = new THREE.DataTexture(this.heights, HF_N, HF_N, THREE.RedFormat, THREE.FloatType);
    this.heightTexture.magFilter = THREE.LinearFilter;
    this.heightTexture.minFilter = THREE.LinearFilter;
    this.heightTexture.needsUpdate = true;

    this.maskTexture = new THREE.DataTexture(this.masks, HF_N, HF_N, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.maskTexture.magFilter = THREE.LinearFilter;
    this.maskTexture.minFilter = THREE.LinearFilter;
    this.maskTexture.needsUpdate = true;
  }
}

/** GLSL helper converting world XZ to heightfield texture UVs (texel-center aligned). */
export const HF_GLSL = /* glsl */ `
uniform sampler2D uHeightTex;
uniform sampler2D uMaskTex;
vec2 hfUv(vec2 xz) {
  return (xz + ${WORLD_HALF.toFixed(1)}) / ${WORLD_SIZE.toFixed(1)} * ${((HF_N - 1) / HF_N).toFixed(6)} + ${(0.5 / HF_N).toFixed(6)};
}
float hfHeight(vec2 xz) { return texture(uHeightTex, hfUv(xz)).r; }
vec4 hfMask(vec2 xz) { return texture(uMaskTex, hfUv(xz)); }
`;
