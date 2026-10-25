/**
 * Gold coins hidden around the island: most lie along the paths, some in
 * secret corners. They spin and glint; Tadeo picks them up by walking through
 * them (sparkle burst + jingle). Which coins are taken is remembered.
 */

import * as THREE from "three";
import { Heightfield } from "../world/Heightfield";
import { Colliders } from "../world/Colliders";
import { PATHS, LANDMARKS, P2 } from "../world/layout";
import { mulberry32 } from "../core/noise";
import { audio } from "../audio/Audio";

export const COIN_COUNT = 30;
const STORAGE_KEY = "schatzkarten_coins";
const PICK_RADIUS = 1.1;
const SPARKS = 48;

/** Quest gates stay coin-free so a coin never sits on a challenge trigger. */
const KEEP_CLEAR: P2[] = [
  LANDMARKS.volcanoGate, LANDMARKS.caveMouth, LANDMARKS.forestGate, LANDMARKS.mountainGate,
  LANDMARKS.northDockEnd, LANDMARKS.bridge, ...LANDMARKS.tablets,
];

export class Coins {
  readonly group = new THREE.Group();
  private spots: THREE.Vector3[] = [];
  private taken = new Set<number>();
  private body: THREE.InstancedMesh;
  private star: THREE.InstancedMesh;
  private sparks: THREE.InstancedMesh;
  private sparkState: { pos: THREE.Vector3; vel: THREE.Vector3; life: number }[] = [];
  private nextSpark = 0;
  private dummy = new THREE.Object3D();

  constructor(private hf: Heightfield, private colliders: Colliders) {
    this.placeCoins();

    const gold = new THREE.MeshStandardMaterial({
      color: "#ffc533",
      metalness: 0.55,
      roughness: 0.28,
      emissive: "#ffa000",
      emissiveIntensity: 0.45,
    });
    const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.1, 28);
    coinGeo.rotateX(Math.PI / 2);
    this.body = new THREE.InstancedMesh(coinGeo, gold, COIN_COUNT);
    this.body.castShadow = true;

    // A raised star on both faces
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 === 0 ? 0.2 : 0.09;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
    starGeo.translate(0, 0, -0.08);
    this.star = new THREE.InstancedMesh(
      starGeo,
      new THREE.MeshStandardMaterial({ color: "#fff1a8", metalness: 0.4, roughness: 0.25, emissive: "#ffcc33", emissiveIntensity: 0.9 }),
      COIN_COUNT,
    );

