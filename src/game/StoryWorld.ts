/**
 * StoryWorld — the island follows the story. For the current quest it says what
 * stands where: Tadeo's wreck or his mended boat, the thorn hedge at the forest
 * gate, the boulder on the mountain trail, Captain Paco and the ogre. Every
 * finished quest makes the volcano rumble a little harder. `beforeQuest` and
 * `afterQuest` are the moments when something happens on the island around a challenge:
 * the sword opens the hedge, the elder sends Tadeo on, the ogre lifts the boulder.
 */

import * as THREE from "three";
import { CameraRig } from "../core/CameraRig";
import { Circle, Colliders } from "../world/Colliders";
import { Island } from "../world/Island";
import { LANDMARKS, P2, SPOTS } from "../world/layout";
import { Site } from "../world/models/site";
import { faceDir } from "../world/models/shapes";
import { HedgeProp, StoryProp, mountainBoulder, standProp, thornHedge } from "../world/models/storyProps";
import { Player } from "../characters/Player";
import { DialogueScript } from "../data/dialogues";
import { BoulderLift, LiftPhase } from "./boulderLift";
import { HedgeOpening } from "./hedgeOpening";
import { Npc, Npcs, NpcId } from "./Npcs";
import { OgreSpot, Sightings } from "./Sightings";
import { audio } from "../audio/Audio";

/** Paco comes home to the village at this quest. */
const VILLAGE_QUEST = 3;
/** The sword opens the hedge right before this quest's challenge. */
const FOREST_QUEST = 6;
/** The hedge has gone once the forest quest is won, the boulder once the mountain trail opens. */
const FOREST_OPEN_QUEST = 7;
/** The village quest ends with the elder sending Tadeo to the ogre; the ogre lifts the boulder at the end of his own. */
const VILLAGE_TRIALS_QUEST = 7;
const OGRE_QUEST = 8;
const TRAIL_OPEN_QUEST = 9;
const SEA_QUEST = 10;
const QUEST_COUNT = 12;

const PACO: NpcId = "villager3";
/** On the head of the north pier, with his back to the boat. */
const PACO_DOCK: P2 = [-36.36, -73.58];
const PACO_DOCK_FACING = Math.PI;
/** Tadeo stands on the lake's side of the arch: the hedge stands just behind it, so the beacon on the gate stays free. */
const HEDGE_BEHIND_GATE = 0.9;

export interface StoryWorldState {
  wreck: boolean;
  pierBoat: boolean;
  dockBoat: boolean;
  boulder: boolean;
  hedge: boolean;
  paco: "away" | "village" | "dock";
  ogre: OgreSpot;
  lift: LiftPhase;
  lastRumble: number;
}

/** A story prop standing on the island with the colliders under it. */
class Barrier<P extends StoryProp = StoryProp> {
  /** The colliders' places in the world. */
  readonly circles: Circle[];
  private standing: Circle[] = [];

  constructor(readonly prop: P, private colliders: Colliders, x: number, z: number, rotY: number, ground: (x: number, z: number) => number) {
    standProp(prop, x, z, rotY, ground);
    this.circles = prop.blockers.map((b) => {
      const [wx, wz] = Site.local(x, z, rotY, b.x, b.z);
      return { x: wx, z: wz, r: b.r };
    });
    this.set(true);
  }

  get up(): boolean {
    return this.standing.length > 0;
  }

  set(on: boolean): void {
    this.prop.group.visible = on;
    if (on === this.up) return;
    if (on) this.standing = this.circles.map((c) => this.colliders.add(c.x, c.z, c.r));
    else {
      this.standing.forEach((c) => this.colliders.remove(c));
      this.standing = [];
    }
  }

  /** Play the exit; the way is open only when it has finished. */
  async remove(): Promise<void> {
    await this.prop.remove();
    this.set(false);
  }
}

export class StoryWorld {
  readonly group = new THREE.Group();
  readonly boulder: Barrier;
  readonly hedge: Barrier<HedgeProp>;
  private hedgeOpening: HedgeOpening;
  private boulderLift: BoulderLift;
  private pacoHome: { at: P2; facing: number };
  private lastRumble = 0;

