/**
 * E2E proof for the forest challenge (quest 6): the thorn hedge and the berry hunt.
 *
 * Opens `?quest=6` on the island, where the hedge closes the forest gate. The
 * camera framing of the sword scene is measured from three sides of the gate.
 * Then Tadeo walks up from the lake path, confirms the gate prompt with one
 * Space and watches the hedge open before the forest starts. The challenge is
 * played with real key presses: it reads the live state
 * (`window.engine.scene.e2e`) and the glade's walkability grid, plans a path
 * (BFS) to the nearest berry and holds arrow keys to walk there. On the way
 * it walks into a thorn bush on purpose to prove the gentle "Autsch!" bounce.
 * Passes when all five berries are collected, the reward plays, the hedge
 * stays open on the island and no page errors occurred.
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
const checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const t0 = Date.now();
const log = (msg) => {
  const line = `[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`;
  steps.push(line);
  console.log(line);
};
const check = (name, ok, detail = "") => {
  checks.push({ name, ok: !!ok, detail: String(detail) });
  log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== "" ? ` (${detail})` : ""}`);
};
const sleep = (ms) => page.waitForTimeout(ms);
const state = () => page.evaluate(() => window.engine.scene?.e2e ?? null);
const story = () => page.evaluate(() => window.game.story.e2e);
const dialogueOpen = () => page.evaluate(() => !!document.querySelector(".dialogue.open"));
const shot = async (name) => {
  const png = await page.screenshot({ path: join(OUT, `${name}.png`) });
  log(`screenshot ${name}.png`);
  return png;
};

/** Share of a screenshot that is deep blue: the sword's light, not the sky (pale) or the sea (green-blue). */
const blueShare = (png) =>
  page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const g = canvas.getContext("2d");
    g.drawImage(bitmap, 0, 0);
    const px = g.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let blue = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 2] > 140 && px[i + 2] > px[i] * 1.8 && px[i + 2] > px[i + 1] * 1.3) blue++;
    return blue / (px.length / 4);
  }, png.toString("base64"));

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

// ── What was said ─────────────────────────────────────────────

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

/** Where Tadeo may stand at the gate: the lake path, straight north of it, and the west side. */
const GATE_SPOTS = [[-4, 23], [-12, 23.2], [-15.2, 24.6]];
const FOREST_GATE = [-12, 26];

/** Runs in the page: plays the sword scene from each spot and measures what the camera shows while it runs. */
async function sceneFraming(spots) {
  const g = window.game;
  const cam = g.island.camera;
  const hedge = g.story.hedge.prop.group;
  // From the near side of the hedge towards the forest; the hedge stands across it
  const n = [Math.sin(hedge.rotation.y), Math.cos(hedge.rotation.y)];
  const side = (x, z) => (x - hedge.position.x) * n[0] + (z - hedge.position.z) * n[1];
  const view = (x, y, z) => {
    const v = cam.position.clone().set(x, y, z).project(cam);
    return { x: v.x, y: v.y, ahead: v.z < 1 };
  };
  const inside = (v) => v.ahead && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.92;
  const out = [];
  for (const [x, z] of spots) {
    g.placePlayer(x, z);
    // Reason: a stall while the scene plays is what a child would see as a stutter
    let longest = 0;
    let last = performance.now();
    let watching = true;
    const tick = (now) => {
      longest = Math.max(longest, now - last);
      last = now;
      if (watching) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const done = g.story.beforeQuest(6);
    const samples = [];
    for (const wait of [1300, 1700]) {
      await new Promise((r) => setTimeout(r, wait));
      const p = g.island.player.position;
      const c = cam.position;
      samples.push({
        tadeo: inside(view(p.x, p.y + 1.1, p.z)),
        hedge: inside(view(hedge.position.x, hedge.position.y + 0.8, hedge.position.z)),
        sameSide: side(c.x, c.z) < 0 && side(p.x, p.z) < 0,
        above: c.y - g.island.island.hf.heightAt(c.x, c.z),
      });
    }
    await done;
    watching = false;
    g.story.apply(6);
    out.push({ spot: [x, z], samples, longest });
  }
  return out;
}

/** Steer Tadeo on the island with the arrow keys (the camera looks north: Up = -z, Right = +x). */
async function walkIsland(x, z, radius = 1, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const p = await page.evaluate(() => [window.game.island.player.position.x, window.game.island.player.position.z]);
    if (Math.hypot(x - p[0], z - p[1]) < radius) break;
    await hold(keysToward(x - p[0], z - p[1]));
    await sleep(40);
  }
  await hold(new Set());
}

