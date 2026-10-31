/**
 * The moment the game has been walking towards: Tadeo sets the Feuerherz back in
 * the old stone with his own press of Space. Light, the rocks stop, the lava goes
 * dark, the sky clears, a rainbow rises over the sleeping volcano, and the Hüter
 * thanks him and goes to his rest.
 */

import { audio } from "../../audio/Audio";
import type { VolcanoChallenge } from "../volcano/VolcanoChallenge";
import { Homecoming } from "./homecoming";

export function prepareHomecoming(c: VolcanoChallenge): Homecoming {
  const home = new Homecoming(c);
  c.scene.add(home.group);
  c.ownGroup(home.group);
  return home;
}

export async function finaleEnding(c: VolcanoChallenge): Promise<void> {
  const home = c.ending as Homecoming;
  const ui = c.ctx.ui;
  const hero = c.hero;
  ui.status(null);

  // He walks up to the stone, and the stone waits for him
  home.phase = "walk";
  c.rig.setShot(home.shots.stone, 1.8);
  await hero.walkTo(home.standAt.x, home.standAt.z);
  home.lookAtStone();
  home.phase = "wait";
  c.prompt = { at: home.promptAt, verb: "Einsetzen" };
  await c.nextSpace();
  c.prompt = null;

  // The heart leaves his back and flies home, slowly, while the world holds its breath
  home.phase = "flight";
  audio.stopMusic(0.8);
  hero.avatar.pose = "holdUp";
  await home.flyHeartHome();

  // Home. The first thing to change is the light
  home.phase = "home";
  c.rig.setShot(home.shots.heart, 0.5);
  home.lightUp();
  hero.avatar.pose = "normal";
  await home.sleep(2.4);

  // Then the whole mountain, still glowing, and the eruption dying down
  home.phase = "wide";
  c.rig.setShot(home.shots.wide, 2.2);
  await home.sleep(3.2);
  home.phase = "calm";
  audio.playMusic("music_title", 2.5);
  await home.settle();
  await home.sleep(1.8);

  // The old guardian can rest at last
  home.phase = "thanks";
  c.rig.setShot(home.shots.hueter, 2);
  home.lookAtHueter();
  void home.hueter.rise();
  await home.sleep(2.6);
  home.hueter.smile();
  await ui.say("finale_hueter_thanks");
  audio.playSfx("sfx_heal", 0.8, 0.8);
  await home.hueter.fade();

  // And Tadeo may finally jump for joy
  home.phase = "joy";
  c.rig.setShot(home.shots.wide, 2.4);
  home.lookAtCamera();
  await home.sleep(0.8);
  hero.avatar.pose = "cheer";
  c.celebrate("Geschafft!");
  for (let i = 0; i < 3; i++) {
    home.hop();
    await home.sleep(1.05);
  }
  await home.sleep(0.6);
}
