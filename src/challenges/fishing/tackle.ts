/**
 * Tadeo's fishing tackle: a rod in three segments that bends under a pull,
 * the fishing line (a fat line sagging from the rod tip), the red-and-white
 * bobber with its hook hanging below, the glowing aim marker on the water
 * and a dotted arc that previews the cast. The game decides where the bobber
 * is; this module only builds and draws everything.
 */

import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { mat, toonMesh } from "../../characters/parts";
import { glowTexture } from "../../world/ambient/textures";

const LINE_POINTS = 28;
const ARC_DOTS = 18;

/** Point on a cast arc from `a` to `b` (t in 0..1) peaking `h` above the straight line. */
export function arcPoint(a: THREE.Vector3, b: THREE.Vector3, h: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  return out.lerpVectors(a, b, t).setY(THREE.MathUtils.lerp(a.y, b.y, t) + h * 4 * t * (1 - t));
}

export class Tackle {
  /** Attach to Tadeo's right hand. Local +z runs along the rod. */
  readonly rod = new THREE.Group();
  /** World-space parts (line, bobber, marker, arc). */
  readonly group = new THREE.Group();
  readonly bobber = new THREE.Group();
  readonly marker = new THREE.Group();
  /** Where the line leaves the bobber (follows the bobber unless a fish is on). */
  readonly lineEnd = new THREE.Vector3();
  /** 0 = straight rod, 1 = bent hard by a fish. */
  bend = 0;
  /** How much the line sags (0 = taut). */
  slack = 0.6;
  /** Show the hook and leader under the bobber. */
  hookVisible = true;
  private segments: THREE.Group[] = [];
  private tip = new THREE.Object3D();
  private line: Line2;
  private lineGeo = new LineGeometry();
  private lineMat: LineMaterial;
  private leader: THREE.Line;
  private hook: THREE.Mesh;
  private arc: THREE.Points;
  private arcPos: Float32Array;
  private ring: THREE.Mesh;
  private arrow: THREE.Group;
  private pts = new Float32Array(LINE_POINTS * 3);
  private tmp = new THREE.Vector3();
  private tipPos = new THREE.Vector3();

