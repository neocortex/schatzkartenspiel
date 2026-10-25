/**
 * Mountain hazards, always telegraphed and slower than Tadeo:
 * - rolling rocks: on the rock-face ramp a boulder appears at the top, shakes
 *   with a "!" for a moment, then rolls down — jump over it;
 * - snowballs: on the snow field a red ring and a bouncing "!" mark the spot,
 *   then a big snowball drops onto it — step away.
 * Hit boxes are smaller than the visuals, in the player's favour.
 */

import * as THREE from "three";
import { mat, toonMesh } from "../../characters/parts";
import { displace } from "../../core/geo";
import { audio } from "../../audio/Audio";
import { Course, Zone } from "./course";
import { Climber } from "./climber";
import { Bursts } from "../volcano/kit/bursts";

const ROCK_R = 0.5;
const ROLL_SPEED = 4.2;
const WOBBLE = 1.3;
const ROLL_EVERY = 3.6;
const DROP_TIME = 1.7;
const DROP_EVERY = 2.3;
const DROP_HEIGHT = 11;

/** A rolling rock picks up speed over its first half second. */
const rollSpeed = (t: number) => ROLL_SPEED * Math.min(1, 0.3 + t * 1.4);

interface Roller {
  mesh: THREE.Mesh;
  zone: Zone;
  s: number;
  y: number;
  vy: number;
  t: number;
  phase: "wobble" | "roll" | "tumble";
  out: number;
}

interface Drop {
  s: number;
  ground: number;
  t: number;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  column: THREE.Mesh;
  ball: THREE.Mesh;
  whistled: boolean;
}

export interface Hit {
  /** Path position of whatever hit Tadeo. */
  s: number;
}

/** A red "!" in a white-rimmed disc, as a camera-facing sprite texture. */
function warnTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ff3b30";
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = "bold 84px Fredoka, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("!", 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Vertical alpha ramp (opaque at the bottom, clear at the top) for the snowball light columns. */
function rampTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, "#000000");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

export class Hazards {
  readonly group = new THREE.Group();
  readonly rollers: Roller[] = [];
  readonly drops: Drop[] = [];
  private rockGeo: THREE.BufferGeometry;
  private ballGeo: THREE.SphereGeometry;
  private ringGeo: THREE.RingGeometry;
  private columnGeo: THREE.CylinderGeometry;
  private columnMat: THREE.MeshBasicMaterial;
  private warnTex = warnTexture();
  private warnMat: THREE.SpriteMaterial;
  private warn: THREE.Sprite[] = [];
  private rollTimer = 1.5;
  private dropTimer = 1.2;
  private tmp = new THREE.Vector3();
  private owned: { dispose(): void }[] = [];

