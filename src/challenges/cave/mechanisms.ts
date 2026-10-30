/**
 * The cave's puzzle pieces: the golden mushrooms the mole loves, his wish in a
 * thought bubble, the rockfalls he digs through, the three crystals of the old
 * people's test and the smooth crystal wall in front of the sword. Each piece
 * animates itself; the challenge only flips their state.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mat, toonMesh } from "../../characters/parts";
import { mulberry32 } from "../../core/noise";
import { Bursts } from "../shared/bursts";
import { CrystalColor } from "./layout";
import { GlowField, crystalMaterial, instances, rockMaterial } from "./materials";
import { boulder, crystalCluster } from "./models";

const easeInOut = (t: number) => t * t * (3 - 2 * t);

/** Glow colour of each test crystal (also used for its pool of light). */
export const TEST_HEX: Record<CrystalColor, string> = { red: "#ff2f2a", white: "#f2f6ff", green: "#2dff4e" };

// Reason: deep tints, because a pale tip would burn to white under the bloom and the colour is the whole clue
const TEST_TINTS: Record<CrystalColor, [string, string]> = {
  red: ["#8a070c", "#ff3a2a"],
  white: ["#93a4cc", "#f4f7ff"],
  green: ["#07701c", "#4dff62"],
};

/** Inner glow of each test crystal: resting and touched. White needs less to look just as bright. */
const TEST_GLOW: Record<CrystalColor, [number, number]> = { red: [1.05, 2.3], white: [0.55, 1.15], green: [0.9, 2.0] };

const additiveHalo = (tex: THREE.Texture, color: THREE.ColorRepresentation, size: number) => {
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), material);
};

/** One golden mushroom with pale spots, about 0.7 tall: the only kind the mole wants. */
export function goldenMushroom(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const stem = toonMesh(new THREE.CylinderGeometry(0.1, 0.15, 0.44, 10), mat("#fff1cf", 0.7, 0.6));
  stem.position.y = 0.22;
  const dome = new THREE.SphereGeometry(0.34, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.8, 1);
  const cap = toonMesh(dome, mat("#ffab14", 0.45, 0.62));
  cap.position.y = 0.4;
  const dot = new THREE.SphereGeometry(0.052, 8, 6);
  const white = mat("#fff8dc", 0.4, 0.8);
  for (const [a, up] of [[0.4, 0.55], [1.9, 0.5], [3.2, 0.62], [4.6, 0.48], [5.6, 0.72], [0, 1.25]]) {
    const spot = new THREE.Mesh(dot, white);
    spot.position.set(Math.cos(a) * Math.cos(up) * 0.33, 0.4 + Math.sin(up) * 0.262, Math.sin(a) * Math.cos(up) * 0.33);
    spot.scale.set(1, 0.6, 1);
    g.add(spot);
  }
  g.add(stem, cap);
  g.scale.setScalar(scale);
  return g;
}

/** A clump of golden mushrooms on the floor, pulsing and sparkling so it can be seen from afar. */
export class Mushroom {
  readonly group = new THREE.Group();
  picked = false;
  private body = new THREE.Group();
  private halo: THREE.Mesh;
  private pickT = -1;
  private sparkleIn = 0;

  constructor(
    tex: THREE.Texture,
    private sparks: Bursts,
  ) {
    const big = goldenMushroom(2.1);
    const left = goldenMushroom(1.2);
    left.position.set(-0.68, 0, 0.22);
    left.rotation.z = 0.12;
    const right = goldenMushroom(0.9);
    right.position.set(0.56, 0, 0.42);
    right.rotation.z = -0.16;
    this.body.add(big, left, right);
    this.halo = additiveHalo(tex, new THREE.Color(1.1, 0.72, 0.2), 3.4);
    this.halo.position.y = 0.06;
    this.group.add(this.body, this.halo);
  }

