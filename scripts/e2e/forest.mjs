/**
 * E2E proof for the forest challenge (quest 5).
 *
 * Opens `?challenge=forest`, advances the dialogues and plays the whole
 * challenge with real key presses: it reads the live state
 * (`window.engine.scene.e2e`) and the glade's walkability grid, plans a path
 * (BFS) to the nearest berry and holds arrow keys to walk there. On the way
 * it walks into a thorn bush on purpose to prove the gentle "Autsch!" bounce.
 * Passes when all five berries are collected, the reward plays and the game
 * is back on the island with no page errors.
 *
 * Run:  node scripts/e2e/forest.mjs [baseUrl]
 * Out:  scripts/e2e/out/forest/*.png + summary.json
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "out", "forest");
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

/** Camera yaw is 0: Right = +x, Left = -x, Up = -z (away from the camera), Down = +z. */
function keysToward(dx, dz) {
  const d = Math.hypot(dx, dz);
  const keys = new Set();
  if (dx > 0.38 * d) keys.add("ArrowRight");
  if (dx < -0.38 * d) keys.add("ArrowLeft");
  if (dz > 0.38 * d) keys.add("ArrowDown");
  if (dz < -0.38 * d) keys.add("ArrowUp");
  return keys;
}

let grid = null;
const raw = (i, j) => i >= 0 && j >= 0 && i < grid.nx && j < grid.nz && grid.rows[j][i] === "1";
// Reason: plan one cell (0.5 units) away from every edge, so the 8-way arrow-key steering never brushes
// the exact border of the walkable area or a thorn's margin
let eroded = null;
function erode() {
  eroded = grid.rows.map((row, j) => Array.from(row, (_, i) => [-1, 0, 1].every((dj) => [-1, 0, 1].every((di) => raw(i + di, j + dj)))));
}
let strict = true;
const free = (i, j) => (strict ? i >= 0 && j >= 0 && i < grid.nx && j < grid.nz && eroded[j][i] : raw(i, j));
const cellOf = (x, z) => [Math.floor((x - grid.minX) / grid.res), Math.floor((z - grid.minZ) / grid.res)];
const centerOf = (i, j) => [grid.minX + (i + 0.5) * grid.res, grid.minZ + (j + 0.5) * grid.res];

/** Nearest free cell (the start or goal may sit just inside a blocked margin). */
function nearestFree(i, j) {
  for (let r = 0; r < 10; r++) {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && free(i + di, j + dj)) return [i + di, j + dj];
  }
  throw new Error(`no free cell near ${i},${j}`);
}

/** Plan on the eroded grid; fall back to the full grid where erosion closes a narrow gap (the hedge entrance). */
function plan(from, to) {
  strict = true;
  try {
    return search(from, to);
  } catch {
    strict = false;
    return search(from, to);
  }
}

/** Breadth-first path over the walkability grid (8 neighbours, no corner cutting). */
function search(from, to) {
  const s = nearestFree(...cellOf(...from));
  const g = nearestFree(...cellOf(...to));
  const key = (i, j) => j * grid.nx + i;
  const prev = new Map([[key(...s), null]]);
  const queue = [s];
  for (let q = 0; q < queue.length; q++) {
    const [i, j] = queue[q];
    if (i === g[0] && j === g[1]) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const n = [i + di, j + dj];
      if (!free(...n) || prev.has(key(...n))) continue;
      if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
      prev.set(key(...n), [i, j]);
      queue.push(n);
    }
  }
  if (!prev.has(key(...g))) throw new Error(`no path ${from} -> ${to}`);
  const path = [];
  for (let c = g; c; c = prev.get(key(...c))) path.unshift(centerOf(...c));
  return path;
}

/** Whether the straight line a→b stays on free cells. */
function clear(a, b) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2);
  for (let k = 0; k <= n; k++) {
    const t = k / Math.max(n, 1);
    if (!free(...cellOf(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))) return false;
  }
  return true;
}

let lastPos = [0, 0];
/** Walk Tadeo towards (x, z) along a planned path until `stop(state)` holds or he is within `radius`. */
async function walkTo(x, z, label, radius = 0.6, stop = null, attempt = 0) {
  if (attempt > 8) throw new Error(`stuck on the way to ${label}`);
  let s = await state();
  const path = plan(s.player, [x, z]);
  path.push([x, z]);
  let i = 0;
  let stuck = 0;
  let report = Date.now() + 3000;
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    if (Date.now() > report) {
      report = Date.now() + 3000;
      log(`  walking to ${label}: at (${s.player[0].toFixed(1)}, ${s.player[1].toFixed(1)}), waypoint ${i}/${path.length - 1}`);
    }
    if (await dialogueOpen()) {
      await hold(new Set());
      await skipDialogues();
      continue;
    }
    s = await state();
    if (stop?.(s)) break;
    const p = s.player;
    if (Math.hypot(x - p[0], z - p[1]) < radius) break;
    // Aim at the farthest waypoint still in a straight, thorn-free line from here
    for (let k = path.length - 1; k > i; k--) {
      if (clear(p, path[k])) {
        i = k;
        break;
      }
    }
    const [tx, tz] = path[i];
    if (Math.hypot(tx - p[0], tz - p[1]) < 0.3 && i < path.length - 1) i++;
    const keys = keysToward(tx - p[0], tz - p[1]);
    if (Math.hypot(p[0] - lastPos[0], p[1] - lastPos[1]) < 0.02 && !s.busy) stuck++;
    else stuck = 0;
    lastPos = p;
    if (stuck > 10) {
      // Reason: a rock or tuft collider can catch Tadeo on a corner; side-step and re-plan
      log(`  stuck at (${p[0].toFixed(1)}, ${p[1].toFixed(1)}), side-stepping`);
      const sideways = Math.abs(tx - p[0]) > Math.abs(tz - p[1]) ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
      await hold(new Set([sideways[attempt % 2]]));
      await sleep(200);
      return walkTo(x, z, label, radius, stop, attempt + 1);
    }
    await hold(keys);
    await sleep(40);
  }
  await hold(new Set());
  log(`reached ${label}`);
}

