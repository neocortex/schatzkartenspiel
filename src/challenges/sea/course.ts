/**
 * The obstacle course between the dock and the treasure island: rocky sea
 * stacks with foam rings, giant rolling waves that sweep towards the boat
 * over one side of the lane, and a trail of golden stars that always shows
 * the safe way through. Hits are never fatal — the boat just gets splashed.
 */

import * as THREE from "three";
import { mulberry32 } from "../../core/noise";
import { NOISE_GLSL } from "../../core/glsl";
import { emptyModel, rockBlob, stoneFn } from "../../world/models/shapes";
import { mat } from "../../characters/parts";
import { starGeometry } from "../ogre/Ogre";
import { Bin, ModelMaterials, modelGroup } from "../ogre/kit";
import { Fx } from "../ogre/fx";
import { seaHeight } from "./ocean";

export interface RowSpec {
  z: number;
  /** Sea stacks: x and radius. */
  rocks?: [number, number][];
  /** A giant wave covering x0..x1 (meets the boat at this row's z). */
  wave?: [number, number];
  /** Where the star trail passes (a safe x). */
  safe: number;
}

export const COURSE: RowSpec[] = [
  { z: -60, rocks: [[3.5, 2.2]], safe: -3 },
  { z: -88, rocks: [[-4, 2.4]], safe: 3 },
  { z: -116, wave: [0.5, 12], safe: -5 },
  { z: -144, rocks: [[-6.5, 2.2], [5.5, 2.2]], safe: 0 },
  { z: -172, wave: [-12, -0.5], safe: 5 },
  { z: -200, rocks: [[0, 2.6]], safe: 5 },
  { z: -228, rocks: [[5, 2.0], [-1.5, 2.0]], safe: -6.5 },
  { z: -256, wave: [-3, 12], safe: -7 },
  { z: -284, rocks: [[-6, 2.4], [2, 1.6]], safe: 6.5 },
  { z: -312, wave: [-12, 2.5], safe: 6.5 },
  { z: -340, rocks: [[6, 2.2], [-6, 2.2]], safe: 0 },
  { z: -368, wave: [-12, -2], rocks: [[5.5, 1.8]], safe: 1.2 },
  { z: -396, rocks: [[0.5, 2.4]], safe: -5 },
];
/** The course ends here; the shark waits just beyond. */
export const COURSE_END = -415;
/** Lateral limit for the boat. */
export const LANE = 9;

/** Giant waves roll towards the boat at this fraction of the boat's own speed. */
const WAVE_SPEED = 0.6;

const WAVE_VERT = /* glsl */ `
attribute float aH;
varying float vH;
varying float vEnd;
varying float vS;
varying vec3 vN;
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vH = aH;
  vEnd = uv.x;
  vS = 1.0 - uv.y;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WAVE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
varying float vH;
varying float vEnd;
varying float vS;
varying vec3 vN;
varying vec3 vW;
${NOISE_GLSL}
#include <fog_pars_fragment>
void main() {
  vec3 deep = vec3(0.02, 0.27, 0.58);
  vec3 light = vec3(0.2, 0.82, 0.84);
  // vS: 0 at the back of the swell, 0.7 at the crest, 1 at the foot of the curling face
  float face = smoothstep(0.68, 0.75, vS);
  vec3 col = mix(deep, light, smoothstep(0.1, 0.85, vH) * mix(1.0, 0.85, face));
  // Reason: the tapered ends collapse to zero-area triangles with zero normals; never normalise those (NaN)
  vec3 nrm = dot(vN, vN) > 1e-8 ? normalize(vN) : vec3(0.0, 1.0, 0.0);
  float lit = 0.72 + 0.4 * max(dot(nrm, uSunDir), 0.0);
  col *= lit;
  // Foam on the crest, streaming over the lip
  float n = vnoise(vec2(vW.x * 0.9, vH * 6.0 - uTime * 2.5)) * 0.6 + vnoise(vW.xz * 2.5 + uTime) * 0.4;
  float foam = smoothstep(0.72, 0.9, vH + n * 0.18);
  // A churning white skirt where the curl crashes into the sea
  float skirt = smoothstep(0.86, 0.97, vS + n * 0.08) * face;
  foam = max(foam, skirt * smoothstep(0.25, 0.55, n));
  col = mix(col, vec3(1.0), foam);
  float ends = smoothstep(0.0, 0.18, vEnd) * smoothstep(1.0, 0.82, vEnd);
  float a = max(smoothstep(0.02, 0.14, vH), foam * 0.95) * ends;
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}
`;

