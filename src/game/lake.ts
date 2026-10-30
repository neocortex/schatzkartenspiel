/**
 * Lake — quest 4. Each of the three tablets asks a riddle: the Steintafel says it, then a stone card offers
 * three answers. A wrong answer gets a kind line and another try; the right one lights the tablet's runes.
 * The third lit tablet wakes the Hüter, who rises out of the water.
 */

import * as THREE from "three";
import { Shot } from "../core/CameraRig";
import { Input } from "../core/Input";
import { IslandScene } from "../scenes/IslandScene";
import { GameUI } from "../ui/GameUI";
import { askRiddle } from "../ui/RiddleCard";
import { createHueter } from "../characters/Hueter";
import { DialogueScript } from "../data/dialogues";
import { LANDMARKS, WATER_LEVEL } from "../world/layout";
import { audio } from "../audio/Audio";

/** Riddle i belongs to tablet i. The right answer is never first, because the card starts on the first answer. */
export const RIDDLES: { lines: string[]; answers: string[]; right: number }[] = [
  { lines: ["Ich laufe immer mit dir mit, ich sage nie ein Wort.", "Und kommt die Nacht, dann bin ich fort."], answers: ["Chuleta", "Schatten", "Wind"], right: 1 },
  { lines: ["Mein Haus trag ich auf dem Rücken, ich muss mich nie danach bücken."], answers: ["Krabbe", "Papagei", "Schildkröte"], right: 2 },
  { lines: ["Ich bin ein Berg mit rotem Bauch, ich spucke Feuer, Stein und Rauch."], answers: ["Drache", "Vulkan", "Kamin"], right: 1 },
];

/** How far from the middle of the lake, towards Tadeo, the Hüter rises: close enough to see his face, still over open water. */
const RISE_TOWARDS_TADEO = 3.5;
/** The calm lake before the magic, and the pause once he has risen. */
const CALM_MS = 2000;
const HOLD_MS = 700;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Distance on the ground from the point (px, pz) to the segment a to b. */
function distanceToSegment(a: THREE.Vector3, b: THREE.Vector3, px: number, pz: number): number {
  const [abx, abz] = [b.x - a.x, b.z - a.z];
  const t = THREE.MathUtils.clamp(((px - a.x) * abx + (pz - a.z) * abz) / (abx * abx + abz * abz), 0, 1);
  return Math.hypot(a.x + abx * t - px, a.z + abz * t - pz);
}

interface LakeDeps {
  island: IslandScene;
  ui: GameUI;
  input: Input;
  /** Play a conversation: a key of `DIALOGUES` or a script. */
  talk: (script: string | DialogueScript) => Promise<void>;
}

export class Lake {
  /** Tablets answered right since the page loaded. */
  readonly solved = new Set<number>();
  private hueter = createHueter();

  constructor(private d: LakeDeps) {
    d.island.scene.add(this.hueter.root);
  }

  update(dt: number, time: number): void {
    this.hueter.update(dt, time);
  }

  /**
   * Read tablet `i`'s riddle until it is answered right, then light the tablet.
   * @returns True when this was the last tablet, with the camera still on it; false once the camera is back with Tadeo.
   */
  async solve(i: number): Promise<boolean> {
    const { lines, answers, right } = RIDDLES[i];
    const [tx, tz] = LANDMARKS.tablets[i];
    const player = this.d.island.player;
    player.facing = Math.atan2(tx - player.position.x, tz - player.position.z);
    await this.d.talk(lines.map((text) => ({ speaker: "Steintafel", portrait: "", text })));
    while ((await askRiddle(this.d.ui.layer, this.d.input, answers, lines)) !== right) await this.d.talk("lake_wrong");

    const { rig } = this.d.island;
    const { landmarks } = this.d.island.island;
    rig.setShot(this.tabletShot(i), 0.9);
    await wait(900);
    landmarks.lightTablet(i);
    this.solved.add(i);
    audio.playSfx("sfx_item_get", 0.6);
    await wait(2000);
    if (this.solved.size === RIDDLES.length) return true;
    rig.setShot(null, 1);
    return false;
  }

