/**
 * The runaway hens' little brains. Hens potter about (walk, peck, look
 * around) until Tadeo comes near, then flee with a zig-zag and panicky
 * flutter-hops — slower than Tadeo, and they tire, sit down and pant, so they
 * can always be caught. Each hen escapes the very first grab with a sideways
 * flutter, so catching her is a little chase rather than a bump. The chick toddles after Tadeo once it finds him and
 * is "caught" when he leads it to the coop. The golden hen hides behind the
 * hay bales and dashes between them until she is worn out. A caught bird
 * flutters home to the coop in a happy arc and sits on the roost.
 */

import * as THREE from "three";
import { blobShadow } from "../../characters/Humanoid";
import { Colliders } from "../../world/Colliders";
import { rnd, turnToward, yawTo } from "../../world/ambient/spawn";
import { Coop } from "./coop";
import { Disposable } from "./dispose";
import { HenKind, HenLook, HenModel } from "../../characters/HenModel";
import { CHICK_START, HAY, HEN_STARTS, P2, RAMP_FOOT, YARD } from "./layout";

export type HenState = "hidden" | "idle" | "flee" | "tired" | "follow" | "hide" | "dash" | "flying" | "home";

/** A hen notices Tadeo within this distance, panics (hops) closer than PANIC, calms down beyond CALM. */
const ALERT = 4.0;
const PANIC = 2.3;
const CALM = 6.5;
const FLEE_SPEED = 3.3;
const PANIC_SPEED = 4.3;
const GOLD_SPEED = 4.9;
const HEN_R = 0.3;
/** The one-time escape flutter: how long it lasts and how fast she sails sideways. */
const DODGE_TIME = 0.5;
const DODGE_SPEED = 6.5;
/** The chick counts as home when Tadeo leads it this close to the ramp. */
const DELIVER_R = 2.8;
/** Seat order on the roost: fill from the middle outwards; the golden hen gets the centre. */
const SEAT_ORDER = [2, 4, 1, 5, 0, 6];
const GOLD_SEAT = 3;

export interface HenSpec {
  name: string;
  look: HenLook;
  start: P2;
  scale: number;
}

export const HENS: HenSpec[] = [
  { name: "Berta", look: { kind: "hen", body: "#fbf8f1", wing: "#ece6da", tail: "#e3dccd" }, start: HEN_STARTS[0], scale: 1 },
  { name: "Frieda", look: { kind: "hen", body: "#b8642e", wing: "#93491f", tail: "#3d2a1f", chest: "#d48a4f" }, start: HEN_STARTS[1], scale: 1 },
  { name: "Lotte", look: { kind: "hen", body: "#3d3b48", wing: "#2c3d44", tail: "#1f3d3a", chest: "#4c4a58" }, start: HEN_STARTS[2], scale: 1 },
  { name: "Hilde", look: { kind: "hen", body: "#ece6d9", wing: "#bfb7a8", tail: "#54504c", speckle: "#4a423c" }, start: HEN_STARTS[3], scale: 0.95 },
  { name: "Rosi", look: { kind: "hen", body: "#e8a24a", wing: "#cf7f2c", tail: "#7a3f1c", chest: "#f2c27a" }, start: HEN_STARTS[4], scale: 1 },
  { name: "Piepsi", look: { kind: "chick", body: "#ffd84a", wing: "#ffc928", tail: "#ffc928" }, start: CHICK_START, scale: 0.62 },
  { name: "Goldi", look: { kind: "golden", body: "#ffc93c", wing: "#ffe08a", tail: "#ffb21a", chest: "#ffd766" }, start: HAY[0].at, scale: 1.1 },
];

interface Flight {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  apex: number;
}

