/**
 * The giant shark encounter: the fin circles the stopped boat, then the shark
 * dives (bubbles and a dark shadow show where), leaps out of the sea towards
 * Tadeo and hangs in the air in slow motion while a timing ring closes on its
 * head. Space in the green window swings the golden hammer — BONK! Too early
 * just whiffs (and you can try again); missing only gets Tadeo splashed.
 * Three bonks and the dizzy shark gives up and swims away waving.
 */

import * as THREE from "three";
import { audio } from "../../audio/Audio";
import { Input } from "../../core/Input";
import { Timeline, ease, lerp, hump, clamp01, Bin } from "../ogre/kit";
import { Fx } from "../ogre/fx";
import { Director } from "../ogre/director";
import { Popups } from "../ogre/popups";
import { Shark } from "./Shark";
import { Boat } from "./boat";
import { SeaUI } from "./seaUI";

export interface FightStage {
  tl: Timeline;
  boat: Boat;
  shark: Shark;
  fx: Fx;
  cam: Director;
  pop: Popups;
  ui: SeaUI;
  input(): Input;
  /** Scaled game-time step of the current frame. */
  dt(): number;
  slowmo(scale: number, seconds: number): void;
  hitStop(seconds: number): void;
  onBonk(count: number): void;
}

/** Fin height: the body stays just under the surface, the dorsal fin cuts the water. */
const CRUISE_Y = -1.55;
const BONKS_NEEDED = 3;
const TAUNTS = ["Hihi! Gleich hab ich dich!", "Happ-happ!", "Nur ein kleiner Biss!"];
const OUCH = ["Aua, mein Kopf!", "Hey! Das tut weh!", "Okay, okay! Du gewinnst!"];

export class SharkFight {
  bonks = 0;
  /** True while the shark is in the air (for the test). */
  leaping = false;
  /** True while Space lands a bonk. */
  ringNow = false;
  /** Position on the circle around the boat (-π/2 = straight ahead of the bow). */
  private angle = -Math.PI * 0.5;
  private circling = false;
  private foamTimer = 0;
  private shadow: THREE.Mesh;
  /** A Space press seen during the leap, waiting for the leap loop to handle it. */
  private spacePressed = false;

