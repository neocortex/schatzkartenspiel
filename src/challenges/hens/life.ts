/**
 * Little living details of the farmyard: butterflies that flutter about and
 * land on the sunflower heads (and flutter off when Tadeo comes close), a
 * ginger cat asleep on a barrel with drowsy "z" letters floating up, and
 * warm pollen motes twinkling in the sunlight.
 */

import * as THREE from "three";
import { CritterMesh } from "../../world/ambient/CritterMesh";
import { butterflyModel, catModel } from "../../world/ambient/critterModels";
import { CAT_ANIM, FLAP_ANIM } from "../../world/ambient/critterAnims";
import { wingAtlas, WING_SPECIES, glowTexture } from "../../world/ambient/textures";
import { BILLBOARD_GLSL, particleMaterial, particleMesh, quadGeometry } from "../../world/ambient/particles";
import { GLOW_FRAG } from "../../world/ambient/Smoke";
import { rnd, turnToward, wrapAngle, yawTo } from "../../world/ambient/spawn";
import { Disposable } from "./dispose";
import { YARD } from "./layout";

const BUTTERFLIES = 9;

interface Butterfly {
  x: number;
  y: number;
  z: number;
  yaw: number;
  seed: number;
  flap: number;
  timer: number;
  /** Index of the flower it rests on, or -1 while flying. */
  perch: number;
  target: number;
}

