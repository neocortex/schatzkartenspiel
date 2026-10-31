/**
 * What the Feuerherz's return sets off on the volcano course: a column of light
 * from the stone, a wave of light rolling out over the land, the sky clearing, the
 * lava and the crater going to rest, a rainbow over the mountain, and the Hüter.
 * It stands ready from the start of the run and does nothing until the ending asks.
 */

import * as THREE from "three";
import { audio } from "../../audio/Audio";
import { createHueter } from "../../characters/Hueter";
import { Shot } from "../../core/CameraRig";
import { glowTexture } from "../../world/ambient/textures";
import { HEART_IN_HOLLOW } from "../volcano/altar";
import { VOLCANO } from "../volcano/course";
import type { EndingStage } from "../volcano/modes";
import type { VolcanoChallenge } from "../volcano/VolcanoChallenge";

export type HomecomingPhase = "climb" | "walk" | "wait" | "flight" | "home" | "wide" | "calm" | "thanks" | "joy";

/** The clear evening the eruption was hiding, as warm as the day it began. */
const CLEAR = {
  zenith: new THREE.Color("#2a6fe6"),
  horizon: new THREE.Color("#ffdcae"),
  sunGlow: new THREE.Color("#ffc98a"),
  fog: new THREE.Color("#eec9a6"),
  sun: new THREE.Color("#fff0d6"),
  sunIntensity: 2.7,
  hemiSky: new THREE.Color("#ffe7cf"),
  hemiGround: new THREE.Color("#7a4434"),
  hemiIntensity: 1.05,
};

const FLIGHT_SECONDS = 1.9;
const SETTLE_SECONDS = 7;
const WAVE_SECONDS = 2;
const WAVE_RADIUS = 150;
const COLUMN_STRENGTH = 1.7;
const LIGHT_BRIGHT = 45;
const LIGHT_RESTING = 14;
const TAU = Math.PI * 2;
/** How far in front of the stone Tadeo stands: just short of its steps. */
const STAND_FRONT = 4.3;

const between = (k: number, a: number, b: number) => THREE.MathUtils.smoothstep(k, a, b);

const LIGHT_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying float vUp;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalMatrix * normal;
  vView = -mv.xyz;
  vUp = uv.y;
  gl_Position = projectionMatrix * mv;
}
`;

/** Soft-edged light: brightest where the surface faces the viewer, so a cylinder reads as a shaft and not as a tube. */
const COLUMN_FRAG = /* glsl */ `
uniform float uStrength;
varying vec3 vNormal;
varying vec3 vView;
varying float vUp;
void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  // Reason: clamp pow() bases; a slightly negative base is NaN on Metal
  float core = pow(max(facing, 0.0), 2.4);
  // Soft at its foot on the stone, thinning out on the way up
  float strength = core * smoothstep(0.0, 0.04, vUp) * pow(max(1.0 - vUp, 0.0), 1.5) * uStrength;
  gl_FragColor = vec4(vec3(1.5, 1.05, 0.5) * strength, strength);
  #include <colorspace_fragment>
}
`;

/** The wave of light: only its rim shows, so one can see through it to the land it rolls over. */
const WAVE_FRAG = /* glsl */ `
uniform float uStrength;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  float rim = pow(max(1.0 - facing, 0.0), 3.0);
  float strength = rim * uStrength;
  gl_FragColor = vec4(vec3(1.5, 1.2, 0.7) * strength, strength);
  #include <colorspace_fragment>
}
`;

const RAINBOW_VERT = /* glsl */ `
varying vec2 vArc;
void main() {
  vArc = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** vArc.x runs from the inner edge to the outer one, vArc.y along the arc. It grows from one foot to the other. */
const RAINBOW_FRAG = /* glsl */ `
uniform float uReveal;
varying vec2 vArc;
vec3 hue(float h) {
  return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}
void main() {
  // Violet inside, red outside, as a real one
  vec3 col = hue(mix(0.78, 0.0, vArc.x));
  float bands = smoothstep(0.0, 0.14, vArc.x) * smoothstep(1.0, 0.86, vArc.x);
  float feet = smoothstep(0.0, 0.14, vArc.y) * smoothstep(1.0, 0.86, vArc.y);
  float grown = smoothstep(uReveal * 1.2, uReveal * 1.2 - 0.2, vArc.y);
  gl_FragColor = vec4(col * 1.25, bands * feet * grown * 0.72);
  #include <colorspace_fragment>
}
`;

/** A half ring facing +z, with its uv along the bands and the arc. */
function rainbowGeometry(radius: number, width: number): THREE.BufferGeometry {
  const geo = new THREE.RingGeometry(radius - width, radius, 96, 1, 0, Math.PI);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - (radius - width)) / width, 1 - Math.atan2(pos.getY(i), pos.getX(i)) / Math.PI);
  }
  return geo;
}

