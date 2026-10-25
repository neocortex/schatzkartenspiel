/**
 * The ceremony script: a welcome, a warm-up on the drums, two Simon-says
 * trials (Weise Frau: 3 beats, Weiser Mann: 4 beats), the elder's maths
 * question on the answer stones and finally the golden key. A mistake only
 * means "watch again" — there is no way to lose.
 */

import * as THREE from "three";
import { DIALOGUES, DialogueScript } from "../../data/dialogues";
import { audio } from "../../audio/Audio";
import { createKey } from "../../world/models/items";
import { DRUM_KEYS, DRUM_INFO, DrumKey } from "./drums";
import { SageId } from "./crowd";
import { VillageStage, PLAY, WIDE, SAGE_SPOT, SAGE_HOMES, DRUM_CENTER } from "./stage";
import { dots, chip } from "./hud";
import { shot } from "../shared/director";

const line = (speaker: string, text: string) => ({ speaker, portrait: "", text });

const WELCOME: DialogueScript = [
  line("Dorfältester", "Willkommen am Feuerkreis, Tadeo! Das ganze Dorf ist gekommen, um dir zuzusehen."),
];
const PRACTICE: DialogueScript = [
  line("Weise Frau", "Das sind unsere Zaubertrommeln. Jede Pfeiltaste spielt eine Trommel. Probier sie aus!"),
];
const PRACTICE_DONE: DialogueScript = [line("Tadeo", "Das klingt toll! Ich bin bereit!")];
const THANKS: DialogueScript = [line("Tadeo", "Danke! Mit dem Schlüssel kann ich die Schatztruhe öffnen!")];

const SAGE_NAMES: Record<SageId, string> = { wiseWoman: "Die Weise Frau", wiseMan: "Der Weise Mann", elder: "Der Dorfältester" };
const ARROWS_HINT = `${chip("ArrowLeft", DRUM_INFO.ArrowLeft.color)}${chip("ArrowUp", DRUM_INFO.ArrowUp.color)}${chip("ArrowDown", DRUM_INFO.ArrowDown.color)}${chip("ArrowRight", DRUM_INFO.ArrowRight.color)}`;

export async function intro(s: VillageStage): Promise<void> {
  s.state.phase = "intro";
  void s.director.move(WIDE, 4.2);
  void s.tadeo.walkTo(DRUM_CENTER.x, DRUM_CENTER.z, 2.4).then(() => s.tadeo.face(Math.PI));
  s.crowd.watch(s.tadeo.position);
  await s.sleep(1.2);
  void s.ui.hud.showBanner("Das Dorffest", "Drei Prüfungen", 2800);
  await s.sleep(3.4);
  await s.say(WELCOME, PLAY);
}

/** Warm-up: hit every drum once to learn which arrow plays which drum. */
export async function practice(s: VillageStage): Promise<void> {
  const woman = s.crowd.sages.wiseWoman;
  s.tadeo.faceTo(woman.position.x, woman.position.z);
  await s.say(PRACTICE, PLAY);
  s.state.phase = "practice";
  s.showMallets(true);
  s.drums.showKeycaps(true);
  const left = new Set<DrumKey>(DRUM_KEYS);
  const render = () => s.hud.status(`Probier die Trommeln aus! ${DRUM_KEYS.map((k) => chip(k, DRUM_INFO[k].color, !left.has(k))).join("")}`);
  render();
  s.drums.setHints([...left]);
  while (left.size) {
    const k = (await s.nextKey(DRUM_KEYS)) as DrumKey;
    s.tadeoHit(k);
    left.delete(k);
    s.drums.setHints([...left]);
    render();
  }
  s.hud.status("Super! 🥁");
  s.sparkleAt(s.tadeo.position.clone().setY(1.2), 30, "#ffe27a");
  await s.sleep(0.9);
  s.hud.status(null);
  await s.say(PRACTICE_DONE, PLAY);
}

/** Random beat pattern without three equal beats in a row. */
function pattern(length: number): DrumKey[] {
  const seq: DrumKey[] = [];
  while (seq.length < length) {
    const k = DRUM_KEYS[Math.floor(Math.random() * 4)];
    if (seq.length >= 2 && seq[seq.length - 1] === k && seq[seq.length - 2] === k) continue;
    seq.push(k);
  }
  return seq;
}

async function stepForward(s: VillageStage, id: SageId): Promise<void> {
  const sage = s.crowd.sages[id];
  await sage.walkTo(SAGE_SPOT[0], SAGE_SPOT[1], 1.8);
  sage.faceTo(DRUM_CENTER.x, DRUM_CENTER.z);
  s.crowd.watch(sage.position);
}

async function stepBack(s: VillageStage, id: SageId): Promise<void> {
  const sage = s.crowd.sages[id];
  const [x, z] = SAGE_HOMES[id];
  await sage.walkTo(x, z, 1.8);
  sage.faceTo(DRUM_CENTER.x, DRUM_CENTER.z);
}

