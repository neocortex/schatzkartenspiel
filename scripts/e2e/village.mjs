/**
 * E2E: play quest 7 from start to finish with real key presses. Tadeo asks the
 * elder on the island for the key and hears where it came from, plays the village
 * challenge — including one wrong drum beat and one wrong maths answer to
 * prove that mistakes only lead to a fresh attempt — and is back on the island
 * with the golden key, where the elder sends him on to the ogre for the boulder.
 *
 * The live trial state (drum pattern, correct answer) is read from
 * `window.engine.scene.state`; every action is a real keyboard press.
 *
 * Usage: node scripts/e2e/village.mjs [baseUrl]
 * Output: scripts/e2e/out/village/{*.png, summary.json}
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = "scripts/e2e/out/village";
const TIMEOUT_MS = 240_000;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
const logs = [];
const checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  logs.push(`[${m.type()}] ${m.text()}`);
});

const started = Date.now();
const check = (name, ok, detail = "") => {
  checks.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== "" ? ` (${detail})` : ""}`);
};
await page.goto(`${BASE}/?quest=7`);
await page.waitForFunction(() => window.game?.story && window.engine?.scene === window.game.island, null, { timeout: 30000 });

let reloads = 0;
page.on("framenavigated", (f) => {
  if (f === page.mainFrame() && Date.now() - started > 3000) reloads++;
});

const read = () =>
  page.evaluate(() => {
    const scene = window.engine?.scene;
    const s = scene?.state;
    return {
      onIsland: !!scene && "island" in scene,
      milestone: window.game.quest.currentMilestone,
      phase: s?.phase ?? null,
      trial: s?.trial ?? 0,
      sequence: s?.sequence ?? [],
      progress: s?.progress ?? 0,
      correct: s?.correct ?? -1,
      selected: s?.selected ?? 1,
      dialogue: !!document.querySelector(".dialogue.open"),
      itemGet: !!document.querySelector(".item-get.show"),
    };
  })
  // Reason: other developers' edits make the Vite dev server reload the page; just keep playing
  .catch(() => null);

const shots = new Set();
async function shotOnce(name, delay = 0) {
  if (shots.has(name)) return;
  shots.add(name);
  if (delay) await page.waitForTimeout(delay);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

/** Notes every dialogue line and every bubble read aloud, so a short line is never missed. */
async function recordLines() {
  await page.evaluate(async () => {
    window.said = [];
    const box = Object.getPrototypeOf(window.game.ui.dialogue);
    const begin = box.showLine;
    box.showLine = function () {
      begin.call(this);
      window.said.push(`${this.script[this.index].speaker}: ${this.script[this.index].text}`);
    };
    const { NarrationManager } = await import("/src/systems/NarrationManager.ts");
    const narration = NarrationManager.getInstance();
    const speak = narration.speakLine.bind(narration);
    narration.speakLine = (text, speaker) => {
      if (!window.said.at(-1)?.endsWith(text)) window.said.push(`${speaker}: ${text}`);
      return speak(text, speaker);
    };
  });
}
const said = () => page.evaluate(() => window.said ?? []);

// The elder first: Tadeo asks him for the key on the island, and the challenge starts when the talk ends
await recordLines();
await page.evaluate(() => window.game.placePlayer(65, 39.5));
await page.waitForTimeout(500);
const prompt = await page.evaluate(() => document.querySelector(".prompt")?.textContent.trim() ?? "");
check("the elder offers a talk before the trials", prompt.includes("Sprechen"), prompt);
await page.keyboard.press("Space");

const phasesSeen = new Set();
const mistakes = { drum: false, math: false };
let lastKey = "";
let result = null;
let entered = false;

