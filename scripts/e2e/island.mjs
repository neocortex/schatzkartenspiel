/**
 * E2E: the island adventure flow, played with real key presses in Chrome.
 *
 *  1. Title screen → "Neues Abenteuer" → the opening: bottle on the beach, map card, the shark's hit at sea, the flight
 *     down to the landing beach, Chuleta and the call for help
 *  2. Quest 1 ends with the opening → quest 2 starts, game is saved (version 4), twelve quests exist
 *  3. Coins: walk through a coin → counter goes up
 *  4. Quest 3 (debug start): the elder tells the legend, the map card opens and closes → quest 4 starts
 *  5. Quest 4 (debug start): three riddles at the lake (mashing Space, a wrong answer, any order), the Hüter rises,
 *     speaks the rhyme and Tadeo repeats it → quest 5 starts
 *  6. Village (debug start): chat with a villager
 *  6b. The new cast: portraits, faces in the dialogue box, Paco beside the elder, the mole in the cave, the Hüter on the lake
 *  7. Quest 12 (debug start): the island runs without a gate
 *  8. A save from an older version offers no Continue, and starting over keeps coins and hats
 *  9. Mashing Space through the whole opening skips nothing and leaves the game correct
 *
 * Run (dev server on :5199 must be running):  node scripts/e2e/island.mjs
 * Proof: scripts/e2e/out/island/summary.json + screenshots
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.GAME_URL ?? "http://localhost:5199/";
const OUT = new URL("./out/island/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const state = () =>
  page.evaluate(() => {
    const g = window.game;
    const p = g.island.player.position;
    return {
      x: p.x,
      z: p.z,
      milestone: g.quest.currentMilestone,
      coins: g.coins.collected,
      dialogue: g.ui.dialogue.isOpen,
      busy: g.busy,
      free: !g.busy && !g.ui.dialogue.isOpen,
      prompt: document.querySelector(".prompt")?.style.display !== "none" ? document.querySelector(".prompt")?.textContent.trim() : null,
    };
  });

/** Press Space until no dialogue is open (each press completes or advances a line). */
async function finishDialogue(maxPresses = 40) {
  for (let i = 0; i < maxPresses; i++) {
    if (!(await state()).dialogue) return true;
    await page.keyboard.press("Space");
    await wait(250);
  }
  return !(await state()).dialogue;
}

/** Steer Tadeo towards (x, z) with the arrow keys (camera looks north: Up = -z, Right = +x). */
async function walkTo(x, z, radius = 1.2, timeoutMs = 20000) {
  const t0 = Date.now();
  const held = new Set();
  const hold = async (key, on) => {
    if (on && !held.has(key)) await page.keyboard.down(key), held.add(key);
    if (!on && held.has(key)) await page.keyboard.up(key), held.delete(key);
  };
  let s = await state();
  while (Math.hypot(s.x - x, s.z - z) > radius && Date.now() - t0 < timeoutMs) {
    const dx = x - s.x;
    const dz = z - s.z;
    await hold("ArrowRight", dx > 0.4);
    await hold("ArrowLeft", dx < -0.4);
    await hold("ArrowDown", dz > 0.4);
    await hold("ArrowUp", dz < -0.4);
    await wait(60);
    s = await state();
  }
  for (const k of [...held]) await hold(k, false);
  await wait(250);
  return Math.hypot(s.x - x, s.z - z) <= radius + 0.5;
}

async function waitUntilFree(timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await state();
    if (s.dialogue) await page.keyboard.press("Space");
    else if (!s.busy) return true;
    await wait(250);
  }
  return false;
}

/** Wait until `test()` holds. */
async function until(test, timeoutMs = 30000, stepMs = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await test()) return true;
    await wait(stepMs);
  }
  return false;
}

/** Everyone who spoke so far in the opening, and their lines in order as "Name: text". */
const speakers = new Set();
const spoken = [];

/** Press through any open dialogue, noting who speaks and what they say, until `stop()` holds. */
async function readUntil(stop, timeoutMs = 30000) {
  return until(async () => {
    if (await stop()) return true;
    if ((await state()).dialogue) {
      const name = await page.textContent(".dialogue .name");
      speakers.add(name);
      // Reason: the box types its text out letter by letter, so the whole line comes from the dialogue itself
      const said = `${name}: ${await page.evaluate(() => window.game.ui.dialogue.full)}`;
      if (spoken.at(-1) !== said) spoken.push(said);
      await page.keyboard.press("Space");
    }
    return false;
  }, timeoutMs, 200);
}

