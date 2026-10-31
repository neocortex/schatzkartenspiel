/**
 * The old stone at the foot of the volcano: a weathered slab on a stepped base,
 * with a heart-shaped hollow in its face where the Feuerherz once lay. Broken
 * columns, moss and creeping vines say nobody has looked after it for a very long
 * time. There is no writing on it: the empty heart has to speak for itself.
 */

import * as THREE from "three";
import { facet, merge, part } from "../../core/geo";
import { NOISE_GLSL } from "../../core/glsl";
import { Noise2D, mulberry32 } from "../../core/noise";
import { createFeuerherz, heartShape } from "../../world/models/items";
import { LandmarkMaterials } from "../../world/models/effects";
import { Model, addModel, ball, cyl, emptyModel, placeAt, rbox, rope, triangles } from "../../world/models/shapes";
import { meshesFromModel } from "./kit/models";

const STONE = new THREE.Color("#b5ab9b");
const STONE_LIGHT = new THREE.Color("#d2c9b8");
const HOLLOW = new THREE.Color("#1c110d");
const HOLLOW_WALL = new THREE.Color("#2e201a");
const CARVING = new THREE.Color("#6f6455");

/** Width of the hollow; the heart sits in it at a little under this size. */
const HEART_W = 1.6;
/** The Feuerherz's scale when it lies in the hollow. */
export const HEART_IN_HOLLOW = HEART_W * 0.92;
/** Where the hollow's centre sits on the slab. */
const HEART_Y = 1.62;
const SLAB_DEPTH = 0.5;
const SLAB_BEVEL = 0.07;
/** The slab's front face, measured from its back block (z = 0 is the floor of the hollow). */
const FACE_Z = SLAB_DEPTH + SLAB_BEVEL;
/** Height of the stepped base under the slab. */
const BASE_H = 0.92;
/** The slab leans back a little, as if the ground had settled under it over the ages. */
const LEAN = -0.13;

/** The slab's outline: tapering upwards, an old break at the top right corner. */
const OUTLINE: [number, number][] = [
  [-1.62, 0],
  [1.66, 0],
  [1.58, 0.9],
  [1.53, 1.8],
  [1.42, 2.42],
  [1.15, 2.6],
  [0.98, 2.94],
  [0.62, 3.02],
  [0.36, 3.42],
  [-0.26, 3.52],
  [-0.98, 3.34],
  [-1.32, 2.9],
  [-1.46, 2.1],
  [-1.56, 1.0],
];

const STONE_VERT_PARS = /* glsl */ `
varying vec3 vStonePos;
varying vec3 vStoneNormal;
`;

