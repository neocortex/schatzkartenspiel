/**
 * Everything around the fishing spot: the golden late-afternoon sky with
 * warm clouds, distant island silhouettes (one with a little lighthouse), a
 * sailboat drifting along the horizon, bobbing buoys, circling seagulls and
 * the beach behind the jetty with palms and Jonas's fishing hut.
 */

import * as THREE from "three";
import { merge, part, displace, gradient } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { createSkyDome, Clouds, SkyPalette } from "../../world/Sky";
import { CritterMesh } from "../../world/ambient/CritterMesh";
import { gullModel } from "../../world/ambient/critterModels";
import { GULL_ANIM } from "../../world/ambient/critterAnims";
import { palmTree, bush } from "../../world/models/flora";
import { lighthouse } from "../../world/models/structures";
import { Model, PAL, emptyModel, addModel, placeAt, rbox, box, cyl, ball, beam } from "../../world/models/shapes";
import { floorHeight } from "./seabed";
import { swell } from "./water";

export const GOLDEN_SKY: SkyPalette = {
  zenith: new THREE.Color("#3f7fd8"),
  horizon: new THREE.Color("#ffc888"),
  sunGlow: new THREE.Color("#ff9c4a"),
};

interface Gull {
  cx: number;
  cz: number;
  y: number;
  r: number;
  omega: number;
  phase: number;
  seed: number;
}

export class Scenery {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  private clouds: Clouds;
  private gullMesh: CritterMesh;
  private gulls: Gull[] = [];
  private buoys: THREE.Group[] = [];
  private sailboat = new THREE.Group();

  constructor(sunDir: THREE.Vector3) {
    const sky = createSkyDome(sunDir, GOLDEN_SKY);
    this.materials.push(sky.material as THREE.Material);
    this.clouds = new Clouds(18, 23);
    const cloudMat = (this.clouds.group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    cloudMat.emissive.set("#ffc896");
    cloudMat.emissiveIntensity = 0.5;
    this.materials.push(cloudMat);
    this.group.add(sky, this.clouds.group);

    const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const leafy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.materials.push(solid, leafy, glow);

    const far = emptyModel();
    const plants: THREE.BufferGeometry[] = [];
    this.distantIslands(far, plants);
    this.beach(far, plants);
    const farMesh = new THREE.Mesh(merge(far.solid), solid);
    farMesh.castShadow = true;
    farMesh.receiveShadow = true;
    const plantMesh = new THREE.Mesh(merge(plants), leafy);
    plantMesh.castShadow = true;
    plantMesh.receiveShadow = true;
    this.group.add(farMesh, plantMesh, new THREE.Mesh(merge(far.glow), glow));

    this.buildBuoys(solid);
    this.buildSailboat(solid);

    this.gullMesh = new CritterMesh({ name: "fishing-gulls", geometry: gullModel(), count: 6, animate: GULL_ANIM, doubleSided: true, selfLit: 0.4 });
    this.group.add(this.gullMesh.mesh);
    for (let i = 0; i < 6; i++) {
      // Reason: the near gulls glide low over the lagoon so they show up in the high fishing view
      const near = i < 4;
      const r = near ? 4 + Math.random() * 3 : 14 + Math.random() * 8;
      this.gulls.push({
        cx: near ? -3 + Math.random() * 6 : -20 + Math.random() * 40,
        cz: near ? -6 - Math.random() * 5 : -40 - Math.random() * 20,
        y: near ? 2.6 + Math.random() * 1.6 : 12 + Math.random() * 6,
        r,
        omega: ((i % 2 ? 1 : -1) * (3.6 + Math.random())) / r,
        phase: Math.random() * 6.28,
        seed: Math.random() * 100,
      });
    }
  }

  /** A palm-topped island on the horizon and a rocky islet with a lighthouse. */
  private distantIslands(m: Model, plants: THREE.BufferGeometry[]): void {
    const rand = mulberry32(19);
    const mound = (x: number, z: number, sx: number, sy: number, sz: number, seed: number) => {
      const g = new THREE.IcosahedronGeometry(1, 4);
      g.scale(sx, sy, sz);
      displace(g, sy * 0.12, 2.2 / sx, seed);
      g.translate(0, -sy * 0.45, 0);
      // Reason: flatten everything below the waterline; seen through the clear sea, a sunken skirt shows as a pale halo
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, Math.max(pos.getY(i), -0.4));
      m.solid.push(part(g, gradient("#d9c08a", "#4f9a48", -sy * 0.1, sy * 0.35, 0.15), { pos: [x, 0, z] }));
    };
    mound(-75, -235, 55, 26, 28, 3);
    mound(-28, -228, 26, 13, 16, 8);
    for (let i = 0; i < 7; i++) {
      const g = palmTree(i * 7 + 3).geometry.clone();
      g.scale(2.6, 2.6, 2.6);
      g.rotateY(rand() * 6.28);
      g.translate(-100 + i * 11 + rand() * 4, 6 + Math.sin(i * 0.9) * 3, -224 + rand() * 6);
      plants.push(g);
    }
    mound(118, -310, 16, 10, 12, 21);
    const lh = lighthouse(4);
    addModel(m, lh.model, placeAt(118, 2.5, -310, 0.6, 1.4));
  }

