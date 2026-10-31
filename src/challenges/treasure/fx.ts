/**
 * Particle effects of the treasure hunt, each one instanced draw call:
 * flying sand, ice shards, gold coins and jewels that bounce and settle on the
 * sand, additive magic sparkles, and fireworks (rockets with glittering
 * trails that burst into coloured stars).
 */

import * as THREE from "three";
import { audio } from "../../audio/Audio";
import { glowTexture } from "../../world/ambient/textures";
import { Particle, Particles, selfLit } from "../shared/particles";
import { Owned } from "../shared/dispose";

type Floor = (x: number, z: number) => number;

export function createSand(floor: Floor, owned: Owned): Particles {
  const material = owned.add(selfLit(new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), 0.12));
  return new Particles({ geometry: new THREE.IcosahedronGeometry(0.036, 0), material, max: 900, gravity: 13, drag: 0.6, floor, bounce: 0.15, castShadow: true });
}

export function createShards(floor: Floor, owned: Owned): Particles {
  const material = owned.add(
    new THREE.MeshStandardMaterial({ color: "#e8fbff", roughness: 0.08, transparent: true, opacity: 0.88, emissive: "#8fdcff", emissiveIntensity: 0.55, flatShading: true }),
  );
  const geometry = new THREE.OctahedronGeometry(0.11, 0).scale(0.6, 1.5, 0.6);
  return new Particles({ geometry, material, max: 420, gravity: 11, drag: 0.5, floor, bounce: 0.35, renderOrder: 4 });
}

export function createCoins(floor: Floor, owned: Owned): Particles {
  const material = owned.add(selfLit(new THREE.MeshStandardMaterial({ roughness: 0.28 }), 0.45));
  return new Particles({ geometry: new THREE.CylinderGeometry(0.11, 0.11, 0.03, 18), material, max: 520, gravity: 12, drag: 0.3, floor, bounce: 0.4, castShadow: true });
}

export function createGems(floor: Floor, owned: Owned): Particles {
  const material = owned.add(selfLit(new THREE.MeshStandardMaterial({ roughness: 0.12, flatShading: true }), 0.75));
  return new Particles({ geometry: new THREE.OctahedronGeometry(0.1, 0).scale(1, 1.3, 1), material, max: 160, gravity: 12, drag: 0.3, floor, bounce: 0.45, castShadow: true });
}

export function createSparkles(owned: Owned, max = 600): Particles {
  const material = owned.add(new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  return new Particles({ geometry: new THREE.PlaneGeometry(0.3, 0.3), material, max, gravity: -0.3, drag: 1.4, billboard: true, fade: "color", renderOrder: 6 });
}

export const COIN_COLORS = ["#ffc83d", "#ffd75e", "#f2ae22", "#ffe48a"];
export const GEM_COLORS = ["#ff2d55", "#2ee87a", "#3d8bff", "#b45cff", "#ffd23f", "#2fe0ff"];

/** Spray coins and jewels out of `at` in a fountain; they bounce and settle on the sand. */
export function lootBurst(coins: Particles, gems: Particles, at: THREE.Vector3, nCoins: number, nGems: number, power = 1): void {
  const init = (colors: string[], life: number) => (p: Particle) => {
    const a = Math.random() * Math.PI * 2;
    const out = (1.2 + Math.random() * 2.4) * power;
    p.pos.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.3));
    // Reason: bias the spray towards the camera side (+z) so the loot lands where the player sees it
    p.vel.set(Math.cos(a) * out, (6 + Math.random() * 4) * power, Math.sin(a) * out * 0.8 + 0.8 * power);
    p.spin.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
    p.color.set(colors[Math.floor(Math.random() * colors.length)]);
    p.life = life + Math.random() * 6;
    p.size = 0.85 + Math.random() * 0.4;
  };
  coins.emit(nCoins, init(COIN_COLORS, 16));
  gems.emit(nGems, init(GEM_COLORS, 16));
}

interface Rocket {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  colors: [THREE.Color, THREE.Color];
}

const FIREWORK_COLORS: [string, string][] = [
  ["#ff4d6d", "#ffd23f"],
  ["#3fb8ff", "#ffffff"],
  ["#5ee06b", "#ffd23f"],
  ["#c86bff", "#ff8cd8"],
  ["#ff8c3a", "#fff1a0"],
  ["#2fe0ff", "#b45cff"],
];

/** Fireworks far in front of the camera: call `launch()` (or set `auto`) and update every frame. */
export class Fireworks {
  readonly sparks: Particles;
  /** Launch a new rocket every so often by itself. */
  auto = false;
  private rockets: Rocket[] = [];
  private timer = 0.5;

  constructor(owned: Owned) {
    const material = owned.add(new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.sparks = new Particles({ geometry: new THREE.PlaneGeometry(0.5, 0.5), material, max: 2600, gravity: 3.2, drag: 1.5, billboard: true, fade: "color", renderOrder: 6 });
  }

  /** Fire one rocket from the ground far in front of the camera so its burst lands in view. */
  launch(camera: THREE.Camera): void {
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const yaw = Math.atan2(fwd.x, fwd.z) + (Math.random() - 0.5) * 1.1;
    const dist = 42 + Math.random() * 26;
    const from = camera.position.clone().add(new THREE.Vector3(Math.sin(yaw) * dist, 0, Math.cos(yaw) * dist));
    from.y = 0;
    const height = 13 + Math.random() * 9;
    const g = 9.8;
    const up = Math.sqrt(2 * g * height);
    const pair = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    this.rockets.push({
      pos: from,
      vel: new THREE.Vector3((Math.random() - 0.5) * 2, up, (Math.random() - 0.5) * 2),
      fuse: up / g,
      colors: [new THREE.Color(pair[0]).multiplyScalar(2.6), new THREE.Color(pair[1]).multiplyScalar(2.6)],
    });
    audio.playSfx("sfx_wave", 0.18, 1.9);
  }

  update(dt: number, camera: THREE.Camera, time: number): void {
    if (this.auto) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0.7 + Math.random() * 1.1;
        this.launch(camera);
      }
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.vel.y -= 9.8 * dt;
      r.pos.addScaledVector(r.vel, dt);
      r.fuse -= dt;
      // Glittering trail
      this.sparks.emit(2, (p) => {
        p.pos.copy(r.pos);
        p.vel.set((Math.random() - 0.5) * 0.8, -1 - Math.random(), (Math.random() - 0.5) * 0.8);
        p.color.setRGB(3.2, 2.2, 1.1);
        p.life = 0.35 + Math.random() * 0.3;
        p.size = 0.5 + Math.random() * 0.4;
      });
      if (r.fuse <= 0) {
        this.burst(r);
        this.rockets.splice(i, 1);
      }
    }
    this.sparks.update(dt, camera, time);
  }

  private burst(r: Rocket): void {
    const ring = Math.random() < 0.3;
    const n = 130;
    this.sparks.emit(n, (p, k) => {
      const dir = ring
        ? new THREE.Vector3(Math.cos((k / n) * Math.PI * 2), Math.sin((k / n) * Math.PI * 2) * 0.35 + 0.2, Math.sin((k / n) * Math.PI * 2))
        : new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      p.pos.copy(r.pos);
      p.vel.copy(dir).multiplyScalar(ring ? 11 : 7 + Math.random() * 6);
      p.color.copy(k % 3 ? r.colors[0] : r.colors[1]);
      p.life = 1.3 + Math.random() * 1.1;
      p.size = 1 + Math.random() * 0.7;
    });
    audio.playSfx("sfx_hammer_miss", 0.55, 0.45 + Math.random() * 0.15);
  }
}
