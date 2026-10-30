/**
 * IslandScene — the overworld. Tadeo explores the island, talks to people and
 * walks into quest zones that launch the challenge scenes.
 */

import * as THREE from "three";
import { Engine, GameScene } from "../core/Engine";
import { CameraRig } from "../core/CameraRig";
import { Island } from "../world/Island";
import { Player, WalkableWorld } from "../characters/Player";
import { LANDMARKS } from "../world/layout";
import { xrayUniforms } from "../world/xray";

export class IslandScene implements GameScene {
  readonly scene: THREE.Scene;
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.3, 2500);
  readonly island: Island;
  readonly player: Player;
  readonly rig: CameraRig;
  private engine!: Engine;
  private debugCam: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  /** `?closeup` frames Tadeo up close (for character work). */
  private closeup = new URLSearchParams(location.search).has("closeup");

  constructor() {
    this.island = new Island();
    this.scene = this.island.scene;
    this.debugCam = parseDebugCamera();

    const hf = this.island.hf;
    // Reason: bridge decks and piers are walk surfaces above the terrain
    const surfaces = this.island.landmarks;
    const world: WalkableWorld = {
      groundHeight: (x, z) => surfaces.surfaceHeight(x, z) ?? hf.heightAt(x, z),
      canStand: (x, z) => surfaces.surfaceHeight(x, z) != null || hf.isWalkable(x, z),
      colliders: this.island.colliders,
    };
    this.player = new Player(world);
    this.player.addTo(this.scene);
    const spawn = parseSpawn() ?? LANDMARKS.spawn;
    this.player.teleport(spawn[0], spawn[1], 0);

    this.rig = new CameraRig(this.camera, (x, z) => hf.heightAt(x, z));
    this.rig.follow(this.player.position, this.player.velocity);
    this.rig.snap();
  }

  enter(engine: Engine): void {
    this.engine = engine;
    this.update(0, 0);
  }

  update(dt: number, time: number): void {
    const input = this.engine?.input;
    if (input) {
      // Reason: while a cutscene owns the controls the press stays readable, so a card shown over the island can see it
      if (this.player.controlsEnabled && input.consume("Space")) this.player.jump();
      this.player.update(dt, input, this.rig.yaw);
    }
    this.island.update(dt, time);

    if (this.closeup) {
      const p = this.player.position;
      this.debugCam = {
        pos: new THREE.Vector3(p.x + 1.4, p.y + 1.5, p.z + 3.1),
        look: new THREE.Vector3(p.x, p.y + 0.85, p.z),
      };
    }
    if (this.debugCam) {
      this.camera.position.copy(this.debugCam.pos);
      this.camera.lookAt(this.debugCam.look);
      this.island.setFocus(this.debugCam.look, this.player.position);
      return;
    }
    this.rig.follow(this.player.position, this.player.velocity);
    this.rig.update(dt);
    xrayUniforms.uXrayTarget.value.copy(this.player.position).add(new THREE.Vector3(0, 0.9, 0));
    this.island.setFocus(this.rig.focus, this.player.position);
  }
}

/** `?cam=px,py,pz,lx,ly,lz` pins the camera for screenshots while developing. */
function parseDebugCamera(): { pos: THREE.Vector3; look: THREE.Vector3 } | null {
  const v = parseNumbers("cam", 6);
  return v ? { pos: new THREE.Vector3(v[0], v[1], v[2]), look: new THREE.Vector3(v[3], v[4], v[5]) } : null;
}

/** `?spawn=x,z` starts the player somewhere else while developing. */
function parseSpawn(): [number, number] | null {
  const v = parseNumbers("spawn", 2);
  return v ? [v[0], v[1]] : null;
}

function parseNumbers(key: string, count: number): number[] | null {
  const raw = new URLSearchParams(location.search).get(key);
  if (!raw) return null;
  const v = raw.split(",").map(Number);
  return v.length === count && !v.some(Number.isNaN) ? v : null;
}
