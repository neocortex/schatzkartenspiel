/**
 * Small plants and props on the forest floor: glowing mushroom clusters
 * (and the fairy ring of big ones), ferns, glowing bell and star flowers,
 * mossy rocks and two fallen logs. Glowing things register as glow sources
 * so the ground and trunks around them pick up their colour.
 */

import * as THREE from "three";
import { mulberry32 } from "../../core/noise";
import { merge, part } from "../../core/geo";
import { Colliders } from "../../world/Colliders";
import * as flora from "../../world/models/flora";
import { GlowField, glowMaterial, instances } from "../cave/materials";
import { mushroomCluster } from "../cave/models";
import { floraMaterial } from "./trees";
import { BERRIES, FAIRY_RING, ForestField, MAX_X, MAX_Z, MIN_X, MIN_Z, THORNS } from "./layout";

const CAPS = [new THREE.Color(0.04, 0.4, 0.65), new THREE.Color(0.62, 0.16, 0.58), new THREE.Color(0.26, 0.34, 0.85)];
const CAP_HEX = ["#36d8ff", "#e04fd0", "#6b7dff"];

/** A fern: arching fronds made of bent, saw-edged strips. */
function fernGeometry(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 7;
  for (let f = 0; f < n; f++) {
    const len = 0.7 + rand() * 0.4;
    const g = new THREE.PlaneGeometry(0.22, len, 1, 8);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + len / 2) / len;
      // Reason: alternate the width per row for a leaflet edge, taper to the tip, then arch outwards
      const row = Math.round(t * 8);
      const w = (row % 2 ? 1 : 0.55) * (1 - t * 0.85);
      const x = pos.getX(i) * w;
      const arch = Math.sin(t * Math.PI * 0.85) * 0.35;
      pos.setXYZ(i, x, arch + t * len * 0.35, t * len);
    }
    // Reason: up-facing normals light both sides of the thin fronds like the moss below (no black undersides)
    g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(pos.count).fill([0, 1, 0]).flat(), 3));
    const a = (f / n) * Math.PI * 2 + rand() * 0.5;
    parts.push(part(g, (p) => new THREE.Color("#245f45").lerp(new THREE.Color("#79cf86"), THREE.MathUtils.clamp(p.z / len, 0, 1)), { rot: [0, a, 0] }));
  }
  return merge(parts);
}

/** Bell flower (stem + glowing bell) and star flower blossoms. */
function flowerGeometries(): { stem: THREE.BufferGeometry; bell: THREE.BufferGeometry; star: THREE.BufferGeometry } {
  const stem = merge([
    part(new THREE.CylinderGeometry(0.012, 0.018, 0.42, 4).translate(0, 0.21, 0), "#3b8a52"),
    part(new THREE.SphereGeometry(0.06, 5, 3).scale(1, 0.3, 2.2), "#4fa060", { pos: [0.05, 0.12, 0], rot: [0, 0.6, 0.3] }),
  ]);
  const bellCone = new THREE.ConeGeometry(0.075, 0.12, 7, 1, true).rotateX(Math.PI);
  const bell = merge([
    part(bellCone, (p) => new THREE.Color(0.35, 0.55, 1.4).lerp(new THREE.Color(0.9, 1.1, 1.6), THREE.MathUtils.clamp(-p.y * 6, 0, 1)), { pos: [0.02, 0.4, 0], rot: [0, 0, 0.5] }),
  ]);
  const petals: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    petals.push(part(new THREE.SphereGeometry(0.045, 5, 3).scale(1, 0.3, 1.8), new THREE.Color(1.3, 0.55, 1.0), { pos: [Math.cos(a) * 0.05, 0.43, Math.sin(a) * 0.05], rot: [0, -a + Math.PI / 2, 0] }));
  }
  petals.push(part(new THREE.SphereGeometry(0.03, 5, 3), new THREE.Color(1.6, 1.3, 0.5), { pos: [0, 0.45, 0] }));
  return { stem, bell, star: merge(petals) };
}

/** A fallen, mossy log lying along x. */
function logGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.34, 0.38, 3.2, 10, 4).rotateZ(Math.PI / 2);
  return merge([
    part(body, (p, n) => {
      if (Math.abs(n.x) > 0.9) return new THREE.Color("#c39a64");
      const c = new THREE.Color("#5b4535").lerp(new THREE.Color("#6e5642"), Math.abs(Math.sin(p.x * 9)));
      return n.y > 0.45 ? c.lerp(new THREE.Color("#5c9a4c"), 0.85) : c;
    }, { pos: [0, 0.3, 0] }),
  ]);
}

export class ForestPlants {
  readonly group = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  private rand = mulberry32(99);
  private shrooms: { matrix: THREE.Matrix4; kind: number }[] = [];
  private ferns: THREE.Matrix4[] = [];
  private bells: THREE.Matrix4[] = [];
  private stars: THREE.Matrix4[] = [];
  private rocks: THREE.Matrix4[] = [];
  private logs: THREE.Matrix4[] = [];

  constructor(
    private field: ForestField,
    private glow: GlowField,
    private colliders: Colliders,
  ) {
    this.fairyRing();
    this.scatter();
    this.placeLogs();
  }

