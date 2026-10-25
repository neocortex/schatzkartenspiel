/**
 * Fischer Jonas's jetty: the island's pier model running from the beach out
 * over the lagoon, dressed with a lantern, a tall mooring post for Pico, a
 * life ring, crates, a tackle box and the bucket for the catch, plus the
 * little red rowboat tied up alongside and bobbing on the swell.
 */

import * as THREE from "three";
import { merge, part } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { Model, PAL, emptyModel, addModel, placeAt, rbox, box, cyl, ball, rope, flip } from "../../world/models/shapes";
import { pier } from "../../world/models/structures";
import { barrel, crate, lanternPost } from "../../world/models/props";
import { floorHeight } from "./seabed";
import { SeaUniforms, seaMaterial, swell } from "./water";

/** Height of the deck top above the water. */
export const DECK = 0.85;
/** World z of the jetty's far (sea-side) end. */
export const DECK_END = -0.4;
const SHORE_Z = 16;
const LENGTH = SHORE_Z - DECK_END;

/** Top of Pico's mooring post. */
export const PICO_POST = new THREE.Vector3(1.48, DECK + 0.62, -0.18);
/** Where the bucket for the catch stands. */
export const BUCKET_AT = new THREE.Vector3(1.0, DECK, 0.42);

export class Dock {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  readonly boat = new THREE.Group();
  /** Water surface inside the bucket (caught fish are placed just below it). */
  readonly bucket = new THREE.Group();

  constructor(sea: SeaUniforms) {
    const model = emptyModel();
    // Reason: the pier model runs along +x; turning it by +90° makes it run from the beach out to sea (-z)
    const turn = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(0, DECK, SHORE_Z);
    addModel(
      model,
      pier({
        length: LENGTH,
        width: 1.9,
        headLength: 3.2,
        headWidth: 3.4,
        ground: (s, z) => floorHeight(z, SHORE_Z - s) - DECK,
        seed: 5,
      }),
      turn,
    );
    this.dress(model);

    const solid = seaMaterial(sea, "dock", { roughness: 0.85, selfLit: 0.06 });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.materials.push(solid, glow);
    const deck = new THREE.Mesh(merge(model.solid), solid);
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.group.add(deck, new THREE.Mesh(merge(model.glow), glow));

    const bucket = emptyModel();
    bucket.solid.push(cyl(0.3, 0.24, 0.42, PAL.wood, { pos: [0, 0.21, 0] }, 14));
    for (const y of [0.08, 0.34]) bucket.solid.push(cyl(0.305, 0.305, 0.04, PAL.iron, { pos: [0, y, 0] }, 14));
    bucket.solid.push(part(new THREE.TorusGeometry(0.29, 0.015, 4, 14, Math.PI), PAL.iron, { pos: [0, 0.42, 0], rot: [0, 0, 0] }));
    const pail = new THREE.Mesh(merge(bucket.solid), solid);
    pail.castShadow = true;
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.27, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#2f9fc0", roughness: 0.15, emissive: "#1b6f8a", emissiveIntensity: 0.4 }));
    water.position.y = 0.36;
    this.materials.push(water.material as THREE.Material);
    this.bucket.position.copy(BUCKET_AT);
    this.bucket.add(pail, water);
    this.group.add(this.bucket);

    this.buildBoat(solid);
    this.group.add(this.boat);
  }

