/**
 * The cave's puzzle hardware: stone levers with glowing crystal knobs, iron
 * portcullis gates with rune gems, the secret wall in front of the sword
 * chamber, and the rune trails that carry a lever's light along the floor to
 * its gate. Each piece animates itself; the challenge only flips their state.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mat, toonMesh } from "../../characters/parts";

const STONE = "#6d6690";
const STONE_DARK = "#655c80";
const IRON = "#4b4f63";

const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

/** A floor lever on a rune pedestal. Swings from left to right when pulled. */
export class Lever {
  readonly group = new THREE.Group();
  readonly color: THREE.Color;
  pulled = false;
  private arm = new THREE.Group();
  private knob: THREE.Mesh;
  private glyph: THREE.Mesh;
  private halo: THREE.Mesh;
  private t = 1;
  private from = 0.75;
  private to = 0.75;

  constructor(color: string, halo: THREE.Texture) {
    this.color = new THREE.Color(color);
    const base = toonMesh(new RoundedBoxGeometry(0.95, 0.7, 0.75, 3, 0.12), mat(STONE, 0.8));
    base.position.y = 0.35;
    const cap = toonMesh(new RoundedBoxGeometry(0.75, 0.16, 0.55, 2, 0.05), mat(STONE_DARK, 0.7));
    cap.position.y = 0.76;
    this.glyph = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), mat(color, 0.3, 0.5));
    this.glyph.scale.set(1, 1.4, 0.35);
    this.glyph.position.set(0, 0.38, 0.39);
    this.group.add(base, cap, this.glyph);

    this.arm.position.y = 0.8;
    const stick = toonMesh(new THREE.CylinderGeometry(0.055, 0.07, 0.9, 8), mat("#8a5530", 0.7));
    stick.position.y = 0.45;
    this.knob = toonMesh(new THREE.IcosahedronGeometry(0.17, 1), mat(color, 0.25, 1.4));
    this.knob.position.y = 0.95;
    const hinge = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), mat(IRON, 0.5));
    hinge.rotation.x = Math.PI / 2;
    this.arm.add(stick, this.knob, hinge);
    this.arm.rotation.z = this.from;
    this.group.add(this.arm);

    // Soft pulsing halo on the floor so unpulled levers are easy to spot in the dark
    const haloMat = new THREE.MeshBasicMaterial({
      map: halo,
      color: this.color.clone().multiplyScalar(1.2),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), haloMat);
    this.halo.position.y = 0.05;
    this.group.add(this.halo);
  }

  dispose(): void {
    (this.halo.material as THREE.Material).dispose();
  }

  /** World position of the knob (for sparks). */
  knobPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.knob.getWorldPosition(out);
  }

  pull(): void {
    this.pulled = true;
    this.swing(-0.75);
    this.glyph.material = mat(`#${this.color.getHexString()}`, 0.3, 3.2);
  }

  reset(): void {
    this.pulled = false;
    this.swing(0.75);
    this.glyph.material = mat(`#${this.color.getHexString()}`, 0.3, 0.5);
  }

  private swing(to: number): void {
    this.from = this.arm.rotation.z;
    this.to = to;
    this.t = 0;
  }

  update(dt: number, time: number): void {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / 0.4);
      this.arm.rotation.z = THREE.MathUtils.lerp(this.from, this.to, easeOutBack(this.t));
    }
    const m = this.halo.material as THREE.MeshBasicMaterial;
    m.opacity = this.pulled ? 0.25 : 0.55 + 0.35 * Math.sin(time * 3);
    this.knob.scale.setScalar(this.pulled ? 1 : 1 + Math.sin(time * 4) * 0.08);
  }
}

