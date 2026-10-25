/**
 * The treasure hunt, step by step: arrive by boat, walk to the X, dig,
 * smash the ice with the golden hammer, turn the golden key, open the chest
 * (beam of light, gold and jewels, the crown for Tadeo), and the never-ending
 * sunset party with fireworks that keeps running under the game's end card.
 */

import * as THREE from "three";
import { audio } from "../../audio/Audio";
import { DIALOGUES, DialogueScript } from "../../data/dialogues";
import { shot, Shot } from "../shared/director";
import { TreasureStage, CHEST_AT } from "./stage";
import { X_AT, PILE_AT } from "./terrain";
import { lootBurst } from "./fx";
import { key, bar, dots } from "./hud";

const DIG_SPOT = new THREE.Vector2(0, -1.3);
const HAMMER_SPOT = new THREE.Vector2(1.65, 0.05);
const KEY_SPOT = new THREE.Vector2(0.25, 1.25);
const HERO_SPOT = new THREE.Vector2(1.35, 1.75);

const DIG_SHOT = shot(1.9, 4.5, 5.5, 0, 0.5, -0.55);
const REVEAL_SHOT = shot(2.9, 1.8, 5.2, 0.2, 1.35, 0);
const HAMMER_SHOT = shot(0.9, 2.5, 5.7, 0.6, 1.2, 0);
const KEY_SHOT = shot(-3.2, 2.25, 3.3, 0.1, 1.0, 0.5);
const OPEN_SHOT = shot(0.6, 1.5, 6.6, 0.2, 2.4, 0);
const HERO_SHOT = shot(-0.4, 1.35, 7.6, 0.75, 1.8, 0.8);

const X3 = new THREE.Vector3(X_AT.x, CHEST_AT.y, X_AT.y);

/** A slice of a dialogue from the game's dialogue data. */
const lines = (name: string, from: number, to?: number): DialogueScript => (DIALOGUES[name] ?? []).slice(from, to);

const ease = (k: number) => 1 - (1 - k) ** 3;

export async function arrive(s: TreasureStage): Promise<void> {
  s.state.phase = "arrive";
  const t = s.tadeo;
  // Crane down over the lagoon to the beached boat
  await s.director.move(shot(-4.2, 3.3, 13.4, 2.6, 1.0, 4.4), 5.0);
  void s.ui.hud.showBanner("Letzte Aufgabe", "Die Schatzinsel", 2800);
  t.avatar.pose = "cheer";
  t.actor.jump(5.5);
  await s.sleep(0.5);
  t.actor.jump(5);
  await s.sleep(0.9);
  t.avatar.pose = "normal";
  t.actor.faceTo(X_AT.x, X_AT.y);
  await s.sleep(0.4);
  await s.say(lines("treasure_arrive", 0, 1), s.tadeoShot(-1.3, 4.6));
}

/** The player walks Tadeo to the X with the arrow keys. */
export async function walkToX(s: TreasureStage): Promise<void> {
  s.state.phase = "walk";
  const t = s.tadeo;
  s.hud.status(`🗺️ Lauf zum roten <b style="color:#d8261c;font-size:1.25em">X</b>!`);
  s.hud.hint(`${key("←")}${key("↑")}${key("→")}${key("↓")} laufen`);
  s.steering = true;
  s.director.track(() => {
    const p = t.actor.position;
    const look = new THREE.Vector3(p.x * 0.65 + X_AT.x * 0.35, 0.7 + p.y * 0.5, p.z * 0.65 + X_AT.y * 0.35);
    return { pos: look.clone().add(new THREE.Vector3(0, 5.4, 7.8)), look };
  }, 2.5);
  await s.reachX(1.8);
  s.steering = false;
  s.hud.hint(null);
  s.hud.status(null);
  s.xmark.beacon.visible = false;
  s.sparkleAt(X3.clone().add(new THREE.Vector3(0, 0.3, 0)), 50, "#ffd75e", 3.5);
  audio.playSfx("sfx_simon_correct", 0.7);
  await t.actor.walkTo(DIG_SPOT.x, DIG_SPOT.y, 2.6);
  t.actor.face(0);
  void s.director.move(DIG_SHOT, 1.1);
  await s.sleep(0.4);
  t.setTool("shovel");
  s.sparkleAt(t.tip(new THREE.Vector3()), 25, "#ffffff", 2);
  audio.playSfx("sfx_menu_confirm", 0.7);
  await s.say(lines("treasure_arrive", 1, 2), DIG_SHOT);
}

