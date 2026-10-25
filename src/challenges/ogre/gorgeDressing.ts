/**
 * Set dressing for the gorge: boulders in and along the river, mossy rock
 * ledges stacked on the waterfall cliff, trees framing the view, ferns,
 * reeds, grass tufts and flowers, vines dangling from the bridge and the
 * cliff, the ogre's signs and his little camp with a crackling campfire.
 */

import * as THREE from "three";
import { merge } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { roundTree, pineTree, bush } from "../../world/models/flora";
import { rockBlob, stoneFn, emptyModel, addModel, placeAt, cyl, PAL } from "../../world/models/shapes";
import { boardSign, haystack, barrel, bucket } from "../../world/models/props";
import { SignAtlas } from "../../world/models/signs";
import { Bin, ModelMaterials, modelGroup } from "./kit";
import { Fx, SHAPE } from "./fx";
import { BRIDGE, FALLS, RIVER_ROCKS, deckAt, heightAt, riverX, riverHalfWidth } from "./gorgeShape";
import { swayMaterial, scatter, placement, fernGeometry, tuftGeometry, flowerGeometry, reedGeometry, vineGeometry } from "./plants";

export interface Dressing {
  update(dt: number, time: number, fx: Fx): void;
}

const slopeAt = (x: number, z: number): number => {
  const e = 0.5;
  return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
};
/** Distance from the river's edge (negative = in the water). */
const fromRiver = (x: number, z: number): number => Math.abs(x - riverX(z)) - riverHalfWidth(z);
/** Keep the path, the bridge ends and the camera's foreground clear of tall things. */
const keepClear = (x: number, z: number): boolean => (Math.abs(z) < 3.2 && Math.abs(x) < 26) || (z > -3 && Math.abs(x) < 15);

const CAMP = new THREE.Vector3(14.5, 0, -6.5);
const FIRE = new THREE.Vector3(12.6, 0, -4.2);

