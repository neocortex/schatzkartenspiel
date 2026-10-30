/**
 * The mole on stage: where he stands, whom he looks at, his wish beside him, his dive
 * into the ground, and the mushrooms Tadeo holds over his head and tosses to him. The
 * challenge decides when; this only makes it look right.
 */

import * as THREE from "three";
import { audio } from "../../audio/Audio";
import { MOLE_CELLS, cellPos } from "./layout";
import { goldenMushroom } from "./mechanisms";
import { CaveWorld } from "./world";

/** Size and height of the mushrooms above Tadeo: over his head they can be seen from the steep camera. */
const CARRY_SCALE = 0.72;
const CARRY_HEIGHT = 1.8;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const disposeModel = (model: THREE.Object3D) => model.traverse((o) => (o as THREE.Mesh).geometry?.dispose());

export class MoleActor {
  /** Whether he looks at the rock instead of at Tadeo. */
  atRock = false;
  private to: THREE.Vector3 | null = null;
  private sink = 0;
  private sinkTo = 0;
  private held = new THREE.Group();
  private flights: { mesh: THREE.Object3D; from: THREE.Vector3; t: number }[] = [];
  private mouth = new THREE.Vector3();

  /** `carrier` is the thing Tadeo's mushrooms hover over (it never leaves him). */
  constructor(
    private world: CaveWorld,
    carrier: THREE.Object3D,
  ) {
    carrier.add(this.held);
    this.place(0);
  }

  /** Stand him at the given rockfall. */
  place(stop: number): void {
    const [x, z] = cellPos(...MOLE_CELLS[stop]);
    this.world.mole.root.position.set(x, this.world.field.heightAt(x, z), z);
  }

  /** Send him waddling to a place. */
  walkTo(x: number, z: number): void {
    this.to = new THREE.Vector3(x, 0, z);
  }

  /** Show how many mushrooms Tadeo holds up. */
  showHeld(count: number): void {
    for (const m of this.held.children) disposeModel(m);
    this.held.clear();
    for (let i = 0; i < count; i++) {
      const m = goldenMushroom(CARRY_SCALE);
      m.position.x = (i - (count - 1) / 2) * 0.5;
      m.traverse((o) => (o.castShadow = false));
      this.held.add(m);
    }
  }

  /** The held mushrooms fly to him in an arc. */
  tossHeld(scene: THREE.Scene): void {
    this.held.updateWorldMatrix(true, true);
    [...this.held.children].forEach((m, i) => {
      scene.attach(m);
      this.flights.push({ mesh: m, from: m.position.clone(), t: -i * 0.28 });
    });
  }

  /** He dives into the ground and is already waiting at the next rockfall. */
  async dive(nextStop: number): Promise<void> {
    const mole = this.world.mole;
    this.sinkTo = 1;
    this.world.dust.emit(mole.root.position.clone().add(new THREE.Vector3(0, 0.2, 0)), { count: 14, color: "#8a7f96", speed: [0.3, 1.4], up: 0.8, life: [0.6, 1.2], size: [0.35, 0.7], grow: 2, drag: 2, flat: true });
    audio.playSfx("sfx_dig", 0.7);
    await wait(650);
    this.to = null;
    this.place(nextStop);
    mole.hungry = true;
    this.sink = 0;
    this.sinkTo = 0;
  }

  /** `rock` is the rockfall he works on, `wishing` whether his thought bubble may show. */
  update(dt: number, time: number, player: THREE.Vector3, rock: THREE.Vector3, wishing: boolean): void {
    const w = this.world;
    const root = w.mole.root;
    if (this.to) {
      const dx = this.to.x - root.position.x;
      const dz = this.to.z - root.position.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, dt * 3.4);
      if (d > 1e-3) {
        root.position.x += (dx / d) * step;
        root.position.z += (dz / d) * step;
      }
      if (d < 0.02) this.to = null;
    }
    this.sink += (this.sinkTo - this.sink) * (1 - Math.exp(-dt * 7));
    const ground = w.field.heightAt(root.position.x, root.position.z);
    const waddle = this.to ? Math.abs(Math.sin(time * 11)) * 0.12 : 0;
    root.position.y = ground + waddle - this.sink * 1.5;

    const target = this.atRock ? rock : player;
    const yaw = Math.atan2(target.x - root.position.x, target.z - root.position.z);
    let turn = yaw - root.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    root.rotation.y += turn * (1 - Math.exp(-dt * 8));

    const wish = w.wish.sprite;
    wish.visible = wishing && w.mole.hungry && this.sinkTo === 0;
    // Reason: beside him, not over him: from the steep camera a bubble over his head covers him and the rock behind
    wish.position.set(root.position.x + 1.65, root.position.y + 1.55 + Math.sin(time * 2.2) * 0.06, root.position.z);

    this.held.position.y = CARRY_HEIGHT + Math.sin(time * 3) * 0.04;
    this.updateFlights(dt);
  }

  private updateFlights(dt: number): void {
    const mouth = this.mouth.copy(this.world.mole.root.position).add(new THREE.Vector3(0, 0.9, 0.3));
    for (const f of [...this.flights]) {
      f.t = Math.min(1, f.t + dt / 0.65);
      const k = Math.max(0, f.t);
      f.mesh.position.lerpVectors(f.from, mouth, k).setY(THREE.MathUtils.lerp(f.from.y, mouth.y, k) + Math.sin(k * Math.PI) * 1.3);
      f.mesh.scale.setScalar(CARRY_SCALE * (1 - k * 0.55));
      if (f.t >= 1) {
        disposeModel(f.mesh);
        f.mesh.removeFromParent();
        this.flights.splice(this.flights.indexOf(f), 1);
      }
    }
  }
}
