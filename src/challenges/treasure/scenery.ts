/**
 * Set dressing of the treasure island: swaying palms, bushes and beach grass,
 * shells and starfish on the sand, rocks, the old shipwreck, Tadeo's beached
 * sailboat, a barrel and crate washed ashore, and the main island with its
 * smoking volcano on the horizon. Static props are merged into one mesh per
 * material; plants and beach finds are instanced.
 */

import * as THREE from "three";
import { merge } from "../../core/geo";
import { mulberry32, Noise2D, smoothstep } from "../../core/noise";
import { UNFLIPPED_NORMAL_GLSL } from "../../core/glsl";
import { emptyModel, addModel, rockBlob, stoneFn, pointDir } from "../../world/models/shapes";
import { palmTree, bush } from "../../world/models/flora";
import { shipwreck, sailboat } from "../../world/models/boats";
import { barrel, crate } from "../../world/models/props";
import { SignAtlas } from "../../world/models/signs";
import { createMaterials } from "../../world/models/effects";
import { SmokeSystem } from "../../world/ambient/Smoke";
import { WorldUniforms } from "../../world/Terrain";
import { Owned } from "../shared/dispose";
import { Ground, ISLAND, X_AT } from "./terrain";

/** Circles Tadeo can't walk through: [x, z, radius]. */
export const BLOCKERS: [number, number, number][] = [];

/** Palms: x, z, model variant, scale. */
const PALMS: [number, number, number, number][] = [
  [-6, -9.2, 0, 1.05], [-2.6, -11, 1, 1.15], [1.8, -10.4, 2, 1.0], [4.8, -8.6, 0, 0.95], [-8.8, -6.4, 1, 1.0],
  [7.8, -6.8, 2, 1.1], [-10.2, -1.8, 0, 0.95], [-9.4, 1.8, 2, 1.05], [10.4, -2.8, 1, 1.0], [9.4, 0.9, 0, 0.9],
  [-6.8, 4.2, 1, 1.0], [7.2, 3.4, 2, 0.9], [-4.4, -3.6, 0, 0.85], [4.9, -4.2, 1, 0.9],
];

/** Tadeo's sailboat, nosed onto the south beach. */
export const BOAT_AT = new THREE.Vector3(4.6, -0.28, 8.3);
/** Where Tadeo stands after hopping off the boat. */
export const LANDING = new THREE.Vector2(2.5, 3.7);

/** Place a model with yaw, uniform scale and a little tilt (half-buried things). */
function place(x: number, y: number, z: number, yaw: number, scale = 1, tiltX = 0, tiltZ = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, yaw, tiltZ, "YXZ")),
    new THREE.Vector3(scale, scale, scale),
  );
}

/** Vertex-coloured standard material whose upper parts sway in the breeze (palms, grass). */
function swayMaterial(uTime: { value: number }, start: number, amp: number, key: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float sway = max(position.y - ${start.toFixed(2)}, 0.0) * ${amp.toFixed(3)};
      float ph = ip.x * 0.37 + ip.z * 0.23;
      transformed.x += sin(uTime * 1.3 + ph) * sway + sin(uTime * 3.3 + ph * 2.0 + position.z) * sway * 0.3;
      transformed.z += cos(uTime * 1.05 + ph * 1.3) * sway * 0.6;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", UNFLIPPED_NORMAL_GLSL);
  };
  m.customProgramCacheKey = () => `treasure-sway-${key}`;
  return m;
}

export class Scenery {
  readonly group = new THREE.Group();
  private rand = mulberry32(77);
  private noise = new Noise2D(31);

  constructor(
    private ground: Ground,
    world: WorldUniforms,
    smoke: SmokeSystem,
    owned: Owned,
  ) {
    BLOCKERS.length = 0;
    this.plants(world.uTime, owned);
    this.beachFinds(owned);
    this.props(world, owned);
    this.mainIsland(smoke, owned);
  }

  private h(x: number, z: number): number {
    return this.ground.heightAt(x, z);
  }

