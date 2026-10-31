/**
 * Puffy pink hearts that pop out of the shark when a berry makes it happy: they
 * float up, sway and shrink away, always turned towards the camera. A small pool
 * of outlined meshes in the island's toon style.
 */

import * as THREE from "three";
import { mat, toonMesh } from "../../characters/parts";
import { heartShape } from "../../world/models/items";
import { ease, rand } from "../ogre/kit";

const POOL = 14;
const LIFE = 1.5;

interface Heart {
  mesh: THREE.Mesh;
  age: number;
  from: THREE.Vector3;
  size: number;
  sway: number;
}

export class Hearts {
  readonly group = new THREE.Group();
  private list: Heart[] = [];

  constructor(private camera: THREE.Camera) {
    const geo = new THREE.ExtrudeGeometry(heartShape(0.62), { depth: 0.1, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 });
    geo.center();
    const material = mat("#ff5d8f", 0.35, 0.75);
    for (let i = 0; i < POOL; i++) {
      const mesh = toonMesh(geo, material);
      mesh.castShadow = false;
      mesh.visible = false;
      this.group.add(mesh);
      this.list.push({ mesh, age: LIFE, from: new THREE.Vector3(), size: 1, sway: 0 });
    }
  }

  /** Send up to `count` hearts from a point. */
  burst(at: THREE.Vector3, count: number): void {
    const free = this.list.filter((h) => !h.mesh.visible).slice(0, count);
    free.forEach((h, i) => {
      // Reason: a negative age holds each heart back a moment, so they rise one after the other
      h.age = -i * 0.09;
      h.from.set(at.x + rand(-0.7, 0.7), at.y + rand(-0.1, 0.3), at.z + rand(-0.7, 0.7));
      h.size = rand(0.8, 1.35);
      h.sway = rand(0, Math.PI * 2);
      h.mesh.visible = true;
      h.mesh.scale.setScalar(0);
      h.mesh.position.copy(h.from);
    });
  }

  update(dt: number): void {
    for (const h of this.list) {
      if (!h.mesh.visible) continue;
      h.age += dt;
      if (h.age >= LIFE) {
        h.mesh.visible = false;
        continue;
      }
      if (h.age < 0) continue;
      const k = h.age / LIFE;
      h.mesh.position.set(h.from.x + Math.sin(h.age * 4 + h.sway) * 0.28, h.from.y + ease.outQuad(k) * 2.8, h.from.z);
      h.mesh.quaternion.copy(this.camera.quaternion);
      h.mesh.rotateZ(Math.sin(h.age * 5 + h.sway) * 0.25);
      const grow = ease.outBack(Math.min(h.age / 0.28, 1));
      const shrink = 1 - ease.inQuad(Math.max((k - 0.72) / 0.28, 0));
      h.mesh.scale.setScalar(h.size * grow * shrink);
    }
  }
}
