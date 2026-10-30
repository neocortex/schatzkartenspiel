/**
 * HedgeOpening — quest 6. Tadeo holds the crystal sword up to the thorn hedge: the blade burns blue, the light runs
 * out over the thorns and the hedge sinks into the ground. The scene has no talk and needs no key; the forest
 * challenge starts when it ends. It is driven by the game's frame time, like the hedge's own exit.
 */

import * as THREE from "three";
import { CameraRig, Shot } from "../core/CameraRig";
import { smoothstep } from "../core/noise";
import { Player } from "../characters/Player";
import { Bursts } from "../challenges/shared/bursts";
import { glowTexture } from "../world/ambient/textures";
import { createSword } from "../world/models/items";
import { HedgeProp } from "../world/models/storyProps";
import { audio } from "../audio/Audio";

/** Beats of the scene, in seconds from its start. */
const POPPED = 0.45;
const BLADE_LIT: [number, number] = [0.35, 1.2];
/** The light leaves the blade and runs over the thorns. */
const LIGHT_AT = 1.0;
const LIGHT_FOR = 1.0;
/** The hedge starts to sink and takes 2 s to do it (the length of its own exit). */
const SHRINK_AT = 1.4;
const SHRINK_FOR = 2;
const GONE_AT = SHRINK_AT + SHRINK_FOR;
const END = GONE_AT + 0.6;
/** The camera glides from its first shot to its second while the thorns sink. */
const GLIDE: [number, number] = [1.0, GONE_AT];

/** Blue that stays blue under bloom: the red and green stay low while the blue goes over 1. */
const BLUE = new THREE.Color(0.05, 0.35, 1.3);
const SPARK = new THREE.Color(0.3, 0.9, 2.4);

const ramp = (t: number, [from, to]: [number, number]) => THREE.MathUtils.clamp((t - from) / (to - from), 0, 1);
/** 0 to 1 with a little overshoot, like something popping out. */
const pop = (k: number) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;

interface HedgeOpeningDeps {
  scene: THREE.Scene;
  rig: CameraRig;
  player: Player;
  /** The hedge across the gate, and the way to take it away (colliders go with it). */
  hedge: { prop: HedgeProp; remove(): Promise<void> };
  ground: (x: number, z: number) => number;
}

/** The sword in Tadeo's fist with everything that makes it burn. */
interface Blade {
  sword: THREE.Group;
  steel: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  /** The light round the point of the blade. */
  halo: THREE.Sprite;
}

interface Running {
  t: number;
  frame(t: number, dt: number): void;
  done(): void;
}

export class HedgeOpening {
  private running: Running | null = null;
  /** The hedge's exit, from the moment it starts until it is over. */
  private sinking: Promise<void> = Promise.resolve();
  /** Sparks owed to the blade and to the hedge, as fractions of a spark. */
  private owed = { blade: 0, motes: 0 };

  constructor(private d: HedgeOpeningDeps) {}

  /** Advance the scene; call it every frame. */
  update(dt: number): void {
    const r = this.running;
    if (!r) return;
    r.t = Math.min(r.t + dt, END);
    r.frame(r.t, dt);
    if (r.t < END) return;
    this.running = null;
    r.done();
  }

  /** Raise the sword, burn the hedge away and give the camera back to the follow rig. */
  async play(): Promise<void> {
    const { rig, player, scene, hedge } = this.d;
    const avatar = player.avatar;
    const blade = this.drawSword();
    const bursts = new Bursts(glowTexture(), true);
    scene.add(bursts.mesh);
    const [from, to] = this.shots();
    const cues = this.cues(bursts, blade);
    const toward = this.toward();
    const heading = Math.atan2(toward.x, toward.z);
    this.owed = { blade: 0, motes: 0 };
    this.sinking = Promise.resolve();

    avatar.pose = "holdUp";
    avatar.handR.add(blade.sword);
    rig.setShot(from, GLIDE[0] - 0.2);

    try {
      await new Promise<void>((done) => {
        this.running = {
          t: 0,
          done,
          frame: (t, dt) => {
            // Reason: he turns to the hedge as his arms go up; the follow camera would show his face with the hedge behind it
            const turn = Math.atan2(Math.sin(heading - player.facing), Math.cos(heading - player.facing));
            player.facing += turn * Math.min(dt * 10, 1);
            // Reason: world matrices move with the pose, so refresh them before reading where the blade is
            avatar.root.updateMatrixWorld(true);
            while (cues.length && cues[0][0] <= t) cues.shift()![1]();
            if (t >= GLIDE[0]) {
              const k = smoothstep(0, 1, ramp(t, GLIDE));
              rig.jumpToShot({ pos: from.pos.clone().lerp(to.pos, k), look: from.look.clone().lerp(to.look, k) });
            }
            this.burn(t, blade);
            this.light(t);
            this.sparks(t, dt, bursts, blade);
            bursts.update(dt);
          },
        };
      });
      await this.sinking;
    } finally {
      rig.setShot(null, 1);
      avatar.pose = "normal";
      avatar.handR.remove(blade.sword);
      hedge.prop.shine(0, 0);
      scene.remove(bursts.mesh);
      bursts.dispose();
      this.dispose(blade);
    }
  }

