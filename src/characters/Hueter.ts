/**
 * The Hüter: the ghost of the old guardian. He has the face of the giant stone
 * head in the jungle, on a robe that thins into a swirling tail. He is a ghost
 * and has no hands, so his sleeves simply fade away.
 *
 * The body is one see-through shell, pale in the middle and bright at the edges.
 * A depth-only pass draws first, so only his front-most surface shows and he
 * reads as one glassy figure instead of a tangle of inner faces. The root's y is
 * the water line: the figure dissolves below it. He stays hidden until `rise()`,
 * and both `rise()` and `fade()` need `update()` running.
 */

import * as THREE from "three";
import { merge, part } from "../core/geo";
import { BILLBOARD_GLSL, particleMesh, quadGeometry } from "../world/ambient/particles";
import { ball, withSway } from "../world/models/shapes";
import { stoneHead } from "../world/models/regionSites";

const RISE_SECONDS = 3;
const FADE_SECONDS = 3;
const HEAD_Y = 3.05;
const HEAD_SCALE = 0.56;
/** Below this height (in the figure) the robe flows freely. */
const WAIST_Y = 2.3;
const MOTES = 22;
/** After the water (1) and the effects (up to 5): glow, then the depth pass, the shell and the sparkles. */
const ORDER = { glow: 6, depth: 7, shell: 8, motes: 9 };

const SHELL_VERT = /* glsl */ `
uniform float uTime;
attribute float aSway;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vColor;
varying float vSway;
varying float vY;
varying float vWorldY;
void main() {
  // Reason: the freer a part is, the further it drifts: the tail and the sleeve ends wave, the head stays still
  float free = aSway * aSway;
  vec3 p = position;
  p.x += sin(position.y * 1.7 - uTime * 1.5) * free * 0.55;
  p.z += cos(position.y * 1.3 - uTime * 1.15) * free * 0.42;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vNormal = normalMatrix * normal;
  vView = -mv.xyz;
  vColor = color;
  vSway = aSway;
  vY = position.y;
  vWorldY = (modelMatrix * vec4(p, 1.0)).y;
  gl_Position = projectionMatrix * mv;
}
`;