while (Date.now() - started < TIMEOUT_MS) {
  const st = await read();
  if (!st) {
    await page.waitForTimeout(500);
    continue;
  }
  if (st.phase) {
    phasesSeen.add(st.phase);
    entered = true;
  }
  // Back on the island, the elder talks again before the next quest starts
  if (st.onIsland && entered && st.milestone >= 8 && !st.dialogue) {
    result = st;
    break;
  }
  if (st.onIsland && entered && st.dialogue) await shotOnce("07b-elder-sends-on", 900);
  if (st.itemGet) {
    await shotOnce("06-key-item-get", 600);
    await page.waitForTimeout(300);
    continue;
  }
  if (st.dialogue) {
    if (!entered) await shotOnce("00a-the-key-came-at-night", 900);
    if (st.phase === "intro") await shotOnce("01-welcome", 900);
    if (st.phase === "reward") await shotOnce("05-key-dialogue", 600);
    await page.keyboard.press("Space");
    await page.waitForTimeout(260);
    continue;
  }
  switch (st.phase) {
    case "intro":
      await shotOnce("00-establishing", 2500);
      break;
    case "practice":
      await shotOnce("02-practice", 400);
      for (const k of ["ArrowUp", "ArrowLeft", "ArrowRight", "ArrowDown"]) {
        await page.keyboard.press(k);
        await page.waitForTimeout(380);
      }
      break;
    case "show":
      await shotOnce(`03-show-trial${st.trial}`, 1300);
      break;
    case "input": {
      // Pattern complete — the celebration is about to start
      if (st.progress >= st.sequence.length) break;
      // One deliberate wrong beat in the first trial: the sage must simply show the pattern again
      if (st.trial === 1 && !mistakes.drum) {
        mistakes.drum = true;
        const wrong = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].find((k) => k !== st.sequence[st.progress]);
        await page.keyboard.press(wrong);
        await page.waitForTimeout(500);
        break;
      }
      const key = st.sequence[st.progress];
      const marker = `${st.trial}:${st.progress}`;
      if (marker === lastKey) {
        await page.waitForTimeout(120);
        break;
      }
      lastKey = marker;
      await page.keyboard.press(key);
      if (st.progress === 1) await shotOnce(`04-input-trial${st.trial}`, 120);
      await page.waitForTimeout(420);
      if (st.progress + 1 >= st.sequence.length) lastKey = "";
      break;
    }
    case "math": {
      await shotOnce("05-math", 500);
      // First answer wrong on purpose (a new question follows), then the right one
      const target = mistakes.math ? st.correct : [0, 1, 2].find((i) => i !== st.correct);
      if (st.selected !== target) {
        await page.keyboard.press(st.selected < target ? "ArrowRight" : "ArrowLeft");
        await page.waitForTimeout(300);
        break;
      }
      mistakes.math = true;
      await page.keyboard.press("Space");
      await page.waitForTimeout(700);
      break;
    }
    case "reward":
      await shotOnce("05-key-flight", 1800);
      break;
    case "done":
      await shotOnce("07-finale", 300);
      break;
    default:
      break;
  }
  await page.waitForTimeout(150);
}

let hasKeyInHud = false;
if (result) {
  await page.waitForFunction(() => !window.engine.isSwitching, null, { timeout: 10_000 });
  hasKeyInHud = await page.evaluate(() => !!document.querySelector('.hud-items .slot[data-item="key"]:not(.empty)'));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/08-back-on-island.png` });
}
const inventory = await page.evaluate(() => JSON.parse(localStorage.getItem("schatzkarten_save") ?? "null"));

// ── What was said ─────────────────────────────────────────────

const lines = await said();
// Reason: "Gack!" is Chuleta's cluck, not a sentence
const sentences = (l) => (l.replace(/\bGack!?/g, "").match(/[.!?]+(\s|$)/g) ?? []).length;
const words = (l) => l.split(": ").slice(1).join(": ").split(/\s+/).length;
check("elder explains the key before the trials", lines.some((l) => l.includes("eines Morgens vor meiner Tür")));
check("the note says the key is for someone clever", lines.some((l) => l.includes("Nur für jemanden, der klug ist")));
check("the welcome at the fire says what the test is for", lines.some((l) => l.startsWith("Dorfältester: Willkommen am Feuerkreis") && l.includes("klug")));
check("after the trials he sends Tadeo to the ogre", lines.some((l) => l.includes("Riesenfels")) && lines.some((l) => l.includes("Nur der Oger ist stark genug")));
check("Chuleta wants her berries for the monster", lines.some((l) => l.startsWith("Chuleta: ") && l.includes("Die Beeren")));
// Reason: the trials' own lines stay as they were, so only what the story added around them is measured
const added = await page.evaluate(async () => {
  const { DIALOGUES } = await import("/src/data/dialogues.ts");
  return [...DIALOGUES.village_enter, ...DIALOGUES.village_after].map((l) => `${l.speaker}: ${l.text}`);
});
const welcome = lines.filter((l) => l.startsWith("Dorfältester: Willkommen am Feuerkreis"));
check("the elder's talks were all heard in this run", added.length >= 6 && added.every((l) => lines.includes(l)), added.filter((l) => !lines.includes(l)).join(" | "));
check("every added line is one or two short sentences", [...added, ...welcome].every((l) => words(l) <= 14 && sentences(l) <= 2), [...added, ...welcome].filter((l) => words(l) > 14 || sentences(l) > 2).join(" | "));
check("nobody says the forbidden words", !/\b(die Alten|Altar|ewiges Eis|besänftigen)/.test(lines.join("\n")));

const summary = {
  test: "village",
  passed: !!result && hasKeyInHud && errors.length === 0 && mistakes.drum && mistakes.math && checks.every((c) => c.ok),
  backOnIsland: !!result,
  keyInInventory: hasKeyInHud,
  mistakesRecoveredFrom: mistakes,
  phasesSeen: [...phasesSeen],
  checks,
  durationSec: Math.round((Date.now() - started) / 1000),
  devServerReloads: reloads,
  errors,
  save: inventory,
  screenshots: [...shots].map((s) => `${OUT}/${s}.png`),
};
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
writeFileSync(`${OUT}/console.log`, logs.join("\n"));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
process.exit(summary.passed ? 0 : 1);
