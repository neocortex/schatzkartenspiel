/**
 * E2E proof for the volcano challenge (quest 2).
 *
 * Opens `?challenge=volcano`, advances the dialogues with Space and walks
 * Tadeo across the lava field with real arrow-key presses. Each tick a small
 * autopilot reads the live state (`window.engine.scene`: hero position,
 * camera yaw, trail, flying lava bombs) and picks the arrow keys that keep
 * moving along the trail while staying out of the warning circles. After the
 * first checkpoint it deliberately steps into one circle once to prove the
 * kid-friendly "Autsch!" + respawn at the checkpoint. Passes when the goal is
 * reached, the game is back on the island and no page errors occurred.
 *
 * Run:  node scripts/e2e/volcano.mjs [baseUrl]
 * Out:  scripts/e2e/out/volcano/*.png + summary.json
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "out", "volcano");
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
const dialogueOpen = () => page.evaluate(() => !!document.querySelector(".dialogue.open"));
const onIsland = () => page.evaluate(() => !!window.engine?.scene && "island" in window.engine.scene);
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

/**
 * Runs in the page: reads the challenge state and returns which arrow keys to hold.
 * mode "avoid" walks along the trail and dodges warning circles; "seek" walks into
 * the next reachable circle (to test the hit + respawn path).
 */
function pilot(mode) {
  const sc = window.engine?.scene;
  if (!sc || !sc.course || !sc.hero) return null;
  const c = sc.course;
  const h = sc.hero.position;
  const cols = sc.hero.world.colliders;
  const SPEED = 6.2;
  const HIT = 1.75 * 0.72;
  const sin = Math.sin(sc.yaw);
  const cos = Math.cos(sc.yaw);
  const bombs = sc.bombs.flying.filter((b) => b.dangerous).map((b) => ({ x: b.to.x, z: b.to.z, rem: b.dur - b.t }));
  // Same mapping as the hero controller: arrow axis → world direction for the camera yaw
  const world = (ax, ay) => {
    const l = Math.hypot(ax, ay) || 1;
    return [(ax * cos - ay * sin) / l, (ax * sin + ay * cos) / l];
  };
  // Where Tadeo would be after t seconds of holding this direction (stops at the first blocked step)
  const walk = (v, t) => {
    let x = h.x;
    let z = h.z;
    let blocked = false;
    for (let u = 0; u < t; u += 0.1) {
      const nx = x + v[0] * SPEED * 0.1;
      const nz = z + v[1] * SPEED * 0.1;
      if (!c.canStand(nx, nz) || cols.hits(nx, nz, 0.4)) {
        blocked = true;
        break;
      }
      x = nx;
      z = nz;
    }
    return { x, z, blocked };
  };
  const cands = [];
  for (const ax of [-1, 0, 1]) for (const ay of [-1, 0, 1]) cands.push({ ax, ay, v: ax || ay ? world(ax, ay) : [0, 0] });

  let best = cands[4];
  let nearest = null;
  for (const b of bombs) {
    const d = Math.hypot(b.x - h.x, b.z - h.z);
    if (!nearest || d < nearest.d) nearest = { d, rem: b.rem };
  }
  if (mode === "seek") {
    const reach = bombs.filter((b) => Math.hypot(b.x - h.x, b.z - h.z) / SPEED < b.rem - 0.15).sort((a, b) => a.rem - b.rem)[0];
    if (reach && Math.hypot(reach.x - h.x, reach.z - h.z) > 0.45) {
      const dx = reach.x - h.x;
      const dz = reach.z - h.z;
      let top = -Infinity;
      for (const k of cands) {
        const sc2 = k.v[0] * dx + k.v[1] * dz;
        if (sc2 > top) [top, best] = [sc2, k];
      }
    }
  } else {
    const tgt = c.pointAt(Math.min(sc.playerS + 6, c.goalS + 8));
    let dx = tgt.x - h.x;
    let dz = tgt.y - h.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    let top = -Infinity;
    for (const k of cands) {
      let score = k.v[0] * dx + k.v[1] * dz;
      const near = walk(k.v, 0.6);
      if (near.blocked && (k.ax || k.ay)) score -= 2;
      for (const b of bombs) {
        if (b.rem > 2.2) continue;
        const p = walk(k.v, b.rem);
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        const safe = HIT + 1.2;
        if (d < safe) score -= 30 + (safe - d) * 10;
      }
      if (score > top) [top, best] = [score, k];
    }
  }
  const keys = [];
  if (best.ax > 0) keys.push("ArrowRight");
  if (best.ax < 0) keys.push("ArrowLeft");
  if (best.ay > 0) keys.push("ArrowDown");
  if (best.ay < 0) keys.push("ArrowUp");
  return {
    keys,
    state: sc.state,
    s: sc.playerS,
    goalS: c.goalS,
    checkpoint: sc.checkpoint,
    hits: sc.hits,
    pos: [h.x, h.z],
    onBridge: !!c.bridgeAt(h.x, h.z),
    nearest,
    dialogue: !!document.querySelector(".dialogue.open"),
    status: document.body.innerText.match(/noch \d+ m/)?.[0] ?? null,
  };
}

const held = new Set();
async function holdKeys(keys) {
  for (const k of [...held]) {
    if (!keys.includes(k)) {
      await page.keyboard.up(k);
      held.delete(k);
    }
  }
  for (const k of keys) {
    if (!held.has(k)) {
      await page.keyboard.down(k);
      held.add(k);
    }
  }
}

