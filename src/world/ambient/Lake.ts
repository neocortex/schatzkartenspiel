/**
 * Life on the lake: every few seconds a fish leaps out of the water in an arc
 * (with expanding splash rings and a spray of droplets where it leaves and
 * re-enters), and dragonflies hover over the shallows, darting from spot to
 * spot. Splashes are GPU-animated from their start time; the CPU only
 * schedules them.
 */

import * as THREE from "three";
import { Heightfield } from "../Heightfield";
import { LANDMARKS } from "../layout";
import { WorldUniforms } from "../Terrain";
import { CritterMesh } from "./CritterMesh";
import { dragonflyModel, fishModel } from "./critterModels";
import { DRAGONFLY_ANIM, FISH_ANIM } from "./critterAnims";
import { BILLBOARD_GLSL, particleMaterial, particleMesh, quadGeometry, RENDER_ORDER } from "./particles";
import { glowTexture } from "./textures";
import { findSpot, rnd, turnToward, yawTo } from "./spawn";

const SPLASHES = 8;
const RINGS_PER_SPLASH = 2;
const DROPS_PER_SPLASH = 12;
const FISH = 2;
const DRAGONFLIES = 7;
const LAKE_RADIUS = 18;

const RING_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aSplash;  // x, z, start time, strength
attribute float aDelay;
varying vec2 vUv;
varying float vAge;
void main() {
  float age = (uTime - aSplash.z - aDelay) / 1.5;
  float alive = step(0.0, age) * step(age, 1.0);
  float r = mix(0.2, 1.7, sqrt(clamp(age, 0.0, 1.0))) * aSplash.w;
  // Quad spans 1.25 × the ring radius each way; the ring itself is drawn in the fragment shader
  vec3 p = vec3(aSplash.x, 0.16, aSplash.y) + vec3(position.x, 0.0, -position.y) * r * 2.5 * alive;
  vAge = age;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vAge;
void main() {
  float d = length(vUv - 0.5) * 2.5;
  float ring = smoothstep(0.16, 0.0, abs(d - 1.0));
  float a = ring * pow(1.0 - clamp(vAge, 0.0, 1.0), 1.5) * 0.85;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(1.25), a);
}
`;

const DROP_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aSplash;  // x, z, start time, strength
attribute vec4 aDrop;    // launch angle, lateral speed, up speed, size
varying vec2 vUv;
varying vec3 vColor;
${BILLBOARD_GLSL}
void main() {
  float t = uTime - aSplash.z;
  vec3 p = vec3(aSplash.x, 0.1, aSplash.y);
  p.xz += vec2(cos(aDrop.x), sin(aDrop.x)) * aDrop.y * t;
  p.y += aDrop.z * aSplash.w * t - 4.9 * t * t;
  float alive = step(0.0, t) * step(0.0, p.y);
  vColor = vec3(1.2);
  vUv = uv;
  gl_Position = billboard(p, aDrop.w * alive);
}
`;

const DROP_FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float a = texture2D(uTex, vUv).a;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

interface Jump {
  active: boolean;
  start: number;
  x: number;
  z: number;
  yaw: number;
  length: number;
  height: number;
  duration: number;
  splashedIn: boolean;
}

interface Dragonfly {
  x: number;
  y: number;
  z: number;
  yaw: number;
  tx: number;
  ty: number;
  tz: number;
  hold: number;
  flutter: number;
  seed: number;
}

export class Lake {
  readonly group = new THREE.Group();
  private splashData: THREE.InstancedBufferAttribute[] = [];
  private nextSplash = 0;
  private fishMesh: CritterMesh;
  private jumps: Jump[] = [];
  private nextJump = 2;
  private flyMesh: CritterMesh;
  private flies: Dragonfly[] = [];
  private spot = new THREE.Vector2();
  private readonly cx = LANDMARKS.lake[0];
  private readonly cz = LANDMARKS.lake[1];

