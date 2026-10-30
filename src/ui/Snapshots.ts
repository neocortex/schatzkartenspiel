/**
 * Renders 3D characters and items into small PNG images (data URLs) once at
 * start-up, so the HTML UI can show real 3D portraits and item icons.
 */

import * as THREE from "three";
import { Humanoid } from "../characters/Humanoid";
import { createTadeo, createElder, createWiseWoman, createWiseMan, createVillager } from "../characters/cast";
import { createItem, ItemKey } from "../world/models/items";
import { createChuletaModel } from "../characters/Chuleta";
import { createMole } from "../characters/Mole";
import { createHueter } from "../characters/Hueter";

const SIZE = 192;

function snapshot(
  object: THREE.Object3D,
  camPos: THREE.Vector3,
  look: THREE.Vector3,
  renderer: THREE.WebGLRenderer,
  background: THREE.Color | null = null,
): string {
  const scene = new THREE.Scene();
  scene.background = background;
  scene.add(new THREE.HemisphereLight("#ffffff", "#8a7a6a", 2.2));
  const key = new THREE.DirectionalLight("#fff4e0", 2.4);
  key.position.set(2, 3, 4);
  scene.add(key, object);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  cam.position.copy(camPos);
  cam.lookAt(look);
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL("image/png");
}

export interface SnapshotSet {
  portraits: Record<string, string>;
  items: Record<ItemKey, string>;
}

/** Render every portrait and item icon the UI needs. */
export function renderSnapshots(): SnapshotSet {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  const portrait = (h: Humanoid, lift = 0.05, distance = 1.7) => {
    h.update(0.016, { speed: 0, grounded: true, vy: 0 });
    h.root.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    h.head.getWorldPosition(head);
    head.y += lift;
    return snapshot(h.root, head.clone().add(new THREE.Vector3(0.35, 0.12, distance)), head, renderer);
  };

  const portraits: Record<string, string> = {
    tadeo: portrait(createTadeo()),
    elder: portrait(createElder()),
    wiseWoman: portrait(createWiseWoman()),
    wiseMan: portrait(createWiseMan()),
  };
  for (let i = 0; i < 3; i++) portraits[`villager${i}`] = portrait(createVillager(i));
  // Reason: Paco's portrait sits further back, so his hat and full beard both fit in the frame
  portraits.villager3 = portrait(createVillager(3), -0.02, 2.95);
  portraits.chuleta = snapshot(createChuletaModel().root, new THREE.Vector3(0.32, 0.88, 1.3), new THREE.Vector3(0, 0.7, 0.08), renderer);
  const mole = createMole();
  mole.update(0.016);
  portraits.maulwurf = snapshot(mole.root, new THREE.Vector3(0.5, 1.02, 3.4), new THREE.Vector3(0, 0.86, 0), renderer);
  const hueter = createHueter();
  void hueter.rise();
  // Reason: one huge step lands at the end of his entrance; a dark backdrop makes the pale ghost stand out in the portrait
  hueter.update(10, 0);
  portraits.hueter = snapshot(hueter.root, new THREE.Vector3(1.1, 4.3, 7.2), new THREE.Vector3(0, 4, 0), renderer, new THREE.Color("#12324f"));

  const items = {} as Record<ItemKey, string>;
  for (const key of ["sword", "berry", "key", "hammer"] as ItemKey[]) {
    const item = createItem(key);
    const box = new THREE.Box3().setFromObject(item);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    item.rotation.z = key === "sword" || key === "hammer" ? -0.6 : 0;
    items[key] = snapshot(item, center.clone().add(new THREE.Vector3(0, 0, size * 2.1)), center, renderer);
  }

  renderer.dispose();
  renderer.forceContextLoss();
  return { portraits, items };
}
