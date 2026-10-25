/**
 * E2E proof for the cave challenge (quest 4).
 *
 * Opens `?challenge=cave`, advances dialogues and plays the whole challenge
 * with real key presses: it reads the live state (`window.engine.scene.e2e`),
 * plans a path over the cave's tile map (BFS) and holds arrow keys to walk
 * there, pressing Space at each lever. In the rune hall it first pulls a
 * wrong lever on purpose (to prove the gentle reset), then the right order.
 * Passes when the game is back on the island with no page errors.
 *
 * Run:  node scripts/e2e/cave.mjs [baseUrl]
 * Out:  scripts/e2e/out/cave/*.png + summary.json
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "out", "cave");
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
const state = () => page.evaluate(() => window.engine.scene?.e2e ?? null);
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
async function skipDialogues() {
  while (await dialogueOpen()) {
    await page.keyboard.press("Space");
    await sleep(220);
  }
}

// ── Steering ──────────────────────────────────────────────────

const held = new Set();
async function hold(keys) {
  for (const k of held) if (!keys.has(k)) await page.keyboard.up(k);
  for (const k of keys) if (!held.has(k)) await page.keyboard.down(k);
  held.clear();
  for (const k of keys) held.add(k);
}

function cellOf(s, x, z) {
  return [Math.round(x / s.cell + (s.cols - 1) / 2), Math.round(z / s.cell + (s.rows - 1) / 2)];
}
function cellCenter(s, c, r) {
  return [(c - (s.cols - 1) / 2) * s.cell, (r - (s.rows - 1) / 2) * s.cell];
}

/** Breadth-first path over walkable map cells (closed gates are walls). */
function plan(s, from, to) {
  const gateCells = [[8, 15], [8, 8], [8, 4]];
  const open = (c, r) => {
    const t = s.tiles[r]?.[c];
    if (!t || t === "#" || t === "w" || t === "E") return false;
    const g = gateCells.findIndex(([gc, gr]) => gc === c && gr === r);
    return g < 0 || s.gates[g];
  };
  const key = (c, r) => `${c},${r}`;
  const prev = new Map([[key(...from), null]]);
  const queue = [from];
  while (queue.length) {
    const [c, r] = queue.shift();
    if (c === to[0] && r === to[1]) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = [c + dc, r + dr];
      if (!open(...n) || prev.has(key(...n))) continue;
      prev.set(key(...n), [c, r]);
      queue.push(n);
    }
  }
  const path = [];
  for (let cur = to; cur; cur = prev.get(key(...cur))) path.unshift(cur);
  if (path[0][0] !== from[0] || path[0][1] !== from[1]) throw new Error(`no path ${from} -> ${to}`);
  return path;
}

/** Walk Tadeo to world point (x, z) with arrow keys; returns when within `radius` (or once `stop(state)` holds). */
async function walkTo(x, z, radius = 1.2, label = "", stop = null) {
  let s = await state();
  const path = plan(s, cellOf(s, ...s.player), cellOf(s, x, z)).slice(1, -1).map(([c, r]) => cellCenter(s, c, r));
  path.push([x, z]);
  let i = 0;
  let stuck = 0;
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    if (await dialogueOpen()) {
      await hold(new Set());
      if (stop?.(await state())) return;
      await skipDialogues();
      continue;
    }
    s = await state();
    if (stop?.(s)) {
      await hold(new Set());
      log(`stopped walking: ${label}`);
      return;
    }
    const [px, pz] = s.player;
    const [tx, tz] = path[i];
    const dx = tx - px;
    const dz = tz - pz;
    const d = Math.hypot(dx, dz);
    const last = i === path.length - 1;
    if (d < (last ? radius : 0.9)) {
      if (last) break;
      i++;
      continue;
    }
    // Camera yaw is 0: Right = +x, Left = -x, Up = -z (away from camera), Down = +z
    const keys = new Set();
    if (dx > 0.25 * d) keys.add("ArrowRight");
    if (dx < -0.25 * d) keys.add("ArrowLeft");
    if (dz > 0.25 * d) keys.add("ArrowDown");
    if (dz < -0.25 * d) keys.add("ArrowUp");
    // Nudge sideways when blocked by a rock or stalagmite
    if (Math.hypot(px - lastPos[0], pz - lastPos[1]) < 0.02 && !s.busy) stuck++;
    else stuck = 0;
    lastPos = [px, pz];
    if (stuck > 8) {
      keys.clear();
      keys.add(Math.abs(dx) > Math.abs(dz) ? (Math.random() < 0.5 ? "ArrowUp" : "ArrowDown") : Math.random() < 0.5 ? "ArrowLeft" : "ArrowRight");
      await hold(keys);
      await sleep(250);
      stuck = 0;
      continue;
    }
    await hold(keys);
    await sleep(50);
  }
  await hold(new Set());
  await sleep(150);
  s = await state();
  const d = Math.hypot(s.player[0] - x, s.player[1] - z);
  if (d > radius + 0.4) throw new Error(`could not reach ${label} (${x.toFixed(1)}, ${z.toFixed(1)}), still ${d.toFixed(1)} away`);
  log(`reached ${label}`);
}
let lastPos = [0, 0];

