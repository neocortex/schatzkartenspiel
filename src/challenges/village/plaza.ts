/**
 * The village plaza at dusk: a sunset sky dome with twinkling stars and a
 * glowing moon, warm low sunlight plus a cool rim light, packed-earth plaza
 * fading into grass and gentle hills, trees and grass tufts, fireflies, a
 * sleeping cat by the campfire, and the ceremony decor (see `decor.ts`).
 */

import * as THREE from "three";
import { Noise2D, mulberry32, smoothstep } from "../../core/noise";
import { createSkyDome, SkyPalette } from "../../world/Sky";
import { WorldUniforms } from "../../world/Terrain";
import { roundTree, palmTree, bush } from "../../world/models/flora";
import { SmokeSystem, GLOW_FRAG } from "../../world/ambient/Smoke";
import { BILLBOARD_GLSL, particleMaterial, particleMesh, quadGeometry } from "../../world/ambient/particles";
import { glowTexture } from "../../world/ambient/textures";
import { CritterMesh } from "../../world/ambient/CritterMesh";
import { catModel } from "../../world/ambient/critterModels";
import { CAT_ANIM } from "../../world/ambient/critterAnims";
import { Campfire } from "./campfire";
import { Decor, RING, BLOCKERS } from "./decor";
import { Owned } from "../shared/dispose";

const DUSK: SkyPalette = {
  zenith: new THREE.Color("#1d2766"),
  horizon: new THREE.Color("#ff9d78"),
  sunGlow: new THREE.Color("#ffb46a"),
};

/** Deep blue, with just enough glow left at the horizon for the rooftops and trees to stand out against it. */
const NIGHT: SkyPalette = {
  zenith: new THREE.Color("#050a2e"),
  horizon: new THREE.Color("#23357f"),
  sunGlow: new THREE.Color("#000000"),
};

const STAR_VERT = /* glsl */ `
uniform float uTime;
uniform float uNight;
attribute float aSeed;
varying float vBright;
void main() {
  vec3 d = normalize(position);
  float tw = 0.65 + 0.35 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 40.0);
  // Stars fade in towards the zenith, away from the sunset glow; at night there is no glow to keep away from
  vBright = tw * mix(smoothstep(0.12, 0.5, d.y), smoothstep(0.02, 0.14, d.y) * 1.5, uNight) * (0.5 + aSeed);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
  gl_PointSize = 1.5 + aSeed * 2.5;
}`;

const STAR_FRAG = /* glsl */ `
varying float vBright;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.1, length(c));
  gl_FragColor = vec4(vec3(1.0, 0.96, 0.85) * vBright * 1.6 * a, 1.0);
}`;

