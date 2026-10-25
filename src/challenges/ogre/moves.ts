/**
 * Fight choreography: every move of Tadeo and the ogre as a short scripted
 * sequence (run-up, wind-up, strike, impact, recovery) with camera moves,
 * hit-stop, slow motion, particles, sounds and floating numbers. Written as
 * async code on the game-time timeline, so slow motion slows everything.
 */

import * as THREE from "three";
import { audio } from "../../audio/Audio";
import { Timeline, ease, lerp, hump } from "./kit";
import { Fx } from "./fx";
import { Director } from "./director";
import { Popups } from "./popups";
import { Hero } from "./hero";
import { Ogre, OgrePose, OgreMood } from "./Ogre";
import { deckAt } from "./gorgeShape";
import { OgreResult } from "./fight";

export interface Stage {
  tl: Timeline;
  hero: Hero;
  ogre: Ogre;
  fx: Fx;
  cam: Director;
  pop: Popups;
  /** Group holding the bridge and everyone on it (dips when the deck is hit). */
  bridge: THREE.Group;
  scene: THREE.Scene;
  heroHome: number;
  ogreHome: number;
  /** Pose and mood the ogre returns to after flinching. */
  ogreRest: { pose: OgrePose; mood: OgreMood };
  hitStop(seconds: number): void;
  slowmo(scale: number, seconds: number): void;
  onHealth(): void;
}

const GRUMBLES = ["Grrr! Meine Brücke!", "Hmpf!", "Na warte!", "Ich hab Hunger!", "Grummel…"];
const OUCHES = ["Aua!", "Uff!", "Das kitzelt!", "Autsch!", "Oho!"];
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

// ── Placement & camera ───────────────────────────────────────

export function setX(obj: THREE.Object3D, x: number, lift = 0): void {
  obj.position.set(x, deckAt(x) + lift, 0);
}

/** Camera presets framing the fight. */
export const shots = {
  // Reason: pulled back far enough that the ogre's raised club fits between the health bars and the cards
  wide: (s: Stage) => s.cam.move(new THREE.Vector3(0.4, 6.6, 14.2), new THREE.Vector3(0.4, 5.0, 0), 1.2),
  /** Closer two-shot centred on where the action happens (x on the deck). */
  action: (s: Stage, x: number) => s.cam.move(new THREE.Vector3(x - 0.6, 6.0, 11.5), new THREE.Vector3(x, 4.9, 0), 0.8),
  hero: (s: Stage) => {
    const p = s.hero.root.position;
    // Reason: from inside the railings, so no post or rail covers Tadeo; aimed low so his face clears the dialogue box
    s.cam.move(new THREE.Vector3(p.x + 4.2, p.y + 1.7, 1.4), new THREE.Vector3(p.x, p.y + 0.7, 0), 0.9);
  },
  ogre: (s: Stage) => {
    const p = s.ogre.root.position;
    s.cam.move(new THREE.Vector3(p.x - 3.0, p.y + 3.0, 7.6), new THREE.Vector3(p.x - 0.4, p.y + 2.05, 0), 0.9);
  },
  ogreLow: (s: Stage) => {
    const p = s.ogre.root.position;
    s.cam.move(new THREE.Vector3(p.x - 4.2, p.y + 0.9, 5.2), new THREE.Vector3(p.x, p.y + 3.0, 0), 1.0);
  },
  /** Both side by side (the friendly ending). */
  duo: (s: Stage) => {
    const mid = (s.hero.root.position.x + s.ogre.root.position.x) / 2;
    const y = deckAt(mid);
    s.cam.move(new THREE.Vector3(mid - 0.8, y + 2.4, 7.4), new THREE.Vector3(mid, y + 1.5, 0), 1.0);
  },
};

/** The bridge dips under a heavy blow and springs back. */
export function bridgeBounce(s: Stage, amount: number): void {
  void s.tl.tween(0.7, (k) => (s.bridge.position.y = -amount * Math.sin(k * Math.PI * 3) * (1 - k)));
}

function chest(o: THREE.Object3D, up = 0.9): THREE.Vector3 {
  return o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, up, 0));
}

function say(s: Stage, text: string): void {
  s.pop.show(text, s.ogre.headPos().add(new THREE.Vector3(0, 1.1, 0)), { size: 30, life: 1.8, rise: 0.4, bubble: true });
}

