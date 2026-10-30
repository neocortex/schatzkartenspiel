/**
 * Old cave art, painted by the old people straight on the rock. Above the crystal
 * wall a wide natural rock face carries the test: volcano, snowy peak and forest,
 * read from left to right with one, two and three dots and the colour of the
 * crystal under each picture. Along the way three more pictures (the heart, the
 * thorns, the hammer) tell the story without a word.
 *
 * Every picture (paintingArt.ts) is laid exactly over the bumps of the rock it sits on.
 */

import * as THREE from "three";
import { Noise2D, mulberry32 } from "../../core/noise";
import { Colliders } from "../../world/Colliders";
import { patchXray } from "../../world/xray";
import { GlowField, instances, rockMaterial } from "./materials";
import { boulder } from "./models";
import { Ctx, HEIGHT, WIDTH, arrowTexture, drawForest, drawHammer, drawHeart, drawPeak, drawThorns, drawVolcano, marks, paintingTexture } from "./paintingArt";

// ── The rock they are painted on ──────────────────────────────

interface FaceSpec {
  /** Foot of the face's middle. */
  x: number;
  z: number;
  width: number;
  height: number;
  /** How far the face tips back per unit of height, towards the camera's view from above. */
  lean: number;
  seed: number;
  /** The smooth stretch of rock the people chose for their pictures; around it the rock is rough. */
  calm: { half: number; y0: number; y1: number };
  /** Local points left open, such as a door: x, height, and how far up and over the rock (above 1 it rolls away over the back). */
  hole?: (lx: number, y: number, t: number) => boolean;
}

const smooth = THREE.MathUtils.smoothstep;
const ROCK = new THREE.Color("#8e7f8c");
const ROCK_LIGHT = new THREE.Color("#b5a498");
const ROCK_DARK = new THREE.Color("#4a3f5c");
const CREST = new THREE.Color("#141020");
/** Size of the rock's flat facets, about those of the boulders around it. */
const FACET = 0.36;
/** How far the paint stands in front of its rock: more than the 0.1 that rock and paint differ by between their facets. */
const PAINT_LIFT = 0.15;

/** A bulge of natural rock in front of the cave wall. Its sides and top roll back and melt into the dark. */
class RockFace {
  private noise: Noise2D;
  private tmp = new THREE.Vector3();

  constructor(readonly spec: FaceSpec) {
    this.noise = new Noise2D(spec.seed);
  }

  /** Point on the rock at local x and height parameter t (0 foot, 1 top of the front, up to 1.45 rolling over the back). */
  point(lx: number, t: number, lift: number, out: THREE.Vector3): THREE.Vector3 {
    const { x, z, width, height, lean } = this.spec;
    const n = this.noise;
    const side = smooth(Math.abs(lx) / (width / 2), 0.72, 1);
    const top = height * (1 - side * side * 0.6) * (0.96 + n.noise(lx * 0.42, 3) * 0.05);
    let y = Math.min(t, 1) * top;
    let back = side * side * 1.9 + smooth(t, 0.88, 1) ** 2 * 0.6;
    if (t > 1) {
      // Reason: behind the top the rock falls away to the crest of the cave wall, so the camera never looks behind it
      const k = (t - 1) / 0.45;
      y = top - k * k * Math.max(top - 2.6, 0);
      back += k * 4;
    }
    const raw = this.rawness(lx, y);
    const layer = y * 1.05 + n.noise(lx * 0.3, 9) * 0.7;
    // Reason: a sawtooth over the height gives overhanging layers, like the strata of real rock
    const ledge = smooth(layer - Math.floor(layer), 0, 0.3) * 0.13;
    // Reason: under the pictures only the slow swell stays, because anything finer than a facet differs between rock and paint and bites through
    const bump = n.noise(lx * 0.75 + 11, y * 0.75) * 0.17 + raw * (n.noise(lx * 2.1, y * 2.1 + 7) * 0.05 + n.noise(lx * 1.3 + 4, y * 1.3 + 3) * 0.26 + n.noise(lx * 3.1, y * 3.1 + 2) * 0.05 + ledge);
    // Reason: noise this fine is random from one facet to the next, so the facets lose the look of a regular grid
    const jx = raw * n.noise(lx * 4.7, y * 4.7) * 0.1;
    const jy = raw * n.noise(lx * 4.7 + 9, y * 4.7 + 5) * 0.1;
    return out.set(x + lx + jx, y + jy, z - lean * y - back + bump + lift);
  }

  /** 1 on the raw rock, 0 on the smooth stretch where the pictures sit. */
  private rawness(lx: number, y: number): number {
    const { half, y0, y1 } = this.spec.calm;
    // Reason: stay calm one facet past the picture, because a facet just outside it still reaches under the paint
    const inX = 1 - smooth(Math.abs(lx), half + FACET, half + FACET + 0.9);
    const inY = smooth(y, y0 - FACET - 0.6, y0 - FACET) * (1 - smooth(y, y1 + FACET, y1 + FACET + 0.5));
    return 1 - inX * inY;
  }

