/**
 * E2E: play the side game "Hühner fangen mit der kleinen Mia" from start to
 * finish with real key presses — chase every hen with the arrow keys, dive
 * with Space when one is close, lead the chick to the coop ramp, find the
 * golden hen behind the hay — and verify the game returns to the island with
 * the controls free again.
 *
 * A slow best time (600 s) is stored before the game starts, so the ending
 * must announce a new record and save the faster time.
 *
 * Hen positions are read from `window.engine.scene.state`; every action is a
 * real keyboard press. The camera never turns here: ArrowUp = -z, ArrowRight = +x.
 *
 * Usage: node scripts/e2e/hens.mjs [baseUrl]
 * Output: scripts/e2e/out/hens/{*.png, summary.json, console.log}
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = "scripts/e2e/out/hens";
const TIMEOUT_MS = 300_000;
const BEST_KEY = "schatzkarten_hens_best";
const SEEDED_BEST = 600;
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

await page.addInitScript(
  ([key, best]) => {
    // Reason: seed once per tab, so a dev-server reload mid-run doesn't undo a saved record
    if (!sessionStorage.getItem("hens-e2e-seeded")) {
      localStorage.setItem(key, String(best));
      sessionStorage.setItem("hens-e2e-seeded", "1");
    }
    // Frames per wall-clock second, for the frame-rate report
    window.__fps = [];
    let n = 0;
    let t0 = performance.now();
    const tick = (t) => {
      n++;
      if (t - t0 >= 1000) {
        window.__fps.push(Math.round((n * 1000) / (t - t0)));
        n = 0;
        t0 = t;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  [BEST_KEY, SEEDED_BEST],
);

const started = Date.now();
await page.goto(`${BASE}/?challenge=hens`);

let reloads = 0;
page.on("framenavigated", (f) => {
  if (f === page.mainFrame() && Date.now() - started > 3000) reloads++;
});

const read = () =>
  page
    .evaluate(() => {
      const scene = window.engine?.scene;
      const s = scene?.state;
      return {
        onIsland: !!scene && "island" in scene,
        state: s ?? null,
        dialogue: !!document.querySelector(".dialogue.open"),
        fpsLog: window.__fps ?? [],
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

// ── Steering with held arrow keys ──────────────────────────────

const held = new Set();
async function hold(keys) {
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

/** Arrow keys that walk from `from` towards `to` (8 directions). */
function arrowsTowards(from, to) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const d = Math.hypot(dx, dz) || 1;
  const keys = [];
  if (dx / d > 0.38) keys.push("ArrowRight");
  if (dx / d < -0.38) keys.push("ArrowLeft");
  if (dz / d > 0.38) keys.push("ArrowDown");
  if (dz / d < -0.38) keys.push("ArrowUp");
  return keys;
}

/** What to run at: the ramp when the chick tags along, otherwise the closest loose bird. */
function pickTarget(s) {
  const p = s.player;
  const chick = s.hens.find((h) => h.kind === "chick");
  if (chick?.state === "follow") return { name: "ramp", at: s.ramp, chase: false };
  let best = null;
  for (const h of s.hens) {
    if (["hidden", "flying", "home", "follow"].includes(h.state)) continue;
    const d = Math.hypot(h.x - p[0], h.z - p[1]);
    if (!best || d < best.d) best = { name: h.name, at: [h.x, h.z], chase: h.kind !== "chick", d };
  }
  return best;
}

// ── Play ───────────────────────────────────────────────────────

const phasesSeen = new Set();
const track = { last: null, lastHome: 0, flutters: 0, dives: 0, chickFollowed: false, goldenSeen: false, maxGameSeconds: 0 };
const prevHen = new Map();
let lastDive = 0;
let stuck = { pos: null, since: Date.now(), escapeUntil: 0, escapeKeys: [] };
let playFps = [];
let fpsMark = null;
let result = null;

