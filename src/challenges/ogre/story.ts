/**
 * The story beats around the ogre fight: the fly-in over the waterfall,
 * Tadeo arriving at the bridge, the ogre leaping out of the river onto the
 * deck, conversations framed per speaker, and the friendly ending where
 * Tadeo shares a magic berry and crosses the bridge while the ogre waves.
 */

import * as THREE from "three";
import { audio } from "../../audio/Audio";
import { GameUI } from "../../ui/GameUI";
import { DIALOGUES, DialogueScript } from "../../data/dialogues";
import { ease, lerp, hump } from "./kit";
import { Stage, setX, shots, bridgeBounce } from "./moves";
import { deckAt } from "./gorgeShape";

/** Inline lines for the friendly ending (spoken between the two halves of `ogre_defeat`). */
const BERRY_OFFER: DialogueScript = [
  { speaker: "Tadeo", portrait: "portrait_tadeo", text: "Du siehst hungrig aus. Möchtest du eine Zauberbeere?" },
];
const BERRY_THANKS: DialogueScript = [
  { speaker: "Oger", portrait: "ogre", text: "Mmmh! Die schmeckt ja wie Kuchen!" },
];

/** Use the rendered ogre portrait for the ogre's lines. */
function withOgrePortrait(lines: DialogueScript): DialogueScript {
  return lines.map((l) => (l.speaker === "Oger" ? { ...l, portrait: "ogre" } : l));
}

/** Play a conversation, cutting the camera to whoever speaks (or holding one `framing`). */
export async function talk(s: Stage, ui: GameUI, script: DialogueScript, framing?: (s: Stage) => void): Promise<void> {
  framing?.(s);
  ui.dialogue.onLine = (speaker) => {
    s.hero.talking = speaker === "Tadeo";
    s.ogre.talking = speaker === "Oger";
    if (framing) return;
    if (speaker === "Tadeo") shots.hero(s);
    else if (speaker === "Oger") shots.ogre(s);
    else shots.wide(s);
  };
  await ui.say(withOgrePortrait(script));
  ui.dialogue.onLine = null;
  s.hero.talking = false;
  s.ogre.talking = false;
}

/** Fly in over the falls, Tadeo walks onto the bridge, the ogre leaps out of the river. */
export async function intro(s: Stage, ui: GameUI): Promise<void> {
  const { tl, hero, ogre, fx, cam } = s;
  audio.playMusic("music_overworld");
  ogre.root.visible = false;
  setX(hero.root, -14);
  cam.cut(new THREE.Vector3(-9, 21, -10), new THREE.Vector3(-3, 8, -30));
  cam.move(new THREE.Vector3(-2.5, 6.5, 13.5), new THREE.Vector3(-1.5, 3.8, 0), 5.5);
  hero.speed = 3.2;
  await tl.tween(3.4, (k) => setX(hero.root, lerp(-14, s.heroHome, k)));
  hero.speed = 0;
  await tl.wait(0.5);

  // Rumble… something is under the bridge!
  audio.playSfx("sfx_lava_fall", 0.8);
  cam.shake(0.5);
  bridgeBounce(s, 0.06);
  s.pop.show("Hä?", hero.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 2.3, 0)), { size: 34, bubble: true, life: 1.4, rise: 0.3 });
  shots.wide(s);
  await tl.wait(1.2);

  // The ogre bursts out of the river and lands on the deck
  const from = new THREE.Vector3(2.4, -2.5, -4.2);
  const to = new THREE.Vector3(s.ogreHome, deckAt(s.ogreHome), 0);
  ogre.root.visible = true;
  ogre.setPose("roar", 10);
  ogre.mood = "angry";
  fx.splash(new THREE.Vector3(from.x, 0.05, from.z), 2.2);
  audio.playSfx("sfx_wave");
  await tl.tween(0.85, (k) => {
    ogre.root.position.lerpVectors(from, to, ease.outQuad(k));
    ogre.root.position.y = lerp(from.y, to.y, k) + hump(k) * 6.5;
    if (Math.random() < 0.5) fx.puff.emit({ at: ogre.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)), count: 2, speed: [0.5, 1.5], gravity: 12, life: [0.4, 0.8], size: [0.25, 0.1], color: "#d9f6ff", alpha: 0.9 });
  });
  setX(ogre.root, s.ogreHome);
  ogre.setPose("stomp", 14);
  ogre.bounce(1.0);
  const feet = ogre.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0));
  fx.dust(feet, 2.0, 26);
  fx.ring(feet, 7, "#fff4d6", 0.8);
  bridgeBounce(s, 0.2);
  audio.playSfx("sfx_hammer_hit");
  cam.shake(1.1);
  cam.punch(5);
  hero.pose = "hurt";
  await tl.wait(0.5);
  hero.pose = "stance";
  // Roar!
  shots.ogreLow(s);
  await tl.wait(0.5);
  ogre.setPose("roar", 6);
  audio.playSfx("sfx_enemy_attack", 1, 0.6);
  for (let i = 0; i < 6; i++) {
    fx.puff.emit({ at: ogre.headPos(), count: 3, speed: [3, 5], dir: new THREE.Vector3(-1, 0.3, 0.4), spread: 0.35, drag: 3, life: [0.4, 0.7], size: [0.4, 1.4], color: "#ffffff", alpha: 0.5 });
    cam.shake(0.25);
    await tl.wait(0.15);
  }
  await tl.wait(0.4);
  ogre.setPose("idle", 3);
  ogre.mood = "grumpy";
  await tl.wait(0.4);
  await talk(s, ui, DIALOGUES.ogre_enter);
}

