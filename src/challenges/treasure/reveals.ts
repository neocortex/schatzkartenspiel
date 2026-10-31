/**
 * What comes out of the chest, one thing at a time, each with its own moment:
 * Paco's note, the Feuerherz, a rolled-up plan, and last the gold, the jewels
 * and the crown. Things float out and Tadeo holds them up, the way he holds up
 * every item he finds.
 */

import * as THREE from "three";
import { audio } from "../../audio/Audio";
import { CARRIED_HEART } from "../../world/models/items";
import { shot } from "../shared/director";
import { TreasureStage, CHEST_AT, ease, lines } from "./stage";
import { lootBurst } from "./fx";

// Reason: the dialogue box covers the bottom quarter of the screen, so the look stays low enough for his chin to clear it
const NOTE_SHOT = shot(1.25, 2.5, 5.35, 1.3, 2.1, 1.75);
const HEART_SHOT = shot(0.75, 1.5, 4.2, 0.45, 1.75, 0);
const HELD_SHOT = shot(1.1, 2.35, 5.0, 1.3, 2.05, 1.75);
const PLAN_SHOT = shot(-0.1, 1.8, 4.2, 0.3, 1.5, 0);
const GOLD_SHOT = shot(0.7, 1.5, 6.4, 0.25, 2.2, 0);
const HERO_SHOT = shot(-0.4, 1.35, 7.6, 0.75, 1.8, 0.8);

/** Where things float while they are looked at, above the open chest. */
const ABOVE_CHEST = CHEST_AT.clone().add(new THREE.Vector3(0, 1.3, 0.1));
const INSIDE_CHEST = CHEST_AT.clone().add(new THREE.Vector3(0, 0.45, 0));
/** In front of the lid, clear of the chest's light. */
const PLAN_AT = CHEST_AT.clone().add(new THREE.Vector3(0, 1.35, 0.95));

/** Starts and stops softly, unlike `ease`, which starts at full speed. */
const gentle = (k: number): number => k * k * (3 - 2 * k);

/** Glide `item` to a point in the world over `seconds`, turning to `scale`; `arc` lifts the path in the middle. */
async function glide(s: TreasureStage, item: THREE.Object3D, to: THREE.Vector3, scale: number, seconds: number, arc = 0, curve = ease): Promise<void> {
  s.scene.attach(item);
  const from = item.position.clone();
  const from0 = item.scale.x;
  await s.tween(seconds, (k) => {
    const e = curve(k);
    item.position.lerpVectors(from, to, e);
    item.position.y += Math.sin(k * Math.PI) * arc;
    item.scale.setScalar(from0 + (scale - from0) * e);
  });
}

/**
 * Show `item` at the bottom of the chest, ready to glide up through the rim.
 * Reason: it still hangs under the chest and INSIDE_CHEST is a place in the world, so it has to let go of the chest
 * first; otherwise the chest's own height counts twice and it appears in mid-air.
 */
function showInside(s: TreasureStage, item: THREE.Object3D, scale: number): void {
  s.scene.attach(item);
  item.position.copy(INSIDE_CHEST);
  item.scale.setScalar(scale);
  item.visible = true;
}

/** The point above Tadeo's raised hands. */
function aboveTadeo(s: TreasureStage, towardsCamera = 0): THREE.Vector3 {
  return s.tadeo.actor.position.clone().add(new THREE.Vector3(0, 2.15, towardsCamera));
}

/** A small thing flies into Tadeo's backpack and is gone. */
async function stow(s: TreasureStage, item: THREE.Object3D): Promise<void> {
  const t = s.tadeo;
  await glide(s, item, t.avatar.back.getWorldPosition(new THREE.Vector3()), 0.08, 0.5, 0.35);
  item.visible = false;
  s.sparkleAt(t.avatar.back.getWorldPosition(new THREE.Vector3()), 16, "#ffd75e", 1.6, 0.8);
  audio.playSfx("sfx_menu_select", 0.6);
  t.avatar.pose = "normal";
}

