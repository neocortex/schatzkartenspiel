/**
 * The treasure chest frozen in a block of ice: a faceted, see-through ice
 * block whose painted crack texture grows with every hammer blow, the golden
 * key turning in the lock, the springy lid, and what is inside — a glowing
 * heap of gold, a golden light beam with turning rays, and the crown.
 */

import * as THREE from "three";
import { createChest, createKey } from "../../world/models/items";
import { mat, toonMesh } from "../../characters/parts";
import { hash2 } from "../../core/noise";
import { Owned } from "../shared/dispose";

const ICE = { w: 1.8, h: 1.5, d: 1.35 };

/** A small golden crown with jewels; origin at the bottom of the band. */
export function createCrown(): THREE.Group {
  const g = new THREE.Group();
  const gold = mat("#ffc83d", 0.25, 0.5);
  const band = toonMesh(new THREE.CylinderGeometry(0.3, 0.27, 0.17, 28, 1, true), gold);
  band.position.y = 0.085;
  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat("#c41e3a", 0.7));
  inner.scale.y = 0.75;
  inner.position.y = 0.02;
  g.add(band, inner);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = toonMesh(new THREE.ConeGeometry(0.075, 0.22, 4), gold);
    spike.position.set(Math.sin(a) * 0.29, 0.27, Math.cos(a) * 0.29);
    spike.rotation.set(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12);
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), mat("#fff6e6", 0.3, 0.6));
    pearl.position.set(Math.sin(a) * 0.31, 0.39, Math.cos(a) * 0.31);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), mat(i % 2 ? "#3d8bff" : "#ff2d55", 0.2, 1.4));
    gem.position.set(Math.sin(a) * 0.305, 0.09, Math.cos(a) * 0.305);
    gem.lookAt(gem.position.clone().multiplyScalar(2));
    g.add(spike, pearl, gem);
  }
  return g;
}

/** Faceted ice block: a subdivided box with jittered corners, flat-shaded. */
function iceGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(ICE.w, ICE.h, ICE.d, 3, 3, 3).toNonIndexed();
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Reason: jitter by a hash of the original position so shared corners move together (no gaps)
    const h1 = hash2(Math.round(x * 100) + Math.round(z * 37), Math.round(y * 100)) - 0.5;
    const h2 = hash2(Math.round(z * 100), Math.round(x * 53) + Math.round(y * 100)) - 0.5;
    pos.setXYZ(i, x * (1 + h1 * 0.12), y + h2 * 0.08 + (y > 0 ? h1 * 0.12 : 0), z * (1 + h2 * 0.12));
  }
  g.translate(0, ICE.h / 2 - 0.04, 0);
  g.computeVertexNormals();
  return g;
}

/** Frosty blue base with bubbles; `crack()` paints glowing white fractures on top. */
class CrackTexture {
  readonly texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;

  constructor() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 512;
    this.g = cv.getContext("2d")!;
    const g = this.g;
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "rgba(205, 242, 255, 0.5)");
    grad.addColorStop(1, "rgba(110, 196, 236, 0.62)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,255,${0.12 + Math.random() * 0.3})`;
      g.beginPath();
      g.arc(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3.5, 0, Math.PI * 2);
      g.fill();
    }
    // Frosty streaks
    g.strokeStyle = "rgba(255,255,255,0.22)";
    g.lineWidth = 10;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      const y = Math.random() * 512;
      g.moveTo(0, y);
      g.lineTo(512, y - 120 + Math.random() * 60);
      g.stroke();
    }
    this.texture = new THREE.CanvasTexture(cv);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  /** Paint `count` branching cracks radiating from random points near the middle. */
  crack(count: number): void {
    const g = this.g;
    g.lineCap = "round";
    g.lineJoin = "round";
    for (let c = 0; c < count; c++) {
      const x = 140 + Math.random() * 232;
      const y = 120 + Math.random() * 272;
      const arms = 3 + Math.floor(Math.random() * 3);
      for (let a = 0; a < arms; a++) this.branch(x, y, Math.random() * Math.PI * 2, 5.5, 0);
    }
    this.texture.needsUpdate = true;
  }

  private branch(x: number, y: number, dir: number, width: number, depth: number): void {
    const g = this.g;
    const steps = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < steps; i++) {
      dir += (Math.random() - 0.5) * 0.9;
      const len = 14 + Math.random() * 30;
      const nx = x + Math.cos(dir) * len;
      const ny = y + Math.sin(dir) * len;
      g.shadowColor = "rgba(190, 240, 255, 1)";
      g.shadowBlur = 8;
      g.strokeStyle = "rgba(255,255,255,0.95)";
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(nx, ny);
      g.stroke();
      g.shadowBlur = 0;
      if (depth < 2 && Math.random() < 0.3) this.branch(nx, ny, dir + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6), width * 0.6, depth + 1);
      x = nx;
      y = ny;
      width = Math.max(1.2, width * 0.82);
    }
  }
}