const story = () => page.evaluate(() => window.game.story.e2e);
const bannerText = () => page.textContent(".banner");
const hasObject = (name) => page.evaluate((n) => !!window.game.island.scene.getObjectByName(n), name);
const mapCardOpen = () => page.isVisible(".map-card");
const chuletaVisible = () => page.evaluate(() => window.game.chuleta.root.visible);
const dialogueOpen = async () => (await state()).dialogue;
const screenBlack = () => page.evaluate(() => Number(getComputedStyle(document.getElementById("fade")).opacity) > 0.95);
const banner2Shows = async () => (await page.isVisible(".banner.show")) && (await bannerText()).includes("von");

// ── 1. Title + opening ──────────────────────────────────────
await page.addInitScript(() => {
  if (!sessionStorage.getItem("e2e-cleared")) {
    localStorage.clear();
    sessionStorage.setItem("e2e-cleared", "1");
  }
});
await page.goto(BASE);
await wait(4000);
check("title screen shows logo + menu", await page.isVisible(".title-screen .logo"), await page.textContent(".title-screen .menu"));
check("twelve quests", (await page.evaluate(async () => (await import("/src/data/quests.ts")).QUESTS.length)) === 12);
await shot("01-title");
await page.keyboard.press("Space");

// The bottle on the beach
check("the opening starts with the narrator on a beach", await until(dialogueOpen, 15000));
await wait(1500);
check("the first voice is the narrator", (await page.textContent(".dialogue .name")) === "Erzähler");
await shot("02-beach");
check("Chuleta hides in the backpack at the start", !(await chuletaVisible()));

// The map card
await readUntil(mapCardOpen);
check("map card shows and has no text", (await mapCardOpen()) && (await page.textContent(".map-card")).trim() === "");
await page.keyboard.press("Space");
await wait(150);
check("Space does not close the card in its first 0.4 s", await mapCardOpen());
await wait(1600);
await shot("03-map-card");
await page.keyboard.press("Space");
check("Space closes the map card", await until(async () => !(await mapCardOpen()), 2000));
await wait(500);
await shot("03b-tadeo-sets-off");

// The shark's hit at sea
check("the sea cinematic starts", await readUntil(() => hasObject("opening-sea"), 12000));
const seaStart = Date.now();
check("Chuleta stays in the backpack at sea", !(await chuletaVisible()));
await wait(1500);
await shot("04-sailing");
await wait(3300);
await shot("05-fin");
check("the shark breaks the surface", await until(() => page.evaluate(() => window.game.island.scene.getObjectByName("opening-shark")?.position.y > -0.2), 9000, 16));
await shot("06-hit");
await wait(150);
await shot("06b-hit");
check("the hit cuts to black", await until(screenBlack, 3000, 16));
const seaSeconds = (Date.now() - seaStart) / 1000;
check("the sea cinematic stays under 12 seconds", seaSeconds < 12, `${seaSeconds.toFixed(1)} s`);
check("the sea cinematic has a moment for the fin", seaSeconds > 5, `${seaSeconds.toFixed(1)} s`);
await shot("07-black");
check("the sea group is cleaned up", await until(async () => !(await hasObject("opening-sea")), 3000));
check("the beach bottle is cleaned up", !(await hasObject("opening-beach")));

// Flight down to the landing beach
await wait(3500);
await shot("08-flight");
check("the arrival dialogue opens", await until(dialogueOpen, 20000));
await shot("09-arrival");
check("Chuleta is out of the backpack", await chuletaVisible());
check("the banner comes after the talk", await readUntil(banner2Shows, 30000));
await shot("10-quest2-banner");
const bannerLine = await bannerText();
check("intro has narrator, Tadeo, Chuleta and Stimme", ["Erzähler", "Tadeo", "Chuleta", "Stimme"].every((s) => speakers.has(s)), [...speakers].join(", "));
check("no sign quest", !speakers.has("Schild"));
check(
  "Chuleta's last word sends him after the golden star, right after the call for help",
  /^Chuleta: .*goldenen Stern/.test(spoken.at(-1)) && /^Tadeo: .*Vulkan/.test(spoken.at(-2)),
  spoken.slice(-2).join(" | "),
);
check("player is free after intro", await waitUntilFree());

