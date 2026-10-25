/**
 * The cast: factory functions for Tadeo and the islanders, each a Humanoid
 * with its own look and a few signature accessories.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Humanoid } from "./Humanoid";
import { mat, toonMesh } from "./parts";

/** Tadeo: blond spiky hair, orange shirt, blue trousers, explorer backpack with a treasure map. */
export function createTadeo(): Humanoid {
  const h = new Humanoid({
    skin: "#ffd0a6",
    hair: "#ffcf3a",
    hairStyle: "spiky",
    shirt: "#ff7a1a",
    pants: "#2f6fd6",
    shoes: "#6b3f22",
  });
  // Backpack with flap and a rolled-up treasure map poking out
  const pack = toonMesh(new RoundedBoxGeometry(0.36, 0.4, 0.2, 3, 0.07), mat("#4f8a3a", 0.8));
  h.back.add(pack);
  const flap = toonMesh(new RoundedBoxGeometry(0.37, 0.16, 0.22, 3, 0.06), mat("#3c6e2c", 0.8));
  flap.position.set(0, 0.15, 0.01);
  h.back.add(flap);
  const map = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 10), mat("#f3e2b3", 0.9));
  map.position.set(0.1, 0.28, -0.02);
  map.rotation.z = -0.35;
  h.back.add(map);
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 6, 12), mat("#d62828", 0.6));
  ribbon.position.copy(map.position);
  ribbon.rotation.set(0, Math.PI / 2, -0.35);
  h.back.add(ribbon);
  // Red neckerchief
  const scarf = toonMesh(new THREE.TorusGeometry(0.15, 0.045, 8, 16), mat("#e63946", 0.7), false);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.47;
  h.torso.add(scarf);
  const knot = toonMesh(new THREE.ConeGeometry(0.08, 0.14, 4), mat("#e63946", 0.7), false);
  knot.position.set(0, 0.4, 0.15);
  knot.rotation.x = Math.PI;
  h.torso.add(knot);
  return h;
}

/** The village elder: white bun, long purple robe, walking staff. */
export function createElder(): Humanoid {
  const h = new Humanoid({
    skin: "#c98b5b",
    hair: "#eeeeee",
    hairStyle: "bun",
    shirt: "#7b4bb5",
    pants: "#5b3a8a",
    shoes: "#4a3020",
    robe: true,
    scale: 1.05,
  });
  addBeard(h, "#f2f2f2");
  addStaff(h, "#8a5a32", "#7cf0ff");
  return h;
}

/** The wise woman: long dark hair, teal robe, flower crown. */
export function createWiseWoman(): Humanoid {
  const h = new Humanoid({
    skin: "#b8794d",
    hair: "#3a2416",
    hairStyle: "long",
    shirt: "#1fa38a",
    pants: "#167a68",
    shoes: "#4a3020",
    robe: true,
  });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(["#ff5d8f", "#ffd23f", "#ffffff"][i % 3], 0.6));
    flower.position.set(Math.sin(a) * 0.37, 0.18, Math.cos(a) * 0.37);
    h.head.add(flower);
  }
  return h;
}

/** The wise man: bald, grey beard, orange robe, round glasses. */
export function createWiseMan(): Humanoid {
  const h = new Humanoid({
    skin: "#a8673f",
    hair: "#9e9e9e",
    hairStyle: "bald",
    shirt: "#f08a24",
    pants: "#c06a12",
    shoes: "#4a3020",
    robe: true,
  });
  addBeard(h, "#9e9e9e");
  for (const side of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 16), mat("#3a2a1a", 0.4));
    lens.position.set(side * 0.13, 0.02, 0.33);
    h.head.add(lens);
  }
  return h;
}

/** Generic villagers for the plaza, varied by index. */
export function createVillager(i: number): Humanoid {
  const looks = [
    { skin: "#e0a77a", hair: "#7a3e1d", hairStyle: "short", shirt: "#3d8bfd", pants: "#6b4a2b", shoes: "#3a2a1a" },
    { skin: "#8d5a3b", hair: "#1a1a1a", hairStyle: "bun", shirt: "#ffcf3a", pants: "#c0392b", shoes: "#3a2a1a" },
    { skin: "#f1c27d", hair: "#d35400", hairStyle: "spiky", shirt: "#27ae60", pants: "#34495e", shoes: "#3a2a1a", scale: 0.85 },
    { skin: "#c68642", hair: "#2c1b10", hairStyle: "long", shirt: "#e84393", pants: "#6c5ce7", shoes: "#3a2a1a" },
  ] as const;
  return new Humanoid({ ...looks[i % looks.length] });
}

function addBeard(h: Humanoid, color: THREE.ColorRepresentation): void {
  const beard = toonMesh(new THREE.ConeGeometry(0.2, 0.4, 10), mat(color, 0.8));
  beard.position.set(0, -0.3, 0.2);
  beard.rotation.x = Math.PI + 0.35;
  h.head.add(beard);
}

function addStaff(h: Humanoid, wood: THREE.ColorRepresentation, gem: THREE.ColorRepresentation): void {
  const staff = toonMesh(new THREE.CylinderGeometry(0.035, 0.045, 1.6, 8), mat(wood, 0.7));
  staff.position.set(0, 0.35, 0.05);
  h.handR.add(staff);
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), mat(gem, 0.2, 2.2));
  orb.position.set(0, 1.18, 0.05);
  h.handR.add(orb);
}
