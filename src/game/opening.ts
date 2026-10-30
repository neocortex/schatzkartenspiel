/**
 * The opening of the adventure (quest 1): a bottle on a quiet beach, the map
 * inside it, the shark's hit at sea, the flight down to the landing beach and
 * the first call for help. Space only ever advances the dialogue and the map
 * card, so the cinematics run the same however wildly it is pressed.
 */

import * as THREE from "three";
import { Engine } from "../core/Engine";
import { Shot } from "../core/CameraRig";
import { IslandScene } from "../scenes/IslandScene";
import { GameUI } from "../ui/GameUI";
import { showMapCard } from "../ui/MapCard";
import { Chuleta } from "../characters/Chuleta";
import { Humanoid } from "../characters/Humanoid";
import { createTadeo } from "../characters/cast";
import { mat, toonMesh } from "../characters/parts";
import { createShark, Shark } from "../challenges/sea/Shark";
import { Bursts } from "../challenges/shared/bursts";
import { Owned } from "../challenges/shared/dispose";
import { Particles } from "../challenges/shared/particles";
import { NOISE_GLSL } from "../core/glsl";
import { DialogueScript } from "../data/dialogues";
import { QUESTS } from "../data/quests";
import { audio } from "../audio/Audio";
import { waterHeight } from "../world/Water";
import { LANDMARKS, P2 } from "../world/layout";
import { NORTH_DOCK_BOAT, sailboat } from "../world/models/boats";
import { glowTexture, puffTexture } from "../world/ambient/textures";
import { CHULETA_INTRO } from "./chuletaLines";

export interface OpeningDeps {
  engine: Engine;
  ui: GameUI;
  island: IslandScene;
  talk(script: string | DialogueScript): Promise<void>;
  startCinematic(fn: (t: number) => Shot): void;
  endCinematic(seconds: number): void;
  placePlayer(x: number, z: number, facing?: number): void;
  chuleta: Chuleta;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const { clamp, lerp, smoothstep, smootherstep } = THREE.MathUtils;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ── The beach ───────────────────────────────────────────────

/** A white sand bar far from the landing beach, with only open sea behind it: "a beach near his home". */
const HOME_BEACH: P2 = [90, 112];
/** From Tadeo to the bottle at his feet. */
const BOTTLE_AT = v3(-1.15, 0, 0.8);
/** Seconds the camera takes to tilt down from the sky to the beach. */
const TILT_SECONDS = 5.5;

/** A corked glass bottle with a rolled-up map inside (the neck points along -x, lying on its side). */
function messageBottle(owned: Owned): THREE.Group {
  const profile = [[0, 0], [0.17, 0], [0.2, 0.04], [0.21, 0.12], [0.21, 0.55], [0.17, 0.66], [0.09, 0.76], [0.075, 0.82], [0.075, 0.97], [0.098, 0.99], [0.098, 1.03], [0, 1.03]];
  const glass = owned.add(new THREE.MeshStandardMaterial({ color: "#8fe6cf", transparent: true, opacity: 0.42, roughness: 0.06, emissive: "#4fc0a4", emissiveIntensity: 0.3, depthWrite: false }));
  const bottle = toonMesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20), glass);
  // Reason: the water plane draws late and writes no depth, so glass in front of the sea has to draw after it
  bottle.renderOrder = 3;
  const paper = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.42, 12), mat("#f4e4bd", 0.8), false);
  paper.position.y = 0.33;
  const ribbon = toonMesh(new THREE.TorusGeometry(0.105, 0.02, 6, 16), mat("#d3191f", 0.6), false);
  ribbon.rotation.x = Math.PI / 2;
  ribbon.position.y = 0.33;
  const cork = toonMesh(new THREE.CylinderGeometry(0.09, 0.07, 0.15, 10), mat("#b98a55", 0.9));
  cork.position.y = 1.07;
  const g = new THREE.Group();
  g.add(bottle, paper, ribbon, cork);
  g.scale.setScalar(1.35);
  return g;
}

