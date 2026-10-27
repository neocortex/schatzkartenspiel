/**
 * The story of one fishing session, step by step: the welcome on the jetty,
 * then rounds of aim → cast → nibbles → bite → catch (or a gentle miss)
 * until five fish are in the bucket, with two surprises on the way (a message
 * bottle and the rare golden fish), and a happy ending where the fish are set
 * free again. Every step is a small promise driven by FishingGame's frames.
 */

import * as THREE from "three";
import { audio } from "../../audio/Audio";
import { NarrationManager } from "../../systems/NarrationManager";
import { SHOTS } from "./camera";
import { createBottle } from "./catch";
import { HOLD_AT } from "./crew";
import { BITE_WINDOW, FishingGame, HOOK_Y } from "./game";
import { BOTTLE, GOAL, INTRO, SAY, ending } from "./script";
import { FISH_SCALE, Fish, ZONE, fishFigure } from "./swimmers";
import { arcPoint } from "./tackle";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: T[], i: number): T => list[i % list.length];
const smooth = (k: number) => k * k * (3 - 2 * k);
/** From the message bottle's centre up to its neck, where the hook holds it. */
const BOTTLE_REACH = 0.1;

export async function playFishing(g: FishingGame): Promise<void> {
  await intro(g);
  while (g.caught.length < GOAL) await round(g);
  await finale(g);
  g.phase = "done";
}

async function intro(g: FishingGame): Promise<void> {
  g.phase = "intro";
  g.camMode = "fixed";
  g.tackle.showAim(false);
  g.crew.act("rest");
  // Hold the view out to sea for a moment, then crane over the crew round to their faces
  await g.wait(0.8);
  void g.ui.hud.showBanner("Angeln mit", "Fischer Jonas", 2600);
  await g.wait(1.6);
  g.cam.fly(SHOTS.talk, 3.2, 2.0);
  await g.wait(3.0);
  g.crew.act("wave");
  g.crew.exciteHenni(1.2);
  await g.talk(INTRO);
  g.crew.act("hold");
  g.setStatus(false);
  g.cam.fly(SHOTS.play, 2.0, 2.5);
}

async function round(g: FishingGame): Promise<void> {
  await aim(g);
  await cast(g);
  const bottle = g.caught.length === 2 && !g.bottleDone;
  const fish = bottle ? null : chooseFish(g);
  if (fish) await lure(g, fish);
  else await heavyTug(g);
  if (!(await biteWindow(g, fish))) return miss(g, fish);
  if (fish) await landFish(g, fish);
  else await landBottle(g);
}

async function aim(g: FishingGame): Promise<void> {
  g.phase = "aim";
  g.camMode = "play";
  g.bobberMode = "rod";
  g.crew.act("hold");
  g.tackle.showAim(true);
  g.castPressed = false;
  await g.until(() => g.castPressed, 14);
  if (!g.castPressed) {
    g.say("Fischer Jonas", SAY.aimHelp, 3.4);
    await g.until(() => g.castPressed);
  }
  g.tackle.showAim(false);
}

async function cast(g: FishingGame): Promise<void> {
  g.phase = "cast";
  g.casts++;
  g.spot.set(g.aim.x, 0, g.aim.z);
  g.crew.act("windup");
  audio.playSfx("sfx_hammer_miss", 0.5, 0.6);
  await g.wait(0.34);
  g.crew.act("throw");
  audio.playSfx("sfx_hammer_miss", 0.9, 0.9);
  const from = g.tackle.bobber.position.clone();
  const to = g.spot.clone().setY(0.03);
  const h = 1.4 + from.distanceTo(to) * 0.14;
  g.bobberMode = "fly";
  await g.tween(0.85, (k) => arcPoint(from, to, h, k, g.carry));
  g.bobberMode = "float";
  g.twitch(0.55);
  g.splash(to, 0.55);
  audio.playSfx("sfx_wave", 0.8, 1.7);
  g.phase = "wait";
  await g.wait(0.5);
}

