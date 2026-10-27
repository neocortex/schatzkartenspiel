/**
 * E2E proof for the ogre challenge (quest 6).
 *
 * Opens `?challenge=ogre`, advances dialogues with Space and fights the whole
 * battle with real key presses on the card menu (← → to pick, Space to go).
 * It reads the live state (`window.engine.scene.phase / rules / menu /
 * blocker`) only to decide what to press: try the locked special once
 * (gentle hint), heal once after taking damage, use the special when charged,
 * otherwise attack. During the ogre's swings it presses Space when the shield
 * ring turns green. On the first swing it presses too early once ("Zu früh!")
 * and then lets the swing hit on purpose; every later swing is blocked,
 * including the big slam (BOING). Passes when the game is back on the island
 * with no page errors.
 *
 * Run:  node scripts/e2e/ogre.mjs [baseUrl]
 * Out:  scripts/e2e/out/ogre/*.png + summary.json
 */

import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "out", "ogre");
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
const state = () =>
  page.evaluate(() => {
    const s = window.engine?.scene;
    if (!s) return null;
    if ("island" in s) return { onIsland: true };
    if (!("rules" in s)) return null;
    return {
      onIsland: false,
      phase: s.phase,
      heroHp: s.rules.heroHp,
      ogreHp: s.rules.ogreHp,
      charge: s.rules.charge,
      specialReady: s.rules.specialReady,
      next: s.rules.nextOgreMove,
      choosing: s.menu.isChoosing,
      highlighted: s.menu.highlighted,
      ring: !!document.querySelector(".og-block.show"),
      blockNow: s.blocker.now,
      dialogue: !!document.querySelector(".dialogue.open"),
    };
  });
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

/** Press Space until no dialogue is open (each press completes or advances a line). */
async function skipDialogues(shotName = null) {
  let first = true;
  while (await dialogueOpen()) {
    await page.keyboard.press("Space");
    await sleep(260);
    if (first && shotName) await shot(shotName);
    first = false;
  }
}

const ORDER = ["attack", "heal", "special"];

/** Walk the highlight to `action` with arrow keys and press Space. */
async function pick(action) {
  for (let i = 0; i < 6; i++) {
    const s = await state();
    if (s.highlighted === action) break;
    const d = (ORDER.indexOf(action) - ORDER.indexOf(s.highlighted) + ORDER.length) % ORDER.length;
    await page.keyboard.press(d === 1 ? "ArrowRight" : "ArrowLeft");
    await sleep(160);
  }
  if ((await state()).highlighted !== action) throw new Error(`could not highlight ${action}`);
  await page.keyboard.press("Space");
}

// ── Play ──────────────────────────────────────────────────────

let passed = false;
let fps = 0;
const used = { attack: 0, heal: 0, special: 0 };
const swings = { seen: 0, blocked: 0, missed: 0, boing: false, early: false };
let turns = 0;
let lockedHint = false;
const taken = new Set();