    this.sparks = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.07),
      new THREE.MeshBasicMaterial({ color: "#fff3b0", toneMapped: false }),
      SPARKS,
    );
    for (let i = 0; i < SPARKS; i++) this.sparkState.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 });
    // Reason: instances span the whole island; bounds computed from the first frame would cull them wrongly
    for (const m of [this.body, this.star, this.sparks]) m.frustumCulled = false;
    this.group.add(this.body, this.star, this.sparks);
    this.load();
  }

  get collected(): number {
    return this.taken.size;
  }

  /** Forget all collected coins (new game). */
  reset(): void {
    this.taken.clear();
    this.save();
  }

  /** Mark the first `n` coins as collected (debug starts with `?coins=n`). */
  setCollected(n: number): void {
    this.taken = new Set([...Array(Math.min(n, this.spots.length)).keys()]);
    this.save();
  }

  /** Spin the coins, pick up the ones Tadeo touches. Returns how many were picked this frame. */
  update(dt: number, time: number, player: THREE.Vector3): number {
    let picked = 0;
    this.spots.forEach((p, i) => {
      if (this.taken.has(i)) {
        this.dummy.scale.setScalar(0);
      } else {
        if (Math.hypot(p.x - player.x, p.z - player.z) < PICK_RADIUS && Math.abs(p.y - player.y) < 2.2) {
          this.taken.add(i);
          picked++;
          this.burst(p);
        }
        this.dummy.scale.setScalar(1);
      }
      this.dummy.position.set(p.x, p.y + 0.75 + Math.sin(time * 2 + i) * 0.12, p.z);
      this.dummy.rotation.set(0, time * 2.4 + i, 0);
      this.dummy.updateMatrix();
      this.body.setMatrixAt(i, this.dummy.matrix);
      this.star.setMatrixAt(i, this.dummy.matrix);
    });
    this.body.instanceMatrix.needsUpdate = true;
    this.star.instanceMatrix.needsUpdate = true;
    this.updateSparks(dt);
    if (picked) {
      audio.playSfx("sfx_berry_collect", 0.7, 1.35);
      this.save();
    }
    return picked;
  }

  private burst(at: THREE.Vector3): void {
    for (let k = 0; k < 14; k++) {
      const s = this.sparkState[this.nextSpark];
      this.nextSpark = (this.nextSpark + 1) % SPARKS;
      const a = Math.random() * Math.PI * 2;
      s.pos.set(at.x, at.y + 0.8, at.z);
      s.vel.set(Math.cos(a) * (1 + Math.random() * 2), 3 + Math.random() * 3, Math.sin(a) * (1 + Math.random() * 2));
      s.life = 0.6 + Math.random() * 0.4;
    }
  }

  private updateSparks(dt: number): void {
    this.sparkState.forEach((s, i) => {
      s.life -= dt;
      if (s.life > 0) {
        s.vel.y -= 9 * dt;
        s.pos.addScaledVector(s.vel, dt);
      }
      this.dummy.position.copy(s.pos);
      this.dummy.rotation.set(s.life * 9, s.life * 7, 0);
      this.dummy.scale.setScalar(Math.max(s.life, 0) * 1.6);
      this.dummy.updateMatrix();
      this.sparks.setMatrixAt(i, this.dummy.matrix);
    });
    this.sparks.instanceMatrix.needsUpdate = true;
  }

  /** Deterministic placement: 20 coins along the paths, 10 in quieter spots. */
  private placeCoins(): void {
    const rand = mulberry32(77);
    const ok = (x: number, z: number) =>
      this.hf.isWalkable(x, z) &&
      this.hf.heightAt(x, z) > 0.15 &&
      !this.colliders.hits(x, z, 0.8) &&
      !KEEP_CLEAR.some((g) => Math.hypot(g[0] - x, g[1] - z) < 6) &&
      Math.hypot(LANDMARKS.spawn[0] - x, LANDMARKS.spawn[1] - z) > 5 &&
      this.spots.every((s) => Math.hypot(s.x - x, s.z - z) > 9);
    const add = (x: number, z: number) => this.spots.push(new THREE.Vector3(x, this.hf.heightAt(x, z), z));

    const along: P2[] = [];
    for (const path of PATHS) {
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, az] = path[i];
        const [bx, bz] = path[i + 1];
        const steps = Math.max(1, Math.floor(Math.hypot(bx - ax, bz - az) / 4));
        for (let s = 0; s < steps; s++) along.push([ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps]);
      }
    }
    // Reason: shuffle so coins spread over all paths instead of filling the first ones
    for (let i = along.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [along[i], along[j]] = [along[j], along[i]];
    }
    for (const [x, z] of along) {
      if (this.spots.length >= 20) break;
      const ox = x + (rand() - 0.5) * 2;
      const oz = z + (rand() - 0.5) * 2;
      if (ok(ox, oz)) add(ox, oz);
    }
    for (let tries = 0; this.spots.length < COIN_COUNT && tries < 5000; tries++) {
      const x = -95 + rand() * 190;
      const z = -60 + rand() * 130;
      if (ok(x, z)) add(x, z);
    }
  }

  private load(): void {
    try {
      const list: number[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      this.taken = new Set(list.filter((i) => i < this.spots.length));
    } catch {
      // Reason: storage may be unavailable (private mode); start with no coins
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.taken]));
    } catch {
      // Reason: storage may be full or unavailable; coins just won't be remembered
    }
  }
}
