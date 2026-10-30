/**
 * Where the camera stands. In the tunnels it follows Tadeo from above. In the painted
 * hall and behind its door it stands like in a theatre: the stage stays in view, so the
 * pictures are never out of sight while Tadeo solves the test, and from over the rock
 * face one looks down into the chamber. Scenes aim it at a shot and it glides there.
 */

import * as THREE from "three";
import { CameraRig, Shot } from "../../core/CameraRig";
import { Engine, PostSettings } from "../../core/Engine";
import { ROOMS, SWORD_CELL, cellPos, inRoom } from "./layout";
import { CaveWorld } from "./world";

const lerp = THREE.MathUtils.lerp;

/** The hall's rock face. */
const FACE_Z = cellPos(8, 4.5)[1];
/** Once Tadeo is this far into the door the camera moves over the rock face to meet him on the other side. */
const THROUGH_DOOR_Z = FACE_Z - 1.2;

const [SX, SZ] = cellPos(...SWORD_CELL);

/** Looks down over the top of the rock face, so the way from the door to the great crystal is one picture. */
const CHAMBER_SHOT: Shot = { pos: new THREE.Vector3(SX, 12.6, SZ + 9.4), look: new THREE.Vector3(SX, 1.6, SZ + 2.6) };

/** Slides along with Tadeo: just a little under the pictures so all three stay on screen, more towards the far ends of the hall. */
function truck(x: number): number {
  return Math.sign(x) * (Math.abs(x) * 0.3 + Math.max(Math.abs(x) - 8.5, 0) * 0.9);
}

/** The whole hall from its south side: closer and lower when Tadeo stands under the pictures, higher and further back when he is near the camera. */
function hallShot(p: THREE.Vector3): Shot {
  const t = THREE.MathUtils.clamp((p.z - FACE_Z) / 8, 0, 1);
  const x = truck(p.x);
  return {
    pos: new THREE.Vector3(x, lerp(7.8, 10.5, t), FACE_Z + lerp(12.3, 16, t)),
    look: new THREE.Vector3(x, lerp(2.5, 1.8, t), FACE_Z + lerp(1.5, 4.5, t)),
  };
}

export class CaveView {
  private aimed: Shot | null = null;
  private steering = false;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private fogDepth = 0;
  private staged = false;

  constructor(
    private rig: CameraRig,
    private world: CaveWorld,
    private engine: Engine,
    private post: Partial<PostSettings>,
  ) {}

  /** Glide to a shot for a scene; null hands the camera back. */
  aim(shot: Shot | null): void {
    this.aimed = shot;
  }

  update(dt: number, p: THREE.Vector3, phase: string): void {
    const beyond = (phase === "chamber" || phase === "done") && p.z < THROUGH_DOOR_Z;
    // Reason: the niche between the rock face and the crystal wall counts as hall, north of the room's own rectangle
    const inHall = (phase === "test" || phase === "chamber") && !beyond && (inRoom(p.x, p.z, ROOMS.hall) || p.z < FACE_Z);
    const want = this.aimed ?? (beyond ? CHAMBER_SHOT : inHall ? hallShot(p) : null);
    if (want) {
      if (!this.steering) {
        this.pos.copy(this.rig.camera.position);
        this.look.copy(this.rig.focus);
        this.steering = true;
      }
      const k = 1 - Math.exp(-dt * 2.8);
      this.pos.lerp(want.pos, k);
      this.look.lerp(want.look, k);
      this.rig.jumpToShot({ pos: this.pos, look: this.look });
    } else if (this.steering) {
      this.steering = false;
      this.rig.setShot(null, 1.2);
    }

    const staged = inHall || beyond;
    this.fogDepth += ((staged ? 1 : 0) - this.fogDepth) * (1 - Math.exp(-dt * 1.8));
    this.world.setFogDepth(this.fogDepth);
    if (staged !== this.staged) {
      this.staged = staged;
      // Reason: tilt-shift blurs the top and bottom of the screen, and on this stage the pictures and Tadeo sit exactly there
      this.engine.applyPost({ ...this.post, tiltShift: !staged });
    }
  }
}