  private plants(uTime: { value: number }, owned: Owned): void {
    const models = [palmTree(0), palmTree(1), palmTree(2)];
    const palmMat = owned.add(swayMaterial(uTime, 2.4, 0.045, "palm"));
    const m = new THREE.Matrix4();
    models.forEach((model, k) => {
      const list = PALMS.filter((p) => p[2] === k);
      const inst = new THREE.InstancedMesh(model.geometry, palmMat, list.length);
      list.forEach(([x, z, , s], i) => {
        // Reason: palms lean out towards the sea, like real beach palms
        const yaw = pointDir(x - ISLAND.cx, z - ISLAND.cz) + (this.rand() - 0.5) * 0.6;
        inst.setMatrixAt(i, m.compose(new THREE.Vector3(x, this.h(x, z) - 0.15, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s)));
        BLOCKERS.push([x, z, 0.45]);
      });
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      this.group.add(inst);
    });

    // Bushes (some with red blossoms) on the dune
    const bushMat = owned.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    const bushes: [number, number, number][] = [[-5, -7.4, 0], [-3.4, -8.6, 1], [0.2, -8.4, 0], [2.6, -7.6, 1], [-7.6, -4.6, 0], [6.6, -5.4, 1], [-1.6, -6.6, 1], [5.6, -7.6, 0]];
    [bush(3), bush(4, "#ff3b6b")].forEach((model, k) => {
      const list = bushes.filter((b) => b[2] === k);
      const inst = new THREE.InstancedMesh(model.geometry, bushMat, list.length);
      list.forEach(([x, z], i) => {
        const s = 0.9 + this.rand() * 0.5;
        inst.setMatrixAt(i, m.compose(new THREE.Vector3(x, this.h(x, z) - 0.08, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rand() * 6.28), new THREE.Vector3(s, s, s)));
      });
      inst.castShadow = true;
      inst.computeBoundingSphere();
      this.group.add(inst);
    });

    // Beach grass tufts on the dry sand and the dune edges
    const grass = new THREE.InstancedMesh(this.grassGeometry(), owned.add(swayMaterial(uTime, 0.1, 0.12, "grass")), 260);
    let n = 0;
    for (let tries = 0; tries < 4000 && n < grass.count; tries++) {
      const x = (this.rand() - 0.5) * 26;
      const z = -2.5 + (this.rand() - 0.5) * 21;
      const y = this.h(x, z);
      const clump = this.noise.fbm(x * 0.25, z * 0.25, 2);
      if (y < 0.45 || clump < 0.15 || Math.hypot(x - X_AT.x, z - X_AT.y) < 4.2 || Math.abs(x - 1.6) < 1.6 && z > 0) continue;
      const s = 0.7 + this.rand() * 0.7;
      grass.setMatrixAt(n++, m.compose(new THREE.Vector3(x, y - 0.03, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rand() * 6.28), new THREE.Vector3(s, s * (0.8 + this.rand() * 0.6), s)));
    }
    grass.count = n;
    grass.receiveShadow = true;
    grass.computeBoundingSphere();
    this.group.add(grass);
  }

