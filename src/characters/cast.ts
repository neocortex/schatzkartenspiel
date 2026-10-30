/**
 * The cast: factory functions for Tadeo and the islanders, each a Humanoid
 * with its own look and a few signature accessories.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Humanoid } from "./Humanoid";
import { mat, toonMesh } from "./parts";

/** Tadeo: blond hair with a fringe, orange shirt, blue trousers, explorer backpack with a treasure map. */
export function createTadeo(): Humanoid {
  const h = new Humanoid({
    skin: "#ffd0a6",
    hair: "#ffcf3a",
    hairStyle: "fringe",
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

/** Käpt'n Paco: an old sailor with a bushy white beard, a captain's hat, a navy coat and a pirate's gold earring. */
export function createPaco(): Humanoid {
  const h = new Humanoid({
    skin: "#f4b890",
    hair: "#f4f2ea",
    // Reason: the hat is the top of his head; his white hair only shows as tufts below it (see addSailorBeard)
    hairStyle: "bald",
    shirt: "#27477e",
    pants: "#2b2f45",
    shoes: "#2a1e16",
  });
  addCaptainHat(h);
  addSailorBeard(h);
  addSeaCoat(h);
  const earring = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.013, 8, 16), mat("#ffc83d", 0.3, 0.5));
  earring.position.set(0.395, -0.105, 0.03);
  earring.rotation.y = 0.75;
  h.head.add(earring);
  return h;
}

/** Villagers for the plaza, varied by index. Number 3 is Paco; only the crowd asks for higher numbers. */
export function createVillager(i: number): Humanoid {
  // Reason: Paco is one person, so the looks repeat for the crowd without cloning his hat and beard
  if (i === 3) return createPaco();
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

/** White-topped peaked cap with a navy band, a shiny black visor and a gold anchor. */
function addCaptainHat(h: Humanoid): void {
  const hat = new THREE.Group();
  hat.name = "captain-hat";
  const white = mat("#fbf9f2", 0.7);
  const navy = mat("#1d2f57", 0.7);
  const gold = mat("#ffc83d", 0.3, 0.5);

  const band = toonMesh(new THREE.CylinderGeometry(0.355, 0.35, 0.13, 28), navy);
  band.position.y = 0.245;
  const crown = toonMesh(new THREE.CylinderGeometry(0.455, 0.355, 0.13, 28), white);
  crown.position.y = 0.37;
  const lid = toonMesh(new THREE.SphereGeometry(0.455, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2), white);
  lid.scale.y = 0.2;
  lid.position.y = 0.432;
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.358, 0.014, 6, 36), gold);
  cord.rotation.x = Math.PI / 2;
  cord.position.y = 0.305;
  hat.add(band, crown, lid, cord);

  // Reason: a flat oval pushed forward: only its front pokes out from under the band, so the peak has round ends
  const visor = toonMesh(new THREE.SphereGeometry(0.44, 28, 10), mat("#14141c", 0.25));
  visor.scale.set(0.88, 0.09, 1);
  visor.position.set(0, 0.215, 0.13);
  visor.rotation.x = 0.16;
  hat.add(visor);

  // Gold anchor on the front of the crown
  const anchor = new THREE.Group();
  const shank = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.09, 3, 6), gold);
  const stock = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.055, 3, 6), gold);
  stock.rotation.z = Math.PI / 2;
  stock.position.y = 0.035;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.006, 5, 10), gold);
  ring.position.y = 0.072;
  const flukes = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 6, 12, Math.PI), gold);
  flukes.rotation.z = Math.PI;
  flukes.position.y = -0.028;
  anchor.add(shank, stock, ring, flukes);
  anchor.position.set(0, 0.365, 0.415);
  anchor.rotation.x = -0.45;
  hat.add(anchor);

  // Reason: pushed back and a bit to the side, so the eyes stay free and the old man looks jaunty
  hat.rotation.set(-0.12, 0, -0.07);
  hat.position.y = -0.045;
  h.head.add(hat);
}