// ── Tadeo ───────────────────────────────────────────────────

/** Run along the deck (walk cycle) to x. */
async function heroRun(s: Stage, to: number, dur: number): Promise<void> {
  const h = s.hero;
  const from = h.root.position.x;
  h.speed = Math.abs(to - from) / dur;
  await s.tl.tween(dur, (k) => setX(h.root, lerp(from, to, ease.inOut(k))));
  h.speed = 0;
}

/** Hop in an arc to x (keeps facing). */
async function heroHop(s: Stage, to: number, dur: number, height: number): Promise<void> {
  const h = s.hero;
  const from = h.root.position.x;
  h.grounded = false;
  await s.tl.tween(dur, (k) => {
    h.vy = k < 0.5 ? 1 : -1;
    setX(h.root, lerp(from, to, ease.inOut(k)), hump(k) * height);
  });
  h.grounded = true;
  h.vy = 0;
}

export async function heroAttack(s: Stage, damage: number): Promise<void> {
  const { hero, ogre, fx, tl } = s;
  shots.action(s, ogre.root.position.x - 1.2);
  hero.pose = "normal";
  await heroRun(s, ogre.root.position.x - 2.3, 0.5);
  hero.pose = "slash";
  hero.grounded = false;
  audio.playSfx("sfx_attack");
  const x0 = hero.root.position.x;
  await tl.tween(0.2, (k) => {
    hero.swing = k * 0.45;
    setX(hero.root, x0 + k * 0.3, hump(k * 0.5) * 0.7);
  });
  // Impact
  const at = ogre.bellyPos();
  fx.hit(at, "#bfe9ff", 1.1);
  audio.playSfx("sfx_enemy_hit");
  s.pop.show(`-${damage}`, at, { color: "#ffffff", size: 72 });
  ogre.setPose("hit", 18);
  ogre.mood = "hurt";
  ogre.bounce(0.55);
  s.cam.shake(0.4);
  s.cam.punch(-2.5);
  s.hitStop(0.08);
  s.onHealth();
  if (Math.random() < 0.6) say(s, pick(OUCHES));
  await tl.tween(0.24, (k) => {
    hero.swing = 0.45 + k * 0.55;
    setX(hero.root, x0 + 0.3, hump(0.5 + k * 0.5) * 0.7);
  });
  hero.grounded = true;
  await tl.wait(0.15);
  ogre.setPose(s.ogreRest.pose, 5);
  ogre.mood = s.ogreRest.mood;
  hero.pose = "normal";
  await heroHop(s, s.heroHome, 0.55, 0.9);
  hero.pose = "stance";
  hero.swing = 0;
}