  /** Six thin blades, darker at the root and sun-bleached at the tips. */
  private grassGeometry(): THREE.BufferGeometry {
    const verts: number[] = [];
    const cols: number[] = [];
    const root = new THREE.Color("#5f9a3a");
    const tip = new THREE.Color("#d8e27a");
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + i * 0.7;
      const lean = 0.16 + (i % 2) * 0.12;
      const hgt = 0.45 + (i % 3) * 0.14;
      const w = 0.035;
      const px = Math.cos(a + 1.57) * w;
      const pz = Math.sin(a + 1.57) * w;
      verts.push(-px, 0, -pz, px, 0, pz, Math.cos(a) * lean, hgt, Math.sin(a) * lean);
      cols.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, nrm.getX(i) * 0.3, 1, nrm.getZ(i) * 0.3);
    return g;
  }

  /** Shells and starfish scattered along the beach (more of them near the waterline). */
  private beachFinds(owned: Owned): void {
    const scallop = new THREE.SphereGeometry(0.11, 12, 4, 0, Math.PI, 0, Math.PI / 2).scale(1, 0.4, 1);
    const sp = scallop.attributes.position as THREE.BufferAttribute;
    const stripes = new Float32Array(sp.count * 3);
    for (let i = 0; i < sp.count; i++) {
      const v = 0.82 + 0.18 * Math.sign(Math.sin(Math.atan2(sp.getZ(i), sp.getX(i)) * 9));
      stripes.set([v, v, v], i * 3);
    }
    scallop.setAttribute("color", new THREE.BufferAttribute(stripes, 3));
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 ? 0.055 : 0.15;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starGeo = new THREE.ExtrudeGeometry(star, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.02, bevelSegments: 2 }).rotateX(-Math.PI / 2);
    starGeo.deleteAttribute("uv");
    const kinds = [
      { geo: scallop, count: 40, colors: ["#ffd2c2", "#ffe9d6", "#ffb3a8", "#fff4ea"], vc: true },
      { geo: scallop.clone().scale(1.5, 1.3, 1.5), count: 14, colors: ["#ff9fb8", "#ffcf9a", "#f7e7d0"], vc: true },
      { geo: starGeo, count: 14, colors: ["#ff7b3a", "#ff5a7a", "#a45cff", "#ffc23a"], vc: false },
    ];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const k of kinds) {
      const mat = owned.add(new THREE.MeshStandardMaterial({ vertexColors: k.vc, roughness: 0.55, emissive: "#ffffff", emissiveIntensity: 0.08 }));
      const inst = new THREE.InstancedMesh(k.geo, mat, k.count);
      let n = 0;
      for (let tries = 0; tries < 3000 && n < k.count; tries++) {
        const x = (this.rand() - 0.5) * 28;
        const z = -2.5 + (this.rand() - 0.5) * 23;
        const y = this.h(x, z);
        // Reason: most finds lie in the wet band the waves left behind, a few on the dry sand
        const wet = y > 0.04 && y < 0.3;
        if (!(wet || (y > 0.3 && y < 0.6 && this.rand() < 0.15)) || Math.hypot(x - X_AT.x, z - X_AT.y) < 3) continue;
        q.setFromEuler(new THREE.Euler((this.rand() - 0.5) * 0.3, this.rand() * 6.28, (this.rand() - 0.5) * 0.3));
        const s = 0.8 + this.rand() * 0.6;
        inst.setMatrixAt(n, m.compose(new THREE.Vector3(x, y + 0.01, z), q, new THREE.Vector3(s, s, s)));
        inst.setColorAt(n++, new THREE.Color(k.colors[Math.floor(this.rand() * k.colors.length)]));
      }
      inst.count = n;
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      this.group.add(inst);
    }
  }

  /** Rocks, the shipwreck, the beached sailboat and flotsam: merged per material. */
  private props(world: WorldUniforms, owned: Owned): void {
    const mats = createMaterials(world);
    Object.values(mats).forEach((m) => owned.add(m));
    const all = emptyModel();
    const rocks: [number, number, number][] = [[-12.4, 1.6, 1.3], [-11.6, 3.2, 0.8], [11.8, -5.8, 1.4], [12.6, -3.9, 0.9], [-4.2, -13.4, 1.1], [6.6, -12.4, 0.9], [-12.2, -7.4, 1.0], [10.2, 4.6, 0.7]];
    for (const [x, z, s] of rocks) {
      const blob = rockBlob(Math.round(x * 7 + z), [s * 1.3, s * 0.9, s], stoneFn("#a89f92", 0.15, this.rand));
      all.solid.push(blob.translate(x, this.h(x, z) + s * 0.25, z));
      BLOCKERS.push([x, z, s * 1.1]);
    }
    // The old pirate wreck half-buried on the west beach
    const wr: [number, number] = [-8.8, -4.0];
    addModel(all, shipwreck(3), place(wr[0], this.h(wr[0], wr[1]) - 0.55, wr[1], 1.1, 1.15, 0.12, 0.33));
    BLOCKERS.push([wr[0], wr[1], 2.2], [wr[0] - 1.2, wr[1] - 1.4, 1.4], [wr[0] + 1.2, wr[1] + 1.4, 1.4]);

    // Tadeo's boat (the red one from the north dock), nosed onto the sand
    const atlas = new SignAtlas();
    owned.add(atlas.texture);
    owned.add(atlas.material);
    const boatColors = { hull: "#d24a35", stripe: "#fff4e0", sail: ["#2f9a8f", "#fff4e0"] as [string, string], pennant: "#3f7fbf" };
    addModel(all, sailboat(atlas, boatColors, null, 23), place(BOAT_AT.x, BOAT_AT.y, BOAT_AT.z, Math.PI / 2 + 0.35, 1.1, 0.02, 0.1));
    BLOCKERS.push([BOAT_AT.x, BOAT_AT.z, 1.3], [BOAT_AT.x - 0.8, BOAT_AT.z - 2.0, 0.9]);

    // Flotsam
    addModel(all, barrel(41, 1.0), place(-5.2, this.h(-5.2, 5.6) - 0.1, 5.6, 0.4, 1, 1.35, 0.2));
    addModel(all, crate(43, 0.75), place(6.8, this.h(6.8, 2.1) - 0.12, 2.1, 0.6, 1, 0.1, 0.15));
    BLOCKERS.push([-5.2, 5.6, 0.7], [6.8, 2.1, 0.6]);

    const make = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadows: boolean) => {
      if (!geos.length) return;
      const mesh = new THREE.Mesh(merge(geos), mat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      this.group.add(mesh);
    };
    make(all.solid, mats.solid, true);
    make(all.cloth, mats.cloth, true);
    make(all.glow, mats.glow, false);
    make(all.dark, mats.dark, false);
  }

  /** The big island on the horizon: green hills, a beach rim and the smoking volcano. */
  private mainIsland(smoke: SmokeSystem, owned: Owned): void {
    const at = new THREE.Vector3(-70, 0, -430);
    const land = new THREE.IcosahedronGeometry(1, 10);
    const pos = land.attributes.position as THREE.BufferAttribute;
    const volcano = new THREE.Vector2(-40, -18);
    const c = new THREE.Color();
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * 170;
      const z = pos.getZ(i) * 70;
      let y = Math.max(pos.getY(i), 0) * 34 * (0.65 + this.noise.fbm(x * 0.02, z * 0.02, 3) * 0.7) - 6;
      // The volcano cone with a crater on top
      const dv = Math.hypot(x - volcano.x, z - volcano.y);
      const cone = Math.max(0, 1 - dv / 70) ** 1.25 * 92;
      const crater = (1 - smoothstep(5, 12, dv)) * 10;
      y = Math.max(y, cone - crater);
      pos.setXYZ(i, x, y, z);
      const sandBand = 1 - smoothstep(1, 3.5, y);
      const rock = smoothstep(42, 64, y);
      c.set("#4f9a3a").lerp(new THREE.Color("#2f6f2c"), smoothstep(10, 30, y + this.noise.noise(x * 0.05, z * 0.05) * 8));
      c.lerp(new THREE.Color("#8a7766"), rock).lerp(new THREE.Color("#4a403c"), smoothstep(70, 84, y));
      c.lerp(new THREE.Color("#f2e3bd"), sandBand);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    land.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    land.computeVertexNormals();
    const mesh = new THREE.Mesh(land, owned.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })));
    mesh.position.copy(at);
    mesh.rotation.y = 0.12;
    this.group.add(mesh);
    // Reason: the crater rim sits ~82 m up; puffs start just above it so the plume rises out of the cone
    const peak = new THREE.Vector3(volcano.x, 84, volcano.y).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.12).add(at);
    smoke.add([peak], "volcano");
  }
}