  constructor(
    private hf: Heightfield,
    world: WorldUniforms,
  ) {
    this.buildSplashes(world);
    this.fishMesh = new CritterMesh({ name: "fish", geometry: fishModel(), count: FISH, animate: FISH_ANIM, doubleSided: true, selfLit: 0.2 });
    this.flyMesh = new CritterMesh({ name: "dragonflies", geometry: dragonflyModel(), count: DRAGONFLIES, animate: DRAGONFLY_ANIM, doubleSided: true, selfLit: 0.15 });
    this.group.add(this.fishMesh.mesh, this.flyMesh.mesh);

    const fishTints = [new THREE.Color(1.0, 0.5, 0.12), new THREE.Color(1.0, 0.8, 0.3)];
    for (let i = 0; i < FISH; i++) {
      this.jumps.push({ active: false, start: 0, x: 0, z: 0, yaw: 0, length: 0, height: 0, duration: 1, splashedIn: false });
      this.fishMesh.setLook(i, fishTints[i % fishTints.length]);
    }
    const flyTints = [new THREE.Color(0.2, 0.55, 1.0), new THREE.Color(0.2, 0.85, 0.45), new THREE.Color(1.0, 0.3, 0.25)];
    for (let i = 0; i < DRAGONFLIES; i++) {
      const f: Dragonfly = { x: 0, y: 0, z: 0, yaw: 0, tx: 0, ty: 0, tz: 0, hold: 0, flutter: 0, seed: Math.random() * 100 };
      this.pickTarget(f);
      f.x = f.tx;
      f.y = f.ty;
      f.z = f.tz;
      this.flies.push(f);
      this.flyMesh.setLook(i, flyTints[i % flyTints.length]);
    }
  }

  private buildSplashes(world: WorldUniforms): void {
    const ringSplash = new Float32Array(SPLASHES * RINGS_PER_SPLASH * 4);
    const delays = new Float32Array(SPLASHES * RINGS_PER_SPLASH);
    for (let i = 0; i < delays.length; i++) delays[i] = (i % RINGS_PER_SPLASH) * 0.35;
    const rings = quadGeometry(SPLASHES * RINGS_PER_SPLASH, { aSplash: [ringSplash, 4], aDelay: [delays, 1] });

    const dropSplash = new Float32Array(SPLASHES * DROPS_PER_SPLASH * 4);
    const drop = new Float32Array(SPLASHES * DROPS_PER_SPLASH * 4);
    for (let i = 0; i < SPLASHES * DROPS_PER_SPLASH; i++) {
      drop.set([Math.random() * Math.PI * 2, rnd(0.4, 1.6), rnd(2.2, 4.2), rnd(0.1, 0.18)], i * 4);
    }
    const drops = quadGeometry(SPLASHES * DROPS_PER_SPLASH, { aSplash: [dropSplash, 4], aDrop: [drop, 4] });
    // Reason: park unused slots far in the past so nothing shows before the first jump
    ringSplash.fill(-1000);
    dropSplash.fill(-1000);

    const ringMat = particleMaterial({ uniforms: { uTime: world.uTime }, vertexShader: RING_VERT, fragmentShader: RING_FRAG });
    const dropMat = particleMaterial({
      uniforms: { uTime: world.uTime, uTex: { value: glowTexture() } },
      vertexShader: DROP_VERT,
      fragmentShader: DROP_FRAG,
    });
    this.group.add(particleMesh(rings, ringMat, RENDER_ORDER.smoke), particleMesh(drops, dropMat, RENDER_ORDER.smoke));
    this.splashData = [rings.attributes.aSplash, drops.attributes.aSplash] as THREE.InstancedBufferAttribute[];
  }

  /** Start a splash (rings + droplets) at a point on the water. */
  private splash(x: number, z: number, time: number, strength: number): void {
    const slot = this.nextSplash;
    this.nextSplash = (slot + 1) % SPLASHES;
    const [rings, drops] = this.splashData;
    for (let k = 0; k < RINGS_PER_SPLASH; k++) rings.setXYZW(slot * RINGS_PER_SPLASH + k, x, z, time, strength);
    for (let k = 0; k < DROPS_PER_SPLASH; k++) drops.setXYZW(slot * DROPS_PER_SPLASH + k, x, z, time, strength);
    rings.needsUpdate = true;
    drops.needsUpdate = true;
  }

