/**
 * The giant shark: a big, goofy cartoon shark (cheeky grin, huge eyes, rosy
 * cheeks) built from outlined toon shapes in the island's character style.
 * Procedurally animated: swimming tail beats, fin flaps, an opening jaw,
 * blinking, moods (grin, angry, happy), squash and stretch, and chewing with
 * full cheeks. Free of any challenge logic so it can swim anywhere.
 *
 * Faces +z with its centre at the origin, about 6.4 units long.
 */

import * as THREE from "three";
import { mat, toonMesh } from "../../characters/parts";

const C = {
  top: "#4f8fd0",
  topDark: "#3b74b3",
  belly: "#f4efe0",
  mouth: "#6b1a2a",
  tongue: "#f07a8e",
  tooth: "#ffffff",
  pupil: "#14202b",
  brow: "#24456b",
  blush: "#ff8fa3",
};

export type SharkMood = "grin" | "angry" | "happy";

let skin: THREE.MeshStandardMaterial | null = null;
/** Two-tone skin (blue back, cream belly) via vertex colours; shared like `mat()`. */
function skinMaterial(): THREE.MeshStandardMaterial {
  if (!skin) {
    skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 });
    skin.emissive = new THREE.Color("#ffffff");
    skin.emissiveIntensity = 0.06;
  }
  return skin;
}

/** Paint a lathe body: belly below a wavy line, a darker stripe along the spine. */
function paintSkin(g: THREE.BufferGeometry, bellyLine = -0.08): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(C.top);
  const dark = new THREE.Color(C.topDark);
  const belly = new THREE.Color(C.belly);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const line = bellyLine + Math.sin(z * 5.5) * 0.03;
    if (z > MOUTH_FROM + 0.05 && y < PALATE + 0.03) c.set(C.mouth);
    else if (y < line) c.copy(belly);
    else c.copy(top).lerp(dark, THREE.MathUtils.smoothstep(Math.abs(x), 0.25, 0.0) * THREE.MathUtils.smoothstep(y, 0.2, 0.5));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/** Lathe along +z from a (z, radius) profile, squashed sideways. */
function latheZ(profile: [number, number][], squashX = 0.88, segments = 28): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([z, r]) => new THREE.Vector2(r, z)), segments);
  g.rotateX(Math.PI / 2);
  g.scale(squashX, 1, 1);
  g.computeVertexNormals();
  return g;
}

const BODY: [number, number][] = [
  [-0.55, 0.0],
  [-0.55, 0.44],
  [-0.2, 0.6],
  [0.25, 0.66],
  [0.7, 0.62],
  [1.05, 0.5],
  [1.32, 0.32],
  [1.5, 0.12],
  [1.54, 0.0],
];
const PALATE = -0.2;
const MOUTH_FROM = 0.6;

/** Body radius at z (linear in the profile). */
function radiusAt(z: number): number {
  for (let i = 1; i < BODY.length; i++) {
    const [z0, r0] = BODY[i - 1];
    const [z1, r1] = BODY[i];
    if (z <= z1 && z1 > z0) return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
  }
  return 0;
}

/** Half-width of the palate (the flat roof of the mouth) at z. */
function palateHalfWidth(z: number): number {
  const r = radiusAt(z);
  return Math.sqrt(Math.max(r * r - PALATE * PALATE, 0)) * 0.88;
}

/** Flatten the underside of the snout into a palate so the lower jaw can drop open beneath it. */
function carveMouth(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.smoothstep(pos.getZ(i), MOUTH_FROM, MOUTH_FROM + 0.2);
    if (pos.getY(i) < PALATE) pos.setY(i, THREE.MathUtils.lerp(pos.getY(i), PALATE, k));
  }
  g.computeVertexNormals();
  return g;
}

/** Flat fin from a 2D outline in the (z, y) plane, extruded sideways. */
function finGeometry(points: [number, number][], thick: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelSize: thick * 0.45, bevelThickness: thick * 0.45, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -thick / 2);
  // Reason: shape x becomes the body's z axis, the extrusion becomes sideways (x)
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