  // ── What happens when ─────────────────────────────────────

  /** One-off moments: [seconds, what happens]. */
  private cues(bursts: Bursts, blade: Blade): [number, () => void][] {
    const { rig, hedge } = this.d;
    const tip = () => blade.sword.localToWorld(new THREE.Vector3(0, 1.25, 0));
    const at = hedge.prop.group.position;
    return [
      [0, () => {
        audio.playSfx("sfx_special", 0.8, 1.15);
        bursts.emit(blade.sword.localToWorld(new THREE.Vector3(0, 0.2, 0)), { count: 36, color: SPARK, speed: [1.5, 4], life: [0.4, 0.9], size: [0.06, 0.14], gravity: 1 });
      }],
      [LIGHT_AT, () => {
        // Reason: the light leaves the blade with a flash and a chime, a breath before the thorns feel it
        audio.playSfx("sfx_heal", 0.6, 0.85);
        bursts.emit(tip(), { count: 60, color: SPARK, speed: [2, 6], life: [0.5, 1.1], size: [0.07, 0.16], gravity: 0.5 });
      }],
      [SHRINK_AT, () => {
        // Reason: the door's creak slowed down is the groan of roots letting go of the ground
        audio.playSfx("sfx_door", 0.45, 0.55);
        rig.addShake(0.3);
        this.sinking = hedge.remove();
      }],
      [GONE_AT, () => {
        audio.playSfx("sfx_item_get", 0.5);
        bursts.emit(new THREE.Vector3(at.x, at.y + 0.3, at.z), { count: 50, color: SPARK, speed: [1, 3], up: 2, life: [0.35, 0.6], size: [0.08, 0.18], gravity: 1 });
      }],
    ];
  }

  /** The blade lights up as the sword is raised and dims once the thorns are gone. */
  private burn(t: number, { sword, steel, glow, halo }: Blade): void {
    const lit = ramp(t, BLADE_LIT) * (1 - ramp(t, [GONE_AT, END]));
    const flicker = 1 + 0.1 * Math.sin(t * 17) + 0.05 * Math.sin(t * 29);
    // Reason: the sword pops into his fist, and shrinks away again at the end
    sword.scale.setScalar(Math.max(pop(ramp(t, [0, POPPED])) * (1 - smoothstep(GONE_AT + 0.2, END, t)), 0.001));
    steel.emissiveIntensity = 0.2 + 0.9 * lit;
    glow.opacity = 0.35 * lit * flicker;
    halo.material.opacity = 0.5 * lit;
    halo.scale.setScalar(1.6 * lit * flicker);
  }

  /** The light runs out over the thorns, burns while they sink and dies away with them. */
  private light(t: number): void {
    const spread = smoothstep(0, 1, ramp(t, [LIGHT_AT, LIGHT_AT + LIGHT_FOR]));
    const glow = ramp(t, [LIGHT_AT, LIGHT_AT + 0.5]) * (1 - ramp(t, [GONE_AT - 0.7, GONE_AT]));
    this.d.hedge.prop.shine(spread, glow);
  }

