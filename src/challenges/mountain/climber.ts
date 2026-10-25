/**
 * Climber — Tadeo's 2.5D platforming controller for the mountain: walks
 * along the path (s) with arrow keys, jumps with Space (coyote time and jump
 * buffering keep it forgiving for small hands), steps up small ledges, is
 * stopped by higher ones, climbs ladders and tumbles when hit. It drives the
 * shared Humanoid avatar and a blob shadow in world space.
 */

import * as THREE from "three";
import { Humanoid, blobShadow } from "../../characters/Humanoid";
import { createTadeo } from "../../characters/cast";
import { Input } from "../../core/Input";
import { Course, Ladder } from "./course";
import { ladderRadius, LADDER_BACK } from "./platforms";

const SPEED = 5.6;
const JUMP = 8.3;
const GRAVITY = 24;
/** Ledges up to this height are walked up without jumping. */
export const STEP_UP = 0.45;
/** Half body width used against walls. */
const BODY = 0.26;
/** Half foot span: Tadeo can stand with his centre this far past an edge. */
const FOOT = 0.34;
const COYOTE = 0.14;
const BUFFER = 0.16;
const CLIMB_SPEED = 2.8;

export type ClimbMode = "walk" | "climb" | "ouch" | "auto";

export class Climber {
  readonly avatar: Humanoid;
  readonly shadow = blobShadow(0.5);
  /** World position of Tadeo's feet. */
  readonly position = new THREE.Vector3();
  s = 0;
  y = 0;
  vs = 0;
  vy = 0;
  grounded = true;
  mode: ClimbMode = "walk";
  /** Facing along the path: +1 forward (right on screen), -1 back. */
  dir = 1;
  /** Seconds of blinking invulnerability left. */
  invulnerable = 0;
  /** Last spot on solid ground away from any edge (respawn after a fall). */
  safeS = 0;
  safeY = 0;
  ladder: Ladder | null = null;
  /** Called once when Tadeo has fallen well below the last safe ground. */
  onFall: (() => void) | null = null;
  radius = 0;
  private visualY = 0;
  private coyote = 0;
  private buffer = 0;
  /** True while airborne from a jump (or a bounce), false after walking off an edge. */
  private jumped = false;
  private climbPhase = 0;
  private spin = 0;
  /** True on the frame Tadeo touched down (for dust puffs and a thud). */
  landed = false;
  private tmp = new THREE.Vector3();