  private matrix(x: number, z: number, s: number, yaw = this.rand() * Math.PI * 2): THREE.Matrix4 {
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, this.field.terrainAt(x, z) - 0.02, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(s, s, s),
    );
  }

  private free(x: number, z: number, r: number): boolean {
    if (BERRIES.some((b) => Math.hypot(b.x - x, b.z - z) < 1.6 + r)) return false;
    if (THORNS.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r)) return false;
    return this.field.brookAt(x, z) < 0.05;
  }

  private fairyRing(): void {
    const { x: cx, z: cz, r } = FAIRY_RING;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      this.shrooms.push({ matrix: this.matrix(x, z, 1.5 + this.rand() * 0.4), kind: 0 });
    }
    this.glow.add(new THREE.Vector3(cx, 0.4, cz), "#4fe0ff", r + 1.6, 0.7);
  }

  private scatter(): void {
    const w = MAX_X - MIN_X - 8;
    const d = MAX_Z - MIN_Z - 8;
    for (let i = 0; i < 4000; i++) {
      const x = MIN_X + 4 + this.rand() * w;
      const z = MIN_Z + 4 + this.rand() * d;
      const open = this.field.openAt(x, z);
      const trail = this.field.trailAt(x, z);
      const r = this.rand();
      if (open < -6 || !this.free(x, z, 0.4)) continue;
      const edge = open > -2 && open < 0.8;
      // Glowing mushroom clusters along the forest edge
      if (edge && r < 0.05 && this.shrooms.length < 70) {
        const kind = Math.floor(this.rand() * 3);
        this.shrooms.push({ matrix: this.matrix(x, z, 0.9 + this.rand() * 0.7), kind });
        if (this.shrooms.length % 2 === 0) this.glow.add(new THREE.Vector3(x, 0.4, z), CAP_HEX[kind], 2.6, 0.5);
      } else if (edge && r < 0.11 && this.ferns.length < 130) {
        this.ferns.push(this.matrix(x, z, 0.8 + this.rand() * 0.6));
      } else if (open > 0.3 && trail < 0.2 && r < 0.16 && this.bells.length + this.stars.length < 170) {
        (this.rand() < 0.5 ? this.bells : this.stars).push(this.matrix(x, z, 0.8 + this.rand() * 0.5));
      } else if (r < 0.172 && open < 1.2 && this.rocks.length < 26) {
        const s = 0.35 + this.rand() * 0.5;
        this.rocks.push(this.matrix(x, z, s));
        if (open > 0) this.colliders.add(x, z, 0.75 * s);
      }
    }
  }

  private placeLogs(): void {
    const spots: [number, number, number][] = [
      [-5.6, 4.2, 0.4],
      [-16.4, 6.8, -0.5],
    ];
    for (const [x, z, yaw] of spots) {
      this.logs.push(this.matrix(x, z, 1, yaw));
      this.glow.add(new THREE.Vector3(x, 0.8, z), CAP_HEX[2], 2.2, 0.4);
      // Reason: a log is long and thin, so approximate it with a row of small circles
      for (let t = -1.4; t <= 1.4; t += 0.7) this.colliders.add(x + Math.cos(yaw) * t, z - Math.sin(yaw) * t, 0.42);
      // Little mushrooms growing on the log
      for (let k = 0; k < 3; k++) {
        const t = -1 + k * 0.9;
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x + Math.cos(yaw) * t, this.field.terrainAt(x, z) + 0.6, z - Math.sin(yaw) * t),
          new THREE.Quaternion(),
          new THREE.Vector3(0.6, 0.6, 0.6),
        );
        this.shrooms.push({ matrix: m, kind: 2 });
      }
    }
  }

  /** Build the instanced meshes; call after every glow source is registered. */
  build(time: { value: number }): void {
    const own = <T extends THREE.Material>(m: T): T => (this.materials.push(m), m);
    const capMat = own(glowMaterial());
    const stemMat = own(floraMaterial(time, 99, 0));
    // Mushrooms: three cap colours
    CAPS.forEach((cap, kind) => {
      const list = this.shrooms.filter((s) => s.kind === kind).map((s) => s.matrix);
      if (!list.length) return;
      const { stems, caps } = mushroomCluster(kind * 11 + 3, cap);
      this.group.add(instances(stems, stemMat, list, this.glow, false), instances(caps, capMat, list, null, false));
      stems.dispose();
      caps.dispose();
    });
    const fern = fernGeometry(5);
    this.group.add(instances(fern, own(floraMaterial(time, 0.1, 0.12, true)), this.ferns, this.glow, true));
    const { stem, bell, star } = flowerGeometries();
    const stemSway = own(floraMaterial(time, 0.05, 0.08));
    this.group.add(instances(stem, stemSway, [...this.bells, ...this.stars], this.glow, false));
    this.group.add(instances(bell, capMat, this.bells, null, false), instances(star, capMat, this.stars, null, false));
    const rock = flora.rock(12);
    this.group.add(instances(rock.geometry, stemMat, this.rocks, this.glow, true));
    const log = logGeometry();
    this.group.add(instances(log, stemMat, this.logs, this.glow, true));
    for (const g of [fern, stem, bell, star, rock.geometry, log]) g.dispose();
  }
}