/** Which fish comes to the hook: the golden one once it is here, else a nearby fish of a new kind. */
function chooseFish(g: FishingGame): Fish {
  const spot = g.spot;
  const dist = (f: Fish) => Math.hypot(f.pos.x - spot.x, f.pos.z - spot.z);
  const golden = g.world.golden;
  if (g.goldenArrived && golden.state !== "away" && (g.caught.length >= GOAL - 1 || dist(golden) < 4)) return golden;
  const wandering = g.world.fish.filter((f) => f.state === "wander");
  const calm = wandering.filter((f) => f.shy <= 0);
  const pool = calm.length ? calm : wandering.length ? wandering : g.world.swimming.filter((f) => f.kind !== "gold");
  const have = new Set(g.caught);
  // Reason: prefer kinds not caught yet, so the five catches show off as many different fish as possible
  const score = (f: Fish) => dist(f) + (have.has(f.kind) ? 6 : 0);
  return pool.reduce((best, f) => (score(f) < score(best) ? f : best));
}

/** The chosen fish swims over and nibbles a few times (the float twitches). */
async function lure(g: FishingGame, fish: Fish): Promise<void> {
  g.phase = "wait";
  g.biter = fish;
  fish.callTo(new THREE.Vector3(g.spot.x, HOOK_Y, g.spot.z));
  await g.until(() => fish.state === "nibble", 9);
  // Reason: never leave a seven-year-old waiting; a fish that got stuck just glides in
  if (fish.state !== "nibble") fish.state = "nibble";
  g.phase = "nibble";
  if (g.bites === 0) g.say("Fischer Jonas", SAY.firstNibble, 2.4);
  const pecks = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < pecks; i++) {
    await g.wait(rnd(0.55, 1.05));
    fish.peck();
    g.twitch(0.24);
    g.world.surface.ripple(g.spot.x, g.spot.z, 0.35);
    audio.playSfx("sfx_dialogue_advance", 0.8, rnd(0.55, 0.75));
  }
  await g.wait(rnd(0.45, 0.85));
}

/** The bottle round: nothing nibbles... then one sudden heavy tug. */
async function heavyTug(g: FishingGame): Promise<void> {
  g.phase = "wait";
  await g.wait(1.6);
  g.twitch(0.15);
  await g.wait(1.0);
}

/** The float goes under; resolves true if Space came in time. */
async function biteWindow(g: FishingGame, fish: Fish | null): Promise<boolean> {
  g.phase = "bite";
  g.bites++;
  if (fish) fish.state = "bite";
  g.bobberMode = "under";
  g.splash(g.spot, 0.8);
  g.cam.addShake(0.25);
  audio.playSfx("sfx_wave", 1, 1.25);
  audio.playSfx("sfx_menu_confirm", 0.8);
  g.struck = false;
  // Reason: every miss in a row makes the next bite window a little longer, so nobody gets stuck
  g.windowLeft = BITE_WINDOW + Math.min(g.missStreak, 2) * 0.4;
  await g.until(() => g.struck || g.windowLeft <= 0);
  g.windowLeft = 0;
  return g.struck;
}

async function miss(g: FishingGame, fish: Fish | null): Promise<void> {
  g.phase = "miss";
  g.misses++;
  g.missStreak++;
  g.bobberMode = "float";
  g.twitch(-0.35);
  g.splash(g.spot, 0.45);
  audio.playSfx("sfx_hammer_miss", 0.6, 0.8);
  fish?.scare(g.spot);
  g.biter = null;
  await g.wait(0.5);
  g.say("Fischer Jonas", pick(SAY.misses, g.misses - 1), 3.6);
  await g.wait(2.6);
  await reelIn(g);
}

/** Wind the empty line back in to the rod. */
async function reelIn(g: FishingGame): Promise<void> {
  const from = g.tackle.bobber.position.clone();
  const tip = new THREE.Vector3();
  g.bobberMode = "fly";
  g.crew.act("pull");
  audio.playSfx("sfx_berry_collect", 0.4, 0.6);
  g.splash(from, 0.25);
  await g.tween(0.7, (k) => {
    g.tackle.tipWorld(tip).y -= 0.45;
    arcPoint(from, tip, 0.5, smooth(k), g.carry);
  });
  g.bobberMode = "rod";
  g.crew.act("hold");
}

