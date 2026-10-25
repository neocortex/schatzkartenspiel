/**
 * E2E: play the fishing side game ("Angeln mit Fischer Jonas") from start to
 * finish with real key presses: aim with the arrow keys, cast with Space and
 * pull with Space when the float goes under. The first bite is missed on
 * purpose to prove a miss only means "try again". Verifies all five catches,
 * the message bottle, the golden fish, the saved record, and the return to
 * the island with the game free again.
 *
 * The live state (phase, catches) is read from `window.engine.scene.state`;
 * every action is a real keyboard press.
 *
 * Usage: node scripts/e2e/fishing.mjs [baseUrl]
 * Output: scripts/e2e/out/fishing/{*.png, summary.json, console.log}
 */

import { chromium } from "playwright";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = "scripts/e2e/out/fishing";
const TIMEOUT_MS = 300_000;
mkdirSync(OUT, { recursive: true });
// Reason: catch screenshots are named after the (random) fish, so clear the last run's set
for (const f of readdirSync(OUT)) if (f.endsWith(".png")) rmSync(`${OUT}/${f}`);

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

// Reason: start from a clean record so the saved best size is this run's biggest fish
await page.addInitScript(() => {
  if (!sessionStorage.getItem("fishing-e2e")) {
    localStorage.removeItem("schatzkarten_fishing_best");
    sessionStorage.setItem("fishing-e2e", "1");
  }
});

const started = Date.now();
await page.goto(`${BASE}/?challenge=fishing`);

let reloads = 0;
let missedOnPurpose = false;
let aimedForCast = -1;
let biteSeenAt = 0;
page.on("framenavigated", (f) => {
  if (f !== page.mainFrame() || Date.now() - started < 3000) return;
  // Reason: a dev-server reload restarts the game, so the deliberate miss has to happen again
  reloads++;
  missedOnPurpose = false;
  aimedForCast = -1;
  biteSeenAt = 0;
});

const read = () =>
  page
    .evaluate(() => {
      const scene = window.engine?.scene;
      const s = scene?.state;
      return {
        onIsland: !!scene && "island" in scene,
        phase: s?.phase ?? null,
        caught: s?.caught ?? 0,
        kinds: s?.kinds ?? [],
        aim: s?.aim ?? [0, 0],
        casts: s?.casts ?? 0,
        bites: s?.bites ?? 0,
        misses: s?.misses ?? 0,
        biter: s?.biter ?? null,
        bottleDone: !!s?.bottleDone,
        goldenArrived: !!s?.goldenArrived,
        biggest: s?.biggest ?? 0,
        dialogue: !!document.querySelector(".dialogue.open"),
        dialogueText: document.querySelector(".dialogue.open .text")?.textContent ?? "",
        pill: document.querySelector(".status")?.textContent ?? "",
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

/** Frames per second over two seconds of real play (requestAnimationFrame count). */
const measureFps = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
          else resolve(Math.round((frames * 1000) / (performance.now() - t0)));
        };
        requestAnimationFrame(tick);
      }),
  );
let fpsWhileAiming = null;
const phasesSeen = new Set();
const aimChecks = [];
const strikes = [];
let lastState = null;
let result = null;
// Reason: alternate aim directions so the casts land all over the lagoon
const AIMS = [
  ["ArrowLeft", 350],
  ["ArrowUp", 400],
  ["ArrowRight", 600],
  ["ArrowDown", 300],
  ["ArrowLeft", 500],
  ["ArrowUp", 250],
];