  /** The rock itself, with baked glow and strata like the cave walls. */
  mesh(glow: GlowField, owned: THREE.Material[]): THREE.Mesh {
    const { width, height, hole } = this.spec;
    const nu = Math.ceil(width / FACET);
    const nv = Math.ceil((height * 1.45) / FACET);
    const rows = nv + 1;
    const pos = new Float32Array((nu + 1) * rows * 3);
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        this.point((i / nu - 0.5) * width, (j / nv) * 1.45, 0, this.tmp).toArray(pos, (j * (nu + 1) + i) * 3);
      }
    }
    const index: number[] = [];
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i;
        const lx = ((i + 0.5) / nu - 0.5) * width;
        const y = pos[(a + nu + 1) * 3 + 1];
        if (hole?.(lx, y, ((j + 0.5) / nv) * 1.45)) continue;
        index.push(a, a + 1, a + nu + 1, a + 1, a + nu + 2, a + nu + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();

    const colors = new Float32Array(pos.length);
    const glows = new Float32Array(pos.length);
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    const c = new THREE.Color();
    const g = new THREE.Color();
    for (let k = 0; k < pos.length / 3; k++) {
      p.fromArray(pos, k * 3);
      q.fromBufferAttribute(nrm, k);
      const band = Math.sin(p.y * 3.4 + this.noise.noise(p.x * 0.3, p.y * 0.3) * 2.5);
      c.copy(ROCK).lerp(band > 0 ? ROCK_LIGHT : ROCK_DARK, Math.abs(band) * 0.8);
      c.multiplyScalar(0.9 + this.noise.noise(p.x * 0.9, p.y * 0.9) * 0.22);
      const j = Math.floor(k / (nu + 1));
      const i = k - j * (nu + 1);
      const t = (j / nv) * 1.45;
      const side = smooth(Math.abs(i / nu - 0.5) * 2, 0.8, 1);
      c.lerp(CREST, Math.max(smooth(t, 0.96, 1.2), side));
      c.toArray(colors, k * 3);
      glow.at(p, q, g);
      g.toArray(glows, k * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aGlow", new THREE.BufferAttribute(glows, 3));
    const material = rockMaterial({ xray: true });
    material.flatShading = true;
    owned.push(material);
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** A sheet that hugs the rock, for laying a picture on it. `y0` and `h` are heights on the front. */
  sheet(lx: number, y0: number, w: number, h: number, material: THREE.Material): THREE.Mesh {
    const nu = 18;
    const nv = 12;
    const top = this.spec.height;
    const pos: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const y = y0 + (j / nv) * h;
        this.point(lx + (i / nu - 0.5) * w, y / top, PAINT_LIFT, this.tmp);
        pos.push(this.tmp.x, this.tmp.y, this.tmp.z);
        uv.push(i / nu, j / nv);
        if (i < nu && j < nv) {
          const a = j * (nu + 1) + i;
          index.push(a, a + 1, a + nu + 1, a + 1, a + nu + 2, a + nu + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = 1;
    return mesh;
  }
}

/** Paint that catches the torchlight and also shines a little by itself, so it can be read in the dark. */
function paintMaterial(map: THREE.Texture, shine: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map,
    emissiveMap: map,
    emissive: "#ffffff",
    emissiveIntensity: shine,
    roughness: 0.95,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  m.onBeforeCompile = (shader) => patchXray(shader);
  m.customProgramCacheKey = () => "cave-paint";
  return m;
}

// ── The test above the crystal wall ───────────────────────────

const PICTURE_W = 4.8;
const PICTURE_H = 2.81;
const REST = 0.42;
const LIT = 0.95;

const ROCKS_AROUND_DOOR: [number, number, number][] = [
  // Left and right of the door, bottom to top: local x, height, size
  [-2.28, 0.2, 1.0], [-2.42, 1.1, 0.86], [-2.32, 1.95, 0.72], [-2.08, 2.66, 0.52],
  [2.32, 0.16, 1.06], [2.38, 1.02, 0.82], [2.34, 1.9, 0.74], [2.06, 2.68, 0.5],
  // The lintel, small enough to stay under the middle picture
  [-1.42, 2.9, 0.42], [-0.72, 2.95, 0.34], [-0.02, 2.82, 0.3], [0.72, 2.82, 0.3], [1.4, 2.88, 0.4],
  // Along the foot of the face
  [-3.7, 0.1, 0.92], [-5.0, 0.0, 0.62], [-6.9, 0.05, 1.08], [-8.4, 0.0, 0.72],
  [3.75, 0.0, 0.76], [5.3, 0.08, 1.12], [6.7, 0.0, 0.6], [8.6, 0.05, 0.92],
];

/** Rock face at the head of the hall with the three test pictures in a row above the crystal wall. */
export class TestPaintings {
  readonly group = new THREE.Group();
  private pictures: THREE.MeshStandardMaterial[] = [];
  private textures: THREE.Texture[] = [];
  private step = 0;
  private sweeping = false;

  /** `door` is the half width of the opening under the middle picture, `wallZ` the hall's north wall. */
  constructor(wallZ: number, door: { half: number; height: number }, glow: GlowField, colliders: Colliders, owned: THREE.Material[]) {
    const face = new RockFace({
      x: 0,
      z: wallZ - 0.1,
      width: 21,
      height: 6.1,
      lean: 0.03,
      seed: 61,
      calm: { half: 7.85, y0: door.height + 0.08, y1: 5.85 },
      hole: (lx, y, t) => {
        // Reason: a rough arch, lower towards its sides, so the door looks like a natural gap in the rock
        const edge = Math.abs(lx) / door.half;
        if (edge < 1 && y < door.height * (1 - edge ** 6 * 0.4)) return true;
        // Reason: no roof over the way behind the door; from the camera above, the rock's back would hide Tadeo on his way to the sword
        return t > 1.06 && edge < 1.25;
      },
    });
    this.group.add(face.mesh(glow, owned));
    this.group.add(this.rocksAround(face, glow, colliders, owned));
    const y0 = door.height + 0.08;
    const pictures: [number, (ctx: Ctx, rand: () => number) => void, number, string][] = [
      [-5.45, drawVolcano, 1, "#ff2f2a"],
      [0, drawPeak, 2, "#f4f7ff"],
      [5.45, drawForest, 3, "#2dff4e"],
    ];
    pictures.forEach(([lx, draw, count, crystal], i) => {
      const texture = paintingTexture((ctx, rand) => {
        draw(ctx, rand);
        marks(ctx, count, crystal, rand);
      }, 100 + i);
      const material = paintMaterial(texture, REST);
      owned.push(material);
      this.textures.push(texture);
      this.pictures.push(material);
      this.group.add(face.sheet(lx, y0, PICTURE_W, PICTURE_H, material));
    });
    // Painted arrows between the pictures, so the eye knows which way to read
    for (const lx of [-2.72, 2.72]) {
      const texture = arrowTexture(lx > 0 ? 7 : 8);
      const material = paintMaterial(texture, 0.5);
      owned.push(material);
      this.textures.push(texture);
      this.group.add(face.sheet(lx, y0 + 1.05, 0.78, 0.6, material));
    }
  }

  /** Rocks wedged around the door and along the foot of the face, so the opening looks like a natural gap. */
  private rocksAround(face: RockFace, glow: GlowField, colliders: Colliders, owned: THREE.Material[]): THREE.InstancedMesh {
    const rand = mulberry32(67);
    const p = new THREE.Vector3();
    const matrices = ROCKS_AROUND_DOOR.map(([lx, y, scale]) => {
      face.point(lx, y / face.spec.height, 0.12, p);
      p.y = y;
      if (y < 0.3) colliders.add(p.x, p.z, scale * 0.68);
      const spin = new THREE.Euler(rand() * 3, rand() * 6, rand() * 3);
      return new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(spin), new THREE.Vector3(scale, scale, scale));
    });
    const material = rockMaterial({ xray: true });
    owned.push(material);
    const geo = boulder(9);
    const mesh = instances(geo, material, matrices, glow, false);
    geo.dispose();
    return mesh;
  }

  /** How many crystals are already touched: those pictures burn bright and the next one breathes. */
  setStep(n: number): void {
    this.step = n;
  }

  /** While Tadeo reads them out, the pictures light up one after the other. */
  setSweep(on: boolean): void {
    this.sweeping = on;
  }

  update(dt: number, time: number): void {
    const breathe = 0.5 + 0.5 * Math.sin(time * 3.4);
    const sweep = Math.floor(time * 0.9) % 3;
    this.pictures.forEach((m, i) => {
      const want = this.sweeping ? (i === sweep ? LIT : REST) : i < this.step ? LIT : i === this.step ? REST + breathe * 0.4 : REST;
      m.emissiveIntensity += (want - m.emissiveIntensity) * (1 - Math.exp(-dt * 8));
    });
  }

  dispose(): void {
    for (const t of this.textures) t.dispose();
  }
}

// ── The pictures along the way ────────────────────────────────

/** Heart, thorns and hammer on smaller bulges of rock. They only tell the story, and nothing depends on them. */
export function wayPaintings(
  spots: Record<"heart" | "thorns" | "hammer", { at: [number, number]; width: number }>,
  glow: GlowField,
  owned: THREE.Material[],
  textures: THREE.Texture[],
): THREE.Group {
  const group = new THREE.Group();
  const pictures: [{ at: [number, number]; width: number }, (ctx: Ctx, rand: () => number) => void, number][] = [
    [spots.heart, drawHeart, 21],
    [spots.thorns, drawThorns, 22],
    [spots.hammer, drawHammer, 23],
  ];
  for (const [{ at, width }, draw, seed] of pictures) {
    const w = width * 0.62;
    const h = (w * HEIGHT) / WIDTH;
    const face = new RockFace({ x: at[0], z: at[1], width, height: 3.5, lean: 0.34, seed, calm: { half: w / 2, y0: 0.45, y1: 0.45 + h } });
    group.add(face.mesh(glow, owned));
    const texture = paintingTexture(draw, seed);
    const material = paintMaterial(texture, 0.36);
    owned.push(material);
    textures.push(texture);
    group.add(face.sheet(0, 0.45, w, h, material));
  }
  return group;
}