/** The sage plays the pattern on the drums, conducting with the talking pose. */
async function showPattern(s: VillageStage, id: SageId, seq: DrumKey[]): Promise<void> {
  s.state.phase = "show";
  s.state.progress = 0;
  s.drums.showKeycaps(false);
  s.hud.hint(null);
  s.hud.status(`👀 Schau genau hin! ${dots(0, seq.length)}`);
  const sage = s.crowd.sages[id];
  sage.avatar.pose = "talk";
  await s.sleep(0.9);
  for (const k of seq) {
    s.drums.play(k);
    s.crowd.watch(s.drums.position(k));
    s.sparkleAt(s.drums.position(k).clone().setY(1.0), 12, DRUM_INFO[k].color, 2);
    await s.sleep(0.85);
  }
  sage.avatar.pose = "normal";
  await s.sleep(0.25);
}

/** Tadeo repeats the pattern. Space asks to see it again. */
async function repeatPattern(s: VillageStage, seq: DrumKey[]): Promise<"ok" | "fail" | "again"> {
  s.state.phase = "input";
  s.drums.showKeycaps(true);
  s.hud.hint(`${ARROWS_HINT} trommeln · <span class="key">Leertaste</span> nochmal zeigen`);
  for (let i = 0; i < seq.length; i++) {
    s.state.progress = i;
    s.hud.status(`Du bist dran! ${dots(i, seq.length)}`);
    const k = await s.nextKey([...DRUM_KEYS, "Space"]);
    if (k === "Space") return "again";
    s.tadeoHit(k as DrumKey);
    if (k !== seq[i]) return "fail";
  }
  s.state.progress = seq.length;
  s.hud.status(`Richtig! ${dots(seq.length, seq.length)}`);
  return "ok";
}

async function cheer(s: VillageStage, seconds = 2): Promise<void> {
  audio.playSfx("sfx_simon_correct");
  s.drums.showKeycaps(false);
  s.hud.hint(null);
  // A quick victory roll over all four drums
  for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"] as DrumKey[]) {
    s.drums.play(k, 0.9);
    await s.sleep(0.09);
  }
  s.celebrate();
  s.tadeo.avatar.pose = "cheer";
  s.tadeo.jump(5.5);
  await s.sleep(seconds);
  s.tadeo.avatar.pose = "normal";
}

async function oops(s: VillageStage): Promise<void> {
  s.state.phase = "feedback";
  audio.playSfx("sfx_simon_wrong");
  s.director.shake(0.35);
  s.drums.showKeycaps(false);
  s.hud.hint(null);
  s.hud.status("Hoppla! 🙈");
  await s.sleep(0.9);
  s.hud.status(null);
}

export async function simonTrial(s: VillageStage, id: SageId, length: number, n: 1 | 2): Promise<void> {
  s.state.trial = n;
  s.showMallets(true);
  await stepForward(s, id);
  void s.ui.hud.showBanner(`Prüfung ${n} von 3`, SAGE_NAMES[id]);
  await s.say(`village_simon${n}_intro`, PLAY);
  const seq = pattern(length);
  s.state.sequence = seq;
  for (;;) {
    await showPattern(s, id, seq);
    const result = await repeatPattern(s, seq);
    if (result === "ok") break;
    if (result === "fail") {
      await oops(s);
      await s.say(`village_simon${n}_fail`, PLAY);
    }
  }
  await cheer(s);
  s.hud.status(null);
  await s.say(`village_simon${n}_success`, PLAY);
  await stepBack(s, id);
}

/** A friendly sum: addition within 20 or subtraction within 10. */
function question(): { a: number; b: number; op: "+" | "-"; answer: number } {
  if (Math.random() < 0.6) {
    const a = 2 + Math.floor(Math.random() * 9);
    const b = 1 + Math.floor(Math.random() * Math.min(9, 20 - a));
    return { a, b, op: "+", answer: a + b };
  }
  const a = 4 + Math.floor(Math.random() * 7);
  const b = 1 + Math.floor(Math.random() * (a - 1));
  return { a, b, op: "-", answer: a - b };
}

function choices(answer: number): number[] {
  const near = [answer - 1, answer + 1, answer - 2, answer + 2].filter((v) => v >= 0 && v <= 20);
  near.sort(() => Math.random() - 0.5);
  const list = [answer, near[0], near[1]];
  return list.sort(() => Math.random() - 0.5);
}