  constructor(private course: Course) {
    this.avatar = createTadeo();
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.avatar.root, this.shadow);
  }

  teleport(s: number, y = this.course.support(s, FOOT)): void {
    this.s = this.safeS = s;
    this.y = this.visualY = this.safeY = y;
    this.vs = this.vy = 0;
    this.grounded = true;
    this.mode = "walk";
    this.dir = 1;
    this.spin = 0;
    this.jumped = false;
    this.ladder = null;
    this.radius = this.course.radius(y);
    this.sync(0);
  }

  /** Knock Tadeo back with a cartoon bounce (the caller respawns him afterwards). */
  ouch(fromDir: number): void {
    this.mode = "ouch";
    this.vs = -fromDir * 3.2;
    this.vy = 6.5;
    this.grounded = false;
    this.jumped = true;
    this.ladder = null;
  }

  update(dt: number, input: Input | null): void {
    this.landed = false;
    if (this.mode === "climb") this.updateClimb(dt, input);
    else if (this.mode === "walk" || this.mode === "ouch") this.updateWalk(dt, this.mode === "walk" ? input : null);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.sync(dt);
  }

  private updateWalk(dt: number, input: Input | null): void {
    const c = this.course;
    const axis = input ? input.axis().x : 0;
    if (input?.consume("Space")) this.buffer = BUFFER;
    else this.buffer = Math.max(0, this.buffer - dt);

    // Horizontal: accelerate towards the input speed, slower in the air
    const target = axis * SPEED;
    const k = 1 - Math.exp(-dt * (this.grounded ? 14 : 6));
    if (this.mode === "walk") this.vs += (target - this.vs) * k;
    if (axis !== 0) this.dir = Math.sign(axis);

    // Ladders: push up (or into the wall) at a ladder's foot to start climbing
    const ladder = this.grounded ? c.ladderNear(this.s, this.y) : null;
    if (ladder && input && (input.isDown("ArrowUp") || (axis > 0 && this.s > ladder.s - LADDER_BACK - 0.5))) {
      this.mode = "climb";
      this.ladder = ladder;
      this.vs = 0;
      return;
    }

    // Move along the path, stopping at walls taller than a step (a little more slack in the air)
    const step = this.vs * dt;
    if (step !== 0) {
      const d = Math.sign(step);
      const lead = this.s + step + d * BODY;
      const wall = c.wall(this.s + d * BODY, lead, d, this.y + (this.grounded ? STEP_UP : STEP_UP + 0.2));
      if (wall !== null) {
        this.s = wall - d * (BODY + 0.001);
        this.vs = 0;
      } else {
        this.s += step;
      }
    }
    // Reason: the path's two ends are walls, so Tadeo can never walk or jump off the course's ends
    this.s = THREE.MathUtils.clamp(this.s, c.pieces[0].s0 + BODY, c.length - BODY);

    // Vertical
    const support = c.support(this.s, FOOT);
    if (this.grounded) {
      if (support >= this.y - 0.4 && support <= this.y + STEP_UP + 0.05) {
        this.y = support;
        this.coyote = COYOTE;
      } else {
        this.grounded = false;
        this.vy = 0;
      }
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
    }
    if (this.buffer > 0 && (this.grounded || this.coyote > 0) && this.mode === "walk") {
      this.vy = JUMP;
      this.jumped = true;
      this.grounded = false;
      this.coyote = 0;
      this.buffer = 0;
    }
    if (!this.grounded) {
      const prevY = this.y;
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      // Reason: land if the feet crossed the platform top this frame (or are just under its lip)
      // Reason: a jump may catch a ledge's lip, but walking off an edge must not glide over a gap
      const lip = this.jumped ? 0.3 : 0.04;
      if (this.vy <= 0 && this.y <= support && prevY >= support - lip) {
        this.jumped = false;
        this.y = support;
        this.vy = 0;
        this.grounded = true;
        this.landed = true;
        if (this.mode === "ouch") this.vs = 0;
      }
    }
    if (this.grounded && this.mode === "walk") this.trackSafeSpot();
    if (!this.grounded && this.y < this.safeY - 4.5 && this.mode === "walk") {
      this.mode = "auto";
      this.onFall?.();
    }
  }

  private trackSafeSpot(): void {
    const c = this.course;
    const solid = (s: number) => c.support(s, 0.05) > this.y - 0.5;
    if ([-1.1, -0.5, 0, 0.5, 1.1].every((d) => solid(this.s + d))) {
      this.safeS = this.s;
      this.safeY = this.y;
    }
  }

  private updateClimb(dt: number, input: Input | null): void {
    const l = this.ladder!;
    const ax = input ? input.axis() : { x: 0, y: 0 };
    const up = (input?.isDown("ArrowUp") ? 1 : 0) + Math.max(ax.x, 0);
    const down = (input?.isDown("ArrowDown") ? 1 : 0) + Math.max(-ax.x, 0);
    const v = (up > 0 ? 1 : 0) - (down > 0 && up === 0 ? 1 : 0);
    this.s += (l.s - LADDER_BACK - this.s) * Math.min(1, dt * 12);
    this.y += v * CLIMB_SPEED * dt;
    this.climbPhase += Math.abs(v) * dt * 9;
    input?.consume("Space");
    if (this.y <= l.yb) {
      this.y = l.yb;
      if (v < 0) this.mode = "walk";
    }
    if (this.y >= l.yt + 0.1) {
      // Over the top: step onto the upper ledge
      this.y = l.yt;
      this.s = l.s + 0.4;
      this.mode = "walk";
      this.grounded = true;
      this.vy = 0;
      this.ladder = null;
      this.dir = 1;
    }
  }

  /** Place the avatar and shadow in the world and animate the rig. */
  private sync(dt: number): void {
    const c = this.course;
    const climbing = this.mode === "climb" && this.ladder;
    const groundRef = this.grounded ? this.y : Math.max(c.support(this.s, FOOT), this.safeY - 2);
    const rTarget = climbing ? ladderRadius(c, this.ladder!.yt) + 0.36 : c.radius(Math.min(groundRef, this.y + 0.5));
    this.radius += (rTarget - this.radius) * (dt > 0 ? 1 - Math.exp(-dt * 9) : 1);
    // Reason: smooth the small snaps of stairs and step-ups so Tadeo doesn't teleport upward
    if (this.grounded && Math.abs(this.y - this.visualY) < 0.6) this.visualY += (this.y - this.visualY) * Math.min(1, dt * 16);
    else this.visualY = this.y;
    c.point(this.s, this.radius, this.visualY, this.position);

    const a = this.avatar;
    a.root.position.copy(this.position);
    if (climbing) {
      const n = c.normal(this.s, this.tmp);
      a.root.rotation.y = Math.atan2(-n.x, -n.z);
    } else {
      const t = c.tangent(this.s, this.tmp).multiplyScalar(this.dir);
      const target = Math.atan2(t.x, t.z);
      let d = target - a.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      a.root.rotation.y += d * (dt > 0 ? Math.min(1, dt * 14) : 1);
    }
    a.update(dt, { speed: this.mode === "walk" ? Math.abs(this.vs) : 0, grounded: this.grounded || !!climbing, vy: this.vy });
    if (climbing) this.climbPose();
    if (this.mode === "ouch") {
      this.spin += dt * 14;
      a.root.rotation.y += this.spin;
      a.armL.rotation.set(0, 0, -2.2);
      a.armR.rotation.set(0, 0, 2.2);
    } else {
      this.spin = 0;
    }
    a.root.visible = this.invulnerable <= 0 || Math.floor(this.invulnerable * 12) % 2 === 0;

    // Contact shadow on the platform below (none over a gap)
    const support = climbing ? this.ladder!.yb : c.support(this.s, FOOT);
    this.shadow.visible = support > -Infinity && this.y - support < 6;
    if (this.shadow.visible) {
      c.point(this.s, climbing ? this.radius : c.radius(support), support + 0.05, this.shadow.position);
      this.shadow.scale.setScalar(THREE.MathUtils.clamp(1 - (this.y - support) / 4, 0.35, 1));
    }
  }

  /** Hand-over-hand ladder climbing, layered over the idle pose. */
  private climbPose(): void {
    const a = this.avatar;
    const p = this.climbPhase;
    a.armL.rotation.set(-2.5 + Math.sin(p) * 0.45, 0, -0.15);
    a.armR.rotation.set(-2.5 - Math.sin(p) * 0.45, 0, 0.15);
    a.legL.rotation.x = -0.5 + Math.sin(p) * 0.5;
    a.legR.rotation.x = -0.5 - Math.sin(p) * 0.5;
    a.head.rotation.x = -0.35;
  }
}