export class Hen {
  readonly model: HenModel;
  readonly shadow = blobShadow(0.34);
  readonly name: string;
  readonly kind: HenKind;
  readonly scale: number;
  x: number;
  z: number;
  y = 0;
  vy = 0;
  yaw = rnd(-Math.PI, Math.PI);
  speed = 0;
  state: HenState = "idle";
  fatigue = 0;
  timer = rnd(0.5, 2);
  mode: "walk" | "peck" | "look" = "look";
  tx = 0;
  tz = 0;
  peck = 0;
  look = 0;
  sit = 0;
  hopCool = 0;
  calm = 0;
  /** Seconds left of the escape flutter; `dodged` once it has been used up. */
  dodge = 0;
  dodged = false;
  /** Golden hen: index of the hay pile she hides behind, and how often she has dashed. */
  bale = 0;
  dashes = 0;
  flight: Flight | null = null;
  seat = -1;
  readonly seed = Math.random() * 100;
  readonly home: P2;

  constructor(spec: HenSpec, owned: Disposable[]) {
    this.model = new HenModel(spec.look, owned);
    this.name = spec.name;
    this.kind = spec.look.kind;
    this.scale = spec.scale;
    this.home = spec.start;
    [this.x, this.z] = spec.start;
    this.tx = this.x;
    this.tz = this.z;
    this.model.root.scale.setScalar(spec.scale);
  }

  /** Still running around the yard (a target for Tadeo). */
  get loose(): boolean {
    return this.state !== "hidden" && this.state !== "flying" && this.state !== "home";
  }
}

export interface FlockEvents {
  startled(h: Hen): void;
  hop(h: Hen): void;
  dodge(h: Hen): void;
  tired(h: Hen): void;
  peep(h: Hen): void;
  follow(h: Hen): void;
  dash(h: Hen): void;
  caught(h: Hen): void;
  home(h: Hen): void;
}

export interface Chaser {
  pos: THREE.Vector3;
  facing: number;
  /** Centre distance at which a hen is caught (bigger during a dive). */
  catchR: number;
}

export class Flock {
  readonly hens: Hen[] = [];
  readonly group = new THREE.Group();
  /** Seconds of active play; the hens get slower as it grows. */
  playTime = 0;
  private seated = 0;
  private tmp = new THREE.Vector3();

  constructor(private colliders: Colliders, private coop: Coop, private events: FlockEvents, owned: Disposable[]) {
    for (const spec of HENS) {
      const h = new Hen(spec, owned);
      this.hens.push(h);
      this.group.add(h.model.root, h.shadow);
      if (h.kind === "golden") this.setHidden(h);
    }
  }

  get chick(): Hen {
    return this.hens.find((h) => h.kind === "chick")!;
  }

  get golden(): Hen {
    return this.hens.find((h) => h.kind === "golden")!;
  }

  get homeCount(): number {
    return this.hens.filter((h) => h.state === "home").length;
  }

  private setHidden(h: Hen): void {
    h.state = "hidden";
    h.model.root.visible = false;
    h.shadow.visible = false;
  }

  /** The golden hen pops out behind the hay pile farthest from Tadeo. */
  revealGolden(tadeo: THREE.Vector3): Hen {
    const g = this.golden;
    g.bale = this.farthestBale(tadeo, -1, g);
    this.hideSpot(g, tadeo, this.tmp);
    g.x = this.tmp.x;
    g.z = this.tmp.z;
    g.state = "hide";
    g.model.root.visible = true;
    g.shadow.visible = true;
    return g;
  }

  update(dt: number, time: number, active: boolean, p: Chaser): void {
    if (active) this.playTime += dt;
    for (const h of this.hens) {
      if (h.state === "hidden") continue;
      this.step(h, dt, time, active, p);
      this.air(h, dt);
      this.pose(h, dt);
    }
    this.separate();
  }