  /** The Hüter rises out of the lake, facing Tadeo, while the camera watches from behind Tadeo. */
  async rise(): Promise<void> {
    const { rig, player } = this.d.island;
    const p = player.position;
    const spot = this.risingSpot();
    this.hueter.root.position.copy(spot);
    this.hueter.root.rotation.y = Math.atan2(p.x - spot.x, p.z - spot.z);
    player.facing = Math.atan2(spot.x - p.x, spot.z - p.z);
    rig.setShot(this.lakeShot(spot), 1.8);
    await wait(CALM_MS);
    // Reason: the door's creak slowed down becomes a deep groan from under the water
    audio.playSfx("sfx_door", 0.7, 0.5);
    rig.addShake(0.3);
    const risen = this.hueter.rise();
    await wait(1600);
    audio.playSfx("sfx_heal", 0.55, 0.5);
    await risen;
    await wait(HOLD_MS);
  }

  /** He thins out and drifts away; then the camera goes back to Tadeo. */
  async fade(): Promise<void> {
    await this.hueter.fade();
    this.d.island.rig.setShot(null, 1.4);
  }

  /** What the lake really shows, read from the scene. */
  get e2e(): { solved: number; lit: boolean[]; ghost: boolean } {
    const { landmarks } = this.d.island.island;
    return { solved: this.solved.size, lit: RIDDLES.map((_, i) => landmarks.isTabletLit(i)), ghost: this.hueter.root.visible };
  }

  /** The lit face of tablet `i` from a side, on the side away from Tadeo so he never stands in front of it. */
  private tabletShot(i: number): Shot {
    const { hf } = this.d.island.island;
    const [tx, tz] = LANDMARKS.tablets[i];
    const front = new THREE.Vector2(LANDMARKS.lake[0] - tx, LANDMARKS.lake[1] - tz).normalize();
    const side = new THREE.Vector2(-front.y, front.x);
    const p = this.d.island.player.position;
    const at = (s: number) => new THREE.Vector2(tx, tz).addScaledVector(front, 4.4).addScaledVector(side, s * 4.8);
    const [a, b] = [at(1), at(-1)];
    const cam = a.distanceTo(new THREE.Vector2(p.x, p.z)) > b.distanceTo(new THREE.Vector2(p.x, p.z)) ? a : b;
    const base = hf.heightAt(tx, tz);
    const pos = new THREE.Vector3(cam.x, Math.max(base + 2.2, hf.heightAt(cam.x, cam.y) + 1.8), cam.y);
    return { pos, look: new THREE.Vector3(tx, base + 1.7, tz) };
  }

  /** In the lake, a little way from its middle towards Tadeo. */
  private risingSpot(): THREE.Vector3 {
    const p = this.d.island.player.position;
    const [lx, lz] = LANDMARKS.lake;
    const towardsTadeo = new THREE.Vector3(p.x - lx, 0, p.z - lz).normalize();
    return new THREE.Vector3(lx, WATER_LEVEL, lz).addScaledVector(towardsTadeo, RISE_TOWARDS_TADEO);
  }

  /** Over Tadeo's shoulder, across the water to the Hüter. */
  private lakeShot(spot: THREE.Vector3): Shot {
    const { hf } = this.d.island.island;
    const p = this.d.island.player.position;
    const look = spot.clone().setY(WATER_LEVEL + 2.6);
    const dir = new THREE.Vector3(spot.x - p.x, 0, spot.z - p.z).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    // Reason: Tadeo may stand with a tablet between him and the lake; take the side from which no tablet hides the Hüter
    const spots = [1, -1].map((s) => {
      const pos = p.clone().addScaledVector(dir, -4.6).addScaledVector(side, s * 3);
      pos.y = Math.max(p.y + 3.4, hf.heightAt(pos.x, pos.z) + 2.4);
      return pos;
    });
    const clearance = (pos: THREE.Vector3) => Math.min(...LANDMARKS.tablets.map(([x, z]) => distanceToSegment(pos, look, x, z)));
    return { pos: clearance(spots[0]) > clearance(spots[1]) ? spots[0] : spots[1], look };
  }
}
