/**
 * Renders 3D characters and items into small PNG images (data URLs) once at
 * start-up, so the HTML UI can show real 3D portraits and item icons.
 */

import * as THREE from "three";
import { Humanoid } from "../characters/Humanoid";
import { createTadeo, createElder, createWiseWoman, createWiseMan, createVillager } from "../characters/cast";
import { createItem, ItemKey } from "../world/models/items";
import { createHenniModel } from "../characters/Henni";

const SIZE = 192;

function snapshot(object: THREE.Object3D, camPos: THREE.Vector3, look: THREE.Vector3, renderer: THREE.WebGLRenderer): string {
  const scene = new THREE.Scene();
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

  const portrait = (h: Humanoid) => {
    h.update(0.016, { speed: 0, grounded: true, vy: 0 });
    h.root.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    h.head.getWorldPosition(head);
    head.y += 0.05;
    return snapshot(h.root, head.clone().add(new THREE.Vector3(0.35, 0.12, 1.7)), head, renderer);
  };

  const portraits: Record<string, string> = {
    tadeo: portrait(createTadeo()),
    elder: portrait(createElder()),
    wiseWoman: portrait(createWiseWoman()),
    wiseMan: portrait(createWiseMan()),
  };
  for (let i = 0; i < 4; i++) portraits[`villager${i}`] = portrait(createVillager(i));
  portraits.henni = snapshot(createHenniModel().root, new THREE.Vector3(0.32, 0.88, 1.3), new THREE.Vector3(0, 0.7, 0.08), renderer);

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
