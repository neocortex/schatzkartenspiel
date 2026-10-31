/**
 * E2E proof for the cave challenge (quest 5): the natural cave, the hungry mole
 * and the old people's test.
 *
 * Opens `?challenge=cave` and plays it with real key presses: it reads the live
 * state (`window.engine.scene.e2e`), plans a path over the cave's tile map (BFS)
 * and holds arrow keys to walk there. The first run picks the mushroom before
 * Tadeo has met the mole. The main run walks every state a child can get into:
 * a talk with the mole while still short of mushrooms, one of two mushrooms,
 * mashing Space from a conversation into a crystal, a wrong crystal first, a
 * wrong crystal half way, and then the right order, the sword and the way home.
 * Passes when every check holds and no page errors occurred.
 *
 * Run:  node scripts/e2e/cave.mjs [baseUrl]
 * Out:  scripts/e2e/out/cave/*.png + summary.json
 */

import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5199";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out", "cave");
const ROOT = join(HERE, "..", "..");
const CAVE = join(ROOT, "src", "challenges", "cave");
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
const dialogueOpen = () => page.evaluate(() => !!document.querySelector(".dialogue.open"));
const onIsland = () => page.evaluate(() => !!window.engine.scene && !window.engine.scene.e2e);
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
const sawLine = async (speaker, part = "") => (await said()).some((l) => l.startsWith(`${speaker}: `) && l.includes(part));

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