export class Shark {
  readonly root = new THREE.Group();
  /** Everything (squash and stretch, swim wiggle). */
  readonly body = new THREE.Group();
  readonly tail = new THREE.Group();
  readonly jaw = new THREE.Group();
  readonly head = new THREE.Group();
  mood: SharkMood = "grin";
  /** Target jaw opening, 0 (closed grin) .. 1 (wide open). */
  mouth = 0.15;
  /** Swim effort: tail beat speed and size (0 = still, 1 = cruising, 2 = sprinting). */
  swim = 1;
  /** Wave goodbye with a side fin. */
  waving = false;
  private t = Math.random() * 10;
  private jawOpen = 0.15;
  private squash = 0;
  private squashV = 0;
  private blink = 2;
  private eyes: THREE.Group[] = [];
  private pupils: THREE.Mesh[] = [];
  private brows: THREE.Mesh[] = [];
  private finsL: THREE.Group;
  private finsR: THREE.Group;
  private cheeks: { blush: THREE.Mesh; puff: THREE.Mesh }[] = [];
  /** Seconds of chewing left, out of how many. */
  private chewLeft = 0;
  private chewFor = 1;

  constructor() {
    // Reason: built at half size and scaled up, so the shared outline reads as thick as on the characters
    this.root.scale.setScalar(2);
    this.root.add(this.body);
    const skinMat = skinMaterial();
    this.body.add(toonMesh(paintSkin(carveMouth(latheZ(BODY))), skinMat));
    this.body.add(this.head);

    // Tail segment pivots behind the body
    this.tail.position.z = -0.45;
    this.body.add(this.tail);
    const tailGeo = paintSkin(
      latheZ([
        [-1.25, 0.0],
        [-1.22, 0.1],
        [-0.9, 0.2],
        [-0.45, 0.34],
        [0.05, 0.46],
        [0.12, 0.0],
      ]),
      -0.05,
    );
    this.tail.add(toonMesh(tailGeo, skinMat));
    const tailFin = toonMesh(
      finGeometry(
        [
          [0.05, 0.0],
          [-0.3, 0.5],
          [-0.62, 0.95],
          [-0.72, 0.9],
          [-0.5, 0.35],
          [-0.42, 0.02],
          [-0.55, -0.42],
          [-0.62, -0.55],
          [-0.42, -0.5],
          [-0.12, -0.12],
        ],
        0.07,
      ),
      mat(C.top, 0.45),
    );
    tailFin.position.z = -1.12;
    this.tail.add(tailFin);

    // Dorsal fin (the famous one cutting the water) and the small ones
    const dorsal = toonMesh(
      finGeometry(
        [
          [0.35, 0.0],
          [0.05, 0.55],
          [-0.28, 0.98],
          [-0.42, 0.95],
          [-0.35, 0.5],
          [-0.42, 0.0],
        ],
        0.09,
      ),
      mat(C.top, 0.45),
    );
    dorsal.position.set(0, 0.5, 0.0);
    this.body.add(dorsal);
    this.finsL = new THREE.Group();
    this.finsR = new THREE.Group();
    for (const [g, side] of [[this.finsL, 1], [this.finsR, -1]] as const) {
      g.position.set(side * 0.48, -0.25, 0.55);
      const fin = toonMesh(
        finGeometry(
          [
            [0.18, 0.0],
            [-0.15, -0.12],
            [-0.5, -0.38],
            [-0.52, -0.3],
            [-0.18, 0.02],
          ],
          0.06,
        ),
        mat(C.top, 0.45),
      );
      fin.rotation.z = side * 0.6;
      g.add(fin);
      this.body.add(g);
    }

    this.buildFace();
  }

