/**
 * Seagulls that keep the boat company: white toon birds with grey wings and
 * orange beaks, circling and gliding above the boat, flapping now and then.
 */

import * as THREE from "three";
import { mat, toonMesh } from "../../characters/parts";

interface Gull {
  root: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  radius: number;
  height: number;
  speed: number;
  angle: number;
  flap: number;
}

function wing(side: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.9, 0.05, 0.38);
  geo.translate(side * 0.45, 0, 0);
  g.add(toonMesh(geo, mat("#e9eef3", 0.6)));
  const tipGeo = new THREE.BoxGeometry(0.3, 0.055, 0.3);
  tipGeo.translate(side * 1.0, 0, -0.03);
  g.add(toonMesh(tipGeo, mat("#4a5560", 0.6)));
  return g;
}

function gull(): Gull {
  const root = new THREE.Group();
  const body = toonMesh(new THREE.CapsuleGeometry(0.17, 0.45, 4, 10), mat("#ffffff", 0.5));
  body.rotation.x = Math.PI / 2;
  root.add(body);
  const head = toonMesh(new THREE.SphereGeometry(0.15, 12, 8), mat("#ffffff", 0.5));
  head.position.set(0, 0.08, 0.36);
  root.add(head);
  const beak = toonMesh(new THREE.ConeGeometry(0.05, 0.2, 6), mat("#ffa531", 0.5));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.05, 0.54);
  root.add(beak);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 4), mat("#1b1b1b", 0.4));
    eye.position.set(sx * 0.1, 0.13, 0.43);
    root.add(eye);
  }
  const tail = toonMesh(new THREE.ConeGeometry(0.14, 0.3, 4), mat("#e9eef3", 0.6));
  tail.rotation.x = -Math.PI / 2;
  tail.scale.set(1, 1, 0.3);
  tail.position.set(0, 0, -0.42);
  root.add(tail);
  const wingL = wing(1);
  const wingR = wing(-1);
  wingL.position.set(0.12, 0.05, 0.05);
  wingR.position.set(-0.12, 0.05, 0.05);
  root.add(wingL, wingR);
  return { root, wingL, wingR, radius: 0, height: 0, speed: 0, angle: 0, flap: 0 };
}

export class Gulls {
  readonly group = new THREE.Group();
  private gulls: Gull[] = [];
  private t = 0;

  constructor(count: number) {
    for (let i = 0; i < count; i++) {
      const g = gull();
      g.radius = 7 + Math.random() * 9;
      g.height = 7 + Math.random() * 5;
      g.speed = (0.35 + Math.random() * 0.3) * (i % 2 ? 1 : -1);
      g.angle = Math.random() * Math.PI * 2;
      g.flap = Math.random() * 10;
      g.root.scale.setScalar(1.1 + Math.random() * 0.3);
      this.gulls.push(g);
      this.group.add(g.root);
    }
  }

  /** Circle around `center` (the boat), drifting ahead with it. */
  update(dt: number, center: THREE.Vector3): void {
    this.t += dt;
    for (const g of this.gulls) {
      g.angle += g.speed * dt;
      g.flap += dt;
      const x = center.x + Math.cos(g.angle) * g.radius;
      const z = center.z - 6 + Math.sin(g.angle) * g.radius * 0.7;
      const y = center.y + g.height + Math.sin(this.t * 0.8 + g.radius) * 0.6;
      g.root.position.set(x, y, z);
      // Face along the circle; bank into the turn
      const dir = g.speed > 0 ? 1 : -1;
      g.root.rotation.set(0, Math.atan2(-Math.sin(g.angle) * dir, Math.cos(g.angle) * dir * 0.7), 0);
      g.root.rotateZ(-0.35 * dir);
      // Flap in bursts, glide in between
      const flapping = Math.sin(g.flap * 0.6) > 0.2;
      const beat = flapping ? Math.sin(g.flap * 11) * 0.55 : 0.12;
      g.wingL.rotation.z = beat;
      g.wingR.rotation.z = -beat;
    }
  }
}
