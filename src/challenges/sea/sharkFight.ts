/**
 * The giant shark encounter: the fin circles the stopped boat, then the angry
 * shark dives (bubbles and a dark shadow show where), leaps out of the sea
 * towards Tadeo and hangs in the air in slow motion with its mouth wide open
 * while a timing ring closes on it. Space in the green window throws a magic
 * berry in — MAMPF! Too early throws nothing (and you can try again); missing
 * only gets Tadeo splashed. Three berries and the shark is lieb again: it waves,
 * flips its tail and swims away happy.
 */

import * as THREE from "three";
import { audio } from "../../audio/Audio";
import { Input } from "../../core/Input";
import { mat, toonMesh } from "../../characters/parts";
import { Timeline, ease, lerp, hump, clamp01, Bin } from "../ogre/kit";
import { Fx } from "../ogre/fx";
import { Director } from "../ogre/director";
import { Popups } from "../ogre/popups";
import { Shark } from "./Shark";
import { Boat } from "./boat";
import { Hearts } from "./hearts";
import { SeaUI } from "./seaUI";

export interface FightStage {
  tl: Timeline;
  boat: Boat;
  shark: Shark;
  fx: Fx;
  hearts: Hearts;
  cam: Director;
  pop: Popups;
  ui: SeaUI;
  input(): Input;
  /** Scaled game-time step of the current frame. */
  dt(): number;
  slowmo(scale: number, seconds: number): void;
  hitStop(seconds: number): void;
  onFeed(count: number): void;
}

/** Fin height: the body stays just under the surface, the dorsal fin cuts the water. */
const CRUISE_Y = -1.55;
/** Height and pitch of the shark rearing up with its head out of the water, so its face shows. */
const REAR_Y = 0.15;
const REAR_PITCH = -0.5;
const THROWS_NEEDED = 3;
/** How wide the mouth opens in a leap, a little past the jaw's normal 1. */
const MOUTH_WIDE = 1.2;
/** Seconds a berry flies, and how long the shark chews on it (until it has surfaced again). */
const THROW_TIME = 0.35;
const CHEW_TIME = 3.4;
/** What the shark calls out as it dives, by the berries it has eaten so far. */
const LEAP_CALLS = ["Grrr! Ich bin so wütend!", "Grrr... Hast du noch eine?", "Bitte noch eine! Happ-happ!"];
/** What it says with its mouth full, by the berries it has eaten. */
const YUMS = ["Mampf... Oh! Lecker!", "Mmmh! Ich werde ganz ruhig.", "Ach... Jetzt bin ich wieder lieb!"];