/**
 * Where a held-up catch hangs (its centre, `reach` below the hook): at head
 * height between Tadeo and Henni, swinging gently on the line. Also hangs the
 * bobber above it.
 */
function holdPoint(g: FishingGame, time: number, reach: number, out: THREE.Vector3): THREE.Vector3 {
  out.copy(HOLD_AT);
  out.x += Math.sin(time * 1.9) * 0.04;
  g.carry.set(out.x, out.y + reach - HOOK_Y, out.z);
  return out;
}

/** Pull! The fish leaps out in a sparkly arc, is held up, named, and dropped into the bucket. */
async function landFish(g: FishingGame, fish: Fish): Promise<void> {
  g.phase = "reel";
  g.missStreak = 0;
  const spec = fish.spec;
  const golden = fish.kind === "gold";
  const cm = Math.round(rnd(spec.cm[0], spec.cm[1]));
  fish.state = "hooked";
  g.crew.act("yank");
  g.tackle.bend = 1;
  g.cam.addShake(0.6);
  g.splash(g.spot, 1.5);
  audio.playSfx("sfx_wave", 1, 0.9);
  audio.playSfx("sfx_berry_collect", 0.9, 0.8);
  g.say("Tadeo", pick(SAY.cheers, g.caught.length), 2.4);
  g.bobberMode = "carried";
  g.camMode = "fixed";

  // The leap: out of the water up next to Tadeo, spinning and trailing glitter
  const from = fish.pos.clone();
  const goal = new THREE.Vector3();
  const reach = fish.length * 0.5;
  let spark = 0;
  await g.tween(1.1, (k, dt) => {
    holdPoint(g, g.engine?.time ?? 0, reach, goal);
    arcPoint(from, goal, 2.0, smooth(k), fish.pos);
    fish.hang = smooth(k);
    fish.yaw += dt * 11 * (1 - k);
    g.carry.set(fish.pos.x, fish.pos.y + reach * fish.hang - HOOK_Y, fish.pos.z);
    g.tackle.bend = 1 - k * 0.5;
    spark -= dt;
    if (spark < 0) {
      spark = 0.05;
      g.world.fx.sparkle(fish.pos, golden ? "#ffd84a" : "#c8f6ff", golden ? 6 : 3, 1.2);
    }
  });

  // Hold it up for everyone to see
  g.phase = "show";
  g.cam.cut(SHOTS.show);
  g.crew.act("show");
  g.crew.exciteHenni(2.2);
  g.crew.cheerJonas(1.6);
  const record = g.record(cm);
  g.hud.showCard({ icon: fish.kind, name: spec.name, size: `${cm} cm`, badge: golden ? "Ganz selten!" : record ? "Neuer Rekord!" : "", rare: golden });
  audio.playSfx(golden ? "sfx_special" : "sfx_item_get", golden ? 0.8 : 1);
  g.world.fx.sparkle(fish.pos, golden ? "#ffd84a" : "#ffffff", golden ? 90 : 40, golden ? 3.4 : 2.6);
  const stop = g.every((dt, time) => {
    holdPoint(g, time, reach, goal);
    fish.pos.lerp(goal, 1 - Math.exp(-dt * 10));
    // Reason: turn the fish's side to the camera, wiggling a little like it wants back into the water
    fish.yaw += (1.2 + Math.sin(time * 2.2) * 0.45 - fish.yaw) * Math.min(1, dt * 5);
    fish.hang = 1;
    if (fish.kind === "puffer") fish.puff = Math.min(0.8, fish.puff + dt * 2.5);
    g.tackle.bend = 0.35 + Math.sin(time * 7) * 0.05;
  });
  await g.wait(0.9);
  g.say("Fischer Jonas", spec.fact, 4.2);
  await g.wait(3.7);
  stop();
  g.hud.hideCard();

  // Into the bucket
  g.bobberMode = "rod";
  g.crew.act("hold");
  g.tackle.bend = 0;
  const start = fish.pos.clone();
  const into = g.world.dock.bucket.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.42, 0));
  g.cam.fly(SHOTS.play, 1.5, 1.5);
  await g.tween(0.6, (k, dt) => {
    arcPoint(start, into, 0.7, k, fish.pos);
    fish.yaw += dt * 6;
  });
  fish.state = "away";
  fish.root.visible = false;
  fish.puff = 0;
  fish.hang = 0;
  g.biter = null;
  g.bucket.add(fish.kind, g.look(fish.kind));
  g.world.fx.drops.emit(into, { count: 16, color: "#e8fbff", speed: [0.5, 1.4], up: 2, life: [0.4, 0.8], size: [0.05, 0.11], gravity: 9 });
  audio.playSfx("sfx_berry_collect", 0.8, 1.25);
  audio.playSfx("sfx_wave", 0.5, 2.2);
  g.caught.push(fish.kind);
  g.setStatus(true);
  if (!golden) respawn(g, fish);
  if (g.caught.length === GOAL) prefetchEnding(g);
  if (g.caught.length === 3 && !g.goldenArrived) await goldenArrives(g);
}