const STONE_FRAG_PARS = /* glsl */ `
varying vec3 vStonePos;
varying vec3 vStoneNormal;
${NOISE_GLSL}
// Distance to the nearest Voronoi cell edge (thin lines = cracks)
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

const STONE_FRAG = /* glsl */ `
  vec3 sn = normalize(vStoneNormal);
  vec3 an = abs(sn);
  // Reason: map the noise by the face's main direction, so tops and sides both get an unstretched pattern
  vec2 suv = an.y > 0.65 ? vStonePos.xz : (an.x > an.z ? vStonePos.zy : vStonePos.xy);
  // The hollow and the carvings are painted dark, and stay free of moss and cracks
  float weathered = smoothstep(0.03, 0.2, vColor.g);
  // Mottled grain, with dark streaks where rain ran down for centuries
  float grain = fbm3(suv * 1.9);
  float streak = vnoise(vec2(suv.x * 3.1, suv.y * 0.35));
  diffuseColor.rgb *= 0.64 + 0.5 * grain + 0.1 * vnoise(suv * 11.0);
  diffuseColor.rgb *= 1.0 - 0.3 * smoothstep(0.58, 0.9, streak) * weathered * (1.0 - an.y);
  // Cracks wander across the stone, in some places only
  vec2 warp = vec2(fbm3(suv * 0.7), fbm3(suv * 0.7 + 7.0)) * 1.1;
  float crack = smoothstep(0.03, 0.008, crackDist(suv * 0.95 + warp)) * smoothstep(0.38, 0.6, vnoise(suv * 0.6 + 3.0)) * weathered;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.03, 0.03), crack * 0.9);
  // Moss on everything that faces up, plus patches creeping down the sides
  // Reason: the fine detail and the narrow edge keep the patches crisp; a wide soft edge reads as a blurry green smear
  float patches = fbm3(suv * 1.25 + 11.0) + 0.3 * (fbm3(suv * 6.3 + 4.0) - 0.5);
  float moss = smoothstep(0.6, 0.65, patches + sn.y * 0.2 - 0.04 * max(vStonePos.y - uStoneBase, 0.0)) * weathered;
  vec3 mossCol = mix(vec3(0.13, 0.26, 0.05), vec3(0.3, 0.46, 0.09), fbm3(suv * 11.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, mossCol, moss);
`;

/** Lit, vertex-coloured stone with procedural grain, cracks and moss, so it holds up close to the camera. */
function stoneMaterial(baseY: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uStoneBase = { value: baseY };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${STONE_VERT_PARS}`)
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vStonePos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vStoneNormal = mat3(modelMatrix) * objectNormal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uStoneBase;\n${STONE_FRAG_PARS}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${STONE_FRAG}`);
  };
  return m;
}

const wobble = new Noise2D(5150);

/** A hewn block, its faces gone a little out of true. */
function worn(g: THREE.BufferGeometry, seed: number, amount = 0.05): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  // Reason: the shift depends on the position alone, so the faces meeting at a corner stay joined
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    pos.setXYZ(i, x + amount * wobble.noise(y * 1.4 + seed, z * 1.4), y + amount * 0.6 * wobble.noise(x * 1.4, z * 1.4 + seed), z + amount * wobble.noise(x * 1.4 - seed, y * 1.4));
  }
  return facet(g);
}

function slabShape(): THREE.Shape {
  return new THREE.Shape(OUTLINE.map(([x, y]) => new THREE.Vector2(x, y)));
}

/** A heart outline at slab height, as a path or the hole of a shape. */
function heartPath(width: number): THREE.Path {
  return new THREE.Path(
    heartShape(width)
      .getPoints(18)
      .map((p) => new THREE.Vector2(p.x, p.y + HEART_Y)),
  );
}

/** The slab in its own plane: its foot at the origin, z = 0 the floor of the hollow, facing +z. */
function slabParts(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const isInHollow = (p: THREE.Vector3) => Math.hypot(p.x, p.y - HEART_Y) < HEART_W * 0.62;

  const front = slabShape();
  front.holes.push(heartPath(HEART_W));
  const slab = new THREE.ExtrudeGeometry(front, { depth: SLAB_DEPTH, bevelEnabled: true, bevelThickness: SLAB_BEVEL, bevelSize: SLAB_BEVEL, bevelSegments: 2, curveSegments: 10 });
  const stoneTint = STONE.clone();
  parts.push(part(slab, (p, n) => (isInHollow(p) && Math.abs(n.z) < 0.6 ? HOLLOW_WALL : stoneTint)));

  // Back block: closes the hollow from behind, so its front is the hollow's floor
  const back = new THREE.ExtrudeGeometry(slabShape(), { depth: 0.46, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 1, curveSegments: 6 });
  back.translate(0, 0, -0.5);
  parts.push(part(back, STONE));
  // Reason: the block's front has vertices on its outline only, so the dark floor of the hollow needs a plate of its own
  const floor = new THREE.ShapeGeometry(heartShape(HEART_W * 1.06), 18);
  floor.translate(0, HEART_Y, 0.03);
  parts.push(part(floor, HOLLOW));

  // A raised stone lip around the hollow: this is what makes the heart readable from far down the trail
  const lipShape = heartShape(HEART_W * 1.27);
  lipShape.holes.push(new THREE.Path(heartShape(HEART_W * 1.02).getPoints(18)));
  const lip = new THREE.ExtrudeGeometry(lipShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2, curveSegments: 18 });
  lip.translate(0, HEART_Y, FACE_Z);
  parts.push(part(lip, STONE_LIGHT));

  // Rays worn shallow into the stone, growing out of the lip like the flames of a sun
  const rays = heartShape(HEART_W * 1.33).getSpacedPoints(22);
  rays.forEach((p, i) => {
    // Reason: the notch would crowd its rays into one another; leave it plain
    if (Math.abs(p.x) < HEART_W * 0.16 && p.y > 0) return;
    const out = new THREE.Vector2(p.x, p.y).normalize();
    const long = i % 2 === 0;
    const len = long ? 0.26 : 0.15;
    const w = long ? 0.075 : 0.055;
    const side = new THREE.Vector2(-out.y, out.x);
    const a = new THREE.Vector2(p.x, p.y + HEART_Y).addScaledVector(side, w);
    const b = new THREE.Vector2(p.x, p.y + HEART_Y).addScaledVector(side, -w);
    const tip = new THREE.Vector2(p.x, p.y + HEART_Y).addScaledVector(out, len);
    const z = FACE_Z + 0.006;
    parts.push(triangles([a.x, a.y, z, b.x, b.y, z, tip.x, tip.y, z], CARVING));
  });
  return parts;
}

/** A broken column: drums that slipped over the ages, optionally with its capital. */
function column(x: number, z: number, height: number, capital: boolean, seed: number): THREE.BufferGeometry[] {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(worn(rbox(1.25, 0.3, 1.25, STONE, { pos: [x, 0.13, z], rot: [0, rand() * 0.4, 0] }, 0.06), seed));
  let y = 0.28;
  while (y < height) {
    const h = 0.55 + rand() * 0.22;
    const drum = cyl(0.42 + rand() * 0.03, 0.47, h, STONE, { pos: [x + (rand() - 0.5) * 0.09, y + h / 2, z + (rand() - 0.5) * 0.09], rot: [0, rand() * 3, 0] }, 9);
    parts.push(worn(drum, seed + y, 0.035));
    y += h - 0.02;
  }
  if (capital) parts.push(worn(rbox(1.15, 0.26, 1.15, STONE_LIGHT, { pos: [x + 0.05, y + 0.1, z], rot: [0.05, 0.3, -0.06] }, 0.07), seed + 9));
  return parts;
}

/** Everything of stone: the stepped base, the paving leading up to it, the columns, a fallen drum. */
function surroundings(): THREE.BufferGeometry[] {
  const rand = mulberry32(611);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(worn(cyl(3.05, 3.3, 0.52, STONE, { pos: [0, 0.2, 0] }, 11), 1, 0.07));
  parts.push(worn(cyl(2.2, 2.42, 0.5, STONE, { pos: [0, 0.68, -0.28] }, 9), 2, 0.05));
  // Three worn steps up the front, the middle one split
  parts.push(worn(rbox(1.1, 0.24, 0.72, STONE_LIGHT, { pos: [-0.62, 0.52, 2.12], rot: [0, 0.06, 0] }, 0.05), 3));
  parts.push(worn(rbox(1.0, 0.22, 0.7, STONE_LIGHT, { pos: [0.56, 0.5, 2.16], rot: [0.03, -0.1, 0] }, 0.05), 4));
  parts.push(worn(rbox(2.5, 0.22, 0.72, STONE_LIGHT, { pos: [0.03, 0.2, 3.1], rot: [0, -0.03, 0.01] }, 0.05), 5));
  // Paving stones on the way up, half sunk into the meadow
  for (let i = 0; i < 7; i++) {
    const z = 4.05 + i * 0.86 + rand() * 0.2;
    const x = (i % 2 ? -0.62 : 0.55) + (rand() - 0.5) * 0.5;
    const w = 0.95 + rand() * 0.6;
    parts.push(worn(rbox(w, 0.16, 0.74, STONE, { pos: [x, 0.02, z], rot: [(rand() - 0.5) * 0.08, rand() * 0.8 - 0.4, (rand() - 0.5) * 0.08] }, 0.05), 20 + i, 0.03));
  }
  parts.push(...column(-3.15, -1.15, 2.7, true, 31));
  parts.push(...column(3.2, -1.3, 1.05, false, 37));
  parts.push(...column(2.95, 1.75, 0.5, false, 41));
  // A drum that fell long ago, half sunk into the ground
  parts.push(worn(cyl(0.45, 0.47, 0.72, STONE, { pos: [4.3, 0.22, 0.45], rot: [0.18, 0.5, Math.PI / 2 - 0.08] }, 9), 43, 0.03));
  return parts;
}

/** Vines over the slab and grass around its feet. */
function plants(slab: THREE.Matrix4): Model {
  const rand = mulberry32(823);
  const m = emptyModel();
  const vine = emptyModel();
  const leafGreen = () => new THREE.Color().setHSL(0.27 + rand() * 0.06, 0.62, 0.26 + rand() * 0.12);
  const stems: [number, number, number][][] = [
    [
      [-1.3, 2.95, 0.4],
      [-1.5, 2.2, 0.62],
      [-1.46, 1.35, 0.68],
      [-1.58, 0.45, 0.66],
    ],
    [
      [0.95, 3.0, 0.2],
      [1.25, 2.35, 0.6],
      [1.42, 1.65, 0.68],
    ],
    [
      [-0.3, 3.5, 0.28],
      [-0.72, 3.15, 0.62],
      [-0.98, 2.72, 0.64],
    ],
  ];
  for (const stem of stems) {
    for (let i = 0; i < stem.length - 1; i++) {
      vine.solid.push(rope(stem[i], stem[i + 1], 0.05, 0.028, "#4b6a23", 6));
      for (let k = 0; k < 5; k++) {
        const t = rand();
        const a = stem[i];
        const b = stem[i + 1];
        const x = a[0] + (b[0] - a[0]) * t + (rand() - 0.5) * 0.22;
        const y = a[1] + (b[1] - a[1]) * t + (rand() - 0.5) * 0.22;
        const z = a[2] + (b[2] - a[2]) * t + 0.03;
        vine.solid.push(ball(0.09 + rand() * 0.05, leafGreen(), [x, y, z], 0, [1, 0.72, 0.38]));
      }
    }
  }
  addModel(m, vine, slab);
  // Grass tufts where the stone meets the meadow
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = 3.15 + rand() * 0.75;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    for (let k = 0; k < 4; k++) {
      const h = 0.3 + rand() * 0.34;
      const blade = part(new THREE.ConeGeometry(0.05, h, 4), leafGreen(), { pos: [x + (rand() - 0.5) * 0.3, h / 2 - 0.02, z + (rand() - 0.5) * 0.3], rot: [(rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5] });
      m.solid.push(blade);
    }
  }
  return m;
}

export class Altar {
  readonly group = new THREE.Group();
  /** World position of the centre of the hollow. */
  readonly hollowAt = new THREE.Vector3();
  private heart = createFeuerherz();
  private inlay: THREE.Mesh;

  /** Stands at (x, y, z) with its face turned to `facing` (yaw; 0 faces +z). */
  constructor(x: number, y: number, z: number, facing: number, materials: LandmarkMaterials) {
    this.group.name = "altar";
    this.group.position.set(x, y, z);
    this.group.rotation.y = facing;

    const slabAt = new THREE.Matrix4().compose(
      new THREE.Vector3(0, BASE_H, -0.42),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), LEAN),
      new THREE.Vector3(1, 1, 1),
    );
    const stones = [...surroundings()];
    for (const g of slabParts()) stones.push(g.applyMatrix4(slabAt));
    const stone = new THREE.Mesh(merge(stones), stoneMaterial(y));
    stone.castShadow = true;
    stone.receiveShadow = true;
    this.group.add(stone, meshesFromModel(plants(slabAt), materials, "altar-plants"));

    // A thin line of light in the lip, only while the heart is home
    const inlayShape = heartShape(HEART_W * 1.16);
    inlayShape.holes.push(new THREE.Path(heartShape(HEART_W * 1.07).getPoints(18)));
    this.inlay = new THREE.Mesh(
      new THREE.ShapeGeometry(inlayShape, 18),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 0.42, 0.05), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
    );
    this.inlay.applyMatrix4(placeAt(0, HEART_Y, FACE_Z + 0.09));
    this.inlay.applyMatrix4(slabAt);
    this.inlay.visible = false;

    this.heart.scale.setScalar(HEART_IN_HOLLOW);
    this.heart.applyMatrix4(placeAt(0, HEART_Y, 0.27));
    this.heart.applyMatrix4(slabAt);
    this.heart.visible = false;
    this.group.add(this.inlay, this.heart);

    this.group.updateMatrixWorld(true);
    this.hollowAt.copy(this.heart.position).applyMatrix4(this.group.matrixWorld);
  }

  /** Shows or hides the Feuerherz in the hollow. */
  setHeart(on: boolean): void {
    this.heart.visible = on;
    this.inlay.visible = on;
  }
}