export class SharkFight {
  throws = 0;
  /** True while the shark is in the air (for the test). */
  leaping = false;
  /** True while Space throws a berry into the mouth. */
  ringNow = false;
  /** Position on the circle around the boat (-π/2 = straight ahead of the bow). */
  private angle = -Math.PI * 0.5;
  private circling = false;
  private foamTimer = 0;
  private shadow: THREE.Mesh;
  private berry: THREE.Group;
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
    this.berry = this.buildBerry();
    scene.add(this.berry);
    // Reason: yaw first, then pitch and roll about the shark's own axes (nose-up leaps, corkscrew spins)
    s.shark.root.rotation.order = "YXZ";
  }

  /** The one berry that flies: glowing purple with a little green leaf, big enough to follow with the eye. */
  private buildBerry(): THREE.Group {
    const g = new THREE.Group();
    g.name = "thrownBerry";
    const fruit = toonMesh(new THREE.SphereGeometry(0.26, 16, 12), mat("#9b4dff", 0.25, 0.9));
    const leaf = toonMesh(new THREE.SphereGeometry(0.14, 10, 6), mat("#5fb83a", 0.6));
    leaf.scale.set(1, 0.25, 0.55);
    leaf.position.y = 0.27;
    g.add(fruit, leaf);
    g.visible = false;
    return g;
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
    shark.mood = "angry";
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

  /** Keep leaping until three berries are in. */
  async run(): Promise<void> {
    let side = 1;
    while (this.throws < THROWS_NEEDED) {
      this.circling = true;
      this.wideShot();
      await this.s.tl.wait(this.throws === 0 ? 1.6 : 2.4);
      const hit = await this.attack(side);
      if (hit) side = -side;
    }
    this.circling = false;
  }

  private wideShot(): void {
    const b = this.boatPos;
    this.s.cam.move(new THREE.Vector3(b.x, 12.5, b.z + 19), new THREE.Vector3(b.x, 0.5, b.z - 1.5), 1.4);
  }

  /** One dive-and-leap. Resolves true when Tadeo threw a berry in. */
  private async attack(side: number): Promise<boolean> {
    const { shark, boat, fx, tl, cam, pop, ui } = this.s;
    const b = this.boatPos.clone();
    this.circling = false;
    // Dive towards the launch spot beside the boat
    const launch = new THREE.Vector3(b.x + side * 10, -3, b.z - 0.8);
    const from = shark.root.position.clone();
    shark.swim = 2;
    boat.side = side;
    boat.pose = "stand";
    // Reason: from the stern, on the shark's side of the sail, so nothing hides the shark's face or the berry's flight
    cam.move(new THREE.Vector3(b.x + side * 1.4, 3.3, b.z + 9.6), new THREE.Vector3(b.x + side * 3.0, 1.7, b.z - 0.6), 1.0);
    pop.show(LEAP_CALLS[this.throws % LEAP_CALLS.length], new THREE.Vector3(launch.x, 2.6, launch.z), { size: 30, bubble: true, life: 1.8, rise: 0.4 });
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
    shark.mouth = MOUTH_WIDE;
    // Reason: far enough out that the mouth hangs a good throw away from Tadeo, so the berry has an arc to fly
    const apex = new THREE.Vector3(b.x + side * 5.5, 2.4, b.z - 0.6);
    const yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.leaping = true;
    this.spacePressed = false;
    let hit = false;
    let armLeft = 0;
    let slowed = false;
    let k = 0;
    let hang = 0;
    const tryThrow = (now: boolean) => {
      const pressed = this.spacePressed;
      this.spacePressed = false;
      if (armLeft > 0 || !pressed) return;
      armLeft = 0.35;
      boat.pose = "throw";
      boat.throwK = 0;
      audio.playSfx(now ? "sfx_attack" : "sfx_menu_select", 1, now ? 1.4 : 1);
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
      ui.setRing(shark.mouthPos(), Math.min(k / 0.95, 1), now);
      if (armLeft > 0) {
        armLeft -= dt;
        boat.throwK = clamp01(1 - armLeft / 0.35);
        if (armLeft <= 0) boat.pose = "stand";
      }
      tryThrow(now);
    }
    this.leaping = false;
    this.ringNow = false;
    ui.setRing(null);
    this.s.slowmo(1, 0);
    if (hit) await this.feed(side, yaw);
    else await this.splashBoat(side, yaw);
    return hit;
  }

  private async feed(side: number, yaw: number): Promise<void> {
    const { shark, boat, fx, hearts, tl, cam, pop } = this.s;
    // The berry arcs from Tadeo's hand into the open mouth
    const hand = boat.berries.getWorldPosition(new THREE.Vector3());
    const mouth = new THREE.Vector3();
    this.berry.visible = true;
    await tl.tween(THROW_TIME, (k) => {
      // Reason: the swim wiggle keeps the head moving, so the berry aims at where the mouth is right now
      shark.mouthPos(mouth);
      this.berry.position.lerpVectors(hand, mouth, k);
      this.berry.position.y += hump(k) * 1.6;
      this.berry.rotation.z = k * 9;
      boat.throwK = k;
      fx.glow.emit({ at: this.berry.position, count: 1, speed: [0, 0.4], life: [0.18, 0.32], size: [0.5, 0.06], color: "#c58bff", intensity: 1.8 });
    });
    this.berry.visible = false;

    // MAMPF! The jaw snaps shut, the cheeks fill up, the eyes pop
    this.throws++;
    const calm = this.throws >= THROWS_NEEDED;
    shark.chew(CHEW_TIME);
    // Reason: chewing only holds the jaw while it lasts; after the swallow it would fling back to the leap's wide open mouth
    shark.mouth = 0.15;
    shark.bounce(0.9);
    shark.mood = calm ? "happy" : "grin";
    audio.playSfx("sfx_dig", 1, 0.75);
    audio.playSfx("sfx_berry_collect", 0.9, 0.7);
    void this.munchSounds();
    if (calm) audio.playSfx("sfx_heal");
    fx.heal(mouth);
    hearts.burst(shark.headPos(), calm ? 8 : this.throws + 1);
    pop.show("MAMPF!", shark.headPos().add(new THREE.Vector3(0, 1.4, 0)), { color: "#d9a6ff", size: 88, life: 1.3 });
    cam.punch(2);
    this.s.hitStop(0.1);
    this.s.onFeed(this.throws);
    boat.pose = "cheer";
    // It hangs there a moment, cheeks full and eyes popping
    const hung = shark.root.position.y;
    await tl.tween(0.75, (k) => (shark.root.position.y = hung - k * k * 0.5));

    // A happy dive back into the sea: it turns away and goes in nose first, like a dolphin
    const b = this.boatPos;
    const from = shark.root.position.clone();
    const to = new THREE.Vector3(from.x + side * 5.1, -3.2, from.z - 1.5);
    await tl.tween(1.0, (k) => {
      shark.root.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, ease.inQuad(k)) + hump(k) * 2.2, lerp(from.z, to.z, k));
      const turn = ease.inOut(clamp01(k * 1.6));
      shark.root.rotation.set(lerp(0.15, 1.05, ease.inOut(k)), yaw + side * Math.PI * turn, 0);
    });
    fx.splash(new THREE.Vector3(to.x, 0.1, to.z), 2.2);
    audio.playSfx("sfx_wave");
    boat.pose = "stand";
    // The shark lands off to the side: pull back so it stays in view, close enough to see its full cheeks
    cam.move(new THREE.Vector3(b.x + side * 7, 4.6, b.z + 10.5), new THREE.Vector3(b.x + side * 6, 1.2, b.z - 1), 0.8);
    // Pop up, still chewing, with its mouth full
    pop.show(YUMS[Math.min(this.throws - 1, YUMS.length - 1)], new THREE.Vector3(to.x, 3.6, to.z), { size: 32, bubble: true, life: 2.0, rise: 0.4 });
    shark.root.rotation.set(REAR_PITCH, yaw, 0);
    await tl.tween(0.6, (k) => shark.root.position.set(to.x, lerp(-3.2, REAR_Y, ease.outBack(k)), to.z));
    await tl.wait(1.4);
    // Back down to the water before it swims on
    await tl.tween(0.5, (k) => {
      shark.root.position.y = lerp(REAR_Y, CRUISE_Y, ease.inOut(k));
      shark.root.rotation.x = lerp(REAR_PITCH, 0, ease.inOut(k));
    });
    // Reason: continue circling from wherever the shark surfaced
    this.angle = Math.atan2(to.z - b.z, to.x - b.x);
    shark.swim = 1;
  }

  /** A few wet crunches while the shark chews. */
  private async munchSounds(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await this.s.tl.wait(0.22);
      audio.playSfx("sfx_dig", 0.55, 1.15 + i * 0.1);
    }
  }

  private async splashBoat(side: number, yaw: number): Promise<void> {
    const { shark, boat, fx, tl, cam, pop } = this.s;
    // Belly flop right beside the boat: Tadeo gets soaked, nothing worse
    const from = shark.root.position.clone();
    // Reason: on the far side from the camera, so the splash drops behind the boat and not over the whole picture
    const to = new THREE.Vector3(this.boatPos.x + side * 2.2, -2.8, this.boatPos.z - 2.4);
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
    shark.root.rotation.set(0, yaw, 0);
    const b = this.boatPos;
    this.angle = Math.atan2(to.z - b.z, to.x - b.x);
    await tl.wait(0.4);
  }

  /** Won over: the happy shark comes up beside the boat, wiggles and waves, flips its tail and swims off into the distance. */
  async farewell(): Promise<void> {
    const { shark, boat, tl, pop, fx, hearts } = this.s;
    const b = this.boatPos;
    const at = new THREE.Vector3(b.x + 6.5, REAR_Y, b.z - 4);
    boat.side = 1;
    const from = shark.root.position.clone();
    const facing = -Math.PI / 2 + 0.6;
    shark.root.rotation.set(REAR_PITCH, facing, 0);
    await tl.tween(1.0, (k) => shark.root.position.lerpVectors(from, at, ease.inOut(k)));
    this.s.cam.move(new THREE.Vector3(b.x + 2.4, 3.8, b.z + 9), new THREE.Vector3(b.x + 3.2, 1.5, b.z - 3), 1.2);
    await tl.wait(1.0);
    shark.mood = "happy";
    shark.waving = true;
    boat.pose = "cheer";
    shark.mouth = 0.45;
    hearts.burst(shark.headPos(), 10);
    fx.heal(shark.headPos());
    audio.playSfx("sfx_heal");
    pop.show("Das mit dem Boot tut mir leid. Gute Reise!", new THREE.Vector3(at.x, 4.2, at.z), { size: 30, bubble: true, life: 2.6, rise: 0.3 });
    await tl.wait(2.4);
    shark.waving = false;
    boat.pose = "stand";
    shark.swim = 2;
    // A little flip of the tail: it turns away, nose down, and the tail comes up out of the water and waves
    const away = new THREE.Vector3(b.x + 60, CRUISE_Y, b.z - 70);
    const heading = Math.atan2(away.x - at.x, away.z - at.z);
    shark.mouth = 0.1;
    await tl.tween(0.9, (k) => {
      const up = hump(k);
      shark.root.position.y = lerp(REAR_Y, -0.55, ease.inOut(k));
      shark.root.rotation.set(lerp(REAR_PITCH, 0.75, up), lerp(facing, heading, ease.inOut(k)), 0);
      shark.tail.rotation.x = Math.sin(k * Math.PI * 3) * 0.55 * up;
    });
    shark.tail.rotation.x = 0;
    const tailAt = shark.root.localToWorld(new THREE.Vector3(0, 0, -1.2)).setY(0.15);
    fx.splash(tailAt, 1.1);
    audio.playSfx("sfx_wave", 0.7, 1.3);
    // Off it goes, fin cutting the water, with a happy little jump far away
    const start = shark.root.position.clone();
    shark.root.rotation.set(0, heading, 0);
    await tl.tween(3.5, (k) => {
      shark.root.position.lerpVectors(start, away, ease.inQuad(k));
      shark.root.position.y = lerp(-0.55, CRUISE_Y, clamp01(k * 3)) + (k > 0.7 ? hump((k - 0.7) / 0.3) * 4.5 : 0);
      if (Math.random() < 0.4) fx.puff.emit({ at: shark.root.position.clone().setY(0.15), count: 1, speed: [0.5, 1.5], dir: new THREE.Vector3(0, 1, 0), spread: 1, gravity: 4, life: [0.5, 0.9], size: [0.3, 0.8], color: "#ffffff", alpha: 0.8 });
    });
    shark.root.visible = false;
  }
}
