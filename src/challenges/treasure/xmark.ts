/**
 * The big red X painted on the sand (a canvas-textured decal that hugs the
 * ground and fades away where Tadeo digs), plus the beacon that shows a
 * seven-year-old where to go: a bouncing golden arrow and a pulsing ring on
 * the sand (the stage adds rising golden glitter).
 */

import * as THREE from "three";
import { Owned } from "../shared/dispose";
import { Ground, X_AT, HOLE_R } from "./terrain";

const DECAL = 5.6;
const SEGS = 56;

/** Two rough brush strokes with darker edges and a few paint splats. */
function xTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 512;
  const g = cv.getContext("2d")!;
  const stroke = (x0: number, y0: number, x1: number, y1: number, seed: number) => {
    for (let pass = 0; pass < 3; pass++) {
      g.strokeStyle = ["#8f140f", "#d8261c", "#ff4a35"][pass];
      g.lineWidth = [92, 78, 30][pass];
      g.lineCap = "round";
      g.beginPath();
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        // Reason: a slight wobble along the stroke reads as hand-painted rather than vector-perfect
        const wob = Math.sin(t * 9 + seed) * 6 + Math.sin(t * 23 + seed * 2) * 3;
        const x = x0 + (x1 - x0) * t + wob * (pass === 2 ? 0.5 : 1);
        const y = y0 + (y1 - y0) * t - wob * 0.6;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.globalAlpha = pass === 2 ? 0.45 : 1;
      g.stroke();
      g.globalAlpha = 1;
    }
  };
  stroke(70, 70, 442, 442, 1);
  stroke(442, 70, 70, 442, 4);
  g.fillStyle = "#d8261c";
  for (let i = 0; i < 18; i++) {
    const a = i * 2.4;
    const r = 120 + (i % 5) * 34;
    g.beginPath();
    g.arc(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 4 + (i % 3) * 4, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class XMark {
  readonly group = new THREE.Group();
  readonly beacon = new THREE.Group();
  private decal: THREE.Mesh;
  private arrow: THREE.Group;
  private ring: THREE.Mesh;
  private time = 0;

  constructor(
    private ground: Ground,
    owned: Owned,
  ) {
    const geo = new THREE.PlaneGeometry(DECAL, DECAL, SEGS, SEGS).rotateX(-Math.PI / 2);
    geo.translate(X_AT.x, 0, X_AT.y);
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 4).fill(1), 4));
    const mat = owned.add(
      new THREE.MeshStandardMaterial({ map: owned.add(xTexture()), transparent: true, vertexColors: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    this.decal = new THREE.Mesh(geo, mat);
    this.decal.receiveShadow = true;
    this.decal.renderOrder = 0;
    this.refresh();
    this.group.add(this.decal);

    // Beacon: golden arrow bobbing over the X and a pulsing ring
    const gold = owned.add(new THREE.MeshStandardMaterial({ color: "#ffc83d", roughness: 0.3, emissive: "#ffb21a", emissiveIntensity: 0.9 }));
    this.arrow = new THREE.Group();
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.62, 4).rotateX(Math.PI), gold);
    head.position.y = 0.31;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.6, 0.26), gold);
    shaft.position.y = 0.88;
    this.arrow.add(head, shaft);
    this.arrow.traverse((o) => (o.castShadow = true));
    const glowMat = (opacity: number) =>
      owned.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.45), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 48).rotateX(-Math.PI / 2), glowMat(0.7));
    this.beacon.add(this.arrow, this.ring);
    this.beacon.position.set(X_AT.x, ground.heightAt(X_AT.x, X_AT.y), X_AT.y);
    this.group.add(this.beacon);
  }

  /** Follow the dug ground; the paint disappears where sand was shovelled away. */
  refresh(): void {
    const geo = this.decal.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    const dug = Math.min(this.ground.holeDepth * 4, 1);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.ground.heightAt(x, z) + 0.02);
      const d = Math.hypot(x - X_AT.x, z - X_AT.y);
      col.setW(i, 1 - dug * THREE.MathUtils.smoothstep(HOLE_R + 0.35 - d, 0, 0.4));
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  /** Fade the whole X (once the chest is up). */
  setPaintOpacity(o: number): void {
    (this.decal.material as THREE.MeshStandardMaterial).opacity = o;
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    if (!this.beacon.visible) return;
    this.arrow.position.y = 1.15 + Math.abs(Math.sin(t * 3.2)) * 0.45;
    this.arrow.rotation.y = t * 1.4;
    const k = (t * 0.8) % 1;
    this.ring.scale.setScalar(0.6 + k * 1.4);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
  }
}
