/**
 * The four quest items (magic sword, magic berries, golden key, golden hammer)
 * and the treasure chest, as small outlined 3D models.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mat, toonMesh } from "../../characters/parts";

export type ItemKey = "sword" | "berry" | "key" | "hammer";

/** Magic sword with a glowing blue blade. Points up, ~1.3 units long, grip at origin. */
export function createSword(): THREE.Group {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.04), mat("#bfe9ff", 0.2, 0.9));
  blade.position.y = 0.62;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 4), mat("#bfe9ff", 0.2, 0.9));
  tip.rotation.y = Math.PI / 4;
  tip.scale.z = 0.3;
  tip.position.y = 1.18;
  const guard = toonMesh(new RoundedBoxGeometry(0.42, 0.08, 0.1, 2, 0.03), mat("#ffc83d", 0.3));
  guard.position.y = 0.13;
  const grip = toonMesh(new THREE.CylinderGeometry(0.04, 0.045, 0.24, 8), mat("#6b3f22", 0.7));
  const pommel = toonMesh(new THREE.SphereGeometry(0.07, 10, 8), mat("#4fc3ff", 0.2, 1.2));
  pommel.position.y = -0.14;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), mat("#4fc3ff", 0.2, 1.6));
  gem.position.set(0, 0.13, 0.06);
  g.add(blade, tip, guard, grip, pommel, gem);
  return g;
}

/** A sprig of five glowing purple magic berries with leaves. */
export function createBerries(): THREE.Group {
  const g = new THREE.Group();
  const stem = toonMesh(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 6), mat("#3f7d2a", 0.7));
  stem.position.y = 0.25;
  g.add(stem);
  const spots: [number, number, number][] = [
    [0, 0.12, 0.08], [-0.13, 0.2, 0.02], [0.13, 0.22, 0.03], [-0.05, 0.33, -0.08], [0.07, 0.38, 0.06],
  ];
  for (const [x, y, z] of spots) {
    const b = toonMesh(new THREE.SphereGeometry(0.1, 14, 10), mat("#9b4dff", 0.25, 0.9));
    b.position.set(x, y, z);
    g.add(b);
  }
  for (const side of [-1, 1]) {
    const leaf = toonMesh(new THREE.SphereGeometry(0.12, 10, 6), mat("#5fb83a", 0.6));
    leaf.scale.set(1, 0.25, 0.55);
    leaf.position.set(side * 0.14, 0.5, 0);
    leaf.rotation.z = side * 0.5;
    g.add(leaf);
  }
  return g;
}

/** An ornate golden key, standing upright. */
export function createKey(): THREE.Group {
  const g = new THREE.Group();
  const gold = mat("#ffc83d", 0.25, 0.35);
  const bow = toonMesh(new THREE.TorusGeometry(0.17, 0.05, 10, 24), gold);
  bow.position.y = 0.72;
  const shaft = toonMesh(new THREE.CylinderGeometry(0.04, 0.04, 0.62, 10), gold);
  shaft.position.y = 0.32;
  const bit1 = toonMesh(new RoundedBoxGeometry(0.18, 0.07, 0.06, 2, 0.02), gold);
  bit1.position.set(0.09, 0.08, 0);
  const bit2 = toonMesh(new RoundedBoxGeometry(0.12, 0.07, 0.06, 2, 0.02), gold);
  bit2.position.set(0.06, 0.2, 0);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), mat("#ff3b6b", 0.2, 1.4));
  gem.position.y = 0.72;
  g.add(bow, shaft, bit1, bit2, gem);
  return g;
}

/** The golden hammer from the mountain shrine. Handle at origin, head up. */
export function createHammer(): THREE.Group {
  const g = new THREE.Group();
  const handle = toonMesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 10), mat("#7b4a2a", 0.7));
  handle.position.y = 0.4;
  const head = toonMesh(new RoundedBoxGeometry(0.55, 0.3, 0.3, 3, 0.07), mat("#ffc83d", 0.25, 0.35));
  head.position.y = 0.92;
  const band = toonMesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12), mat("#d9932b", 0.3));
  band.rotation.z = Math.PI / 2;
  band.position.y = 0.92;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), mat("#3bffb0", 0.2, 1.4));
  gem.position.set(0, 0.92, 0.16);
  g.add(handle, head, band, gem);
  return g;
}

export function createItem(key: ItemKey): THREE.Group {
  switch (key) {
    case "sword":
      return createSword();
    case "berry":
      return createBerries();
    case "key":
      return createKey();
    case "hammer":
      return createHammer();
  }
}

/** Treasure chest. `lid` pivots at the back edge — rotate lid.rotation.x negative to open. */
export function createChest(): { group: THREE.Group; lid: THREE.Group } {
  const group = new THREE.Group();
  const wood = mat("#8a5530", 0.7);
  const gold = mat("#ffc83d", 0.3, 0.3);
  const body = toonMesh(new RoundedBoxGeometry(1.2, 0.7, 0.8, 3, 0.06), wood);
  body.position.y = 0.35;
  group.add(body);
  for (const x of [-0.45, 0.45]) {
    const band = toonMesh(new RoundedBoxGeometry(0.1, 0.74, 0.84, 2, 0.03), gold);
    band.position.set(x, 0.35, 0);
    group.add(band);
  }
  const lid = new THREE.Group();
  lid.position.set(0, 0.7, -0.4);
  const top = toonMesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 16, 1, false, 0, Math.PI), wood);
  top.rotation.z = Math.PI / 2;
  top.position.z = 0.4;
  lid.add(top);
  const lock = toonMesh(new RoundedBoxGeometry(0.2, 0.24, 0.08, 2, 0.03), gold);
  lock.position.set(0, -0.02, 0.82);
  lid.add(lock);
  group.add(lid);
  return { group, lid };
}
