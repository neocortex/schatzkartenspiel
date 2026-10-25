/**
 * Mia's hen coop: a red plank house on stilts with cream trim, a teal
 * shingle roof, a golden rooster weather vane, a big window with a roost
 * inside (caught hens sit there, visible from the yard), a swinging door, a
 * ramp with cleats and a painted "Mias Hühner" sign. The whole coop wobbles
 * happily whenever a hen flutters home.
 */

import * as THREE from "three";
import { part, merge } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { box, rbox, beam, pole, triangles, tint, ball } from "../../world/models/shapes";
import { Disposable } from "./dispose";
import { COOP } from "./layout";

const W = COOP.w;
const D = COOP.d;
const FLOOR = COOP.floor;
const TOP = 2.53;
const RIDGE = 3.45;
const RED = "#c9473a";
const CREAM = "#fff0d4";
const BOARDS = 16;
const BW = W / BOARDS;
/** Board index ranges of the window and the door in the front wall. */
const WINDOW_BOARDS: [number, number] = [1, 8];
const DOOR_BOARDS: [number, number] = [12, 14];
const WIN_Y: [number, number] = [1.18, 2.12];
const DOOR_TOP = 1.8;

const boardX = (i: number) => -W / 2 + (i + 0.5) * BW;
const edgeX = (i: number) => -W / 2 + i * BW;

export class Coop {
  readonly group = new THREE.Group();
  /** Local roost seats for caught hens (window row), filled from the middle. */
  readonly seats: THREE.Vector3[] = [];
  private door = new THREE.Group();
  private vane = new THREE.Group();
  private wob = 0;
  private wobV = 0;
  private doorV = 0;
  private doorA = -0.85;

  constructor(owned: Disposable[]) {
    const rand = mulberry32(42);
    const solid: THREE.BufferGeometry[] = [];
    this.stilts(solid);
    this.walls(solid, rand);
    this.roof(solid, rand);
    this.interior(solid, rand);
    this.ramp(solid);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
    owned.push(material);
    const mesh = new THREE.Mesh(merge(solid), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    this.buildDoor(material);
    this.buildVane(owned);
    this.group.add(this.sign(owned));

    // Reason: a warm lamp inside keeps the hens on the roost bright even though the coop shades them
    const lamp = new THREE.PointLight("#ffd9a0", 2.6, 4.5, 1.6);
    lamp.position.set(-0.9, 2.1, 0.7);
    this.group.add(lamp);

    for (let i = 0; i < 7; i++) {
      this.seats.push(new THREE.Vector3(edgeX(WINDOW_BOARDS[0]) + 0.3 + i * 0.355, 1.27, 0.2 + (i % 2 ? -0.12 : 0.05)));
    }
    this.group.position.set(COOP.x, 0, COOP.z);
  }

  /** World position just outside the door (where flying hens aim). */
  doorPoint(out: THREE.Vector3): THREE.Vector3 {
    const x = (edgeX(DOOR_BOARDS[0]) + edgeX(DOOR_BOARDS[1] + 1)) / 2;
    return out.set(COOP.x + x, FLOOR + 0.25, COOP.z + D / 2 + 0.35);
  }

  /** World position of roost seat i. */
  seat(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.seats[i]).add(this.group.position);
  }

  /** Circle colliders (world x, z, r) for the coop body and the ramp. */
  colliders(): [number, number, number][] {
    const c: [number, number, number][] = [];
    for (let i = 0; i < 4; i++) c.push([COOP.x - 1.9 + i * 1.27, COOP.z, 1.5]);
    const rx = COOP.x + (edgeX(DOOR_BOARDS[0]) + edgeX(DOOR_BOARDS[1] + 1)) / 2;
    c.push([rx, COOP.z + 2.3, 0.45], [rx, COOP.z + 2.9, 0.35]);
    return c;
  }

  /** A hen just came home: the coop wobbles and the door flaps. */
  bounce(): void {
    this.wobV += 2.2;
    this.doorV -= 9;
  }