// ── 2. Quest 1 ends with the intro ──────────────────────────
let s = await state();
check("quest 1 completes by itself", s.milestone === 2 && s.free, JSON.stringify(s));
check("banner says 2 von 12", bannerLine.includes("2 von 12"), bannerLine);
const e2e = await story();
check("no boat at the landing pier, wreck on the sand", e2e.wreck && !e2e.pierBoat);
check("Tadeo stands at the landing pier, no coin was picked up on the way", Math.hypot(s.x + 66, s.z - 47) < 1 && s.coins === 0, JSON.stringify(s));
check("the HUD is on", await page.isVisible(".hud-quest"));
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("schatzkarten_save") ?? "null"));
check("progress was saved", saved?.milestone === 2, JSON.stringify(saved));
check("save version is 4", saved?.version === 4, JSON.stringify(saved));
await shot("11-quest2");

// ── 3. Coins ────────────────────────────────────────────────
const coinsBefore = (await state()).coins;
const coin = await page.evaluate(() => {
  const p = window.game.island.player.position;
  const spots = window.game.coins.spots.filter((_, i) => !window.game.coins.taken.has(i));
  spots.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  return [spots[0].x, spots[0].z];
});
await page.evaluate(([x, z]) => window.game.placePlayer(x, z + 4), coin);
await wait(500);
await walkTo(coin[0], coin[1], 0.6, 8000);
await wait(300);
s = await state();
check("walking through a coin collects it", s.coins === coinsBefore + 1, `${coinsBefore} → ${s.coins}`);
check("HUD shows the coin count", (await page.textContent(".hud-coins"))?.includes(`${s.coins} / 30`) ?? false);
await shot("05-coin");

// ── 4. Quest 3: the elder tells the legend ──────────────────
/** Every line the dialogue box begins, as "Name: text": read from the box itself, so a quick line is never missed. */
async function recordLines() {
  await page.evaluate(() => {
    const box = Object.getPrototypeOf(window.game.ui.dialogue);
    const begin = box.showLine;
    window.said = [];
    box.showLine = function () {
      begin.call(this);
      window.said.push(`${this.script[this.index].speaker}: ${this.script[this.index].text}`);
    };
  });
}
const said = () => page.evaluate(() => window.said);
const plain = (list) => list.map((l) => l.replace(/^[^:]+: /, ""));
const onIsland = () => page.evaluate(() => window.engine.scene === window.game.island);
await page.goto(`${BASE}?quest=3`);
await wait(4000);
await recordLines();
// When the map card is added to the page, so a press can be placed inside its first 0.4 s
await page.evaluate(() => {
  new MutationObserver((changes) => {
    if (changes.some((c) => [...c.addedNodes].some((n) => n.classList?.contains("map-card")))) window.mapCardOpenedAt = performance.now();
  }).observe(document.getElementById("ui"), { childList: true });
});
const elder = await page.evaluate(() => {
  const p = window.game.npcs.get("elder").position;
  return [p.x, p.z];
});
await page.evaluate(([x, z]) => window.game.placePlayer(x, z + 2.2, Math.PI), elder);
await wait(600);
s = await state();
check("elder: prompt to talk", s.prompt?.includes("Sprechen") ?? false, s.prompt ?? "no prompt");
await page.keyboard.press("Space");
await wait(600);
check("elder: the talk opens a dialogue, no challenge starts", (await state()).dialogue && (await onIsland()));
await readUntil(mapCardOpen);
const mapCardSeen = await mapCardOpen();
// The card is held up inside the elder's talk, where the island leaves Space alone. A press right now is in its first 0.4 s.
await page.keyboard.press("Space");
const pressAge = await page.evaluate(() => performance.now() - window.mapCardOpenedAt);
await wait(150);
// Reason: a press that was taken starts the closing animation, and the card stays in the page for 0.28 s while it plays
const taken = await page.isVisible(".map-card.closing");
check("the map card stays open when Space comes in its first 0.4 s", pressAge < 400 && !taken && (await mapCardOpen()), `${Math.round(pressAge)} ms after it opened, closing: ${taken}`);
await wait(450);
await shot("04-map-card-quest3");
await wait(1000);
await page.keyboard.press("Space");
check("Space closes the map card at quest 3", await until(async () => !(await mapCardOpen()), 2000));
await readUntil(async () => (await state()).milestone === 4, 30000);
await waitUntilFree();
s = await state();
let heard = await said();
let lines = plain(heard);
check("elder tells the legend at quest 3 and no challenge starts", heard[0]?.startsWith("Dorfältester: ") && (await onIsland()));
check("the elder tells of the Feuerherz and the stolen heart", ["Unser Vulkan hat ein Herz: das Feuerherz.", "Aber ein Pirat hat es gestohlen. Jetzt wacht der Vulkan auf!"].every((l) => lines.includes(l)));
check("the map card appears", mapCardSeen);
check("Tadeo asks for a moment before the card", lines.indexOf("Moment! Ich habe eine Karte!") === lines.indexOf("Und niemand weiß, wo das Herz ist.") + 1);
check("Paco says Hm, hm.", heard.includes("Käpt'n Paco: Hm, hm."));
check("the elder sends him to the ghost at the lake", lines.at(-1) === "Wie du hinkommst, weiß nur der Geist am See.", lines.at(-1));
check("the legend is nine lines", heard.length === 9, `${heard.length} lines`);
check("quest 4 (See) is active after the elder", s.milestone === 4, `milestone ${s.milestone}`);
await shot("04b-quest4");