  /** Take it: it hops up and vanishes (Tadeo carries it from here). */
  pick(): void {
    this.picked = true;
    this.pickT = 0;
  }

  update(dt: number, time: number): void {
    const halo = this.halo.material as THREE.MeshBasicMaterial;
    if (this.picked) {
      if (this.pickT >= 1) return;
      this.pickT = Math.min(1, this.pickT + dt / 0.4);
      const k = this.pickT;
      this.body.position.y = Math.sin(k * Math.PI) * 0.9;
      this.body.scale.setScalar(1 - k * k);
      halo.opacity = 0.7 * (1 - k);
      if (k >= 1) this.group.visible = false;
      return;
    }
    this.body.scale.setScalar(1 + Math.sin(time * 3.2) * 0.035);
    halo.opacity = 0.46 + Math.sin(time * 3.2) * 0.14;
    this.sparkleIn -= dt;
    if (this.sparkleIn <= 0) {
      this.sparkleIn = 0.28;
      const p = this.group.position;
      this.sparks.emit(new THREE.Vector3(p.x + (Math.random() - 0.5) * 1.2, p.y + 0.5 + Math.random() * 0.8, p.z + (Math.random() - 0.5) * 1.2), {
        count: 1,
        color: new THREE.Color(2.6, 1.9, 0.6),
        speed: [0.1, 0.3],
        up: 0.9,
        life: [0.8, 1.3],
        size: [0.06, 0.12],
        gravity: -0.2,
      });
    }
  }

  dispose(): void {
    (this.halo.material as THREE.Material).dispose();
  }
}