  private isDeepWater = (x: number, z: number): boolean => this.hf.heightAt(x, z) < -1.2;

  update(dt: number, time: number): void {
    this.updateFish(dt, time);
    this.updateDragonflies(dt, time);
  }

  private updateFish(dt: number, time: number): void {
    this.nextJump -= dt;
    if (this.nextJump <= 0) {
      this.nextJump = rnd(2.5, 6);
      const j = this.jumps.find((q) => !q.active);
      if (j && findSpot(this.cx, this.cz, 0, 11, 8, this.isDeepWater, this.spot)) {
        Object.assign(j, {
          active: true,
          start: time,
          x: this.spot.x,
          z: this.spot.y,
          yaw: Math.random() * Math.PI * 2,
          length: rnd(1.4, 2.4),
          height: rnd(0.8, 1.4),
          duration: rnd(0.8, 1.05),
          splashedIn: false,
        });
        this.splash(j.x, j.z, time, 0.8);
      }
    }
    this.jumps.forEach((j, i) => {
      if (!j.active) {
        this.fishMesh.hide(i);
        return;
      }
      const u = (time - j.start) / j.duration;
      if (u >= 1) {
        j.active = false;
        this.fishMesh.hide(i);
        return;
      }
      const fx = Math.sin(j.yaw);
      const fz = Math.cos(j.yaw);
      const d = (u - 0.5) * j.length;
      // Parabolic arc that starts and ends a little below the surface
      const y = 4 * j.height * u * (1 - u) - 0.25;
      const pitch = Math.atan2(4 * j.height * (1 - 2 * u), j.length);
      if (u > 0.92 && !j.splashedIn) {
        j.splashedIn = true;
        this.splash(j.x + fx * j.length * 0.5, j.z + fz * j.length * 0.5, time, 1);
      }
      this.fishMesh.set(i, j.x + fx * d, y, j.z + fz * d, j.yaw, pitch, Math.sin(u * 6) * 0.3, time * 22, 1.8);
    });
    this.fishMesh.commit();
  }

  /** Choose the next hover spot over the shallows near the shore. */
  private pickTarget(f: Dragonfly): void {
    const shallow = (x: number, z: number) => {
      const h = this.hf.heightAt(x, z);
      return h < 0.3 && h > -1.6;
    };
    if (findSpot(this.cx, this.cz, 8, LAKE_RADIUS, 10, shallow, this.spot)) {
      f.tx = this.spot.x;
      f.tz = this.spot.y;
      f.ty = rnd(0.6, 1.5);
    }
    f.hold = rnd(0.6, 2.5);
  }

  private updateDragonflies(dt: number, time: number): void {
    this.flies.forEach((f, i) => {
      const dx = f.tx - f.x;
      const dy = f.ty - f.y;
      const dz = f.tz - f.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 0.05) {
        // Darting: fast straight dashes that brake hard on arrival
        const step = Math.min(dist, Math.min(7, dist * 4) * dt);
        f.x += (dx / dist) * step;
        f.y += (dy / dist) * step;
        f.z += (dz / dist) * step;
        f.yaw = turnToward(f.yaw, yawTo(f.x, f.z, f.tx, f.tz), 12 * dt);
      } else {
        f.hold -= dt;
        if (f.hold <= 0) {
          // Hop to a nearby spot most of the time, otherwise anywhere along the shore
          if (Math.random() < 0.7) {
            const a = Math.random() * Math.PI * 2;
            f.tx = f.x + Math.cos(a) * rnd(1.5, 4);
            f.tz = f.z + Math.sin(a) * rnd(1.5, 4);
            f.ty = rnd(0.6, 1.5);
            f.hold = rnd(0.5, 2.5);
            if (this.hf.heightAt(f.tx, f.tz) > 0.3) this.pickTarget(f);
          } else this.pickTarget(f);
        }
      }
      f.flutter += dt * 31;
      const hover = Math.sin(time * 3 + f.seed) * 0.05;
      this.flyMesh.set(i, f.x, f.y + hover, f.z, f.yaw, 0.05, 0, f.flutter, 1.6);
    });
    this.flyMesh.commit();
  }
}