while (Date.now() - started < TIMEOUT_MS) {
  const r = await read();
  if (!r) {
    await hold([]);
    await page.waitForTimeout(500);
    continue;
  }
  if (r.onIsland) {
    result = r;
    break;
  }
  const s = r.state;
  if (!s) {
    await page.waitForTimeout(200);
    continue;
  }
  track.last = s;
  track.maxGameSeconds = Math.max(track.maxGameSeconds, s.seconds);
  phasesSeen.add(s.phase);

  if (r.dialogue) {
    await hold([]);
    if (s.phase === "intro") await shotOnce("01-intro-mia", 900);
    if (s.phase === "golden") await shotOnce("06-golden-dialogue", 600);
    if (s.phase === "finale") await shotOnce("09-ending-dialogue", 700);
    await page.keyboard.press("Space");
    await page.waitForTimeout(280);
    continue;
  }

  if (s.phase === "intro") {
    await shotOnce("00-establishing", 2400);
    await page.waitForTimeout(150);
    continue;
  }
  if (s.phase === "golden") {
    await hold([]);
    await shotOnce("05-golden-reveal", 1300);
    await page.waitForTimeout(150);
    continue;
  }
  if (s.phase === "finale" || s.phase === "done") {
    await hold([]);
    await shotOnce("08-finale-celebration", 2600);
    await page.waitForTimeout(150);
    continue;
  }
  if (s.phase !== "play" || s.busy) {
    await hold([]);
    await page.waitForTimeout(120);
    continue;
  }

  // Frame-rate window: everything between the first and the last moment of free play
  // Reason: a dev-server reload restarts the frame log, so start the window afresh
  if (fpsMark === null || r.fpsLog.length < fpsMark) fpsMark = r.fpsLog.length;
  playFps = r.fpsLog.slice(fpsMark);

  // Screenshots of the juicy moments
  const flying = s.hens.find((h) => h.state === "flying");
  if (flying && !shots.has("03-catch-gack")) await shotOnce("03-catch-gack", 120);
  if (s.home !== track.lastHome) track.lastHome = s.home;
  if (s.home >= 3) await shotOnce("04-three-home");
  // A fresh hen just escaped the first grab with her sideways flutter ("Hui!")
  const flutters = s.hens.filter((h) => h.dodged).length;
  if (flutters > track.flutters) {
    track.flutters = flutters;
    if (flutters >= 2) await shotOnce("03-escape-flutter", 150);
  }
  const chick = s.hens.find((h) => h.kind === "chick");
  if (chick?.state === "follow") {
    track.chickFollowed = true;
    await shotOnce("04-chick-follows", 500);
  }
  const golden = s.hens.find((h) => h.kind === "golden");
  if (golden && golden.state !== "hidden" && golden.state !== "home") {
    track.goldenSeen = true;
    if (golden.state === "dash") await shotOnce("07-golden-dash", 150);
  }
  if (s.seconds > 3) await shotOnce("02-play");

  const target = pickTarget(s);
  if (!target) {
    await hold([]);
    await page.waitForTimeout(120);
    continue;
  }

  // Aim a little ahead of a running hen
  let aim = target.at;
  const prev = prevHen.get(target.name);
  if (target.chase && prev) {
    const dt = Math.max((Date.now() - prev.t) / 1000, 0.05);
    const vx = (target.at[0] - prev.at[0]) / dt;
    const vz = (target.at[1] - prev.at[1]) / dt;
    if (Math.hypot(vx, vz) < 8) aim = [target.at[0] + vx * 0.35, target.at[1] + vz * 0.35];
  }
  for (const h of s.hens) prevHen.set(h.name, { at: [h.x, h.z], t: Date.now() });

  // Unstick: if Tadeo hasn't moved for a while, walk sideways for a moment
  const now = Date.now();
  if (!stuck.pos || Math.hypot(s.player[0] - stuck.pos[0], s.player[1] - stuck.pos[1]) > 0.25) {
    stuck.pos = s.player;
    stuck.since = now;
  } else if (now - stuck.since > 1600 && now > stuck.escapeUntil) {
    const sides = [["ArrowLeft"], ["ArrowRight"], ["ArrowUp"], ["ArrowDown"]];
    stuck.escapeKeys = sides[Math.floor(Math.random() * sides.length)];
    stuck.escapeUntil = now + 700;
    stuck.since = now;
  }
  const keys = now < stuck.escapeUntil ? stuck.escapeKeys : arrowsTowards(s.player, aim);
  await hold(keys);

  // Dive at a close hen (never at the chick or the ramp)
  const dist = Math.hypot(target.at[0] - s.player[0], target.at[1] - s.player[1]);
  if (target.chase && dist < 1.9 && dist > 0.6 && s.grounded && now - lastDive > 900) {
    lastDive = now;
    track.dives++;
    await page.keyboard.press("Space");
  }
  await page.waitForTimeout(70);
}
await hold([]);

// ── Back on the island ─────────────────────────────────────────

let controlsFree = false;
let best = null;
if (result) {
  await page.waitForFunction(() => !window.engine.isSwitching, null, { timeout: 10_000 }).catch(() => {});
  controlsFree = await page
    .waitForFunction(() => window.game.busy === false, null, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/10-back-on-island.png` });
  shots.add("10-back-on-island");
  best = await page.evaluate((key) => Number(localStorage.getItem(key)), BEST_KEY);
}

const last = track.last ?? {};
const fps = playFps.length ? playFps : [];
const avgFps = fps.length ? Math.round(fps.reduce((a, b) => a + b, 0) / fps.length) : null;
const allHome = last.home === last.total && last.total === 7;
const recordSaved = !!best && best < SEEDED_BEST && Math.abs(best - last.seconds) < 0.2;

const summary = {
  test: "hens",
  passed: !!result && controlsFree && errors.length === 0 && allHome && last.record === true && recordSaved,
  backOnIsland: !!result,
  controlsFree,
  allSevenHome: allHome,
  chickFollowed: track.chickFollowed,
  goldenHenFound: track.goldenSeen,
  newRecordAnnounced: last.record === true,
  bestTimeSaved: best,
  seededBest: SEEDED_BEST,
  gameSeconds: Math.round(last.seconds ?? 0),
  dives: track.dives,
  escapeFlutters: (last.hens ?? []).filter((h) => h.dodged).length,
  phasesSeen: [...phasesSeen],
  fps: { avg: avgFps, min: fps.length ? Math.min(...fps) : null, secondsBelow55: fps.filter((f) => f < 55).length, perSecond: fps },
  durationSec: Math.round((Date.now() - started) / 1000),
  devServerReloads: reloads,
  errors,
  screenshots: [...shots].map((s) => `${OUT}/${s}.png`),
};
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
writeFileSync(`${OUT}/console.log`, logs.join("\n"));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
process.exit(summary.passed ? 0 : 1);
