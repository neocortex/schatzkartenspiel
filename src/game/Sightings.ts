/**
 * Island cameos of the big story characters, so the adventure foreshadows
 * what is coming: the grumpy ogre guards the bridge until Tadeo has won the
 * ogre quest (then he sits by the river as a friend and waves, and later sees
 * Tadeo off at the north dock), and the giant shark's fin circles off the north
 * pier until the sea crossing. A scene can borrow the ogre: he gets up, walks
 * where it says and goes back to his seat (`ogreLift`, `ogreRest`).
 */

import * as THREE from "three";
import { createOgre, Ogre } from "../challenges/ogre/Ogre";
import { createShark, Shark } from "../challenges/sea/Shark";
import { blobShadow } from "../characters/Humanoid";
import { Colliders, Circle } from "../world/Colliders";
import { LANDMARKS, P2 } from "../world/layout";
import { Bubble } from "../ui/Hud";
import { NarrationManager } from "../systems/NarrationManager";
import { audio } from "../audio/Audio";

/** Milestone of the ogre quest and the sea crossing. */
const OGRE_QUEST = 8;
const SEA_QUEST = 10;
/** Middle of the bridge deck, where the ogre blocks the way. */
const GUARD: P2 = LANDMARKS.bridge;
/** Open grass east of the mountain path, just past the bridge (in view when Tadeo comes back). */
const FRIEND: P2 = [57.5, -3];
const FRIEND_FACING = -0.85;
/** Metres a second when the ogre walks in a scene. */
const WALK_SPEED = 3.4;
/** On the shore beside the way onto the north pier, where he sees Tadeo off. */
const DOCK: P2 = [-18, -50];
/** Deep water off the north pier where the fin circles. */
const SHARK_RING = { x: -44, z: -84, r: 6 };

const GUARD_LINES = ["GRRR! Das ist MEINE Brücke!", "Keiner kommt hier rüber! Grrr!"];
const FRIEND_LINES = ["Hallo Tadeo! Danke für die leckere Beere!", "Hmm, Beeren sind viel besser als Brücken bewachen!"];

export type OgreSpot = "bridge" | "friend" | "dock";

export class Sightings {
  readonly group = new THREE.Group();
  readonly ogre: Ogre = createOgre();
  /** True while the ogre mouths the words of a dialogue he speaks in. */
  speaking = false;
  private ogreShadow = blobShadow(1.3);
  private shark: Shark = createShark();
  private bubble: Bubble;
  private collider: Circle | null = null;
  private spot: OgreSpot | null = null;
  /** The fight is won, though the quest is not over: he is already the friend he turns out to be. */
  private beaten = false;
  /** A scene is moving the ogre: he greets nobody. `place` does not look at this: it still moves him when the quest changes his spot. */
  private scripted = false;
  private walk: { to: P2; facing: number; done: () => void } | null = null;
  private poseTimer = 0;
  private cooldown = 0;
  private lineIndex = 0;
  private sharkAngle = 0;
  private head = new THREE.Vector3();

  constructor(
    private height: (x: number, z: number) => number,
    private colliders: Colliders,
    layer: HTMLElement,
  ) {
    this.bubble = new Bubble(layer);
    this.ogre.root.traverse((o) => (o.castShadow = true));
    this.group.add(this.ogre.root, this.ogreShadow, this.shark.root);
  }

  /** Where the ogre stands right now. */
  get ogreSpot(): OgreSpot {
    return this.spot ?? "bridge";
  }

  /** Stand the ogre where he belongs at this quest. Safe to call every frame. */
  place(milestone: number): void {
    // Reason: being beaten counts only until the quest moves on, or the story starts over
    if (milestone !== OGRE_QUEST) this.beaten = false;
    const spot = milestone >= SEA_QUEST ? "dock" : milestone > OGRE_QUEST || this.beaten ? "friend" : "bridge";
    if (spot !== this.spot) this.placeOgre(spot);
  }

  /** The fight is won: he is by the trail as the friend he turns out to be before the island is shown again. */
  befriend(): void {
    this.beaten = true;
    this.placeOgre("friend");
    // Reason: Tadeo is within his greeting's reach when the island fades in; the boulder scene is next, so no greeting
    this.cooldown = 14;
  }

  /** The ogre gets up, walks to `at` and stands there facing `facing`; the scene owns him until `ogreRest`. */
  ogreLift(at: P2, facing: number): Promise<void> {
    this.scripted = true;
    this.speaking = false;
    // Reason: a greeting still running would sit him down, or keep its bubble up, in the middle of the scene
    this.poseTimer = 0;
    this.bubble.say("", 0);
    this.ogre.setPose("idle", 5);
    return this.walkTo(at, facing);
  }

  /** The scene is over: he goes back to his place by the trail, waves at Tadeo and sits down. */
  async ogreRest(): Promise<void> {
    await this.walkTo(FRIEND, FRIEND_FACING);
    this.ogre.setPose("wave", 5);
    this.poseTimer = 2.4;
    // Reason: Tadeo is a few steps away; the ogre greets him only after this
    this.cooldown = 14;
    this.scripted = false;
  }