/** The washed-up bottle, its twinkle and the camera on the beach. */
class BeachShot {
  readonly group = new THREE.Group();
  /** Cut from the wide view to Tadeo's face. */
  closeUp = false;
  private owned = new Owned();
  private sparks = new Bursts(glowTexture(), true);
  private bottle = messageBottle(this.owned);
  private glint: THREE.Vector3;
  private twinkleIn = 1.2;
  private last = 0;
  private tadeo: THREE.Vector3;

  constructor(island: IslandScene) {
    this.group.name = "opening-beach";
    const hf = island.island.hf;
    const t = v3(HOME_BEACH[0], hf.heightAt(HOME_BEACH[0], HOME_BEACH[1]), HOME_BEACH[1]);
    this.tadeo = t;
    const at = t.clone().add(BOTTLE_AT);
    at.y = hf.heightAt(at.x, at.z);
    // Reason: half sunk into the sand, side-on to the camera so it reads as a bottle, its neck tipped up a little
    this.bottle.position.set(at.x, at.y + 0.22, at.z);
    this.bottle.rotation.set(0, 1.25, Math.PI / 2 - 0.1, "YXZ");
    this.group.add(this.bottle, this.sparks.mesh);
    this.glint = at.clone().add(v3(0, 0.42, 0));
    island.island.scene.add(this.group);
  }

  frame(t: number): Shot {
    const dt = t - this.last;
    this.last = t;
    this.twinkleIn -= dt;
    if (this.twinkleIn < 0) {
      this.twinkleIn = 0.9 + Math.random() * 0.7;
      this.sparks.emit(this.glint, { count: 1, color: new THREE.Color(2.4, 2.3, 1.7), speed: [0, 0], life: [0.5, 0.5], size: [1.3, 1.3], grow: 0.15, drag: 0 });
      this.sparks.emit(this.glint, { count: 4, color: new THREE.Color(2.4, 2.1, 1.1), speed: [0.3, 0.9], up: 0.5, life: [0.5, 0.9], size: [0.1, 0.2], spread: 0.3 });
    }
    this.sparks.update(dt);
    const p = this.tadeo;
    if (this.closeUp) {
      // Reason: he has the map out by now, so the bottle is no longer in the way of his face
      this.bottle.visible = false;
      return { pos: p.clone().add(v3(-3.1, 1.2, -0.8)), look: p.clone().add(v3(0.25, 0.72 + Math.sin(t * 0.5) * 0.02, 0.1)) };
    }
    const k = smootherstep(t, 0, TILT_SECONDS);
    const sway = Math.sin(t * 0.3) * 0.08;
    return {
      pos: p.clone().add(v3(lerp(-7.2, -5.1, k), lerp(1.05, 1.3, k) + sway, lerp(-2.4, -1.5, k))),
      look: p.clone().add(v3(lerp(9, 0.1, k), lerp(17, 0.62, k), lerp(5, 0.9, k))),
    };
  }

  dispose(): void {
    this.owned.add(this.sparks);
    this.group.removeFromParent();
    this.owned.disposeScene(this.group);
  }
}

// ── The shark at sea ────────────────────────────────────────

/** Deep open water west of the landing beach, with the island on the horizon to the right. */
const SEA_START = v3(-192, 0, 102);
/** Sailing towards the island. */
const HEADING = v3(0.96, 0, -0.28).normalize();
/** To starboard: the camera's side of the boat. */
const STARBOARD = v3(-HEADING.z, 0, HEADING.x);
const SAIL_SPEED = 3.2;
/** Riding high enough that the waves never slop over the floorboards. */
const FREEBOARD = 0.24;
/** Depth at which only the dorsal fin cuts the surface. */
const FIN_DEPTH = -1.3;
/** Beats of the sea shot in its own seconds (slow motion stretches what follows the hit). */
const FIN_IN = 2.3;
const FIN_END = 6.15;
const HIT = 6.6;
const CUT = HIT + 0.46;
/** Clock speed once the hit has landed. */
const SLOW_MOTION = 0.42;
/** He sits turned towards the camera, smiling, while the fin comes up behind him. */
const HERO_YAW = 2.05;
/** The fin's curve relative to the boat, (ahead, starboard): cruising past far out, then turning in on the stern. */
const FIN_FROM = new THREE.Vector2(-30, -34);
const FIN_VIA = new THREE.Vector2(-12, -26);
const FIN_TO = new THREE.Vector2(-3.4, -3.2);
/** The cello: a low note that comes faster and faster, then one held breath before the hit. */
const DUN = [3.0, 3.85, 4.55, 5.05, 5.4, 5.65, 5.85, 6.02, 6.16];

