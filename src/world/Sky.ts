/**
 * Sky dome with a soft gradient, sun disc and glow, plus slowly drifting
 * puffy clouds built from merged spheres.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "../core/noise";

export interface SkyPalette {
  zenith: THREE.Color;
  horizon: THREE.Color;
  sunGlow: THREE.Color;
}

export const DAY_SKY: SkyPalette = {
  zenith: new THREE.Color("#3f8fe0"),
  horizon: new THREE.Color("#cfeaf6"),
  sunGlow: new THREE.Color("#ffe6b3"),
};

export function createSkyDome(sunDir: THREE.Vector3, palette: SkyPalette = DAY_SKY): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: palette.zenith },
      uHorizon: { value: palette.horizon },
      uSunGlow: { value: palette.sunGlow },
      uSunDir: { value: sunDir },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSunGlow;
      uniform vec3 uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.75, up), 0.7));
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunGlow * pow(sd, 8.0) * 0.55;
        col += uSunGlow * pow(sd, 64.0) * 0.8;
        col += vec3(1.0, 0.97, 0.9) * smoothstep(0.9993, 0.9997, sd) * 6.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.name = "sky";
  return mesh;
}

/** A field of fluffy cartoon clouds that drift with the wind and wrap around. */
export class Clouds {
  readonly group = new THREE.Group();
  private clouds: THREE.Mesh[] = [];
  private readonly range = 420;

  constructor(count = 22, seed = 7) {
    const rand = mulberry32(seed);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      emissive: new THREE.Color("#b8c8e6"),
      emissiveIntensity: 0.35,
    });
    for (let c = 0; c < count; c++) {
      const mesh = new THREE.Mesh(cloudGeometry(rand), mat);
      mesh.position.set((rand() - 0.5) * this.range * 2, 60 + rand() * 35, (rand() - 0.5) * this.range * 2);
      mesh.scale.setScalar(0.9 + rand() * 1.1);
      mesh.rotation.y = rand() * Math.PI;
      this.clouds.push(mesh);
      this.group.add(mesh);
    }
  }

  update(dt: number): void {
    for (const c of this.clouds) {
      c.position.x += dt * 2.2;
      c.position.z += dt * 0.8;
      if (c.position.x > this.range) c.position.x -= this.range * 2;
      if (c.position.z > this.range) c.position.z -= this.range * 2;
    }
  }
}

/** One cloud: a flat-bottomed cluster of puffs shaded like a single soft mass. */
function cloudGeometry(rand: () => number): THREE.BufferGeometry {
  const puffs: THREE.BufferGeometry[] = [];
  const len = 16 + rand() * 18;
  const depth = len * (0.35 + rand() * 0.2);
  const base = 7 + Math.floor(rand() * 4);
  for (let i = 0; i < base; i++) {
    const t = i / (base - 1) - 0.5;
    const r = 3.2 + rand() * 2.2 + (0.5 - Math.abs(t)) * 3;
    const g = new THREE.IcosahedronGeometry(r, 3);
    g.translate(t * len, r * 0.25, (rand() - 0.5) * depth);
    puffs.push(g);
  }
  const tops = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < tops; i++) {
    const r = 4.5 + rand() * 3.5;
    const g = new THREE.IcosahedronGeometry(r, 3);
    g.translate((rand() - 0.5) * len * 0.6, r * 0.75 + 1.5, (rand() - 0.5) * depth * 0.5);
    puffs.push(g);
  }
  const geo = mergeGeometries(puffs);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color("#ffffff");
  const bottom = new THREE.Color("#b9c7e0");
  const c = new THREE.Color();
  const n = new THREE.Vector3();
  const radial = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    // Reason: flatten the underside so clouds sit on a level base like painted clouds
    const y = Math.max(pos.getY(i), 0);
    pos.setY(i, y);
    radial.set(pos.getX(i) / (len * 0.6), (y - 3) / 6, pos.getZ(i) / (depth * 0.6)).normalize();
    n.fromBufferAttribute(nrm, i).lerp(radial, 0.5).normalize();
    if (y < 0.01) n.set(0, -1, 0);
    nrm.setXYZ(i, n.x, n.y, n.z);
    c.copy(bottom).lerp(top, THREE.MathUtils.smoothstep(y, 0, 7));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}
