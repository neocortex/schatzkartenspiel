/**
 * The four ceremony drums laid out as a cross around Tadeo, one per arrow key
 * (up = far, down = near, left, right), each in its Simon colour with a big
 * glowing arrow painted on the skin and a key cap hovering above it. A hit
 * makes the drum flash, squash and bounce, sends out a ring wave and music
 * notes, plays its tone and tints a shared point light in its colour.
 */

import * as THREE from "three";
import { part, merge } from "../../core/geo";
import { pole, rbox } from "../../world/models/shapes";
import { toonMesh } from "../../characters/parts";
import { audio } from "../../audio/Audio";
import { Particles } from "../shared/particles";
import { keycapTexture, noteTexture } from "./textures";
import { Owned } from "../shared/dispose";
import { KEY_GLYPH } from "./hud";

export const DRUM_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;
export type DrumKey = (typeof DRUM_KEYS)[number];

export const DRUM_INFO: Record<DrumKey, { color: string; dir: [number, number]; sfx: string; name: string }> = {
  ArrowUp: { color: "#3fcf5a", dir: [0, -1], sfx: "sfx_simon_panel_up", name: "grün" },
  ArrowDown: { color: "#f04848", dir: [0, 1], sfx: "sfx_simon_panel_down", name: "rot" },
  ArrowLeft: { color: "#3b9cff", dir: [-1, 0], sfx: "sfx_simon_panel_left", name: "blau" },
  ArrowRight: { color: "#ffc21a", dir: [1, 0], sfx: "sfx_simon_panel_right", name: "gelb" },
};

const TOP = 0.8;

/** Barrel-shaped drum shell painted with stripes and a zig-zag band. */
function shellGeometry(color: THREE.Color): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.42, 0.04),
    new THREE.Vector2(0.49, 0.16),
    new THREE.Vector2(0.545, 0.42),
    new THREE.Vector2(0.53, 0.66),
    new THREE.Vector2(0.49, TOP),
  ];
  const lathe = new THREE.LatheGeometry(profile, 36);
  const dark = color.clone().multiplyScalar(0.78);
  const cream = new THREE.Color("#fff1d0");
  return part(lathe, (p) => {
    const a = (Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2);
    const tri = Math.abs(((a * 9) % 1) * 2 - 1);
    // Reason: a painted zig-zag band reads instantly as a "tribal drum" from far away
    if (p.y > 0.33 + tri * 0.13 && p.y < 0.43 + tri * 0.13) return cream;
    return Math.floor(a * 18) % 2 ? color : dark;
  });
}

/** Zig-zag lacing between the rims plus three little feet, as one painted geometry. */
function lacingGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 0.5) / n) * Math.PI * 2;
    const a2 = ((i + 1) / n) * Math.PI * 2;
    const top = (a: number): [number, number, number] => [Math.cos(a) * 0.515, TOP - 0.05, Math.sin(a) * 0.515];
    const bot = (a: number): [number, number, number] => [Math.cos(a) * 0.47, 0.12, Math.sin(a) * 0.47];
    parts.push(pole(top(a0), bot(a1), 0.018, "#f6e3b4", 4), pole(bot(a1), top(a2), 0.018, "#f6e3b4", 4));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    parts.push(rbox(0.16, 0.1, 0.16, "#5a3a22", { pos: [Math.cos(a) * 0.4, 0.03, Math.sin(a) * 0.4] }, 0.03));
  }
  return merge(parts);
}