const WAKE_VERT = /* glsl */ `
varying vec2 vLocal;
varying vec2 vWorld;
void main() {
  vLocal = position.xz;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const WAKE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLength;
uniform float uWidth;
uniform float uCollar;
uniform float uStrength;
varying vec2 vLocal;
varying vec2 vWorld;
${NOISE_GLSL}
void main() {
  float along = vLocal.y / uLength;
  float spread = uWidth * (0.2 + 0.8 * sqrt(max(along, 0.0)));
  float side = abs(vLocal.x) / spread;
  // Reason: the noise hangs in the world and only the V moves, so the foam stays put while the boat sails away from it
  float n = vnoise(vWorld * 1.6 + vec2(0.0, uTime * 0.6)) * 0.6 + vnoise(vWorld * 4.0 - uTime * 0.4) * 0.4;
  float edge = smoothstep(0.76, 0.9, side) * (1.0 - smoothstep(0.94, 1.0, side));
  float churn = (1.0 - smoothstep(0.0, 0.35, along)) * (1.0 - smoothstep(0.1, 0.8, side));
  float fade = pow(max(1.0 - along, 0.0), 1.3) * step(0.0, along);
  float foam = max(edge * smoothstep(0.36, 0.62, n + (1.0 - along) * 0.14), churn * 0.7 * smoothstep(0.35, 0.7, n)) * fade;
  // A collar of foam where the hull meets the water
  float r = length(vec2(vLocal.x / 0.98, vLocal.y / 2.5));
  foam = max(foam, uCollar * smoothstep(0.8, 1.0, r) * (1.0 - smoothstep(1.02, 1.32, r)) * smoothstep(0.3, 0.62, n));
  float a = foam * uStrength * 0.85;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(1.0), a);
}`;

/** A flat V of foam spreading behind something on the water; local +z is astern. */
function foamWake(time: { value: number }, length: number, width: number, collar: number): THREE.Mesh {
  const ahead = collar > 0 ? 3.6 : 0.5;
  const geo = new THREE.PlaneGeometry(width * 2 + 2, length + ahead).rotateX(-Math.PI / 2).translate(0, 0, (length - ahead) / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uLength: { value: length }, uWidth: { value: width }, uCollar: { value: collar }, uStrength: { value: 1 } },
    vertexShader: WAKE_VERT,
    fragmentShader: WAKE_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  // Reason: the water writes no depth, so foam drawn after it lies on the waves whatever their height
  mesh.renderOrder = 2;
  return mesh;
}

class SeaShot {
  readonly group = new THREE.Group();
  /** Resolves on the frame the picture has to cut to black. */
  readonly cut: Promise<void>;
  private cutNow!: () => void;
  private owned = new Owned();
  private boat = new THREE.Group();
  private tilt = new THREE.Group();
  private hero: Humanoid = createTadeo();
  private shark: Shark = createShark();
  private boatWake: THREE.Mesh;
  private finWake: THREE.Mesh;
  private foam = new Bursts(puffTexture(), false);
  private drops = new Bursts(glowTexture(), false);
  private flash = new Bursts(glowTexture(), true);
  private splinters = new Particles({
    geometry: new THREE.BoxGeometry(0.7, 0.05, 0.17),
    material: this.owned.add(new THREE.MeshStandardMaterial({ roughness: 0.8 })),
    max: 36,
    gravity: 15,
    drag: 0.3,
  });
  private clock = 0;
  private last = 0;
  private sprayIn = 0;
  private hit = false;
  private dun = 0;
  private musicOut = false;
  private at = new THREE.Vector3();
  private finAt = new THREE.Vector3();