  /** Sparks stream off the blade, and motes rise from the thorns the light has reached. */
  private sparks(t: number, dt: number, bursts: Bursts, { sword }: Blade): void {
    const { hedge } = this.d;
    this.owed.blade += dt * 40 * ramp(t, BLADE_LIT) * (t < GONE_AT ? 1 : 0);
    for (; this.owed.blade >= 1; this.owed.blade--) {
      const at = sword.localToWorld(new THREE.Vector3(0, 0.2 + Math.random() * 1.1, 0));
      bursts.emit(at, { count: 1, color: SPARK, speed: [0.2, 0.9], up: 0.6, life: [0.5, 1], size: [0.08, 0.16], spread: 0.15, gravity: -0.4 });
    }
    if (t < LIGHT_AT || t >= GONE_AT) return;
    this.owed.motes += dt * 100;
    // Reason: motes come off the part of the hedge the light has crossed, as high as the thorns still stand
    const reached = smoothstep(0, 1, ramp(t, [LIGHT_AT, LIGHT_AT + LIGHT_FOR])) * 11;
    const standing = 1 - smoothstep(0.08, 1, ramp(t, [SHRINK_AT, GONE_AT]));
    for (; this.owed.motes >= 1; this.owed.motes--) {
      const local = new THREE.Vector3((Math.random() * 2 - 1) * reached, Math.random() * (0.4 + 3.6 * standing), (Math.random() - 0.5) * 2.4);
      bursts.emit(hedge.prop.group.localToWorld(local), { count: 1, color: SPARK, speed: [0.1, 0.6], up: 1, life: [0.6, 1.3], size: [0.1, 0.2], gravity: -0.5 });
    }
  }

  // ── The sword ─────────────────────────────────────────────

  /** The quest sword, pointing up along his raised arm, with a blue blade and a glow round it. */
  private drawSword(): Blade {
    const sword = createSword();
    // Reason: the arm hangs along -y at rest and the pose raises it, so a blade along the arm's -y points at the sky
    sword.rotation.x = Math.PI;
    sword.scale.setScalar(0.001);
    // Reason: the quest sword's blade reads almost white under bloom; this one is a deep crystal blue (createSword makes the blade and its point first)
    const steel = new THREE.MeshStandardMaterial({ color: "#2a7dff", emissive: "#0f55ff", emissiveIntensity: 0.2, roughness: 0.25 });
    const [bar, point] = sword.children as THREE.Mesh[];
    bar.material = point.material = steel;

    const glow = new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const sheath = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.0, 4, 12), glow);
    sheath.position.y = 0.65;
    // Reason: the halo sits at the point of the blade and stays small; around the blade's middle it would wash out Tadeo's head
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: BLUE, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.position.y = 1.2;
    sword.add(sheath, halo);
    return { sword, steel, glow, halo };
  }

  private dispose({ sword, steel, glow, halo }: Blade): void {
    sword.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
    for (const m of [steel, glow, halo.material]) m.dispose();
  }

  // ── The camera ────────────────────────────────────────────

  /** Unit vector on the ground from the gate towards the forest: the way the hedge faces away from Tadeo. */
  private toward(): THREE.Vector3 {
    const rot = this.d.hedge.prop.group.rotation.y;
    return new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
  }

  /**
   * From beside and behind Tadeo towards the hedge, then a little closer. Tadeo may stand anywhere on the gate's side of the
   * hedge, so the shots are measured from where he is and from the hedge, never from the follow camera, which would look
   * at him through the thorns.
   */
  private shots(): [Shot, Shot] {
    const { hedge, player, ground } = this.d;
    const group = hedge.prop.group;
    const n = this.toward();
    const along = new THREE.Vector3(Math.cos(group.rotation.y), 0, -Math.sin(group.rotation.y));
    const p = player.position;
    const shot = (back: number, aside: number, up: number, toHedge: number, height: number): Shot => {
      // Reason: the sword is in his hand on the +along side, so the camera stands on that side and never has it behind his head
      const pos = p.clone().addScaledVector(n, -back).addScaledVector(along, aside);
      pos.y = Math.max(p.y + up, ground(pos.x, pos.z) + 2.2);
      // Reason: looking between Tadeo and the middle of the hedge keeps both in the picture, whichever side he comes from
      const look = p.clone().lerp(group.position, toHedge);
      look.y = p.y + height;
      return { pos, look };
    };
    return [shot(6.8, 3.0, 3.8, 0.5, 2.3), shot(6.0, 2.8, 3.3, 0.5, 2.6)];
  }
}