  update(dt: number, time: number): void {
    this.wobV += (-140 * this.wob - 7 * this.wobV) * dt;
    this.wob += this.wobV * dt;
    this.group.scale.set(1 + this.wob * 0.05, 1 - this.wob * 0.07, 1 + this.wob * 0.05);
    this.doorV += (-60 * (this.doorA + 0.85) - 5 * this.doorV) * dt;
    this.doorA += this.doorV * dt;
    this.door.rotation.y = this.doorA;
    // The vane swings lazily in the breeze
    this.vane.rotation.y = Math.sin(time * 0.35) * 0.6 + Math.sin(time * 1.3) * 0.12;
  }

  private stilts(s: THREE.BufferGeometry[]): void {
    for (const x of [-W / 2 + 0.12, 0, W / 2 - 0.12]) {
      for (const z of [-D / 2 + 0.12, D / 2 - 0.12]) s.push(box(0.17, FLOOR, 0.17, "#6e4528", { pos: [x, FLOOR / 2, z] }));
    }
    s.push(rbox(W + 0.14, 0.14, D + 0.14, "#8a5a32", { pos: [0, FLOOR - 0.07, 0] }, 0.03));
  }

  private walls(s: THREE.BufferGeometry[], rand: () => number): void {
    const h = TOP - FLOOR;
    const z = D / 2 - 0.05;
    // Front: vertical boards with holes for the window and the door
    for (let i = 0; i < BOARDS; i++) {
      const c = tint(RED, rand, 0.09);
      const x = boardX(i);
      const seg = (y0: number, y1: number) => s.push(box(BW - 0.012, y1 - y0, 0.1, c, { pos: [x, (y0 + y1) / 2, z] }));
      if (i >= WINDOW_BOARDS[0] && i <= WINDOW_BOARDS[1]) {
        seg(FLOOR, WIN_Y[0]);
        seg(WIN_Y[1], TOP);
      } else if (i >= DOOR_BOARDS[0] && i <= DOOR_BOARDS[1]) {
        seg(DOOR_TOP, TOP);
      } else seg(FLOOR, TOP);
      // Back wall
      s.push(box(BW - 0.012, h, 0.1, c, { pos: [x, FLOOR + h / 2, -z] }));
    }
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 9; k++) {
        const zz = -D / 2 + (k + 0.5) * (D / 9);
        s.push(box(0.1, h, D / 9 - 0.012, tint(RED, rand, 0.09), { pos: [sx * (W / 2 - 0.05), FLOOR + h / 2, zz] }));
      }
      // Gable triangles closing the roof ends
      const gx = sx * (W / 2 - 0.05);
      s.push(triangles([gx, TOP, -D / 2, gx, TOP, D / 2, gx, RIDGE - 0.04, 0, gx, TOP, D / 2, gx, TOP, -D / 2, gx, RIDGE - 0.04, 0], RED));
    }
    // Cream trim: corners, top and bottom bands, window and door frames
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.push(box(0.17, h + 0.06, 0.17, CREAM, { pos: [sx * W / 2, FLOOR + h / 2, sz * D / 2] }));
    s.push(box(W + 0.06, 0.1, 0.06, CREAM, { pos: [0, TOP - 0.05, z + 0.07] }));
    s.push(box(W + 0.06, 0.1, 0.06, CREAM, { pos: [0, FLOOR + 0.05, z + 0.07] }));
    const frame = (x0: number, x1: number, y0: number, y1: number) => {
      const t = 0.1;
      s.push(box(x1 - x0 + t * 2, t, 0.08, CREAM, { pos: [(x0 + x1) / 2, y1 + t / 2, z + 0.06] }));
      if (y0 > FLOOR + 0.05) s.push(box(x1 - x0 + t * 2 + 0.12, t * 1.3, 0.2, CREAM, { pos: [(x0 + x1) / 2, y0 - t * 0.6, z + 0.1] }));
      for (const x of [x0 - t / 2, x1 + t / 2]) s.push(box(t, y1 - y0, 0.08, CREAM, { pos: [x, (y0 + y1) / 2, z + 0.06] }));
    };
    frame(edgeX(WINDOW_BOARDS[0]), edgeX(WINDOW_BOARDS[1] + 1), WIN_Y[0], WIN_Y[1]);
    frame(edgeX(DOOR_BOARDS[0]), edgeX(DOOR_BOARDS[1] + 1), FLOOR, DOOR_TOP);
    // A little red heart above the door
    const heart = new THREE.Shape();
    heart.moveTo(0, -0.1);
    heart.bezierCurveTo(-0.16, 0.02, -0.1, 0.16, 0, 0.07);
    heart.bezierCurveTo(0.1, 0.16, 0.16, 0.02, 0, -0.1);
    const hx = (edgeX(DOOR_BOARDS[0]) + edgeX(DOOR_BOARDS[1] + 1)) / 2;
    s.push(part(new THREE.ExtrudeGeometry(heart, { depth: 0.04, bevelEnabled: false }), "#ff5d6c", { pos: [hx, 2.16, z + 0.05], scale: 1.3 }));
  }

  private roof(s: THREE.BufferGeometry[], rand: () => number): void {
    const eaveZ = D / 2 + 0.42;
    const eaveY = TOP - 0.08;
    const slope = Math.hypot(eaveZ, RIDGE - eaveY);
    const angle = Math.atan2(RIDGE - eaveY, eaveZ);
    const len = W + 0.8;
    for (const sz of [-1, 1]) {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(0, (RIDGE + eaveY) / 2, (sz * eaveZ) / 2),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(sz * angle, 0, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      s.push(box(len, 0.1, slope + 0.1, "#2f5560").applyMatrix4(m));
      // Overlapping shingle rows, staggered, each tile a slightly different teal
      const rows = 6;
      for (let r = 0; r < rows; r++) {
        const along = (slope / 2) * sz - sz * (r + 0.5) * (slope / rows);
        const tiles = 11;
        for (let k = 0; k < tiles; k++) {
          const x = -len / 2 + (k + (r % 2 ? 0.25 : 0.75)) * (len / tiles);
          if (Math.abs(x) > len / 2 - 0.15) continue;
          const c = tint(rand() < 0.15 ? "#4f8a9a" : "#3f7686", rand, 0.12);
          const g = rbox(len / tiles - 0.03, 0.06, slope / rows + 0.08, c, { pos: [x, 0.07, along], rot: [sz * 0.08, 0, 0] }, 0.02);
          s.push(g.applyMatrix4(m));
        }
      }
    }
    s.push(part(new THREE.CylinderGeometry(0.1, 0.1, len + 0.05, 10), "#2b4c55", { pos: [0, RIDGE + 0.06, 0], rot: [0, 0, Math.PI / 2] }));
  }

  private interior(s: THREE.BufferGeometry[], rand: () => number): void {
    // Darker inner walls so the window reads as a cosy hollow
    s.push(box(W - 0.3, TOP - FLOOR, 0.04, "#6b3328", { pos: [0, (TOP + FLOOR) / 2, -D / 2 + 0.13] }));
    for (const sx of [-1, 1]) s.push(box(0.04, TOP - FLOOR, D - 0.3, "#6b3328", { pos: [sx * (W / 2 - 0.13), (TOP + FLOOR) / 2, 0] }));
    s.push(box(W - 0.3, 0.06, D - 0.3, "#5e2d24", { pos: [0, TOP - 0.12, 0] }));
    // Straw bedding with loose tufts
    s.push(box(W - 0.3, 0.08, D - 0.3, "#e3bd55", { pos: [0, FLOOR + 0.04, 0] }));
    for (let i = 0; i < 26; i++) {
      const x = (rand() - 0.5) * (W - 0.6);
      const z = (rand() - 0.5) * (D - 0.6);
      s.push(ball(0.12 + rand() * 0.08, tint("#f0cf6a", rand, 0.1), [x, FLOOR + 0.08, z], 1, [1.4, 0.45, 1]));
    }
    // Roost bar on two little posts, right behind the window
    const x0 = edgeX(WINDOW_BOARDS[0]) + 0.1;
    const x1 = edgeX(WINDOW_BOARDS[1] + 1) - 0.1;
    s.push(pole([x0, 1.2, 0.18], [x1, 1.2, 0.18], 0.045, "#9a6a3c"));
    for (const x of [x0 + 0.05, x1 - 0.05]) s.push(beam([x, FLOOR, 0.18], [x, 1.2, 0.18], 0.06, "#6e4528"));
  }

  private ramp(s: THREE.BufferGeometry[]): void {
    const x = (edgeX(DOOR_BOARDS[0]) + edgeX(DOOR_BOARDS[1] + 1)) / 2;
    const z0 = D / 2 + 0.02;
    const run = 2.3;
    const angle = Math.atan2(FLOOR, run);
    const len = Math.hypot(FLOOR, run);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, FLOOR / 2 + 0.02, z0 + run / 2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    s.push(rbox(0.84, 0.07, len, "#b98552", {}, 0.02).applyMatrix4(m));
    for (let i = 1; i < 7; i++) s.push(box(0.8, 0.04, 0.05, "#8a5a32", { pos: [0, 0.05, -len / 2 + (i * len) / 7] }).applyMatrix4(m));
  }

  private buildDoor(material: THREE.Material): void {
    const x0 = edgeX(DOOR_BOARDS[0]);
    const w = edgeX(DOOR_BOARDS[1] + 1) - x0;
    const h = DOOR_TOP - FLOOR - 0.02;
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) parts.push(box(w / 3 - 0.015, h, 0.06, i % 2 ? "#ead5ac" : "#e2c99a", { pos: [(i + 0.5) * (w / 3), h / 2, 0] }));
    for (const y of [0.15, h - 0.15]) parts.push(box(w - 0.06, 0.09, 0.04, RED, { pos: [w / 2, y, 0.05] }));
    parts.push(beam([0.08, 0.2, 0.05], [w - 0.08, h - 0.2, 0.05], 0.08, RED, 0.04));
    parts.push(ball(0.035, "#3c3d44", [w - 0.12, h / 2, 0.08]));
    const door = new THREE.Mesh(merge(parts), material);
    door.castShadow = true;
    this.door.add(door);
    this.door.position.set(x0, FLOOR + 0.01, D / 2 + 0.02);
    this.group.add(this.door);
  }

  private buildVane(owned: Disposable[]): void {
    const gold = new THREE.MeshStandardMaterial({ color: "#f4c54a", roughness: 0.3, metalness: 0.5, emissive: "#c88a10", emissiveIntensity: 0.25 });
    owned.push(gold);
    const iron = new THREE.MeshStandardMaterial({ color: "#3c3d44", roughness: 0.5 });
    owned.push(iron);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.95, 6), iron);
    post.position.y = 0.47;
    const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.9), iron);
    arrow.position.y = 0.62;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), iron);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, 0.62, 0.5);
    // Rooster silhouette: body, tail fan, head with comb
    const r = new THREE.Shape();
    r.moveTo(-0.18, 0);
    r.quadraticCurveTo(-0.3, 0.22, -0.2, 0.36);
    r.quadraticCurveTo(-0.12, 0.2, -0.04, 0.16);
    r.quadraticCurveTo(0.05, 0.3, 0.1, 0.34);
    r.lineTo(0.14, 0.4);
    r.lineTo(0.18, 0.34);
    r.lineTo(0.24, 0.31);
    r.lineTo(0.17, 0.27);
    r.quadraticCurveTo(0.2, 0.08, 0.06, 0.0);
    r.closePath();
    const rooster = new THREE.Mesh(new THREE.ExtrudeGeometry(r, { depth: 0.03, bevelEnabled: false }), gold);
    rooster.rotation.y = Math.PI / 2;
    rooster.position.set(0, 0.72, 0.02);
    rooster.scale.setScalar(1.5);
    rooster.castShadow = true;
    this.vane.add(post, arrow, tip, rooster);
    this.vane.position.set(W * 0.22, RIDGE + 0.1, 0);
    this.group.add(this.vane);
  }

  /** Painted board above the window: "Mias Hühner" with two little hearts. */
  private sign(owned: Disposable[]): THREE.Group {
    const g = new THREE.Group();
    const cx = (edgeX(WINDOW_BOARDS[0]) + edgeX(WINDOW_BOARDS[1] + 1)) / 2;
    const boardMat = new THREE.MeshStandardMaterial({ color: "#fff3dc", roughness: 0.8 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 0.05), boardMat);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 92;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#c9473a";
    c.font = "600 64px Fredoka, system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("♥ Mias Hühner ♥", 256, 50);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const textMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    owned.push(boardMat, tex, textMat);
    const text = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.32), textMat);
    text.position.z = 0.03;
    g.add(board, text);
    g.position.set(cx, (WIN_Y[1] + TOP) / 2 + 0.01, D / 2 + 0.1);
    return g;
  }
}
