/**
 * Set dressing around the ceremony circle: village cottages in the
 * background (the island's own cottage models), lantern posts strung with
 * bunting, painted totem poles, torches, log benches, a ring of stones and
 * a woven rug under the drums. Everything is merged into one mesh per
 * material; torch flames are instanced and chimneys get smoke.
 */

import * as THREE from "three";
import { merge } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { part } from "../../core/geo";
import { Model, emptyModel, addModel, placeAt, faceDir, PAL, rbox, cyl, ball, box, pole, rockBlob, stoneFn } from "../../world/models/shapes";
import { cottage } from "../../world/models/buildings";
import { lanternPost, bunting, torch, flowerPot, barrel, crate } from "../../world/models/props";
import { createMaterials, flameGeometry, LandmarkMaterials } from "../../world/models/effects";
import { SmokeSystem } from "../../world/ambient/Smoke";
import { WorldUniforms } from "../../world/Terrain";
import { Owned } from "../shared/dispose";

/** Ceremony circle centre and radius (the drums sit in front of the fire inside it). */
export const RING = { x: 0, z: -1.4, r: 7.4 };

/** Log benches: position + facing (villagers sit on them). */
export const BENCHES: { x: number; z: number; rot: number }[] = [
  { x: -6.3, z: 0.4, rot: faceDir(6.3, -1.8) },
  { x: 6.3, z: 0.4, rot: faceDir(-6.3, -1.8) },
  { x: -4.6, z: -6.9, rot: faceDir(4.6, 5.5) },
  { x: 4.6, z: -6.9, rot: faceDir(-4.6, 5.5) },
];

const COTTAGES = [
  { at: [-15.5, -9.5], size: 1.0, roof: "straw", roofColor: "#e2b85a", shutter: "#3f7fbf", plaster: "#f6dccd" },
  { at: [-6.5, -18.5], size: 1.15, roof: "tile", roofColor: "#c4553a", shutter: "#3f8f4a" },
  { at: [7.5, -18.5], size: 1.05, roof: "tile", roofColor: "#4f78b8", shutter: "#d0453a" },
  { at: [16.5, -9], size: 1.0, roof: "straw", roofColor: "#d9ae52", shutter: "#e8b73a", plaster: "#f5ebc0" },
  { at: [-20, 4], size: 0.95, roof: "tile", roofColor: "#d0703a", shutter: "#2f9a8f", plaster: "#eef0e2" },
  { at: [20.5, 5], size: 1.0, roof: "tile", roofColor: "#c4553a", shutter: "#3f7fbf" },
] as const;

/** Circles the background props keep clear of (for grass and trees). */
export const BLOCKERS: [number, number, number][] = COTTAGES.map((c) => [c.at[0], c.at[1], 4.6 * c.size]);