export async function heroSpecial(s: Stage, damage: number): Promise<void> {
  const { hero, ogre, fx, tl } = s;
  shots.hero(s);
  hero.pose = "stance";
  audio.playSfx("sfx_special");
  // Charge up: the blade glows, sparkles swirl, a golden ring at Tadeo's feet
  const feet = hero.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.05, 0));
  fx.ring(feet, 2.4, "#ffe066", 0.8, true);
  await tl.tween(0.8, (k) => {
    hero.setBladeGlow(k);
    if (Math.random() < 0.6) fx.stars(chest(hero.sword, 0.6), 1);
  });
  shots.wide(s);
  // Leap high with a spin and come down on the ogre
  const from = hero.root.position.x;
  const to = ogre.root.position.x - 1.9;
  hero.pose = "spin";
  hero.grounded = false;
  const yaw = hero.root.rotation.y;
  audio.playSfx("sfx_attack", 1, 0.8);
  await tl.tween(0.75, (k) => {
    setX(hero.root, lerp(from, to, ease.inOut(k)), hump(k) * 3.2 + k * 0.6);
    hero.root.rotation.y = yaw + ease.outQuad(k) * Math.PI * 4;
    hero.vy = k < 0.5 ? 1 : -1;
    if (Math.random() < 0.5) fx.glow.emit({ at: chest(hero.sword, 0.6), count: 2, speed: [0, 0.5], life: [0.3, 0.5], size: [0.35, 0.05], color: ["#bfe9ff", "#ffe066"], intensity: 2.5, shape: 1 });
  });
  hero.root.rotation.y = yaw;
  hero.pose = "slash";
  hero.swing = 0.3;
  await tl.tween(0.1, (k) => {
    hero.swing = 0.3 + k * 0.2;
    setX(hero.root, to, 0.6 * (1 - k));
  });
  const at = ogre.bellyPos();
  fx.hit(at, "#ffe066", 2.2);
  fx.stars(at, 18);
  fx.ring(ogre.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0)), 7, "#ffe066", 0.9, true);
  audio.playSfx("sfx_enemy_hit", 1, 0.8);
  audio.playSfx("sfx_hammer_hit", 0.7);
  s.pop.show("SUPER!", at.clone().add(new THREE.Vector3(0, 1.6, 0)), { color: "#ffd23f", size: 96, life: 1.6 });
  s.pop.show(`-${damage}`, at, { color: "#ffffff", size: 84 });
  ogre.setPose("hit", 18);
  ogre.mood = "dizzy";
  ogre.bounce(0.9);
  s.cam.shake(0.9);
  s.cam.punch(5);
  bridgeBounce(s, 0.12);
  s.hitStop(0.14);
  s.slowmo(0.3, 0.45);
  s.onHealth();
  hero.grounded = true;
  await tl.tween(0.3, (k) => (hero.swing = 0.5 + k * 0.5));
  await tl.wait(0.5);
  hero.setBladeGlow(0);
  hero.pose = "normal";
  await heroHop(s, s.heroHome, 0.6, 1.0);
  hero.pose = "stance";
  hero.swing = 0;
  ogre.setPose(s.ogreRest.pose, 4);
  await tl.wait(0.6);
  ogre.mood = s.ogreRest.mood;
}

export async function heroDefend(s: Stage): Promise<void> {
  const { hero, fx } = s;
  hero.pose = "block";
  hero.setShield(true);
  audio.playSfx("sfx_defend");
  fx.ring(hero.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.06, 0)), 2.6, "#7fdcff", 0.7, true);
  fx.glow.emit({ at: chest(hero.root), count: 16, speed: [1, 2.5], spread: 2, drag: 2, life: [0.4, 0.8], size: [0.25, 0.05], color: ["#7fdcff", "#ffffff"], intensity: 2.5, shape: 1 });
  s.pop.show("Schild!", chest(hero.root, 2.0), { color: "#7fdcff", size: 44 });
  await s.tl.wait(0.6);
}

export async function heroHeal(s: Stage, amount: number): Promise<void> {
  const { hero, fx, tl } = s;
  shots.hero(s);
  hero.pose = "eat";
  hero.berries.visible = true;
  audio.playSfx("sfx_berry_collect");
  await tl.wait(0.7);
  audio.playSfx("sfx_heal");
  fx.heal(chest(hero.root, 0.8));
  s.pop.show(amount > 0 ? `+${amount}` : "Schon fit!", chest(hero.root, 1.9), { color: "#8dff7a", size: amount > 0 ? 72 : 44 });
  s.onHealth();
  await tl.wait(0.8);
  hero.berries.visible = false;
  hero.pose = "stance";
  shots.wide(s);
  await tl.wait(0.3);
}

/** Tadeo ran out of health: the magic berries glow and patch him up. */
export async function heroRevive(s: Stage): Promise<void> {
  const { hero, fx, tl } = s;
  shots.hero(s);
  hero.berries.visible = true;
  hero.pose = "eat";
  s.pop.show("Zauberbeeren!", chest(hero.root, 2.1), { color: "#d7a6ff", size: 56, life: 1.8 });
  audio.playSfx("sfx_heal");
  for (let i = 0; i < 5; i++) {
    fx.heal(chest(hero.root, 0.4 + i * 0.3));
    fx.glow.emit({ at: chest(hero.root, 0), count: 10, speed: [2, 4], dir: new THREE.Vector3(0, 1, 0), spread: 0.15, life: [0.6, 1.0], size: [0.5, 0.1], color: ["#c58bff", "#ffffff"], intensity: 2.5 });
    await tl.wait(0.22);
  }
  s.onHealth();
  hero.berries.visible = false;
  hero.pose = "cheer";
  await tl.wait(0.9);
  hero.pose = "stance";
  shots.wide(s);
}

// ── The ogre ────────────────────────────────────────────────

