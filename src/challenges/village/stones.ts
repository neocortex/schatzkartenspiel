/**
 * The three answer stones of the elder's maths trial: mossy standing stones
 * with a dark slate face and a big glowing number. They rise out of the
 * ground; the chosen one lifts, glows gold and gets a bouncing arrow above
 * it; a right answer flashes green, a wrong one shakes and flashes red.
 */

import * as THREE from "three";
import { merge } from "../../core/geo";
import { rockBlob, rbox, stoneFn } from "../../world/models/shapes";
import { mulberry32 } from "../../core/noise";
import { numberTexture, pointerTexture } from "./textures";
import { Owned } from "../shared/dispose";

const GOLD = new THREE.Color(3.2, 2.3, 0.9);
const IDLE = new THREE.Color(1.25, 1.15, 0.95);
const GREEN = new THREE.Color(0.8, 3.4, 1.1);
const RED = new THREE.Color(3.6, 0.6, 0.5);

class Stone {
  readonly group = new THREE.Group();
  readonly numberMat: THREE.MeshBasicMaterial;
  private inner = new THREE.Group();
  private ringMat: THREE.MeshBasicMaterial;
  private ring: THREE.Mesh;
  value = 0;
  selected = false;
  level = -2.2;
  private levelNow = -2.2;
  private lift = 0;
  private shake = 0;
  private flash = 0;
  private flashColor = GREEN;
  private texture: THREE.Texture | null = null;

  constructor(
    seed: number,
    rockMat: THREE.Material,
    private owned: Owned,
  ) {
    const rand = mulberry32(seed);
    const rock = new THREE.Mesh(
      merge([
        rockBlob(seed, [0.72, 0.95, 0.5], stoneFn("#8d88a8", 0.55, rand)).translate(0, 0.8, -0.05),
        rbox(1.08, 1.12, 0.22, "#4f4c6e", { pos: [0, 0.88, 0.36], rot: [-0.1, 0, 0] }, 0.08),
        rockBlob(seed + 3, [0.62, 0.22, 0.45], stoneFn("#7f7a99", 0.3, rand)).translate(0, 0.12, 0.1),
      ]),
      rockMat,
    );
    rock.castShadow = true;
    rock.receiveShadow = true;
    this.numberMat = owned.add(new THREE.MeshBasicMaterial({ transparent: true, color: IDLE.clone(), depthWrite: false }));
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), this.numberMat);
    num.position.set(0, 0.9, 0.485);
    num.rotation.x = -0.1;
    this.inner.add(rock, num);
    this.group.add(this.inner);

    this.ringMat = owned.add(new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.9, 48).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.position.y = 0.04;
    this.ring.renderOrder = 3;
    this.group.add(this.ring);
  }

  setValue(n: number): void {
    this.value = n;
    this.texture?.dispose();
    this.texture = this.owned.add(numberTexture(n));
    this.numberMat.map = this.texture;
    this.numberMat.needsUpdate = true;
  }

  react(ok: boolean): void {
    this.flash = 1;
    this.flashColor = ok ? GREEN : RED;
    if (!ok) this.shake = 1;
  }

  update(dt: number, time: number): void {
    this.levelNow += (this.level - this.levelNow) * Math.min(dt * 3.2, 1);
    this.lift += ((this.selected ? 0.28 : 0) - this.lift) * Math.min(dt * 10, 1);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 0.9);
    const bob = this.selected ? Math.sin(time * 4) * 0.05 : 0;
    this.inner.position.set(Math.sin(time * 55) * this.shake * 0.12, this.levelNow + this.lift + bob, 0);
    this.inner.rotation.z = Math.sin(time * 40) * this.shake * 0.06;
    this.ring.position.y = this.levelNow + 0.04;
    this.ringMat.opacity = this.selected && this.levelNow > -0.3 ? 0.55 + Math.sin(time * 6) * 0.25 : 0;
    this.ring.scale.setScalar(1 + Math.sin(time * 6) * 0.04);
    const base = this.selected ? GOLD : IDLE;
    this.numberMat.color.copy(base).lerp(this.flashColor, Math.min(this.flash * 1.4, 1));
    this.group.visible = this.levelNow > -2.1;
  }
}

export class AnswerStones {
  readonly group = new THREE.Group();
  readonly stones: Stone[] = [];
  selected = 1;
  private pointer: THREE.Sprite;

  constructor(
    readonly center: THREE.Vector3,
    readonly spacing: number,
    owned: Owned,
  ) {
    const rockMat = owned.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    for (let i = 0; i < 3; i++) {
      const s = new Stone(40 + i * 7, rockMat, owned);
      s.group.position.set(center.x + (i - 1) * spacing, 0, center.z);
      this.stones.push(s);
      this.group.add(s.group);
    }
    this.pointer = new THREE.Sprite(owned.add(new THREE.SpriteMaterial({ map: owned.add(pointerTexture()), depthWrite: false })));
    this.pointer.scale.setScalar(0.55);
    this.pointer.renderOrder = 4;
    this.pointer.visible = false;
    this.group.add(this.pointer);
  }

  setValues(values: number[]): void {
    values.forEach((v, i) => this.stones[i].setValue(v));
  }

  setRaised(up: boolean): void {
    this.stones.forEach((s, i) => {
      // Reason: stagger the rise a little so the stones come up one after another
      setTimeout(() => (s.level = up ? 0 : -2.2), up ? i * 180 : 0);
    });
  }

  /** Highlight one stone (or none with -1). */
  select(i: number): void {
    this.selected = i;
    this.stones.forEach((s, k) => (s.selected = k === i));
  }

  position(i: number): THREE.Vector3 {
    return this.stones[i].group.position;
  }

  update(dt: number, time: number): void {
    for (const s of this.stones) s.update(dt, time);
    const sel = this.stones[this.selected];
    this.pointer.visible = !!sel?.selected;
    if (sel) {
      const p = sel.group.position;
      this.pointer.position.set(p.x, 2.35 + Math.abs(Math.sin(time * 4)) * 0.18, p.z + 0.2);
    }
  }
}