export function dressGorge(scene: THREE.Scene, mats: ModelMaterials, atlas: SignAtlas, bin: Bin): Dressing {
  const rand = mulberry32(77);
  const r = (a: number, b: number) => a + rand() * (b - a);
  const time = mats.time;

  // ── Rocks ──────────────────────────────────────────────
  const rocks: THREE.BufferGeometry[] = [];
  const rock = (x: number, y: number, z: number, size: [number, number, number], mossy = 0.4, color = PAL.stone) => {
    const g = rockBlob(Math.round(x * 13 + z * 7), size, stoneFn(color, mossy, rand), 1);
    g.rotateY(rand() * 6);
    g.translate(x, y, z);
    rocks.push(g);
  };
  for (const [dx, z, s] of RIVER_ROCKS) rock(riverX(z) + dx, -0.2, z, [s * 1.2, s * 0.85, s], 0.35);
  for (let i = 0; i < 34; i++) {
    const z = r(-24, 24);
    const side = rand() < 0.5 ? -1 : 1;
    const x = riverX(z) + side * (riverHalfWidth(z) + r(-0.3, 1.0));
    if (Math.abs(z) < 2.4) continue;
    const s = r(0.5, 1.3);
    rock(x, heightAt(x, z) - s * 0.3, z, [s * r(1, 1.5), s * r(0.6, 0.9), s], 0.55);
  }
  // Cliff: big boulders at its foot and mossy ledges stacked up its face
  const fallX = riverX(FALLS.z);
  for (let i = 0; i < 16; i++) {
    const x = fallX + (i % 2 ? 1 : -1) * r(4.5, 26);
    const z = FALLS.z + r(0.5, 4.5);
    const s = r(1.0, 2.2);
    rock(x, heightAt(x, z) - s * 0.35, z, [s * 1.3, s, s * 1.1], 0.4);
  }
  for (let i = 0; i < 46; i++) {
    const x = fallX + (rand() < 0.5 ? -1 : 1) * r(3.8, 30);
    const y = r(1.2, FALLS.top - 0.6);
    const z = FALLS.z - 0.2 - ((y - 1) / FALLS.drop) * 2.6 + r(-0.4, 0.4);
    rock(x, y, z, [r(1.6, 3.2), r(0.45, 0.8), r(1.0, 1.6)], 0.75, rand() < 0.5 ? "#b2a796" : PAL.stone);
  }
  // Rocks on the meadows (outside the foreground)
  for (let i = 0; i < 18; i++) {
    const x = r(-45, 45);
    const z = r(-25, 20);
    if (keepClear(x, z) || fromRiver(x, z) < 3 || slopeAt(x, z) > 0.4) continue;
    const s = r(0.4, 1.1);
    rock(x, heightAt(x, z) - s * 0.25, z, [s * 1.3, s * 0.8, s], 0.6);
  }
  const rockMesh = new THREE.Mesh(merge(rocks), mats.solid);
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  scene.add(rockMesh);

  // ── Trees and bushes ───────────────────────────────────
  const floraKinds = [roundTree(1), roundTree(2), roundTree(3), pineTree(4), pineTree(5), bush(6), bush(7, "#ff5d8f"), bush(8, "#9b4dff")];
  const floraMats: THREE.Matrix4[][] = floraKinds.map(() => []);
  const plant = (x: number, z: number, kind: number, s: number) => floraMats[kind].push(placement(x, heightAt(x, z) - 0.1, z, s));
  let placed = 0;
  for (let attempt = 0; attempt < 3000 && placed < 120; attempt++) {
    const x = r(-80, 80);
    const z = r(-120, 22);
    const h = heightAt(x, z);
    if (keepClear(x, z) || fromRiver(x, z) < 3.5 || slopeAt(x, z) > 0.45 || h < 2) continue;
    if (Math.abs(x - fallX) < 9 && z < FALLS.z && z > FALLS.z - 14) continue;
    if (x > 9 && x < 20 && z > -12 && z < 0) continue; // the camp
    const far = z < FALLS.z - 3;
    plant(x, z, far ? (rand() < 0.5 ? 3 + Math.floor(rand() * 2) : Math.floor(rand() * 3)) : Math.floor(rand() * 5), r(1.0, 1.7));
    placed++;
  }
  for (let i = 0; i < 40; i++) {
    const z = r(-26, 24);
    const side = rand() < 0.5 ? -1 : 1;
    const x = riverX(z) + side * (riverHalfWidth(z) + r(2.8, 4.5));
    if ((Math.abs(z) < 3 && Math.abs(x) < 14) || slopeAt(x, z) > 0.6) continue;
    plant(x, z, 5 + Math.floor(rand() * 3), r(0.9, 1.5));
  }
  floraKinds.forEach((k, i) => scene.add(scatter(k.geometry, swayMaterial(bin, time, k.swayStart, k.swayAmp, k.doubleSided), floraMats[i])));

  // ── Small plants ───────────────────────────────────────
  const ferns: THREE.Matrix4[] = [];
  for (let i = 0; i < 110; i++) {
    const z = r(-27, 24);
    const side = rand() < 0.5 ? -1 : 1;
    const x = riverX(z) + side * (riverHalfWidth(z) + r(0.3, 2.8));
    if (Math.abs(z) < 2.3 && Math.abs(x) < 10) continue;
    ferns.push(placement(x, heightAt(x, z) - 0.05, z, r(0.8, 1.5), undefined, r(-0.25, 0.25)));
  }
  for (let i = 0; i < 30; i++) {
    const x = fallX + (rand() < 0.5 ? -1 : 1) * r(4, 20);
    const z = FALLS.z + r(1, 4);
    ferns.push(placement(x, heightAt(x, z), z, r(1, 1.8)));
  }
  scene.add(scatter(fernGeometry(3), swayMaterial(bin, time, 0.2, 0.06, true), ferns));

  const reeds: THREE.Matrix4[] = [];
  for (let i = 0; i < 40; i++) {
    const z = r(-22, 24);
    const side = rand() < 0.5 ? -1 : 1;
    const x = riverX(z) + side * (riverHalfWidth(z) + r(-0.5, 0.3));
    if (Math.abs(z) < 2.5) continue;
    reeds.push(placement(x, Math.max(heightAt(x, z), -0.3), z, r(0.8, 1.2)));
  }
  scene.add(scatter(reedGeometry(5), swayMaterial(bin, time, 0.3, 0.08, true), reeds, false));

  const tufts: THREE.Matrix4[] = [];
  for (let i = 0; i < 900 && tufts.length < 520; i++) {
    const x = r(-34, 34);
    const z = r(-27, 24);
    const h = heightAt(x, z);
    if (fromRiver(x, z) < 2.4 || slopeAt(x, z) > 0.5 || h < 2) continue;
    if (Math.abs(z + Math.sin(x * 0.3) * 0.25) < 1.3 && Math.abs(x) < 34) continue;
    tufts.push(placement(x, h - 0.03, z, r(0.8, 1.7)));
  }
  scene.add(scatter(tuftGeometry(9), swayMaterial(bin, time, 0.1, 0.12, true), tufts, false));

  const flowerColors = ["#ffffff", "#ffd23f", "#ff6fb5", "#b388ff", "#ff5a4f", "#6fc8ff"];
  flowerColors.forEach((c, k) => {
    const list: THREE.Matrix4[] = [];
    for (let i = 0; i < 160 && list.length < 34; i++) {
      const x = r(-30, 30);
      const z = r(-27, 22);
      if (fromRiver(x, z) < 2.6 || slopeAt(x, z) > 0.5 || heightAt(x, z) < 2) continue;
      list.push(placement(x, heightAt(x, z) - 0.02, z, r(1.0, 1.6)));
    }
    scene.add(scatter(flowerGeometry(c, k), swayMaterial(bin, time, 0.1, 0.1), list, false));
  });

  // ── Vines from the bridge and the cliff edge ───────────
  const vines: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const x = r(-6.5, 6.5);
    const side = i % 2 ? 1 : -1;
    const g = vineGeometry(r(0.7, 2.0), i);
    g.translate(x, deckAt(x) - 0.3, side * (BRIDGE.width / 2 + 0.12));
    vines.push(g);
  }
  for (let i = 0; i < 22; i++) {
    const x = fallX + (i % 2 ? 1 : -1) * r(3.5, 18);
    const z = FALLS.z - 1.2 + r(-0.6, 0.4);
    const top = heightAt(x, z - 1.5) - 0.1;
    const g = vineGeometry(r(2, 6), 40 + i);
    g.translate(x, top, z + 0.4);
    vines.push(g);
  }
  const vineMesh = new THREE.Mesh(merge(vines), swayMaterial(bin, time, -99, 0, true));
  vineMesh.castShadow = true;
  scene.add(vineMesh);

  // ── Signs and the ogre's camp ──────────────────────────
  const props = emptyModel();
  const put = (m: ReturnType<typeof emptyModel>, x: number, z: number, rot: number, s = 1, lift = 0) => addModel(props, m, placeAt(x, heightAt(x, z) + lift, z, rot, s));
  put(boardSign(atlas, "Oger-Brücke", 2.6, "#e3ad66"), 11.6, 3.0, -0.35);
  put(boardSign(atlas, "Zoll: 1 Kuchen!", 2.2, "#f2d38a", "#a12a1e"), 11.2, -3.0, -0.75, 0.9);
  put(haystack(3), CAMP.x, CAMP.z, 0.4, 1.3);
  put(barrel(5, 1.1), CAMP.x - 2.4, CAMP.z - 1.2, 0);
  put(barrel(6, 0.9), CAMP.x - 1.6, CAMP.z - 2.0, 0.4);
  put(bucket(), FIRE.x + 1.6, FIRE.z - 0.8, 0.3, 1.4);
  // Campfire: stone ring, crossed logs and a pot on a tripod
  const fy = heightAt(FIRE.x, FIRE.z);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    props.solid.push(rockBlob(i + 300, [0.24, 0.18, 0.2], stoneFn("#8f877d", 0, rand)).translate(FIRE.x + Math.cos(a) * 0.62, fy + 0.08, FIRE.z + Math.sin(a) * 0.62));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    props.solid.push(cyl(0.09, 0.09, 1.0, PAL.woodDark, { pos: [FIRE.x, fy + 0.12, FIRE.z], rot: [Math.PI / 2, a, 0] }, 7));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const foot = new THREE.Vector3(FIRE.x + Math.cos(a) * 0.8, fy, FIRE.z + Math.sin(a) * 0.8);
    const top = new THREE.Vector3(FIRE.x, fy + 1.7, FIRE.z);
    const mid = foot.clone().lerp(top, 0.5);
    const len = foot.distanceTo(top);
    const g = cyl(0.04, 0.05, len, PAL.wood, {}, 6);
    g.applyMatrix4(new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize()), new THREE.Vector3(1, 1, 1)));
    props.solid.push(g);
  }
  props.solid.push(cyl(0.34, 0.26, 0.42, PAL.iron, { pos: [FIRE.x, fy + 1.0, FIRE.z] }, 12));
  props.solid.push(cyl(0.36, 0.36, 0.05, "#55565e", { pos: [FIRE.x, fy + 1.21, FIRE.z] }, 12));
  scene.add(modelGroup(props, mats, true, atlas.material));

  const flameMat = bin.material(new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.3, 0.25), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const flames: THREE.Mesh[] = [];
  const flameGeo = new THREE.ConeGeometry(0.22, 0.8, 8);
  flameGeo.translate(0, 0.4, 0);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(flameGeo, flameMat);
    const a = (i / 4) * Math.PI * 2;
    f.position.set(FIRE.x + Math.cos(a) * (i ? 0.18 : 0), fy + 0.12, FIRE.z + Math.sin(a) * (i ? 0.18 : 0));
    f.scale.setScalar(i ? 0.7 : 1.1);
    flames.push(f);
    scene.add(f);
  }
  const fireLight = new THREE.PointLight("#ff9a40", 6, 7, 1.6);
  fireLight.position.set(FIRE.x, fy + 0.8, FIRE.z);
  scene.add(fireLight);

  let sparkTimer = 0;
  return {
    update(dt, t, fx) {
      flames.forEach((f, i) => {
        const k = 1 + Math.sin(t * 13 + i * 2.1) * 0.15 + Math.sin(t * 7.3 + i) * 0.1;
        f.scale.y = (i ? 0.7 : 1.1) * k;
        f.rotation.z = Math.sin(t * 5 + i) * 0.15;
      });
      fireLight.intensity = 5 + Math.sin(t * 17) * 0.8 + Math.sin(t * 7) * 0.6;
      sparkTimer -= dt;
      if (sparkTimer < 0) {
        sparkTimer = 0.18;
        const at = new THREE.Vector3(FIRE.x, fy + 0.5, FIRE.z);
        fx.glow.emit({ at, count: 1, speed: [0.6, 1.4], dir: new THREE.Vector3(0, 1, 0), spread: 0.4, gravity: -1.2, drag: 0.8, life: [0.8, 1.4], size: [0.08, 0.02], color: ["#ffb347", "#ffd27a"], intensity: 3, shape: SHAPE.spark });
        fx.puff.emit({ at: at.clone().setY(fy + 1.5), count: 1, speed: [0.3, 0.6], dir: new THREE.Vector3(0.2, 1, 0), spread: 0.3, gravity: -0.4, drag: 0.3, life: [2.5, 3.5], size: [0.3, 1.4], color: "#cfc6bd", alpha: 0.25, spin: 0.5 });
      }
    },
  };
}

export { CAMP, FIRE };