  private buildFace(): void {
    const h = this.head;
    // Upper teeth hanging from the palate's rim
    const toothGeo = new THREE.ConeGeometry(0.05, 0.13, 6);
    toothGeo.rotateX(Math.PI);
    for (let i = 0; i < 9; i++) {
      const a = -1 + (i / 8) * 2;
      const z = 1.44 - Math.abs(a) * 0.62;
      const tooth = toonMesh(toothGeo, mat(C.tooth, 0.3), false);
      tooth.position.set(Math.sign(a) * palateHalfWidth(z) * 0.86, PALATE - 0.06, z);
      h.add(tooth);
    }
    // Lower jaw: a belly-coloured shell hinged at the mouth corners
    this.jaw.position.set(0, -0.26, 0.62);
    h.add(this.jaw);
    const jawGeo = new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    jawGeo.scale(0.92, 0.55, 1.05);
    const jawMesh = toonMesh(jawGeo, mat(C.belly, 0.5));
    jawMesh.position.set(0, 0.04, 0.42);
    this.jaw.add(jawMesh);
    const tongue = toonMesh(new THREE.SphereGeometry(0.2, 12, 8), mat(C.tongue, 0.6), false);
    tongue.scale.set(1.3, 0.35, 1.3);
    tongue.position.set(0, 0.0, 0.42);
    this.jaw.add(tongue);
    for (let i = 0; i < 7; i++) {
      const a = -1.0 + (i / 6) * 2.0;
      const tooth = toonMesh(new THREE.ConeGeometry(0.045, 0.11, 6), mat(C.tooth, 0.3), false);
      tooth.position.set(Math.sin(a) * 0.36, 0.06, 0.42 + Math.cos(a) * 0.36);
      this.jaw.add(tooth);
    }
    // Big friendly eyes on top of the head, looking forward
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.3, 0.42, 0.95);
      const white = toonMesh(new THREE.SphereGeometry(0.19, 18, 12), mat("#ffffff", 0.25));
      white.scale.set(1, 1.15, 0.85);
      eye.add(white);
      const pupil = toonMesh(new THREE.SphereGeometry(0.095, 14, 10), mat(C.pupil, 0.3), false);
      pupil.position.set(side * 0.02, 0.0, 0.13);
      eye.add(pupil);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat("#ffffff", 0.2, 1.2));
      shine.position.set(0.04, 0.05, 0.08);
      pupil.add(shine);
      h.add(eye);
      this.eyes.push(eye);
      this.pupils.push(pupil);
      const brow = toonMesh(new THREE.CapsuleGeometry(0.035, 0.2, 4, 8), mat(C.brow, 0.5), false);
      brow.rotation.z = Math.PI / 2;
      brow.position.set(side * 0.3, 0.66, 1.0);
      h.add(brow);
      this.brows.push(brow);
      // Rosy cheek (with a hidden pouch that swells up while chewing) and gills
      const cheek = new THREE.Group();
      cheek.position.set(side * 0.475, -0.08, 0.95);
      cheek.rotation.y = side * 1.05;
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), mat(C.blush, 0.8, 0.4));
      // Reason: painted and lit like the body, with no outline of its own, so it reads as the flank bulging and not as a ball stuck on
      const puff = toonMesh(paintSkin(new THREE.SphereGeometry(0.21, 16, 12), 0), skinMaterial(), false);
      puff.position.z = -0.05;
      puff.visible = false;
      cheek.add(blush, puff);
      h.add(cheek);
      this.cheeks.push({ blush, puff });
      for (let k = 0; k < 3; k++) {
        const gill = toonMesh(new THREE.TorusGeometry(0.2, 0.014, 4, 12, Math.PI * 0.55), mat(C.topDark, 0.5), false);
        gill.position.set(side * 0.6, 0.02, 0.48 - k * 0.13);
        gill.rotation.set(0, side * Math.PI / 2, Math.PI * 0.72);
        h.add(gill);
      }
    }
    // Nostrils
    for (const side of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), mat(C.topDark, 0.6));
      n.position.set(side * 0.12, 0.12, 1.47);
      h.add(n);
    }
  }

  /** Squash-and-stretch kick (positive squashes, negative stretches). */
  bounce(amount: number): void {
    this.squashV += amount * 9;
  }

  /** Snap the jaw shut on a mouthful and chew it, cheeks full. */
  chew(seconds: number): void {
    this.chewLeft = seconds;
    this.chewFor = seconds;
    this.jawOpen = 0;
  }

  /** World position of the top of the head. */
  headPos(target = new THREE.Vector3()): THREE.Vector3 {
    return this.head.localToWorld(target.set(0, 0.55, 0.85));
  }

  /** World position of the middle of the open mouth, between the palate and the tongue. */
  mouthPos(target = new THREE.Vector3()): THREE.Vector3 {
    return this.head.localToWorld(target.set(0, -0.5, 1.05));
  }

  /** World position of the snout tip. */
  snoutPos(target = new THREE.Vector3()): THREE.Vector3 {
    return this.head.localToWorld(target.set(0, 0, 1.55));
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    // Tail beat and a counter-wiggle of the body
    const beat = t * (3 + this.swim * 3.5);
    const amp = 0.18 + this.swim * 0.16;
    this.tail.rotation.y = Math.sin(beat) * amp;
    this.body.rotation.y = -Math.sin(beat - 0.6) * amp * 0.18;
    this.finsL.rotation.x = Math.sin(t * 2.4) * 0.15;
    this.finsR.rotation.x = Math.sin(t * 2.4 + 1) * 0.15;
    this.finsR.rotation.z = this.waving ? -0.9 + Math.sin(t * 12) * 0.5 : 0;
    // A happy wiggle through the whole body while waving
    this.body.rotation.z = this.waving ? Math.sin(t * 7) * 0.13 : 0;
    // Chewing runs from 0 to 1: first the eyes pop at the taste, then they squeeze shut with joy
    const chewing = this.chewLeft > 0;
    const chew = chewing ? 1 - this.chewLeft / this.chewFor : 0;
    const wide = chewing ? 1 - THREE.MathUtils.smoothstep(chew, 0.22, 0.36) : 0;
    const savour = chewing ? THREE.MathUtils.smoothstep(chew, 0.3, 0.42) * (1 - THREE.MathUtils.smoothstep(chew, 0.9, 1)) : 0;
    const full = chewing ? THREE.MathUtils.smoothstep(chew, 0, 0.06) * (1 - THREE.MathUtils.smoothstep(chew, 0.86, 1)) : 0;
    if (chewing) {
      this.chewLeft -= dt;
      // Reason: the swallow at the end gets its own little gulp through the whole body
      if (this.chewLeft <= 0) this.bounce(-0.45);
    }
    // Jaw
    const open = chewing ? 0.03 + Math.abs(Math.sin(t * 11)) * 0.17 : this.mouth;
    this.jawOpen += (open - this.jawOpen) * Math.min(dt * 12, 1);
    this.jaw.rotation.x = this.jawOpen * 0.75;
    for (const { blush, puff } of this.cheeks) {
      puff.visible = full > 0.01;
      puff.scale.setScalar(Math.max(full, 0.01));
      // Reason: the blush rides on the outside of the swelling pouch
      blush.position.z = 0.002 + full * 0.165;
      blush.scale.setScalar(1 + full * 0.45);
    }
    // Squash and stretch (spring)
    this.squashV += (-this.squash * 90 - this.squashV * 9) * dt;
    this.squash += this.squashV * dt;
    const sq = THREE.MathUtils.clamp(this.squash, -0.4, 0.4);
    this.body.scale.set(1 + sq * 0.5, 1 - sq * 0.6, 1 + sq * 0.3);
    // Blinking
    this.blink -= dt;
    let lid = 1;
    if (this.blink < 0.12) lid = Math.max(Math.abs(this.blink - 0.06) / 0.06, 0.1);
    if (this.blink < 0) this.blink = 1.5 + Math.random() * 3;
    // Moods: brows and pupils
    const m = this.mood;
    this.pupils.forEach((p, i) => {
      const side = i === 0 ? -1 : 1;
      p.position.set(side * 0.02 + Math.sin(t * 0.7) * 0.02, m === "happy" ? 0.03 : 0, 0.13);
    });
    const squint = (m === "happy" ? Math.min(lid, 0.55) : lid) * (1 - savour * 0.72);
    this.eyes.forEach((e) => e.scale.set(1 + wide * 0.22, squint * (1 + wide * 0.32), 1));
    this.brows.forEach((b, i) => {
      const side = i === 0 ? -1 : 1;
      const tilt = m === "angry" ? 0.5 : m === "grin" ? 0.25 : -0.25;
      const eased = THREE.MathUtils.lerp(tilt, -0.32, Math.max(wide, savour));
      b.rotation.set(0, 0, Math.PI / 2 + side * eased);
      b.position.y = (m === "angry" ? 0.62 : 0.68) + wide * 0.08;
    });
  }
}

/** Build the giant shark (faces +z, centred on the origin, about 6.4 units long). */
export function createShark(): Shark {
  return new Shark();
}