/** Iron portcullis between two stone pillars, with one rune gem per lever on the lintel. */
export class Gate {
  readonly group = new THREE.Group();
  open = false;
  private bars = new THREE.Group();
  private gems: THREE.Mesh[] = [];
  private openT = -1;
  /** Gems light in the colour of their lever. */
  constructor(private colors: THREE.Color[]) {
    for (const sx of [-1, 1]) {
      const pillar = toonMesh(new RoundedBoxGeometry(0.75, 3.0, 0.95, 3, 0.14), mat(STONE, 0.85));
      pillar.position.set(sx * 1.75, 1.5, 0);
      const foot = toonMesh(new RoundedBoxGeometry(0.95, 0.4, 1.15, 2, 0.1), mat(STONE_DARK, 0.85));
      foot.position.set(sx * 1.75, 0.2, 0);
      this.group.add(pillar, foot);
    }
    const lintel = toonMesh(new RoundedBoxGeometry(4.4, 0.7, 1.05, 3, 0.16), mat(STONE, 0.85));
    lintel.position.y = 3.15;
    this.group.add(lintel);
    colors.forEach((c, i) => {
      const x = (i - (colors.length - 1) / 2) * 0.62;
      const socket = toonMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), mat(STONE_DARK, 0.7));
      socket.rotation.x = Math.PI / 2;
      socket.position.set(x, 3.15, 0.53);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), mat("#3a3450", 0.4));
      gem.position.set(x, 3.15, 0.62);
      this.group.add(socket, gem);
      this.gems.push(gem);
    });

    const iron = mat(IRON, 0.45);
    for (let i = 0; i < 6; i++) {
      const x = -1.3 + (i * 2.6) / 5;
      const bar = toonMesh(new THREE.CylinderGeometry(0.075, 0.075, 2.7, 8), iron);
      bar.position.set(x, 1.35, 0);
      const tip = toonMesh(new THREE.ConeGeometry(0.12, 0.3, 8), iron);
      tip.position.set(x, 2.8, 0);
      this.bars.add(bar, tip);
    }
    for (const y of [0.7, 1.95]) {
      const cross = toonMesh(new RoundedBoxGeometry(2.9, 0.16, 0.16, 2, 0.05), iron);
      cross.position.y = y;
      this.bars.add(cross);
    }
    this.group.add(this.bars);
  }

  /** Light gem `i` (its lever was pulled). */
  light(i: number): void {
    const c = this.colors[i];
    this.gems[i].material = mat(`#${c.getHexString()}`, 0.2, 3.5);
    this.gems[i].scale.setScalar(1.6);
  }

  /** Start the rumbling slide into the floor. */
  startOpening(): void {
    this.openT = 0;
  }

  /** Whether a closed gate blocks the point (x, z) given in the gate's local frame. */
  blocksLocal(lx: number, lz: number): boolean {
    return !this.open && Math.abs(lx) < 1.6 && Math.abs(lz) < 0.6;
  }

  get rumbling(): boolean {
    return this.openT >= 0 && this.openT < 1;
  }

  update(dt: number, time: number): void {
    for (const g of this.gems) {
      g.rotation.y = time * 1.5;
      g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, g.scale.x > 1.05 ? 1.15 : 1, Math.min(dt * 4, 1)));
    }
    if (this.openT < 0 || this.openT >= 1) return;
    this.openT = Math.min(1, this.openT + dt / 2.2);
    const k = easeInOut(this.openT);
    this.bars.position.y = -3.1 * k;
    // Reason: a little sideways shiver sells the weight of the rumbling iron
    this.bars.position.x = Math.sin(time * 60) * 0.035 * (1 - k);
    if (this.openT >= 1) this.open = true;
  }
}

/** Carved slab hiding the sword chamber. Shows the lever order with three gems. */
export class SecretWall {
  readonly group = new THREE.Group();
  open = false;
  private slab = new THREE.Group();
  private gems: THREE.Mesh[] = [];
  private order: THREE.Color[] = [];
  private progress = 0;
  private wrongT = 0;
  private openT = -1;
  private cracks: THREE.Mesh[] = [];