  constructor(private island: IslandScene, private engine: Engine) {
    this.cut = new Promise((resolve) => (this.cutNow = resolve));
    this.group.name = "opening-sea";
    this.shark.root.name = "opening-shark";
    const { landmarks } = island.island;
    const model = new THREE.Group();
    landmarks.meshesFor(sailboat(landmarks.atlas, NORTH_DOCK_BOAT, "TADEO", 23), "opening-boat").forEach((m) => model.add(m));
    // Reason: boat models point their bow along +x; here the bow points along -z, which `yaw` then turns onto the heading
    model.rotation.y = Math.PI / 2;
    this.tilt.add(model, this.hero.root);
    this.hero.pose = "sit";
    this.hero.root.position.set(0, 0.2, 1.25);
    this.hero.root.rotation.y = HERO_YAW;
    this.boat.add(this.tilt);
    this.boat.rotation.y = Math.atan2(-HEADING.x, -HEADING.z);
    const time = island.island.uniforms.uTime;
    this.boatWake = foamWake(time, 26, 4.6, 1);
    this.boatWake.rotation.y = this.boat.rotation.y;
    this.finWake = foamWake(time, 15, 2.6, 0);
    this.shark.root.rotation.order = "YXZ";
    this.shark.root.position.y = FIN_DEPTH - 2;
    this.shark.swim = 2;
    this.shark.mood = "angry";
    this.group.add(this.boat, this.shark.root, this.boatWake, this.finWake, this.foam.mesh, this.drops.mesh, this.flash.mesh, this.splinters.mesh);
    island.island.scene.add(this.group);
    audio.playMusic("music_overworld", 0.8);
  }

  /** A point moving along with the boat: metres ahead, up and to starboard of where it would float. */
  private rel(ahead: number, up: number, starboard: number): THREE.Vector3 {
    return SEA_START.clone().addScaledVector(HEADING, SAIL_SPEED * this.clock + ahead).addScaledVector(STARBOARD, starboard).setY(up);
  }

  frame(t: number): Shot {
    const real = t - this.last;
    this.last = t;
    // Reason: a short sharp hit, then the moment hangs in the air until the cut
    const dt = real * (this.clock > HIT + 0.08 ? SLOW_MOTION : 1);
    this.clock += dt;
    this.playCues();
    this.moveBoat(dt);
    this.moveShark(dt);
    this.spray(dt);
    this.foam.update(dt);
    this.drops.update(dt);
    this.flash.update(real);
    this.splinters.update(dt, this.island.camera, this.clock);
    if (this.clock >= CUT) this.cutNow();
    return this.camera();
  }

  private playCues(): void {
    if (!this.musicOut && this.clock > FIN_IN + 0.4) {
      this.musicOut = true;
      audio.stopMusic(1.4);
    }
    while (this.dun < DUN.length && this.clock >= DUN[this.dun]) {
      // Reason: the door's creak, slowed down, is the deepest sound there is
      audio.playSfx("sfx_door", 0.55 + this.dun * 0.06, 0.5);
      this.dun++;
    }
    if (!this.hit && this.clock >= HIT) {
      this.hit = true;
      this.strike();
    }
  }

