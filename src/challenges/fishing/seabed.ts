/**
 * The lagoon floor: a sandy plateau in front of the jetty that rises into
 * the beach behind it and drops off into deep blue further out, dressed with
 * coral clusters along the sides and the far edge, starfish and shells on
 * the open sand (where the fish are easy to see) and seaweed swaying round
 * the jetty posts. Static pieces merge into one mesh, swaying ones into a
 * second (the current animates them in the vertex shader).
 */

import * as THREE from "three";
import { merge } from "../../core/geo";
import { Noise2D, lerp, mulberry32, smoothstep } from "../../core/noise";
import { SeaUniforms, seaMaterial } from "./water";
import { anemone, brainCoral, branchCoral, reefRock, scallop, seaFan, seaweed, snailShell, starfish, tubeCoral, urchin } from "./reef";

type Geo = THREE.BufferGeometry;

const noise = new Noise2D(4242);

/** Sea-floor (and beach) height at (x, z); the water surface is y = 0. */
export function floorHeight(x: number, z: number): number {
  let h = -2.3 + noise.noise(x * 0.09, z * 0.09) * 0.32 + noise.noise(x * 0.31 + 5, z * 0.31) * 0.08;
  h += Math.sin(x * 1.9 + z * 0.7 + noise.noise(x * 0.2, z * 0.2) * 2.5) * 0.03;
  // Rising beach behind the jetty, gentle dunes inland
  const shore = smoothstep(3, 15, z);
  h = lerp(h, 0.55 + (z - 15) * 0.06 + smoothstep(18, 40, z) * (noise.noise(x * 0.05, z * 0.05) + 1) * 2.2, shore);
  // Drop-off into the deep further out and to the sides
  h -= smoothstep(-15, -36, z) * 7.5 * (1 - shore);
  h -= smoothstep(11, 30, Math.abs(x)) * 3.5 * (1 - shore);
  return h;
}

/** Procedural sand ripples and speckles, per fragment (world xz in vUwPos). */
const SAND_FRAG = /* glsl */ `
{
  vec2 sp = vUwPos.xz;
  float rip = sin(sp.x * 2.6 + sp.y * 1.1 + vnoise(sp * 0.45) * 3.5);
  float speck = vnoise(sp * 11.0);
  diffuseColor.rgb *= 0.95 + rip * 0.045 + (speck - 0.5) * 0.12;
}
`;

const SAND = new THREE.Color("#f4dfac");
const SAND_DEEP = new THREE.Color("#c7b27e");
const WET = new THREE.Color("#dcc08a");
const DRY = new THREE.Color("#f7e6bb");
const GRASS = new THREE.Color("#7fbf55");
const SEAGRASS = new THREE.Color("#8fae5a");

export class Seabed {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];

  constructor(sea: SeaUniforms) {
    const floorMat = seaMaterial(sea, "floor", { roughness: 0.95, colorFrag: SAND_FRAG });
    const reefMat = seaMaterial(sea, "reef", { roughness: 0.7, selfLit: 0.12 });
    const swayMat = seaMaterial(sea, "sway", { roughness: 0.75, selfLit: 0.12, sway: true, side: THREE.DoubleSide });
    this.materials.push(floorMat, reefMat, swayMat);

    const floor = new THREE.Mesh(floorGeometry(), floorMat);
    floor.receiveShadow = true;
    floor.name = "seafloor";
    this.group.add(floor);

    const { fixed, swaying } = dressReef();
    const reef = new THREE.Mesh(merge(fixed), reefMat);
    reef.castShadow = true;
    reef.receiveShadow = true;
    const sway = new THREE.Mesh(merge(swaying), swayMat);
    sway.receiveShadow = true;
    this.group.add(reef, sway);
  }
}