  constructor(private course: Course, private bursts: Bursts) {
    this.rockGeo = displace(new THREE.IcosahedronGeometry(ROCK_R, 2), 0.07, 2.4, 3);
    this.rockGeo.computeVertexNormals();
    this.ballGeo = new THREE.SphereGeometry(0.62, 18, 14);
    this.ringGeo = new THREE.RingGeometry(0.15, 1.0, 40);
    this.ringGeo.rotateX(-Math.PI / 2);
    // Reason: a flat ring is a thin sliver from the low side camera; a soft red light column reads clearly
    this.columnGeo = new THREE.CylinderGeometry(0.85, 0.85, 3.2, 24, 1, true);
    this.columnGeo.translate(0, 1.6, 0);
    const ramp = rampTexture();
    this.columnMat = new THREE.MeshBasicMaterial({ color: "#ff4a3a", alphaMap: ramp, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    this.owned.push(ramp, this.columnMat);
    this.warnMat = new THREE.SpriteMaterial({ map: this.warnTex, depthTest: false, transparent: true });
    this.owned.push(this.warnTex, this.warnMat);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(this.warnMat);
      s.scale.setScalar(0.8);
      s.renderOrder = 10;
      s.visible = false;
      this.warn.push(s);
      this.group.add(s);
    }
  }

  /** Remove everything in flight (after a respawn, so Tadeo starts fresh). */
  clear(): void {
    for (const r of this.rollers) this.group.remove(r.mesh);
    for (const d of this.drops) {
      this.group.remove(d.ring, d.column, d.ball);
      d.ringMat.dispose();
    }
    this.rollers.length = 0;
    this.drops.length = 0;
    this.rollTimer = 1.5;
    this.dropTimer = 1.2;
  }

  /** Advance hazards; spawns and hits only while `active`. Returns a hit on Tadeo, if any. */
  update(dt: number, time: number, climber: Climber, active: boolean): Hit | null {
    let hit: Hit | null = null;
    const c = this.course;
    // Spawning near the player
    if (active) {
      this.rollTimer -= dt;
      const chute = c.chutes.find((z) => climber.s > z.s0 - 6 && climber.s < z.s1 + 0.5);
      // Reason: only spawn while Tadeo is far enough below to see the rock coming
      if (chute && this.rollTimer <= 0 && climber.s < chute.s1 - 6) {
        this.spawnRoller(chute);
        this.rollTimer = ROLL_EVERY;
      }
      this.dropTimer -= dt;
      if (this.dropTimer <= 0 && c.inZone(c.drops, climber.s)) {
        this.spawnDrop(climber);
        this.dropTimer = DROP_EVERY * (0.85 + Math.random() * 0.3);
      }
    }
    for (const r of [...this.rollers]) {
      const h = this.updateRoller(r, dt, time, climber, active);
      hit = hit ?? h;
    }
    for (const d of [...this.drops]) {
      const h = this.updateDrop(d, dt, time, climber, active);
      hit = hit ?? h;
    }
    this.placeWarnings(time);
    return hit;
  }

  private spawnRoller(zone: Zone): void {
    const mesh = toonMesh(this.rockGeo, mat("#8c7a6b", 0.85));
    const s = zone.s1 - 0.7;
    const r: Roller = { mesh, zone, s, y: this.course.support(s, 0.2) + ROCK_R, vy: 0, t: 0, phase: "wobble", out: 0 };
    this.rollers.push(r);
    this.group.add(mesh);
    audio.playSfx("sfx_door", 0.5, 0.45);
  }

  private updateRoller(r: Roller, dt: number, time: number, climber: Climber, active: boolean): Hit | null {
    const c = this.course;
    r.t += dt;
    let hit: Hit | null = null;
    if (r.phase === "wobble") {
      r.mesh.rotation.set(Math.sin(time * 40) * 0.12, 0, Math.sin(time * 33) * 0.12);
      if (Math.random() < dt * 6) this.bursts.puffs(c.point(r.s, c.radius(r.y), r.y - ROCK_R), 1, "#d8cbbd", [0.3, 0.9], 0.6, 0.6, 0.8, 0.6);
      // Reason: set off early if Tadeo walks right up to it, so he can never walk through a waiting rock
      if (r.t > WOBBLE || (r.t > 0.4 && Math.abs(r.s - climber.s) < 3.5)) {
        r.phase = "roll";
        r.t = 0;
        audio.playSfx("sfx_hammer_miss", 0.6, 0.5);
      }
    } else if (r.phase === "roll") {
      const speed = rollSpeed(r.t);
      r.s -= speed * dt;
      const ground = c.support(r.s, 0.15) + ROCK_R;
      if (r.y > ground + 0.05) {
        r.vy -= 24 * dt;
        r.y = Math.max(ground, r.y + r.vy * dt);
        if (r.y === ground) r.vy = 0;
      } else {
        r.y = ground;
      }
      r.mesh.rotateOnWorldAxis(c.normal(r.s, this.tmp), -(speed * dt) / ROCK_R);
      if (Math.random() < dt * 5) this.bursts.puffs(c.point(r.s, c.radius(r.y), r.y - ROCK_R), 1, "#d8cbbd", [0.25, 0.8], 0.4, 0.4, 0.6, 0.5);
      // Reason: generous for Tadeo — the hit box is narrower than the rock and ignores his upper body
      if (active && climber.invulnerable <= 0 && climber.mode === "walk" && Math.abs(r.s - climber.s) < ROCK_R * 0.7 + 0.12 && climber.y < r.y - 0.05) {
        hit = { s: r.s };
      }
      if (r.s < r.zone.s0 + 0.8) {
        r.phase = "tumble";
        r.t = 0;
        r.vy = 3;
      }
    } else {
      // Bounce off the ledge and tumble away down the mountainside
      r.out += dt * 3.5;
      r.vy -= 18 * dt;
      r.y += r.vy * dt;
      r.s -= dt * 1.5;
      r.mesh.rotation.x += dt * 6;
      if (r.t > 2.2) {
        this.group.remove(r.mesh);
        this.rollers.splice(this.rollers.indexOf(r), 1);
        return hit;
      }
    }
    c.point(r.s, c.radius(r.y - ROCK_R) + r.out, r.y, r.mesh.position);
    return hit;
  }

  private spawnDrop(climber: Climber): void {
    const c = this.course;
    // Aim a little ahead of Tadeo (or right at him now and then) on solid ground
    for (let k = 0; k < 6; k++) {
      const ahead = Math.random() < 0.3 ? Math.random() * 0.6 : 1.6 + Math.random() * 4.5;
      const s = climber.s + ahead;
      const ground = c.support(s, 0.05);
      if (ground === -Infinity || c.support(s, 1.0) > ground + 0.3) continue;
      if (this.drops.some((d) => Math.abs(d.s - s) < 2.4)) continue;
      const ringMat = new THREE.MeshBasicMaterial({ color: "#ff4a3a", transparent: true, opacity: 0.8, depthWrite: false });
      const ring = new THREE.Mesh(this.ringGeo, ringMat);
      ring.renderOrder = 3;
      const column = new THREE.Mesh(this.columnGeo, this.columnMat);
      column.renderOrder = 3;
      const ball = toonMesh(this.ballGeo, mat("#f4f8ff", 0.7, 0.35));
      ball.visible = false;
      this.group.add(ring, column, ball);
      this.drops.push({ s, ground, t: 0, ring, ringMat, column, ball, whistled: false });
      return;
    }
  }

  private updateDrop(d: Drop, dt: number, time: number, climber: Climber, active: boolean): Hit | null {
    const c = this.course;
    d.t += dt;
    const k = Math.min(d.t / DROP_TIME, 1);
    const r = c.radius(d.ground);
    c.point(d.s, r, d.ground + 0.07, d.ring.position);
    d.ring.rotation.y = -c.theta(d.s);
    d.ring.scale.setScalar(0.45 + 0.75 * k);
    d.column.position.copy(d.ring.position);
    d.column.scale.set(0.5 + 0.5 * k, 0.6 + 0.4 * k, 0.5 + 0.5 * k);
    d.ringMat.opacity = 0.55 + 0.35 * Math.sin(time * (10 + k * 14));
    const fall = 0.55;
    if (d.t > DROP_TIME - fall && d.t < DROP_TIME) {
      const f = (d.t - (DROP_TIME - fall)) / fall;
      d.ball.visible = true;
      c.point(d.s, r, d.ground + 0.6 + DROP_HEIGHT * (1 - f * f), d.ball.position);
      if (!d.whistled) {
        d.whistled = true;
        audio.playSfx("sfx_lava_fall", 0.35, 1.3);
      }
    }
    if (d.t >= DROP_TIME) {
      const at = c.point(d.s, r, d.ground + 0.3);
      this.bursts.puffs(at, 12, "#ffffff", [0.5, 1.6], 1.6, 1.4, 1.1, 0.9);
      this.bursts.twinkle(at, 6, 1.2, new THREE.Color(1.4, 1.6, 2.0), 0.25);
      audio.playSfx("sfx_dig", 0.8, 0.6);
      this.group.remove(d.ring, d.column, d.ball);
      d.ringMat.dispose();
      this.drops.splice(this.drops.indexOf(d), 1);
      if (active && climber.invulnerable <= 0 && climber.mode === "walk" && Math.abs(d.s - climber.s) < 0.95 && climber.y < d.ground + 1.1) {
        return { s: d.s };
      }
    }
    return null;
  }

  /** Bouncing "!" markers over waiting rocks and pending snowballs. */
  private placeWarnings(time: number): void {
    const c = this.course;
    let i = 0;
    const show = (s: number, y: number) => {
      if (i >= this.warn.length) return;
      const w = this.warn[i++];
      w.visible = true;
      c.point(s, c.radius(y) + 0.3, y + 1.9 + Math.abs(Math.sin(time * 6)) * 0.35, w.position);
    };
    for (const r of this.rollers) if (r.phase === "wobble") show(r.s, r.y);
    for (const d of this.drops) show(d.s, d.ground);
    for (; i < this.warn.length; i++) this.warn[i].visible = false;
  }

  /** Compact hazard state for the E2E autopilot. */
  info(): { rollers: { s: number; y: number; v: number; phase: string }[]; drops: { s: number; left: number }[] } {
    return {
      rollers: this.rollers.map((r) => ({ s: r.s, y: r.y, v: r.phase === "roll" ? rollSpeed(r.t) : 0, phase: r.phase })),
      drops: this.drops.map((d) => ({ s: d.s, left: DROP_TIME - d.t })),
    };
  }

  dispose(): void {
    this.clear();
    this.rockGeo.dispose();
    this.ballGeo.dispose();
    this.ringGeo.dispose();
    this.columnGeo.dispose();
    for (const o of this.owned) o.dispose();
  }
}