async function pullLever(i, label) {
  const s = await state();
  const l = s.levers[i];
  await walkTo(l.x, l.z, 1.4, label);
  await waitFor(async () => !(await state()).busy, "controls free");
  await page.keyboard.press("Space");
  await sleep(250);
  log(`pulled ${label}`);
}

/** Wait until `check(state)` holds, clicking through any dialogue that pops up meanwhile. */
async function waitState(check, what, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await dialogueOpen()) await skipDialogues();
    const s = await state();
    if (s && check(s)) return s;
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${what}`);
}

async function waitIdle(what, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await dialogueOpen()) await skipDialogues();
    const s = await state();
    if (s && !s.busy) return s;
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${what}`);
}

// ── Play ──────────────────────────────────────────────────────

let passed = false;
let fps = 0;
try {
  await page.goto(`${BASE}/?challenge=cave`);
  await waitFor(async () => !!(await state()), "cave scene", 20000);
  log("cave loaded");
  await sleep(1800);
  await shot("01_intro");
  await waitFor(dialogueOpen, "intro dialogue", 15000);
  await shot("02_dialogue");
  await skipDialogues();
  await waitIdle("intro to finish");
  await waitFor(async () => (await state()).phase === "gate1", "phase gate1");
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

  // Gate 1: one lever
  await pullLever(0, "lever 1 (gold)");
  await sleep(500);
  await shot("03_lever_pulled");
  await waitFor(async () => page.evaluate(() => window.engine.scene.world.gates[0].rumbling), "gate 1 rumbling", 15000);
  await sleep(900);
  await shot("04_gate1_opening");
  await waitIdle("gate 1 cutscene");
  log(`gates: ${JSON.stringify((await state()).gates)}`);

  // Gate 2: two levers in the side alcoves
  await pullLever(1, "lever 2 (teal, left alcove)");
  await shot("05_left_alcove");
  await waitIdle("after lever 2");
  await pullLever(2, "lever 3 (violet, right alcove)");
  await waitState((s) => s.gates[1], "gate 2 to open");
  await waitIdle("gate 2 cutscene");
  await shot("06_grotto_gate2_open");

  // Rune hall: one wrong pull first, then the right order
  let s = await state();
  const order = s.order;
  log(`rune order: ${order.join(", ")}`);
  await walkTo(0, -12.5, 1.5, "rune hall");
  await waitIdle("rune hall remark");
  await shot("07_rune_hall");
  await pullLever(order[1], "wrong lever on purpose");
  await sleep(300);
  await shot("08_wrong_order");
  s = await waitIdle("reset after the wrong lever");
  await sleep(400);
  s = await state();
  if (s.orderStep !== 0 || s.levers.some((l, i) => i >= 3 && l.pulled)) throw new Error("rune levers did not reset");
  log("wrong order gently reset the levers");
  for (const [k, i] of order.entries()) {
    await pullLever(i, `rune lever ${k + 1}`);
    await waitState((s) => s.orderStep === k + 1 || s.gates[2], `rune lever ${k + 1} accepted`);
  }
  await waitState((s) => s.gates[2], "secret wall to open");
  await waitIdle("secret wall cutscene");
  await shot("09_secret_wall_open");

  // Sword chamber
  s = await state();
  // The finale starts on its own once Tadeo is close to the altar
  await walkTo(s.altar[0], s.altar[1] + 2.2, 0.8, "altar", (st) => st.phase === "done");
  await waitFor(dialogueOpen, "sword dialogue", 10000);
  await shot("10_sword_altar");
  await skipDialogues();
  await waitFor(async () => page.evaluate(() => document.querySelector(".item-get.show") !== null), "item get", 10000);
  await sleep(900);
  await shot("11_item_get");
  await waitFor(dialogueOpen, "closing dialogue", 10000);
  await shot("12_sword_held");
  await skipDialogues();
  await waitFor(async () => (await page.evaluate(() => !window.engine.scene?.e2e && !!window.engine.scene)), "return to island", 20000);
  await sleep(1500);
  await shot("13_back_on_island");
  log("back on the island");
  passed = errors.length === 0;
} catch (e) {
  log(`FAILED: ${e.message}`);
  await shot("fail").catch(() => {});
} finally {
  await hold(new Set()).catch(() => {});
}

const summary = {
  challenge: "cave",
  passed,
  seconds: (Date.now() - t0) / 1000,
  fps: Math.round(fps * 10) / 10,
  errors,
  steps,
  command: "node scripts/e2e/cave.mjs",
};
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(passed ? "PASS" : "FAIL", `(${summary.seconds.toFixed(1)}s, errors: ${errors.length})`);
await browser.close();
process.exit(passed ? 0 : 1);