/** One big floor plane, dense near the jetty and coarse far away. */
function floorGeometry(): Geo {
  const g = new THREE.PlaneGeometry(2, 2, 220, 200);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  // Reason: squaring the grid coordinate packs vertices near the centre (fine sand detail) and stretches them far out
  const spread = (u: number, size: number) => Math.sign(u) * u * u * size;
  for (let i = 0; i < pos.count; i++) {
    const x = spread(pos.getX(i), 140);
    const z = -6 + spread(pos.getZ(i), 140);
    const h = floorHeight(x, z);
    pos.setXYZ(i, x, h, z);
    if (h > 0.9) {
      c.copy(GRASS).multiplyScalar(0.85 + noise.noise(x * 0.3, z * 0.3) * 0.15);
    } else if (h > 0.2) {
      c.copy(DRY).lerp(GRASS, smoothstep(0.7, 0.9, h));
    } else if (h > -0.35) {
      c.copy(WET).lerp(DRY, smoothstep(-0.1, 0.2, h));
    } else {
      c.copy(SAND).lerp(SAND_DEEP, smoothstep(-2.6, -6, h));
      // Patches of sea grass, kept off the open sand where the fish swim
      const patch = smoothstep(0.35, 0.6, noise.noise(x * 0.16 + 40, z * 0.16)) * smoothstep(3.5, 6, Math.abs(x) + Math.max(0, -z - 12));
      c.lerp(SEAGRASS, patch * 0.7);
    }
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const CORALS = ["#ff6fae", "#b26bff", "#ff8a3d", "#ffd23f", "#ff5a5f", "#5fd3c6"];
const FANS = ["#b04ad8", "#e2475e", "#ff8a3d"];
const STARS = ["#ff7a3d", "#e84a5f", "#a35bd6", "#ffb12a"];

/** Place a list of pieces at (x, z) on the floor (plus a lift), turned by `rot`. */
function place(list: Geo[], into: Geo[], x: number, z: number, rot = 0, lift = 0, scale = 1): void {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, floorHeight(x, z) + lift, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
    new THREE.Vector3(scale, scale, scale),
  );
  for (const g of list) into.push(g.applyMatrix4(m));
}

/** Scatter the reef: coral clusters at the edges, small treasures on the open sand. */
function dressReef(): { fixed: Geo[]; swaying: Geo[] } {
  const rand = mulberry32(77);
  const fixed: Geo[] = [];
  const swaying: Geo[] = [];
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];

  const cluster = (x: number, z: number, size: number) => {
    const rock = 0.45 + rand() * 0.5 * size;
    place([reefRock(rand, rock)], fixed, x, z, rand() * 6, -0.1);
    const pieces = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < pieces; i++) {
      const a = rand() * Math.PI * 2;
      const d = i === 0 ? 0 : rock * (0.5 + rand() * 0.6);
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      const lift = i === 0 ? rock * 0.45 : 0;
      const kind = rand();
      if (kind < 0.3) place(branchCoral(rand, pick(CORALS), 0.9 + rand() * 0.6 * size), fixed, px, pz, rand() * 6, lift);
      else if (kind < 0.48) place([brainCoral(rand, pick(["#d6d86a", "#f0b878", "#9fd47a"]), "#7a6a3a", 0.28 + rand() * 0.2)], fixed, px, pz, 0, lift);
      else if (kind < 0.63) place(tubeCoral(rand, pick(["#ff8a3d", "#ffcf3a", "#e2475e"]), 4 + Math.floor(rand() * 4)), fixed, px, pz, 0, lift);
      else if (kind < 0.78) place([seaFan(rand, pick(FANS), 0.45 + rand() * 0.35)], swaying, px, pz, 0, lift);
      else if (kind < 0.9) place(anemone(rand, pick(["#ff8fc8", "#b6f0a0", "#ffd0f0"]), pick(["#c43a8a", "#ffffff", "#7a3ad0"]), 0.9 + rand() * 0.6), swaying, px, pz, 0, lift);
      else place(seaweed(rand, 0.9 + rand() * 0.8), swaying, px, pz);
    }
  };

  // Coral bands framing the open sand on both sides and at the far edge
  for (let i = 0; i < 9; i++) cluster(-5.2 - rand() * 5, -1.5 - i * 1.6 - rand(), 1);
  for (let i = 0; i < 9; i++) cluster(5.2 + rand() * 5, -1.5 - i * 1.6 - rand(), 1);
  for (let i = 0; i < 10; i++) cluster(-9 + i * 2 + rand(), -13.5 - rand() * 4, 1.2);
  for (let i = 0; i < 14; i++) cluster((rand() - 0.5) * 34, -19 - rand() * 14, 1.5);

  // Open sand: starfish, shells, urchins and small sea grass tufts
  const open = (n: number, fn: (x: number, z: number) => void) => {
    for (let i = 0; i < n; i++) fn((rand() - 0.5) * 8.5, -2.5 - rand() * 9.5);
  };
  open(8, (x, z) => place(starfish(rand, pick(STARS), 0.13 + rand() * 0.07), fixed, x, z));
  open(9, (x, z) => place([scallop(rand, pick(["#ffb4c8", "#ffd9a8", "#f4f0e6"]), 0.08 + rand() * 0.05)], fixed, x, z));
  open(5, (x, z) => place([snailShell(rand, 0.09 + rand() * 0.05)], fixed, x, z));
  open(3, (x, z) => place(urchin(rand, 0.14 + rand() * 0.06), fixed, x, z));
  open(6, (x, z) => place(seaweed(rand, 0.35 + rand() * 0.25), swaying, x, z));

  // A clownfish anemone at the edge of the open sand
  place(anemone(rand, "#ff8fc8", "#c43a8a", 1.6), swaying, -3.9, -4.4);

  // Seaweed forest around the jetty posts and along the shore
  for (let i = 0; i < 16; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    place(seaweed(rand, 1.1 + rand() * 0.9), swaying, side * (1.4 + rand() * 2.2), -0.5 + rand() * 8);
  }
  return { fixed, swaying };
}