/** A fresh fish of the same kind turns up again a little later, so the lagoon stays full. */
function respawn(g: FishingGame, fish: Fish): void {
  void g.wait(4).then(() => {
    fish.placeAt(rnd(ZONE.x0, ZONE.x1), ZONE.y0 + 0.3, ZONE.z0 - 1, rnd(-0.4, 0.4));
    fish.root.visible = true;
  });
}

/** After the third fish, the golden fish glides in from the reef with a trail of glitter. */
async function goldenArrives(g: FishingGame): Promise<void> {
  const gold = g.world.golden;
  gold.placeAt(-6.4, -1.0, -11.5, 0.6);
  gold.root.visible = true;
  g.goldenArrived = true;
  audio.playSfx("sfx_heal", 0.9);
  g.world.fx.sparkle(gold.pos, "#ffd84a", 50, 2);
  g.crew.exciteHenni(2.4);
  g.say("Henni", SAY.goldenSpotted, 3.4);
  await g.wait(1.2);
}

/** The surprise catch: a message bottle with a hint about the treasure. */
async function landBottle(g: FishingGame): Promise<void> {
  g.phase = "reel";
  g.missStreak = 0;
  g.crew.act("pull");
  g.say("Tadeo", SAY.heavy, 2.2);
  await g.tween(1.3, (k, dt) => {
    g.tackle.bend = 0.85 + Math.sin(k * 26) * 0.12;
    g.cam.addShake(dt * 0.5);
  });
  g.crew.act("yank");
  g.cam.addShake(0.5);
  g.splash(g.spot, 1.3);
  audio.playSfx("sfx_wave", 1, 0.85);
  const bottle = createBottle();
  g.bottle = bottle;
  g.world.scene.add(bottle);
  bottle.position.set(g.spot.x, -0.5, g.spot.z);
  g.bobberMode = "carried";
  g.camMode = "fixed";
  const from = bottle.position.clone();
  const goal = new THREE.Vector3();
  await g.tween(1.1, (k, dt) => {
    holdPoint(g, g.engine?.time ?? 0, BOTTLE_REACH, goal);
    arcPoint(from, goal, 2.0, smooth(k), bottle.position);
    bottle.rotation.z += dt * 9 * (1 - k);
    g.carry.set(bottle.position.x, bottle.position.y + BOTTLE_REACH - HOOK_Y, bottle.position.z);
    g.tackle.bend = 1 - k * 0.5;
  });

  g.phase = "show";
  g.cam.cut(SHOTS.show);
  g.crew.act("show");
  g.crew.exciteHenni(2);
  g.hud.showCard({ icon: "bottle", name: "Flaschenpost!", size: "Kein Fisch, aber eine Überraschung", badge: "Ein Schatz-Tipp!" });
  audio.playSfx("sfx_chest_open", 0.9);
  g.world.fx.sparkle(bottle.position, "#bfffe0", 50, 2.6);
  const stop = g.every((dt, time) => {
    holdPoint(g, time, BOTTLE_REACH, goal);
    bottle.position.lerp(goal, 1 - Math.exp(-dt * 10));
    bottle.rotation.set(0, Math.PI / 2 + Math.sin(time * 1.5) * 0.35, 0.2 + Math.sin(time * 2.1) * 0.1);
  });
  await g.wait(1.8);
  g.hud.hideCard();
  await g.talk(BOTTLE);
  stop();
  g.bottleDone = true;

  // Put the bottle down on the planks next to the bucket
  g.bobberMode = "rod";
  g.crew.act("hold");
  g.tackle.bend = 0;
  const start = bottle.position.clone();
  const rest = g.world.dock.bucket.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.45, 0.08, 0.15));
  g.cam.fly(SHOTS.play, 1.5, 1.5);
  await g.tween(0.6, (k) => {
    arcPoint(start, rest, 0.4, k, bottle.position);
    bottle.rotation.set(0, 0.6 * k, (Math.PI / 2) * k);
  });
  audio.playSfx("sfx_dig", 0.6, 1.4);
}