  private step(h: Hen, dt: number, t: number, active: boolean, p: Chaser): void {
    const d = Math.hypot(h.x - p.pos.x, h.z - p.pos.z);
    h.hopCool -= dt;
    switch (h.state) {
      case "idle":
        this.idle(h, dt, t);
        if (!active) break;
        if (h.kind === "chick") {
          if (d < 9 && Math.random() < dt * 0.35) this.events.peep(h);
          if (d < 2.4) {
            h.state = "follow";
            this.events.follow(h);
          }
        } else if (d < ALERT) {
          h.state = "flee";
          h.calm = 0;
          this.events.startled(h);
        }
        break;
      case "flee":
        if (h.dodge > 0) {
          h.dodge -= dt;
          this.move(h, DODGE_SPEED, dt);
          return;
        }
        if (active && this.tryDodge(h, p, d)) return;
        if (active) this.flee(h, dt, t, p, d);
        else this.slowDown(h, dt);
        break;
      case "tired":
        this.slowDown(h, dt);
        h.timer -= dt;
        if (h.timer <= 0 && h.kind !== "golden") {
          h.state = d < ALERT ? "flee" : "idle";
          h.fatigue = 0.55;
        }
        break;
      case "follow":
        this.follow(h, dt, p);
        if (active && Math.random() < dt * 0.25) this.events.peep(h);
        break;
      case "hide":
        this.hide(h, dt, t, p);
        if (active && d < 3.4) this.startDash(h, p.pos);
        break;
      case "dash":
        this.dash(h, dt, p);
        break;
      case "flying":
        this.fly(h, dt);
        return;
      case "home":
        this.sitHome(h, dt, t);
        return;
    }
    if (!active) return;
    // Caught! (tired hens are extra easy)
    const reach = p.catchR + (h.state === "tired" ? 0.3 : 0);
    if (h.kind !== "chick" && d < reach && h.y < 1.0) this.catchHen(h);
    else if (h.kind === "chick" && h.state === "follow" && Math.hypot(h.x - RAMP_FOOT[0], h.z - RAMP_FOOT[1]) < DELIVER_R) this.catchHen(h);
  }

  // ── Behaviours ──────────────────────────────────────────────

  /** A fresh hen about to be grabbed flutters sideways over the grass — once, and it tires her. */
  private tryDodge(h: Hen, p: Chaser, d: number): boolean {
    if (h.kind !== "hen" || h.dodged || h.fatigue > 0.5 || d > p.catchR + 0.4) return false;
    h.dodged = true;
    h.dodge = DODGE_TIME;
    h.vy = Math.max(h.vy, 4.2);
    h.fatigue += 0.25;
    h.yaw = Math.atan2(h.x - p.pos.x, h.z - p.pos.z) + (Math.random() < 0.5 ? 1.2 : -1.2);
    h.yaw = this.avoid(h, h.yaw);
    h.speed = DODGE_SPEED;
    h.model.kick(-0.6);
    this.events.dodge(h);
    return true;
  }

  private idle(h: Hen, dt: number, t: number): void {
    h.timer -= dt;
    h.peck = Math.max(0, h.peck - dt * 4);
    if (h.mode === "walk") {
      const left = Math.hypot(h.tx - h.x, h.tz - h.z);
      h.yaw = turnToward(h.yaw, yawTo(h.x, h.z, h.tx, h.tz), 5 * dt);
      this.move(h, left > 0.2 ? (h.kind === "chick" ? 0.6 : 0.85) : 0, dt);
      if (left < 0.25) h.timer = Math.min(h.timer, 0);
    } else {
      this.slowDown(h, dt);
      if (h.mode === "peck") {
        const k = (t * 2.3 + h.seed) % 1;
        h.peck = THREE.MathUtils.smoothstep(k, 0, 0.25) * (1 - THREE.MathUtils.smoothstep(k, 0.45, 0.75));
      } else if (Math.sin(t * 3 + h.seed * 5) > 0.97) h.look = rnd(-0.8, 0.8);
    }
    if (h.timer > 0) return;
    const r = Math.random();
    h.look = 0;
    if (r < 0.45) {
      h.mode = "walk";
      h.timer = rnd(3, 6);
      const cx = h.kind === "chick" ? h.home[0] : h.x;
      const cz = h.kind === "chick" ? h.home[1] : h.z;
      for (let k = 0; k < 8; k++) {
        const a = Math.random() * Math.PI * 2;
        const rr = rnd(1, h.kind === "chick" ? 2.2 : 4);
        const x = cx + Math.cos(a) * rr;
        const z = cz + Math.sin(a) * rr;
        if (this.inYard(x, z, 1) && !this.colliders.hits(x, z, HEN_R + 0.2)) {
          h.tx = x;
          h.tz = z;
          break;
        }
      }
    } else if (r < 0.8) {
      h.mode = "peck";
      h.timer = rnd(1.5, 3.5);
    } else {
      h.mode = "look";
      h.timer = rnd(1, 2.5);
    }
  }

