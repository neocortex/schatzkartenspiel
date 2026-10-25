/**
 * E2E proof for the sea challenge (quest 9).
 *
 * Opens `?challenge=sea`, advances dialogues with Space and plays the whole
 * crossing with real key presses: it reads the live state
 * (`window.engine.scene.e2e`) only to decide which arrow key to hold (towards
 * the star trail's next safe x) and when the shark's timing ring is green.
 * On the first leap it presses Space too early on purpose (gentle whiff) and
 * then waits for the green ring. Passes when the challenge finishes and the
 * game moves on to the treasure island, with no page errors.
 *
 * Run:  node scripts/e2e/sea.mjs [baseUrl]
 * Out:  scripts/e2e/out/sea/*.png + summary.json
 */

import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "out", "sea");
// Start from an empty folder so every screenshot belongs to this run
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
// Reason: other edits to the dev server's files would trigger a Vite full reload mid-run;
// a silent mock of the HMR websocket keeps this test's page stable
await page.routeWebSocket(/.*/, () => {});
const errors = [];
const steps = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const t0 = Date.now();
const log = (msg) => {
  const line = `[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`;
  steps.push(line);
  console.log(line);
};
const sleep = (ms) => page.waitForTimeout(ms);
const state = () => page.evaluate(() => window.engine?.scene?.e2e ?? null).catch(() => null);
const dialogueOpen = () => page.evaluate(() => !!document.querySelector(".dialogue.open"));
const shot = async (name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  log(`screenshot ${name}.png`);
};

async function waitFor(fn, what, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(100);
  }
  throw new Error(`timeout waiting for ${what}`);
}

async function skipDialogues(shotName = null) {
  let first = true;
  while (await dialogueOpen()) {
    if (first && shotName) await shot(shotName);
    first = false;
    await page.keyboard.press("Space");
    await sleep(260);
  }
}

const held = new Set();
async function hold(keys) {
  for (const k of held) if (!keys.has(k)) await page.keyboard.up(k);
  for (const k of keys) if (!held.has(k)) await page.keyboard.down(k);
  held.clear();
  for (const k of keys) held.add(k);
}

// ── Play ──────────────────────────────────────────────────────

let passed = false;
let fps = 0;
let stars = 0;
let whiffs = 0;
let finished = false;
try {
  await page.goto(`${BASE}/?challenge=sea`);
  await waitFor(async () => (await state())?.challenge === "sea", "sea scene", 20000);
  log("sea loaded");
  await sleep(1400);
  await shot("01_pier_home_island");
  await waitFor(dialogueOpen, "sea_crossing dialogue", 15000);
  await sleep(600);
  await skipDialogues("02_sea_crossing");
  await waitFor(async () => (await state()).phase === "sail", "sailing", 10000);
  await sleep(1500);
  await shot("03_setting_sail");
  fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - start < 2000) requestAnimationFrame(tick);
          else resolve((frames * 1000) / (performance.now() - start));
        };
        requestAnimationFrame(tick);
      }),
  );
  log(`fps ${fps.toFixed(1)}`);

  // Steer along the star trail with the arrow keys
  const shotsAt = { 100: "04_first_wave", 190: "05_sea_stacks", 300: "06_halfway" };
  let s = await state();
  const sailEnd = Date.now() + 150000;
  while (s.phase === "sail") {
    if (Date.now() > sailEnd) throw new Error("course not finished within 150 s");
    const dx = s.safe - s.x;
    await hold(new Set(Math.abs(dx) < 0.5 ? [] : [dx > 0 ? "ArrowRight" : "ArrowLeft"]));
    for (const [z, name] of Object.entries(shotsAt)) {
      if (-s.z > Number(z)) {
        delete shotsAt[z];
        await shot(name);
      }
    }
    await sleep(50);
    s = await state();
  }
  await hold(new Set());
  stars = s.stars;
  log(`course done with ${stars} stars`);

  // The shark
  await waitFor(dialogueOpen, "sea_shark dialogue", 20000);
  await sleep(500);
  await skipDialogues("07_shark_fin");
  await waitFor(async () => (await state()).leaping, "first leap", 30000);
  await sleep(150);
  await page.keyboard.press("Space");
  whiffs++;
  log("pressed Space too early on purpose");
  await sleep(250);
  await shot("08_too_early");
  let shotRing = false;
  const sharkEnd = Date.now() + 120000;
  while (true) {
    if (Date.now() > sharkEnd) throw new Error("shark not beaten within 120 s");
    s = await state();
    if (!s || s.phase !== "shark") break;
    if (s.bonks >= 3 && !s.leaping) break;
    if (s.leaping && s.ringNow) {
      if (!shotRing) {
        await shot("09_green_ring");
        shotRing = true;
      }
      await sleep(120);
      await page.keyboard.press("Space");
      log(`bonk attempt (bonks so far ${s.bonks})`);
      await sleep(250);
      if (s.bonks === 0) await shot("10_bonk");
      await waitFor(async () => !(await state()).leaping, "leap over", 8000);
      continue;
    }
    await sleep(40);
  }
  s = await state();
  log(`shark bonked ${s.bonks} times`);
  if (s.bonks < 3) throw new Error("shark was not bonked three times");
  await sleep(2500);
  await shot("11_shark_waves_goodbye");
  await waitFor(dialogueOpen, "shark_defeat dialogue", 20000);
  await skipDialogues();
  await waitFor(async () => (await state())?.phase === "arrive", "arrival", 10000);
  await sleep(4000);
  await shot("12_treasure_island_ahead");
  await waitFor(dialogueOpen, "X dialogue", 40000);
  await sleep(600);
  await skipDialogues("13_beach_x");
  await sleep(500);
  await shot("14_geschafft");
  await waitFor(async () => (await state())?.phase === "done" || (await state())?.challenge !== "sea", "finished", 20000);
  finished = true;
  log("sea challenge finished");
  // Game flow continues with the treasure challenge
  await waitFor(async () => (await state())?.challenge !== "sea", "next challenge", 20000);
  await sleep(1500);
  await shot("15_next_challenge");
  log(`next scene: ${await page.evaluate(() => window.engine.scene?.constructor?.name)}`);
  passed = errors.length === 0;
} catch (e) {
  log(`FAILED: ${e.message}`);
  await shot("fail").catch(() => {});
} finally {
  await hold(new Set()).catch(() => {});
}

const summary = {
  challenge: "sea",
  passed,
  finished,
  seconds: (Date.now() - t0) / 1000,
  fps: Math.round(fps * 10) / 10,
  stars,
  whiffs,
  errors,
  steps,
  command: "node scripts/e2e/sea.mjs",
};
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(passed ? "PASS" : "FAIL", `(${summary.seconds.toFixed(1)}s, errors: ${errors.length})`);
await browser.close();
process.exit(passed ? 0 : 1);
