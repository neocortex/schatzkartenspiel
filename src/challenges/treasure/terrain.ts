/**
 * Shape of the little treasure island: one analytic height function (mirrored
 * in GLSL so the lagoon shader knows the water depth everywhere), plus the dig
 * hole and sand pile at the red X, and the sand mesh with painted vertex
 * colours (white dry sand, darker wet sand at the waterline, a grassy dune).
 */

import * as THREE from "three";
import { Noise2D, smoothstep } from "../../core/noise";

/** Island ellipse (centre and radii in metres); the coral reef rings it further out. */
export const ISLAND = { cx: 0, cz: -2.5, rx: 13.5, rz: 10.5 };
export const REEF_R = 46;
/** Where the treasure is buried (the red X). */
export const X_AT = new THREE.Vector2(0, 0);
/** Where the dug-out sand lands (behind Tadeo's left shoulder while he digs). */
export const PILE_AT = new THREE.Vector2(1.7, -2.1);
/** Ground height of the flat dig site around the X. */
export const PLATEAU = 0.55;
export const HOLE_R = 1.15;

/** Normalised elliptical distance from the island centre (1 ≈ just past the waterline). */
function islandR(x: number, z: number): number {
  const dx = (x - ISLAND.cx) / ISLAND.rx;
  const dz = (z - ISLAND.cz) / ISLAND.rz;
  const a = Math.atan2(dz, dx);
  const wob = 1 + 0.07 * Math.sin(a * 3 + 0.6) + 0.045 * Math.sin(a * 5 + 2.1) + 0.03 * Math.sin(a * 8 + 1.3);
  return Math.hypot(dx, dz) / wob;
}

/** Natural ground height (island, lagoon floor, reef, open sea); sea level is y = 0. */
export function seaHeight(x: number, z: number): number {
  const r = islandR(x, z);
  const core = 1 - smoothstep(0.62, 1.12, r);
  let h = -0.9 + 1.45 * core;
  // A grassy dune behind the X
  const ddx = x + 1;
  const ddz = z + 7.5;
  h += 1.1 * Math.exp(-((ddx * ddx) / 40 + (ddz * ddz) / 12)) * core;
  // Lagoon floor with sand ripples
  h -= 1.6 * smoothstep(1.12, 2.4, r);
  h += 0.12 * Math.sin(x * 0.9 + z * 0.3) * Math.sin(z * 0.7 - x * 0.2) * smoothstep(1.0, 1.4, r);
  // Coral reef ring just under the surface, then the deep open sea
  const d = Math.hypot(x - ISLAND.cx, z - ISLAND.cz);
  const a = Math.atan2(z - ISLAND.cz, x - ISLAND.cx);
  const reef = (d - REEF_R - 2 * Math.sin(a * 4 + 1)) / 3.2;
  h += 2.3 * Math.exp(-reef * reef) * (0.85 + 0.15 * Math.sin(a * 9));
  h -= 7 * smoothstep(REEF_R + 3, REEF_R + 18, d);
  return h;
}

/** GLSL twin of `seaHeight` / `islandR` (keep both in sync). */
export const HEIGHT_GLSL = /* glsl */ `
float islandR(vec2 p) {
  vec2 q = (p - vec2(${ISLAND.cx.toFixed(2)}, ${ISLAND.cz.toFixed(2)})) / vec2(${ISLAND.rx.toFixed(2)}, ${ISLAND.rz.toFixed(2)});
  float a = atan(q.y, q.x);
  float wob = 1.0 + 0.07 * sin(a * 3.0 + 0.6) + 0.045 * sin(a * 5.0 + 2.1) + 0.03 * sin(a * 8.0 + 1.3);
  return length(q) / wob;
}
float seaHeight(vec2 p) {
  float r = islandR(p);
  float core = 1.0 - smoothstep(0.62, 1.12, r);
  float h = -0.9 + 1.45 * core;
  vec2 dd = p + vec2(1.0, 7.5);
  h += 1.1 * exp(-(dd.x * dd.x / 40.0 + dd.y * dd.y / 12.0)) * core;
  h -= 1.6 * smoothstep(1.12, 2.4, r);
  h += 0.12 * sin(p.x * 0.9 + p.y * 0.3) * sin(p.y * 0.7 - p.x * 0.2) * smoothstep(1.0, 1.4, r);
  vec2 c = p - vec2(${ISLAND.cx.toFixed(2)}, ${ISLAND.cz.toFixed(2)});
  float d = length(c);
  float a = atan(c.y, c.x);
  float reef = (d - ${REEF_R.toFixed(1)} - 2.0 * sin(a * 4.0 + 1.0)) / 3.2;
  h += 2.3 * exp(-reef * reef) * (0.85 + 0.15 * sin(a * 9.0));
  h -= 7.0 * smoothstep(${(REEF_R + 3).toFixed(1)}, ${(REEF_R + 18).toFixed(1)}, d);
  return h;
}
`;

