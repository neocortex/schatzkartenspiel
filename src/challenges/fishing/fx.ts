/**
 * Juicy water effects: splashes (droplets, mist and ripple rings), glitter
 * for catches, strings of bubbles rising from the reef, and star-shaped glints
 * twinkling on the sunny water. One-shot bursts reuse the cave's CPU particle
 * system; bubbles and glints are animated entirely in the vertex shader.
 */

import * as THREE from "three";
import { Bursts } from "../shared/bursts";
import { glowTexture } from "../../world/ambient/textures";
import { BILLBOARD_GLSL, particleMaterial, particleMesh, quadGeometry } from "../../world/ambient/particles";
import { SeaSurface, SeaUniforms } from "./water";

const BUBBLES = 70;
const GLINTS = 90;

/** White ring with a highlight: a soap-bubble sprite. */
function bubbleTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 18, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,0.08)");
  grad.addColorStop(0.75, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.95)";
  g.beginPath();
  g.arc(23, 22, 6, 0, Math.PI * 2);
  g.fill();
  return new THREE.CanvasTexture(c);
}

/** Four-pointed star glint. */
function starTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 14);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(255,255,255,0.95)";
  for (const [w, h] of [[3, 30], [30, 3]]) {
    g.beginPath();
    g.ellipse(32, 32, w, h, 0, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

const BUBBLE_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aSrc;   // x, floor y, z, phase
attribute vec2 aRate;  // rise speed, size
varying vec2 vUv;
varying float vAlpha;
${BILLBOARD_GLSL}
void main() {
  float span = -aSrc.y - 0.05;
  float t = mod(uTime * aRate.x + aSrc.w * span, span);
  vec3 p = vec3(aSrc.x + sin(uTime * 3.0 + aSrc.w * 9.0) * 0.05, aSrc.y + t, aSrc.z + cos(uTime * 2.6 + aSrc.w * 7.0) * 0.05);
  vAlpha = smoothstep(0.0, 0.2, t) * smoothstep(0.0, 0.25, -p.y);
  vUv = uv;
  gl_Position = billboard(p, aRate.y * (0.7 + t / span * 0.6));
}`;

const BUBBLE_FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 c = texture2D(uTex, vUv);
  gl_FragColor = vec4(mix(vec3(0.75, 1.0, 1.0), vec3(1.0), c.a), c.a * vAlpha * 0.8);
}`;

const GLINT_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aSeed;  // x, z, period, phase
varying vec2 vUv;
varying float vGlow;
${BILLBOARD_GLSL}
void main() {
  float cyc = uTime / aSeed.z + aSeed.w;
  float k = fract(cyc);
  float n = floor(cyc);
  // Reason: every twinkle cycle the glint hops to a new spot, so a few quads cover the whole glittering area
  vec2 jitter = vec2(hash11(n * 1.7 + aSeed.w * 13.0), hash11(n * 2.3 + aSeed.w * 29.0)) - 0.5;
  vec3 p = vec3(aSeed.x + jitter.x * 3.0, 0.04, aSeed.y + jitter.y * 3.0);
  vGlow = pow(sin(k * 3.14159), 6.0);
  vUv = rotateUv(uv, uTime * 0.6 + aSeed.w);
  gl_Position = billboard(p, 0.42 * vGlow + 0.001);
}`;

const GLINT_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uColor;
varying vec2 vUv;
varying float vGlow;
void main() {
  float a = texture2D(uTex, vUv).a;
  gl_FragColor = vec4(uColor * a * vGlow, 1.0);
}`;

export class WaterFx {
  readonly group = new THREE.Group();
  /** Droplets and mist (normal blending). */
  readonly drops: Bursts;
  /** Glitter and stars (additive). */
  readonly sparks: Bursts;
  private materials: THREE.ShaderMaterial[] = [];
  private textures: THREE.Texture[] = [];

  constructor(private surface: SeaSurface, sea: SeaUniforms, bubbleSources: THREE.Vector3[], sunDir: THREE.Vector3) {
    const glow = glowTexture();
    this.drops = new Bursts(glow, false);
    this.sparks = new Bursts(glow, true);
    this.group.add(this.drops.mesh, this.sparks.mesh);

    // Bubble strings rising from the reef
    const src = new Float32Array(BUBBLES * 4);
    const rate = new Float32Array(BUBBLES * 2);
    for (let i = 0; i < BUBBLES; i++) {
      const s = bubbleSources[i % bubbleSources.length];
      src.set([s.x + (Math.random() - 0.5) * 0.15, s.y, s.z + (Math.random() - 0.5) * 0.15, Math.random()], i * 4);
      rate.set([0.35 + Math.random() * 0.35, 0.05 + Math.random() * 0.06], i * 2);
    }
    const bubbleTex = bubbleTexture();
    const bubbleMat = particleMaterial({ uniforms: { uTime: sea.uTime, uTex: { value: bubbleTex } }, vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG });
    this.group.add(particleMesh(quadGeometry(BUBBLES, { aSrc: [src, 4], aRate: [rate, 2] }), bubbleMat, 2));

    // Sun glints: denser along the glitter path between the jetty and the sun
    const seeds = new Float32Array(GLINTS * 4);
    const toSun = new THREE.Vector2(sunDir.x, sunDir.z).normalize();
    for (let i = 0; i < GLINTS; i++) {
      const along = 4 + Math.pow(Math.random(), 0.7) * 40;
      const side = (Math.random() - 0.5) * (6 + along * 0.4);
      seeds.set([toSun.x * along - toSun.y * side, toSun.y * along + toSun.x * side, 0.8 + Math.random() * 1.6, Math.random() * 10], i * 4);
    }
    const starTex = starTexture();
    const glintMat = particleMaterial({
      uniforms: { uTime: sea.uTime, uTex: { value: starTex }, uColor: { value: new THREE.Color(2.4, 2.1, 1.6) } },
      vertexShader: GLINT_VERT,
      fragmentShader: GLINT_FRAG,
      additive: true,
    });
    this.group.add(particleMesh(quadGeometry(GLINTS, { aSeed: [seeds, 4] }), glintMat, 3));
    this.materials.push(bubbleMat, glintMat);
    this.textures.push(bubbleTex, starTex);
  }

  /** Splash where something hits or leaves the water; power ~0.3 (nibble) … 1.5 (leaping fish). */
  splash(at: THREE.Vector3, power: number): void {
    this.surface.ripple(at.x, at.z, Math.min(1.6, 0.35 + power * 0.8));
    const p = new THREE.Vector3(at.x, 0.05, at.z);
    this.drops.emit(p, {
      count: Math.round(10 + power * 26),
      color: "#e8fbff",
      speed: [0.6 * power + 0.4, 1.8 * power + 0.8],
      up: 1.6 + power * 2.2,
      life: [0.45, 0.9],
      size: [0.07, 0.16],
      grow: 0.6,
      gravity: 9,
      drag: 0.6,
      spread: 0.15,
    });
    if (power > 0.6) {
      this.drops.emit(p, { count: 8, color: "#ffffff", speed: [0.3, 0.8], up: 0.6, life: [0.5, 0.9], size: [0.25, 0.4], grow: 2.2, drag: 2.5, flat: true });
    }
  }

  /** A shower of glitter (catches, the golden fish). */
  sparkle(at: THREE.Vector3, color: THREE.ColorRepresentation, count = 30, speed = 2.5): void {
    this.sparks.emit(at, { count, color: new THREE.Color(color).multiplyScalar(2.2), speed: [speed * 0.4, speed], up: 0.8, life: [0.5, 1.2], size: [0.07, 0.17], gravity: 1.5, drag: 1.4, spread: 0.2 });
  }

  update(dt: number): void {
    this.drops.update(dt);
    this.sparks.update(dt);
  }

  dispose(): void {
    this.drops.dispose();
    this.sparks.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