/** Wait until `check(state)` holds, clicking through any dialogue that pops up meanwhile. */
async function waitState(check, what, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await dialogueOpen()) await skipDialogues();
    const s = await state();
    if (s && check(s)) return s;
    await sleep(120);
  }
  throw new Error(`timeout waiting for ${what}`);
}

// ── Play ──────────────────────────────────────────────────────

let passed = false;
let fps = 0;
let bounce = null;
try {
  await page.goto(`${BASE}/?challenge=forest`);
  await waitFor(async () => !!(await state()), "forest scene", 20000);
  log("forest loaded");
  await sleep(2000);
  await shot("01_intro");
  await waitFor(dialogueOpen, "intro dialogue", 15000);
  await shot("02_dialogue");
  await skipDialogues();
  await waitFor(dialogueOpen, "fox dialogue", 10000);
  await sleep(600);
  await shot("03_meet_the_fox");
  await waitState((s) => s.phase === "hunt" && !s.busy, "the berry hunt to start");
  grid = await page.evaluate(() => window.engine.scene.e2eGrid);
  erode();
  log(`grid ${grid.nx}x${grid.nz}`);
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
  await shot("04_fox_leads");

  // Bump into the first thorn bush on purpose: Tadeo must bounce back, nothing else happens
  let s = await state();
  const thorn = s.thorns[0];
  const before = Math.hypot(s.player[0] - thorn.x, s.player[1] - thorn.z);
  const end = Date.now() + 8000;
  while (Date.now() < end && (await state()).ouches === 0) {
    s = await state();
    await hold(keysToward(thorn.x - s.player[0], thorn.z - s.player[1]));
    await sleep(40);
  }
  await hold(new Set());
  s = await state();
  if (s.ouches < 1) throw new Error("walking into a thorn bush did not bounce Tadeo");
  const touch = Math.hypot(s.player[0] - thorn.x, s.player[1] - thorn.z);
  await sleep(250);
  await shot("05_autsch");
  await sleep(500);
  s = await state();
  const after = Math.hypot(s.player[0] - thorn.x, s.player[1] - thorn.z);
  bounce = { start: before, touch, afterBounce: after };
  log(`thorn bounce: touched at ${touch.toFixed(2)}, bounced back to ${after.toFixed(2)}`);
  if (after < touch + 0.6) throw new Error("Tadeo was not bounced away from the thorns");

  // Collect the berries, always the nearest one (where the fox leads)
  for (let n = 1; n <= 5; n++) {
    s = await state();
    const left = s.berries.filter((b) => !b.collected);
    left.sort((a, b) => Math.hypot(a.x - s.player[0], a.z - s.player[1]) - Math.hypot(b.x - s.player[0], b.z - s.player[1]));
    const berry = left[0];
    log(`heading to berry "${berry.name}" (fox: ${s.fox[2]})`);
    await walkTo(berry.x, berry.z, `berry ${berry.name}`, 0.3, (st) => st.found >= n);
    s = await waitState((st) => st.found >= n, `berry ${n} collected`, 5000);
    log(`berries: ${s.found} / 5`);
    if (n < 5) {
      await sleep(350);
      await shot(`0${5 + n}_berry_${n}_${berry.name}`);
    }
  }

  // Finale: berries held up, item get, closing lines
  await waitFor(async () => page.evaluate(() => document.querySelector(".item-get.show") !== null), "item get", 15000);
  await sleep(900);
  await shot("10_item_get");
  await waitFor(dialogueOpen, "closing dialogue", 15000);
  await sleep(600);
  await shot("11_berries_held");
  await skipDialogues();
  await waitFor(async () => page.evaluate(() => !window.engine.scene?.e2e && !!window.engine.scene), "return to island", 20000);
  await sleep(1500);
  await shot("12_back_on_island");
  log("back on the island");
  passed = errors.length === 0;
} catch (e) {
  log(`FAILED: ${e.message}`);
  await shot("fail").catch(() => {});
} finally {
  await hold(new Set()).catch(() => {});
}

const summary = {
  challenge: "forest",
  passed,
  seconds: (Date.now() - t0) / 1000,
  fps: Math.round(fps * 10) / 10,
  thornBounce: bounce,
  errors,
  steps,
  command: "node scripts/e2e/forest.mjs",
};
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(passed ? "PASS" : "FAIL", `(${summary.seconds.toFixed(1)}s, errors: ${errors.length})`);
await browser.close();
process.exit(passed ? 0 : 1);
