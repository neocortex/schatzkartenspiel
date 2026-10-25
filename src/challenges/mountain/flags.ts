/**
 * Checkpoint banners: a wooden pole on a little stone cairn with a waving
 * pennant. Grey while unreached; when Tadeo passes, the pennant bursts into
 * colour and the golden knob on top lights up.
 */

import * as THREE from "three";
import { mat, toonMesh } from "../../characters/parts";

const W = 1.15;
const H = 0.7;

export class CheckpointFlag {
  readonly group = new THREE.Group();
  reached = false;
  private cloth: THREE.Mesh;
  private clothMat: THREE.MeshStandardMaterial;
  private knob: THREE.Mesh;
  private base: Float32Array;
  private phase = Math.random() * 10;

  constructor(color: THREE.ColorRepresentation) {
    const pole = toonMesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 8), mat("#8a5a32", 0.7));
    pole.position.y = 1.3;
    this.knob = toonMesh(new THREE.SphereGeometry(0.13, 12, 10), mat("#9a9a9a", 0.4));
    this.knob.position.y = 2.68;
    for (let i = 0; i < 4; i++) {
      const stone = toonMesh(new THREE.DodecahedronGeometry(0.22 + i * 0.03, 0), mat(["#a49d93", "#8d8680", "#b8b0a5", "#958c84"][i], 0.8));
      const a = (i / 4) * Math.PI * 2;
      stone.position.set(Math.cos(a) * 0.2, 0.12, Math.sin(a) * 0.2);
      stone.rotation.set(i, i * 2, 0);
      this.group.add(stone);
    }
    const geo = new THREE.PlaneGeometry(W, H, 10, 3);
    // Reason: taper the far end into a pennant point and hang the cloth off the pole
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) + W / 2) / W;
      pos.setXY(i, u * W, pos.getY(i) * (1 - u * 0.75));
    }
    geo.translate(0.05, 2.25, 0);
    this.base = Float32Array.from(pos.array as Float32Array);
    this.clothMat = new THREE.MeshStandardMaterial({ color: "#b9b4ad", roughness: 0.85, side: THREE.DoubleSide });
    this.clothMat.userData.on = new THREE.Color(color);
    this.cloth = new THREE.Mesh(geo, this.clothMat);
    this.cloth.castShadow = true;
    this.group.add(pole, this.knob, this.cloth);
  }

  get material(): THREE.Material {
    return this.clothMat;
  }

  reach(): void {
    this.reached = true;
    this.clothMat.color.copy(this.clothMat.userData.on);
    this.clothMat.emissive.copy(this.clothMat.userData.on).multiplyScalar(0.25);
    this.knob.material = mat("#ffd23f", 0.3, 1.4);
  }

  update(dt: number, time: number): void {
    this.phase += dt;
    const pos = this.cloth.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const speed = this.reached ? 7 : 3.5;
    for (let i = 0; i < pos.count; i++) {
      const x = this.base[i * 3];
      const u = x / W;
      arr[i * 3 + 2] = Math.sin(time * speed - x * 4 + this.phase) * 0.14 * u;
      arr[i * 3 + 1] = this.base[i * 3 + 1] - u * u * (this.reached ? 0.03 : 0.12);
    }
    pos.needsUpdate = true;
    this.cloth.geometry.computeVertexNormals();
  }
}