/** First out is a scrap of paper. Tadeo holds it up and reads it out. */
export async function takeNote(s: TreasureStage): Promise<void> {
  const t = s.tadeo;
  const note = s.chest.note;
  showInside(s, note, 0.3);
  audio.playSfx("sfx_menu_confirm", 0.7);
  void s.tween(2.2, (k) => {
    note.rotation.set(-0.5 * (1 - k) + Math.sin(k * 12) * 0.08 * (1 - k), Math.sin(k * 9) * 0.5 * (1 - k), Math.sin(k * 7) * 0.2 * (1 - k));
  });
  await glide(s, note, ABOVE_CHEST, 0.7, 1.0);
  t.actor.face(0);
  void s.director.move(NOTE_SHOT, 1.1);
  await s.sleep(0.3);
  t.avatar.pose = "holdUp";
  await glide(s, note, aboveTadeo(s, 0.5), 1, 0.9, 0.2);
  // Reason: behind the paper, where it frames the words instead of covering them
  s.sparkleAt(note.position.clone().add(new THREE.Vector3(0, 0, -0.35)), 18, "#fff1c4", 1.5, 0.8);
  await s.sleep(0.5);
  s.state.note = true;
  await s.sleep(0.8);
  await s.say(lines("treasure_note"));
  await stow(s, note);
}

/**
 * The heart: the star of the chest. The light turns red and the day dims, it rises slowly, and it hangs there before
 * Tadeo dares to touch it. Then it rides on his back, the way he will carry it home.
 */
export async function takeHeart(s: TreasureStage): Promise<void> {
  const t = s.tadeo;
  const heart = s.chest.heart;
  t.actor.faceTo(CHEST_AT.x, CHEST_AT.z);
  void s.director.move(HEART_SHOT, 1.3);
  s.chest.glow(16, "#ff5a1e");
  s.daylight.fade(0.32, 2.6);
  s.engine.applyPost({ ...POST_HEART });
  await s.sleep(1.0);
  // Reason: the deepest sound there is, slowed down: the heartbeat the child will feel again at the old stone
  for (const wait of [0, 0.45, 1.25, 1.7]) void s.sleep(wait).then(() => audio.playSfx("sfx_door", 0.55, 0.42));
  showInside(s, heart, 0.25);
  void s.tween(2.6, (k) => {
    heart.rotation.y = (1 - ease(k)) * Math.PI * 3;
    if (Math.random() < 0.35) s.sparkleAt(heart.getWorldPosition(new THREE.Vector3()), 2, "#ff9a3a", 1.1, 0.9);
  });
  // Reason: with the usual fast start it would be past the rim in a blink; this way the child sees it come out
  await glide(s, heart, ABOVE_CHEST.clone().add(new THREE.Vector3(0, 0.15, 0)), 0.92, 2.6, 0, gentle);
  s.state.heart = true;
  audio.playSfx("sfx_special", 0.45, 0.8);
  await s.sleep(1.5);
  await s.say(lines("treasure_heart", 0, 1));

  // He reaches out: warm, not hot
  t.actor.face(0);
  t.avatar.pose = "holdUp";
  void s.director.move(HELD_SHOT, 1.1);
  await glide(s, heart, aboveTadeo(s, 0.15), 0.8, 1.1, 0.25);
  s.sparkleAt(heart.position, 46, "#ffb04a", 2.6, 1.1);
  audio.playSfx("sfx_heal", 0.8);
  await s.sleep(0.9);
  await s.say(lines("treasure_heart", 1));

  const back = t.avatar.back;
  await glide(s, heart, back.localToWorld(CARRIED_HEART.at.clone()), CARRIED_HEART.scale, 0.8, 0.3);
  // Reason: the same place and size as in the volcano course, where he carries it home
  back.add(heart);
  heart.position.copy(CARRIED_HEART.at);
  heart.rotation.set(0, 0, 0);
  heart.scale.setScalar(CARRIED_HEART.scale);
  t.avatar.pose = "normal";
  // Reason: the light sits where the next thing floats, and a strong one burns its colours away
  s.chest.glow(2.5, "#ffc65a");
}