const FIREFLY_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aBase;
varying vec2 vUv;
varying vec3 vColor;
${BILLBOARD_GLSL}
void main() {
  float s = aBase.w;
  float t = uTime;
  vec3 p = aBase.xyz + vec3(sin(t * 0.3 + s * 40.0) * 1.4, sin(t * 0.5 + s * 17.0) * 0.4, cos(t * 0.25 + s * 23.0) * 1.4);
  float cyc = fract(t * (0.2 + 0.25 * hash11(s + 3.0)) + hash11(s + 7.0));
  float blink = smoothstep(0.0, 0.12, cyc) * smoothstep(0.55, 0.2, cyc);
  vColor = mix(vec3(0.55, 1.0, 0.2), vec3(1.0, 0.85, 0.25), hash11(s + 5.0)) * (0.25 + blink * 4.0);
  vUv = uv;
  gl_Position = billboard(p, 0.16 + blink * 0.3);
}`;

export class Plaza {
  readonly group = new THREE.Group();
  readonly world: WorldUniforms;
  readonly sun: THREE.DirectionalLight;
  readonly fire: Campfire;
  private smoke: SmokeSystem;
  private cat: CritterMesh;
  private noise = new Noise2D(808);
  private sky: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private night = { value: 0 };
  private moonGlow = new THREE.Group();
  private hemi = new THREE.HemisphereLight("#8796e6", "#5a3e2c", 1.0);
  private rim = new THREE.DirectionalLight("#86a6ff", 0.9);
  private decor: Decor;
  private owned: Owned;

  constructor(
    owned: Owned,
    fireAt: THREE.Vector3,
    rugAt: THREE.Vector3,
  ) {
    this.owned = owned;
    const sunDir = new THREE.Vector3(-0.82, 0.07, -0.56).normalize();
    this.world = {
      uTime: { value: 0 },
      // Reason: the shared landmark/smoke materials only read uTime; the terrain textures are unused here
      uHeightTex: { value: owned.add(new THREE.Texture()) },
      uMaskTex: { value: owned.add(new THREE.Texture()) },
      uRegionTex: { value: owned.add(new THREE.Texture()) },
      uSunDir: { value: sunDir },
    };
    this.smoke = new SmokeSystem(this.world);
    this.sky = createSkyDome(sunDir, DUSK) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    this.group.add(this.sky, this.stars(), this.moon(owned));

    // Lights: warm low sun from the left, cool sky fill, a blue rim from behind
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#ffb27a", 1.7);
    this.sun.position.set(-14, 11, 7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -16;
    sc.right = sc.top = 16;
    sc.near = 1;
    sc.far = 60;
    this.group.add(this.sun, this.sun.target);
    this.rim.position.set(6, 7, -12);
    this.group.add(this.rim);

    this.group.add(this.ground(owned));
    this.group.add(this.vegetation(owned));
    this.group.add(this.fireflies());
    this.fire = new Campfire(fireAt, this.world, this.smoke, owned);
    this.group.add(this.fire.group);
    this.decor = new Decor(this.world, this.smoke, owned, rugAt, 2.75);
    this.group.add(this.decor.group);
    this.group.add(this.smoke.group);

    this.cat = new CritterMesh({ name: "ceremony-cat", geometry: catModel(), count: 1, animate: CAT_ANIM, castShadow: true, selfLit: 0.12 });
    this.group.add(this.cat.mesh);
  }

  /**
   * The same plaza after dark: a deep blue sky full of stars with a big moon, and the warm light of the fire and
   * the lanterns against it. Moonlight is the only cool light left, just enough to keep the far side of faces readable.
   */
  setNight(): void {
    const u = this.sky.material.uniforms;
    u.uZenith.value = NIGHT.zenith;
    u.uHorizon.value = NIGHT.horizon;
    u.uSunGlow.value = NIGHT.sunGlow;
    // Reason: the dome paints a sun disc at this direction; straight down, it shows none
    u.uSunDir.value = new THREE.Vector3(0, -1, 0);
    this.night.value = 1;
    this.moonGlow.scale.setScalar(1.7);

    this.hemi.color.set("#4256b0");
    this.hemi.groundColor.set("#33241c");
    this.hemi.intensity = 0.8;
    this.sun.color.set("#a4b8ff");
    this.sun.intensity = 0.55;
    this.sun.position.set(9, 15, -10);
    this.rim.intensity = 0.5;
    this.fire.power = 2.3;

    // Reason: smoke keeps its daytime white otherwise, and the chimneys look like cotton wool in the night sky
    this.smoke.group.traverse((o) => {
      const u = ((o as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms;
      if (u?.uColorA) {
        u.uColorA.value.multiplyScalar(0.3);
        u.uColorB.value.multiplyScalar(0.3);
      }
    });

    const glowMaterial = this.owned.add(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.2, 0.66, 0.26), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    for (const at of this.decor.lanterns) {
      const glow = new THREE.Sprite(glowMaterial);
      glow.position.copy(at);
      glow.scale.setScalar(2.7);
      glow.renderOrder = 3;
      this.group.add(glow);
    }
    // Reason: the lanterns stand behind the fire's reach; two lights pick the houses and the back benches out of the dark
    for (const x of [-9, 9]) {
      const light = new THREE.PointLight("#ffb765", 34, 26, 2);
      light.position.set(x, 3.4, -8.5);
      this.group.add(light);
    }
  }

  /** Height of the ground (flat plaza, rolling hills further out). */
  height(x: number, z: number): number {
    const r = Math.hypot(x - RING.x, z - RING.z);
    if (r < 17) return 0;
    const hills = 1.6 + this.noise.fbm(x * 0.035, z * 0.035, 3) * 2.8;
    // Reason: keep the land in front of the camera low so the hills only frame the back
    return smoothstep(17, 42, r) * hills * smoothstep(14, -4, z) * 2.2;
  }

  private ground(owned: Owned): THREE.Mesh {
    const size = 200;
    const geo = new THREE.PlaneGeometry(size, size, 200, 200).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const dirtA = new THREE.Color("#b07f52");
    const dirtB = new THREE.Color("#8e623e");
    const grassA = new THREE.Color("#3f7a30");
    const grassB = new THREE.Color("#6aa242");
    const far = new THREE.Color("#2f5a2c");
    const c = new THREE.Color();
    const g = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.height(x, z));
      const n = this.noise.fbm(x * 0.18, z * 0.18, 3);
      const r = Math.hypot(x - RING.x, z - RING.z);
      // Packed earth inside the circle, plus a path towards the camera
      const path = smoothstep(1.8, 1.1, Math.abs(x + Math.sin(z * 0.25) * 0.6)) * smoothstep(4, 7, z);
      const dirt = Math.max(1 - smoothstep(8.2, 9.6, r + n * 1.6), path);
      c.copy(dirtA).lerp(dirtB, smoothstep(-0.4, 0.6, this.noise.noise(x * 0.5, z * 0.5)));
      g.copy(grassA).lerp(grassB, smoothstep(-0.5, 0.7, n)).lerp(far, smoothstep(20, 50, r));
      c.lerp(g, 1 - dirt);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, owned.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
    mesh.receiveShadow = true;
    return mesh;
  }

  private free(x: number, z: number, pad: number): boolean {
    return BLOCKERS.every(([bx, bz, r]) => Math.hypot(x - bx, z - bz) > r + pad);
  }

  private vegetation(owned: Owned): THREE.Group {
    const group = new THREE.Group();
    const rand = mulberry32(99);
    const floraMat = owned.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
    const models = [roundTree(0), roundTree(1), roundTree(2), palmTree(1), bush(3), bush(4, "#e0263a")];
    const spots: THREE.Matrix4[][] = models.map(() => []);
    const place = (kind: number, x: number, z: number, s: number) => {
      spots[kind].push(new THREE.Matrix4().compose(new THREE.Vector3(x, this.height(x, z) - 0.1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28), new THREE.Vector3(s, s, s)));
    };
    for (let i = 0; i < 70; i++) {
      const a = Math.PI * (0.85 + rand() * 1.3);
      const r = 23 + rand() * 22;
      const x = RING.x + Math.cos(a) * r;
      const z = RING.z + Math.sin(a) * r;
      if (this.free(x, z, 1.5)) place(rand() < 0.15 ? 3 : Math.floor(rand() * 3), x, z, 1.1 + rand() * 0.7);
    }
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const r = 11.5 + rand() * 14;
      const x = RING.x + Math.cos(a) * r;
      const z = RING.z + Math.sin(a) * r;
      if (z < 7 && this.free(x, z, 0.5)) place(4 + (rand() < 0.3 ? 1 : 0), x, z, 0.9 + rand() * 0.6);
    }
    models.forEach((m, k) => {
      if (!spots[k].length) return;
      const inst = new THREE.InstancedMesh(m.geometry, floraMat, spots[k].length);
      spots[k].forEach((mx, i) => inst.setMatrixAt(i, mx));
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      group.add(inst);
    });

    // Grass tufts and little flowers on the grass around the plaza
    const tuft = this.tuftGeometry();
    const tuftMat = owned.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
    const tufts = new THREE.InstancedMesh(tuft, tuftMat, 1400);
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 1), owned.add(new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: "#ffffff", emissiveIntensity: 0.15 })), 260);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const palette = ["#ff6fa8", "#ffd23f", "#ffffff", "#b47cff", "#ff8c3a"].map((h) => new THREE.Color(h));
    let nt = 0;
    let nf = 0;
    for (let tries = 0; tries < 6000 && (nt < tufts.count || nf < flowers.count); tries++) {
      const x = (rand() - 0.5) * 64;
      const z = (rand() - 0.5) * 50 - 4;
      const r = Math.hypot(x - RING.x, z - RING.z);
      if (r < 9.3 + this.noise.fbm(x * 0.18, z * 0.18, 3) * 1.6 || Math.abs(x) < 2 && z > 4 || !this.free(x, z, 0.2)) continue;
      const y = this.height(x, z);
      if (nt < tufts.count) {
        const s = 0.7 + rand() * 0.8;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
        tufts.setMatrixAt(nt++, m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * (0.8 + rand() * 0.6), s)));
      }
      if (nf < flowers.count && rand() < 0.25) {
        flowers.setMatrixAt(nf, m.makeTranslation(x + 0.2, y + 0.28 + rand() * 0.1, z));
        flowers.setColorAt(nf++, palette[Math.floor(rand() * palette.length)]);
      }
    }
    tufts.count = nt;
    flowers.count = nf;
    tufts.receiveShadow = true;
    for (const im of [tufts, flowers]) im.computeBoundingSphere();
    group.add(tufts, flowers);
    return group;
  }

  /** A clump of five bent grass blades, dark at the root, sunlit at the tips. */
  private tuftGeometry(): THREE.BufferGeometry {
    const verts: number[] = [];
    const cols: number[] = [];
    const root = new THREE.Color("#2c5a24");
    const tip = new THREE.Color("#8cc85a");
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + i;
      const lean = 0.12 + (i % 2) * 0.1;
      const h = 0.38 + (i % 3) * 0.1;
      const bx = Math.cos(a) * 0.05;
      const bz = Math.sin(a) * 0.05;
      const w = 0.045;
      const px = Math.cos(a + 1.57) * w;
      const pz = Math.sin(a + 1.57) * w;
      verts.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
      cols.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    // Reason: point the blade normals upwards so both faces catch the light like a lawn
    const n = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
    return g;
  }

  private stars(): THREE.Points {
    const rand = mulberry32(5);
    const n = 600;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rand() * 2 - 1, rand() * 0.9 + 0.1, rand() * 2 - 1).normalize().multiplyScalar(900);
      pos.set([v.x, v.y, v.z], i * 3);
      seed[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.world.uTime, uNight: this.night },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = -1;
    return pts;
  }

  private moon(owned: Owned): THREE.Group {
    const g = this.moonGlow;
    const dir = new THREE.Vector3(0.42, 0.36, -0.83).normalize().multiplyScalar(700);
    const disc = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 16), owned.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.1, 1.8), fog: false })));
    const halo = new THREE.Sprite(owned.add(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(0.7, 0.75, 1.0), blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
    halo.scale.setScalar(150);
    g.add(disc, halo);
    g.position.copy(dir);
    return g;
  }

  private fireflies(): THREE.Mesh {
    const rand = mulberry32(12);
    const n = 70;
    const base = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.8 + rand() * 1.4);
      const r = 9 + rand() * 8;
      base.set([RING.x + Math.cos(a) * r, 0.5 + rand() * 2.2, RING.z + Math.sin(a) * r, rand() * 100], i * 4);
    }
    const mat = particleMaterial({
      uniforms: { uTime: this.world.uTime, uTex: { value: glowTexture() } },
      vertexShader: FIREFLY_VERT,
      fragmentShader: GLOW_FRAG,
      additive: true,
    });
    return particleMesh(quadGeometry(n, { aBase: [base, 4] }), mat, 3);
  }

  update(dt: number, time: number, camera: THREE.Camera): void {
    this.world.uTime.value = time;
    this.fire.update(dt, time, camera);
    // Reason: yaw 2.6 curls the sleepy cat's face towards the camera, its back to the fire
    this.cat.set(0, this.fire.at.x + 1.75, 0, this.fire.at.z + 1.1, 2.6, 0, 0, time * 1.6, 1.3);
    this.cat.commit();
  }
}