  private flee(h: Hen, dt: number, t: number, p: Chaser, d: number): void {
    h.peck = 0;
    h.calm = d > CALM ? h.calm + dt : 0;
    if (h.calm > 1.2) {
      h.state = "idle";
      h.mode = "look";
      h.timer = 1;
      return;
    }
    const panic = d < PANIC;
    if (panic && h.hopCool <= 0 && h.y === 0) {
      h.vy = 3.6;
      h.hopCool = 2.4;
      h.model.kick(-0.5);
      this.events.hop(h);
    }
    // Reason: hens tire while running and the whole flock slows as the game goes on, so every hen is caught in the end
    const slow = 1 - Math.min(this.playTime / 160, 0.3);
    h.fatigue += dt * (panic ? 0.13 : 0.08) * (1 + this.playTime / 120);
    if (h.fatigue >= 1) {
      h.state = "tired";
      h.timer = 4.5;
      h.fatigue = 1;
      this.events.tired(h);
      return;
    }
    const speed = (panic ? PANIC_SPEED : FLEE_SPEED) * (1 - 0.4 * h.fatigue) * slow;
    let ax = (h.x - p.pos.x) / Math.max(d, 0.01);
    let az = (h.z - p.pos.z) / Math.max(d, 0.01);
    // Zig-zag like a real panicking hen
    const w = Math.sin(t * 2.6 + h.seed) * 0.5;
    [ax, az] = [ax * Math.cos(w) + az * Math.sin(w), -ax * Math.sin(w) + az * Math.cos(w)];
    // Keep away from the fence, so they run along it rather than into it
    const push = (gap: number) => Math.max(0, (2.4 - gap) / 2.4) * 1.8;
    ax += push(h.x - YARD.minX) - push(YARD.maxX - h.x);
    az += push(h.z - YARD.minZ) - push(YARD.maxZ - h.z);
    h.yaw = turnToward(h.yaw, this.avoid(h, Math.atan2(ax, az)), 8 * dt);
    this.move(h, speed, dt);
  }

  private follow(h: Hen, dt: number, p: Chaser): void {
    const tx = p.pos.x - Math.sin(p.facing) * 1.1;
    const tz = p.pos.z - Math.cos(p.facing) * 1.1;
    const d = Math.hypot(tx - h.x, tz - h.z);
    if (d > 0.2) h.yaw = turnToward(h.yaw, yawTo(h.x, h.z, tx, tz), 10 * dt);
    this.move(h, d < 0.2 ? 0 : Math.min(d * 4, 7), dt);
    // Toddling hops — a big flutter if it fell behind (and then it skips over obstacles)
    if (h.speed > 1 && h.y === 0 && h.hopCool <= 0) {
      h.vy = d > 4 ? 4.5 : 2.2;
      h.hopCool = 0.32;
    }
  }

  /** Where the golden hen should crouch: behind her hay pile, on the side away from Tadeo. */
  private hideSpot(h: Hen, from: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const b = HAY[h.bale];
    let ux = b.at[0] - from.x;
    let uz = b.at[1] - from.z;
    const l = Math.hypot(ux, uz) || 1;
    ux /= l;
    uz /= l;
    let x = b.at[0] + ux * (b.r + 0.5);
    let z = b.at[1] + uz * (b.r + 0.5);
    // Reason: if "behind" would be outside the fence, slide round the pile instead
    x = THREE.MathUtils.clamp(x, YARD.minX + 0.6, YARD.maxX - 0.6);
    z = THREE.MathUtils.clamp(z, YARD.minZ + 0.6, YARD.maxZ - 0.6);
    return out.set(x, 0, z);
  }