/** After the defeat: a berry for the ogre, then Tadeo crosses the bridge. */
export async function outro(s: Stage, ui: GameUI): Promise<void> {
  const { tl, hero, ogre, fx } = s;
  const lines = DIALOGUES.ogre_defeat;
  await talk(s, ui, lines.slice(0, 1));
  await talk(s, ui, BERRY_OFFER);
  // Tadeo walks over and hands the ogre a berry
  shots.action(s, ogre.root.position.x - 1.2);
  hero.pose = "normal";
  hero.speed = 3;
  const x0 = hero.root.position.x;
  const x1 = ogre.root.position.x - 1.5;
  await tl.tween(1.1, (k) => setX(hero.root, lerp(x0, x1, ease.inOut(k))));
  hero.speed = 0;
  hero.berries.visible = true;
  hero.pose = "eat";
  await tl.wait(0.5);
  hero.berries.visible = false;
  hero.pose = "normal";
  ogre.setPose("munch", 4);
  audio.playSfx("sfx_berry_collect");
  shots.duo(s);
  await tl.wait(0.9);
  ogre.mood = "happy";
  audio.playSfx("sfx_heal");
  fx.heal(ogre.headPos());
  fx.stars(ogre.headPos(), 12);
  s.pop.show("♥", ogre.headPos().add(new THREE.Vector3(0, 0.8, 0)), { color: "#ff6fb5", size: 84, life: 1.6 });
  await tl.wait(0.8);
  ogre.setPose("sit", 4);
  await talk(s, ui, BERRY_THANKS, shots.duo);
  await talk(s, ui, lines.slice(1), shots.duo);

  // Victory: the ogre waves, Tadeo cheers and crosses the bridge
  ogre.setPose("wave", 5);
  hero.pose = "cheer";
  audio.playMusic("music_victory");
  audio.playSfx("sfx_victory_fanfare");
  shots.wide(s);
  fx.stars(hero.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.8, 0)), 16);
  await ui.hud.showBanner("Gewonnen!", "Die Brücke ist frei!", 2400);
  hero.pose = "normal";
  hero.speed = 3.2;
  const start = hero.root.position.x;
  // High enough to look over the bushes on the near bank
  s.cam.move(new THREE.Vector3(5, 8, 12.5), new THREE.Vector3(8.5, 3.4, 0), 2.5);
  await tl.tween(3.0, (k) => {
    const x = lerp(start, 13, k);
    // Reason: step around the sitting ogre on the camera side of the deck
    hero.root.position.set(x, deckAt(x), Math.exp(-Math.pow((x - ogre.root.position.x) / 1.6, 2)) * 1.1);
  });
  hero.speed = 0;
  await tl.wait(0.3);
}