/** Flat arrow (pointing towards -z) lying on the drum skin. */
function arrowGeometry(scale = 1): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.085, -0.27);
  s.lineTo(0.085, -0.27);
  s.lineTo(0.085, 0.02);
  s.lineTo(0.21, 0.02);
  s.lineTo(0, 0.28);
  s.lineTo(-0.21, 0.02);
  s.lineTo(-0.085, 0.02);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.scale(scale, scale, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

class Drum {
  readonly group = new THREE.Group();
  readonly color: THREE.Color;
  glow = 0;
  private body = new THREE.Group();
  private shellMat: THREE.MeshStandardMaterial;
  private skinMat: THREE.MeshStandardMaterial;
  private arrowMat: THREE.MeshBasicMaterial;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private ringAge = 9;
  private squash = 0;
  private squashVel = 0;
  readonly keycap: THREE.Sprite;
  private keycapShow = 0;
  private hint = 0;
  /** Height offset (drums sink into the ground for the maths trial). */
  level = 0;
  private levelNow = 0;

  constructor(readonly key: DrumKey, owned: Owned, cordMat: THREE.Material) {
    const info = DRUM_INFO[key];
    this.color = new THREE.Color(info.color);
    this.shellMat = owned.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: this.color, emissiveIntensity: 0.12 }));
    this.skinMat = owned.add(new THREE.MeshStandardMaterial({ color: "#f8ead0", roughness: 0.75, emissive: this.color, emissiveIntensity: 0.05 }));
    this.arrowMat = owned.add(new THREE.MeshBasicMaterial({ color: this.color.clone() }));

    const shell = toonMesh(shellGeometry(this.color), this.shellMat);
    const rimTop = toonMesh(new THREE.TorusGeometry(0.5, 0.05, 8, 36).rotateX(Math.PI / 2), owned.add(new THREE.MeshStandardMaterial({ color: "#6b4528", roughness: 0.6 })));
    rimTop.position.y = TOP;
    const rimBottom = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.045, 8, 30).rotateX(Math.PI / 2), rimTop.material);
    rimBottom.position.y = 0.08;
    const skin = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.04, 36), this.skinMat);
    skin.position.y = TOP;
    skin.receiveShadow = true;
    const lacing = new THREE.Mesh(lacingGeometry(), cordMat);
    lacing.castShadow = true;
    const [dx, dz] = info.dir;
    const yaw = Math.atan2(-dx, -dz);
    const arrowBack = new THREE.Mesh(arrowGeometry(1.22), owned.add(new THREE.MeshBasicMaterial({ color: "#3a2414" })));
    arrowBack.rotation.y = yaw;
    arrowBack.position.y = TOP + 0.024;
    const arrow = new THREE.Mesh(arrowGeometry(), this.arrowMat);
    arrow.rotation.y = yaw;
    arrow.position.y = TOP + 0.03;
    for (const m of [shell, rimBottom, lacing]) m.castShadow = true;
    this.body.add(shell, rimTop, rimBottom, skin, lacing, arrowBack, arrow);
    this.group.add(this.body);

    this.ringMat = owned.add(new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.68, 48).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.position.y = 0.03;
    this.ring.renderOrder = 3;
    this.group.add(this.ring);

    const cap = owned.add(keycapTexture(KEY_GLYPH[key], info.color));
    this.keycap = new THREE.Sprite(owned.add(new THREE.SpriteMaterial({ map: cap, transparent: true, depthWrite: false })));
    // Reason: hover the key cap outside the cross so Tadeo in the middle never hides it
    this.keycap.position.set(info.dir[0] * 0.5, 1.45, info.dir[1] * 0.35);
    this.keycap.scale.setScalar(0.001);
    this.keycap.renderOrder = 4;
    this.group.add(this.keycap);
  }

  hit(strength = 1): void {
    this.glow = Math.max(this.glow, strength);
    this.squashVel = -5.5 * strength;
    this.ringAge = 0;
  }

  /** Gentle "try me" pulse (practice round). */
  setHint(on: boolean): void {
    this.hint = on ? 1 : 0;
  }

  showKeycap(on: boolean): void {
    this.keycapShow = on ? 1 : 0;
  }

  update(dt: number, time: number): void {
    this.glow = Math.max(0, this.glow - dt * 2.2);
    // Damped spring for the squash-and-stretch bounce
    this.squashVel += (-170 * this.squash - 11 * this.squashVel) * dt;
    this.squash += this.squashVel * dt;
    const s = this.squash;
    this.body.scale.set(1 - s * 0.45, 1 + s, 1 - s * 0.45);

    const pulse = this.hint * (0.5 + 0.5 * Math.sin(time * 5)) * 0.35;
    const g = Math.max(this.glow, pulse);
    this.skinMat.emissiveIntensity = 0.05 + g * 2.6;
    this.shellMat.emissiveIntensity = 0.12 + g * 0.55;
    this.arrowMat.color.copy(this.color).multiplyScalar(0.85 + g * 4.5);

    this.ringAge += dt;
    const k = Math.min(this.ringAge / 0.6, 1);
    this.ring.scale.setScalar(1 + k * 1.7);
    this.ringMat.opacity = (1 - k) * (1 - k) * 0.9;

    const target = this.keycapShow;
    const cs = this.keycap.scale.x + (target * 0.62 - this.keycap.scale.x) * Math.min(dt * 9, 1);
    this.keycap.scale.setScalar(Math.max(cs, 0.001));
    this.keycap.position.y = 1.45 + Math.sin(time * 3 + this.color.r * 5) * 0.06;
    this.keycap.visible = cs > 0.01;

    this.levelNow += (this.level - this.levelNow) * Math.min(dt * 4, 1);
    this.group.position.y = this.levelNow;
    this.group.visible = this.levelNow > -1.05;
  }
}