/** A roll of blue paper hops out. It goes into the backpack for later. */
export async function takePlan(s: TreasureStage): Promise<void> {
  const t = s.tadeo;
  const plan = s.chest.plan;
  t.actor.faceTo(CHEST_AT.x, CHEST_AT.z);
  void s.director.move(PLAN_SHOT, 1.1);
  await s.sleep(0.8);
  showInside(s, plan, 0.5);
  audio.playSfx("sfx_menu_confirm", 0.7, 0.8);
  void s.tween(1.2, (k) => {
    plan.rotation.set(0, Math.sin(k * 3) * 0.4 * (1 - k) + 0.25, (1 - k) * 3);
  });
  await glide(s, plan, PLAN_AT, 1.15, 1.0, 0.25);
  s.state.plan = true;
  await s.sleep(1.1);
  await s.say(lines("treasure_plan"));
  await stow(s, plan);
}

/** And under it all, the treasure he came for: the beam, the gold, the jewels, the crown. */
export async function takeGold(s: TreasureStage): Promise<void> {
  const t = s.tadeo;
  s.daylight.fade(0, 1.2);
  s.chest.showGold();
  void s.director.move(GOLD_SHOT, 1.2);
  audio.playSfx("sfx_chest_open", 0.8, 1.2);
  s.director.shake(0.35);
  s.engine.applyPost({ ...POST_GLOW });
  const top = CHEST_AT.clone().add(new THREE.Vector3(0, 0.9, 0.1));
  s.sparkleAt(top, 90, "#ffd75e", 4.5, 1.3);
  await s.sleep(0.5);
  lootBurst(s.coins, s.gems, top, 90, 30);
  audio.playMusic("music_victory");
  s.state.gold = true;
  await s.sleep(1.6);
  t.actor.face(0);
  await s.say(lines("treasure_gold"), HERO_SHOT);
  lootBurst(s.coins, s.gems, top, 60, 20, 0.8);
  await crownFlight(s);
  s.state.crowned = true;
  audio.playSfx("sfx_victory_fanfare", 0.9);
  t.avatar.pose = "cheer";
  t.actor.jump(6);
  await s.sleep(2.2);
}

/** Extra bloom while the treasure glows. */
const POST_GLOW = { bloomIntensity: 0.95, bloomThreshold: 0.9, tiltShift: true, tiltFocus: 1.1, tiltOffset: 0.0, saturation: 0.18, contrast: 0.08, vignette: 0.45, exposure: 1.0 };
/** Only the heart may glow: the bright sand stays under the bloom's threshold. */
const POST_HEART = { bloomIntensity: 1.0, bloomThreshold: 0.95, tiltShift: false, saturation: 0.18, contrast: 0.1, vignette: 0.55, exposure: 0.96 };

/** The crown rises out of the chest, spins in the golden light and lands on Tadeo's head. */
async function crownFlight(s: TreasureStage): Promise<void> {
  const crown = s.chest.crown;
  const t = s.tadeo;
  crown.visible = true;
  crown.position.set(0, 0.5, 0);
  crown.scale.setScalar(0.01);
  audio.playSfx("sfx_special", 0.5);
  await s.tween(1.3, (k) => {
    crown.position.y = 0.5 + ease(k) * 2.0;
    crown.rotation.y = k * Math.PI * 4;
    crown.scale.setScalar(0.01 + ease(Math.min(k * 1.6, 1)) * 1.3);
    if (Math.random() < 0.5) s.sparkleAt(crown.getWorldPosition(new THREE.Vector3()), 2, "#ffd75e", 1, 0.8);
  });
  // Detach into world space, then fly in an arc onto Tadeo's head
  const start = crown.getWorldPosition(new THREE.Vector3());
  s.scene.attach(crown);
  const head = t.avatar.head;
  const end = new THREE.Vector3();
  await s.tween(0.9, (k) => {
    head.localToWorld(end.set(0, 0.36, 0.02));
    const e = ease(k);
    crown.position.lerpVectors(start, end, e);
    crown.position.y += Math.sin(k * Math.PI) * 1.2;
    crown.rotation.y = Math.PI * 4 + k * Math.PI * 2;
    crown.scale.setScalar(1.3 - e * 0.3);
  });
  head.add(crown);
  crown.position.set(0, 0.36, 0.02);
  crown.rotation.set(-0.12, 0, 0.06);
  crown.scale.setScalar(1);
  s.sparkleAt(end, 70, "#ffd75e", 3.5, 1.2);
  audio.playSfx("sfx_item_get", 0.7);
}