  /**
   * @param project world point → screen pixels (null when off screen), for the ogre's speech bubble
   */
  update(dt: number, player: THREE.Vector3, milestone: number, project: (v: THREE.Vector3) => { x: number; y: number } | null): void {
    this.place(milestone);
    this.updateOgre(dt, player, this.spot !== "bridge");
    this.bubble.place(this.bubble.speaking ? project(this.ogre.headPos(this.head).setY(this.head.y + 1.2)) : null);
    this.updateShark(dt, milestone <= SEA_QUEST);
  }

  private updateOgre(dt: number, player: THREE.Vector3, friendly: boolean): void {
    const o = this.ogre;
    const pos = o.root.position;
    const d = Math.hypot(player.x - pos.x, player.z - pos.z);
    this.cooldown -= dt;
    if (this.poseTimer > 0 && (this.poseTimer -= dt) <= 0) o.setPose(friendly ? "sit" : "idle", 3);
    if (this.scripted) {
      this.stepWalk(dt);
      o.talking = this.speaking;
      o.update(dt);
      return;
    }
    if (d < (friendly ? 6 : 10) && this.cooldown <= 0) {
      // Reason: one reaction per approach — roar at a newcomer on the bridge, wave at a friend
      const lines = friendly ? FRIEND_LINES : GUARD_LINES;
      this.say(lines[this.lineIndex++ % lines.length]);
      o.setPose(friendly ? "wave" : "roar", friendly ? 5 : 9);
      if (!friendly) audio.playSfx("sfx_enemy_attack", 0.5);
      this.poseTimer = friendly ? 2.4 : 1.4;
      this.cooldown = 14;
    }
    o.talking = this.bubble.speaking || this.speaking;
    if (friendly && d < 9) {
      // Reason: the friendly ogre turns to look at Tadeo, like the villagers do
      const target = Math.atan2(player.x - pos.x, player.z - pos.z);
      const delta = Math.atan2(Math.sin(target - o.root.rotation.y), Math.cos(target - o.root.rotation.y));
      o.root.rotation.y += delta * Math.min(dt * 3, 1);
    }
    o.update(dt);
  }

  private placeOgre(spot: OgreSpot): void {
    this.spot = spot;
    const friendly = spot !== "bridge";
    const [x, z] = spot === "dock" ? DOCK : friendly ? FRIEND : GUARD;
    const o = this.ogre;
    o.root.position.set(x, this.height(x, z), z);
    // Reason: the guard faces west, towards Tadeo coming from the lake; the friend looks down the path, and at the dock towards the way in
    o.root.rotation.y = spot === "dock" ? -0.6 : friendly ? FRIEND_FACING : -Math.PI / 2;
    o.mood = friendly ? "happy" : "grumpy";
    o.snapPose(friendly ? "sit" : "idle");
    this.ogreShadow.position.set(x, o.root.position.y + 0.05, z);
    if (this.collider) this.colliders.remove(this.collider);
    this.collider = this.colliders.add(x, z, 1.3);
    this.cooldown = 0;
  }

  /** Walk the ogre over the ground to `to` in a straight line and turn him to `facing` when he gets there. */
  private walkTo(to: P2, facing: number): Promise<void> {
    return new Promise((done) => (this.walk = { to, facing, done }));
  }

  private stepWalk(dt: number): void {
    const w = this.walk;
    const o = this.ogre;
    const pos = o.root.position;
    const turn = (target: number, speed: number) => {
      const delta = Math.atan2(Math.sin(target - o.root.rotation.y), Math.cos(target - o.root.rotation.y));
      o.root.rotation.y += delta * Math.min(dt * speed, 1);
      return Math.abs(delta);
    };
    if (!w) {
      o.walk = 0;
      return;
    }
    const dx = w.to[0] - pos.x;
    const dz = w.to[1] - pos.z;
    const left = Math.hypot(dx, dz);
    if (left > 0.05) {
      // Reason: he turns to where he is going first, so he never moonwalks
      const off = turn(Math.atan2(dx, dz), 6);
      const step = Math.min(WALK_SPEED * dt * (off < 0.6 ? 1 : 0.2), left);
      o.walk = 1;
      pos.x += (dx / left) * step;
      pos.z += (dz / left) * step;
      pos.y = this.height(pos.x, pos.z);
      this.ogreShadow.position.set(pos.x, pos.y + 0.05, pos.z);
      return;
    }
    o.walk = 0;
    if (turn(w.facing, 6) > 0.05) return;
    this.walk = null;
    w.done();
  }

  private say(text: string): void {
    this.bubble.say(text, 3600);
    NarrationManager.getInstance().speakLine(text, "Oger");
  }

  private updateShark(dt: number, visible: boolean): void {
    this.shark.root.visible = visible;
    if (!visible) return;
    this.sharkAngle += dt * 0.32;
    const a = this.sharkAngle;
    const s = this.shark.root;
    // Reason: swim mostly under water so only the dorsal fin cuts the surface
    s.position.set(SHARK_RING.x + Math.cos(a) * SHARK_RING.r, -1.45 + Math.sin(a * 3) * 0.08, SHARK_RING.z + Math.sin(a) * SHARK_RING.r);
    // Reason: the model faces +z; the tangent of the circle is (-sin a, cos a)
    s.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
    this.shark.update(dt);
  }
}