/** A big soft beard of round puffs from ear to ear, white hair below the hat, a moustache and a ruddy nose. */
function addSailorBeard(h: Humanoid): void {
  const white = mat("#f8f6ef", 0.85);
  const puff = (r: number, x: number, y: number, z: number) => {
    const m = toonMesh(new THREE.SphereGeometry(r, 14, 10), white);
    m.position.set(x, y, z);
    h.head.add(m);
  };
  // Tufts of hair at the temples and around the back of the head
  for (const [x, y, z, r] of [[-0.34, 0.11, -0.03, 0.08], [0.34, 0.11, -0.03, 0.08], [-0.24, 0.06, -0.22, 0.11], [0.24, 0.06, -0.22, 0.11], [0, 0.03, -0.31, 0.12]]) {
    puff(r, x, y, z);
  }
  // Along the jaw: starting below the ears (the earring stays visible), fuller towards the chin
  for (const a of [-1.05, -0.7, -0.35, 0, 0.35, 0.7, 1.05]) {
    const front = Math.cos(a);
    puff(0.085 + 0.05 * front, Math.sin(a) * 0.335, -0.09 - 0.235 * front, front * 0.31);
  }
  // The full lower beard, resting on his chest
  for (const [x, y, z, r] of [[-0.14, -0.44, 0.2, 0.125], [0.14, -0.44, 0.2, 0.125], [0, -0.53, 0.2, 0.125], [0, -0.41, 0.26, 0.11]]) {
    puff(r, x, y, z);
  }
  for (const side of [-1, 1]) {
    const tache = toonMesh(new THREE.CapsuleGeometry(0.04, 0.095, 4, 8), white, false);
    tache.position.set(side * 0.085, -0.098, 0.348);
    tache.rotation.set(0, side * 0.3, Math.PI / 2 - side * 0.38);
    h.head.add(tache);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), mat("#ee8f76", 0.5));
  nose.position.set(0, -0.042, 0.35);
  h.head.add(nose);
}

/** Over the plain shirt: gold buttons, a round tummy, coat tails, long sleeves with gold cuffs and epaulettes. */
function addSeaCoat(h: Humanoid): void {
  const coat = mat("#27477e", 0.75);
  const gold = mat("#ffc83d", 0.3, 0.5);
  const tummy = toonMesh(new THREE.SphereGeometry(0.215, 16, 12), coat);
  tummy.scale.set(1.05, 0.95, 0.98);
  tummy.position.set(0, 0.145, 0.025);
  const tails = toonMesh(new THREE.CylinderGeometry(0.215, 0.29, 0.22, 14), coat);
  tails.position.y = -0.055;
  const belt = toonMesh(new THREE.CylinderGeometry(0.228, 0.228, 0.06, 16), mat("#4a2e1c", 0.6), false);
  belt.scale.z = 0.94;
  belt.position.set(0, 0.055, 0.012);
  const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.075, 0.03, 2, 0.012), gold);
  buckle.position.set(0, 0.055, 0.226);
  h.torso.add(tummy, tails, belt, buckle);
  for (let row = 0; row < 3; row++) {
    for (const side of [-1, 1]) {
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.021, 8, 6), gold);
      const x = side * 0.08;
      const y = 0.12 + row * 0.07;
      button.position.set(x, y, 0.025 + Math.sqrt(0.215 ** 2 - x * x - (y - 0.145) ** 2) * 0.98);
      h.torso.add(button);
    }
  }
  for (const arm of [h.armL, h.armR]) {
    const sleeve = toonMesh(new THREE.CapsuleGeometry(0.076, 0.13, 4, 8), coat);
    sleeve.position.y = -0.17;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.073, 0.015, 6, 14), gold);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.245;
    const epaulette = toonMesh(new THREE.SphereGeometry(0.1, 12, 8), gold);
    epaulette.scale.set(1, 0.42, 1);
    epaulette.position.y = 0.035;
    arm.add(sleeve, cuff, epaulette);
  }
}

function addStaff(h: Humanoid, wood: THREE.ColorRepresentation, gem: THREE.ColorRepresentation): void {
  const staff = toonMesh(new THREE.CylinderGeometry(0.035, 0.045, 1.6, 8), mat(wood, 0.7));
  staff.position.set(0, 0.35, 0.05);
  h.handR.add(staff);
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), mat(gem, 0.2, 2.2));
  orb.position.set(0, 1.18, 0.05);
  h.handR.add(orb);
}