/** Space, Space, Space… until the shovel hits something hard. */
export async function dig(s: TreasureStage): Promise<void> {
  const st = s.state;
  const t = s.tadeo;
  st.phase = "dig";
  const status = () => `⛏️ Graben ${bar(st.digs / st.digsNeeded)}`;
  s.hud.status(status());
  s.hud.hint(`Drück immer wieder ${key("Leertaste")}!`);
  s.prompt = { at: X3.clone().add(new THREE.Vector3(-1.7, 0.5, 0.3)), verb: "Graben" };
  const pile = new THREE.Vector3(PILE_AT.x, CHEST_AT.y + 0.3, PILE_AT.y);
  while (st.digs < st.digsNeeded) {
    await s.nextKey(["Space"]);
    st.digs++;
    t.stroke();
    audio.playSfx("sfx_dig", 0.8, 0.85 + Math.random() * 0.35);
    const k = st.digs / st.digsNeeded;
    s.dig.hole = 0.85 * k ** 0.8;
    s.dig.pile = 0.6 * k;
    s.director.shake(0.1);
    s.hud.status(status());
    // Reason: the sand leaves the hole when the blade comes up, a moment after the stab
    void s.sleep(0.25).then(() => {
      const from = X3.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, -s.dig.hole * 0.6, -0.3));
      s.throwSand(from, pile, 36);
    });
  }
  s.prompt = null;
  s.hud.hint(null);
  await s.sleep(0.35);
  // KLONK! Something hard down there…
  audio.playSfx("sfx_hammer_hit", 0.9, 0.55);
  s.director.shake(0.55);
  s.sparkleAt(X3.clone().add(new THREE.Vector3(0, -0.4, 0)), 40, "#9fe8ff", 2.5);
  s.hud.pop("KLONK!", "#9fe8ff");
  t.setTool("none");
  t.actor.jump(4.5);
  await s.sleep(0.9);
  s.hud.status(null);
  await reveal(s);
}

/** The frozen chest bursts out of the hole. */
async function reveal(s: TreasureStage): Promise<void> {
  s.state.phase = "reveal";
  const t = s.tadeo;
  void t.actor.walkTo(1.0, -2.2, 3.2);
  void s.director.move(REVEAL_SHOT, 1.2);
  const body = s.chest.body;
  s.chest.group.visible = true;
  body.position.y = -1.7;
  audio.playSfx("sfx_wave", 0.7, 0.5);
  let next = 0;
  await s.tween(1.5, (k) => {
    body.position.y = -1.7 + 1.7 * ease(k);
    body.rotation.z = Math.sin(k * 40) * 0.03 * (1 - k);
    s.director.shake(0.04);
    if (k >= next) {
      next += 0.08;
      s.throwSand(X3.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.2)), X3.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 5)), 14);
    }
  });
  body.rotation.z = 0;
  s.dig.hole = 0.15;
  s.chestSolid = true;
  s.xmark.setPaintOpacity(0.35);
  s.director.shake(0.6);
  s.shockwave();
  s.sparkleAt(X3.clone().add(new THREE.Vector3(0, 1.0, 0)), 60, "#bff0ff", 3.5);
  audio.playSfx("sfx_hammer_hit", 0.7, 0.7);
  t.actor.faceTo(X_AT.x, X_AT.y);
  await s.sleep(0.9);
  await s.say(lines("treasure_dig", 0), s.tadeoShot(-1.4, 4.4));
}