/** Start fetching the ending's voice lines while the last fish is celebrated. */
function prefetchEnding(g: FishingGame): void {
  const { praise, farewell } = ending(g.biggest);
  void NarrationManager.getInstance().prefetch([...praise, ...farewell]);
}

async function finale(g: FishingGame): Promise<void> {
  g.phase = "ending";
  g.camMode = "fixed";
  g.tackle.showAim(false);
  audio.playSfx("sfx_victory_fanfare");
  audio.playMusic("music_victory");
  g.crew.act("cheer");
  g.crew.cheerJonas(3);
  g.crew.exciteHenni(3);
  g.cam.fly(SHOTS.talk, 2.2, 2.5);
  void g.ui.hud.showBanner("Super gemacht!", "5 Fische gefangen!", 2800);
  const colors = ["#ffd84a", "#ff6fa8", "#6fe8ff", "#9dff6f", "#ffffff"];
  for (let i = 0; i < 6; i++) {
    const at = new THREE.Vector3(rnd(-1.2, 1.6), rnd(1.9, 2.6), rnd(-0.6, 0.2));
    g.world.fx.sparkle(at, pick(colors, i), 40, 2.8);
    audio.playSfx("sfx_berry_collect", 0.5, 1 + i * 0.12);
    await g.wait(0.45);
  }
  g.crew.act("rest");
  const { praise, farewell } = ending(g.biggest);
  await g.talk(praise);
  await release(g);
  g.crew.act("wave");
  g.cam.fly(SHOTS.talk, 2.0, 2.5);
  await g.wait(1.8);
  await g.talk(farewell);
  await g.wait(0.6);
}

/** Every fish in the bucket leaps back into the lagoon, one after the other. */
async function release(g: FishingGame): Promise<void> {
  g.cam.fly(SHOTS.play, 1.8, 2.5);
  await g.wait(1.6);
  const leaps = g.bucket.takeAll().map(({ kind, at }, i) => {
    const { root, tail } = fishFigure(kind, g.look(kind));
    root.position.copy(at);
    root.scale.setScalar(FISH_SCALE);
    root.rotation.order = "YXZ";
    g.world.scene.add(root);
    const to = new THREE.Vector3(rnd(-2.6, 2.6), -0.2, rnd(-5.2, -2.8));
    const yaw = Math.atan2(to.x - at.x, to.z - at.z);
    return g
      .tween(0.25 * i + 0.01)
      .then(() => {
        audio.playSfx("sfx_simon_correct", 0.6, 0.9 + i * 0.08);
        return g.tween(1.0, (k, dt) => {
          arcPoint(at, to, 1.6, k, root.position);
          // Reason: nose up on the way out, nose down on the way in, like a happy dolphin jump
          root.rotation.set(THREE.MathUtils.lerp(-0.9, 1.2, k), yaw, 0);
          tail.rotation.y = Math.sin(k * 40) * 0.6;
          if (Math.random() < dt * 30) g.world.fx.sparkle(root.position, "#c8f6ff", 2, 0.8);
        });
      })
      .then(() => {
        g.world.scene.remove(root);
        g.splash(to.setY(0), 0.9);
        audio.playSfx("sfx_wave", 0.7, 1.5);
      });
  });
  await Promise.all(leaps);
  g.crew.exciteHenni(1.6);
  await g.wait(1.0);
}