// ── Play ──────────────────────────────────────────────────────

let passed = false;
let fps = 0;
let playSeconds = 0;
let respawnCheck = null;
const reached = new Set();
let last = null;
try {
  await page.goto(`${BASE}/?challenge=volcano`);
  await waitFor(() => page.evaluate(() => window.engine?.scene?.state === "intro"), "volcano scene", 25000);
  log("volcano loaded");
  await sleep(2400);
  await shot("01_intro_volcano");
  await waitFor(dialogueOpen, "volcano_enter dialogue", 20000);
  await sleep(500);
  await shot("02_volcano_enter");
  await skipDialogues("03_tadeo_tips");
  await waitFor(() => page.evaluate(() => window.engine.scene.state === "play"), "play state", 10000);
  await sleep(500);
  await shot("04_los_gehts");
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

  const playStart = Date.now();
  let mode = "avoid";
  let warnShotAt = 0;
  let ouchAt = 0;
  let seekStart = 0;
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    const s = await page.evaluate(pilot, mode);
    if (!s) throw new Error("challenge scene vanished during play");
    last = s;
    if (s.state === "won") break;
    if (s.dialogue) {
      await holdKeys([]);
      await skipDialogues();
      continue;
    }
    // After the first checkpoint, step into one circle on purpose (failure path: hit + respawn)
    if (mode === "avoid" && s.checkpoint >= 1 && s.hits === 0 && !seekStart) {
      mode = "seek";
      seekStart = Date.now();
      log(`checkpoint ${s.checkpoint} reached at s=${s.s.toFixed(1)}, now stepping into a circle on purpose`);
    }
    if (mode === "seek" && Date.now() - seekStart > 30000) throw new Error("no hit while seeking a circle");
    await holdKeys(s.state === "play" ? s.keys : []);

    if (!warnShotAt && s.nearest && s.nearest.d < 9 && s.nearest.rem < 0.75 && s.state === "play") {
      warnShotAt = Date.now();
      await shot("05_warning_circle");
    } else if (warnShotAt > 0 && Date.now() - warnShotAt > 700) {
      warnShotAt = -1;
      await shot("06_impact");
    }
    if (s.checkpoint > 0 && !reached.has(s.checkpoint)) {
      reached.add(s.checkpoint);
      log(`checkpoint ${s.checkpoint} (s=${s.s.toFixed(1)}, ${s.status})`);
      if (s.checkpoint === 1) {
        await sleep(250);
        await shot("07_checkpoint");
      }
    }
    if (s.state === "ouch" && !ouchAt) {
      ouchAt = Date.now();
      await holdKeys([]);
      log(`Autsch! hit ${s.hits} at s=${s.s.toFixed(1)}`);
      await sleep(120);
      await shot("08_autsch");
    }
    if (ouchAt > 0 && s.state === "play" && mode === "seek") {
      const cp = await page.evaluate(() => {
        const sc = window.engine.scene;
        const p = sc.course.checkpoints[sc.checkpoint].pos;
        return [p.x, p.y];
      });
      const d = Math.hypot(cp[0] - s.pos[0], cp[1] - s.pos[1]);
      respawnCheck = { checkpoint: s.checkpoint, distanceToFlag: Math.round(d * 100) / 100, hits: s.hits };
      log(`respawned ${d.toFixed(2)} m from checkpoint ${s.checkpoint}`);
      if (d > 1.5) throw new Error("respawn was not at the last checkpoint");
      await sleep(250);
      await shot("09_respawn");
      mode = "avoid";
    }
    if (s.onBridge && !reached.has("bridge")) {
      reached.add("bridge");
      await shot("10_bridge");
    }
    if (s.s > s.goalS - 14 && !reached.has("goal")) {
      reached.add("goal");
      await shot("11_goal_arch");
    }
    await sleep(30);
  }
  await holdKeys([]);
  if (last?.state !== "won") throw new Error(`goal not reached (s=${last?.s?.toFixed(1)})`);
  playSeconds = (Date.now() - playStart) / 1000;
  log(`goal reached after ${playSeconds.toFixed(1)}s of play, hits ${last.hits}, checkpoints ${[...reached].join(",")}`);
  if (!respawnCheck) throw new Error("hit/respawn path was not exercised");
  if (last.checkpoint < 3) throw new Error(`only ${last.checkpoint} checkpoints were reached`);
  await sleep(900);
  await shot("12_geschafft");
  await waitFor(dialogueOpen, "volcano_complete dialogue", 15000);
  await sleep(500);
  await shot("13_volcano_complete");
  await skipDialogues();
  await waitFor(onIsland, "return to island", 30000);
  await sleep(1500);
  await shot("14_back_on_island");
  log("back on the island");
  passed = errors.length === 0;
} catch (e) {
  log(`FAILED: ${e.message}`);
  await shot("fail").catch(() => {});
}

const summary = {
  challenge: "volcano",
  passed,
  seconds: (Date.now() - t0) / 1000,
  playSeconds,
  fps: Math.round(fps * 10) / 10,
  hits: last?.hits ?? null,
  checkpoints: last?.checkpoint ?? null,
  respawnCheck,
  errors,
  steps,
  command: "node scripts/e2e/volcano.mjs",
};
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(passed ? "PASS" : "FAIL", `(${summary.seconds.toFixed(1)}s, errors: ${errors.length})`);
await browser.close();
process.exit(passed ? 0 : 1);