  private hide(h: Hen, dt: number, t: number, p: Chaser): void {
    this.hideSpot(h, p.pos, this.tmp);
    const d = Math.hypot(this.tmp.x - h.x, this.tmp.z - h.z);
    if (d > 0.15) h.yaw = turnToward(h.yaw, yawTo(h.x, h.z, this.tmp.x, this.tmp.z), 8 * dt);
    else h.yaw = turnToward(h.yaw, yawTo(h.x, h.z, p.pos.x, p.pos.z), 3 * dt);
    this.move(h, d > 0.15 ? Math.min(d * 3, 2.6) : 0, dt);
    // Peeking out from behind the bale
    h.look = Math.sin(t * 1.6 + h.seed) * 0.9;
  }

  private farthestBale(from: THREE.Vector3, except: number, h: Hen): number {
    let best = 0;
    let bestScore = -Infinity;
    HAY.forEach((b, i) => {
      if (i === except) return;
      const bx = b.at[0] - h.x;
      const bz = b.at[1] - h.z;
      const px = from.x - h.x;
      const pz = from.z - h.z;
      const toward = (bx * px + bz * pz) / ((Math.hypot(bx, bz) || 1) * (Math.hypot(px, pz) || 1));
      // Prefer far piles, but never run straight past Tadeo
      const score = Math.hypot(b.at[0] - from.x, b.at[1] - from.z) - (toward > 0.35 ? 8 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  private startDash(h: Hen, from: THREE.Vector3): void {
    h.bale = this.farthestBale(from, h.bale, h);
    h.state = "dash";
    h.dashes++;
    h.vy = 3;
    h.model.kick(-0.5);
    this.events.dash(h);
  }

  private dash(h: Hen, dt: number, p: Chaser): void {
    this.hideSpot(h, p.pos, this.tmp);
    const d = Math.hypot(this.tmp.x - h.x, this.tmp.z - h.z);
    h.yaw = turnToward(h.yaw, this.avoid(h, yawTo(h.x, h.z, this.tmp.x, this.tmp.z)), 9 * dt);
    this.move(h, GOLD_SPEED * (1 - 0.08 * h.dashes) * (1 - Math.min(this.playTime / 300, 0.2)), dt);
    if (d > 0.6) return;
    if (h.dashes >= 3) {
      // Worn out: she plops down right there and pants
      h.state = "tired";
      h.timer = 999;
      this.events.tired(h);
    } else h.state = "hide";
  }

  private catchHen(h: Hen): void {
    const from = new THREE.Vector3(h.x, h.y, h.z);
    const to = this.coop.doorPoint(new THREE.Vector3());
    const dist = from.distanceTo(to);
    h.flight = { from, to, t: 0, dur: 0.9 + dist * 0.035, apex: 2.0 + dist * 0.12 };
    h.state = "flying";
    h.speed = 0;
    h.model.kick(0.7);
    h.model.cluck(0.8);
    this.events.caught(h);
  }

  private fly(h: Hen, dt: number): void {
    const f = h.flight!;
    f.t = Math.min(1, f.t + dt / f.dur);
    const k = f.t;
    const px = h.x;
    const pz = h.z;
    h.x = THREE.MathUtils.lerp(f.from.x, f.to.x, k);
    h.z = THREE.MathUtils.lerp(f.from.z, f.to.z, k);
    h.y = THREE.MathUtils.lerp(f.from.y, f.to.y, k) + 4 * f.apex * k * (1 - k);
    if (Math.hypot(h.x - px, h.z - pz) > 1e-4) h.yaw = Math.atan2(h.x - px, h.z - pz);
    if (k < 1) return;
    h.state = "home";
    h.flight = null;
    h.seat = h.kind === "golden" ? GOLD_SEAT : SEAT_ORDER[Math.min(this.seated++, SEAT_ORDER.length - 1)];
    h.model.kick(0.8);
    h.model.cluck(0.6);
    this.events.home(h);
  }

  private sitHome(h: Hen, dt: number, t: number): void {
    this.coop.seat(h.seat, this.tmp);
    h.x = this.tmp.x;
    h.z = this.tmp.z;
    h.y = this.tmp.y;
    h.vy = 0;
    h.speed = 0;
    h.yaw = Math.sin(t * 0.7 + h.seed) * 0.35;
    h.look = Math.sin(t * 1.1 + h.seed * 3) > 0.8 ? 0.6 : Math.sin(t * 0.9 + h.seed) > 0.85 ? -0.6 : 0;
    if (Math.random() < dt * 0.08) h.model.cluck(0.3);
  }

  // ── Movement helpers ────────────────────────────────────────

  private slowDown(h: Hen, dt: number): void {
    this.move(h, 0, dt);
  }

  /** Turn a wished-for heading aside when a prop is in the way. */
  private avoid(h: Hen, yaw: number): number {
    const look = 1.0;
    const free = (a: number) => {
      const x = h.x + Math.sin(a) * look;
      const z = h.z + Math.cos(a) * look;
      return !this.colliders.hits(x, z, HEN_R) && this.inYard(x, z, 0.3);
    };
    if (free(yaw)) return yaw;
    const side = h.seed % 2 < 1 ? 1 : -1;
    for (const off of [0.7, 1.4, 2.1, 2.8]) {
      if (free(yaw + off * side)) return yaw + off * side;
      if (free(yaw - off * side)) return yaw - off * side;
    }
    return yaw;
  }

  private move(h: Hen, speed: number, dt: number): void {
    h.speed += (speed - h.speed) * Math.min(dt * 8, 1);
    if (h.speed < 0.01) return;
    const t = this.tmp.set(h.x + Math.sin(h.yaw) * h.speed * dt, 0, h.z + Math.cos(h.yaw) * h.speed * dt);
    // Reason: a bird in mid-flutter sails over props; on the ground it slides round them
    if (h.y < 0.3) this.colliders.resolve(t, HEN_R);
    h.x = THREE.MathUtils.clamp(t.x, YARD.minX + 0.35, YARD.maxX - 0.35);
    h.z = THREE.MathUtils.clamp(t.z, YARD.minZ + 0.35, YARD.maxZ - 0.35);
  }

  private air(h: Hen, dt: number): void {
    if (h.state === "flying" || h.state === "home") return;
    if (h.y <= 0 && h.vy <= 0) return;
    h.vy -= 16 * dt;
    h.y += h.vy * dt;
    if (h.y <= 0) {
      h.y = 0;
      h.vy = 0;
      h.model.kick(0.35);
    }
  }

  private inYard(x: number, z: number, margin: number): boolean {
    return x > YARD.minX + margin && x < YARD.maxX - margin && z > YARD.minZ + margin && z < YARD.maxZ - margin;
  }

  /** Hens on the ground nudge each other apart instead of overlapping. */
  private separate(): void {
    const ground = this.hens.filter((h) => h.loose);
    for (let i = 0; i < ground.length; i++) {
      for (let j = i + 1; j < ground.length; j++) {
        const a = ground[i];
        const b = ground[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.62 || d < 1e-4) continue;
        const push = (0.62 - d) / 2;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
      }
    }
  }

  private pose(h: Hen, dt: number): void {
    const home = h.state === "home";
    const air = h.y > 0.05 || h.state === "flying";
    const sitting = h.state === "tired" || home;
    h.sit += ((sitting ? 1 : 0) - h.sit) * Math.min(dt * 8, 1);
    const flap = h.state === "flying" ? 1 : air ? 0.9 : h.state === "dash" ? 0.6 : h.state === "flee" && h.speed > 3.8 ? 0.4 : 0;
    const root = h.model.root;
    root.position.set(h.x, h.y, h.z);
    root.rotation.y = h.yaw;
    root.scale.setScalar(h.scale * (home ? 0.72 : 1));
    h.model.update(dt, { speed: air ? 0 : h.speed, flap, peck: h.peck, sit: h.sit, pant: h.state === "tired", look: h.look, air });
    h.shadow.visible = !home;
    h.shadow.position.set(h.x, 0.03, h.z);
    h.shadow.scale.setScalar(h.scale * THREE.MathUtils.clamp(1 - h.y / 4, 0.3, 1));
  }
}
