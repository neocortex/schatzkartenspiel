/**
 * E2E: play the treasure finale (quest 10) from start to finish with real key
 * presses — steer Tadeo to the X with the arrow keys, dig with Space, smash
 * the ice (two hits timed into the golden zone, the rest plain mashing), turn
 * the key, click through the dialogues — and verify the end card appears
 * over the still-running celebration without page errors.
 *
 * Live state (Tadeo's position, the X, the hammer meter) is read from
 * `window.engine.scene.state`; every action is a real keyboard press.
 *
 * Usage: node scripts/e2e/treasure.mjs [baseUrl]
 * Output: scripts/e2e/out/treasure/{*.png, summary.json, console.log}
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = "scripts/e2e/out/treasure";
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
await page.goto(`${BASE}/?challenge=treasure`);

let reloads = 0;
page.on("framenavigated", (f) => {
  if (f === page.mainFrame() && Date.now() - started > 3000) reloads++;
});

const read = () =>
  page
    .evaluate(() => {
      const s = window.engine?.scene?.state;
      const end = document.querySelector(".endcard");
      return {
        phase: s?.phase ?? null,
        x: s?.tadeo.x ?? 0,
        z: s?.tadeo.z ?? 0,
        tx: s?.target.x ?? 0,
        tz: s?.target.z ?? 0,
        digs: s?.digs ?? 0,
        ice: s?.ice ?? 1,
        hits: s?.hits ?? 0,
        perfectHits: s?.perfectHits ?? 0,
        meter: s?.meter ?? 0,
        zone: s?.zone ?? [0, 0],
        turns: s?.turns ?? 0,
        dialogue: !!document.querySelector(".dialogue.open"),
        endcard: !!end && end.classList.contains("show") && getComputedStyle(end).display !== "none",
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
const walk = { presses: 0, arrowUpMovesAway: null };
let digPresses = 0;
let hammerPresses = 0;
let timedPresses = 0;
let keyPresses = 0;
let dialogueCount = 0;
let inDialogue = false;
const dialoguesPerPhase = {};
let endcard = false;
let lastKeyTurn = -1;

/** Hold an arrow key for a moment and report how Tadeo moved. */
async function step(key, ms) {
  const before = await read();
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  walk.presses++;
  const after = await read();
  if (key === "ArrowUp" && before && after && walk.arrowUpMovesAway === null && before.phase === "walk") {
    walk.arrowUpMovesAway = after.z < before.z - 0.05;
  }
}

while (Date.now() - started < TIMEOUT_MS) {
  const st = await read();
  if (!st) {
    await page.waitForTimeout(500);
    continue;
  }
  if (st.endcard) {
    endcard = true;
    break;
  }
  if (st.phase) phasesSeen.add(st.phase);
  if (st.dialogue) {
    if (!inDialogue) {
      // A new conversation started: one screenshot of its first line
      inDialogue = true;
      dialogueCount++;
      dialoguesPerPhase[st.phase] = (dialoguesPerPhase[st.phase] ?? 0) + 1;
      await shotOnce(`dlg-${st.phase}-${dialoguesPerPhase[st.phase]}`, 700);
    }
    await page.keyboard.press("Space");
    await page.waitForTimeout(280);
    continue;
  }
  inDialogue = false;
  switch (st.phase) {
    case "arrive":
      await shotOnce("00-establishing", 1200);
      break;
    case "walk": {
      await shotOnce("01-walk", 400);
      const dx = st.tx - st.x;
      const dz = st.tz - st.z;
      // First move straight up (away from the camera) to verify the controls, then head for the X
      if (walk.arrowUpMovesAway === null) await step("ArrowUp", 260);
      else if (Math.abs(dz) > Math.abs(dx)) await step(dz < 0 ? "ArrowUp" : "ArrowDown", 180);
      else await step(dx < 0 ? "ArrowLeft" : "ArrowRight", 180);
      if (walk.presses === 4) await shotOnce("02-walking");
      break;
    }
    case "dig":
      if (st.digs === 5) await shotOnce("03-dig");
      await page.keyboard.press("Space");
      digPresses++;
      await page.waitForTimeout(170);
      break;
    case "reveal":
      await shotOnce("04-reveal", 700);
      break;
    case "hammer": {
      // Two hits timed into the golden zone, the rest plain mashing
      if (timedPresses < 2) {
        if (st.meter < st.zone[0] + 0.03 || st.meter > st.zone[1] - 0.03) {
          await page.waitForTimeout(15);
          continue;
        }
        timedPresses++;
      }
      await page.keyboard.press("Space");
      hammerPresses++;
      if (hammerPresses === 2) await shotOnce("05-hammer", 120);
      await page.waitForTimeout(timedPresses <= 2 && hammerPresses <= 2 ? 500 : 190);
      break;
    }
    case "key":
      if (st.turns !== lastKeyTurn) {
        lastKeyTurn = st.turns;
        if (st.turns === 1) await shotOnce("06-key", 300);
        await page.waitForTimeout(450);
        await page.keyboard.press("Space");
        keyPresses++;
      }
      await page.waitForTimeout(120);
      break;
    case "open":
      await shotOnce("07-open", 1500);
      break;
    case "victory":
      await shotOnce("08-victory", 400);
      break;
    default:
      break;
  }
  await page.waitForTimeout(60);
}

if (endcard) {
  // The celebration keeps running under the end card (do NOT press Space: it restarts the game)
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/09-endcard.png` });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/10-endcard-party.png` });
}
const final = await read();

const summary = {
  test: "treasure",
  passed: endcard && errors.length === 0 && walk.arrowUpMovesAway === true && (final?.perfectHits ?? 0) >= 1,
  endcardVisible: endcard,
  arrowUpMovesAway: walk.arrowUpMovesAway,
  walkKeyPresses: walk.presses,
  digPresses,
  hammer: { presses: hammerPresses, hits: final?.hits, perfectHits: final?.perfectHits, timedPresses },
  keyPresses,
  dialogues: dialogueCount,
  phasesSeen: [...phasesSeen],
  durationSec: Math.round((Date.now() - started) / 1000),
  devServerReloads: reloads,
  errors,
  screenshots: [...shots].map((s) => `${OUT}/${s}.png`).concat(endcard ? [`${OUT}/09-endcard.png`, `${OUT}/10-endcard-party.png`] : []),
};
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
writeFileSync(`${OUT}/console.log`, logs.join("\n"));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
process.exit(summary.passed ? 0 : 1);