/** A carved, painted totem pole: bear face, owl face and a thunderbird with spread wings. */
function totem(seed: number): Model {
  const rand = mulberry32(seed);
  const m = emptyModel();
  const palettes = [
    ["#2fa59a", "#d6453a", "#f2b632"],
    ["#d6453a", "#3a7bd5", "#f2b632"],
  ];
  const [c1, c2, c3] = palettes[seed % palettes.length];
  m.solid.push(rbox(0.95, 0.3, 0.95, stoneFn(PAL.stone, 0.5, rand), { pos: [0, 0.1, 0] }, 0.08));
  // Bear (bottom)
  m.solid.push(cyl(0.38, 0.4, 1.05, c1, { pos: [0, 0.75, 0] }, 12));
  for (const sx of [-1, 1]) {
    m.solid.push(ball(0.11, "#ffffff", [sx * 0.15, 1.0, 0.31]), ball(0.055, "#1d1410", [sx * 0.15, 1.0, 0.41]));
    m.solid.push(box(0.2, 0.05, 0.05, "#1d1410", { pos: [sx * 0.15, 1.15, 0.36], rot: [0, 0, sx * 0.25] }));
    m.solid.push(ball(0.1, c1, [sx * 0.3, 1.27, 0.08]));
  }
  m.solid.push(rbox(0.36, 0.14, 0.12, "#8e2a2a", { pos: [0, 0.62, 0.35] }, 0.04));
  for (let i = 0; i < 4; i++) m.solid.push(box(0.05, 0.06, 0.04, "#ffffff", { pos: [-0.11 + i * 0.075, 0.67, 0.41] }));
  m.solid.push(ball(0.07, "#1d1410", [0, 0.84, 0.39]));
  // Owl (middle)
  m.solid.push(cyl(0.34, 0.37, 0.85, c2, { pos: [0, 1.7, 0] }, 12));
  for (const sx of [-1, 1]) {
    m.solid.push(part(new THREE.TorusGeometry(0.11, 0.04, 6, 14), c3, { pos: [sx * 0.14, 1.8, 0.33] }));
    m.solid.push(ball(0.06, "#1d1410", [sx * 0.14, 1.8, 0.35]));
  }
  m.solid.push(part(new THREE.ConeGeometry(0.07, 0.2, 5), "#f08a24", { pos: [0, 1.6, 0.38], rot: [Math.PI / 2 + 0.6, 0, 0] }));
  // Thunderbird (top) with spread, feathered wings
  m.solid.push(cyl(0.26, 0.3, 0.5, c3, { pos: [0, 2.37, 0] }, 12));
  m.solid.push(part(new THREE.ConeGeometry(0.11, 0.42, 6), "#f08a24", { pos: [0, 2.35, 0.38], rot: [Math.PI / 2 + 0.25, 0, 0] }));
  for (const sx of [-1, 1]) {
    m.solid.push(ball(0.07, "#ffffff", [sx * 0.12, 2.48, 0.22]), ball(0.035, "#1d1410", [sx * 0.12, 2.48, 0.28]));
    const feathers = [c1, c2, c3, "#ffffff"];
    for (let f = 0; f < 4; f++) {
      const len = 0.75 - f * 0.12;
      m.solid.push(rbox(len, 0.14, 0.08, feathers[f], { pos: [sx * (0.25 + len / 2), 2.25 - f * 0.13, -0.02], rot: [0, 0, sx * (0.35 - f * 0.12)] }, 0.04));
    }
  }
  m.solid.push(part(new THREE.ConeGeometry(0.14, 0.3, 5), c2, { pos: [0, 2.72, -0.05] }));
  return m;
}

/** A log bench: one big log with lighter cut ends. */
function logBench(seed: number): Model {
  const rand = mulberry32(seed);
  const m = emptyModel();
  m.solid.push(cyl(0.27, 0.29, 2.3, "#7a4e2c", { pos: [0, 0.26, 0], rot: [0, 0, Math.PI / 2] }, 10));
  for (const sx of [-1, 1]) m.solid.push(cyl(0.24, 0.24, 0.03, "#d9b07a", { pos: [sx * 1.16, 0.26, 0], rot: [0, 0, Math.PI / 2] }, 10));
  m.solid.push(pole([0.4, 0.3, 0.22], [0.7, 0.62, 0.35], 0.045, "#6b4426"));
  m.solid.push(ball(0.1, "#4f9a3c", [0.75, 0.66, 0.38], 1, [1.1, 0.7, 1]));
  if (rand() > 0.5) m.solid.push(rockBlob(seed, [0.2, 0.14, 0.18], stoneFn(PAL.stone, 0.6, rand)).translate(-1.4, 0.07, 0.3));
  return m;
}

