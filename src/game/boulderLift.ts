/**
 * BoulderLift — quest 8's payoff on the island. The ogre has become Tadeo's friend; he gets up, goes to the boulder that
 * shuts the mountain trail, says he can lift it with one hand, and does: the giant rises, is held overhead and flies
 * into the river with a splash and a shake while Tadeo and Chuleta look on. The scene needs no key once it starts; it is
 * driven by the game's frame time, like the boulder's own exit, and gives the camera back to the follow rig when it ends.
 */

import * as THREE from "three";
import { CameraRig, Shot } from "../core/CameraRig";
import { Player } from "../characters/Player";
import { Bursts } from "../challenges/shared/bursts";
import { DIALOGUES, DialogueScript } from "../data/dialogues";
import { puffTexture } from "../world/ambient/textures";
import { BOULDER_EXIT, BOULDER_LIFTER, BOULDER_SPLASH, StoryProp } from "../world/models/storyProps";
import { Sightings } from "./Sightings";
import { audio } from "../audio/Audio";

/** What the scene is doing, for the E2E to look at. */
export type LiftPhase = "idle" | "walk" | "talk" | "heave" | "airborne" | "landed" | "cheer" | "rest";

/**
 * The camera hangs over the river south-west of the ogre, above the bridge: the waterfall, the river, the boulder and the
 * ogre are all in view, and Tadeo stands beside the ogre instead of in front of him.
 */
const CAMERA_FROM = new THREE.Vector3(-20, 9, 12);
/** From the ogre's feet to the point the camera looks at: above the ground between him, the boulder and the river. */
const LOOK_AT = new THREE.Vector3(-2.5, 0.6, -3);
/** Seconds the ogre's arm needs to be overhead before the giant leaves the ground. */
const ARM_UP = 0.6;
const DUST = "#cdb892";
const WATER = "#eaf9ff";

interface BoulderLiftDeps {
  scene: THREE.Scene;
  rig: CameraRig;
  player: Player;
  sightings: Sightings;
  /** The boulder on the trail, and the way to take it away (colliders go with it). */
  boulder: { prop: StoryProp; remove(): Promise<void> };
  ground: (x: number, z: number) => number;
  talk: (script: DialogueScript) => Promise<void>;
}

export class BoulderLift {
  phase: LiftPhase = "idle";
  private timers: { left: number; fire: () => void }[] = [];
  private frame: ((dt: number) => void) | null = null;
  private bursts: Bursts | null = null;

  constructor(private d: BoulderLiftDeps) {}

  /** Advance the scene; call it every frame. */
  update(dt: number): void {
    for (const t of [...this.timers]) {
      t.left -= dt;
      if (t.left > 0) continue;
      this.timers.splice(this.timers.indexOf(t), 1);
      t.fire();
    }
    this.frame?.(dt);
    this.bursts?.update(dt);
  }

  /** The ogre goes to the boulder, lifts it away and goes back to his place. */
  async play(): Promise<void> {
    const { scene, rig, player, sightings, boulder, talk } = this.d;
    const ogre = sightings.ogre;
    const stand = boulder.prop.group.localToWorld(new THREE.Vector3(BOULDER_LIFTER[0], 0, BOULDER_LIFTER[1]));
    const view = this.view(stand);
    const home = stand.clone().add(LOOK_AT);
    const bursts = new Bursts(puffTexture(), false);
    this.bursts = bursts;
    scene.add(bursts.mesh);
    const clubWasVisible = ogre.club.visible;
    // Reason: the club would stick out of his fist and into the boulder; he leaves it for the lift
    ogre.club.visible = false;

    this.phase = "walk";
    rig.setShot(view(home), 1.4);
    this.frame = (dt) => this.watch(boulder.prop.group.position, dt);
    try {
      // Facing north, towards the boulder: his left arm goes up on the east side, the club arm stays out of it
      await sightings.ogreLift([stand.x, stand.z], Math.PI);
      this.phase = "talk";
      await talk(DIALOGUES.ogre_boulder);

      this.phase = "heave";
      this.stomp(ogre.root.position);
      ogre.setPose("lift", 5);
      await this.wait(ARM_UP);
      await this.lift(view, home);

      this.phase = "cheer";
      ogre.setPose("windup", 6);
      player.avatar.pose = "cheer";
      await this.wait(0.4);
      await talk(DIALOGUES.ogre_boulder_done);

      this.phase = "rest";
      player.avatar.pose = "normal";
      ogre.club.visible = clubWasVisible;
      rig.setShot(null, 1.4);
      this.frame = (dt) => this.watch(ogre.root.position, dt);
      await sightings.ogreRest();
    } finally {
      this.phase = "idle";
      this.frame = null;
      rig.setShot(null, 1);
      player.avatar.pose = "normal";
      ogre.club.visible = clubWasVisible;
      scene.remove(bursts.mesh);
      bursts.dispose();
      this.bursts = null;
      this.timers = [];
    }
  }

  // ── The lift ──────────────────────────────────────────────