const MOTE_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aSeed;
varying vec2 vUv;
varying vec3 vColor;
${BILLBOARD_GLSL}
void main() {
  float s = aSeed.w;
  vec3 p = aSeed.xyz + vec3(sin(uTime * 0.31 + s * 20.0) * 1.4 + uTime * 0.12, sin(uTime * 0.5 + s * 30.0) * 0.35, cos(uTime * 0.27 + s * 13.0) * 1.2);
  p.x = mod(p.x + 16.0, 32.0) - 16.0;
  float twinkle = pow(0.5 + 0.5 * sin(uTime * (1.0 + 2.2 * hash11(s + 2.0)) + s * 50.0), 10.0);
  vColor = vec3(1.0, 0.88, 0.55) * (0.1 + twinkle * 2.4);
  vUv = uv;
  gl_Position = billboard(p, 0.05 + 0.09 * twinkle);
}`;

export class FarmLife {
  readonly group = new THREE.Group();
  private butterflies: Butterfly[] = [];
  private wings: CritterMesh;
  private cat: CritterMesh;
  private catAt: THREE.Vector3;
  private zzz: THREE.Sprite[] = [];
  private motes: THREE.Mesh;
  private motesTime = { value: 0 };

  /**
   * @param flowers World positions of the sunflower heads (landing spots).
   * @param catAt Top centre of the cat's barrel.
   */
  constructor(private flowers: THREE.Vector3[], catAt: THREE.Vector3, owned: Disposable[]) {
    this.wings = new CritterMesh({
      name: "hens-butterflies",
      geometry: butterflyModel(),
      count: BUTTERFLIES,
      animate: FLAP_ANIM,
      castShadow: true,
      doubleSided: true,
      selfLit: 0.35,
      atlas: { map: wingAtlas(), columns: WING_SPECIES },
    });
    this.cat = new CritterMesh({ name: "hens-cat", geometry: catModel(), count: 1, animate: CAT_ANIM, castShadow: true, selfLit: 0.12 });
    for (const c of [this.wings, this.cat]) {
      const m = c.mesh;
      owned.push(m.material as THREE.Material);
      if (m.customDepthMaterial) owned.push(m.customDepthMaterial);
    }
    this.group.add(this.wings.mesh, this.cat.mesh);
    this.catAt = catAt.clone();

    for (let i = 0; i < BUTTERFLIES; i++) {
      const f = flowers[i % flowers.length];
      this.butterflies.push({ x: f.x + rnd(-2, 2), y: 1.2 + rnd(0, 1), z: f.z + rnd(1, 3), yaw: rnd(-3, 3), seed: Math.random() * 100, flap: 0, timer: rnd(2, 8), perch: -1, target: i % flowers.length });
      this.wings.setLook(i, new THREE.Color(1, 1, 1), i % WING_SPECIES);
    }

    const zTex = this.letterTexture(owned);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false }));
      owned.push(s.material);
      this.zzz.push(s);
      this.group.add(s);
    }

    const seeds = new Float32Array(180 * 4);
    for (let i = 0; i < 180; i++) seeds.set([rnd(YARD.minX - 4, YARD.maxX + 4), 0.4 + Math.random() ** 2 * 3.5, rnd(YARD.minZ - 3, YARD.maxZ), Math.random() * 100], i * 4);
    const mat = particleMaterial({
      uniforms: { uTime: this.motesTime, uTex: { value: glowTexture() } },
      vertexShader: MOTE_VERT,
      fragmentShader: GLOW_FRAG,
      additive: true,
    });
    this.motes = particleMesh(quadGeometry(180, { aSeed: [seeds, 4] }), mat, 3);
    this.group.add(this.motes);
  }

  private letterTexture(owned: Disposable[]): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const g = canvas.getContext("2d")!;
    g.font = "600 52px Fredoka, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 8;
    g.strokeStyle = "#5e3a1f";
    g.strokeText("z", 32, 34);
    g.fillStyle = "#ffffff";
    g.fillText("z", 32, 34);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    owned.push(tex);
    return tex;
  }

  update(dt: number, time: number, player: THREE.Vector3): void {
    this.butterflies.forEach((b, i) => this.stepButterfly(b, i, dt, time, player));
    this.wings.commit();
    const c = this.catAt;
    // Reason: yaw 0.6 turns the curled-up face towards the camera
    this.cat.set(0, c.x, c.y, c.z, 0.6, 0, 0, time * 1.6, 1.25);
    this.cat.commit();
    this.zzz.forEach((s, i) => {
      const k = (time * 0.32 + i / 3) % 1;
      s.position.set(c.x + 0.3 + Math.sin(k * 6 + i) * 0.15, c.y + 0.45 + k * 1.1, c.z + 0.2);
      s.scale.setScalar(0.18 + k * 0.22);
      s.material.opacity = Math.sin(k * Math.PI);
    });
    this.motesTime.value = time;
  }

  private stepButterfly(b: Butterfly, i: number, dt: number, t: number, player: THREE.Vector3): void {
    let wing: number;
    let roll = 0;
    if (b.perch >= 0) {
      const f = this.flowers[b.perch];
      b.x = f.x;
      b.y = f.y + 0.12;
      b.z = f.z + 0.05;
      // Basking: wings open and close slowly
      wing = 0.75 + 0.65 * Math.sin(t * 1.3 + b.seed);
      b.timer -= dt;
      if (b.timer <= 0 || Math.hypot(b.x - player.x, b.z - player.z) < 2.2) {
        b.perch = -1;
        b.timer = rnd(5, 12);
        b.target = Math.floor(Math.random() * this.flowers.length);
        b.y += 0.2;
      }
    } else {
      const f = this.flowers[b.target];
      const s = b.seed;
      const wander = (Math.sin(t * 1.7 + s * 10) * 1.3 + Math.sin(t * 0.63 + s * 3) * 0.9) * 1.6;
      let yaw = b.yaw + wander * dt;
      const d = Math.hypot(f.x - b.x, f.z - b.z);
      b.timer -= dt;
      // Head for the chosen flower once the wandering is done (or when straying too far)
      if (b.timer <= 0 || d > 9) yaw = turnToward(yaw, yawTo(b.x, b.z, f.x, f.z), 2.5 * dt);
      b.yaw = wrapAngle(yaw);
      const speed = 1.4 + 0.4 * Math.sin(t * 0.8 + s);
      b.x += Math.sin(b.yaw) * speed * dt;
      b.z += Math.cos(b.yaw) * speed * dt;
      const landing = b.timer <= 0 && d < 1.2;
      const targetY = landing ? f.y + 0.12 : 1.0 + 0.6 * Math.sin(t * 0.9 + s * 7);
      b.y += (targetY - b.y) * Math.min(dt * (landing ? 3 : 1.5), 1);
      b.flap += dt * Math.PI * 2 * 7.5;
      wing = 0.55 + 0.9 * Math.sin(b.flap);
      roll = THREE.MathUtils.clamp(-wander * 0.08, -0.5, 0.5);
      if (b.timer <= 0 && d < 0.25) {
        b.perch = b.target;
        b.timer = rnd(4, 10);
      }
    }
    const bob = b.perch >= 0 ? 0 : Math.sin(b.flap) * 0.07;
    this.wings.set(i, b.x, b.y + bob, b.z, b.perch >= 0 ? 0.4 : b.yaw, b.perch >= 0 ? -0.3 : 0.18, roll, wing, 1.25);
  }
}