  constructor(
    private s: FightStage,
    bin: Bin,
    scene: THREE.Object3D,
  ) {
    const m = bin.material(new THREE.MeshBasicMaterial({ color: "#062a4a", transparent: true, opacity: 0, depthWrite: false }));
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), m);
    this.shadow.renderOrder = 3;
    scene.add(this.shadow);
    // Reason: yaw first, then pitch and roll about the shark's own axes (nose-up leaps, corkscrew spins)
    s.shark.root.rotation.order = "YXZ";
  }

  private get boatPos(): THREE.Vector3 {
    return this.s.boat.root.position;
  }

  /** Keep the shark circling the boat (call every frame). */
  update(dt: number): void {
    const { shark, fx } = this.s;
    // Reason: async continuations after `await tl.frame()` run after the engine has
    // cleared this frame's key presses, so the press is latched here synchronously
    if (this.leaping && this.s.input().consume("Space")) this.spacePressed = true;
    if (!this.circling) return;
    this.angle += dt * 0.55;
    const r = 11;
    const b = this.boatPos;
    const x = b.x + Math.cos(this.angle) * r;
    const z = b.z + Math.sin(this.angle) * r;
    shark.root.position.set(x, lerp(shark.root.position.y, CRUISE_Y, Math.min(dt * 2, 1)), z);
    shark.root.rotation.set(0, Math.atan2(-Math.sin(this.angle), Math.cos(this.angle)), 0);
    this.foamTimer -= dt;
    if (this.foamTimer <= 0) {
      this.foamTimer = 0.05;
      const fin = shark.root.localToWorld(new THREE.Vector3(0, 0.75, 0.2));
      fin.y = 0.15;
      fx.puff.emit({ at: fin, count: 2, speed: [0.6, 1.6], dir: new THREE.Vector3(0, 1, 0), spread: 1, gravity: 4, drag: 1.5, life: [0.5, 0.9], size: [0.3, 0.7], color: "#ffffff", alpha: 0.8 });
    }
  }

  /** The fin approaches from ahead and starts circling. */
  async arrive(): Promise<void> {
    const { shark, tl } = this.s;
    const b = this.boatPos;
    shark.root.visible = true;
    shark.mood = "grin";
    shark.mouth = 0.15;
    shark.swim = 1.4;
    const from = new THREE.Vector3(b.x + 6, CRUISE_Y, b.z - 45);
    const to = new THREE.Vector3(b.x + Math.cos(this.angle) * 11, CRUISE_Y, b.z + Math.sin(this.angle) * 11);
    shark.root.rotation.set(0, Math.atan2(to.x - from.x, to.z - from.z), 0);
    await tl.tween(3.2, (k) => {
      shark.root.position.lerpVectors(from, to, ease.inOut(k));
      this.s.fx.puff.emit({ at: shark.root.localToWorld(new THREE.Vector3(0, 0.75, 0.2)).setY(0.15), count: 1, speed: [0.6, 1.4], dir: new THREE.Vector3(0, 1, 0), spread: 1, gravity: 4, drag: 1.5, life: [0.5, 0.9], size: [0.3, 0.7], color: "#ffffff", alpha: 0.8 });
    });
    shark.swim = 1;
    this.circling = true;
  }

  /** Fight until three bonks. */
  async run(): Promise<void> {
    let side = 1;
    while (this.bonks < BONKS_NEEDED) {
      this.circling = true;
      this.wideShot();
      await this.s.tl.wait(this.bonks === 0 ? 1.6 : 2.4);
      const hit = await this.attack(side);
      if (hit) side = -side;
    }
    this.circling = false;
  }

  private wideShot(): void {
    const b = this.boatPos;
    this.s.cam.move(new THREE.Vector3(b.x, 12.5, b.z + 19), new THREE.Vector3(b.x, 0.5, b.z - 1.5), 1.4);
  }

  /** One dive-and-leap. Resolves true when Tadeo landed the bonk. */
  private async attack(side: number): Promise<boolean> {
    const { shark, boat, fx, tl, cam, pop, ui } = this.s;
    const b = this.boatPos.clone();
    this.circling = false;
    // Dive towards the launch spot beside the boat
    const launch = new THREE.Vector3(b.x + side * 9.5, -3, b.z - 0.8);
    const from = shark.root.position.clone();
    shark.swim = 2;
    boat.side = side;
    boat.pose = "stand";
    // Reason: over Tadeo's shoulder but ahead of the mast, so the sail never hides the shark's face
    cam.move(new THREE.Vector3(b.x - side * 3.5, 3.8, b.z - 9.0), new THREE.Vector3(b.x + side * 1.6, 1.9, b.z - 0.5), 1.0);
    pop.show(TAUNTS[this.bonks % TAUNTS.length], new THREE.Vector3(launch.x, 2.6, launch.z), { size: 30, bubble: true, life: 1.8, rise: 0.4 });
    audio.playSfx("sfx_timer_warn");
    const shadowMat = this.shadow.material as THREE.MeshBasicMaterial;
    this.shadow.position.set(launch.x, 0.12, launch.z);
    await tl.tween(1.3, (k) => {
      shark.root.position.lerpVectors(from, launch, ease.inOut(k));
      this.shadow.scale.setScalar(1.5 + k * 2.2);
      shadowMat.opacity = k * 0.45;
      if (Math.random() < 0.5) fx.puff.emit({ at: new THREE.Vector3(launch.x + (Math.random() - 0.5) * 3, 0.1, launch.z + (Math.random() - 0.5) * 3), count: 1, speed: [0.5, 1.5], dir: new THREE.Vector3(0, 1, 0), spread: 0.2, gravity: -1, life: [0.3, 0.6], size: [0.25, 0.1], color: "#e8fbff", alpha: 0.9 });
    });
    // Leap!
    shadowMat.opacity = 0;
    fx.splash(new THREE.Vector3(launch.x, 0.1, launch.z), 1.8);
    audio.playSfx("sfx_wave");
    shark.mouth = 0.9;
    shark.mood = "grin";
    const apex = new THREE.Vector3(b.x + side * 3.1, 2.4, b.z - 0.6);
    const yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.leaping = true;
    this.spacePressed = false;
    let hit = false;
    let swingLeft = 0;
    let slowed = false;
    let k = 0;
    let hang = 0;
    const tryHit = (now: boolean) => {
      const pressed = this.spacePressed;
      this.spacePressed = false;
      if (swingLeft > 0 || !pressed) return;
      swingLeft = 0.35;
      boat.pose = "swing";
      boat.swing = 0;
      audio.playSfx(now ? "sfx_attack" : "sfx_hammer_miss");
      if (now) hit = true;
      else pop.show("Zu früh!", boat.hero.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 2.4, 0)), { size: 36, color: "#ffe066", life: 1.0 });
    };
    // Rise (k 0 → 1), then hang at the apex in slow motion while the window is open
    while (!hit && hang < 0.5) {
      await tl.frame();
      const dt = this.s.dt();
      if (k < 1) k = Math.min(k + dt / 1.15, 1);
      else hang += dt;
      const e = ease.outQuad(k);
      shark.root.position.set(lerp(launch.x, apex.x, e), lerp(launch.y, apex.y, e) + hump(k) * 0.6 + Math.sin(hang * 8) * 0.04, lerp(launch.z, apex.z, e));
      shark.root.rotation.set(-0.9 * (1 - e) + 0.15, yaw, side * 0.2 * (1 - e));
      if (k < 0.5 && Math.random() < 0.6) fx.puff.emit({ at: shark.root.position.clone().setY(0.2), count: 2, speed: [1, 3], dir: new THREE.Vector3(0, 1, 0), spread: 0.6, gravity: 12, life: [0.4, 0.7], size: [0.3, 0.12], color: "#ffffff", alpha: 0.9 });
      const now = k >= 0.6;
      if (now && !slowed) {
        slowed = true;
        this.s.slowmo(0.33, 2.2);
      }
      this.ringNow = now;
      ui.setRing(shark.headPos(), Math.min(k / 0.95, 1), now);
      if (swingLeft > 0) {
        swingLeft -= dt;
        boat.swing = clamp01(1 - swingLeft / 0.35);
        if (swingLeft <= 0) boat.pose = "stand";
      }
      tryHit(now);
    }
    this.leaping = false;
    this.ringNow = false;
    ui.setRing(null);
    this.s.slowmo(1, 0);
    if (hit) await this.bonk(side, yaw);
    else await this.splashBoat(side, yaw);
    return hit;
  }

  private async bonk(side: number, yaw: number): Promise<void> {
    const { shark, boat, fx, tl, cam, pop } = this.s;
    // Finish the swing, then BONK
    await tl.tween(0.12, (k) => (boat.swing = lerp(boat.swing, 0.55, k)));
    const head = shark.headPos();
    this.bonks++;
    fx.hit(head, "#ffe066", 1.6);
    fx.stars(head, 16);
    audio.playSfx("sfx_hammer_hit");
    audio.playSfx("sfx_enemy_hit", 0.8, 0.7);
    pop.show("BONK!", head.clone().add(new THREE.Vector3(0, 1.0, 0)), { color: "#ffd23f", size: 96, life: 1.3 });
    shark.mood = "dizzy";
    shark.mouth = 0.5;
    shark.addBump();
    shark.bounce(0.8);
    cam.shake(0.9);
    cam.punch(4);
    this.s.hitStop(0.16);
    this.s.onBonk(this.bonks);
    await tl.tween(0.2, (k) => (boat.swing = lerp(0.55, 1, k)));
    boat.pose = "stand";
    // Knocked back into the sea with a spin
    const from = shark.root.position.clone();
    const to = new THREE.Vector3(from.x + side * 7.5, -3.2, from.z - 1.5);
    await tl.tween(1.0, (k) => {
      shark.root.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, ease.inQuad(k)) + hump(k) * 2.2, lerp(from.z, to.z, k));
      shark.root.rotation.set(0.4 + k * 0.8, yaw, side * k * Math.PI * 2);
    });
    fx.splash(new THREE.Vector3(to.x, 0.1, to.z), 2.2);
    audio.playSfx("sfx_wave");
    // The shark lands off to the side: pull back so it stays in view
    this.wideShot();
    pop.show(OUCH[Math.min(this.bonks - 1, OUCH.length - 1)], new THREE.Vector3(to.x, 3.2, to.z), { size: 32, bubble: true, life: 2.0, rise: 0.4 });
    // Pop up dizzy for a moment
    shark.root.rotation.set(-0.35, yaw, 0);
    await tl.tween(0.6, (k) => shark.root.position.set(to.x, lerp(-3.2, -0.55, ease.outBack(k)), to.z));
    await tl.wait(1.4);
    shark.mood = this.bonks >= BONKS_NEEDED ? "dizzy" : "angry";
    shark.mouth = 0.15;
    // Reason: continue circling from wherever the shark surfaced
    const b = this.boatPos;
    this.angle = Math.atan2(to.z - b.z, to.x - b.x);
    shark.swim = 1;
  }

  private async splashBoat(side: number, yaw: number): Promise<void> {
    const { shark, boat, fx, tl, cam, pop } = this.s;
    // Belly flop right beside the boat: Tadeo gets soaked, nothing worse
    const from = shark.root.position.clone();
    const to = new THREE.Vector3(this.boatPos.x + side * 2.2, -2.8, this.boatPos.z + 2.4);
    shark.mouth = 0.2;
    await tl.tween(0.45, (k) => {
      shark.root.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, ease.inQuad(k)), lerp(from.z, to.z, k));
      shark.root.rotation.set(0.15 + k * 0.6, yaw, 0);
    });
    fx.splash(new THREE.Vector3(to.x, 0.2, to.z), 2.6);
    fx.splash(boat.hero.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.2, 0)), 0.8);
    audio.playSfx("sfx_wave");
    boat.bump(0.9);
    boat.pose = "duck";
    cam.shake(0.6);
    pop.show("Platsch!", new THREE.Vector3(to.x, 2.4, to.z), { color: "#7fdcff", size: 72 });
    await tl.wait(0.9);
    pop.show("Nochmal! Warte auf den grünen Ring!", boat.hero.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 2.6, 0)), { size: 28, bubble: true, life: 2.2, rise: 0.3 });
    boat.pose = "stand";
    shark.mood = "grin";
    shark.root.rotation.set(0, yaw, 0);
    const b = this.boatPos;
    this.angle = Math.atan2(to.z - b.z, to.x - b.x);
    await tl.wait(0.4);
  }

  /** Beaten: the dizzy shark surfaces, waves its fin and swims off into the distance. */
  async farewell(): Promise<void> {
    const { shark, tl, pop, fx } = this.s;
    const b = this.boatPos;
    const at = new THREE.Vector3(b.x + 6.5, -0.55, b.z - 4);
    const from = shark.root.position.clone();
    shark.root.rotation.set(-0.3, -Math.PI / 2 + 0.6, 0);
    await tl.tween(1.0, (k) => shark.root.position.lerpVectors(from, at, ease.inOut(k)));
    this.s.cam.move(new THREE.Vector3(b.x - 2, 4.2, b.z + 9), new THREE.Vector3(b.x + 3.5, 1.2, b.z - 3), 1.2);
    await tl.wait(1.0);
    shark.mood = "happy";
    shark.waving = true;
    shark.mouth = 0.05;
    pop.show("Schon gut, du kleiner Held! Gute Reise!", new THREE.Vector3(at.x, 3.4, at.z), { size: 30, bubble: true, life: 2.6, rise: 0.3 });
    await tl.wait(2.4);
    shark.waving = false;
    shark.swim = 2;
    // Off it goes, fin cutting the water, with a happy little jump far away
    const away = new THREE.Vector3(b.x + 60, CRUISE_Y, b.z - 70);
    const start = shark.root.position.clone();
    shark.root.rotation.set(0, Math.atan2(away.x - start.x, away.z - start.z), 0);
    await tl.tween(3.5, (k) => {
      shark.root.position.lerpVectors(start, away, ease.inQuad(k));
      shark.root.position.y = lerp(-0.55, CRUISE_Y, clamp01(k * 3)) + (k > 0.7 ? hump((k - 0.7) / 0.3) * 4.5 : 0);
      if (Math.random() < 0.4) fx.puff.emit({ at: shark.root.position.clone().setY(0.15), count: 1, speed: [0.5, 1.5], dir: new THREE.Vector3(0, 1, 0), spread: 1, gravity: 4, life: [0.5, 0.9], size: [0.3, 0.8], color: "#ffffff", alpha: 0.8 });
    });
    shark.root.visible = false;
  }
}
