/**
 * Renders each fish species (and the message bottle) into a small PNG once,
 * with a cartoon outline and a three-quarter view, so the HTML catch card and
 * the status pill can show the real 3D fish.
 */

import * as THREE from "three";
import { toonMesh } from "../../characters/parts";
import { FishKind, bottleModel, fishModel } from "./species";

const SIZE = 160;

export type IconKey = FishKind | "bottle";

export function renderFishIcons(): Record<IconKey, string> {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#8aa0b0", 2.4));
  const key = new THREE.DirectionalLight("#fff4e0", 2.2);
  key.position.set(2, 3, 3);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, emissive: "#ffffff", emissiveIntensity: 0.0 });
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, transparent: true, opacity: 0.6 });

  const shoot = (object: THREE.Object3D): string => {
    scene.add(object);
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    // Reason: the models are turned to lie along x (nose right), so a camera in front sees the whole fish from the side
    cam.position.copy(center).add(new THREE.Vector3(size * 0.35, size * 0.45, size * 1.65));
    cam.lookAt(center);
    renderer.render(scene, cam);
    scene.remove(object);
    return renderer.domElement.toDataURL("image/png");
  };

  const icons = {} as Record<IconKey, string>;
  for (const kind of ["clown", "tang", "puffer", "rainbow", "box", "gold"] as FishKind[]) {
    const m = fishModel(kind);
    const g = new THREE.Group();
    g.add(toonMesh(m.body, material));
    const tail = toonMesh(m.tail, material);
    tail.position.z = m.tailZ;
    tail.rotation.y = 0.35;
    g.add(tail);
    // Side view, nose to the right and tilted up a little
    g.rotation.set(0, Math.PI / 2 - 0.35, 0.18);
    icons[kind] = shoot(g);
  }
  const b = bottleModel();
  const bottle = new THREE.Group();
  bottle.add(toonMesh(b.inner, material), new THREE.Mesh(b.glass, glass));
  bottle.rotation.set(0.2, -Math.PI / 2 + 0.4, 0.5);
  icons.bottle = shoot(bottle);

  b.glass.dispose();
  b.inner.dispose();
  material.dispose();
  glass.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return icons;
}