// ── 5. Quest 4: three riddles at the lake ───────────────────
// [x, z, approach dx, approach dz] — tablet 2 stands on a steep lake bank, reachable only from the east
const tablets = [[-14, -9, 0, 1], [17, -9, 1, 0], [2, 19, 0, 1]];
const RIGHT = [1, 2, 1];
const lake = () => page.evaluate(() => window.game.lake.e2e);
const riddleOpen = () => page.isVisible(".riddle-card");
const highlighted = () => page.evaluate(() => [...document.querySelectorAll(".riddle-answer")].findIndex((a) => a.classList.contains("active")));
const answersShown = () => page.evaluate(() => [...document.querySelectorAll(".riddle-answer")].map((a) => a.textContent.trim()));
const saidAloud = () => page.evaluate(() => window.spokenAloud.map((l) => l.replace(/^[^:]+: /, "")));
await page.goto(`${BASE}?quest=4`);
await wait(4000);
await recordLines();
// Every spoken line is noted, so the answers read aloud can be checked
await page.evaluate(async () => {
  const { NarrationManager } = await import("/src/systems/NarrationManager.ts");
  const narration = NarrationManager.getInstance();
  const speak = narration.speakLine.bind(narration);
  window.spokenAloud = [];
  narration.speakLine = (text, speaker) => (window.spokenAloud.push(`${speaker}: ${text}`), speak(text, speaker));
});
check("all three tablets start dark and asleep", (await lake()).lit.every((l) => !l) && (await lake()).solved === 0 && !(await lake()).ghost);

async function goToTablet(i) {
  const [tx, tz, ax, az] = tablets[i];
  await page.evaluate(([x, z]) => window.game.placePlayer(x, z), [tx + ax * 3.2, tz + az * 3.2]);
  await wait(500);
  await walkTo(tx + ax * 2.2, tz + az * 2.2, 0.6, 6000);
  s = await state();
  check(`tablet ${i + 1}: prompt to read`, s.prompt?.includes("Lesen") ?? false, s.prompt ?? "no prompt");
}

/** Read a tablet's lines and wait for its card; the card is then at least 0.5 s old when this returns. */
async function openRiddle() {
  await page.keyboard.press("Space");
  await readUntil(riddleOpen, 20000);
  await wait(550);
}

/** Choose answer k with the arrows and Space. */
async function choose(k) {
  // Reason: two presses inside one frame count as one, so a person's presses are told apart by a pause
  for (let n = await highlighted(); n < k; n++) {
    await page.keyboard.press("ArrowDown");
    await wait(120);
  }
  await wait(150);
  await page.keyboard.press("Space");
}