  /** The hit itself: one frame, everything at once. */
  private strike(): void {
    this.island.rig.addShake(1.2);
    audio.playSfx("sfx_hit_damage", 1, 0.55);
    audio.playSfx("sfx_hammer_hit", 1, 0.45);
    audio.playSfx("sfx_enemy_hit", 1, 0.6);
    audio.playSfx("sfx_wave", 1, 0.7);
    const at = this.rel(-1.4, 0.3, -0.4);
    this.flash.emit(at.clone().setY(1.2), { count: 1, color: new THREE.Color(3.2, 3.2, 3), speed: [0, 0], life: [0.2, 0.2], size: [15, 15], grow: 1.4, drag: 0 });
    this.drops.emit(at, { count: 240, color: "#f4fdff", speed: [4, 13], up: 8, gravity: 15, life: [0.8, 1.5], size: [0.1, 0.3], grow: 0.5, drag: 0.5, spread: 3 });
    // Reason: the white water bursts up behind the shark, so its face stays clear of it
    const behind = this.rel(-2.8, 0.2, -3.2);
    this.foam.emit(behind, { count: 36, color: "#ffffff", speed: [3, 7], up: 3, gravity: 3, life: [0.7, 1.3], size: [1, 1.9], grow: 2, drag: 2.4, spread: 2.4 });
    this.foam.emit(this.rel(-2.8, 0.1, -4.4), { count: 26, color: "#ffffff", speed: [8, 15], life: [0.5, 1], size: [0.7, 1.2], grow: 2.2, drag: 3, flat: true, spread: 3 });
    // Splinters of his boat: the hull's red, its stripe and the planks' wood
    const colors = [NORTH_DOCK_BOAT.hull, NORTH_DOCK_BOAT.stripe, "#7a4a24"];
    this.splinters.emit(36, (p, k) => {
      p.pos.copy(at).add(v3(Math.random() - 0.5, 1 + Math.random(), Math.random() - 0.5));
      p.vel.set((Math.random() - 0.5) * 15, 5 + Math.random() * 11, (Math.random() - 0.2) * 11).addScaledVector(HEADING, 2);
      p.spin.set(Math.random() * 18 - 9, Math.random() * 18 - 9, Math.random() * 18 - 9);
      p.color.set(colors[k % colors.length]);
      p.life = 2;
      p.size = 0.6 + Math.random() * 0.9;
    });
    this.shark.bounce(-0.5);
    this.shark.mouth = 1;
  }

  private moveBoat(dt: number): void {
    const time = this.engine.time;
    const pos = this.rel(0, 0, 0);
    const wave = (ahead: number, side: number) => waterHeight(pos.x + HEADING.x * ahead + STARBOARD.x * side, pos.z + HEADING.z * ahead + STARBOARD.z * side, time);
    const bow = wave(2, 0);
    const stern = wave(-2, 0);
    const toPort = wave(0, -0.9);
    const toStarboard = wave(0, 0.9);
    const since = this.clock - HIT;
    const up = this.hit ? 1 - Math.pow(1 - clamp(since / 0.34, 0, 1), 3) : 0;
    this.boat.position.set(pos.x, (bow + stern + toPort + toStarboard) * 0.25 + FREEBOARD + up * 2.7, pos.z);
    // Reason: the waves are small out here, so a slow swell of its own keeps her sailing rather than sitting
    this.tilt.rotation.x = Math.atan2(bow - stern, 4) + Math.sin(this.clock * 1.5) * 0.035 - up * 0.62;
    // Reason: she rolls towards the camera, so the hit shows Tadeo in the boat rather than the bottom of the hull
    this.tilt.rotation.z = Math.atan2(toPort - toStarboard, 1.8) * 0.5 + Math.sin(this.clock * 1.05) * 0.035 - up * 0.7;
    this.boatWake.position.set(pos.x, 0.02, pos.z);

    const h = this.hero;
    h.update(dt, { speed: 0, grounded: true, vy: 0 });
    if (this.hit) {
      // Tadeo flung up, arms in the air, eyes wide
      h.armL.rotation.set(0, 0, -2.7);
      h.armR.rotation.set(0, 0, 2.7);
      h.legL.rotation.x = -0.2;
      h.legR.rotation.x = 0.5;
      h.body.position.y = up * 0.65;
      h.head.rotation.y = 0;
      h.face.eyes.forEach((e) => e.scale.setScalar(1.3));
      h.face.mouth.scale.set(1.2, 2.4, 1);
      return;
    }
    // A happy wave at us, one hand on the gunwale
    const waving = 1 - smoothstep(this.clock, FIN_IN + 1.6, FIN_IN + 2);
    h.armL.rotation.set(-0.3, 0, -0.9);
    h.armR.rotation.set(-0.5 * (1 - waving), 0, lerp(0.6, 2.5 + Math.sin(this.clock * 11) * 0.3, waving));
    // He hears it: a glance over the shoulder at the very last moment
    const worry = smoothstep(this.clock, FIN_END - 1.15, FIN_END - 0.75);
    h.head.rotation.y = lerp(h.head.rotation.y, -0.75, worry);
    if (worry > 0) h.face.eyes.forEach((e) => e.scale.set(1.15, Math.max(e.scale.y, 0.4) * 1.15, 1.15));
  }