/** One ogre swing: the shield ring is up. Block it (or not), then wait until it's gone. */
async function handleSwing() {
  swings.seen++;
  const n = swings.seen;
  // Reason: read before the swing lands — the rules only move on to the next move at impact
  const slam = await page.evaluate(() => window.engine.scene.rules.nextOgreMove === "slam");
  log(`swing ${n} (${slam ? "slam" : "swipe"}): ring up`);
  if (n === 1) {
    await sleep(120);
    await shot("07_shield_ring");
    // Edge case: pressing before the ring turns green only shows "Zu früh!"
    await page.keyboard.press("Space");
    await waitFor(() => page.evaluate(() => document.body.innerText.includes("Zu früh")), "too-early hint", 3000);
    swings.early = true;
    log("too early → hint, try again");
  }
  if (n === 1) {
    // Failure case: no proper press — Tadeo gets hit, nothing else happens
    swings.missed++;
    log("swing 1: no second press (takes the hit)");
  } else {
    await waitFor(async () => (await state())?.blockNow, "green window", 5000);
    await sleep(80);
    if (swings.blocked === 0) await shot("08_ring_green");
    await page.keyboard.press("Space");
    swings.blocked++;
  }
  await waitFor(async () => !(await state())?.ring, "ring gone", 6000);
  if (slam) {
    const boing = await page.evaluate(() => document.body.innerText.includes("BOING"));
    if (boing && !swings.boing) {
      swings.boing = true;
      await sleep(80);
      await shot("09_slam_boing");
    }
  }
}
try {
  await page.goto(`${BASE}/?challenge=ogre`);
  await waitFor(async () => (await state())?.phase === "intro", "ogre scene", 20000);
  log("ogre gorge loaded");
  await sleep(2600);
  await shot("01_flyover_waterfall");
  await sleep(2800);
  await shot("02_tadeo_on_bridge");
  await waitFor(dialogueOpen, "ogre_enter dialogue", 20000);
  await sleep(700);
  await shot("03_ogre_enter");
  await skipDialogues("04_tadeo_answers");
  await waitFor(async () => (await state()).choosing, "fight menu", 15000);
  await sleep(300);
  await shot("05_fight_menu");
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

  // Edge case: the special is locked at first; pressing it only shows a hint
  await pick("special");
  await sleep(300);
  lockedHint = await page.evaluate(() => document.body.innerText.includes("Noch nicht bereit"));
  if (!lockedHint || !(await state()).choosing) throw new Error("locked special did not show the hint");
  log("locked special shows a gentle hint");
  await shot("06_special_locked_hint");

  const end = Date.now() + 240000;
  while (Date.now() < end) {
    const s = await state();
    if (!s || s.onIsland) break;
    if (s.phase === "outro" || s.phase === "done") break;
    if (s.dialogue) {
      await skipDialogues();
      continue;
    }
    if (s.ring) {
      await handleSwing();
      continue;
    }
    if (!s.choosing) {
      await sleep(60);
      continue;
    }
    let action = "attack";
    if (used.heal === 0 && s.heroHp <= 25) action = "heal";
    else if (s.specialReady) action = "special";
    turns++;
    used[action]++;
    log(`turn ${turns}: hero ${s.heroHp} ogre ${s.ogreHp} charge ${s.charge} next ${s.next} → ${action}`);
    if (s.next === "slam" && !taken.has("06b")) {
      taken.add("06b");
      await shot("06b_windup_warning");
    }
    await pick(action);
    if (action === "attack" && used.attack === 1) {
      await sleep(820);
      await shot("08b_sword_hit");
    } else if (action === "special" && used.special === 1) {
      await sleep(1700);
      await shot("10_special_spin");
    } else if (action === "heal") {
      await sleep(900);
      await shot("11_berry_heal");
    }
    await waitFor(async () => !(await state())?.choosing, "menu closed", 5000);
  }
  log(`fight won in ${turns} turns: ${JSON.stringify(used)}, swings ${JSON.stringify(swings)}`);
  if (used.special < 1 || used.heal < 1 || used.attack < 1) throw new Error("not every action was used");
  if (!swings.early || swings.blocked < 1 || swings.missed < 1 || !swings.boing) throw new Error("shield timing not fully exercised");

  await waitFor(dialogueOpen, "ogre_defeat dialogue", 20000);
  await sleep(600);
  await shot("12_ogre_defeated");
  // Walk through the friendly ending, taking a few snapshots on the way
  const text = () => page.evaluate(() => document.body.innerText);
  const once = async (name) => {
    if (taken.has(name)) return;
    taken.add(name);
    await shot(name);
  };
  while (!(await state())?.onIsland) {
    const t = await text();
    if (await dialogueOpen()) {
      if (t.includes("wie Kuchen")) {
        await sleep(900);
        await once("14_friends");
      }
      await page.keyboard.press("Space");
      await sleep(260);
      continue;
    }
    if (t.includes("♥")) await once("13_berry_for_the_ogre");
    if (t.includes("Die Brücke ist frei")) {
      await sleep(400);
      await shot("15_victory");
      // Reason: the faded banner stays in the DOM, so wait out its 2.4 s plus half the walk
      await sleep(3400);
      await shot("16_crossing");
      break;
    }
    await sleep(120);
  }
  await waitFor(async () => (await state())?.onIsland, "return to island", 30000);
  await sleep(1500);
  await shot("17_back_on_island");
  log("back on the island");
  passed = errors.length === 0;
} catch (e) {
  log(`FAILED: ${e.message}`);
  await shot("fail").catch(() => {});
}

const summary = {
  challenge: "ogre",
  passed,
  seconds: (Date.now() - t0) / 1000,
  fps: Math.round(fps * 10) / 10,
  turns,
  used,
  swings,
  lockedHint,
  errors,
  steps,
  command: "node scripts/e2e/ogre.mjs",
};
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(passed ? "PASS" : "FAIL", `(${summary.seconds.toFixed(1)}s, errors: ${errors.length})`);
await browser.close();
process.exit(passed ? 0 : 1);