/** Breadth-first path over walkable map cells (rockfalls and the closed wall are walls). */
function plan(s, from, to) {
  const closed = [
    [8, 15, s.rockfalls[0]],
    [8, 8, s.rockfalls[1]],
    [8, 4, s.wallOpen],
  ];
  const open = (c, r) => {
    const t = s.tiles[r]?.[c];
    if (!t || t === "#" || t === "w" || t === "E") return false;
    return !closed.some(([gc, gr, isOpen]) => gc === c && gr === r && !isOpen);
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

let lastPos = [0, 0];

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

/** Wait until `test(state)` holds, clicking through any dialogue that pops up meanwhile. */
async function waitState(test, what, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await dialogueOpen()) await skipDialogues();
    const s = await state();
    if (s && test(s)) return s;
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${what}`);
}

const waitIdle = (what, timeout = 30000) => waitState((s) => !s.busy, what, timeout);

/** Walk to something, let any talk finish and press Space once the controls are free. */
async function useAt(x, z, radius, label) {
  await walkTo(x, z, radius, label);
  await waitIdle(`controls free at ${label}`);
  // Reason: a press right after a talk is thrown away on purpose, so give the guard time to end
  await sleep(600);
  await page.keyboard.press("Space");
  await sleep(250);
  log(`used ${label}`);
}

async function pickMushroom(i, label) {
  const m = (await state()).mushrooms[i];
  await useAt(m.x, m.z, 1.3, label);
  await waitIdle(`after ${label}`);
}

async function touchCrystal(color) {
  const c = (await state()).crystals.find((k) => k.color === color);
  await useAt(c.x, c.z, 1.5, `${color} crystal`);
}

/** Runs in the page: where can Tadeo walk from where he stands, by the player's own rule? */
function floodReach(targets) {
  const sc = window.engine.scene;
  const walk = sc.player.world;
  const STEP = 0.25;
  const free = (x, z) => walk.canStand(x, z) && !walk.colliders.hits(x, z, 0.35);
  const key = (i, j) => i * 100000 + j;
  const start = [Math.round(sc.player.position.x / STEP), Math.round(sc.player.position.z / STEP)];
  const seen = new Set([key(...start)]);
  const stack = [start];
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = [i + di, j + dj];
      if (seen.has(key(...n)) || !free(n[0] * STEP, n[1] * STEP)) continue;
      seen.add(key(...n));
      stack.push(n);
    }
  }
  return targets.map(([x, z, r]) => {
    const R = Math.ceil(r / STEP);
    const ci = Math.round(x / STEP);
    const cj = Math.round(z / STEP);
    for (let i = -R; i <= R; i++) {
      for (let j = -R; j <= R; j++) {
        if (Math.hypot(i, j) * STEP <= r && seen.has(key(ci + i, cj + j))) return true;
      }
    }
    return false;
  });
}

const measureFps = () =>
  page.evaluate(
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

/** Open the cave and click through the intro. */
async function startCave() {
  await page.goto(`${BASE}/?challenge=cave`);
  await waitFor(async () => !!(await state()), "cave scene", 20000);
  await recordLines();
  log("cave loaded");
}

/** Feed the mole and watch that he really digs before the rocks are gone. */
async function feedAndWatch(which) {
  const seen = { digBeforeOpen: false, carriedGone: false, moleEating: false };
  await page.keyboard.press("Space");
  const end = Date.now() + 25000;
  while (Date.now() < end) {
    if (await dialogueOpen()) await skipDialogues();
    const live = await page.evaluate(() => {
      const sc = window.engine.scene;
      return { digging: sc.world.mole.digAt >= 0, e2e: sc.e2e };
    });
    if (live.digging && !live.e2e.rockfalls[which]) seen.digBeforeOpen = true;
    if (live.e2e.carried === 0) seen.carriedGone = true;
    if (live.e2e.rockfalls[which] && !live.e2e.busy) break;
    await sleep(80);
  }
  return seen;
}

// ── Paint on the rock ─────────────────────────────────────────

/**
 * Runs in the page. How far each picture stands clear of what is behind it at its closest
 * point: `rock` in front of its rock face, `wall` above the cave wall. Below zero the stone
 * pokes through the paint as dark shards and eats the clue marks.
 */
function paintClearance() {
  const world = window.engine.scene.world;
  const triangles = (mesh) => {
    const p = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const out = [];
    for (let i = 0; i < index.count; i += 3) {
      out.push([0, 1, 2].map((k) => {
        const v = index.getX(i + k);
        return [p.getX(v), p.getY(v), p.getZ(v)];
      }));
    }
    return out;
  };
  /** Depth of a triangle at (x, y), or null when the point lies outside it. */
  const depthAt = ([a, b, c], x, y) => {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-9) return null;
    const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
    const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) return null;
    return u * a[2] + v * b[2] + (1 - u - v) * c[2];
  };
  const front = (list, x, y) => {
    let best = -Infinity;
    for (const t of list) {
      const z = depthAt(t, x, y);
      if (z !== null && z > best) best = z;
    }
    return best;
  };
  const measure = (sheet, face) => {
    const paint = triangles(sheet);
    const corners = paint.flat();
    const lo = [0, 1].map((a) => Math.min(...corners.map((v) => v[a])));
    const hi = [0, 1].map((a) => Math.max(...corners.map((v) => v[a])));
    const inside = (v) => v[0] >= lo[0] && v[0] <= hi[0] && v[1] >= lo[1] && v[1] <= hi[1];
    const rock = triangles(face).filter((t) => t.some(inside));
    let clearOfRock = Infinity;
    let clearOfWall = Infinity;
    // Reason: both surfaces are flat facets on different grids, so they can only cross at a corner of one of them
    for (const [x, y, z] of corners) {
      const r = front(rock, x, y);
      if (r > -Infinity) clearOfRock = Math.min(clearOfRock, z - r);
      clearOfWall = Math.min(clearOfWall, y - world.field.heightAt(x, z));
    }
    for (const [x, y, z] of rock.flat()) {
      const s = front(paint, x, y);
      if (s > -Infinity) clearOfRock = Math.min(clearOfRock, s - z);
    }
    return { rock: +clearOfRock.toFixed(3), wall: +clearOfWall.toFixed(3) };
  };
  const pairs = (group) => {
    const out = [];
    let face = null;
    for (const child of group.children) {
      if (child.isInstancedMesh) continue;
      if (child.renderOrder === 1) out.push(measure(child, face));
      else face = child;
    }
    return out;
  };
  const [volcano, peak, forest, arrow1, arrow2] = pairs(world.paintings.group);
  const [heart, thorns, hammer] = pairs(world.wayPictures);
  return { volcano, peak, forest, arrow1, arrow2, heart, thorns, hammer };
}

/** Runs in the page. Every line this quest can speak, also those a run may not reach. */
async function caveLines() {
  const { LINES, TADEO_REMARKS, WRONG_CRYSTAL, PHASE_HINTS } = await import("/src/challenges/cave/script.ts");
  const { DIALOGUES } = await import("/src/data/dialogues.ts");
  const flat = (x) => (typeof x === "string" ? [x] : x.text ? [x.text] : Object.values(x).flatMap(flat));
  return flat([LINES, TADEO_REMARKS, WRONG_CRYSTAL, PHASE_HINTS, DIALOGUES.cave_enter, DIALOGUES.cave_sword]);
}

// ── Play ──────────────────────────────────────────────────────

let passed = false;
const fps = { start: 0, hall: 0, chamber: 0 };
try {
  const caveSources = readdirSync(CAVE).map((f) => readFileSync(join(CAVE, f), "utf8")).join("\n");
  check("no mine, no levers", !existsSync(join(CAVE, "mine.ts")) && !/\b(Lever|RuneTrail|SecretWall|Gate)\b/.test(caveSources));

  // First run: the mushroom before the mole
  await startCave();
  await waitFor(dialogueOpen, "intro dialogue", 15000);
  await skipDialogues();
  let s = await waitState((st) => st.phase === "rockfall1" && !st.busy, "first rockfall phase");
  check("the cave starts with three mushrooms and two closed rockfalls", s.mushrooms.length === 3 && s.rockfalls.join() === "false,false" && s.carried === 0);
  check("order is volcano, peak, forest", s.order.join() === "red,white,green", s.order.join());
  check(
    "the crystals match the paintings and are not simply in that order",
    s.crystals.map((c) => c.color).sort().join() === "green,red,white" && s.crystals.map((c) => c.color).join() !== "red,white,green",
    s.crystals.map((c) => c.color).join(),
  );
  const clearance = await page.evaluate(paintClearance);
  log(`paint clearance ${JSON.stringify(clearance)}`);
  const bitten = Object.entries(clearance).filter(([, c]) => c.rock < 0.03 || c.wall < 0.03).map(([name]) => name);
  check("no stone pokes through any painting", bitten.length === 0, bitten.join());
  const overlong = (await page.evaluate(caveLines)).filter((l) => l.split(/\s+/).length > 14 || (l.match(/[.!?]+(\s|$)/g) ?? []).length > 2);
  check("every line is one or two short sentences", overlong.length === 0, overlong.join(" | "));
  const mole1 = s.mole;
  const [first, ...later] = s.mushrooms;
  const reachBefore = await page.evaluate(floodReach, [
    [first.x, first.z, 1.5],
    [s.mole.x, s.mole.z, 2],
    ...later.map((m) => [m.x, m.z, 1.5]),
    [s.sword.x, s.sword.z, 3.4],
  ]);
  check("Tadeo reaches the first mushroom and the mole, and the rockfall closes the rest", reachBefore.join() === "true,true,false,false,false", reachBefore.join());
  await pickMushroom(0, "first mushroom (before meeting the mole)");
  s = await state();
  check("a mushroom can be picked before the mole has asked", s.mushrooms[0].picked && s.carried === 1 && !(await sawLine("Maulwurf")));
  await shot("03_carrying");
  await walkTo(s.mole.x, s.mole.z, 2.2, "the mole, with a mushroom");
  await waitIdle("the mole's first words");
  check("the mole smells the mushroom", await sawLine("Maulwurf", "rieche"));
  check("he digs only once it is handed over", !(await state()).rockfalls[0]);
  await sleep(600);
  await feedAndWatch(0);
  check("the mushroom clears the rockfall in this order too", (await state()).rockfalls[0]);

  // Main run: every state in order
  await startCave();
  await sleep(1700);
  await shot("01_intro");
  await waitFor(dialogueOpen, "intro dialogue", 15000);
  await shot("02_dialogue");
  await skipDialogues();
  s = await waitState((st) => st.phase === "rockfall1" && !st.busy, "first rockfall phase");
  fps.start = await measureFps();
  log(`fps at the start ${fps.start.toFixed(1)}`);

  await walkTo(s.mole.x, s.mole.z, 3.2, "the mole", (st) => st.busy);
  await waitFor(dialogueOpen, "the mole's question", 8000);
  await shot("04_mole_hungry");
  await skipDialogues();
  await waitIdle("the mole's question");
  s = await state();
  check("the mole asks for a mushroom first", (await sawLine("Maulwurf", "Leuchtpilz")) && !s.rockfalls[0]);
  check("the mole is hungry and sits beside the rockfall", s.mole.hungry && Math.hypot(s.mole.x, s.mole.z - 15) < 5.5, JSON.stringify(s.mole));

  // A second talk while still short: a reminder, no digging, nothing lost
  const before = (await said()).length;
  await useAt(s.mole.x, s.mole.z, 2.2, "the mole again, with no mushroom");
  await waitFor(dialogueOpen, "the mole's reminder", 5000);
  await shot("05_mole_reminder");
  await skipDialogues();
  await waitIdle("the reminder");
  s = await state();
  const after = await said();
  check("a second talk while short gets a reminder, not the same question", after.length > before && after.at(-1).startsWith("Maulwurf: ") && !after.at(-1).includes("dann grabe ich dir"), after.at(-1));
  check("the rockfall stays closed without a mushroom", !s.rockfalls[0] && s.phase === "rockfall1");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Space");
    await sleep(120);
    if (await dialogueOpen()) await skipDialogues();
  }
  s = await waitIdle("mashing at the hungry mole");
  check("mashing Space at the hungry mole changes nothing", !s.rockfalls[0] && s.carried === 0);

  const mushroomWall = () => page.evaluate(([x, z]) => window.engine.scene.world.colliders.hits(x, z, 0), [s.mushrooms[0].x, s.mushrooms[0].z]);
  const wallBefore = await mushroomWall();
  await pickMushroom(0, "first mushroom");
  s = await state();
  check("Tadeo carries the mushroom", s.mushrooms[0].picked && s.carried === 1, `carried ${s.carried}`);
  check("a picked mushroom leaves no invisible wall", wallBefore && !(await mushroomWall()), `before ${wallBefore}`);
  await shot("06_mushroom_picked");
  await sleep(800);
  await shot("06b_carrying_on");
  // Picked but not handed over: the way is still closed, and he can still walk back to the mole
  const reachWith = await page.evaluate(floodReach, [[s.mole.x, s.mole.z, 2], [later[0].x, later[0].z, 1.5]]);
  check("with a mushroom in hand he can reach the mole and the rockfall still closes the way", reachWith.join() === "true,false", reachWith.join());
  await walkTo(s.mole.x, s.mole.z, 2.2, "back to the mole");
  await waitIdle("controls at the mole");
  await sleep(600);
  await shot("07_at_the_mole");
  let fed = await feedAndWatch(0);
  s = await state();
  check("one mushroom clears the first rockfall", s.rockfalls[0]);
  check("the mole digs before the rocks are gone", fed.digBeforeOpen);
  check("the mushroom is handed over", s.carried === 0 && fed.carriedGone);
  check("the second stop is next", s.phase === "rockfall2", s.phase);
  await shot("08_rockfall1_clear");
  const mole2 = s.mole;
  check("the mole moves on to the second rockfall", Math.hypot(mole2.x - mole1.x, mole2.z - mole1.z) > 10 && s.mole.hungry, JSON.stringify(mole2));

  // Second stop: two mushrooms in the side alcoves
  await walkTo(0, 12, 1.4, "the grotto", (st) => st.busy);
  await waitFor(dialogueOpen, "the mole's second wish", 8000);
  await shot("09_second_wish");
  await skipDialogues();
  await waitIdle("the mole's second wish");
  check("the mole asks for two more", await sawLine("Maulwurf", "zwei"));
  await shot("10_grotto");
  s = await state();
  await useAt(s.mole.x, s.mole.z, 2.2, "the second mole talk, no mushroom");
  await waitFor(dialogueOpen, "reminder for two", 5000);
  await skipDialogues();
  await waitIdle("the reminder for two");
  check("he says where the two are", (await said()).at(-1).startsWith("Maulwurf: "), (await said()).at(-1));
  s = await state();
  await walkTo(s.mushrooms[1].x, s.mushrooms[1].z + 3.4, 1, "in sight of the left mushroom");
  await shot("10b_mushroom_in_sight");
  await pickMushroom(1, "left alcove mushroom");
  await shot("11_left_alcove");
  s = await state();
  check("one of two in hand", s.carried === 1 && s.mushrooms[1].picked);
  await useAt(s.mole.x, s.mole.z, 2.2, "the mole with one of two");
  await waitFor(dialogueOpen, "the mole wants one more", 5000);
  await shot("12_one_more");
  await skipDialogues();
  s = await waitIdle("one more");
  check("one of two is not enough, and the mushroom stays with Tadeo", !s.rockfalls[1] && s.carried === 1 && s.phase === "rockfall2");
  check("he says one more is missing", (await said()).at(-1).startsWith("Maulwurf: "), (await said()).at(-1));
  await pickMushroom(2, "right alcove mushroom");
  await shot("13_right_alcove");
  s = await state();
  check("both in hand", s.carried === 2);
  await walkTo(s.mole.x, s.mole.z, 2.2, "the mole with both");
  await waitIdle("controls at the mole");
  await sleep(600);
  fed = await feedAndWatch(1);
  s = await state();
  check("two more clear the second", s.rockfalls[1]);
  check("the mole digs the second time too", fed.digBeforeOpen);
  check("all mushrooms are gone and the test is next", s.carried === 0 && s.phase === "test", s.phase);
  await shot("14_rockfall2_clear");
  const reachAll = await page.evaluate(floodReach, s.crystals.map((c) => [c.x, c.z, 1.7]));
  check("every crystal can be reached", reachAll.every(Boolean), reachAll.join());

  // Third stop: a child mashing Space through the talk and running into the first crystal
  await walkTo(0, -6.5, 1, "the door of the hall");
  await hold(new Set(["ArrowUp"]));
  let hallShot = false;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Space");
    await sleep(120);
    if (!hallShot && (await sawLine("Tadeo", "Die Bilder an der Wand"))) {
      hallShot = true;
      await shot("15_paintings_talk");
    }
  }
  await hold(new Set());
  await sleep(300);
  s = await waitIdle("mashing through the paintings talk");
  check("Tadeo reads the paintings aloud", await sawLine("Tadeo", "Erst der Vulkan, dann der Schneeberg, dann der Wald"));
  check("mashing Space on a crystal doesn't skip the test", !s.wallOpen && s.orderStep <= 1 && s.crystals.filter((c) => c.lit).length <= 1, `step ${s.orderStep}`);
  await shot("16_hall_after_mashing");

  // A press that closes a talk never touches the crystal Tadeo stands at
  const green = s.crystals.find((c) => c.color === "green");
  await walkTo(green.x, green.z, 1.5, "the green crystal");
  await waitIdle("controls at the green crystal");
  const stepBefore = (await state()).orderStep;
  await page.evaluate(() => void window.engine.scene.scripted([{ speaker: "Tadeo", portrait: "", text: "Hm." }]));
  await waitFor(dialogueOpen, "a talk at the crystal", 3000);
  await skipDialogues();
  await sleep(150);
  s = await state();
  check("the Space that closes a talk doesn't touch the crystal", s.orderStep === stepBefore && !s.crystals.find((c) => c.color === "green").lit);
  await sleep(500);

  // Wrong in the middle (or first, when mashing lit nothing): everything dims, with a kind word
  if (stepBefore === 0) {
    await touchCrystal("red");
    s = await state();
    check("the red crystal comes first", s.orderStep === 1 && s.crystals.find((c) => c.color === "red").lit);
  }
  await sleep(500);
  await page.evaluate(() => (window.said.length = 0));
  await touchCrystal("green");
  await sleep(200);
  await shot("17_wrong_crystal");
  s = await waitIdle("the wrong crystal");
  await sleep(500);
  s = await state();
  const kindLine = (await said()).find((l) => l.startsWith("Tadeo: "));
  check("a wrong crystal dims them with a kind line", s.orderStep === 0 && s.crystals.every((c) => !c.lit) && !!kindLine, kindLine ?? "no line");

  // Wrong first
  await touchCrystal("white");
  await sleep(500);
  s = await waitIdle("the wrong first crystal");
  check("the wrong crystal first dims them too", s.orderStep === 0 && s.crystals.every((c) => !c.lit));
  check("the wall stays closed after mistakes", !s.wallOpen);

  // Mashing on a lit crystal does nothing more
  await touchCrystal("red");
  s = await state();
  check("the red one lights", s.orderStep === 1 && s.crystals.find((c) => c.color === "red").lit);
  await shot("18_red_lit");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Space");
    await sleep(130);
  }
  s = await waitIdle("mashing on the lit crystal");
  check("mashing the lit crystal changes nothing", s.orderStep === 1 && !s.wallOpen);
  fps.hall = await measureFps();
  log(`fps in the hall ${fps.hall.toFixed(1)}`);

  await touchCrystal("white");
  s = await state();
  check("the white one lights next", s.orderStep === 2);
  await shot("19_white_lit");
  await touchCrystal("green");
  await sleep(1000);
  await shot("20_wall_opening");
  s = await waitState((st) => st.wallOpen, "the wall to open");
  check("the right order opens the wall", s.wallOpen);
  s = await waitIdle("the wall cutscene");
  await shot("21_wall_open");
  check("the chamber is next", s.phase === "chamber", s.phase);

  // Sword chamber: the finale starts on its own near the great crystal
  await walkTo(s.sword.x, s.sword.z + 6, 1, "the door of the chamber");
  await shot("22_chamber_approach");
  fps.chamber = await measureFps();
  log(`fps in the chamber ${fps.chamber.toFixed(1)}`);
  await shot("22b_chamber_view");
  s = await state();
  check("the wall no longer closes the way", (await page.evaluate(floodReach, [[s.sword.x, s.sword.z, 3.4]]))[0]);
  await walkTo(s.sword.x, s.sword.z + 2.2, 0.8, "the great crystal", (st) => st.phase === "done");
  await waitFor(dialogueOpen, "sword dialogue", 10000);
  await shot("23_great_crystal");
  await skipDialogues();
  await waitFor(async () => page.evaluate(() => document.querySelector(".item-get.show") !== null), "item get", 10000);
  await sleep(900);
  await shot("24_item_get");
  await waitFor(dialogueOpen, "closing dialogue", 10000);
  await shot("25_sword_held");
  s = await state();
  await skipDialogues();
  await sleep(100);
  const lines = await said();
  check("the sword is taken and Tadeo says what it's for", s.phase === "done" && lines.some((l) => l.includes("Dornen")));
  await waitFor(onIsland, "return to island", 20000);
  await sleep(1500);
  await shot("26_back_on_island");
  log("back on the island");

  const allLines = lines.join("\n");
  check("nobody says the forbidden words", !/\b(die Alten|Altar|ewiges Eis|besänftigen|Hebel|Tor\b)/.test(allLines));
  for (const name of Object.keys(fps)) check(`frame rate holds: ${name}`, fps[name] >= 50, fps[name].toFixed(1));
  passed = errors.length === 0 && checks.every((c) => c.ok);
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
  fps,
  checks,
  errors,
  steps,
  command: "node scripts/e2e/cave.mjs",
};
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
for (const c of checks.filter((k) => !k.ok)) console.log(`FAILED CHECK: ${c.name} ${c.detail}`);
console.log(passed ? "PASS" : "FAIL", `(${summary.seconds.toFixed(1)}s, errors: ${errors.length})`);
await browser.close();
process.exit(passed ? 0 : 1);
