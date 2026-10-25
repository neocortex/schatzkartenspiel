/**
 * E2E: play the village challenge (quest 7) from start to finish with real
 * key presses — including one wrong drum beat and one wrong maths answer to
 * prove that mistakes only lead to a fresh attempt — and verify the game
 * returns to the island with the golden key in the inventory.
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
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  logs.push(`[${m.type()}] ${m.text()}`);
});

const started = Date.now();
await page.goto(`${BASE}/?challenge=village`);

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

const phasesSeen = new Set();
const mistakes = { drum: false, math: false };
let lastKey = "";
let result = null;

while (Date.now() - started < TIMEOUT_MS) {
  const st = await read();
  if (!st) {
    await page.waitForTimeout(500);
    continue;
  }
  if (st.onIsland) {
    result = st;
    break;
  }
  if (st.phase) phasesSeen.add(st.phase);
  if (st.itemGet) {
    await shotOnce("06-key-item-get", 600);
    await page.waitForTimeout(300);
    continue;
  }
  if (st.dialogue) {
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

const summary = {
  test: "village",
  passed: !!result && hasKeyInHud && errors.length === 0 && mistakes.drum && mistakes.math,
  backOnIsland: !!result,
  keyInInventory: hasKeyInHud,
  mistakesRecoveredFrom: mistakes,
  phasesSeen: [...phasesSeen],
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