let passed = false;
let fps = 0;
let bounce = null;
let opening = null;
try {
  // The hedge: closed before the sword, opened by it, gone for good
  await page.goto(`${BASE}/?quest=6`);
  await waitFor(() => page.evaluate(() => window.game?.story && window.engine?.scene === window.game.island), "the island", 30000);
  await sleep(800);
  await recordLines();
  let island = await story();
  check("the hedge closes the gate before the sword", island.hedge);
  const walls = await page.evaluate(() => {
    const { colliders } = window.game.island.island;
    const circles = window.game.story.hedge.circles;
    return { circles: circles.length, shut: circles.every((c) => colliders.hits(c.x, c.z, 0)) };
  });
  check("the hedge stands on its colliders", walls.circles > 3 && walls.shut, JSON.stringify(walls));

  const spots = [];
  for (const [x, z] of GATE_SPOTS) {
    const free = await page.evaluate(([x, z]) => {
      const { hf, colliders } = window.game.island.island;
      return hf.isWalkable(x, z) && !colliders.hits(x, z, 0.35);
    }, [x, z]);
    check(`Tadeo can stand at ${x}, ${z}`, free);
    if (free) spots.push([x, z]);
  }
  const framing = await page.evaluate(sceneFraming, spots);
  for (const { spot, samples } of framing) {
    const bad = samples.filter((m) => !m.tadeo || !m.hedge || !m.sameSide || m.above < 1.5);
    check(`the camera shows Tadeo and the hedge from ${spot.join(", ")}`, bad.length === 0, JSON.stringify(samples));
  }
  check("the hedge is whole again after those tries", (await story()).hedge);
  const longest = Math.max(...framing.map((f) => f.longest));
  check("no frame stalls while the hedge opens", longest < 250, `longest frame ${longest.toFixed(0)} ms`);

  // The real thing: up the lake path, one Space at the gate
  await page.evaluate(([x, z]) => window.game.placePlayer(x, z), GATE_SPOTS[0]);
  await sleep(600);
  await walkIsland(FOREST_GATE[0], FOREST_GATE[1] - 2.6);
  await sleep(500);
  const prompt = await page.evaluate(() => document.querySelector(".prompt")?.textContent.trim() ?? "");
  check("the gate offers its prompt in front of the hedge", prompt.includes("Los geht"), prompt);
  const closedShare = await blueShare(await shot("00_hedge_closed"));
  const start = await page.evaluate(() => {
    const p = window.game.island.player.position;
    return [p.x, p.z];
  });
  const pressed = Date.now();
  await page.keyboard.press("Space");
  await hold(new Set(["ArrowRight"]));
  await sleep(450);
  const raised = await page.evaluate(() => {
    const a = window.game.island.player.avatar;
    return { pose: a.pose, held: a.handR.children.length, hedge: window.game.story.e2e.hedge };
  });
  await shot("00a_sword_raised");
  await sleep(500);
  await shot("00b_light_spreads");
  await hold(new Set());
  const during = await page.evaluate(() => {
    const p = window.game.island.player.position;
    return [p.x, p.z];
  });
  await sleep(450);
  const burning = await blueShare(await shot("00c_thorns_shrink"));
  await sleep(500);
  const sinking = await blueShare(await shot("00d_thorns_sinking"));
  check("the thorns burn deep blue while they shrink", closedShare < 0.02 && Math.max(burning, sinking) > 0.1, `closed ${closedShare.toFixed(3)}, burning ${burning.toFixed(3)}, sinking ${sinking.toFixed(3)}`);
  check("the sword is in his hand while the light burns", raised.pose === "holdUp" && raised.held === 1 && raised.hedge, JSON.stringify(raised));
  check("the arrow keys do nothing during the scene", Math.hypot(during[0] - start[0], during[1] - start[1]) < 0.3, `${start} -> ${during}`);
  let hedgeGone = null;
  let forestAt = null;
  while (forestAt === null && Date.now() - pressed < 20000) {
    const [hedgeUp, inForest] = await page.evaluate(() => [window.game.story.e2e.hedge, !!window.engine.scene?.e2e?.phase]);
    if (!hedgeUp && hedgeGone === null) hedgeGone = (Date.now() - pressed) / 1000;
    if (inForest) forestAt = (Date.now() - pressed) / 1000;
    else await sleep(50);
  }
  opening = { hedgeGone, forestAt };
  check("pressing Space opens the hedge before the forest starts", hedgeGone !== null && forestAt !== null && hedgeGone <= forestAt, JSON.stringify(opening));
  check("the scene is a few seconds, not a wait", forestAt !== null && forestAt > 3 && forestAt < 8, String(forestAt));

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

  const lines = await said();
  check("Flocke explains the hedge", lines.some((l) => l.startsWith("Fuchs: ") && l.includes("Nur vor seinem Licht")));
  check("Flocke calls the other bushes wild thorns", lines.some((l) => l.startsWith("Fuchs: ") && l.includes("wilde Dornen")));
  check("the berries' job is said", lines.some((l) => l.startsWith("Tadeo: ") && l.includes("wieder lieb")));
  const words = (l) => l.split(": ").slice(1).join(": ").split(/\s+/).length;
  check("no line is longer than 14 words", lines.every((l) => words(l) <= 14), lines.filter((l) => words(l) > 14).join(" | "));
  check("nobody says the forbidden words", !/\b(die Alten|Altar|ewiges Eis|besänftigen)/.test(lines.join("\n")));
  island = await story();
  check("after the forest the hedge stays open", !island.hedge, JSON.stringify(island));
  const open = await page.evaluate(() => {
    const { colliders } = window.game.island.island;
    const a = window.game.island.player.avatar;
    return { walls: window.game.story.hedge.circles.filter((c) => colliders.hits(c.x, c.z, 0)).length, pose: a.pose, held: a.handR.children.length };
  });
  check("no wall of the hedge is left", open.walls === 0, JSON.stringify(open));
  check("Tadeo's hands are empty again", open.held === 0 && open.pose !== "holdUp", JSON.stringify(open));
  passed = errors.length === 0 && checks.every((c) => c.ok);
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
  opening,
  checks,
  errors,
  steps,
  command: "node scripts/e2e/forest.mjs",
};
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
for (const c of checks.filter((k) => !k.ok)) console.log(`FAILED CHECK: ${c.name} ${c.detail}`);
console.log(passed ? "PASS" : "FAIL", `(${summary.seconds.toFixed(1)}s, errors: ${errors.length})`);
await browser.close();
process.exit(passed ? 0 : 1);