  constructor() {
    const stone = toonMesh(new RoundedBoxGeometry(3.4, 3.1, 0.9, 3, 0.18), mat("#706790", 0.9));
    stone.position.y = 1.55;
    this.slab.add(stone);
    // Sword emblem: blade, guard and grip in faint carved light
    const emblem = mat("#9fd8ff", 0.3, 0.9);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.05), emblem);
    blade.position.set(0, 2.15, 0.46);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.11, 0.05), emblem);
    guard.position.set(0, 1.5, 0.46);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.36, 0.05), emblem);
    grip.position.set(0, 1.28, 0.46);
    this.slab.add(blade, guard, grip);
    for (let i = 0; i < 3; i++) {
      const socket = toonMesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 14), mat("#4f4766", 0.7));
      socket.rotation.x = Math.PI / 2;
      socket.position.set((i - 1) * 0.85, 0.7, 0.47);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), mat("#3a3450", 0.4));
      gem.position.set((i - 1) * 0.85, 0.7, 0.56);
      this.slab.add(socket, gem);
      this.gems.push(gem);
    }
    // Golden light leaking through the cracks around the slab
    const leak = mat("#ffd27a", 0.4, 1.8);
    for (const [w, h, x, y] of [[0.05, 2.9, -1.72, 1.5], [0.05, 2.9, 1.72, 1.5], [3.3, 0.05, 0, 3.12]]) {
      const crack = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), leak);
      crack.position.set(x, y, 0.1);
      this.cracks.push(crack);
      this.group.add(crack);
    }
    this.group.add(this.slab);
  }

  /** The colours of the levers in the order they must be pulled. */
  showOrder(order: THREE.Color[]): void {
    this.order = order;
    this.setProgress(0);
  }

  /** How many levers of the order have been pulled correctly. */
  setProgress(n: number): void {
    this.progress = n;
    this.gems.forEach((g, i) => {
      const lit = i < n;
      g.material = mat(`#${this.order[i].getHexString()}`, 0.25, lit ? 3.4 : 1.1);
    });
  }

  /** Blink red and start the order again from the first gem. */
  flashWrong(): void {
    this.wrongT = 1;
    this.progress = 0;
  }

  startOpening(): void {
    this.openT = 0;
  }

  blocksLocal(lx: number, lz: number): boolean {
    return !this.open && Math.abs(lx) < 1.7 && Math.abs(lz) < 0.65;
  }

  get rumbling(): boolean {
    return this.openT >= 0 && this.openT < 1;
  }

  update(dt: number, time: number): void {
    this.gems.forEach((g, i) => {
      g.rotation.y = time * 1.2 + i;
      // Reason: the next gem to match bobs and pulses so it's clear which colour comes next
      const next = i === this.progress && this.openT < 0;
      g.scale.setScalar(next ? 1.25 + Math.sin(time * 6) * 0.2 : 1);
    });
    if (this.wrongT > 0) {
      this.wrongT = Math.max(0, this.wrongT - dt * 1.6);
      const red = Math.sin(this.wrongT * 18) > 0 && this.wrongT > 0.2;
      if (red) for (const g of this.gems) g.material = mat("#ff3b3b", 0.3, 3);
      else this.setProgress(this.progress);
    }
    if (this.openT < 0 || this.openT >= 1) return;
    this.openT = Math.min(1, this.openT + dt / 2.6);
    const k = easeInOut(this.openT);
    this.slab.position.y = -3.3 * k;
    this.slab.position.x = Math.sin(time * 55) * 0.04 * (1 - k);
    for (const c of this.cracks) c.scale.y = 1 - k;
    if (this.openT >= 1) {
      this.open = true;
      for (const c of this.cracks) c.visible = false;
    }
  }
}

const TRAIL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const TRAIL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uFill;
uniform float uTime;
varying vec2 vUv;
void main() {
  float d = vUv.x;
  float across = abs(vUv.y);
  // A row of diamond-shaped rune stones along the path
  float seg = fract(d / 0.62);
  float dia = 1.0 - (abs(seg - 0.5) * 2.2 + across * 0.95);
  float a = smoothstep(0.0, 0.18, dia);
  float lit = 1.0 - smoothstep(uFill - 0.05, uFill + 0.05, d);
  float head = exp(-abs(d - uFill) * 2.5) * step(0.01, uFill);
  float idle = 0.22 + 0.12 * sin(uTime * 2.4 - d * 0.9);
  float on = (1.6 + 0.4 * sin(uTime * 4.0 - d * 1.8)) * lit + head * 3.0;
  gl_FragColor = vec4(uColor * max(idle, on), a);
}`;

/** Glowing rune path on the floor from a lever to its gate. `fill` animates from 0 to the trail length. */
export class RuneTrail {
  readonly mesh: THREE.Mesh;
  readonly length: number;
  private uniforms: { uColor: { value: THREE.Color }; uFill: { value: number }; uTime: { value: number } };
  private filling = false;
  /** Called once the light reaches the gate. */
  onArrive: (() => void) | null = null;

  constructor(points: THREE.Vector3[], color: THREE.Color, time: { value: number }) {
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    this.length = curve.getLength();
    const steps = Math.max(2, Math.ceil(this.length / 0.12));
    const pos: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    const w = 0.17;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(w);
      pos.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z);
      uv.push(t * this.length, 1, t * this.length, -1);
      if (i < steps) {
        const a = i * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    this.uniforms = { uColor: { value: color.clone() }, uFill: { value: 0 }, uTime: time };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.renderOrder = 1;
  }

  /** Run the light from the lever to the gate. */
  ignite(): void {
    this.filling = true;
  }

  /** Switch the trail dark again (wrong order in the rune hall). */
  extinguish(): void {
    this.filling = false;
    this.uniforms.uFill.value = 0;
  }

  update(dt: number): void {
    if (!this.filling) return;
    const f = this.uniforms.uFill;
    if (f.value >= this.length) return;
    f.value = Math.min(this.length + 0.5, f.value + dt * 9);
    if (f.value >= this.length) this.onArrive?.();
  }
}