  /** The beach behind the jetty: palms, bushes and Jonas's little fishing hut. */
  private beach(m: Model, plants: THREE.BufferGeometry[]): void {
    const rand = mulberry32(5);
    const palms: [number, number][] = [[-4.5, 15.5], [-8.5, 17], [-12, 14.5], [4.8, 15], [9, 16.5], [13.5, 15.2], [-16, 18], [17, 18.5]];
    palms.forEach(([x, z], i) => {
      const g = palmTree(i * 13 + 2).geometry.clone();
      g.rotateY(rand() * 6.28);
      g.translate(x, floorHeight(x, z) - 0.1, z);
      plants.push(g);
    });
    for (let i = 0; i < 9; i++) {
      const x = (rand() - 0.5) * 30;
      const z = 18 + rand() * 6;
      if (Math.abs(x) < 3) continue;
      const g = bush(i + 40, rand() < 0.4 ? "#ff5d8f" : null).geometry.clone();
      g.translate(x, floorHeight(x, z) - 0.05, z);
      plants.push(g);
    }
    // Fishing hut on short stilts, with a net and oars leaning on it
    const hx = -6.2;
    const hz = 19.5;
    const hy = floorHeight(hx, hz);
    const hut = emptyModel();
    hut.solid.push(rbox(2.6, 1.7, 2.1, "#e7cfa0", { pos: [0, 1.15, 0] }, 0.05));
    for (const s of [-1, 1]) hut.solid.push(beam([s * 1.45, 2.0, 1.3], [0, 2.95, 1.3], 0.18, "#c9a25a", 2.9));
    hut.solid.push(box(0.75, 1.15, 0.06, PAL.woodDark, { pos: [0.55, 0.88, 1.06] }));
    hut.glow.push(box(0.55, 0.45, 0.05, new THREE.Color(1.6, 1.15, 0.55), { pos: [-0.55, 1.25, 1.07] }));
    hut.solid.push(box(0.7, 0.08, 0.1, PAL.woodDark, { pos: [-0.55, 1.0, 1.1] }));
    for (const [sx, sz] of [[-1.2, -1], [1.2, -1], [-1.2, 1], [1.2, 1]]) hut.solid.push(cyl(0.08, 0.08, 0.5, PAL.woodDark, { pos: [sx, 0.2, sz] }, 6));
    hut.solid.push(beam([1.45, 0.3, 0.6], [1.45, 2.0, 0.8], 0.05, PAL.woodLight), box(0.06, 0.4, 0.2, PAL.woodLight, { pos: [1.45, 0.4, 0.62] }));
    addModel(m, hut, placeAt(hx, hy, hz, 0.25));
  }