const SIZE_X = 52;
const SIZE_Z = 44;
const SEG_X = 208;
const SEG_Z = 176;

/** The sand mesh. Digging deforms it locally around the X and the sand pile. */
export class Ground {
  readonly mesh: THREE.Mesh;
  /** Current (displayed) hole depth and sand-pile height; call `refresh()` after changing them. */
  holeDepth = 0;
  pile = 0;
  private noise = new Noise2D(4242);
  private geo: THREE.BufferGeometry;
  private digIdx: number[] = [];

  constructor(material: THREE.Material) {
    const geo = new THREE.PlaneGeometry(SIZE_X, SIZE_Z, SEG_X, SEG_Z).rotateX(-Math.PI / 2);
    geo.translate(ISLAND.cx, 0, ISLAND.cz);
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.geo = geo;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      if (Math.hypot(x - X_AT.x, z - X_AT.y) < 3.2 || Math.hypot(x - PILE_AT.x, z - PILE_AT.y) < 2.2) this.digIdx.push(i);
      this.writeVertex(i);
    }
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.receiveShadow = true;
    this.mesh.name = "treasure-ground";
  }

  /** Ground height including the flattened dig site, the hole and the sand pile. */
  heightAt(x: number, z: number): number {
    let h = seaHeight(x, z);
    const dx = x - X_AT.x;
    const dz = z - X_AT.y;
    const d = Math.hypot(dx, dz);
    h += (PLATEAU - h) * (1 - smoothstep(2.0, 3.6, d));
    if (this.holeDepth > 0) {
      if (d < HOLE_R) {
        const k = 1 - (d / HOLE_R) ** 2;
        h -= this.holeDepth * k * k * 1.15;
      }
      // Reason: a little raised lip of loose sand makes the hole read as freshly dug
      h += this.holeDepth * 0.14 * Math.exp(-(((d - HOLE_R) / 0.28) ** 2));
    }
    if (this.pile > 0) {
      const px = x - PILE_AT.x;
      const pz = z - PILE_AT.y;
      h += this.pile * Math.exp(-(px * px + pz * pz) / 0.55);
    }
    return h;
  }

  /** Re-shape and re-shade the dig area after `holeDepth` / `pile` changed. */
  refresh(): void {
    for (const i of this.digIdx) this.writeVertex(i);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  private writeVertex(i: number): void {
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const nrm = this.geo.attributes.normal as THREE.BufferAttribute;
    const col = this.geo.attributes.color as THREE.BufferAttribute;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = this.heightAt(x, z);
    pos.setY(i, h);
    // Reason: analytic normals (central differences) let the dig area update without recomputing the whole mesh
    const e = 0.12;
    const nx = this.heightAt(x - e, z) - this.heightAt(x + e, z);
    const nz = this.heightAt(x, z - e) - this.heightAt(x, z + e);
    const n = new THREE.Vector3(nx, 2 * e, nz).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
    const c = this.colorAt(x, z, h);
    col.setXYZ(i, c.r, c.g, c.b);
  }

  private colorAt(x: number, z: number, h: number): THREE.Color {
    const n = this.noise.fbm(x * 0.35, z * 0.35, 3);
    const speck = this.noise.noise(x * 3.1, z * 3.1);
    const c = new THREE.Color("#fbf1d8").lerp(new THREE.Color("#f0dfb6"), smoothstep(-0.3, 0.6, n));
    c.multiplyScalar(0.97 + speck * 0.04);
    // Wet, darker sand along the waterline
    c.lerp(new THREE.Color("#d8bf8c"), 1 - smoothstep(0.05, 0.3, h));
    // Grass on the dune behind the X
    const dune = Math.exp(-(((x + 1) ** 2) / 40 + ((z + 7.5) ** 2) / 12));
    const grass = smoothstep(0.32, 0.42, dune + n * 0.12) * smoothstep(0.35, 0.6, h);
    c.lerp(new THREE.Color("#7cc04a").lerp(new THREE.Color("#4f9a34"), smoothstep(-0.4, 0.5, n)), grass);
    // Freshly dug sand is damp and darker, deeper down even more so
    const d = Math.hypot(x - X_AT.x, z - X_AT.y);
    if (this.holeDepth > 0 && d < HOLE_R + 0.3) {
      const dug = (1 - smoothstep(HOLE_R - 0.2, HOLE_R + 0.3, d)) * Math.min(this.holeDepth * 3, 1);
      c.lerp(new THREE.Color("#c9a873"), dug * (0.55 + 0.45 * (1 - d / (HOLE_R + 0.3))));
    }
    if (this.pile > 0) {
      const p = Math.exp(-(((x - PILE_AT.x) ** 2 + (z - PILE_AT.y) ** 2) / 0.55));
      c.lerp(new THREE.Color("#ddc392"), smoothstep(0.05, 0.4, p * Math.min(this.pile * 3, 1)));
    }
    return c;
  }
}