// First tablet: mashing Space gets nowhere, a wrong answer is kind, the right one lights the tablet
await goToTablet(0);
await page.keyboard.press("Space");
check("tablet 1: Steintafel reads the riddle", await until(async () => (await state()).dialogue && (await page.textContent(".dialogue .name")) === "Steintafel", 3000));
let sawKindLine = false;
let kindSpeaker = "";
let presses = 0;
const mashUntil = Date.now() + 14000;
while (Date.now() < mashUntil && !sawKindLine) {
  if ((await state()).dialogue) {
    sawKindLine = (await page.evaluate(() => window.game.ui.dialogue.full)).includes("passt noch nicht");
    kindSpeaker = await page.textContent(".dialogue .name");
  }
  await page.keyboard.press("Space");
  presses++;
  await wait(90);
}
check("mashing Space never solves a riddle", (await lake()).solved === 0 && sawKindLine, `${presses} presses`);
check("the kind line is the tablet's", kindSpeaker === "Steintafel", kindSpeaker);
await shot("05-wrong-answer");
check("a wrong answer keeps the tablet dark", !(await lake()).lit[0]);
await readUntil(riddleOpen, 20000);
check("after a wrong answer the question comes back", await riddleOpen());
check("the highlight starts on the first answer again", (await highlighted()) === 0);
check("the card shows the three answers", (await answersShown()).join() === "Chuleta,Schatten,Wind", (await answersShown()).join());
check("the first answer is read aloud when it is highlighted", (await saidAloud()).includes("Chuleta"));
await page.keyboard.press("Space");
await wait(100);
check("Space does nothing in the first 0.4 s of a card", await riddleOpen());
await wait(500);
await page.keyboard.press("ArrowDown");
await wait(150);
check("ArrowDown moves the highlight", (await highlighted()) === 1);
check("the new answer is read aloud", (await saidAloud()).includes("Schatten"));
await shot("06-riddle-card");
await page.keyboard.press("ArrowUp");
await wait(100);
await page.keyboard.press("ArrowUp");
await wait(100);
check("the highlight stops at the first answer", (await highlighted()) === 0);
await page.keyboard.press("ArrowDown");
await wait(150);
await page.keyboard.press("Space");
check("the card closes when an answer is chosen", await until(async () => !(await riddleOpen()), 2000));
check("the right answer lights the tablet", await until(async () => (await lake()).lit[0] && (await lake()).solved === 1, 3000), JSON.stringify(await lake()));
await wait(500);
await shot("07-tablet-lit");
await waitUntilFree();

// The other two, in the order 3, 2: any order works
for (const i of [2, 1]) {
  await goToTablet(i);
  await openRiddle();
  if (i === 2) await shot("08-ghost-riddle");
  await choose(RIGHT[i]);
  check(`tablet ${i + 1}: the right answer lights it`, await until(async () => (await lake()).lit[i], 3000), JSON.stringify(await lake()));
  if (i === 2) {
    check("the ghost has not risen before the third riddle", !(await lake()).ghost);
    await wait(1500);
    await shot("09-two-lit");
    await waitUntilFree();
  }
}

// The third riddle wakes the ghost
await page.evaluate(() => (window.said = []));
check("any order works", (await lake()).lit.every(Boolean) && (await lake()).solved === 3, JSON.stringify(await lake()));
check("the ghost rises after the third", await until(async () => (await lake()).ghost, 8000));
await wait(1500);
await shot("10-hueter-rising");
await wait(2500);
await shot("11-hueter-risen");
await readUntil(async () => (await state()).milestone === 5, 60000);
await waitUntilFree();
s = await state();
heard = await said();
lines = plain(heard);
check("the Hüter speaks first", heard[0] === "Hüter: Ich bin der Hüter. Ich habe auf das Herz aufgepasst.", heard[0]);
check("the rhyme is said and Tadeo repeats it", lines.includes("Das Schwert aus dem Fels zerschneidet den Dorn,") && lines.some((l) => l.startsWith("Also: Das Schwert")));
check("the whole rhyme is four lines, then Tadeo's two", lines.indexOf("Also: Das Schwert für die Dornen. Die Beeren für die Monster.") - lines.indexOf("Das Schwert aus dem Fels zerschneidet den Dorn,") === 4);
check("the ghost has the last word before Chuleta", lines.at(-1) === "Und der Pirat... Er ist näher, als du denkst.", lines.at(-1));
check("the conversation with the ghost is 11 lines, under the limit of 12", heard.length === 11, `${heard.length} lines`);
check("the ghost is gone after he has spoken", await until(async () => !(await lake()).ghost, 6000));
check("quest 5 (Höhle) is active", s.milestone === 5, `milestone ${s.milestone}`);
await shot("12-quest5");