export class TreasureChest {
  readonly group = new THREE.Group();
  /** Chest and ice move together (they rise out of the dug hole). */
  readonly body = new THREE.Group();
  readonly lid: THREE.Group;
  readonly crown = createCrown();
  readonly beam = new THREE.Group();
  readonly light = new THREE.PointLight("#ffc65a", 0, 0, 2);
  /** Where the lock is, in world space (updated each frame). */
  readonly lockWorld = new THREE.Vector3();
  private ice = new THREE.Group();
  private iceFront: THREE.MeshStandardMaterial;
  private iceBack: THREE.MeshStandardMaterial;
  private rim = { value: 0.9 };
  private cracks = new CrackTexture();
  private lock: THREE.Object3D;
  private keyPivot = new THREE.Group();
  private key = createKey();
  private beamMat: THREE.ShaderMaterial;
  private heap: THREE.Mesh;
  private squash = 0;
  private squashVel = 0;
  private flash = 0;
  private lidAngle = 0;
  private lidVel = 0;
  private lidTarget = 0;
  private keyIn = 0;
  private keyInTarget = 0;
  private keyTurn = 0;
  private keyTurnTarget = 0;
  private jiggle = 0;
  private beamGrow = 0;
  private beamOn = false;
  private time = 0;

  constructor(owned: Owned) {
    const { group: chest, lid } = createChest();
    this.lid = lid;
    this.lock = lid.children[1];
    this.body.add(chest);

    // Ice: back faces first, then the front faces, so the chest shows through both layers
    owned.add(this.cracks.texture);
    const iceMat = (side: THREE.Side, opacity: number) => {
      const m = new THREE.MeshStandardMaterial({ color: "#ffffff", map: this.cracks.texture, emissiveMap: this.cracks.texture, emissive: "#8fdcff", emissiveIntensity: 0.35, roughness: 0.1, transparent: true, opacity, depthWrite: false, side });
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uRim = this.rim;
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uRim;").replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          // Reason: icy fresnel rim — edges catch the light like real ice
          float fres = pow(clamp(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 2.2);
          totalEmissiveRadiance += vec3(0.6, 0.9, 1.0) * fres * uRim;`,
        );
      };
      m.customProgramCacheKey = () => `treasure-ice-${side}`;
      return owned.add(m);
    };
    this.iceBack = iceMat(THREE.BackSide, 0.7);
    this.iceFront = iceMat(THREE.FrontSide, 1);
    const geo = iceGeometry();
    const back = new THREE.Mesh(geo, this.iceBack);
    back.renderOrder = 2;
    const front = new THREE.Mesh(geo, this.iceFront);
    front.renderOrder = 3;
    front.castShadow = true;
    // Frost crystals poking out of the top
    const crystalMat = owned.add(new THREE.MeshStandardMaterial({ color: "#d9f6ff", roughness: 0.15, emissive: "#9fe2ff", emissiveIntensity: 0.45, transparent: true, opacity: 0.85, flatShading: true }));
    for (const [x, z, s, tilt] of [[-0.55, 0.2, 1, 0.3], [-0.3, -0.25, 0.7, -0.2], [0.5, 0.15, 0.85, -0.35], [0.7, -0.35, 0.6, 0.25], [0.05, -0.4, 0.55, 0.1]]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.13 * s, 0.55 * s, 5), crystalMat);
      c.position.set(x, ICE.h - 0.05 + 0.2 * s, z);
      c.rotation.set(tilt, x * 3, tilt * -0.8);
      c.renderOrder = 3;
      this.ice.add(c);
    }
    this.ice.add(back, front);
    this.body.add(this.ice);

    // The golden key, attached to the lid's lock so it swings up with the lid
    this.key.scale.setScalar(0.55);
    this.key.rotation.x = Math.PI / 2;
    this.keyPivot.position.set(0, -0.02, 0.87);
    this.keyPivot.add(this.key);
    this.keyPivot.visible = false;
    lid.add(this.keyPivot);

    // Inside: a glowing heap of gold
    this.heap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat("#ffd24a", 0.3, 0.9));
    this.heap.scale.set(1.05, 0.42, 0.68);
    this.heap.position.y = 0.56;
    this.body.add(this.heap);

    this.beamMat = this.beamMaterial();
    owned.add(this.beamMat);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.5, 11, 32, 1, true).translate(0, 5.5, 0), this.beamMat);
    shaft.renderOrder = 5;
    this.beam.add(shaft);
    for (let i = 0; i < 5; i++) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 9).translate(0, 4.5, 0), this.beamMat);
      ray.rotation.y = (i / 5) * Math.PI;
      ray.rotation.z = (i % 2 ? 1 : -1) * 0.12;
      ray.renderOrder = 5;
      this.beam.add(ray);
    }
    this.beam.position.y = 0.6;
    this.beam.scale.set(1, 0.001, 1);
    this.beam.visible = false;
    this.light.position.set(0, 1.6, 0.4);
    this.body.add(this.beam, this.light);

    this.crown.visible = false;
    this.group.add(this.body, this.crown);
  }

  private beamMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vFacing;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          vFacing = abs(dot(n, normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uPower;
        varying vec2 vUv;
        varying float vFacing;
        void main() {
          // Reason: clamp every pow() base — a tiny negative from interpolation gives NaN on Metal, and bloom spreads one NaN pixel over the whole frame
          float fade = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.04, vUv.y);
          float streak = 0.65 + 0.35 * sin(vUv.x * 37.0 + uTime * 2.5) * sin(vUv.x * 11.0 - uTime * 1.3 + vUv.y * 6.0);
          float edge = pow(clamp(vFacing, 0.0, 1.0), 1.4);
          vec3 col = vec3(2.4, 1.75, 0.6) * fade * streak * edge * uPower;
          gl_FragColor = vec4(col, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  get hasIce(): boolean {
    return this.ice.visible;
  }

  /** A hammer blow: new cracks, a squash of the block and a bright rim flash. */
  hit(perfect: boolean): void {
    this.cracks.crack(perfect ? 3 : 1 + (Math.random() < 0.5 ? 1 : 0));
    this.squashVel -= perfect ? 5.5 : 3.5;
    this.flash = perfect ? 2.2 : 1.4;
  }

  shatter(): void {
    this.ice.visible = false;
    this.squashVel = -4;
  }

  /** 0 hidden, 1 key pushed into the lock, 2 jiggling, 3 turned (unlocked). */
  setKeyStage(stage: number): void {
    this.keyPivot.visible = stage > 0;
    this.keyInTarget = stage > 0 ? 1 : 0;
    if (stage === 2) this.jiggle = 0.6;
    this.keyTurnTarget = stage >= 3 ? Math.PI / 2 : stage === 2 ? 0.35 : 0;
  }

  /** Spring the lid open and start the golden glow. */
  open(): void {
    this.lidTarget = -2.05;
    this.lidVel = -9;
    this.beamOn = true;
    this.beam.visible = true;
  }

  update(dt: number, time: number): void {
    this.time = time;
    // Ice block squash spring
    this.squashVel += (-this.squash * 160 - this.squashVel * 10) * dt;
    this.squash += this.squashVel * dt;
    this.body.scale.set(1 - this.squash * 0.04, 1 + this.squash * 0.06, 1 - this.squash * 0.04);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.rim.value = 0.9 + this.flash;
    this.iceFront.emissiveIntensity = 0.35 + this.flash * 0.5;

    // Key: slide in, wiggle, turn
    this.keyIn += (this.keyInTarget - this.keyIn) * Math.min(dt * 9, 1);
    this.keyTurn += (this.keyTurnTarget - this.keyTurn) * Math.min(dt * 12, 1);
    this.jiggle = Math.max(0, this.jiggle - dt);
    this.key.position.z = (1 - this.keyIn) * 0.7;
    this.keyPivot.rotation.z = this.keyTurn + Math.sin(time * 40) * this.jiggle * 0.25;

    // Lid spring with a little overshoot
    this.lidVel += ((this.lidTarget - this.lidAngle) * 70 - this.lidVel * 7) * dt;
    this.lidAngle += this.lidVel * dt;
    this.lid.rotation.x = this.lidAngle;

    if (this.beamOn) {
      this.beamGrow = Math.min(1, this.beamGrow + dt * 0.9);
      const g = 1 - (1 - this.beamGrow) ** 3;
      this.beam.scale.set(0.6 + g * 0.4, Math.max(g, 0.001), 0.6 + g * 0.4);
      this.beam.rotation.y = time * 0.35;
      this.beamMat.uniforms.uPower.value = g * (0.85 + Math.sin(time * 3.1) * 0.1);
      this.light.intensity = g * (26 + Math.sin(time * 5.3) * 3);
    }
    this.beamMat.uniforms.uTime.value = time;
    this.lock.getWorldPosition(this.lockWorld);
  }
}