interface Tween {
  seconds: number;
  at: number;
  apply: (k: number) => void;
  done: () => void;
}

export class Homecoming implements EndingStage {
  readonly group = new THREE.Group();
  readonly hueter = createHueter();
  readonly cool: { value: number };
  /** Where the ending has got to (read by the E2E proof). */
  phase: HomecomingPhase = "climb";
  readonly standAt: THREE.Vector3;
  readonly promptAt: THREE.Vector3;
  readonly shots: Record<"stone" | "heart" | "wide" | "hueter", Shot>;
  private column: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private wave: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private rainbow: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private light = new THREE.PointLight("#ffc46a", 0, 44, 2);
  private halo: THREE.Sprite;
  private tweens = new Set<Tween>();
  private home = false;

  constructor(private c: VolcanoChallenge) {
    this.cool = c.cool;
    // Reason: right after the treasure island's dark column, a white plume would look like the volcano had calmed down already
    c.peak.ash = 1;
    const altar = c.set.altar;
    const hollow = altar.hollowAt;
    const yaw = altar.group.rotation.y;
    const face = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const base = altar.group.position;
    // A place around the stone: x to its side, z out in front of its face, y above the ground there
    const at = (x: number, z: number, y = 0) => {
      const p = base.clone().addScaledVector(side, x).addScaledVector(face, z);
      p.y = c.course.ground(p.x, p.z) + y;
      return p;
    };

    this.standAt = at(0, STAND_FRONT);
    this.promptAt = hollow.clone().add(new THREE.Vector3(0, 1.1, 0));

    // Reason: seen from where the trail comes up, past the stone and on to the volcano, so all of it fits in one picture
    const toPeak = new THREE.Vector3(VOLCANO.x - base.x, 0, VOLCANO.z - base.z).normalize();
    const wideFrom = at(0, 0).addScaledVector(toPeak, -14).addScaledVector(face, 3).setY(base.y + 2.6);
    const wideLook = base.clone().addScaledVector(toPeak, 70).setY(base.y + 15);
    this.shots = {
      stone: { pos: at(2.6, 11, 3), look: hollow.clone().add(new THREE.Vector3(0, -0.5, 0)) },
      // Reason: beside Tadeo and not behind him, or his head fills the corner of the picture
      heart: { pos: at(2.1, 4.5, 2.2), look: hollow.clone() },
      wide: { pos: wideFrom, look: wideLook },
      hueter: { pos: at(3, 13, 3.6), look: at(-1.2, 1.5, 1.9) },
    };

    const glowing = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false };
    this.column = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 0.7, 95, 28, 1, true).translate(0, 47.5, 0).rotateY(0.3),
      new THREE.ShaderMaterial({ ...glowing, uniforms: { uStrength: { value: 0 } }, vertexShader: LIGHT_VERT, fragmentShader: COLUMN_FRAG, side: THREE.DoubleSide }),
    );
    // Reason: from the top of the stone up, so the column does not burn the heart out of the picture
    this.column.position.copy(base).setY(hollow.y + 0.9);
    this.column.renderOrder = 5;
    this.column.visible = false;

    this.wave = new THREE.Mesh(
      new THREE.SphereGeometry(1, 40, 24),
      new THREE.ShaderMaterial({ ...glowing, uniforms: { uStrength: { value: 0 } }, vertexShader: LIGHT_VERT, fragmentShader: WAVE_FRAG, side: THREE.DoubleSide }),
    );
    this.wave.position.copy(hollow);
    this.wave.renderOrder = 5;
    this.wave.visible = false;

    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ ...glowing, map: glowTexture(), color: new THREE.Color(1.5, 0.85, 0.3), opacity: 0 }));
    this.halo.position.copy(hollow).addScaledVector(face, 0.6);
    this.halo.renderOrder = 5;

    this.light.position.copy(hollow).addScaledVector(face, 3);

    // Reason: its feet stand behind the land, so the terrain cuts them off the way hills do; far enough away that it never moves with the camera
    const look = wideLook.clone().sub(wideFrom).setY(0).normalize();
    this.rainbow = new THREE.Mesh(
      rainbowGeometry(330, 34),
      new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, uniforms: { uReveal: { value: 0 } }, vertexShader: RAINBOW_VERT, fragmentShader: RAINBOW_FRAG }),
    );
    this.rainbow.position.copy(wideFrom).addScaledVector(look, 520).setY(-40);
    this.rainbow.lookAt(wideFrom.x, -40, wideFrom.z);
    this.rainbow.renderOrder = 2;
    this.rainbow.visible = false;

    const spot = at(-3.8, 2.6, 0.12);
    this.hueter.root.position.copy(spot);
    this.hueter.root.rotation.y = Math.atan2(this.standAt.x - spot.x, this.standAt.z - spot.z);

    this.group.add(this.column, this.wave, this.halo, this.light, this.rainbow, this.hueter.root);
  }

  get rainbowReveal(): number {
    return this.rainbow.material.uniforms.uReveal.value;
  }

  /** Runs `apply` from 0 to 1 over `seconds` of game time. */
  tween(seconds: number, apply: (k: number) => void): Promise<void> {
    return new Promise((done) => this.tweens.add({ seconds, at: 0, apply, done }));
  }

  sleep(seconds: number): Promise<void> {
    return this.tween(seconds, () => {});
  }

  lookAtStone(): void {
    this.turnTo(this.c.set.altar.hollowAt);
  }

  lookAtHueter(): void {
    this.turnTo(this.hueter.root.position);
  }

  /** Towards the wide shot's camera, so he is seen from the front when he jumps. */
  lookAtCamera(): void {
    this.turnTo(this.shots.wide.pos);
  }

  private turnTo(p: THREE.Vector3): void {
    const h = this.c.hero;
    h.facing = Math.atan2(p.x - h.position.x, p.z - h.position.z);
  }

  /** One happy hop. Reason: the hero only jumps while he has the controls, and here nothing else may read them. */
  hop(): void {
    const h = this.c.hero;
    h.controls = true;
    h.jump();
    h.controls = false;
  }

  /** The heart lets go of his back, arcs through the air and sinks into the hollow. */
  async flyHeartHome(): Promise<void> {
    const { scene, carriedHeart, set, bursts } = this.c;
    const heart = carriedHeart!;
    scene.attach(heart);
    const from = heart.position.clone();
    const to = set.altar.hollowAt;
    const fromScale = heart.scale.x;
    const yaw = set.altar.group.rotation.y;
    const startYaw = heart.rotation.y;
    audio.playSfx("sfx_special", 0.6, 0.7);
    const color = new THREE.Color(3.4, 2, 0.7);
    await this.tween(FLIGHT_SECONDS, (k) => {
      const e = THREE.MathUtils.smootherstep(k, 0, 1);
      heart.position.lerpVectors(from, to, e);
      heart.position.y += Math.sin(k * Math.PI) * 1.5;
      heart.scale.setScalar(THREE.MathUtils.lerp(fromScale, HEART_IN_HOLLOW, e));
      heart.rotation.y = THREE.MathUtils.lerp(startYaw, yaw + TAU, e);
      if (Math.random() < 0.7) bursts.twinkle(heart.position.clone(), 2, 0.9, color, 0.5);
    });
    heart.visible = false;
  }

  /** The heart is home: the rocks stop, and light goes up from the stone and rolls out over the land. */
  lightUp(): void {
    const { set, fx, rig, director, bombs, bursts } = this.c;
    set.altar.setHeart(true);
    this.home = true;
    director.stopped = true;
    bombs.fizzle();
    fx.flash("#fff4c8", 0.7, 800);
    rig.addShake(0.9);
    // Reason: the door's creak slowed down is the volcano's groan elsewhere in the game; here it is the mountain's last one
    audio.playSfx("sfx_door", 0.9, 0.42);
    audio.playSfx("sfx_item_get", 0.9, 0.8);
    audio.playSfx("sfx_heal", 0.9);
    bursts.twinkle(set.altar.hollowAt.clone(), 90, 5, new THREE.Color(3.4, 2.4, 0.9), 0.9);

    this.column.visible = true;
    this.wave.visible = true;
    void this.tween(WAVE_SECONDS, (k) => {
      this.wave.scale.setScalar(1 + (1 - (1 - k) ** 2) * WAVE_RADIUS);
      this.wave.material.uniforms.uStrength.value = 2.6 * (1 - k) ** 1.4;
      if (k >= 1) this.wave.visible = false;
    });
    void this.tween(1.1, (k) => {
      this.column.material.uniforms.uStrength.value = between(k, 0, 0.5) * COLUMN_STRENGTH;
      this.light.intensity = between(k, 0, 0.3) * LIGHT_BRIGHT;
      this.halo.material.opacity = between(k, 0, 0.3) * 0.5;
    });
  }

  /** The eruption dies down: lava and crater go to rest, the red sky clears, the rainbow grows. The column sinks to a glow. */
  async settle(): Promise<void> {
    const { sky, stage, peak } = this.c;
    const from = { zenith: sky.zenith.clone(), horizon: sky.horizon.clone(), sunGlow: sky.sunGlow.clone() };
    const fog = stage.scene.fog as THREE.Fog;
    const before = {
      fog: fog.color.clone(),
      sun: stage.sun.color.clone(),
      sunIntensity: stage.sun.intensity,
      hemiSky: stage.hemi.color.clone(),
      hemiGround: stage.hemi.groundColor.clone(),
      hemiIntensity: stage.hemi.intensity,
    };
    this.rainbow.visible = true;
    await this.tween(SETTLE_SECONDS, (k) => {
      this.cool.value = between(k, 0, 0.65);
      peak.rest = between(k, 0, 0.7);
      peak.ash = 1 - peak.rest;
      const s = between(k, 0.08, 0.85);
      sky.zenith.lerpColors(from.zenith, CLEAR.zenith, s);
      sky.horizon.lerpColors(from.horizon, CLEAR.horizon, s);
      sky.sunGlow.lerpColors(from.sunGlow, CLEAR.sunGlow, s);
      fog.color.lerpColors(before.fog, CLEAR.fog, s);
      stage.sun.color.lerpColors(before.sun, CLEAR.sun, s);
      stage.sun.intensity = THREE.MathUtils.lerp(before.sunIntensity, CLEAR.sunIntensity, s);
      stage.hemi.color.lerpColors(before.hemiSky, CLEAR.hemiSky, s);
      stage.hemi.groundColor.lerpColors(before.hemiGround, CLEAR.hemiGround, s);
      stage.hemi.intensity = THREE.MathUtils.lerp(before.hemiIntensity, CLEAR.hemiIntensity, s);
      this.rainbow.material.uniforms.uReveal.value = between(k, 0.4, 1);
      const fading = between(k, 0.2, 1);
      this.column.material.uniforms.uStrength.value = COLUMN_STRENGTH * (1 - fading * 0.9);
      this.light.intensity = THREE.MathUtils.lerp(LIGHT_BRIGHT, LIGHT_RESTING, fading);
      // Reason: under a strong glow the heart bleaches to white; at rest it has to read as the red heart it is
      this.halo.material.opacity = THREE.MathUtils.lerp(0.5, 0.22, fading);
    });
  }

  update(dt: number, time: number): void {
    for (const t of [...this.tweens]) {
      t.at += dt;
      const k = Math.min(t.at / t.seconds, 1);
      t.apply(k);
      if (k < 1) continue;
      this.tweens.delete(t);
      t.done();
    }
    this.hueter.update(dt, time);
    if (!this.home) return;
    // The heart breathes in its hollow, and the light with it
    const beat = 0.9 + Math.sin(time * 2.4) * 0.1;
    this.halo.scale.setScalar(6.5 * beat);
    if (Math.random() < dt * 9) {
      const a = Math.random() * TAU;
      const p = this.c.set.altar.hollowAt.clone().add(new THREE.Vector3(Math.cos(a) * 2.2, (Math.random() - 0.3) * 2.4, Math.sin(a) * 2.2));
      this.c.bursts.twinkle(p, 1, 0.5, new THREE.Color(3, 2.1, 0.8), 0.9);
    }
  }
}