  /** The giant's exit with everything that goes with it: dust, the strain, the throw, the splash. */
  private async lift(view: (look: THREE.Vector3) => Shot, home: THREE.Vector3): Promise<void> {
    const { rig, player, sightings, boulder } = this.d;
    const ogre = sightings.ogre;
    const group = boulder.prop.group;
    const giant = group.children[0];
    const splash = group.localToWorld(new THREE.Vector3(BOULDER_SPLASH[0], 0, BOULDER_SPLASH[1])).setY(0);
    const world = home.clone();
    const rock = new THREE.Vector3();
    let t = 0;
    const gone = boulder.remove();

    this.frame = (dt) => {
      t += dt;
      this.watch(group.position, dt);
      // The ogre has done it: he turns round to Tadeo, arms up
      if (t > BOULDER_EXIT.landAt + 0.3) ogre.root.rotation.y = this.turned(ogre.root.rotation.y, this.heading(ogre.root.position, player.position), dt, 5);
      // Reason: the camera stays where it is and only turns, to the giant while it flies and to the splash once it has landed
      const target = new THREE.Vector3();
      if (t < BOULDER_EXIT.throwAt) target.copy(home).y += 4.2 * Math.min(t / BOULDER_EXIT.held, 1);
      // Reason: the ogre stays in the picture while the giant flies, so the throw is seen as his
      else if (t < BOULDER_EXIT.landAt) target.copy(giant.getWorldPosition(rock)).lerp(home, 0.35);
      else target.copy(splash).lerp(home, 0.3).y += 1.5;
      world.lerp(target, 1 - Math.exp(-dt * 4));
      rig.jumpToShot(view(world));
    };

    // Dust leaps up from where the giant sat
    this.after(0.05, () => {
      audio.playSfx("sfx_lava_fall", 0.7, 0.8);
      rig.addShake(0.35);
      this.dust(group.position.clone().setY(group.position.y + 0.4), 3.4, 46);
    });
    // The strain: the giant hangs overhead and the ground shudders
    this.after(BOULDER_EXIT.held, () => {
      audio.playSfx("sfx_door", 0.5, 0.5);
      rig.addShake(0.25);
    });
    this.after(BOULDER_EXIT.throwAt, () => {
      this.phase = "airborne";
      ogre.setPose("fling", 12);
      audio.playSfx("sfx_enemy_attack", 0.6, 1.5);
    });
    this.after(BOULDER_EXIT.landAt, () => {
      this.phase = "landed";
      this.splash(splash);
      rig.addShake(1);
      audio.playSfx("sfx_hammer_hit", 1, 0.55);
      audio.playSfx("sfx_wave", 1, 0.8);
    });
    await gone;
  }

  /** The ogre plants his feet to lift. */
  private stomp(at: THREE.Vector3): void {
    audio.playSfx("sfx_hammer_hit", 0.5, 0.9);
    this.d.rig.addShake(0.2);
    this.dust(at.clone().setY(at.y + 0.2), 1.3, 18);
  }

  /** A ring of dust rolling out over the ground. */
  private dust(at: THREE.Vector3, radius: number, count: number): void {
    this.bursts?.emit(at, { count, color: DUST, speed: [radius * 0.5, radius * 1.4], up: 0.6, life: [0.9, 1.7], size: [0.9, 1.6], grow: 2.4, gravity: -0.4, drag: 2, spread: radius, flat: true });
  }

  /** A great column of water, a ring of foam on the river, drops raining back down and chips of stone. */
  private splash(at: THREE.Vector3): void {
    const b = this.bursts;
    if (!b) return;
    const surface = at.clone().setY(at.y + 0.2);
    b.emit(surface, { count: 70, color: WATER, speed: [1, 4], up: 8, life: [0.9, 1.7], size: [1.4, 3], grow: 1.8, gravity: 8, drag: 0.8, spread: 2 });
    b.emit(surface, { count: 50, color: WATER, speed: [3, 8], life: [1, 1.8], size: [1.4, 3], grow: 2.4, gravity: 0, drag: 2, spread: 1.5, flat: true });
    b.emit(surface, { count: 110, color: "#bfeaff", speed: [2, 8], up: 7, life: [0.9, 1.6], size: [0.25, 0.5], grow: 0.6, gravity: 16, drag: 0.4, spread: 2.4 });
    b.emit(surface, { count: 18, color: "#6f675c", speed: [3, 7], up: 6, life: [0.8, 1.3], size: [0.4, 0.8], grow: 0.5, gravity: 18, drag: 0.3, spread: 1.5 });
  }

  // ── Time and camera ───────────────────────────────────────

  private after(seconds: number, fire: () => void): void {
    this.timers.push({ left: seconds, fire });
  }

  private wait(seconds: number): Promise<void> {
    return new Promise((done) => this.after(seconds, done));
  }

  /** Tadeo turns to look at `at`. */
  private watch(at: THREE.Vector3, dt: number): void {
    const { player } = this.d;
    player.facing = this.turned(player.facing, this.heading(player.position, at), dt, 6);
  }

  /** The yaw that looks from one point to another. */
  private heading(from: THREE.Vector3, to: THREE.Vector3): number {
    return Math.atan2(to.x - from.x, to.z - from.z);
  }

  /** `yaw` turned a step towards `target` the short way round. */
  private turned(yaw: number, target: number, dt: number, rate: number): number {
    const delta = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
    return yaw + delta * Math.min(dt * rate, 1);
  }

  /** Shots from south-west of the ogre at `stand`: the camera stays where it is and looks at the world point it is given. */
  private view(stand: THREE.Vector3): (look: THREE.Vector3) => Shot {
    const { ground } = this.d;
    const pos = stand.clone().add(CAMERA_FROM);
    pos.y = Math.max(pos.y, ground(pos.x, pos.z) + 2.5);
    return (look) => ({ pos, look });
  }
}