  /** Lantern, Pico's post, life ring, crates, tackle box and coiled rope on the jetty head. */
  private dress(m: Model): void {
    const rand = mulberry32(31);
    const at = (x: number, z: number, rot = 0, s = 1) => placeAt(x, DECK, z, rot, s);
    addModel(m, lanternPost(2.3), at(-1.52, -0.12, Math.PI * 0.75));
    // Pico's tall mooring post with a rope wound round it
    const post = PICO_POST;
    m.solid.push(cyl(0.11, 0.13, post.y + 2.4, PAL.woodDark, { pos: [post.x, (post.y - 2.4) / 2, post.z] }, 9));
    m.solid.push(ball(0.115, PAL.woodDark, [post.x, post.y, post.z], 1, [1, 0.45, 1]));
    for (let i = 0; i < 4; i++) m.solid.push(part(new THREE.TorusGeometry(0.135, 0.03, 5, 14), PAL.rope, { pos: [post.x, DECK + 0.3 + i * 0.06, post.z], rot: [Math.PI / 2, 0, i * 0.4] }));
    // Life ring hanging on the lantern post
    const ring = new THREE.TorusGeometry(0.26, 0.075, 8, 20);
    m.solid.push(
      part(ring, (p) => (Math.sin(Math.atan2(p.y - (DECK + 1.05), p.z - 0.05) * 2) > 0 ? new THREE.Color(PAL.red) : new THREE.Color(PAL.white)), {
        pos: [-1.38, DECK + 1.05, 0.05],
        rot: [0, Math.PI / 2, 0],
      }),
    );
    // Crates, a barrel and the tackle box
    addModel(m, crate(3, 0.62), at(1.2, 2.55, 0.3));
    addModel(m, crate(4, 0.45), at(1.25, 2.55, 0.9).premultiply(new THREE.Matrix4().makeTranslation(0, 0.62, 0)));
    addModel(m, barrel(6, 0.8), at(-1.15, 2.7, 0));
    m.solid.push(rbox(0.46, 0.22, 0.3, "#3f8f6a", { pos: [-1.2, DECK + 0.11, 0.55], rot: [0, 0.4, 0] }, 0.04));
    m.solid.push(rbox(0.47, 0.06, 0.31, "#2f6f52", { pos: [-1.2, DECK + 0.23, 0.55], rot: [0, 0.4, 0] }, 0.02));
    m.solid.push(part(new THREE.TorusGeometry(0.07, 0.015, 4, 10, Math.PI), PAL.iron, { pos: [-1.2, DECK + 0.26, 0.55], rot: [0, 0.4, 0] }));
    // Coiled rope on the deck
    for (let i = 0; i < 3; i++) m.solid.push(part(new THREE.TorusGeometry(0.2 - i * 0.04, 0.035, 5, 16), PAL.rope, { pos: [0.25, DECK + 0.035 + i * 0.05, 2.6], rot: [Math.PI / 2, 0, rand()] }));
    // Mooring line from the bollard down to the boat's bow
    m.solid.push(rope([-1.35, DECK + 0.5, 2.2], [-2.75, 0.45, 2.75], 0.3, 0.025));
  }

  /** Little red rowboat with a white stripe, two thwarts and a pair of oars. */
  private buildBoat(material: THREE.Material): void {
    const hull = new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const pos = hull.attributes.position as THREE.BufferAttribute;
    // Reason: pinch the front half into a bow and keep the stern wide and flat
    const pinch = (z: number) => (z > 0 ? 1 - z * z * 0.75 : 1 - z * z * 0.2);
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      pos.setXYZ(i, pos.getX(i) * 0.62 * pinch(z), pos.getY(i) * 0.42, z * 1.45);
    }
    hull.computeVertexNormals();
    const rimPts: THREE.Vector3[] = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      rimPts.push(new THREE.Vector3(Math.cos(a) * 0.62 * pinch(Math.sin(a)), 0, Math.sin(a) * 1.45));
    }
    const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 48, 0.045, 5, true);
    const red = new THREE.Color("#d8452f");
    const white = new THREE.Color(PAL.white);
    const outside = part(hull, (p) => (p.y > -0.1 ? white : p.y > -0.16 ? new THREE.Color("#2d5fa0") : red));
    const inner = hull.clone();
    inner.scale(0.92, 0.92, 0.95);
    inner.translate(0, 0.02, 0);
    // Reason: the inner shell is flipped so its faces point inwards and the wooden inside shows from above
    const insideGeo = flip(part(inner, PAL.woodLight));
    const parts = [
      outside,
      insideGeo,
      part(rim, PAL.woodDark),
      box(1.0, 0.06, 0.28, PAL.wood, { pos: [0, -0.1, 0.35] }),
      box(1.05, 0.06, 0.28, PAL.wood, { pos: [0, -0.1, -0.55] }),
    ];
    for (const s of [-1, 1]) {
      parts.push(cyl(0.025, 0.025, 1.7, PAL.woodLight, { pos: [s * 0.25, 0.0, -0.1], rot: [Math.PI / 2 - 0.08, 0, s * 0.12] }, 6));
      parts.push(box(0.03, 0.1, 0.42, PAL.woodLight, { pos: [s * 0.32, -0.03, -0.95], rot: [0, s * 0.12, 0] }));
    }
    const mesh = new THREE.Mesh(merge(parts), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.boat.add(mesh);
    this.boat.position.set(-3.05, 0.1, 1.4);
    this.boat.rotation.y = 0.12;
  }

  update(time: number): void {
    const b = this.boat;
    b.position.y = 0.12 + swell(b.position.x, b.position.z, time) * 1.4;
    b.rotation.z = Math.sin(time * 1.1) * 0.035;
    b.rotation.x = Math.sin(time * 0.8 + 1) * 0.025;
  }
}