export async function mathTrial(s: VillageStage): Promise<void> {
  s.state.trial = 3;
  s.showMallets(false);
  s.drums.setRaised(false);
  const elder = s.crowd.sages.elder;
  // Tadeo steps back behind the rug's centre; the elder stands beside the stones
  void s.tadeo.walkTo(DRUM_CENTER.x, DRUM_CENTER.z + 1.0, 1.6).then(() => s.tadeo.face(Math.PI));
  await elder.walkTo(3.4, -1.5, 1.8);
  elder.faceTo(DRUM_CENTER.x, DRUM_CENTER.z + 1.0);
  s.crowd.watch(elder.position);
  void s.ui.hud.showBanner("Prüfung 3 von 3", SAGE_NAMES.elder);
  await s.say("village_simon3_intro", PLAY);
  const mathShot = shot(0, 6.4, 8.3, 0, 0.75, -0.9);
  for (;;) {
    const q = question();
    const values = choices(q.answer);
    s.state.answers = values;
    s.state.correct = values.indexOf(q.answer);
    s.stones.setValues(values);
    s.stones.setRaised(true);
    s.stones.select(1);
    s.state.selected = 1;
    void s.director.move(mathShot, 1.2);
    await s.sleep(0.9);
    s.hud.math(q);
    s.state.phase = "math";
    s.hud.hint(`${chip("ArrowLeft", "#7b4bb5")}${chip("ArrowRight", "#7b4bb5")} Stein aussuchen · <span class="key">Leertaste</span> antworten`);
    let sel = 1;
    for (;;) {
      s.tadeo.faceTo(s.stones.position(sel).x, s.stones.position(sel).z);
      const k = await s.nextKey(["ArrowLeft", "ArrowRight", "Space"]);
      if (k === "Space") break;
      sel = THREE.MathUtils.clamp(sel + (k === "ArrowLeft" ? -1 : 1), 0, 2);
      s.stones.select(sel);
      s.state.selected = sel;
      audio.playSfx("sfx_menu_select", 0.8);
    }
    s.hud.hint(null);
    s.state.phase = "feedback";
    const ok = values[sel] === q.answer;
    s.stones.stones[sel].react(ok);
    s.tadeo.jump(3);
    if (ok) {
      s.sparkleAt(s.stones.position(sel).clone().setY(1.2), 50, "#7dff8a", 4);
      await cheer(s, 1.6);
      s.hud.math(null);
      s.stones.select(-1);
      s.stones.setRaised(false);
      return;
    }
    await oops(s);
    s.hud.math(null);
    s.stones.select(-1);
    s.stones.setRaised(false);
    await s.say("village_simon3_fail", PLAY);
  }
}

/** The elder conjures the golden key above his staff; it floats over to Tadeo, who holds it up high. */
export async function keyReward(s: VillageStage): Promise<void> {
  s.state.phase = "reward";
  const success = DIALOGUES.village_simon3_success;
  const elder = s.crowd.sages.elder;
  await elder.walkTo(0.4, -0.2, 1.8);
  elder.faceTo(s.tadeo.position.x, s.tadeo.position.z);
  s.tadeo.faceTo(elder.position.x, elder.position.z);
  // Side-on two-shot of the elder and Tadeo for the handover
  const two = shot(4.6, 2.6, 2.2, 0.1, 1.0, 0.85);
  await s.say(success.slice(0, 1), null, two);

  const key = createKey();
  key.scale.setScalar(0.01);
  s.scene.add(key);
  elder.avatar.pose = "holdUp";
  const start = elder.position.clone().add(new THREE.Vector3(0.1, 2.5, 0.1));
  const tadeo = s.tadeo.position;
  const end = tadeo.clone().add(new THREE.Vector3(0, 2.15, 0));
  // Reason: keep Tadeo right of centre so the item-found icon doesn't cover him
  const hero = shot(tadeo.x + 1.2, 1.5, tadeo.z + 3.9, tadeo.x - 0.75, 1.4, tadeo.z - 0.6);
  audio.playSfx("sfx_item_get", 0.7);
  s.sparkleAt(start, 50, "#ffd75e", 2.5);
  // Pop in above the staff, hover, then float over in an arc
  for (let t = 0; t < 1; t += 1 / 30) {
    key.position.copy(start);
    key.scale.setScalar(Math.min(1.3, t * 2.6) * (1 + Math.sin(t * 9) * 0.05));
    key.rotation.y += 0.12;
    await s.sleep(1 / 30);
  }
  void s.director.move(hero, 1.6);
  for (let t = 0; t <= 1; t += 1 / 60) {
    const e = t * t * (3 - 2 * t);
    key.position.lerpVectors(start, end, e);
    key.position.y += Math.sin(e * Math.PI) * 1.2;
    key.rotation.y += 0.16;
    if (Math.random() < 0.5) s.sparkleAt(key.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 2, "#ffd75e", 0.6);
    await s.sleep(1 / 60);
  }
  elder.avatar.pose = "normal";
  // Into Tadeo's raised hand
  s.tadeo.face(Math.atan2(hero.pos.x - tadeo.x, hero.pos.z - tadeo.z));
  s.tadeo.avatar.pose = "holdUp";
  key.removeFromParent();
  key.position.set(0, -0.12, 0);
  key.rotation.set(0, 0, Math.PI);
  key.scale.setScalar(1.15);
  s.tadeo.avatar.handR.add(key);
  s.celebrate(1.3);
  audio.playSfx("sfx_victory_fanfare", 0.7);
  await s.sleep(1.4);
  await s.ui.itemGet("key");
  await s.say(success.slice(1), null, two);
  await s.say(THANKS, null, two);
  s.tadeo.face(0);
  s.tadeo.avatar.pose = "cheer";
  s.celebrate(1);
  await s.director.move(WIDE, 2.2);
  s.state.phase = "done";
  await s.sleep(1.2);
}