const SHELL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uWaterY;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vColor;
varying float vSway;
varying float vY;
varying float vWorldY;
void main() {
  // Reason: clamp the pow base; a slightly negative base is NaN on Metal
  float rim = pow(max(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 0.0), 1.9);
  // Reason: the vertex colour marks the face: 1 is ghost, 0 is dark ink (eyes, mouth), above 1 is a bright sparkle
  float ink = clamp(1.0 - vColor.r, 0.0, 1.0);
  float spark = clamp(vColor.r - 1.0, 0.0, 1.0);
  float shimmer = 0.9 + 0.1 * sin(vY * 5.0 - uTime * 2.2);
  float glowUp = mix(0.82, 1.15, smoothstep(1.0, 5.0, vY));
  vec3 col = mix(vec3(0.26, 0.68, 1.0) * glowUp, vec3(1.25, 1.5, 1.6), rim) * shimmer;
  // Reason: the head is a bit more solid than the robe, so his face stays readable against a busy background
  float alpha = mix(mix(0.48, 0.74, smoothstep(2.9, 3.3, vY)), 1.0, rim);
  col = mix(col, vec3(0.006, 0.03, 0.09), ink);
  alpha = mix(alpha, 0.95, ink);
  col = mix(col, vec3(2.2), spark);
  alpha = mix(alpha, 1.0, spark);
  alpha *= 1.0 - smoothstep(0.6, 1.0, vSway);
  alpha *= smoothstep(0.0, 0.7, vWorldY - uWaterY);
  gl_FragColor = vec4(col, alpha * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const FLAT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Soft light on the water under him, with slow rings; `uBurst` makes them bright while he rises. */
const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uBurst;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float glow = pow(max(1.0 - r, 0.0), 2.2) * 0.34;
  float rings = 0.0;
  for (int i = 0; i < 3; i++) {
    float at = fract(uTime * 0.28 + float(i) / 3.0);
    rings += smoothstep(0.035, 0.0, abs(r - at)) * (1.0 - at);
  }
  float strength = (glow + rings * mix(0.3, 1.1, uBurst)) * max(uOpacity, uBurst);
  gl_FragColor = vec4(vec3(0.55, 0.92, 1.0) * strength, strength);
  #include <colorspace_fragment>
}
`;

const HALO_VERT = /* glsl */ `
uniform float uSize;
varying vec2 vUv;
${BILLBOARD_GLSL}
void main() {
  vUv = uv;
  gl_Position = billboard((modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, uSize);
}
`;

const HALO_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float strength = pow(max(1.0 - r, 0.0), 2.0) * (0.42 + 0.06 * sin(uTime * 1.6)) * uOpacity;
  gl_FragColor = vec4(vec3(0.45, 0.82, 1.0) * strength, strength);
  #include <colorspace_fragment>
}
`;

const MOTE_VERT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
attribute vec4 aSeed; // phase, orbit radius, rise speed, size
varying vec2 vUv;
varying float vAlpha;
${BILLBOARD_GLSL}
void main() {
  vUv = uv;
  float life = fract(uTime * aSeed.z + aSeed.x);
  float a = aSeed.x * 6.2831 + uTime * 0.5 + life * 2.4;
  vec3 local = vec3(cos(a) * aSeed.y, 0.2 + life * 5.4, sin(a) * aSeed.y);
  vAlpha = sin(life * 3.1416) * uOpacity;
  gl_Position = billboard((modelMatrix * vec4(local, 1.0)).xyz, aSeed.w);
}
`;

const MOTE_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vAlpha;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float strength = pow(max(1.0 - r, 0.0), 2.0) * vAlpha;
  gl_FragColor = vec4(vec3(1.5, 1.9, 2.1) * strength, strength);
  #include <colorspace_fragment>
}
`;

const WHITE = new THREE.Color(1, 1, 1);
const INK = new THREE.Color(0, 0, 0);
const SPARK = new THREE.Color(2, 2, 2);

/** The whole figure as one mesh: stone-head face, robe and two sleeves that fade away. */
function figureGeometry(): THREE.BufferGeometry {
  const still = (g: THREE.BufferGeometry) => withSway(g, () => 0);

  const head = stoneHead(() => WHITE, INK, WHITE);
  // Reason: small sparkles in the dark eyes make him look alive and friendly instead of hollow
  const sparkles = [-1, 1].map((sx) => ball(0.065, SPARK, [sx * 0.55 - 0.05, 2.05, 1.09]));
  const headParts = [...head.solid, ...head.dark, ...sparkles].map((g) => {
    g.scale(HEAD_SCALE, HEAD_SCALE, HEAD_SCALE);
    g.translate(0, HEAD_Y, 0);
    return still(g);
  });

  const sleeves = [-1, 1].map((side) => {
    const shoulder = new THREE.Vector3(side * 0.72, 3.02, 0);
    const length = 1.85;
    // Reason: a bell sleeve pointing out and down; the fade hides its open end, so no hand is ever seen
    const geo = new THREE.CylinderGeometry(0.22, 0.46, length, 18, 8, true);
    const tilt = side * 0.72;
    const center = new THREE.Vector3(Math.sin(tilt), -Math.cos(tilt), 0.14).multiplyScalar(length / 2).add(shoulder);
    const sleeve = part(geo, WHITE, { pos: [center.x, center.y, center.z], rot: [0.14, 0, tilt] });
    return withSway(sleeve, (p) => THREE.MathUtils.clamp(p.distanceTo(shoulder) / length, 0, 1));
  });

  return merge([...headParts, robeGeometry(), ...sleeves]);
}

/** A full robe with soft vertical folds, deepest low down, that narrows into his tail. */
function robeGeometry(): THREE.BufferGeometry {
  const outline = [[0.12, 0], [0.3, 0.35], [0.52, 0.9], [0.74, 1.5], [0.9, 2.1], [0.97, 2.6], [0.86, 3], [0.45, 3.3]];
  const curve = new THREE.SplineCurve(outline.map(([r, y]) => new THREE.Vector2(r, y)));
  const lathe = new THREE.LatheGeometry(curve.getPoints(28), 56);
  const pos = lathe.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const fold = 0.13 * THREE.MathUtils.smoothstep(3 - y, 0.3, 1.6) * Math.sin(Math.atan2(x, z) * 8);
    pos.setXYZ(i, x * (1 + fold), y, z * (1 + fold));
  }
  // Reason: the folds only catch the rim light once the normals follow the new shape
  lathe.computeVertexNormals();
  return withSway(part(lathe, WHITE), (p) => THREE.MathUtils.clamp(1 - p.y / WAIST_Y, 0, 1));
}

export class Hueter {
  readonly root = new THREE.Group();
  private figure = new THREE.Group();
  private halo: THREE.Mesh;
  private uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uBurst: { value: 0 },
    uWaterY: { value: 0 },
    uSize: { value: 8.5 },
  };
  private tween: { seconds: number; at: number; apply: (k: number) => void; done: () => void } | null = null;
  /** Height of his hover above the water line; `fade()` lets him drift up from here. */
  private lift = 0;
  private tmp = new THREE.Vector3();

  constructor() {
    const uniforms = this.uniforms;
    const glowing = {
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    };

    const geo = figureGeometry();
    // Reason: DoubleSide in both passes, so the open sleeves stay solid-looking from any angle
    const depth = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: SHELL_VERT,
        fragmentShader: "void main() { gl_FragColor = vec4(0.0); }",
        vertexColors: true,
        side: THREE.DoubleSide,
        transparent: true,
        colorWrite: false,
      }),
    );
    depth.renderOrder = ORDER.depth;
    const shell = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        vertexColors: true,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        depthFunc: THREE.LessEqualDepth,
      }),
    );
    shell.renderOrder = ORDER.shell;
    this.figure.add(depth, shell);

    // Reason: drawn before the depth pass, or the invisible depth surface would hide the glow behind him
    this.halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({ ...glowing, vertexShader: HALO_VERT, fragmentShader: HALO_FRAG }),
    );
    this.halo.frustumCulled = false;
    this.halo.renderOrder = ORDER.glow;
    this.halo.position.y = 3.6;
    this.figure.add(this.halo);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 13),
      new THREE.ShaderMaterial({ ...glowing, vertexShader: FLAT_VERT, fragmentShader: WATER_FRAG }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.05;
    water.renderOrder = ORDER.glow;

    const seeds = new Float32Array(MOTES * 4);
    for (let i = 0; i < MOTES; i++) {
      seeds.set([Math.random(), 0.8 + Math.random() * 1.5, 0.07 + Math.random() * 0.1, 0.1 + Math.random() * 0.12], i * 4);
    }
    const motes = particleMesh(
      quadGeometry(MOTES, { aSeed: [seeds, 4] }),
      new THREE.ShaderMaterial({ ...glowing, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG }),
      ORDER.motes,
    );

    this.root.add(this.figure, water, motes);
    this.root.visible = false;
  }

  /** Rise out of the water with bright rings. Resolves when he hovers at full strength. */
  rise(): Promise<void> {
    this.root.visible = true;
    return this.play(RISE_SECONDS, (k) => {
      const eased = 1 - (1 - k) ** 3;
      this.lift = THREE.MathUtils.lerp(-2.8, 0, eased);
      this.figure.scale.setScalar(THREE.MathUtils.lerp(0.8, 1, eased));
      this.uniforms.uOpacity.value = Math.min(k / 0.45, 1);
      this.uniforms.uBurst.value = Math.sin(Math.min(k * 1.15, 1) * Math.PI);
    });
  }

  /** Thin out and drift upwards until he is gone. Resolves when he is hidden. */
  fade(): Promise<void> {
    if (!this.root.visible) return Promise.resolve();
    const from = this.uniforms.uOpacity.value;
    return this.play(FADE_SECONDS, (k) => {
      this.lift = k * k * 2.2;
      this.uniforms.uOpacity.value = from * (1 - k);
      if (k >= 1) this.root.visible = false;
    });
  }

  update(dt: number, time: number): void {
    if (!this.root.visible) return;
    this.uniforms.uTime.value = time;
    this.uniforms.uWaterY.value = this.root.getWorldPosition(this.tmp).y;
    if (this.tween) this.advanceTween(dt);
    this.figure.position.y = this.lift + 0.18 + Math.sin(time * 1.1) * 0.12;
    this.figure.rotation.z = Math.sin(time * 0.7) * 0.022;
    this.figure.rotation.x = Math.sin(time * 0.9 + 1) * 0.012;
  }

  private play(seconds: number, apply: (k: number) => void): Promise<void> {
    // Reason: a new move takes over; whoever waited for the old one must not wait for ever
    this.tween?.done();
    return new Promise((done) => {
      this.tween = { seconds, at: 0, apply, done };
    });
  }

  private advanceTween(dt: number): void {
    const tween = this.tween!;
    tween.at += dt;
    const k = Math.min(tween.at / tween.seconds, 1);
    tween.apply(k);
    if (k < 1) return;
    this.tween = null;
    tween.done();
  }
}

export function createHueter(): Hueter {
  return new Hueter();
}