/** The woven ceremony rug, painted on a canvas. */
function rugTexture(): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const cx = s / 2;
  const ring = (r: number, color: string) => {
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
  };
  ring(254, "#5a3320");
  ring(240, "#b8323a");
  ring(196, "#f2c14e");
  // Zig-zag band
  g.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = i % 2 ? 160 : 192;
    g.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
  }
  g.fillStyle = "#1f8f8a";
  g.fill();
  ring(150, "#1f8f8a");
  ring(132, "#fff1d0");
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a - 0.12) * 134, cx + Math.sin(a - 0.12) * 134);
    g.lineTo(cx + Math.cos(a + 0.12) * 134, cx + Math.sin(a + 0.12) * 134);
    g.lineTo(cx + Math.cos(a) * 100, cx + Math.sin(a) * 100);
    g.fillStyle = i % 2 ? "#b8323a" : "#f08a24";
    g.fill();
  }
  ring(96, "#7b4bb5");
  ring(70, "#f2c14e");
  ring(44, "#b8323a");
  // Woven texture: faint concentric threads
  g.globalAlpha = 0.12;
  for (let r = 6; r < 250; r += 6) {
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.strokeStyle = r % 12 ? "#000" : "#fff";
    g.lineWidth = 2;
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class Decor {
  readonly group = new THREE.Group();
  readonly torchFlames: THREE.Vector3[] = [];
  /** Where the lanterns hang, for the glow they give at night. */
  readonly lanterns: THREE.Vector3[] = [];
  private mats: LandmarkMaterials;

  constructor(world: WorldUniforms, smoke: SmokeSystem, owned: Owned, rugAt: THREE.Vector3, rugRadius: number) {
    this.mats = createMaterials(world);
    Object.values(this.mats).forEach((m) => owned.add(m));
    const rand = mulberry32(31);
    const town = emptyModel();

    for (const [i, c] of COTTAGES.entries()) {
      const { model } = cottage({ size: c.size, seed: 200 + i * 9, roof: c.roof, roofColor: c.roofColor, shutter: c.shutter, plaster: "plaster" in c ? c.plaster : undefined });
      const [x, z] = c.at;
      const pot = flowerPot(i * 5 + 1);
      addModel(model, pot, placeAt(1.5, 0.12, 4.3 * c.size / 2 + 0.85));
      addModel(town, model, placeAt(x, -0.25, z, faceDir(RING.x - x, RING.z - z)));
    }

    // Lantern posts in a wide arc behind the circle, strung together with bunting
    const tops: [number, number, number][] = [];
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.08 + (i / 6) * 0.84);
      const x = RING.x + Math.cos(a) * 10.4;
      const z = RING.z + Math.sin(a) * 10.4;
      addModel(town, lanternPost(3.4), placeAt(x, 0, z, faceDir(RING.x - x, RING.z - z) + Math.PI / 2));
      tops.push([x, 3.35, z]);
      this.lanterns.push(new THREE.Vector3(x, 3.35, z));
    }
    for (let i = 0; i < tops.length - 1; i++) addModel(town, bunting(tops[i], tops[i + 1], 0.6, i * 3));

    // Totems flanking the fire, torches around the circle
    for (const [x, z, s] of [[-6.6, -4.9, 0], [6.6, -4.9, 1], [-8.4, 3.2, 1], [8.4, 3.2, 0]] as const) {
      addModel(town, totem(s + (x > 0 ? 2 : 0)), placeAt(x, 0, z, faceDir(RING.x - x, RING.z - z), z > 0 ? 0.85 : 1));
    }
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (1.12 + (i / 5) * 0.76) + (i > 2 ? 0 : 0);
      const x = RING.x + Math.cos(a) * 8.3;
      const z = RING.z + Math.sin(a) * 8.3;
      const t = torch(1.7);
      addModel(town, t, placeAt(x, 0, z));
    }
    for (const b of BENCHES) addModel(town, logBench(Math.round(b.x * 10)), placeAt(b.x, 0, b.z, b.rot));

    // Ring of stones bordering the circle (open towards the camera)
    for (let i = 0; i < 22; i++) {
      const a = Math.PI * (0.78 + (i / 21) * 1.44);
      const r = RING.r + 1.1 + rand() * 0.3;
      town.solid.push(rockBlob(i + 50, [0.32 + rand() * 0.12, 0.2 + rand() * 0.1, 0.28], stoneFn("#9a938a", 0.6, rand)).translate(RING.x + Math.cos(a) * r, 0.08, RING.z + Math.sin(a) * r));
    }
    // Barrels, crates and baskets near the houses
    addModel(town, barrel(3, 1.0), placeAt(-11.2, 0, -6.2));
    addModel(town, barrel(4, 0.9), placeAt(-10.4, 0, -6.9));
    addModel(town, crate(5, 0.8), placeAt(11.5, 0, -6.4, 0.4));
    addModel(town, barrel(6, 1.0), placeAt(12.2, 0, -5.6));

    this.flush(town);
    this.torchFlames.push(...town.flames);
    if (town.flames.length) {
      const flames = new THREE.InstancedMesh(flameGeometry(), this.mats.flame, town.flames.length);
      const m = new THREE.Matrix4();
      town.flames.forEach((p, i) => flames.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
      flames.computeBoundingSphere();
      this.group.add(flames);
    }
    smoke.add(town.chimneys, "chimney");

    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(rugRadius, 64).rotateX(-Math.PI / 2),
      owned.add(new THREE.MeshStandardMaterial({ map: owned.add(rugTexture()), roughness: 0.95 })),
    );
    rug.position.set(rugAt.x, 0.02, rugAt.z);
    rug.receiveShadow = true;
    this.group.add(rug);
  }

  private flush(model: Model): void {
    const make = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadows: boolean) => {
      if (!geos.length) return;
      const mesh = new THREE.Mesh(merge(geos), mat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      this.group.add(mesh);
    };
    make(model.solid, this.mats.solid, true);
    make(model.cloth, this.mats.cloth, true);
    make(model.glow, this.mats.glow, false);
    make(model.pulse, this.mats.pulse, false);
  }
}