/** Smash the ice with the golden hammer (timing helps, mashing works too). */
export async function hammer(s: TreasureStage): Promise<void> {
  const st = s.state;
  const t = s.tadeo;
  t.setTool("hammer");
  t.avatar.pose = "holdUp";
  void s.director.move(s.tadeoShot(1.2, 4.6), 0.8);
  s.sparkleAt(t.tip(new THREE.Vector3()), 50, "#ffd75e", 3);
  audio.playSfx("sfx_item_get", 0.6);
  await s.sleep(1.5);
  t.avatar.pose = "normal";
  await t.actor.walkTo(HAMMER_SPOT.x, HAMMER_SPOT.y, 2.6);
  t.actor.face(-Math.PI / 2);
  st.phase = "hammer";
  void s.director.move(HAMMER_SHOT, 1.0);
  const status = () => `🔨 Eis zerschlagen ${bar(st.ice, true)}`;
  s.hud.status(status());
  s.hud.hint(`${key("Leertaste")} hauen · im <b style="color:#ffd23f">★ goldenen Feld</b> = Superschlag!`);
  s.hud.meter(st.zone);
  s.meterOn = true;
  s.prompt = { at: CHEST_AT.clone().add(new THREE.Vector3(-1.6, 1.2, 0.4)), verb: "Hauen" };
  const praise = ["Gut!", "Weiter so!", "Klasse!", "Toll!"];
  const tip = new THREE.Vector3();
  while (st.ice > 0) {
    await s.nextKey(["Space"]);
    const perfect = st.meter >= st.zone[0] && st.meter <= st.zone[1];
    s.flashMeter();
    t.stroke();
    audio.playSfx("sfx_hammer_miss", 0.5, 1.5);
    await s.sleep(t.impactDelay);
    st.hits++;
    if (perfect) st.perfectHits++;
    st.ice = Math.max(0, st.ice - (perfect ? 0.34 : 0.13));
    if (st.ice <= 0) break;
    t.tip(tip);
    s.chest.hit(perfect);
    s.burstShards(tip, perfect ? 22 : 12, perfect ? 1.2 : 0.9);
    s.sparkleAt(tip, perfect ? 40 : 18, perfect ? "#ffd75e" : "#bff0ff", 3);
    s.shockwave();
    s.director.shake(perfect ? 0.55 : 0.32);
    audio.playSfx("sfx_hammer_hit", perfect ? 1 : 0.8, perfect ? 1.15 : 0.95);
    if (perfect) audio.playSfx("sfx_simon_correct", 0.45, 1.2);
    s.hud.pop(perfect ? "SUPER!" : praise[st.hits % praise.length], perfect ? "#ffd23f" : "#ffffff");
    s.hud.status(status());
  }
  // The last blow shatters the block
  s.meterOn = false;
  s.hud.meter(null);
  s.hud.hint(null);
  s.prompt = null;
  s.chest.shatter();
  s.burstShards(CHEST_AT.clone().add(new THREE.Vector3(0, 0.8, 0)), 220, 1.5);
  s.sparkleAt(CHEST_AT.clone().add(new THREE.Vector3(0, 0.9, 0)), 90, "#bff0ff", 5, 1.4);
  s.shockwave();
  s.hud.flash();
  s.hud.pop("GESCHAFFT!", "#9fe8ff");
  s.director.shake(1.0);
  audio.playSfx("sfx_hammer_hit", 1, 0.7);
  audio.playSfx("sfx_simon_correct", 0.7);
  s.hud.status(null);
  s.chestSolid = true;
  await s.sleep(0.5);
  t.setTool("none");
  // Reason: turn towards the camera so the follow-up close-up isn't blocked by the chest
  t.actor.face(0);
  t.avatar.pose = "cheer";
  t.actor.jump(5);
  await s.sleep(1.4);
  t.avatar.pose = "normal";
  await s.say(lines("treasure_hammer", 0), s.tadeoShot(1.3, 4.4));
}

/** Turn the golden key: three presses — in, jiggle, click. */
export async function unlock(s: TreasureStage): Promise<void> {
  const st = s.state;
  const t = s.tadeo;
  t.setTool("key");
  t.avatar.pose = "holdUp";
  s.sparkleAt(t.tip(new THREE.Vector3()).add(new THREE.Vector3(0, 0.5, 0)), 50, "#ffd75e", 3);
  audio.playSfx("sfx_item_get", 0.6);
  await s.sleep(1.4);
  t.avatar.pose = "normal";
  await t.actor.walkTo(KEY_SPOT.x, KEY_SPOT.y, 2.4);
  t.actor.face(Math.PI);
  t.setTool("reach");
  st.phase = "key";
  void s.director.move(KEY_SHOT, 1.0);
  const status = () => `🔑 Schlüssel drehen ${dots(st.turns, 3)}`;
  s.hud.status(status());
  s.hud.hint(`Drück 3× ${key("Leertaste")}!`);
  s.prompt = { at: s.chest.lockWorld.clone().add(new THREE.Vector3(-0.9, 0.45, -0.3)), verb: "Drehen" };
  while (st.turns < 3) {
    await s.nextKey(["Space"]);
    st.turns++;
    s.chest.setKeyStage(st.turns);
    s.hud.status(status());
    const at = s.chest.lockWorld.clone().add(new THREE.Vector3(0, 0, 0.15));
    if (st.turns < 3) {
      audio.playSfx("sfx_key_jiggle", 0.9);
      s.sparkleAt(at, 14, "#ffd75e", 1.5, 0.7);
      s.director.shake(0.08);
    } else {
      audio.playSfx("sfx_key_unlock", 1);
      s.sparkleAt(at, 60, "#ffd75e", 3.5);
      s.hud.pop("KLICK!", "#ffd23f");
      s.director.shake(0.25);
    }
  }
  s.prompt = null;
  s.hud.hint(null);
  await s.sleep(0.7);
  s.hud.status(null);
}