  private moveShark(dt: number): void {
    const s = this.shark;
    const r = s.root;
    s.update(dt);
    if (this.hit) {
      // Up from below, jaws wide, right under the stern, its angry face to the camera
      const k = 1 - Math.pow(1 - clamp((this.clock - HIT) / 0.2, 0, 1), 3);
      r.position.copy(this.rel(-3.5, lerp(-4, 1.15, k), -0.7));
      r.rotation.set(-0.5, Math.atan2(STARBOARD.x + HEADING.x * 0.5, STARBOARD.z + HEADING.z * 0.5), 0);
      this.finWake.visible = false;
      return;
    }
    const raw = clamp((this.clock - FIN_IN) / (FIN_END - FIN_IN), 0, 1);
    // Reason: it starts lazily and comes faster and faster, weaving less the closer it gets
    const k = Math.pow(raw, 1.5);
    const weave = Math.sin(raw * Math.PI * 2.5) * 2.4 * (1 - raw);
    const ahead = (1 - k) * (1 - k) * FIN_FROM.x + 2 * k * (1 - k) * FIN_VIA.x + k * k * FIN_TO.x + weave;
    const side = (1 - k) * (1 - k) * FIN_FROM.y + 2 * k * (1 - k) * FIN_VIA.y + k * k * FIN_TO.y;
    this.at.copy(r.position);
    const dive = smoothstep(this.clock, FIN_END, FIN_END + 0.3);
    const up = this.clock < FIN_IN ? FIN_DEPTH - 2 : FIN_DEPTH - dive * 2.4 - (1 - smoothstep(this.clock, FIN_IN, FIN_IN + 0.5)) * 2;
    r.position.copy(this.rel(ahead, up, side));
    const dx = r.position.x - this.at.x;
    const dz = r.position.z - this.at.z;
    if (dx * dx + dz * dz > 1e-5) r.rotation.set(0, Math.atan2(dx, dz), 0);
    this.finWake.position.set(r.position.x, 0.02, r.position.z);
    this.finWake.rotation.y = r.rotation.y + Math.PI;
    (this.finWake.material as THREE.ShaderMaterial).uniforms.uStrength.value = smoothstep(this.clock, FIN_IN, FIN_IN + 0.5) * (1 - dive);
  }

  /** White water thrown up at the bow and around the fin. */
  private spray(dt: number): void {
    this.sprayIn -= dt;
    if (this.sprayIn > 0 || this.hit) return;
    this.sprayIn = 0.05;
    this.drops.emit(this.rel(2, 0.2, (Math.random() < 0.5 ? -1 : 1) * 0.5), { count: 1, color: "#f4fdff", speed: [0.8, 1.8], up: 1.8, gravity: 9, life: [0.3, 0.6], size: [0.07, 0.14], spread: 0.2 });
    const r = this.shark.root;
    if (r.position.y < FIN_DEPTH - 0.4) return;
    this.finAt.copy(r.position).setY(0.25);
    this.drops.emit(this.finAt, { count: 2, color: "#f4fdff", speed: [0.6, 1.8], up: 2.2, gravity: 9, life: [0.3, 0.6], size: [0.09, 0.2], spread: 0.5 });
  }

  private camera(): Shot {
    const c = this.clock;
    const near = smootherstep(c, FIN_IN, FIN_END);
    const pos = this.rel(lerp(-3.4, -2.2, near), lerp(2.3, 2, near), lerp(11.8, 9, near));
    const look = this.rel(lerp(0.6, -2.4, near), lerp(1.9, 1.7, near), lerp(0, -1.6, near));
    if (!this.hit) return { pos, look };
    // Reason: the crash zoom is most of the punch: the camera is thrown at the hit in a few frames
    const crash = 1 - Math.pow(1 - clamp((c - HIT) / 0.1, 0, 1), 3);
    pos.lerp(this.rel(-1.9, 2.1, 9.2), crash);
    look.lerp(this.rel(-1.3, 2.85, -0.6), crash);
    return { pos, look };
  }

