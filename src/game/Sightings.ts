/**
 * Island cameos of the big story characters, so the adventure foreshadows
 * what is coming: the grumpy ogre guards the bridge until Tadeo has won the
 * ogre quest (then he sits by the river as a friend and waves), and the giant
 * shark's fin circles off the north pier until the sea crossing.
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
/** Deep water off the north pier where the fin circles. */
const SHARK_RING = { x: -44, z: -84, r: 6 };

const GUARD_LINES = ["GRRR! Das ist MEINE Brücke!", "Keiner kommt hier rüber! Grrr!"];
const FRIEND_LINES = ["Hallo Tadeo! Danke für die leckere Beere!", "Hmm, Beeren sind viel besser als Brücken bewachen!"];

export class Sightings {
  readonly group = new THREE.Group();
  private ogre: Ogre = createOgre();
  private ogreShadow = blobShadow(1.3);
  private shark: Shark = createShark();
  private bubble: Bubble;
  private collider: Circle | null = null;
  private friendly: boolean | null = null;
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

  /**
   * @param project world point → screen pixels (null when off screen), for the ogre's speech bubble
   */
  update(dt: number, player: THREE.Vector3, milestone: number, project: (v: THREE.Vector3) => { x: number; y: number } | null): void {
    this.updateOgre(dt, player, milestone > OGRE_QUEST);
    this.bubble.place(this.bubble.speaking ? project(this.ogre.headPos(this.head).setY(this.head.y + 1.2)) : null);
    this.updateShark(dt, milestone <= SEA_QUEST);
  }

  private updateOgre(dt: number, player: THREE.Vector3, friendly: boolean): void {
    if (friendly !== this.friendly) this.placeOgre(friendly);
    const o = this.ogre;
    const pos = o.root.position;
    const d = Math.hypot(player.x - pos.x, player.z - pos.z);
    this.cooldown -= dt;
    if (this.poseTimer > 0 && (this.poseTimer -= dt) <= 0) o.setPose(friendly ? "sit" : "idle", 3);
    if (d < (friendly ? 6 : 10) && this.cooldown <= 0) {
      // Reason: one reaction per approach — roar at a newcomer on the bridge, wave at a friend
      const lines = friendly ? FRIEND_LINES : GUARD_LINES;
      this.say(lines[this.lineIndex++ % lines.length]);
      o.setPose(friendly ? "wave" : "roar", friendly ? 5 : 9);
      if (!friendly) audio.playSfx("sfx_enemy_attack", 0.5);
      this.poseTimer = friendly ? 2.4 : 1.4;
      this.cooldown = 14;
    }
    o.talking = this.bubble.speaking;
    if (friendly && d < 9) {
      // Reason: the friendly ogre turns to look at Tadeo, like the villagers do
      const target = Math.atan2(player.x - pos.x, player.z - pos.z);
      const delta = Math.atan2(Math.sin(target - o.root.rotation.y), Math.cos(target - o.root.rotation.y));
      o.root.rotation.y += delta * Math.min(dt * 3, 1);
    }
    o.update(dt);
  }

  private placeOgre(friendly: boolean): void {
    this.friendly = friendly;
    const [x, z] = friendly ? FRIEND : GUARD;
    const o = this.ogre;
    o.root.position.set(x, this.height(x, z), z);
    // Reason: the guard faces west, towards Tadeo coming from the lake; the friend looks down the path
    o.root.rotation.y = friendly ? -0.85 : -Math.PI / 2;
    o.mood = friendly ? "happy" : "grumpy";
    o.snapPose(friendly ? "sit" : "idle");
    this.ogreShadow.position.set(x, o.root.position.y + 0.05, z);
    if (this.collider) this.colliders.remove(this.collider);
    this.collider = this.colliders.add(x, z, 1.3);
    this.cooldown = 0;
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
