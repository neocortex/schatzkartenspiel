/**
 * Tadeo as a fighter: the Humanoid with the magic sword in his right hand,
 * the berry sprig in his left, a shimmering magic shield bubble, a glowing
 * blade trail, and combat poses (stance, slash, block, eat, hurt, spin)
 * layered over the regular walk/idle animation by animating the public limbs.
 */

import * as THREE from "three";
import { Humanoid } from "../../characters/Humanoid";
import { createTadeo } from "../../characters/cast";
import { createSword, createBerries } from "../../world/models/items";
import { Bin, clamp01, ease, lerp } from "./kit";

export type HeroPose = "normal" | "stance" | "slash" | "block" | "eat" | "hurt" | "cheer" | "spin";

const SHIELD_FRAG = /* glsl */ `
uniform float uTime;
uniform float uPower;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  // Honeycomb-ish shimmer bands sweeping over the bubble
  float bands = 0.5 + 0.5 * sin(vP.y * 18.0 - uTime * 6.0 + sin(vP.x * 12.0) * 1.5);
  vec3 col = mix(vec3(0.25, 0.75, 1.0), vec3(0.85, 1.0, 1.0), fres);
  float a = (fres * 0.85 + bands * 0.12 + 0.05) * uPower;
  gl_FragColor = vec4(col * 1.6, a);
}
`;

export class Hero {
  readonly avatar: Humanoid;
  readonly root: THREE.Group;
  readonly sword: THREE.Group;
  readonly berries: THREE.Group;
  readonly shield: THREE.Mesh;
  /** Glowing aura around the blade (special move). */
  readonly bladeGlow: THREE.Mesh;
  pose: HeroPose = "normal";
  /** Progress of the current slash / spin, 0..1 (driven by the choreography). */
  swing = 0;
  /** Horizontal speed (for the walk cycle) and air state, set by the choreography. */
  speed = 0;
  grounded = true;
  vy = 0;
  /** Talking animation while Tadeo speaks in a dialogue. */
  talking = false;
  private shieldPower = 0;
  private shieldTarget = 0;
  private shieldUniforms = { uTime: { value: 0 }, uPower: { value: 0 } };
  private t = 0;

  constructor(bin: Bin) {
    this.avatar = createTadeo();
    this.root = this.avatar.root;
    this.sword = createSword();
    // Reason: the sword's +y (blade) points along the fist's forward axis, so arm swings carry it
    this.sword.rotation.x = Math.PI / 2;
    this.sword.position.set(0, -0.02, 0.02);
    this.avatar.handR.add(this.sword);
    this.berries = createBerries();
    this.berries.scale.setScalar(0.85);
    this.berries.position.set(0, -0.32, 0.05);
    this.berries.visible = false;
    this.avatar.armL.add(this.berries);

    const glowMat = bin.material(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.4, 3.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.bladeGlow = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.0, 4, 10), glowMat);
    this.bladeGlow.position.y = 0.65;
    this.sword.add(this.bladeGlow);

    const shieldMat = bin.material(
      new THREE.ShaderMaterial({
        uniforms: this.shieldUniforms,
        vertexShader: /* glsl */ `
          varying vec3 vN;
          varying vec3 vV;
          varying vec3 vP;
          void main() {
            vP = position;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix) * normal);
            vV = cameraPosition - wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: SHIELD_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.05, 32, 20), shieldMat);
    this.shield.position.set(0, 0.85, 0.15);
    this.shield.scale.set(1, 1.05, 0.8);
    this.shield.visible = false;
    this.shield.renderOrder = 7;
    this.root.add(this.shield);
  }

  /** Raise or drop the magic shield bubble. */
  setShield(on: boolean): void {
    this.shieldTarget = on ? 1 : 0;
  }

  /** Make the shield flash brightly (a blocked hit). */
  flashShield(): void {
    this.shieldPower = 2.4;
  }

  setBladeGlow(amount: number): void {
    (this.bladeGlow.material as THREE.MeshBasicMaterial).opacity = amount * 0.55;
    this.bladeGlow.scale.setScalar(1 + amount * 0.3);
  }

  update(dt: number): void {
    this.t += dt;
    const a = this.avatar;
    a.pose = this.pose === "cheer" ? "cheer" : this.talking ? "talk" : "normal";
    a.update(dt, { speed: this.speed, grounded: this.grounded, vy: this.vy });
    this.applyCombatPose();

    this.shieldPower += (this.shieldTarget - this.shieldPower) * Math.min(dt * 8, 1);
    this.shieldUniforms.uTime.value = this.t;
    this.shieldUniforms.uPower.value = this.shieldPower;
    this.shield.visible = this.shieldPower > 0.02;
    const pop = 0.6 + Math.min(this.shieldPower, 1) * 0.4;
    this.shield.scale.set(pop, pop * 1.05, pop * 0.8);
  }

  private applyCombatPose(): void {
    const a = this.avatar;
    const t = this.t;
    const s = this.swing;
    switch (this.pose) {
      case "stance": {
        const bob = Math.sin(t * 5) * 0.03;
        a.body.position.y += -0.04 + bob;
        a.armR.rotation.set(-1.0 + bob, 0, 0.3);
        a.armL.rotation.set(-0.5, 0, -0.35);
        a.torso.rotation.y = -0.15;
        a.legL.rotation.x = -0.25;
        a.legR.rotation.x = 0.2;
        break;
      }
      case "slash": {
        // Wind up behind the head, then strike down and across in a fast arc
        const up = ease.outQuad(clamp01(s / 0.35));
        const down = ease.outCubic(clamp01((s - 0.35) / 0.25));
        const x = lerp(lerp(-1.0, -2.9, up), 0.7, down);
        a.armR.rotation.set(x, 0, lerp(0.3, 0.1, down));
        a.armL.rotation.set(lerp(-0.5, 0.4, down), 0, -0.6);
        a.torso.rotation.y = lerp(0.35 * up, -0.45, down);
        a.torso.rotation.x = 0.25 * down;
        a.head.rotation.x = 0.1 * down;
        break;
      }
      case "block": {
        const shake = Math.sin(t * 40) * 0.015;
        a.body.position.y -= 0.1;
        a.armR.rotation.set(-1.45 + shake, 0, 1.0);
        a.armL.rotation.set(-1.2, 0, -0.5);
        a.torso.rotation.x = 0.15;
        a.legL.rotation.x = -0.45;
        a.legR.rotation.x = 0.35;
        break;
      }
      case "eat": {
        const chew = Math.sin(t * 14) * 0.1;
        a.armL.rotation.set(-2.1 + chew, 0, 0.55);
        a.armR.rotation.set(-0.3, 0, 0.35);
        a.head.rotation.x = -0.15;
        break;
      }
      case "hurt": {
        a.torso.rotation.x = -0.35;
        a.head.rotation.x = -0.25;
        a.armL.rotation.set(-0.4, 0, -1.1);
        a.armR.rotation.set(-0.6, 0, 1.0);
        break;
      }
      case "spin": {
        a.armR.rotation.set(-1.55, 0, 1.45);
        a.armL.rotation.set(-0.3, 0, -1.3);
        a.legL.rotation.x = -0.6;
        a.legR.rotation.x = 0.3;
        break;
      }
      default:
        break;
    }
  }
}