export class Drums {
  readonly group = new THREE.Group();
  readonly drums = {} as Record<DrumKey, Drum>;
  readonly light: THREE.PointLight;
  private notes: Particles;
  private lightKey: DrumKey = "ArrowUp";

  constructor(
    readonly center: THREE.Vector3,
    radius: number,
    owned: Owned,
  ) {
    const cordMat = owned.add(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    for (const key of DRUM_KEYS) {
      const d = new Drum(key, owned, cordMat);
      const [dx, dz] = DRUM_INFO[key].dir;
      d.group.position.set(center.x + dx * radius, 0, center.z + dz * radius);
      this.drums[key] = d;
      this.group.add(d.group);
    }
    this.light = new THREE.PointLight("#ffffff", 0, 7, 1.6);
    this.group.add(this.light);

    const noteMat = owned.add(new THREE.MeshBasicMaterial({ map: owned.add(noteTexture()), transparent: true, depthWrite: false }));
    this.notes = new Particles({ geometry: new THREE.PlaneGeometry(0.42, 0.42), material: noteMat, max: 60, gravity: -1.6, drag: 0.9, billboard: true, renderOrder: 4 });
    this.group.add(this.notes.mesh);
  }

  position(key: DrumKey): THREE.Vector3 {
    return this.drums[key].group.position;
  }

  /** Hit a drum: flash, bounce, tone, notes and coloured light. */
  play(key: DrumKey, strength = 1): void {
    const d = this.drums[key];
    d.hit(strength);
    audio.playSfx(DRUM_INFO[key].sfx, 0.9);
    this.lightKey = key;
    const p = d.group.position;
    this.notes.emit(2, (n, k) => {
      n.pos.set(p.x + (k - 0.5) * 0.4, TOP + 0.35, p.z);
      n.vel.set((k - 0.5) * 1.6 + (Math.random() - 0.5) * 0.5, 2.2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4);
      n.rot.set(0, 0, (Math.random() - 0.5) * 0.6);
      n.spin.set(0, 0, (Math.random() - 0.5) * 2);
      n.color.copy(d.color).multiplyScalar(1.6);
      n.life = 1.3;
      n.size = 0.85 + Math.random() * 0.35;
    });
  }

  setHints(keys: readonly DrumKey[]): void {
    for (const k of DRUM_KEYS) this.drums[k].setHint(keys.includes(k));
  }

  showKeycaps(on: boolean): void {
    for (const k of DRUM_KEYS) this.drums[k].showKeycap(on);
  }

  /** Sink the drums into the ground (maths trial) or raise them again. */
  setRaised(up: boolean): void {
    for (const k of DRUM_KEYS) this.drums[k].level = up ? 0 : -1.1;
  }

  update(dt: number, time: number, camera: THREE.Camera): void {
    for (const k of DRUM_KEYS) this.drums[k].update(dt, time);
    const d = this.drums[this.lightKey];
    this.light.color.copy(d.color);
    this.light.intensity = d.glow * 9;
    this.light.position.set(d.group.position.x, 1.3, d.group.position.z);
    this.notes.update(dt, camera, time);
  }
}