  constructor() {
    this.buildRod();
    this.lineMat = new LineMaterial({ color: 0xf4f1e8, linewidth: 0.014, worldUnits: true, transparent: true, opacity: 0.9 });
    this.lineGeo.setPositions(this.pts);
    this.line = new Line2(this.lineGeo, this.lineMat);
    this.line.frustumCulled = false;
    this.line.renderOrder = 4;

    // Bobber: red cap, white belly, yellow antenna (bright enough to read from the camera)
    const cap = toonMesh(new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat("#ff2d3a", 0.35, 0.45));
    const belly = toonMesh(new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat("#fff8ee", 0.4, 0.35));
    belly.scale.y = 1.25;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.123, 0.123, 0.025, 18), mat("#1d1d24", 0.5));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6), mat("#ffd23f", 0.4, 0.5));
    stick.position.y = 0.2;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mat("#ffd23f", 0.3, 0.9));
    knob.position.y = 0.3;
    this.bobber.add(cap, belly, band, stick, knob);

    // Leader and hook under the bobber
    const leaderGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.14, 0), new THREE.Vector3(0, -0.55, 0)]);
    this.leader = new THREE.Line(leaderGeo, new THREE.LineBasicMaterial({ color: 0xe8f0f0, transparent: true, opacity: 0.7 }));
    this.hook = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 5, 10, Math.PI * 1.4), mat("#c8ccd6", 0.3));
    this.hook.position.y = -0.58;
    this.hook.rotation.z = Math.PI * 0.8;
    this.bobber.add(this.leader, this.hook);

    // Aim marker: a glowing ring, a soft disc and a bouncing arrow
    const glow = glowTexture();
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 0.7), transparent: true, opacity: 0.9, depthWrite: false }),
    );
    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glow, color: new THREE.Color(1.4, 1.1, 0.45), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.arrow = new THREE.Group();
    const cone = toonMesh(new THREE.ConeGeometry(0.16, 0.3, 4), mat("#ffd23f", 0.4, 0.7));
    cone.rotation.x = Math.PI;
    this.arrow.add(cone);
    this.marker.add(disc, this.ring, this.arrow);
    this.marker.position.y = 0.03;
    for (const o of [this.ring, disc]) o.renderOrder = 3;

    // Cast preview: glowing dots along the arc
    this.arcPos = new Float32Array(ARC_DOTS * 3);
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute("position", new THREE.BufferAttribute(this.arcPos, 3));
    this.arc = new THREE.Points(
      arcGeo,
      new THREE.PointsMaterial({ map: glow, size: 0.2, color: new THREE.Color(1.6, 1.35, 0.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.arc.frustumCulled = false;
    this.arc.renderOrder = 4;

    this.group.add(this.line, this.bobber, this.marker, this.arc);
  }

  private buildRod(): void {
    const handle = toonMesh(new THREE.CylinderGeometry(0.034, 0.03, 0.36, 8).rotateX(Math.PI / 2), mat("#8a5a32", 0.7));
    handle.position.z = -0.06;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8).rotateX(Math.PI / 2), mat("#c9a26a", 0.9));
    grip.position.z = -0.12;
    const reel = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12).rotateZ(Math.PI / 2), mat("#3a6fd8", 0.4));
    reel.position.set(0, -0.07, 0.04);
    const crank = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), mat("#ffd23f", 0.4));
    crank.position.set(0.05, -0.1, 0.04);
    this.rod.add(handle, grip, reel, crank);
    // Three blank segments chained so the rod can curve
    const lengths = [0.75, 0.65, 0.55];
    const radii = [0.022, 0.016, 0.011];
    let parent: THREE.Object3D = this.rod;
    let z = 0.12;
    lengths.forEach((len, i) => {
      const seg = new THREE.Group();
      seg.position.z = z;
      const blank = toonMesh(new THREE.CylinderGeometry(radii[i] * 0.75, radii[i], len, 6).rotateX(Math.PI / 2), mat(i === 2 ? "#ffd23f" : "#e8e2d4", 0.5));
      blank.position.z = len / 2;
      const guide = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 4, 8), mat("#c8ccd6", 0.3));
      guide.position.set(0, -0.02, len * 0.9);
      seg.add(blank, guide);
      parent.add(seg);
      this.segments.push(seg);
      parent = seg;
      z = len;
    });
    this.tip.position.z = lengths[2];
    parent.add(this.tip);
  }

  /** World position of the rod tip (valid after the scene's world matrices update). */
  tipWorld(out: THREE.Vector3): THREE.Vector3 {
    this.tip.updateWorldMatrix(true, false);
    return this.tip.getWorldPosition(out);
  }

  /** Show or hide the aim marker and arc preview. */
  showAim(on: boolean): void {
    this.marker.visible = on;
    this.arc.visible = on;
  }

  update(time: number): void {
    // Rod bend: each segment curls a little more, plus a tremble while a fish pulls
    const tremble = this.bend > 0.3 ? Math.sin(time * 38) * 0.03 * this.bend : 0;
    this.segments.forEach((s, i) => (s.rotation.x = (this.bend * 0.32 + tremble) * (i + 1) * 0.6));

    // Fishing line: sagging curve from the tip to the bobber
    const a = this.tipWorld(this.tipPos);
    const b = this.lineEnd;
    const sag = this.slack * Math.min(a.distanceTo(b) * 0.18, 1.2);
    for (let i = 0; i < LINE_POINTS; i++) {
      const t = i / (LINE_POINTS - 1);
      this.tmp.lerpVectors(a, b, t);
      this.tmp.y -= sag * 4 * t * (1 - t);
      this.pts.set([this.tmp.x, this.tmp.y, this.tmp.z], i * 3);
    }
    this.lineGeo.setPositions(this.pts);
    this.lineMat.resolution.set(window.innerWidth, window.innerHeight);
    this.leader.visible = this.hookVisible;
    this.hook.visible = this.hookVisible;

    // Marker pulse, arrow bounce and the arc preview flowing towards the marker
    if (this.marker.visible) {
      const pulse = 1 + Math.sin(time * 5) * 0.08;
      this.ring.scale.setScalar(pulse);
      this.arrow.position.y = 0.75 + Math.abs(Math.sin(time * 4)) * 0.25;
      this.arrow.rotation.y = time * 2;
      const m = this.marker.position;
      const h = 1.4 + a.distanceTo(m) * 0.12;
      for (let i = 0; i < ARC_DOTS; i++) {
        const t = ((i + (time * 1.6) % 1) / ARC_DOTS) * 0.92 + 0.04;
        arcPoint(a, m, h, t, this.tmp);
        this.arcPos.set([this.tmp.x, this.tmp.y, this.tmp.z], i * 3);
      }
      this.arc.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose(): void {
    this.lineGeo.dispose();
    this.lineMat.dispose();
    this.arc.geometry.dispose();
    (this.arc.material as THREE.Material).dispose();
  }
}
