/**
 * The volcano on the treasure island's horizon. It stands on the bearing the
 * real volcano has from here on the world map, and looks like the one Tadeo
 * knows: a dark cone with glowing lava rivers. It smokes quietly during the
 * treasure hunt until `start()`: then the crater blows, a fire fountain and a
 * black ash column rise out of it, lava bombs fly in long arcs, and new lava
 * runs down the slope.
 */

import * as THREE from "three";
import { LANDMARKS } from "../../world/layout";
import { SmokeSystem } from "../../world/ambient/Smoke";
import { glowTexture } from "../../world/ambient/textures";
import { Noise2D, smoothstep } from "../../core/noise";
import { Particles } from "../shared/particles";
import { Owned } from "../shared/dispose";

/** In this scene's own scale: the small island is far bigger here than on the world map. */
const DISTANCE = 400;
const BEARING = new THREE.Vector2(LANDMARKS.volcano[0] - LANDMARKS.treasureIsland[0], LANDMARKS.volcano[1] - LANDMARKS.treasureIsland[1]).normalize();

/** The volcano's foot at sea level, in the direction it really lies. */
export const VOLCANO_AT = new THREE.Vector3(BEARING.x * DISTANCE, 0, BEARING.y * DISTANCE);

const CONE_R = 112;
const CONE_H = 100;
const RIM_R = 12;
const BOMB_GRAVITY = 46;
/** Seconds the new lava needs from the crater to the foot. */
const FLOW_SECONDS = 7;

/** Height of the bare cone `r` from its axis, without its crater. */
const slope = (r: number) => Math.max(0, 1 - r / CONE_R) ** 1.4 * CONE_H;