  private buildBuoys(material: THREE.Material): void {
    const g = merge([
      ball(0.32, "#e63946", [0, 0, 0], 2, [1, 0.8, 1]),
      cyl(0.27, 0.3, 0.14, PAL.white, { pos: [0, 0.2, 0] }, 14),
      part(new THREE.ConeGeometry(0.24, 0.4, 14), "#e63946", { pos: [0, 0.46, 0] }),
      cyl(0.02, 0.02, 0.6, PAL.iron, { pos: [0, 0.9, 0] }, 5),
      box(0.02, 0.18, 0.28, "#ffcf3a", { pos: [0, 1.1, 0.14] }),
    ]);
    for (const [x, z] of [[-7.8, -15.5], [7.2, -18.5], [-1.5, -27]]) {
      const b = new THREE.Group();
      const mesh = new THREE.Mesh(g, material);
      mesh.castShadow = true;
      b.add(mesh);
      b.position.set(x, 0, z);
      b.rotation.y = Math.random() * 6;
      this.buoys.push(b);
      this.group.add(b);
    }
  }

  private buildSailboat(material: THREE.Material): void {
    const hull = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    hull.scale(0.9, 0.5, 2.6);
    const sail = new THREE.BufferGeometry();
    sail.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.4, 1.0, 0, 4.2, 0.2, 0, 0.4, -1.6, 0, 0.4, -1.6, 0, 4.2, 0.2, 0, 0.4, 1.0], 3));
    sail.computeVertexNormals();
    const jib = new THREE.BufferGeometry();
    jib.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.45, 1.25, 0, 3.6, 0.35, 0, 0.45, 2.4, 0, 0.45, 2.4, 0, 3.6, 0.35, 0, 0.45, 1.25], 3));
    jib.computeVertexNormals();
    const mesh = new THREE.Mesh(
      merge([
        part(hull, "#f7f3ea"),
        cyl(0.06, 0.06, 4.4, PAL.woodDark, { pos: [0, 2.3, 0.3] }, 5),
        part(sail, "#fff6e6"),
        part(jib, "#e85d4a"),
        box(0.02, 0.3, 0.5, "#3f7fbf", { pos: [0, 4.5, 0.05] }),
      ]),
      material,
    );
    this.sailboat.add(mesh);
    this.sailboat.position.set(-120, 0, -150);
    this.sailboat.rotation.y = Math.PI / 2;
    this.group.add(this.sailboat);
  }

  update(dt: number, time: number): void {
    this.clouds.update(dt * 0.5);
    for (const b of this.buoys) {
      b.position.y = swell(b.position.x, b.position.z, time) * 2.5 - 0.12;
      b.rotation.z = Math.sin(time * 1.2 + b.position.x) * 0.09;
      b.rotation.x = Math.sin(time * 0.9 + b.position.z) * 0.07;
    }
    const s = this.sailboat;
    s.position.x += dt * 1.6;
    if (s.position.x > 140) s.position.x = -140;
    s.position.y = Math.sin(time * 0.9) * 0.08;
    s.rotation.z = Math.sin(time * 0.7) * 0.05;
    this.gulls.forEach((g, i) => {
      const th = g.phase + g.omega * time;
      const r = g.r * (1 + 0.15 * Math.sin(time * 0.2 + g.seed));
      const x = g.cx + Math.cos(th) * r;
      const z = g.cz + Math.sin(th) * r;
      const y = g.y + Math.sin(time * 0.45 + g.seed) * 0.8;
      const dir = Math.sign(g.omega);
      const yaw = Math.atan2(-Math.sin(th) * dir, Math.cos(th) * dir);
      const burst = THREE.MathUtils.smoothstep(0.5 + 0.5 * Math.sin(time * 0.5 + g.seed * 7), 0.7, 0.9);
      const wing = 0.1 + burst * 0.6 * Math.sin(time * 7 + g.seed * 3) + (1 - burst) * 0.05 * Math.sin(time * 1.3 + g.seed);
      this.gullMesh.set(i, x, y, z, yaw, 0.05, dir * 0.35, wing, 0.7);
    });
    this.gullMesh.commit();
  }

  dispose(): void {
    (this.gullMesh.mesh.material as THREE.Material).dispose();
    this.gullMesh.mesh.geometry.dispose();
  }
}