  constructor(
    private island: Island,
    private rig: CameraRig,
    player: Player,
    private npcs: Npcs,
    private sightings: Sightings,
    private talk: (script: string | DialogueScript, npc?: Npc) => Promise<void>,
  ) {
    const { hf, colliders, landmarks } = island;
    const ground = (x: number, z: number) => hf.heightAt(x, z);
    this.boulder = new Barrier(mountainBoulder(), colliders, SPOTS.trailBoulder[0], SPOTS.trailBoulder[1], 0, ground);
    const [gx, gz] = LANDMARKS.forestGate;
    const rot = faceDir(LANDMARKS.forest[0] - gx, LANDMARKS.forest[1] - gz);
    const [hx, hz] = Site.local(gx, gz, rot, 0, HEDGE_BEHIND_GATE);
    this.hedge = new Barrier(thornHedge(), colliders, hx, hz, rot, ground);
    this.group.add(this.boulder.prop.group, this.hedge.prop.group);
    this.hedgeOpening = new HedgeOpening({ scene: island.scene, rig, player, hedge: this.hedge, ground });
    this.boulderLift = new BoulderLift({ scene: island.scene, rig, player, sightings, boulder: this.boulder, ground, talk });
    // Reason: all rocks, thorns and the wreck are up while Game places the coins, so no coin lands inside them; `apply` then sets the real state
    landmarks.setBoatVisible("wreck", true);
    const paco = npcs.get(PACO);
    this.pacoHome = { at: [paco.position.x, paco.position.z], facing: paco.homeFacing };
  }

  /** Make the island match this quest. Safe to call any number of times. */
  apply(m: number): void {
    const { landmarks } = this.island;
    landmarks.setBoatVisible("wreck", m < SEA_QUEST);
    landmarks.setBoatVisible("north", m >= SEA_QUEST);
    this.hedge.set(m < FOREST_OPEN_QUEST);
    this.boulder.set(m < TRAIL_OPEN_QUEST);
    if (m < VILLAGE_QUEST) this.npcs.setSpot(PACO, null);
    else if (m < SEA_QUEST) this.npcs.setSpot(PACO, this.pacoHome.at, this.pacoHome.facing);
    else this.npcs.setSpot(PACO, PACO_DOCK, PACO_DOCK_FACING);
    this.sightings.place(m);
  }

  /** The volcano feels a quest being won: the ground shakes and smoke goes up, nothing else stops. */
  rumble(finished: number): void {
    const strength = THREE.MathUtils.clamp(finished / QUEST_COUNT, 0, 1);
    this.lastRumble = strength;
    this.rig.addShake(0.2 + 0.5 * strength);
    this.island.ambient.volcano.burst(strength);
    // Reason: the door's creak is the deepest sound there is; slowed down it becomes a groan from under the ground
    audio.playSfx("sfx_door", 0.5 + 0.5 * strength, 0.5);
  }

  /** A challenge has just been won and the island is not on screen yet: what the island shows already follows from it. */
  won(m: number): void {
    // Reason: the ogre is no longer the guard the story still says he is, so he must not roar at Tadeo when the island fades in
    if (m === OGRE_QUEST) this.sightings.befriend();
  }

  /** What happens on the island right before a quest's challenge. */
  async beforeQuest(m: number): Promise<void> {
    switch (m) {
      case FOREST_QUEST:
        // Reason: a reload in the forest brings the hedge back, so the sword opens it again
        if (this.hedge.up) await this.hedgeOpening.play();
        return;
      default:
        return;
    }
  }

  /** What happens on the island right after a quest's challenge. */
  async afterQuest(m: number): Promise<void> {
    switch (m) {
      case VILLAGE_TRIALS_QUEST:
        await this.talk("village_after", this.npcs.get("elder"));
        return;
      case OGRE_QUEST:
        // Reason: a reload after the fight brings the boulder back, and the ogre lifts it again after the next fight
        if (this.boulder.up) await this.boulderLift.play();
        return;
      default:
        return;
    }
  }

  update(dt: number, _time: number): void {
    this.boulder.prop.update(dt);
    this.hedge.prop.update(dt);
    this.hedgeOpening.update(dt);
    this.boulderLift.update(dt);
  }

  /** What really stands on the island, read from the scene. */
  get e2e(): StoryWorldState {
    const { landmarks } = this.island;
    const paco = this.npcs.get(PACO);
    const atDock = Math.hypot(paco.position.x - PACO_DOCK[0], paco.position.z - PACO_DOCK[1]) < 1;
    return {
      wreck: landmarks.isBoatVisible("wreck"),
      pierBoat: landmarks.isBoatVisible("spawn"),
      dockBoat: landmarks.isBoatVisible("north"),
      boulder: this.boulder.up,
      hedge: this.hedge.up,
      paco: !paco.avatar.root.visible ? "away" : atDock ? "dock" : "village",
      ogre: this.sightings.ogreSpot,
      lift: this.boulderLift.phase,
      lastRumble: this.lastRumble,
    };
  }
}
