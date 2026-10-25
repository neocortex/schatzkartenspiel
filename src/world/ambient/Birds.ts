/**
 * Birds: seagull flocks lazily circling above the coasts (gliding with the
 * odd burst of wingbeats, banking into their turns) and small groups of
 * colourful songbirds that now and then cross the sky near the focus with a
 * bouncy flap-and-glide flight.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { ISLAND, LANDMARKS } from "../layout";
import { CritterMesh } from "./CritterMesh";
import { gullModel, songbirdModel } from "./critterModels";
import { FLAP_ANIM, GULL_ANIM } from "./critterAnims";
import { rnd } from "./spawn";

const FLOCKS = 8;
const GULLS_PER_FLOCK = 5;
const SONGBIRDS = 10;

interface Gull {
  cx: number;
  cz: number;
  baseY: number;
  radius: number;
  omega: number;
  phase: number;
  seed: number;
  scale: number;
}

interface Songbird {
  active: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  lift: number;
  left: number;
  seed: number;
}

const SONG_TINTS = [
  new THREE.Color(0.25, 0.5, 1.0),
  new THREE.Color(0.95, 0.14, 0.1),
  new THREE.Color(1.0, 0.82, 0.2),
  new THREE.Color(0.62, 0.43, 0.28),
];

export class Birds {
  readonly group = new THREE.Group();
  private gullMesh: CritterMesh;
  private songMesh: CritterMesh;
  private gulls: Gull[] = [];
  private songbirds: Songbird[] = [];
  private nextFlock = 3;

  constructor(private hf: Heightfield) {
    this.gullMesh = new CritterMesh({ name: "gulls", geometry: gullModel(), count: FLOCKS * GULLS_PER_FLOCK, animate: GULL_ANIM, doubleSided: true, selfLit: 0.35 });
    this.songMesh = new CritterMesh({ name: "songbirds", geometry: songbirdModel(), count: SONGBIRDS, animate: FLAP_ANIM, doubleSided: true, selfLit: 0.2 });
    this.group.add(this.gullMesh.mesh, this.songMesh.mesh);
    this.placeFlocks();
    for (let i = 0; i < SONGBIRDS; i++) {
      this.songbirds.push({ active: false, x: 0, y: 0, z: 0, yaw: 0, speed: 0, lift: 0, left: 0, seed: Math.random() * 100 });
    }
  }

  /** Spread the gull flocks around the coastline (plus one over the treasure island). */
  private placeFlocks(): void {
    const centres: [number, number][] = [];
    for (let k = 0; k < FLOCKS - 1; k++) {
      const a = (k / (FLOCKS - 1)) * Math.PI * 2 + 0.4;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      // Reason: march out from the island centre until the water stays deep for a while —
      // that's the coast (a short dip is the river or the lake, not the sea)
      const wet = (d: number) => this.hf.heightAt(ISLAND.cx + dx * d, ISLAND.cz + dz * d) < -0.6;
      let r = 30;
      while (r < 140 && !(wet(r) && wet(r + 6) && wet(r + 12))) r += 1;
      centres.push([ISLAND.cx + dx * (r + 4), ISLAND.cz + dz * (r + 4)]);
    }
    centres.push([LANDMARKS.treasureIsland[0], LANDMARKS.treasureIsland[1]]);

    for (const [cx, cz] of centres) {
      // Highest ground anywhere the flock may wander (orbit + drift), so gulls never clip a cliff
      let ground = 0;
      for (const r of [0, 6, 12, 18, 23]) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          ground = Math.max(ground, this.hf.heightAt(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
        }
      }
      const dir = Math.random() < 0.5 ? -1 : 1;
      for (let g = 0; g < GULLS_PER_FLOCK; g++) {
        const radius = rnd(5, 12);
        this.gulls.push({
          cx: cx + rnd(-3, 3),
          cz: cz + rnd(-3, 3),
          baseY: ground + rnd(4.5, 8.5),
          radius,
          omega: (dir * rnd(4, 5.5)) / radius,
          phase: Math.random() * Math.PI * 2,
          seed: Math.random() * 100,
          scale: rnd(0.62, 0.75),
        });
      }
    }
  }

  update(dt: number, time: number, focus: THREE.Vector3): void {
    this.updateGulls(time);
    this.updateSongbirds(dt, time, focus);
  }

  private updateGulls(t: number): void {
    this.gulls.forEach((g, i) => {
      const r = g.radius * (1 + 0.18 * Math.sin(t * 0.21 + g.seed));
      const th = g.phase + g.omega * t;
      const cx = g.cx + Math.sin(t * 0.05 + g.seed) * 4;
      const cz = g.cz + Math.cos(t * 0.04 + g.seed * 2) * 4;
      const x = cx + Math.cos(th) * r;
      const z = cz + Math.sin(th) * r;
      const y = g.baseY + Math.sin(t * 0.4 + g.seed) * 1.2;
      const dir = Math.sign(g.omega);
      const yaw = Math.atan2(-Math.sin(th) * dir, Math.cos(th) * dir);
      // Bank into the turn: circling counter-clockwise (dir > 0) the centre lies on the local -x side
      const roll = dir * 0.38;
      // Mostly gliding with a short burst of wingbeats every few seconds
      const burst = THREE.MathUtils.smoothstep(0.5 + 0.5 * Math.sin(t * 0.45 + g.seed * 7), 0.72, 0.9);
      const wing = 0.1 + burst * 0.6 * Math.sin(t * 7 + g.seed * 3) + (1 - burst) * 0.05 * Math.sin(t * 1.3 + g.seed);
      this.gullMesh.set(i, x, y, z, yaw, 0.05, roll, wing, g.scale);
    });
    this.gullMesh.commit();
  }

  private updateSongbirds(dt: number, t: number, focus: THREE.Vector3): void {
    this.nextFlock -= dt;
    if (this.nextFlock <= 0) {
      this.nextFlock = rnd(7, 14);
      this.launchFlock(focus);
    }
    this.songbirds.forEach((b, i) => {
      if (!b.active) {
        this.songMesh.hide(i);
        return;
      }
      const step = b.speed * dt;
      b.x += Math.sin(b.yaw) * step;
      b.z += Math.cos(b.yaw) * step;
      b.left -= step;
      if (b.left <= 0) b.active = false;
      const target = Math.max(this.hf.heightAt(b.x, b.z), 0) + 4 + b.lift;
      b.y += (target - b.y) * Math.min(dt * 1.5, 1);
      // Bounding flight: a quick burst of wingbeats lifts the bird, then it glides and dips
      const cycle = (t * 1.1 + b.seed) % 1;
      const flapping = cycle < 0.5;
      const wing = flapping ? 0.25 + 0.95 * Math.sin(t * 2 * Math.PI * 11 + b.seed) : 0.12;
      const bob = Math.sin(cycle * Math.PI * 2) * 0.3;
      this.songMesh.set(i, b.x, b.y + bob, b.z, b.yaw, flapping ? 0.15 : -0.1, 0, wing, 1.3);
    });
    this.songMesh.commit();
  }

  /** Send 3–5 songbirds across the view, starting outside it. */
  private launchFlock(focus: THREE.Vector3): void {
    const heading = Math.random() * Math.PI * 2;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const side = rnd(-10, 10);
    const tint = SONG_TINTS[Math.floor(Math.random() * SONG_TINTS.length)];
    let n = 3 + Math.floor(Math.random() * 3);
    this.songbirds.forEach((b, i) => {
      if (b.active || n <= 0) return;
      n--;
      const along = -30 + rnd(-2.5, 2.5);
      const lateral = side + rnd(-2, 2);
      b.active = true;
      b.x = focus.x + fx * along + fz * lateral;
      b.z = focus.z + fz * along - fx * lateral;
      b.lift = rnd(0, 2.5);
      b.y = Math.max(this.hf.heightAt(b.x, b.z), 0) + 4 + b.lift;
      b.yaw = heading + rnd(-0.08, 0.08);
      b.speed = rnd(7, 8.5);
      b.left = 62;
      this.songMesh.setLook(i, tint);
    });
  }
}