/** A curling wave crest along x, rolling towards +z; `aH` is the normalised height. */
function waveGeometry(length: number, height: number): THREE.BufferGeometry {
  const cols = 40;
  const rows = 22;
  const g = new THREE.PlaneGeometry(1, 1, cols, rows);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const h = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i);
    const s = 1 - uv.getY(i);
    const x = (u - 0.5) * length;
    // Reason: the crest sinks towards both ends so the wave grows out of the sea
    const taper = Math.pow(Math.max(Math.sin(Math.PI * u), 0), 0.6);
    let y: number;
    let z: number;
    if (s < 0.7) {
      const k = s / 0.7;
      z = -5 + k * 5;
      y = height * (k * k * (3 - 2 * k));
    } else {
      const k = Math.min((s - 0.7) / 0.3, 1);
      y = height * Math.pow(1 - k, 1.3);
      z = 0.9 * Math.sin(k * Math.PI * 0.9) + k * 0.5;
    }
    pos.setXYZ(i, x, y * taper - 0.45, z * (0.6 + taper * 0.4));
    h[i] = (y / height) * taper;
  }
  g.setAttribute("aH", new THREE.BufferAttribute(h, 1));
  g.computeVertexNormals();
  return g;
}

interface Wave {
  mesh: THREE.Mesh;
  x0: number;
  x1: number;
  zMeet: number;
  z: number;
  hit: boolean;
}

interface Rock {
  x: number;
  z: number;
  r: number;
  hit: boolean;
}

interface Star {
  x: number;
  z: number;
  taken: boolean;
  pop: number;
}

export interface CourseHit {
  kind: "rock" | "wave";
  at: THREE.Vector3;
  /** Which way to push the boat (-1 left, +1 right). */
  push: number;
}

export class Course {
  readonly group = new THREE.Group();
  readonly rocks: Rock[] = [];
  readonly waves: Wave[] = [];
  readonly stars: Star[] = [];
  private starMesh: THREE.InstancedMesh;
  private waveMat: THREE.ShaderMaterial;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private sprayTimer = 0;