// A reload keeps nothing of the riddles: all three come back dark, and can be answered again
await page.goto(`${BASE}?quest=4`);
await wait(4000);
check("after a reload the tablets are dark again", (await lake()).lit.every((l) => !l) && (await lake()).solved === 0);
await goToTablet(1);
await openRiddle();
check("a riddle can be asked again after a reload", (await riddleOpen()) && (await highlighted()) === 0);

// ── 6. Village chat ─────────────────────────────────────────
await page.goto(`${BASE}?quest=8`);
await wait(4000);
await page.evaluate(() => window.game.placePlayer(72, 44.4, Math.PI));
await wait(600);
s = await state();
check("villager offers a chat", s.prompt?.includes("Sprechen") ?? false, s.prompt ?? "no prompt");
await page.keyboard.press("Space");
await wait(900);
const chatName = await page.textContent(".dialogue .name");
check("chat dialogue with a villager", (await state()).dialogue && chatName === "Käpt'n Paco", chatName ?? "");
await shot("08-village-chat");
await finishDialogue();
await waitUntilFree();
await page.evaluate(() => window.game.placePlayer(60, 42.4, Math.PI));
await wait(600);
s = await state();
check("Fischer Jonas offers the fishing side game", s.prompt?.includes("Angeln") ?? false, s.prompt ?? "no prompt");

const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => (++n, performance.now() - t0 < 2000 ? requestAnimationFrame(tick) : resolve((n * 1000) / (performance.now() - t0)));
      requestAnimationFrame(tick);
    }),
);
check("runs smoothly (≥ 50 fps)", fps >= 50, `${fps.toFixed(1)} fps`);

// ── 6b. The new cast ────────────────────────────────────────
const portraitData = await page.evaluate(async () => (await import("/src/ui/Snapshots.ts")).renderSnapshots().portraits);
const portraits = Object.keys(portraitData);
check("every new speaker has a portrait", ["maulwurf", "hueter", "villager3"].every((k) => portraits.includes(k)));
for (const k of ["villager3", "maulwurf", "hueter"]) {
  if (portraitData[k]) writeFileSync(`${OUT}portrait-${k}.png`, Buffer.from(portraitData[k].split(",")[1], "base64"));
}

// Each new speaker in the real dialogue box: an image portrait, or the emoji for the voice nobody sees yet
const faces = [
  ["Käpt'n Paco", "img", "Danke, Junge! Ich bin Käpt'n Paco."],
  ["Stimme", "🗣️", "Hilfe! Hilfe!"],
  ["Maulwurf", "img", "Ich habe Hunger! Bring mir einen Leuchtpilz, dann grabe ich dir den Weg frei."],
  ["Hüter", "img", "Ich bin der Hüter. Ich habe auf das Herz aufgepasst."],
];
for (const [i, [speaker, face, text]] of faces.entries()) {
  await page.evaluate(([speaker, text]) => void window.game.ui.say([{ speaker, portrait: "", text }]), [speaker, text]);
  await wait(500);
  await page.keyboard.press("Space");
  await wait(300);
  const shown = await page.evaluate(() => {
    const p = document.querySelector(".dialogue .portrait");
    return p.querySelector("img") ? "img" : p.textContent;
  });
  check(`${speaker} has a face`, shown === face && (await page.textContent(".dialogue .name")) === speaker, shown);
  await shot(`09-face-${i + 1}`);
  await finishDialogue();
}

const oneCaptain = await page.evaluate(async () => {
  const { createVillager } = await import("/src/characters/cast.ts");
  const hat = (i) => !!createVillager(i).root.getObjectByName("captain-hat");
  return { paco: hat(3), crowd: hat(7) };
});
check("createVillager(3) is Paco, and the crowd has no second Paco", oneCaptain.paco && !oneCaptain.crowd, JSON.stringify(oneCaptain));

