/**
 * Builds the whole fishing scene: golden late-afternoon light, the lagoon
 * (surface, floor, reef), the jetty with the crew, the tackle, the fish and
 * all the ambient life. Owns everything static or self-animating; the
 * challenge (index.ts) owns the rules and the camera.
 */

import * as THREE from "three";
import { Crew } from "./crew";
import { Dock } from "./dock";
import { WaterFx } from "./fx";
import { GOLDEN_SKY, Scenery } from "./scenery";
import { Seabed, floorHeight } from "./seabed";
import { EVERYDAY, SPECIES, disposeFishModels } from "./species";
import { Fish, FishLook, Minnows, separate } from "./swimmers";
import { Tackle } from "./tackle";
import { SeaSurface, SeaUniforms, createSeaUniforms, seaMaterial, seaOutline } from "./water";

/** Direction towards the low golden sun (over the sea, to the right). */
export const SUN_DIR = new THREE.Vector3(0.5, 0.34, -0.8).normalize();

export class FishingWorld {
  readonly sea: SeaUniforms;
  readonly surface: SeaSurface;
  readonly dock: Dock;
  readonly crew: Crew;
  readonly tackle = new Tackle();
  readonly fx: WaterFx;
  /** The everyday fish in the lagoon. */
  readonly fish: Fish[] = [];
  /** The rare golden fish (waits out of sight until it is its turn). */
  readonly golden: Fish;
  readonly looks: { plain: FishLook; rainbow: FishLook; gold: FishLook };
  private seabed: Seabed;
  private scenery: Scenery;
  private minnows: Minnows;
  private materials: THREE.Material[] = [];

  /** Builds everything into `scene` (the challenge's scene, empty until now). */
  constructor(readonly scene: THREE.Scene) {
    const s = scene;
    s.fog = new THREE.Fog(GOLDEN_SKY.horizon.clone(), 70, 520);
    s.add(new THREE.HemisphereLight("#a9c4f5", "#e8b884", 1.05));
    const sun = new THREE.DirectionalLight("#ffb870", 3.3);
    sun.position.copy(SUN_DIR).multiplyScalar(60).add(new THREE.Vector3(0, 0, -5));
    sun.target.position.set(0, 0, -5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -16;
    sc.right = 16;
    sc.top = 16;
    sc.bottom = -16;
    sc.near = 20;
    sc.far = 110;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
    // Reason: the gameplay camera sees the crew from behind, against the sun; a soft fill keeps them friendly
    const fill = new THREE.DirectionalLight("#ffe6c8", 0.7);
    fill.position.set(-3, 6, 12);
    s.add(sun, sun.target, fill);

    // Reason: mostly zenith blue; more of the peach horizon makes the open sea look lavender
    this.sea = createSeaUniforms(SUN_DIR, GOLDEN_SKY.zenith.clone().lerp(GOLDEN_SKY.horizon, 0.12));
    this.surface = new SeaSurface(this.sea);
    this.seabed = new Seabed(this.sea);
    this.dock = new Dock(this.sea);
    this.scenery = new Scenery(SUN_DIR);
    this.crew = new Crew(this.tackle);
    s.add(this.surface.mesh, this.seabed.group, this.dock.group, this.scenery.group, this.crew.group, this.tackle.group);

    const outline = seaOutline(this.sea, 0.014);
    this.looks = {
      plain: { body: seaMaterial(this.sea, "fish", { roughness: 0.45, selfLit: 0.22 }), outline },
      rainbow: { body: seaMaterial(this.sea, "fish-rainbow", { roughness: 0.25, selfLit: 0.32 }), outline },
      gold: { body: seaMaterial(this.sea, "fish-gold", { roughness: 0.2, selfLit: 0.32 }), outline },
    };
    for (const kind of EVERYDAY) {
      for (let i = 0; i < SPECIES[kind].count; i++) {
        const f = new Fish(kind, kind === "rainbow" ? this.looks.rainbow : this.looks.plain);
        this.fish.push(f);
        s.add(f.root);
      }
    }
    this.golden = new Fish("gold", this.looks.gold);
    this.golden.state = "away";
    this.golden.root.visible = false;
    s.add(this.golden.root);

    const minnowMat = seaMaterial(this.sea, "minnow", { roughness: 0.3, selfLit: 0.35 });
    this.minnows = new Minnows(minnowMat);
    s.add(this.minnows.mesh);

    const bubbleAt = ([[-5.6, -3.2], [-6.9, -8.4], [5.9, -5.1], [7.1, -10.2], [-2.2, -13.6], [3.1, -14.2], [-3.9, -4.4]] as [number, number][]).map(
      ([x, z]) => new THREE.Vector3(x, floorHeight(x, z) + 0.2, z),
    );
    this.fx = new WaterFx(this.surface, this.sea, bubbleAt, SUN_DIR);
    s.add(this.fx.group);

    this.materials.push(outline, minnowMat, ...Object.values(this.looks).map((l) => l.body), ...this.seabed.materials, ...this.dock.materials, ...this.scenery.materials);
  }

  /** Every fish currently swimming in the lagoon (the golden one once it has arrived). */
  get swimming(): Fish[] {
    const all = this.golden.state === "away" ? this.fish : [...this.fish, this.golden];
    return all.filter((f) => f.state !== "away");
  }

  /** Animate everything except the tackle (the game places the bobber, then calls `tackle.update`). */
  update(dt: number, time: number): void {
    this.sea.uTime.value = time;
    this.scenery.update(dt, time);
    this.dock.update(time);
    // Reason: the crew poses Tadeo's arm first, so the rod tip is current when the line is drawn
    this.crew.update(dt, time);
    this.scene.updateMatrixWorld();
    const swimming = this.swimming;
    for (const f of swimming) f.update(dt, time);
    separate(swimming, dt);
    this.minnows.update(dt, time);
    this.fx.update(dt);
  }

  /** Scare the minnows when something splashes nearby. */
  startle(x: number, z: number): void {
    this.minnows.startle(x, z);
  }

  dispose(): void {
    this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.scene.clear();
    for (const m of this.materials) m.dispose();
    this.surface.dispose();
    this.tackle.dispose();
    this.fx.dispose();
    this.scenery.dispose();
    disposeFishModels();
  }
}