while (Date.now() - started < TIMEOUT_MS) {
  const st = await read();
  if (!st) {
    await page.waitForTimeout(400);
    continue;
  }
  if (st.onIsland) {
    result = st;
    break;
  }
  lastState = st;
  if (st.phase) phasesSeen.add(st.phase);
  if (st.dialogue) {
    if (st.phase === "intro") await shotOnce("01-intro-dialogue", 900);
    if (st.phase === "show" && st.dialogueText.includes("Flaschenpost")) await shotOnce("07-bottle-dialogue", 700);
    if (st.phase === "ending") await shotOnce(`10-ending-${st.dialogueText.includes("Tschüss") ? "farewell" : "praise"}`, 700);
    await page.keyboard.press("Space");
    await page.waitForTimeout(260);
    continue;
  }
  switch (st.phase) {
    case "intro":
      await shotOnce("00-opening", 1600);
      break;
    case "aim": {
      if (aimedForCast === st.casts) break;
      aimedForCast = st.casts;
      if (st.casts === 0) {
        await shotOnce("02-aim", 2200);
        fpsWhileAiming = await measureFps();
      }
      const [key, ms] = AIMS[st.casts % AIMS.length];
      const before = st.aim;
      await page.keyboard.down(key);
      await page.waitForTimeout(ms);
      await page.keyboard.up(key);
      const after = (await read())?.aim ?? before;
      aimChecks.push({ key, moved: Math.hypot(after[0] - before[0], after[1] - before[1]) > 0.3 });
      await page.keyboard.press("Space");
      await page.waitForTimeout(300);
      if (st.casts === 0) await shotOnce("03-cast", 0);
      break;
    }
    case "nibble":
      await shotOnce("04-nibble", 200);
      break;
    case "bite": {
      // The very first bite is missed on purpose: Jonas cheers Tadeo up and he simply casts again
      if (!missedOnPurpose) {
        await shotOnce("05-bite", 100);
        await page.waitForFunction(() => window.engine?.scene?.state?.phase !== "bite", null, { polling: 50, timeout: 10_000 });
        missedOnPurpose = true;
        await shotOnce("05-miss", 700);
        break;
      }
      if (biteSeenAt === st.bites) break;
      biteSeenAt = st.bites;
      await page.keyboard.press("Space");
      strikes.push({ bite: st.bites, biter: st.biter ?? "bottle" });
      break;
    }
    case "reel":
      if (st.biter) await shotOnce(`06-leap-${st.caught + 1}`, 350);
      break;
    case "show":
      if (!st.biter) await shotOnce("07-bottle", 600);
      else await shotOnce(st.biter === "gold" ? "09-golden-fish" : `08-catch-${st.caught + 1}-${st.biter}`, 600);
      break;
    case "ending":
      await shotOnce("10-finale", 2300);
      break;
    default:
      break;
  }
  await page.waitForTimeout(60);
}

let busyAfter = null;
if (result) {
  await page.waitForFunction(() => !window.engine.isSwitching, null, { timeout: 10_000 });
  await page.waitForFunction(() => window.game?.busy === false, null, { timeout: 15_000 }).catch(() => {});
  busyAfter = await page.evaluate(() => window.game?.busy);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/11-back-on-island.png` });
}
const best = await page.evaluate(() => Number(localStorage.getItem("schatzkarten_fishing_best") ?? 0));
const final = lastState ?? {};

const summary = {
  test: "fishing",
  passed:
    !!result &&
    busyAfter === false &&
    errors.length === 0 &&
    final.misses >= 1 &&
    final.caught === 5 &&
    final.bottleDone &&
    (final.kinds ?? []).includes("gold") &&
    best > 0 &&
    aimChecks.every((a) => a.moved),
  backOnIsland: !!result,
  gameBusyAfterReturn: busyAfter,
  caught: final.caught,
  kinds: final.kinds,
  bottleFound: final.bottleDone,
  goldenFishCaught: (final.kinds ?? []).includes("gold"),
  casts: final.casts,
  bites: final.bites,
  misses: final.misses,
  deliberateMissThenCaughtAgain: final.misses >= 1 && final.caught === 5,
  aimKeysMovedMarker: aimChecks,
  strikes,
  savedBestCm: best,
  fpsWhileAiming,
  phasesSeen: [...phasesSeen],
  durationSec: Math.round((Date.now() - started) / 1000),
  devServerReloads: reloads,
  errors,
  screenshots: [...shots, ...(result ? ["11-back-on-island"] : [])].map((s) => `${OUT}/${s}.png`),
};
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
writeFileSync(`${OUT}/console.log`, logs.join("\n"));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
process.exit(summary.passed ? 0 : 1);