/** A little golden mushroom drawn on a thought bubble: full colour when Tadeo has it, a grey outline when not. */
function drawWishMushroom(ctx: CanvasRenderingContext2D, x: number, y: number, have: boolean): void {
  ctx.lineWidth = 7;
  ctx.lineJoin = "round";
  ctx.strokeStyle = have ? "#7a4a0c" : "#b9b2a6";
  ctx.fillStyle = have ? "#fff1cf" : "#f1ede4";
  ctx.beginPath();
  ctx.roundRect(x - 13, y - 4, 26, 42, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = have ? "#ffab14" : "#e4dfd4";
  ctx.beginPath();
  ctx.moveTo(x - 46, y + 6);
  ctx.bezierCurveTo(x - 46, y - 48, x + 46, y - 48, x + 46, y + 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (!have) return;
  ctx.fillStyle = "#fff8dc";
  for (const [dx, dy, r] of [[-20, -12, 7], [6, -20, 8], [24, -6, 6]]) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The mole's thought bubble: one mushroom per wish, coloured in as Tadeo finds them. */
export class MoleWish {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement("canvas");
  private texture: THREE.CanvasTexture;

  constructor() {
    this.canvas.width = 340;
    this.canvas.height = 220;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    // Reason: tinted below the bloom threshold, so the white cloud doesn't swallow the mushrooms drawn on it
    const material = new THREE.SpriteMaterial({ map: this.texture, color: new THREE.Color(0.6, 0.6, 0.6), transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(2.65, 1.71, 1);
    this.sprite.renderOrder = 6;
    this.show(1, 0);
  }

  /** Draw `wants` mushrooms, `have` of them coloured in. */
  show(wants: number, have: number): void {
    const ctx = this.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 340, 220);
    ctx.fillStyle = "#fffdf6";
    ctx.strokeStyle = "#2a1b12";
    ctx.lineWidth = 7;
    const puffs = [[170, 88, 112, 72], [78, 96, 56, 48], [262, 96, 56, 48], [170, 40, 60, 28]];
    for (const pass of ["stroke", "fill"] as const) {
      ctx.beginPath();
      for (const [x, y, rx, ry] of puffs) {
        ctx.moveTo(x + rx, y);
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      }
      ctx.arc(135, 180, 16, 0, Math.PI * 2);
      ctx.moveTo(115, 208);
      ctx.arc(107, 208, 9, 0, Math.PI * 2);
      ctx[pass]();
    }
    const gap = wants === 1 ? 0 : 56;
    for (let i = 0; i < wants; i++) drawWishMushroom(ctx, 170 + (i - (wants - 1) / 2) * gap * 2, 100, i < have);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}

/** Boulders tumbled into a corridor. The mole's digging sends them rolling aside. */
export class Rockfall {
  /** Middle of the blocked corridor cell (the pile spills towards +z, Tadeo's side). */
  readonly at: THREE.Vector3;
  readonly group = new THREE.Group();
  open = false;
  private rocks: { from: THREE.Vector3; to: THREE.Vector3; scale: number; spin: THREE.Euler; delay: number; mesh: number; slot: number }[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private clearT = -1;
  private cleared: (() => void) | null = null;
  private clearing: Promise<void> | null = null;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(at: THREE.Vector3, seed: number, glow: GlowField, owned: THREE.Material[]) {
    this.at = at.clone();
    const rand = mulberry32(seed);
    // Reason: rows from the back of the corridor to the toe of the pile, each lower than the one behind, so it reads as a slope of fallen rock
    const rows: [number, number, number, number, number][] = [
      // count, z, y, half width, scale
      [5, -1.0, 1.9, 1.5, 1.2],
      [6, -0.6, 0.45, 2.0, 1.55],
      [4, -0.2, 1.6, 1.5, 1.05],
      [6, 0.45, 0.35, 2.2, 1.3],
      [4, 0.75, 1.0, 1.45, 0.85],
      [6, 1.3, 0.1, 2.15, 0.82],
      [4, 1.85, 0.0, 1.6, 0.42],
    ];
    const lists: THREE.Matrix4[][] = [[], [], []];
    let n = 0;
    for (const [count, dz, y, half, size] of rows) {
      for (let i = 0; i < count; i++, n++) {
        const side = count > 1 ? i / (count - 1) - 0.5 : 0;
        const x = at.x + side * 2 * half + (rand() - 0.5) * 0.3;
        const z = at.z + dz + (rand() - 0.5) * 0.3;
        const scale = size * (0.82 + rand() * 0.36);
        const from = new THREE.Vector3(x, y + (rand() - 0.5) * 0.15, z);
        // Reason: they end up as rubble along the corridor walls, leaving the middle free to walk
        const sign = side === 0 ? (rand() < 0.5 ? -1 : 1) : Math.sign(side);
        const to = new THREE.Vector3(at.x + sign * (1.78 + rand() * 0.75), -0.18, at.z + (rand() - 0.5) * 3.4);
        const spin = new THREE.Euler(rand() * 3, rand() * 6, rand() * 3);
        const mesh = n % 3;
        this.rocks.push({ from, to, scale, spin, delay: (1 - y / 2.2) * 0.42 + rand() * 0.28, mesh, slot: lists[mesh].length });
        this.e.copy(spin);
        lists[mesh].push(new THREE.Matrix4().compose(from, this.q.setFromEuler(this.e), new THREE.Vector3(scale, scale, scale)));
      }
    }
    const material = rockMaterial({ xray: true });
    owned.push(material);
    lists.forEach((matrices, v) => {
      const geo = boulder(v + seed);
      const mesh = instances(geo, material, matrices, glow, false);
      geo.dispose();
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.group.add(mesh);
    });
  }

  /** Send the rocks rolling aside. Resolves when the way is free. */
  clear(): Promise<void> {
    if (this.clearing) return this.clearing;
    this.clearT = 0;
    this.clearing = new Promise((resolve) => (this.cleared = resolve));
    return this.clearing;
  }

  get rumbling(): boolean {
    return this.clearT >= 0 && !this.open;
  }

  /** Whether the pile blocks a point given relative to the corridor's middle. */
  blocksLocal(lx: number, lz: number): boolean {
    return !this.open && Math.abs(lx) < 2.1 && lz > -1.4 && lz < 2.0;
  }

  update(dt: number): void {
    if (!this.rumbling) return;
    this.clearT += dt;
    let moving = false;
    for (const r of this.rocks) {
      const k = THREE.MathUtils.clamp((this.clearT - r.delay) / 1.15, 0, 1);
      if (k < 1) moving = true;
      const t = easeInOut(k);
      this.p.lerpVectors(r.from, r.to, t);
      // Reason: a hop half way sells each stone rolling off the heap instead of sliding through it
      this.p.y += Math.sin(k * Math.PI) * 0.65;
      this.e.set(r.spin.x + t * 4, r.spin.y + t * 2, r.spin.z - t * 3);
      const s = r.scale * (1 - 0.62 * t);
      this.s.set(s, s, s);
      this.m.compose(this.p, this.q.setFromEuler(this.e), this.s);
      this.meshes[r.mesh].setMatrixAt(r.slot, this.m);
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
    if (!moving) {
      this.open = true;
      this.cleared?.();
    }
  }
}

/** A tall crystal of the old test. Glows softly until touched, then blazes. */
export class CrystalButton {
  readonly group = new THREE.Group();
  lit = false;
  private material: THREE.MeshStandardMaterial;
  private cluster: THREE.Mesh;
  private halo: THREE.Mesh;
  private pop = 0;
  private flash = 0;

  constructor(
    readonly color: CrystalColor,
    tex: THREE.Texture,
    time: { value: number },
    owned: THREE.Material[],
  ) {
    this.material = crystalMaterial(TEST_GLOW[color][0], time);
    owned.push(this.material);
    const seed = { red: 12, white: 3, green: 22 }[color];
    this.cluster = new THREE.Mesh(crystalCluster(seed, TEST_TINTS[color]), this.material);
    this.cluster.scale.setScalar(1.75);
    this.cluster.castShadow = false;
    this.halo = additiveHalo(tex, new THREE.Color(TEST_HEX[color]), 4.6);
    this.halo.position.y = 0.07;
    this.group.add(this.cluster, this.halo);
  }

  /** World point near its top (for sparks). */
  topPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.group.position).add(new THREE.Vector3(0, 2.2, 0));
  }

  touch(): void {
    this.lit = true;
    this.pop = 1;
  }

  dim(): void {
    this.lit = false;
    this.flash = 1;
  }

  update(dt: number, time: number): void {
    this.pop = Math.max(0, this.pop - dt * 2.4);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    const [rest, touched] = TEST_GLOW[this.color];
    const want = this.lit ? touched : rest * (1 + Math.sin(time * 2 + this.group.position.x) * 0.15);
    this.material.emissiveIntensity += (want - this.material.emissiveIntensity) * (1 - Math.exp(-dt * 7));
    this.cluster.scale.setScalar(1.75 * (1 + this.pop * 0.14 - this.flash * Math.sin(this.flash * 18) * 0.04));
    const halo = this.halo.material as THREE.MeshBasicMaterial;
    halo.opacity = this.lit ? 0.62 : 0.26 + Math.sin(time * 2 + this.group.position.x) * 0.06;
    this.halo.scale.setScalar(this.lit ? 1.25 : 1);
  }

  dispose(): void {
    (this.halo.material as THREE.Material).dispose();
  }
}

const SLAB_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  // Reason: dark at the edges and light around the sword, so one looks deep into the crystal instead of at a blue board
  vec2 p = (vUv - vec2(0.5, 0.56)) * vec2(1.0, 1.3);
  float heart = 1.0 - smoothstep(0.0, 0.62, length(p));
  vec3 col = mix(vec3(0.012, 0.035, 0.13), vec3(0.08, 0.3, 0.66), heart * heart);
  // Reason: two slow, wide bands of light drifting over it make it read as polished
  float d = vUv.x * 1.3 + vUv.y;
  float band = smoothstep(0.3, 1.0, sin(d * 3.1 - uTime * 0.55)) * 0.1 + smoothstep(0.55, 1.0, sin(d * 6.7 + uTime * 0.35)) * 0.05;
  gl_FragColor = vec4(col + vec3(0.5, 0.75, 1.0) * band, 1.0);
}`;

const SLAB_VERT = "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";

/** The old people's door: a smooth slab of crystal with the sword's shape deep inside and three gems for the test. */
export class CrystalWall {
  readonly group = new THREE.Group();
  open = false;
  /** Resolves when the wall has sunk and the way is free. */
  readonly opening: Promise<void>;
  private finishOpening!: () => void;
  private slab = new THREE.Group();
  private gems: THREE.Mesh[] = [];
  private gemHex: string[];
  private openT = -1;

  constructor(order: CrystalColor[], time: { value: number }, owned: THREE.Material[]) {
    this.opening = new Promise((resolve) => (this.finishOpening = resolve));
    this.gemHex = order.map((c) => TEST_HEX[c]);
    const stone = new THREE.MeshStandardMaterial({ color: "#14306e", emissive: "#0a1f5c", emissiveIntensity: 0.5, roughness: 0.14, metalness: 0.1, flatShading: true });
    owned.push(stone);
    const body = new THREE.Mesh(new RoundedBoxGeometry(4.2, 3.4, 0.7, 2, 0.14), stone);
    body.position.y = 1.7;
    body.castShadow = false;
    this.slab.add(body);

    const faceMat = new THREE.ShaderMaterial({ uniforms: { uTime: time }, vertexShader: SLAB_VERT, fragmentShader: SLAB_FRAG });
    owned.push(faceMat);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 3.3), faceMat);
    face.position.set(0, 1.7, 0.36);
    this.slab.add(face);

    // The sword's shape, deep inside the crystal: what this door is hiding
    const inside = mat("#bfe9ff", 0.3, 0.95);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.17, 1.15, 0.05), inside);
    blade.position.set(0, 1.42, 0.37);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 4).rotateY(Math.PI / 4), inside);
    tip.scale.z = 0.25;
    tip.rotation.x = Math.PI;
    tip.position.set(0, 0.74, 0.37);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.11, 0.05), mat("#ffd36a", 0.3, 1.4));
    guard.position.set(0, 2.03, 0.37);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.05), mat("#ffd36a", 0.3, 1.4));
    grip.position.set(0, 2.25, 0.37);
    this.slab.add(blade, tip, guard, grip);

    for (let i = 0; i < 3; i++) {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), mat(this.gemHex[i], 0.3, 0.25));
      gem.position.set((i - 1) * 1.15, 0.6, 0.42);
      this.slab.add(gem);
      this.gems.push(gem);
    }
    this.group.add(this.slab);
  }

  /** Light the gems of the crystals touched so far. */
  setProgress(n: number): void {
    this.gems.forEach((g, i) => {
      g.material = mat(this.gemHex[i], 0.3, i < n ? 2.2 : 0.25);
      g.scale.setScalar(i < n ? 1.35 : 1);
    });
  }

  startOpening(): void {
    this.openT = 0;
  }

  blocksLocal(lx: number, lz: number): boolean {
    return !this.open && Math.abs(lx) < 2.0 && Math.abs(lz) < 0.7;
  }

  get rumbling(): boolean {
    return this.openT >= 0 && !this.open;
  }

  update(dt: number, time: number): void {
    this.gems.forEach((g, i) => (g.rotation.y = time * 1.2 + i));
    if (!this.rumbling) return;
    this.openT = Math.min(1, this.openT + dt / 2.6);
    const k = easeInOut(this.openT);
    this.slab.position.y = -3.6 * k;
    this.slab.position.x = Math.sin(time * 55) * 0.04 * (1 - k);
    if (this.openT >= 1) {
      this.open = true;
      this.slab.visible = false;
      this.finishOpening();
    }
  }
}