// Paco next to the elder, in the village's real light: they share scenes and must look clearly different
const pacoY = await page.evaluate(() => window.game.npcs.get("villager3").position.y);
await page.goto(`${BASE}?cam=71.15,${pacoY + 1.5},45.9,71.15,${pacoY + 0.85},42`);
await wait(4000);
await page.evaluate(() => {
  const paco = window.game.npcs.get("villager3");
  const elder = window.game.npcs.get("elder");
  elder.position.set(paco.position.x - 1.7, paco.position.y, paco.position.z);
  elder.avatar.root.position.copy(elder.position);
  paco.homeFacing = elder.homeFacing = 0;
});
await wait(1200);
await shot("10-paco-and-elder");

// The mole in the real cave, by torchlight, next to Tadeo
await page.goto(`${BASE}?challenge=cave`);
await wait(6000);
for (let i = 0; i < 40 && (await page.evaluate(() => !!document.querySelector(".dialogue.open"))); i++) {
  await page.keyboard.press("Space");
  await wait(220);
}
const moleStart = await page
  .evaluate(async () => {
    const { createMole } = await import("/src/characters/Mole.ts");
    const cave = window.engine.scene;
    const p = cave.player.position;
    // Reason: the first open spot beside Tadeo, in front of the camera
    const spot = [[1.7, -0.9], [-1.7, -0.9], [1.7, 0.4], [-1.7, 0.4], [0, -2]]
      .map(([dx, dz]) => [p.x + dx, p.z + dz])
      .find(([x, z]) => cave.world.field.openAt(x, z) > 0.42);
    const mole = createMole();
    mole.root.position.set(spot[0], cave.world.field.heightAt(spot[0], spot[1]), spot[1]);
    mole.root.rotation.y = Math.atan2(p.x - spot[0], p.z - spot[1]);
    cave.scene.add(mole.root);
    let last = performance.now();
    const tick = (now) => {
      mole.update((now - last) / 1000);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.mole = mole;
    return { hungry: mole.hungry };
  })
  .catch((e) => ({ error: e.message }));
check("the mole starts hungry", moleStart.hungry === true, JSON.stringify(moleStart));
if (!moleStart.error) {
  await wait(1500);
  await shot("11-mole-hungry");
  await page.evaluate(() => void (window.moleDug = window.mole.dig()));
  await wait(1100);
  await shot("12-mole-digging");
  await page.evaluate(() => window.moleDug);
  check("the mole finishes digging and is no longer hungry", await page.evaluate(() => !window.mole.hungry));
  await wait(600);
  await shot("13-mole-fed");
}

// The Hüter over the lake: hidden, rises, stays see-through, fades away
await page.goto(`${BASE}?quest=4&cam=2,3.4,17,2,3.2,2`);
await wait(4000);
const hueterStart = await page
  .evaluate(async () => {
    const { createHueter } = await import("/src/characters/Hueter.ts");
    const { LANDMARKS, WATER_LEVEL } = await import("/src/world/layout.ts");
    const hueter = createHueter();
    hueter.root.position.set(LANDMARKS.lake[0], WATER_LEVEL, LANDMARKS.lake[1]);
    window.game.island.scene.add(hueter.root);
    const tick = (now) => {
      hueter.update(1 / 60, now / 1000);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.hueter = hueter;
    const mats = [];
    hueter.root.traverse((o) => o.material && mats.push(o.material));
    const additive = mats.filter((m) => m.blending === 2);
    return { hiddenFirst: !hueter.root.visible, seeThrough: mats.every((m) => m.transparent), additive: additive.length, foggy: additive.filter((m) => m.fog).length };
  })
  .catch((e) => ({ error: e.message }));
check("the Hüter is hidden until he rises", hueterStart.hiddenFirst === true, JSON.stringify(hueterStart));
check("every part of the Hüter is see-through", hueterStart.seeThrough === true);
check("his additive parts ignore fog", hueterStart.additive > 0 && hueterStart.foggy === 0);
if (!hueterStart.error) {
  await page.evaluate(() => void (window.hueterRisen = window.hueter.rise()));
  await wait(1300);
  await shot("14-hueter-rising");
  await page.evaluate(() => window.hueterRisen);
  check("the Hüter has risen", await page.evaluate(() => window.hueter.root.visible));
  await wait(800);
  await shot("15-hueter-lake");
  await page.evaluate(() => void (window.hueterGone = window.hueter.fade()));
  await wait(1300);
  await shot("16-hueter-fading");
  await page.evaluate(() => window.hueterGone);
  check("the Hüter fades away", await page.evaluate(() => !window.hueter.root.visible));
}

// ── 7. Quest 12 has no gate on the island yet: the game must still run (page errors are checked at the end)
await page.goto(`${BASE}?quest=12`);
await wait(4000);
s = await state();
check("a game at quest 12 is free and has no goal", s.milestone === 12 && !s.dialogue && !s.busy && s.prompt === null, JSON.stringify(s));

// ── 8. A save from an older version ─────────────────────────
// Seed a version 3 save plus three coins and a prize hat, then reload onto the title screen
await page.evaluate(() => {
  localStorage.setItem("schatzkarten_save", JSON.stringify({ version: 3, milestone: 6, items: ["sword"], playerX: 0, playerY: 0, timestamp: 1 }));
  localStorage.setItem("schatzkarten_coins", JSON.stringify([0, 1, 2]));
  localStorage.setItem("schatzkarten_prizes", JSON.stringify(["fishingHat"]));
  localStorage.setItem("schatzkarten_hat", JSON.stringify("fishingHat"));
});
await page.goto(BASE);
await wait(4000);
check("an old save offers no Continue", (await page.evaluate(() => window.game.title.choices)).join() === "new");
const keep = () => page.evaluate(() => ({ coins: window.game.coins.collected, hats: window.game.wardrobe.prizes.size }));
const kept = await keep();
check("coins and hats are loaded with an old save", kept.coins === 3 && kept.hats === 1, JSON.stringify(kept));
await page.keyboard.press("Space");
await wait(3000);
const startedOver = await keep();
check("starting over keeps coins and hats", startedOver.coins === 3 && startedOver.hats === 1, JSON.stringify(startedOver));

// ── 9. Mashing Space through the whole opening ──────────────
await page.evaluate(() => localStorage.clear());
await page.goto(BASE);
await wait(4000);
let mashing = true;
const masher = (async () => {
  while (mashing) {
    await page.keyboard.press("Space");
    await wait(90);
  }
})();
let seaSeen = 0;
const mashDone = await until(async () => {
  if (await hasObject("opening-sea")) seaSeen = seaSeen || Date.now();
  else if (seaSeen > 0 && seaSeen < 1e15) seaSeen = 1e15 + (Date.now() - seaSeen);
  return (await state()).free;
}, 120000, 50);
mashing = false;
await masher;
await wait(800);
s = await state();
const seaMs = seaSeen - 1e15;
check("mashing Space ends with the game free", mashDone);
check("mashing Space cannot skip the sea cinematic", seaMs > 5000 && seaMs < 12000, `${seaMs} ms`);
check("after mashing: quest 2, nothing open", s.milestone === 2 && s.free && !(await mapCardOpen()), JSON.stringify(s));
check("after mashing: Tadeo and Chuleta are at the landing pier", Math.hypot(s.x + 66, s.z - 47) < 3 && (await chuletaVisible()), JSON.stringify(s));
const mashed = await story();
check("after mashing: wreck on the sand, no boat at the pier", mashed.wreck && !mashed.pierBoat);
check("after mashing: nothing of the opening is left", !(await hasObject("opening-sea")) && !(await hasObject("opening-beach")));
check("after mashing: the camera is back with Tadeo", await page.evaluate(() => {
  const g = window.game;
  return g.cinematic === null && g.island.camera.position.distanceTo(g.island.player.position) < 25;
}));
await shot("20-after-mashing");
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
const passed = results.every((r) => r.ok);
writeFileSync(`${OUT}summary.json`, JSON.stringify({ passed, when: new Date().toISOString(), results, errors }, null, 2));
console.log(passed ? "\nPASS" : "\nFAIL", `→ ${OUT}summary.json`);
process.exit(passed ? 0 : 1);
