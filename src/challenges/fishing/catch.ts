/**
 * Where catches end up: the wooden bucket next to Tadeo, with every caught
 * fish poking its tail out and flopping now and then (splashing droplets),
 * and the message bottle model for the funny catch.
 */

import * as THREE from "three";
import { mat, toonMesh } from "../../characters/parts";
import { FishKind, bottleModel } from "./species";
import { FishLook, fishFigure } from "./swimmers";

interface BucketFish {
  kind: FishKind;
  root: THREE.Group;
  tail: THREE.Group;
  flop: number;
  wait: number;
  phase: number;
}

export class Bucket {
  private items: BucketFish[] = [];
  private tmp = new THREE.Vector3();

  /** `group` sits at the bucket's base (its water surface is at y = 0.36). */
  constructor(private group: THREE.Group) {}

  get count(): number {
    return this.items.length;
  }

  add(kind: FishKind, look: FishLook): void {
    const i = this.items.length;
    const { root, tail } = fishFigure(kind, look);
    root.scale.setScalar(0.5);
    const a = i * 2.4;
    root.position.set(Math.cos(a) * 0.1, 0.32, Math.sin(a) * 0.1);
    // Reason: nose down into the water, tail sticking out over the rim
    root.rotation.set(1.15, a, 0);
    this.group.add(root);
    this.items.push({ kind, root, tail, flop: 0.6, wait: 1.5 + Math.random() * 3, phase: Math.random() * 6 });
  }

  /** Flop the fish about; `splash` gets the world point for droplets. */
  update(dt: number, time: number, splash: (at: THREE.Vector3) => void): void {
    for (const f of this.items) {
      f.wait -= dt;
      if (f.wait < 0 && f.flop <= 0) {
        f.flop = 0.55;
        f.wait = 2.5 + Math.random() * 4;
        splash(f.root.getWorldPosition(this.tmp).setY(this.group.position.y + 0.45));
      }
      f.flop = Math.max(0, f.flop - dt);
      const k = f.flop > 0 ? Math.sin((f.flop / 0.55) * Math.PI) : 0;
      f.tail.rotation.y = Math.sin(time * (k > 0 ? 28 : 3) + f.phase) * (0.25 + k * 0.5);
      f.root.position.y = 0.32 + k * 0.12;
      f.root.rotation.z = Math.sin(time * 20) * 0.25 * k;
    }
  }

  /** Empty the bucket: the kinds and world positions of the fish that were in it. */
  takeAll(): { kind: FishKind; at: THREE.Vector3 }[] {
    const out = this.items.map((f) => ({ kind: f.kind, at: f.root.getWorldPosition(new THREE.Vector3()) }));
    for (const f of this.items) this.group.remove(f.root);
    this.items = [];
    return out;
  }
}

/** The message bottle: green glass with a cork and a rolled-up letter inside. */
export function createBottle(): THREE.Group {
  const b = bottleModel();
  const root = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, transparent: true, opacity: 0.55, emissive: "#3a8a6a", emissiveIntensity: 0.25 });
  const inner = toonMesh(b.inner, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: "#ffffff", emissiveIntensity: 0.12 }));
  const shell = toonMesh(b.glass, glass);
  shell.renderOrder = 6;
  root.add(inner, shell);
  // A little sparkle stud so the bottle catches the light
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), mat("#ffffff", 0.1, 2.5));
  glint.position.set(0.05, 0.05, 0.06);
  root.add(glint);
  root.scale.setScalar(1.6);
  return root;
}
