/**
 * Everyone at the festival, on the village stage after dark: the villagers and
 * sages the stage already has, plus the friends Tadeo made on the way (the ogre,
 * Flocke the fox, the mole, Chuleta), the chest with the gold, the plan and the
 * fireworks. Tadeo wears his crown.
 */

import * as THREE from "three";
import { createChuletaModel } from "../../characters/Chuleta";
import { HenModel, HenPose } from "../../characters/HenModel";
import { Mole, createMole } from "../../characters/Mole";
import { mat, toonMesh } from "../../characters/parts";
import { glowTexture } from "../../world/ambient/textures";
import { Fox } from "../forest/fox";
import { Ogre, createOgre } from "../ogre/Ogre";
import { Actor } from "../shared/actor";
import { Bursts } from "../shared/bursts";
import { Particles } from "../shared/particles";
import { TreasureChest } from "../treasure/chest";
import { Fireworks, createCoins, createGems } from "../treasure/fx";
import { VillageStage } from "../village/stage";

/** A guest's name is the name they speak under in the dialogue box. */
export interface Guest {
  name: string;
  object: THREE.Object3D;
}

/** Crowd seats of the villagers who have a name; seat 3 wears Paco's looks, so he is Paco himself tonight. */
const SEAT = { jonas: 0, lina: 1, mia: 2, paco: 3 };

/** Tadeo stands in the middle of the rug, so in the wide shot the fire burns above his head and not in him. */
const TADEO_AT: [number, number] = [0, 3.4];
const OGRE_AT: [number, number] = [-7.2, -2.4];
/** Far enough left to stay out of the corner of Paco's close-up. */
const FOX_AT: [number, number] = [0.9, 2];
const MOLE_AT: [number, number] = [-3.3, 1.4];
const HEN_AT: [number, number] = [-1.5, 2];
/** Behind the camera in Paco's close-up, and right of the line from the party camera to him. */
const CHEST_AT: [number, number] = [4.2, 2.8];
const HEN_SCALE = 0.9;

