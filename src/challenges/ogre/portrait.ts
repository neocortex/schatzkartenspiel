/**
 * Renders a 3D portrait of the ogre's face into a data URL (once per session)
 * so the dialogue box and the health bar show the real character, matching
 * how the shared UI renders Tadeo's portrait.
 */

import * as THREE from "three";
import { createOgre } from "../../characters/Ogre";

let cached: string | null = null;

export function ogrePortrait(): string {
  if (cached) return cached;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(192, 192);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#8a7a6a", 2.2));
  const key = new THREE.DirectionalLight("#fff4e0", 2.4);
  key.position.set(2, 3, 4);
  scene.add(key);
  const ogre = createOgre();
  ogre.update(0.016);
  scene.add(ogre.root);
  const head = ogre.headPos();
  head.y -= 0.12;
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  cam.position.copy(head).add(new THREE.Vector3(0.55, 0.15, 3.2));
  cam.lookAt(head);
  renderer.render(scene, cam);
  cached = renderer.domElement.toDataURL("image/png");
  ogre.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  renderer.dispose();
  renderer.forceContextLoss();
  return cached;
}