  constructor(
    bin: Bin,
    mats: ModelMaterials,
    private fx: Fx,
    uniforms: { uTime: { value: number }; uSunDir: { value: THREE.Vector3 } },
  ) {
    this.waveMat = bin.material(
      new THREE.ShaderMaterial({
        uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), uTime: uniforms.uTime, uSunDir: uniforms.uSunDir },
        vertexShader: WAVE_VERT,
        fragmentShader: WAVE_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      }),
    );
    const rand = mulberry32(31);
    for (const row of COURSE) {
      for (const [x, r] of row.rocks ?? []) this.addRock(x, row.z + (rand() - 0.5) * 3, r, rand, mats);
      if (row.wave) this.addWave(row.wave[0], row.wave[1], row.z);
    }
    // Star trail: from the dock through every row's safe spot
    const path: [number, number][] = [[0, -12], ...COURSE.map((r) => [r.safe, r.z] as [number, number]), [0, COURSE_END]];
    for (let i = 0; i < path.length - 1; i++) {
      const [xa, za] = path[i];
      const [xb, zb] = path[i + 1];
      const n = Math.max(2, Math.round((za - zb) / 7));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const e = t * t * (3 - 2 * t);
        this.stars.push({ x: xa + (xb - xa) * e, z: za + (zb - za) * t, taken: false, pop: 0 });
      }
    }
    this.starMesh = new THREE.InstancedMesh(starGeometry(0.42), mat("#ffd23f", 0.3, 1.1), this.stars.length);
    this.starMesh.frustumCulled = false;
    this.group.add(this.starMesh);
  }

  private addRock(x: number, z: number, r: number, rand: () => number, mats: ModelMaterials): void {
    const m = emptyModel();
    const stone = stoneFn("#a39a8f", 0.35, rand);
    m.solid.push(rockBlob(Math.round(rand() * 1000), [r * 0.85, r * 1.35, r * 0.8], stone, 2).translate(0, r * 0.35, 0));
    for (let i = 0; i < 2; i++) {
      const a = rand() * Math.PI * 2;
      const s = r * (0.35 + rand() * 0.25);
      m.solid.push(rockBlob(Math.round(rand() * 1000), [s, s * 0.9, s], stone, 1).translate(Math.cos(a) * r * 0.8, -0.1, Math.sin(a) * r * 0.8));
    }
    const g = modelGroup(m, mats);
    g.position.set(x, -0.9, z);
    g.rotation.y = rand() * Math.PI * 2;
    this.group.add(g);
    this.rocks.push({ x, z, r, hit: false });
  }

  private addWave(x0: number, x1: number, zMeet: number): void {
    // Reason: the wave mesh is longer than its blocking range; its tapered ends sink into the sea
    const len = x1 - x0 + 6;
    const mesh = new THREE.Mesh(waveGeometry(len, 2.6), this.waveMat);
    mesh.position.x = (x0 + x1) / 2;
    mesh.renderOrder = 3;
    this.group.add(mesh);
    this.waves.push({ mesh, x0, x1, zMeet, z: zMeet - 400, hit: false });
  }

  /** Safe x of the next row ahead of z (for hints and the E2E test). */
  nextSafe(z: number): number {
    const row = COURSE.find((r) => r.z < z - 2);
    return row ? row.safe : 0;
  }

  /**
   * Move waves, spin stars, and test the boat (centre x, z; bow points to -z).
   * Returns obstacles hit this frame and stars collected (only while `active`).
   */
  update(dt: number, t: number, bx: number, bz: number, active: boolean): { hits: CourseHit[]; stars: THREE.Vector3[] } {
    const hits: CourseHit[] = [];
    const got: THREE.Vector3[] = [];
    for (const r of this.rocks) {
      if (!active || r.hit || Math.abs(r.z - bz) > r.r + 3) continue;
      // Distance from the rock to the boat's centre line (bow to stern)
      const dz = THREE.MathUtils.clamp(r.z - bz, -2.1, 2.1);
      const d = Math.hypot(r.x - bx, r.z - (bz + dz));
      if (d < r.r * 0.8 + 0.85) {
        r.hit = true;
        hits.push({ kind: "rock", at: new THREE.Vector3(r.x + Math.sign(bx - r.x) * r.r * 0.7, 0.4, bz - 1.5), push: bx >= r.x ? 1 : -1 });
      }
    }
    this.sprayTimer -= dt;
    const spray = this.sprayTimer <= 0;
    if (spray) this.sprayTimer = 0.05;
    for (const w of this.waves) {
      w.z = w.zMeet - (bz - w.zMeet) * WAVE_SPEED;
      w.mesh.position.z = w.z;
      // Passed waves sink away quickly instead of blocking the chase camera
      w.mesh.position.y = -Math.max(0, w.z - bz - 2) * 0.35;
      w.mesh.visible = w.z < bz + 12 && w.z > bz - 330;
      if (w.mesh.visible && spray && Math.abs(w.z - bz) < 90) {
        const x = THREE.MathUtils.lerp(w.x0, w.x1, Math.random());
        this.fx.puff.emit({ at: this.v.set(x, 1.9, w.z + 0.6), count: 2, speed: [1.5, 3.5], dir: this.s.set(0, 0.8, 1), spread: 0.4, gravity: 7, drag: 0.8, life: [0.5, 0.9], size: [0.35, 0.12], color: "#ffffff", alpha: 0.85 });
      }
      if (active && !w.hit && Math.abs(w.z - bz) < 1.6 && bx > w.x0 - 0.8 && bx < w.x1 + 0.8) {
        w.hit = true;
        hits.push({ kind: "wave", at: new THREE.Vector3(bx, 1.2, bz - 1), push: bx - (w.x0 + w.x1) / 2 > 0 ? 1 : -1 });
      }
    }
    this.stars.forEach((s, i) => {
      if (active && !s.taken && Math.abs(s.z - bz) < 2.6 && Math.abs(s.x - bx) < 2.0) {
        s.taken = true;
        got.push(new THREE.Vector3(s.x, 1.2, s.z));
      }
      if (s.taken) s.pop = Math.min(s.pop + dt * 4, 1);
      const far = s.z > bz + 12 || s.z < bz - 260;
      const scale = far ? 0 : s.taken ? Math.max(0, 1 - s.pop) * (1 + s.pop) : 1;
      const y = 1.05 + seaHeight(s.x, s.z, t) * 0.6 + Math.sin(t * 3 + i) * 0.15 + s.pop * 1.5;
      // Reason: a gentle wobble instead of a full spin, so stars never turn edge-on into thin bars
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), Math.sin(t * 2.2 + i * 0.7) * 0.5);
      this.m.compose(this.v.set(s.x, y, s.z), this.q, this.s.setScalar(scale));
      this.starMesh.setMatrixAt(i, this.m);
    });
    this.starMesh.instanceMatrix.needsUpdate = true;
    return { hits, stars: got };
  }
}