  dispose(): void {
    [this.foam, this.drops, this.flash, this.splinters].forEach((fx) => this.owned.add(fx));
    this.group.removeFromParent();
    this.owned.disposeScene(this.group);
  }
}

// ── The flow ────────────────────────────────────────────────

/** Sky, beach, bottle, map, and off he goes. */
async function findTheBottle(d: OpeningDeps): Promise<void> {
  const { engine, island } = d;
  const beach = new BeachShot(island);
  // Reason: he looks down at the bottle, three-quarters towards the camera
  d.placePlayer(HOME_BEACH[0], HOME_BEACH[1], Math.atan2(BOTTLE_AT.x, BOTTLE_AT.z));
  d.startCinematic((t) => beach.frame(t));
  audio.setAmbience(true);
  audio.stopMusic(1);
  await engine.fade(0, 1400);
  await wait(1100);
  await d.talk("intro_bottle");
  beach.closeUp = true;
  // Reason: for his big line he looks straight into the camera
  island.player.facing = -1.45;
  await showMapCard(d.ui.layer, engine.input);
  await d.talk("intro_treasure");
  island.player.avatar.pose = "cheer";
  await wait(750);
  await engine.fade(1, 450);
  island.player.avatar.pose = "normal";
  beach.dispose();
}

/** Sailing, the fin, the hit, the cut to black. Nothing but the picture for the whole of it. */
async function sharkAtSea(d: OpeningDeps): Promise<void> {
  const sea = new SeaShot(d.island, d.engine);
  d.startCinematic((t) => sea.frame(t));
  void d.engine.fade(0, 500);
  await sea.cut;
  await d.engine.fade(1, 50);
  flyToTheLandingBeach(d);
  sea.dispose();
  audio.playSfx("sfx_hit_damage", 0.9, 0.4);
  audio.playSfx("sfx_wave", 0.8, 0.5);
  await wait(1000);
}

/** Start the flight from the open sea down to Tadeo on the landing beach (the screen is still black). */
function flyToTheLandingBeach(d: OpeningDeps): void {
  const p = d.island.player;
  d.placePlayer(LANDMARKS.spawn[0], LANDMARKS.spawn[1], 0);
  const from: Shot = { pos: v3(-150, 34, 135), look: v3(-74, 4, 56) };
  const to: Shot = {
    pos: p.position.clone().add(v3(1.5, 4.5, 8.5)),
    look: p.position.clone().add(v3(0, 1.2, 0)),
  };
  d.startCinematic((t) => {
    const k = smootherstep(t, 0, 9);
    return { pos: from.pos.clone().lerp(to.pos, k), look: from.look.clone().lerp(to.look, k) };
  });
}

/** Washed ashore: the flight's end, Chuleta out of the backpack, the wreck, the voice from the volcano. */
async function arrive(d: OpeningDeps): Promise<void> {
  audio.playMusic("music_overworld");
  audio.setAmbience(true);
  await d.engine.fade(0, 1200);
  await wait(2600);
  await d.ui.hud.showBanner("Kapitel 1", QUESTS[0].name, 3200);
  await wait(1400);
  d.endCinematic(1.8);
  await wait(900);
  d.chuleta.climbOut();
  await wait(800);
  await d.talk(CHULETA_INTRO);
  await d.talk("intro_arrival");
}

/**
 * Play the whole opening. Ends with Tadeo on the landing beach, ready for the HUD and the next quest.
 *
 * @param deps What the opening needs from the game. The screen is black when it starts.
 */
export async function playOpening(deps: OpeningDeps): Promise<void> {
  deps.chuleta.hideInBackpack();
  await findTheBottle(deps);
  await sharkAtSea(deps);
  await arrive(deps);
}