/** Stomp along the deck to x (forwards or backwards) with dust on every step. */
async function ogreWalk(s: Stage, to: number, dur: number): Promise<void> {
  const o = s.ogre;
  const from = o.root.position.x;
  o.walk = 1;
  let stepTimer = 0;
  await s.tl.tween(dur, (k) => {
    setX(o.root, lerp(from, to, ease.inOut(k)));
    stepTimer -= 1 / 60;
    if (stepTimer < 0) {
      stepTimer = 0.42;
      s.fx.dust(o.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0.4)), 0.5, 4);
      s.cam.shake(0.12);
    }
  });
  o.walk = 0;
}

async function hitHero(s: Stage, res: OgreResult, at: THREE.Vector3, big: boolean): Promise<void> {
  const { hero, fx } = s;
  if (res.blocked) {
    hero.flashShield();
    fx.hit(at, "#7fdcff", big ? 1.6 : 1);
    audio.playSfx("sfx_defend");
    s.pop.show(big ? "BOING!" : "Abgewehrt!", at.clone().add(new THREE.Vector3(0, 0.6, 0)), { color: "#7fdcff", size: big ? 92 : 58 });
    s.cam.shake(big ? 0.6 : 0.3);
    s.hitStop(0.06);
    return;
  }
  fx.hit(at, "#ff7a4a", big ? 1.5 : 1);
  audio.playSfx("sfx_hit_damage");
  s.pop.show(`-${res.damage}`, chest(hero.root, 1.6), { color: "#ff6b5a", size: 72 });
  hero.pose = "hurt";
  s.cam.shake(big ? 1.0 : 0.5);
  s.cam.punch(big ? 4 : 2);
  s.hitStop(0.07);
  s.onHealth();
  await heroHop(s, s.heroHome - (big ? 1.1 : 0.6), 0.35, 0.5);
}

export async function ogreTurn(s: Stage, res: OgreResult): Promise<void> {
  if (res.move === "windup") return ogreWindup(s);
  if (res.move === "swipe") return ogreSwipe(s, res);
  return ogreSlam(s, res);
}

async function ogreSwipe(s: Stage, res: OgreResult): Promise<void> {
  const { ogre, hero, tl } = s;
  shots.action(s, hero.root.position.x + 1.6);
  ogre.mood = "angry";
  if (Math.random() < 0.7) say(s, pick(GRUMBLES));
  await ogreWalk(s, hero.root.position.x + 3.1, 1.0);
  ogre.setPose("swipeWind", 5);
  await tl.wait(0.55);
  audio.playSfx("sfx_enemy_attack");
  ogre.setPose("swipe", 20);
  await tl.wait(0.13);
  await hitHero(s, res, chest(hero.root, 0.9).add(new THREE.Vector3(0.4, 0, 0)), false);
  ogre.bounce(0.3);
  await tl.wait(0.45);
  ogre.setPose("idle", 4);
  ogre.mood = "grumpy";
  hero.setShield(false);
  void heroRecover(s);
  await ogreWalk(s, s.ogreHome, 1.1);
  shots.wide(s);
}

async function ogreWindup(s: Stage): Promise<void> {
  const { ogre, fx, tl } = s;
  shots.ogreLow(s);
  ogre.setPose("windup", 2.2);
  ogre.mood = "angry";
  s.ogreRest = { pose: "windup", mood: "angry" };
  audio.playSfx("sfx_timer_warn");
  say(s, "Gleich mach ich BUMM!");
  const home = ogre.root.position.x;
  await tl.tween(1.4, (k) => {
    ogre.root.position.x = home + Math.sin(k * 90) * 0.03 * k;
    if (Math.random() < 0.25) {
      for (const side of [-1, 1]) {
        const ear = ogre.head.localToWorld(new THREE.Vector3(side * 0.75, 0.3, 0));
        fx.puff.emit({ at: ear, count: 1, speed: [1.5, 2.5], dir: new THREE.Vector3(side * 0.6, 1, 0), spread: 0.3, drag: 2, gravity: -1, life: [0.5, 0.9], size: [0.3, 0.9], color: "#ffffff", alpha: 0.85 });
      }
    }
  });
  ogre.root.position.x = home;
  audio.playSfx("sfx_timer_warn", 0.8, 1.2);
  shots.wide(s);
  await tl.wait(0.4);
}

