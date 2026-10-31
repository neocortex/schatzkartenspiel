/**
 * TabletRunes — the carved runes of the three lake tablets. They start as dark
 * grooves in the stone. `light` wakes one with a bright flash and a fountain of
 * sparkles; afterwards it glows and pulses like every other rune.
 */

import * as THREE from "three";
import { BILLBOARD_GLSL, particleMesh, quadGeometry } from "./ambient/particles";

/** How much of its colour a sleeping rune shows. */
const ASLEEP = 0.03;
/** Where the flash ends: about the mean of the pulse that takes over. */
const AWAKE = 0.86;
const FLASH_PEAK = 5;
const FLASH_UP = 0.16;
const FLASH_DOWN = 1.1;
const SPARKS = 30;
const SPARK_SECONDS = 2.2;
/** After the sprites and smoke, like the other glows. */
const SPARK_ORDER = 4;

const SPARK_VERT = /* glsl */ `
uniform float uAge;
uniform float uHeight;
attribute vec4 aSeed; // start across the face, start height, speed, delay
varying vec2 vUv;
varying float vLife;
${BILLBOARD_GLSL}
void main() {
  vUv = uv;
  float t = max(uAge - aSeed.w, 0.0);
  vLife = clamp(t / 1.4, 0.0, 1.0);
  // Reason: the sparks start on the face of the tablet, which looks along +z, and drift out and up before they fall
  vec3 start = vec3((aSeed.x - 0.5) * 1.5, 0.5 + aSeed.y * (uHeight - 0.9), 0.3);
  vec3 velocity = vec3((hash11(aSeed.x * 91.0) - 0.5) * 1.1, 0.5 + aSeed.z, 0.3 + hash11(aSeed.y * 57.0) * 0.9);
  vec3 local = start + velocity * t - vec3(0.0, 0.8 * t * t, 0.0);
  float size = (0.16 + 0.16 * hash11(aSeed.z * 31.0)) * (1.0 - vLife * 0.5);
  gl_Position = billboard((modelMatrix * vec4(local, 1.0)).xyz, size);
}
`;

const SPARK_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vLife;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  // Reason: a round core with a thin cross makes it a twinkle, not a dot
  float core = pow(max(1.0 - length(p), 0.0), 2.0);
  float rays = max(1.0 - abs(p.x) * 9.0, 0.0) * max(1.0 - abs(p.y), 0.0) + max(1.0 - abs(p.y) * 9.0, 0.0) * max(1.0 - abs(p.x), 0.0);
  float fade = smoothstep(0.0, 0.1, vLife) * (1.0 - smoothstep(0.45, 1.0, vLife));
  float strength = (core * 1.3 + rays * 0.9) * fade * step(0.0001, vLife);
  gl_FragColor = vec4(uColor * strength, strength);
  #include <colorspace_fragment>
}
`;

/** Brightness of a rune `age` seconds after it was lit: a sudden flash that settles. */
function flashGain(age: number): number {
  if (age < FLASH_UP) return THREE.MathUtils.lerp(ASLEEP, FLASH_PEAK, age / FLASH_UP);
  const k = Math.min((age - FLASH_UP) / FLASH_DOWN, 1);
  return THREE.MathUtils.lerp(FLASH_PEAK, AWAKE, 1 - (1 - k) ** 2);
}

interface Tablet {
  runes: THREE.Mesh;
  flash: THREE.MeshBasicMaterial;
  sparks: THREE.Mesh;
  age: { value: number };
  /** Seconds since the tablet was lit; -1 while it sleeps. */
  lit: number;
}

export class TabletRunes {
  readonly group = new THREE.Group();
  private tablets: Tablet[] = [];

  /** @param awake The material a lit rune settles into (the shared pulsing glow). */
  constructor(private awake: THREE.Material) {}

  /**
   * Put a tablet's runes in place, asleep.
   * @param runes Rune geometry in the tablet's own frame.
   * @param height Height of the tablet's face, so the sparkles start on it.
   */
  add(runes: THREE.BufferGeometry, x: number, y: number, z: number, rotY: number, height: number, color: THREE.Color): void {
    const flash = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color().setScalar(ASLEEP) });
    const mesh = new THREE.Mesh(runes, flash);
    mesh.name = "tablet-runes";
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;

    const seeds = new Float32Array(SPARKS * 4);
    for (let i = 0; i < SPARKS; i++) seeds.set([Math.random(), Math.random(), Math.random() * 1.1, Math.random() * 0.5], i * 4);
    const age = { value: 0 };
    const sparks = particleMesh(
      quadGeometry(SPARKS, { aSeed: [seeds, 4] }),
      new THREE.ShaderMaterial({
        uniforms: { uAge: age, uHeight: { value: height }, uColor: { value: color } },
        vertexShader: SPARK_VERT,
        fragmentShader: SPARK_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
      SPARK_ORDER,
    );
    sparks.name = "tablet-sparks";
    sparks.position.copy(mesh.position);
    sparks.rotation.y = rotY;
    sparks.visible = false;

    this.group.add(mesh, sparks);
    this.tablets.push({ runes: mesh, flash, sparks, age, lit: -1 });
  }

  /** Wake a tablet; one that is already lit stays as it is. */
  light(i: number): void {
    const t = this.tablets[i];
    if (!t || t.lit >= 0) return;
    t.lit = 0;
    t.sparks.visible = true;
  }

  /** A tablet lit on an earlier day of the story: awake at once, with no flash and no sparks. */
  wake(i: number): void {
    const t = this.tablets[i];
    if (!t || t.lit >= 0) return;
    t.lit = FLASH_UP + FLASH_DOWN;
  }

  isLit(i: number): boolean {
    return (this.tablets[i]?.lit ?? -1) >= 0;
  }

  update(dt: number): void {
    for (const t of this.tablets) {
      if (t.lit < 0) continue;
      t.lit += dt;
      t.age.value = t.lit;
      if (t.sparks.visible && t.lit > SPARK_SECONDS) t.sparks.visible = false;
      if (t.runes.material !== t.flash) continue;
      if (t.lit < FLASH_UP + FLASH_DOWN) {
        t.flash.color.setScalar(flashGain(t.lit));
      } else {
        t.runes.material = this.awake;
        t.flash.dispose();
      }
    }
  }
}