/** The rocket on its plan: white lines on blue paper, the way real plans look. No words, it has to speak for itself. */
function rocketPlanTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 384;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#2f6fd0";
  g.fillRect(0, 0, 512, 384);
  g.strokeStyle = "rgba(255,255,255,0.18)";
  g.lineWidth = 2;
  for (let x = 32; x < 512; x += 32) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 384);
    g.stroke();
  }
  for (let y = 32; y < 384; y += 32) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  g.strokeStyle = "#ffffff";
  g.lineWidth = 9;
  g.lineJoin = "round";
  g.lineCap = "round";
  // Body, nose and two fins, lying on a slant as if it were already on its way
  g.translate(256, 192);
  g.rotate(0.35);
  g.beginPath();
  g.moveTo(0, -150);
  g.bezierCurveTo(62, -92, 62, 34, 38, 88);
  g.lineTo(-38, 88);
  g.bezierCurveTo(-62, 34, -62, -92, 0, -150);
  g.stroke();
  g.beginPath();
  g.moveTo(-48, 30);
  g.lineTo(-92, 110);
  g.lineTo(-34, 88);
  g.moveTo(48, 30);
  g.lineTo(92, 110);
  g.lineTo(34, 88);
  g.stroke();
  g.beginPath();
  g.arc(0, -38, 25, 0, Math.PI * 2);
  g.stroke();
  // The flame, the only warm thing on the page
  g.strokeStyle = "#ffd23f";
  g.beginPath();
  g.moveTo(-22, 100);
  g.quadraticCurveTo(0, 170, 22, 100);
  g.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Feast {
  readonly fireworks: Fireworks;
  readonly coins: Particles;
  readonly gems: Particles;
  readonly chest: TreasureChest;
  readonly ogre: Ogre;
  readonly fox: Fox;
  readonly mole: Mole;
  readonly hen: HenModel;
  readonly egg: THREE.Mesh;
  /** The plan, unrolled: it hangs in Tadeo's hands while he looks at it. */
  readonly plan: THREE.Mesh;
  readonly paco: Actor;
  readonly guests: Guest[];
  readonly tadeoAt = TADEO_AT;
  phase: "talk" | "party" = "talk";
  atWide = false;
  /** How low Paco hangs his head: 0 upright, 1 ashamed. */
  bow = 0;
  /** The hen's mood: she flaps for joy. */
  henPose: HenPose = { speed: 0, flap: 0, peck: 0, sit: 0, pant: false, look: 0, air: false };
  disposed = false;
  private foxSparks = new Bursts(glowTexture());

  constructor(readonly stage: VillageStage) {
    const s = stage;
    s.scene.fog = new THREE.Fog("#0d1540", 30, 150);
    s.plaza.setNight();
    s.drums.group.visible = false;
    s.stones.group.visible = false;
    s.tadeo.place(TADEO_AT[0], TADEO_AT[1], Math.atan2(0.12, 1));
    const floor = () => 0.03;
    this.coins = createCoins(floor, s.owned);
    this.gems = createGems(floor, s.owned);
    this.fireworks = new Fireworks(s.owned);

    this.chest = new TreasureChest(s.owned);
    this.chest.shatter();
    this.chest.group.position.set(CHEST_AT[0], 0, CHEST_AT[1]);
    this.chest.group.rotation.y = -0.45;

    // Tadeo keeps the crown he found
    const crown = this.chest.crown;
    crown.name = "crown";
    crown.visible = true;
    crown.position.set(0, 0.36, 0.02);
    crown.rotation.set(-0.12, 0, 0.06);
    s.tadeo.avatar.head.add(crown);

    this.ogre = createOgre();
    this.ogre.root.position.set(OGRE_AT[0], 0, OGRE_AT[1]);
    this.ogre.root.rotation.y = Math.atan2(-OGRE_AT[0], 3 - OGRE_AT[1]);
    this.ogre.mood = "happy";
    this.ogre.setPose("sit");

    this.fox = new Fox(() => 0);
    this.fox.teleport(FOX_AT[0], FOX_AT[1], 0);

    this.mole = createMole();
    this.mole.hungry = false;
    this.mole.root.position.set(MOLE_AT[0], 0, MOLE_AT[1]);
    this.mole.root.rotation.y = 0.4;

    this.hen = createChuletaModel();
    this.hen.root.position.set(HEN_AT[0], 0, HEN_AT[1]);
    this.hen.root.rotation.y = 0.3;
    this.hen.root.scale.setScalar(HEN_SCALE);

    this.egg = toonMesh(new THREE.SphereGeometry(0.15, 20, 16), mat("#ffd24a", 0.22, 0.85));
    this.egg.scale.set(1, 1.3, 1);
    this.egg.position.set(HEN_AT[0] + 0.55, 0.2, HEN_AT[1] + 0.1);
    this.egg.visible = false;
    // Reason: no depth test, or the ground it stands on cuts the glow off in a straight line
    const shine = new THREE.Sprite(s.owned.add(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(0.42, 0.26, 0.05), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false })));
    shine.scale.setScalar(1.3);
    shine.renderOrder = 4;
    this.egg.add(shine);

    this.plan = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.12), s.owned.add(new THREE.MeshBasicMaterial({ map: s.owned.add(rocketPlanTexture()), side: THREE.DoubleSide, toneMapped: false })));
    this.plan.visible = false;
    s.tadeo.avatar.root.add(this.plan);
    // Reason: above his head, in his raised hands: over his body it would hide the boy who found it
    this.plan.position.set(0, 2.2, 0.16);
    this.plan.rotation.x = -0.08;

    const c = s.crowd;
    const watcher = (i: number) => c.watchers[i].actor;
    this.paco = watcher(SEAT.paco);
    const stock = this.paco.overlay;
    this.paco.overlay = (h, dt) => {
      stock?.(h, dt);
      h.head.rotation.x = this.bow * 0.26;
    };

    s.scene.add(this.chest.group, this.ogre.root, this.mole.root, this.hen.root, this.egg, this.coins.mesh, this.gems.mesh, this.fireworks.sparks.mesh, this.foxSparks.mesh);
    this.fox.addTo(s.scene);

    this.guests = [
      { name: "Tadeo", object: s.tadeo.avatar.root },
      { name: "Chuleta", object: this.hen.root },
      { name: "Käpt'n Paco", object: this.paco.avatar.root },
      { name: "Dorfältester", object: c.sages.elder.avatar.root },
      { name: "Weise Frau", object: c.sages.wiseWoman.avatar.root },
      { name: "Weiser Mann", object: c.sages.wiseMan.avatar.root },
      { name: "Kleine Mia", object: watcher(SEAT.mia).avatar.root },
      { name: "Fischer Jonas", object: watcher(SEAT.jonas).avatar.root },
      { name: "Bäckerin Lina", object: watcher(SEAT.lina).avatar.root },
      { name: "Oger", object: this.ogre.root },
      { name: "Fuchs", object: this.fox.root },
      { name: "Maulwurf", object: this.mole.root },
    ];
  }

  /** Who really stands on the plaza: on stage, and neither they nor anything they hang from is hidden. */
  get present(): string[] {
    const shown = (o: THREE.Object3D | null): boolean => o === this.stage.scene || (!!o && o.visible && shown(o.parent));
    return this.guests.filter((g) => shown(g.object)).map((g) => g.name);
  }

  update(dt: number, time: number): void {
    const camera = this.stage.camera;
    this.chest.update(dt, time);
    this.ogre.update(dt);
    // Reason: with himself as the one to follow and no path map, Flocke sits where he was put and wags his tail
    this.fox.update(dt, time, this.fox.position, null, null, this.foxSparks);
    this.foxSparks.update(dt);
    this.mole.update(dt);
    this.hen.update(dt, this.henPose);
    this.coins.update(dt, camera, time);
    this.gems.update(dt, camera, time);
    this.fireworks.update(dt, camera, time);
  }

  dispose(): void {
    this.disposed = true;
  }
}