/** A ring-by-ring mesh: dense near the crater, rough gullies on the flanks and a notched rim. */
function coneGeometry(noise: Noise2D): THREE.BufferGeometry {
  const RINGS = 34;
  const SEGMENTS = 110;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const top = new THREE.Color("#2b2120");
  const middle = new THREE.Color("#4a3831");
  const foot = new THREE.Color("#5c4a3e");
  const c = new THREE.Color();
  const rimHeight = slope(RIM_R);
  for (let i = 0; i <= RINGS; i++) {
    const r = CONE_R * (i / RINGS) ** 1.5;
    for (let j = 0; j < SEGMENTS; j++) {
      const a = (j / SEGMENTS) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      let y: number;
      if (r < RIM_R) {
        y = rimHeight - (1 - (r / RIM_R) ** 2) * 16;
      } else {
        const rough = noise.fbm(x * 0.05, z * 0.05, 3) * 9 * smoothstep(RIM_R, 40, r) * (1 - r / CONE_R);
        y = slope(r) + rough;
      }
      y += (Math.sin(a * 3 + 1) * 1.8 + Math.sin(a * 7) * 0.9) * smoothstep(0, RIM_R, r) * (1 - smoothstep(RIM_R, 30, r));
      positions.push(x, y, z);
      const t = r / CONE_R;
      c.copy(top).lerp(middle, smoothstep(0.1, 0.45, t)).lerp(foot, smoothstep(0.45, 0.95, t));
      c.multiplyScalar(0.92 + noise.noise(x * 0.3, z * 0.3) * 0.12);
      colors.push(c.r, c.g, c.b);
      if (i < RINGS) {
        const n = j === SEGMENTS - 1 ? 0 : j + 1;
        const here = i * SEGMENTS;
        const next = (i + 1) * SEGMENTS;
        index.push(here + j, here + n, next + j, here + n, next + n, next + j);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Where the rivers of the side facing the small island run (the viewer looks at the cone from there). */
const FACING = Math.atan2(-BEARING.y, -BEARING.x);

const LAVA_GLSL = /* glsl */ `
uniform float uTime;
uniform float uHeat;
uniform float uFlare;
uniform float uFlow;
varying vec2 vCone;
float angleGap(float a, float b) { return abs(mod(a - b + 3.14159, 6.28318) - 3.14159); }
/** One river of lava: 1 on its centre line, starting at radius "from" and leaning by "bend" on its way down. */
float river(float a, float r, float a0, float bend, float from, float width) {
  float centre = a0 + bend * smoothstep(from, ${CONE_R.toFixed(1)}, r) + 0.14 * sin(r * 0.085 + a0 * 9.0) * smoothstep(8.0, 60.0, r);
  float w = width * (0.7 + r * 0.012);
  return (1.0 - smoothstep(w * 0.4, w, angleGap(a, centre) * r)) * smoothstep(from - 2.0, from + 2.0, r);
}
/** The rivers Tadeo knows from the quest at the volcano, always there. */
float oldRivers(float a, float r) {
  float v = river(a, r, ${FACING.toFixed(3)}, 0.0, ${RIM_R.toFixed(1)}, 3.4);
  v = max(v, river(a, r, ${(FACING + 0.72).toFixed(3)}, 0.3, ${RIM_R.toFixed(1)}, 3.0));
  v = max(v, river(a, r, ${(FACING - 0.66).toFixed(3)}, -0.25, ${RIM_R.toFixed(1)}, 3.0));
  v = max(v, river(a, r, ${FACING.toFixed(3)}, 0.55, 42.0, 2.2));
  v = max(v, river(a, r, ${FACING.toFixed(3)}, -0.5, 52.0, 2.2));
  return v * (1.0 - smoothstep(88.0, 104.0, r));
}
/** The lava of the eruption, running down from the crater as "uFlow" grows. */
float newRivers(float a, float r) {
  float v = river(a, r, ${(FACING + 0.34).toFixed(3)}, 0.2, ${RIM_R.toFixed(1)}, 3.2);
  v = max(v, river(a, r, ${(FACING - 0.32).toFixed(3)}, -0.3, ${RIM_R.toFixed(1)}, 3.2));
  v = max(v, river(a, r, ${(FACING + 1.2).toFixed(3)}, 0.2, ${RIM_R.toFixed(1)}, 3.0));
  v = max(v, river(a, r, ${(FACING - 1.15).toFixed(3)}, -0.2, ${RIM_R.toFixed(1)}, 3.0));
  return v * (1.0 - smoothstep(uFlow - 5.0, uFlow, r));
}
`;

function coneMaterial(uniforms: Record<string, THREE.IUniform>): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vCone;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCone = position.xz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${LAVA_GLSL}`).replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      float coneR = length(vCone);
      float coneA = atan(vCone.y, vCone.x);
      float crawl = 0.78 + 0.22 * sin(coneR * 0.7 - uTime * 2.6 + coneA * 11.0);
      float lava = max(oldRivers(coneA, coneR) * uHeat, newRivers(coneA, coneR));
      totalEmissiveRadiance += mix(vec3(2.4, 0.5, 0.05), vec3(3.2, 1.35, 0.22), smoothstep(0.3, 1.0, lava)) * lava * crawl;
      // Reason: the crater's fire lights the rock around it, more with every blast
      float near = max(1.0 - coneR / 46.0, 0.0);
      totalEmissiveRadiance += vec3(1.5, 0.36, 0.05) * near * near * (uHeat * 0.5 + uFlare);
      // The lake of fire inside the crater
      totalEmissiveRadiance += vec3(5.0, 2.2, 0.4) * (1.0 - smoothstep(${(RIM_R * 0.7).toFixed(1)}, ${RIM_R.toFixed(1)}, coneR)) * (0.5 + uHeat);`,
    );
  };
  m.customProgramCacheKey = () => "treasure-volcano-cone";
  return m;
}

interface Bomb {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
}

export class Eruption {
  readonly group = new THREE.Group();
  /** Where the fire comes out. */
  readonly crater = new THREE.Vector3();
  running = false;
  private uniforms = { uTime: { value: 0 }, uHeat: { value: 0.42 }, uFlare: { value: 0 }, uFlow: { value: 0 } };
  private fire: THREE.Sprite;
  private halo: THREE.Sprite;
  private quiet: THREE.Object3D;
  private plume: THREE.Object3D;
  private fountain: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private embers: Particles;
  private soot: Particles;
  private bombs: Bomb[] = [];
  private nextBomb = 0;
  private since = 0;
  private flare = 0;
  private blast = 0;

  constructor(
    private smoke: SmokeSystem,
    owned: Owned,
  ) {
    const noise = new Noise2D(911);
    const cone = new THREE.Mesh(coneGeometry(noise), owned.add(coneMaterial(this.uniforms)));
    cone.position.copy(VOLCANO_AT);
    cone.name = "volcano-cone";
    this.crater.copy(VOLCANO_AT).setY(slope(RIM_R) - 6);
    const glowSprite = (size: number) => {
      const sprite = new THREE.Sprite(owned.add(new THREE.SpriteMaterial({ map: glowTexture(), color: "#ffffff", blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false })));
      sprite.scale.setScalar(size);
      sprite.position.copy(this.crater).setY(this.crater.y + 6);
      sprite.renderOrder = 3;
      return sprite;
    };
    this.fire = glowSprite(30);
    this.fire.material.color.setRGB(2.4, 1.0, 0.2);
    this.halo = glowSprite(240);
    this.halo.material.color.setRGB(0.85, 0.22, 0.04);
    this.halo.visible = false;

    // The quiet smoke of the treasure hunt, and the eruption's own column and fire, kept away until they are needed
    this.quiet = smoke.add([this.crater], "volcano");
    this.plume = smoke.add([this.crater], "eruption");
    this.plume.visible = false;
    this.fountain = smoke.sparks([this.crater], { perSource: 300, life: 3.4, up: [46, 100], lateral: 30, gravity: 52, size: 6, intensity: 3, wind: 7 }) as typeof this.fountain;
    this.fountain.visible = false;

    const glowMaterial = owned.add(new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.embers = new Particles({ geometry: new THREE.PlaneGeometry(1, 1), material: glowMaterial, max: 1400, gravity: 16, drag: 0.7, billboard: true, fade: "color", renderOrder: 4 });
    const sootMaterial = owned.add(new THREE.MeshBasicMaterial({ color: "#1b1514", map: glowTexture(), transparent: true, depthWrite: false, fog: false }));
    this.soot = new Particles({ geometry: new THREE.PlaneGeometry(1, 1), material: sootMaterial, max: 900, gravity: -3, drag: 0.8, billboard: true, renderOrder: 3 });
    this.group.add(cone, this.fire, this.halo, this.fountain, this.soot.mesh, this.embers.mesh);
  }

  /** The crater blows. */
  start(time: number): void {
    this.running = true;
    this.since = 0;
    this.blast = 1;
    this.flare = 1.6;
    this.smoke.birthWindow(this.plume, time, 1e9);
    // Reason: its pale puffs would stand white in the fire; the flash of the blast hides the change
    this.quiet.visible = false;
    this.plume.visible = true;
    this.fountain.visible = true;
    this.halo.visible = true;
    for (let i = 0; i < 6; i++) this.launch();
    this.nextBomb = 0.7;
  }

  private launch(): void {
    const a = Math.random() * Math.PI * 2;
    const out = 16 + Math.random() * 48;
    this.bombs.push({
      pos: this.crater.clone(),
      vel: new THREE.Vector3(Math.cos(a) * out, 66 + Math.random() * 40, Math.sin(a) * out),
    });
    this.flare = Math.min(this.flare + 0.45, 2);
  }

  /** A hit where the bomb lands: sparks and a puff of dark dust (a white one in the sea). */
  private impact(at: THREE.Vector3, sea: boolean): void {
    this.embers.emit(26, (p) => {
      p.pos.copy(at);
      const a = Math.random() * Math.PI * 2;
      const out = 6 + Math.random() * 20;
      p.vel.set(Math.cos(a) * out, 10 + Math.random() * 28, Math.sin(a) * out);
      if (sea) p.color.setRGB(0.8, 0.36, 0.14);
      else p.color.setRGB(2.8, 1.0, 0.16);
      p.life = 0.6 + Math.random() * 0.7;
      p.size = 2 + Math.random() * 3;
    });
  }

  update(dt: number, time: number, camera: THREE.Camera): void {
    this.uniforms.uTime.value = time;
    // Reason: two out-of-phase sines read as an irregular, breathing glow rather than a metronome
    const pulse = 0.8 + 0.12 * Math.sin(time * 1.7) + 0.08 * Math.sin(time * 4.3);
    this.flare = Math.max(0, this.flare - dt * 1.6);
    this.blast = Math.max(0, this.blast - dt * 0.9);
    this.uniforms.uFlare.value = this.flare;
    if (!this.running) {
      this.fire.material.opacity = 0.55 * pulse;
      return;
    }
    this.since += dt;
    const rise = smoothstep(0, 1.8, this.since);
    this.uniforms.uHeat.value = 0.42 + 0.58 * rise;
    this.uniforms.uFlow.value = RIM_R + (CONE_R - RIM_R) * Math.min(this.since / FLOW_SECONDS, 1);
    this.fire.material.opacity = 1;
    this.fire.scale.setScalar(38 + pulse * 10 + this.flare * 20 + this.blast * 90);
    this.halo.material.opacity = 0.34 + pulse * 0.14 + this.flare * 0.14 + this.blast * 0.6;
    this.halo.scale.setScalar(210 + this.flare * 34 + this.blast * 300);
    const fountain = this.fountain.material.uniforms;
    // Reason: the sparks are analytic, so growing their launch speed lets the fountain climb out of the crater
    fountain.uUp.value.set(46 * (0.25 + 0.75 * rise), 100 * (0.25 + 0.75 * rise));
    fountain.uLateral.value = 30 * (0.25 + 0.75 * rise) + this.flare * 8;
    fountain.uIntensity.value = 2.2 + pulse + this.flare;

    this.nextBomb -= dt;
    if (this.nextBomb <= 0) {
      this.nextBomb = 0.55 + Math.random() * 0.8;
      const salvo = Math.random() < 0.3 ? 2 : 1;
      for (let i = 0; i < salvo; i++) this.launch();
    }
    this.updateBombs(dt);
    this.embers.update(dt, camera, time);
    this.soot.update(dt, camera, time);
  }

  private updateBombs(dt: number): void {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.vel.y -= BOMB_GRAVITY * dt;
      b.pos.addScaledVector(b.vel, dt);
      // Reason: the newest ember is the bomb itself, the older ones behind it cool into its tail
      this.embers.emit(2, (p, k) => {
        p.pos.copy(b.pos).addScaledVector(b.vel, -k * dt * 0.5);
        p.vel.copy(b.vel).multiplyScalar(0.06);
        p.color.setRGB(2.6, 0.95, 0.14);
        p.life = 0.34 + Math.random() * 0.22;
        p.size = 5.5 + Math.random() * 3;
      });
      // Reason: anywhere along this frame's stretch of the path, so a slow frame leaves a smear and not a row of beads
      this.soot.emit(1, (p) => {
        p.pos.copy(b.pos).addScaledVector(b.vel, -Math.random() * dt);
        p.life = 0.7 + Math.random() * 0.5;
        p.size = 11 + Math.random() * 7;
      });
      const r = Math.hypot(b.pos.x - VOLCANO_AT.x, b.pos.z - VOLCANO_AT.z);
      const ground = Math.max(slope(r), 0);
      if (b.vel.y < 0 && b.pos.y < ground) {
        this.impact(b.pos, r >= CONE_R);
        this.bombs.splice(i, 1);
      }
    }
  }
}