/** The lid springs open: light, gold, jewels — and a crown for Tadeo. */
export async function openChest(s: TreasureStage): Promise<void> {
  s.state.phase = "open";
  const t = s.tadeo;
  t.setTool("none");
  void t.actor.walkTo(HERO_SPOT.x, HERO_SPOT.y, 2.2).then(() => t.actor.faceTo(CHEST_AT.x, CHEST_AT.z));
  void s.director.move(OPEN_SHOT, 1.3);
  await s.sleep(0.9);
  s.chest.open();
  audio.playSfx("sfx_chest_open", 1);
  s.director.shake(0.45);
  s.engine.applyPost({ ...POST_GLOW });
  const top = CHEST_AT.clone().add(new THREE.Vector3(0, 0.9, 0.1));
  s.sparkleAt(top, 90, "#ffd75e", 4.5, 1.3);
  await s.sleep(0.5);
  lootBurst(s.coins, s.gems, top, 90, 30);
  audio.playMusic("music_victory");
  await s.sleep(1.3);
  await s.say(lines("treasure_open", 0, 1));
  lootBurst(s.coins, s.gems, top, 60, 20, 0.8);
  t.actor.face(0);
  await s.say(lines("treasure_open", 1, 2), HERO_SHOT);
  await crownFlight(s);
  // Party time
  audio.playSfx("sfx_victory_fanfare", 0.9);
  s.confettiCannons(1.2);
  t.avatar.pose = "cheer";
  t.actor.jump(6);
  s.critters.party = true;
  s.daylight.fade(1, 9);
  await s.sleep(2.4);
  await s.say(lines("treasure_open", 2), HERO_SHOT);
}

/** Extra bloom while the treasure glows. */
export const POST_GLOW = { bloomIntensity: 1.15, bloomThreshold: 0.78, tiltShift: true, tiltFocus: 1.1, tiltOffset: 0.0, saturation: 0.18, contrast: 0.08, vignette: 0.45, exposure: 1.02 };

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

/** The victory words; the party keeps going after this (see `party`). */
export async function victory(s: TreasureStage): Promise<void> {
  s.state.phase = "victory";
  s.fireworks.auto = true;
  orbit(s);
  await s.say("victory");
  s.state.phase = "done";
}

/** Slowly circle Tadeo and the open chest, looking up into the fireworks sky. */
function orbit(s: TreasureStage): void {
  const t0 = s.time;
  const centre = new THREE.Vector3(0.6, 0, 0.9);
  const a0 = Math.atan2(HERO_SHOT.pos.x - centre.x, HERO_SHOT.pos.z - centre.z);
  s.director.track((): Shot => {
    const a = a0 + (s.time - t0) * 0.12;
    return {
      pos: new THREE.Vector3(centre.x + Math.sin(a) * 7.6, 1.5 + Math.sin((s.time - t0) * 0.3) * 0.25, centre.z + Math.cos(a) * 7.6),
      look: new THREE.Vector3(centre.x, 2.2, centre.z),
    };
  }, 1.2);
}

/** Endless celebration under the end card: hops, confetti, coin showers, fireworks. */
export async function party(s: TreasureStage): Promise<void> {
  const t = s.tadeo;
  s.fireworks.auto = true;
  let beat = 0;
  while (!s.disposed) {
    await s.sleep(1.7);
    beat++;
    // Reason: Tadeo keeps turning to face the orbiting camera so he is never seen from behind for long
    t.actor.faceTo(s.camera.position.x, s.camera.position.z);
    t.avatar.pose = "cheer";
    t.actor.jump(5 + Math.random() * 1.5);
    if (beat % 3 === 0) s.confettiCannons(0.6);
    if (beat % 4 === 1) lootBurst(s.coins, s.gems, CHEST_AT.clone().add(new THREE.Vector3(0, 0.9, 0.1)), 24, 8, 0.7);
    if (beat % 2 === 0) s.sparkleAt(t.actor.position.clone().add(new THREE.Vector3(0, 2.2, 0)), 20, "#ffd75e", 2);
  }
}