async function ogreSlam(s: Stage, res: OgreResult): Promise<void> {
  const { ogre, hero, fx, tl } = s;
  shots.action(s, hero.root.position.x + 1.4);
  // Big hop towards Tadeo with the club held high
  const from = ogre.root.position.x;
  const to = hero.root.position.x + 2.6;
  audio.playSfx("sfx_enemy_attack", 1, 0.8);
  await tl.tween(0.55, (k) => setX(ogre.root, lerp(from, to, ease.inOut(k)), hump(k) * 1.1));
  fx.dust(ogre.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0)), 0.8, 8);
  ogre.bounce(0.4);
  ogre.setPose("slam", 22);
  await tl.wait(0.14);
  const tip = ogre.clubTip();
  if (res.blocked) {
    await hitHero(s, res, tip, true);
    // The club bounces off the magic shield right back onto the ogre's own head
    ogre.setPose("hit", 14);
    ogre.mood = "dizzy";
    ogre.bounce(-0.6);
    fx.stars(ogre.headPos(), 14);
    audio.playSfx("sfx_hammer_hit");
    await tl.wait(0.25);
    s.pop.show(`-${res.bounce}`, ogre.bellyPos(), { color: "#ffffff", size: 72 });
    say(s, "Aua, mein Kopf!");
    s.onHealth();
    await tl.wait(0.4);
  } else {
    const ground = tip.clone();
    ground.y = deckAt(tip.x) + 0.08;
    fx.ring(ground, 6, "#ffffff", 0.7);
    fx.dust(ground, 1.6, 20);
    bridgeBounce(s, 0.16);
    audio.playSfx("sfx_hammer_hit");
    await hitHero(s, res, tip, true);
    await tl.wait(0.5);
  }
  hero.setShield(false);
  s.ogreRest = { pose: "idle", mood: "grumpy" };
  void heroRecover(s);
  ogre.setPose("idle", 3);
  await ogreWalk(s, s.ogreHome, 1.1);
  ogre.mood = "grumpy";
  shots.wide(s);
}

async function heroRecover(s: Stage): Promise<void> {
  const h = s.hero;
  if (h.root.position.x !== s.heroHome) await heroHop(s, s.heroHome, 0.45, 0.4);
  h.pose = "stance";
}

/** The final blow: the ogre staggers, drops his club and plops down on the deck. */
export async function ogreDefeat(s: Stage): Promise<void> {
  const { ogre, fx, tl } = s;
  ogre.setPose("hit", 8);
  ogre.mood = "dizzy";
  await tl.wait(0.4);
  const club = ogre.dropClub();
  s.bridge.add(club);
  const c0 = club.position.clone();
  const q0 = club.quaternion.clone();
  const lie = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4, Math.PI / 2));
  const land = new THREE.Vector3(c0.x + 0.6, deckAt(c0.x + 0.6) + 0.35, 1.0);
  await tl.tween(0.5, (k) => {
    club.position.lerpVectors(c0, land, ease.inQuad(k));
    club.position.y += hump(k) * 0.8;
    club.quaternion.slerpQuaternions(q0, lie, ease.inQuad(k));
  });
  fx.dust(land, 0.8, 10);
  audio.playSfx("sfx_dig");
  s.cam.shake(0.4);
  await ogreWalk(s, s.ogreHome + 0.6, 0.6);
  ogre.setPose("sit", 4);
  await tl.wait(0.45);
  ogre.bounce(0.9);
  const seat = ogre.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0));
  fx.dust(seat, 1.6, 22);
  fx.ring(seat, 5, "#fff4d6", 0.8);
  bridgeBounce(s, 0.15);
  audio.playSfx("sfx_hammer_hit", 0.8, 0.7);
  s.cam.shake(0.8);
  await tl.wait(1.4);
  // A big tired sigh
  ogre.mood = "grumpy";
  const nose = ogre.headPos();
  fx.puff.emit({ at: nose, count: 8, speed: [1, 2], dir: new THREE.Vector3(-1, -0.2, 0.4), spread: 0.3, drag: 2, life: [0.6, 1.0], size: [0.3, 1.0], color: "#ffffff", alpha: 0.7 });
  say(s, "Seufz…");
  await tl.wait(0.8);
}
