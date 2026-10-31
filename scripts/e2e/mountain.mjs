/**
 * E2E proof for the mountain challenge (quest 9, golden hammer).
 *
 * Opens `?challenge=mountain`, advances the dialogues with Space and climbs
 * the spiral path with real key presses: ArrowRight is held to walk (and to
 * climb ladders), Space jumps. Each tick a small autopilot reads the live
 * state (`window.engine.scene.autopilot()`: path position, gaps, step-ups,
 * rolling rocks, snowball drops) and decides whether to jump, walk, wait or
 * back off. It also walks into the first gap on purpose ("Hoppla!" → respawn
 * on safe ground just before it) and lets the first rolling rock hit Tadeo
 * ("Autsch!" → respawn at the last checkpoint). Passes when the summit is
 * reached, the hammer is handed over, the game is back on the island and no
 * page errors occurred. The talk at the start and at the summit says whose
 * shrine it is and what the hammer is for.
 *
 * Run:  node scripts/e2e/mountain.mjs [baseUrl]
 * Out:  scripts/e2e/out/mountain/*.png + summary.json
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "out", "mountain");
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
const dialogueOpen = () => page.evaluate(() => !!document.querySelector(".dialogue.open"));
const onIsland = () => page.evaluate(() => !!window.engine?.scene && window.engine.scene.name !== "mountain" && "island" in window.engine.scene);
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

/**
 * Runs in the page: reads the climb state and decides the keys to hold and whether to jump.
 * `skipGap` walks into the first gap without jumping, `takeRock` lets a rolling rock hit.
 */
function pilot(opts) {
  const sc = window.engine?.scene;
  if (!sc || sc.name !== "mountain") return null;
  const a = sc.autopilot();
  const SPEED = 5.6;
  const out = {
    state: a.state,
    talking: a.talking,
    s: a.s,
    y: a.y,
    mode: a.mode,
    grounded: a.grounded,
    checkpoint: a.checkpoint,
    end: a.end,
    keys: [],
    jump: false,
    why: "",
    rolling: a.hazards.rollers.filter((r) => r.phase === "roll").length,
    waiting: a.hazards.rollers.filter((r) => r.phase === "wobble").length,
    drops: a.hazards.drops.length,
    pop: document.querySelector(".chx-pop")?.textContent ?? null,
    itemGet: !!document.querySelector(".item-get.show"),
  };
  if (a.state !== "play" || a.talking) return out;

  // Snowballs: only the moment of impact counts — pick forward, wait or back off so Tadeo isn't under one then
  const safe = (v) => a.hazards.drops.every((d) => d.left > 1.25 || Math.abs(d.s - (a.s + v * SPEED * d.left)) > 1.5);
  const v = [1, 0, -1].find(safe) ?? 1;
  if (v > 0) out.keys.push("ArrowRight");
  if (v < 0) out.keys.push("ArrowLeft");
  if (v !== 1) out.why = "snowball";
  if (a.mode !== "walk" || v !== 1) return out;

  // In the air over a gap: ease off the arrow key so a short stepping stone isn't overshot
  const pieces = sc.course.pieces;
  if (!a.grounded) {
    // Reason: the latest gap whose take-off zone we are past is the one this jump is crossing
    const g = a.gaps.filter((g) => a.s > g.s0 - 1.5 && a.s < g.s1 + 2.5).pop();
    const p = g && pieces.find((p) => p.s0 >= g.s1 - 0.01);
    if (p && p.s1 - p.s0 < 3) {
      const t = (a.vy + Math.sqrt(Math.max(0, a.vy * a.vy + 48 * (a.y - p.y0)))) / 24;
      if (a.s + a.vs * t > p.s0 + (p.s1 - p.s0) * 0.4) out.keys = [];
    }
    return out;
  }

  // Rolling rocks: jump so the rock passes under Tadeo at the top of his jump
  for (const r of a.hazards.rollers) {
    if (r.phase !== "roll" || opts.takeRock) continue;
    const d = r.s - a.s;
    const tc = d / (Math.max(a.vs, 0) + r.v);
    if (d > 0 && tc > 0.18 && tc < 0.36) [out.jump, out.why] = [true, "rock"];
  }
  // Gaps: take off 0.6–1.15 m before the edge at running speed (or right at the edge)
  for (const [i, g] of a.gaps.entries()) {
    if (i === 0 && opts.skipGap) continue;
    if (a.s > g.s0 - 1.15 && a.s < g.s0 + 0.05 && (a.vs > 4 || a.s > g.s0 - 0.3)) [out.jump, out.why] = [true, "gap"];
  }
  // Step-ups too tall to walk
  for (const st of a.steps) if (a.s > st.s - 1.0 && a.s < st.s) [out.jump, out.why] = [true, "step"];
  return out;
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
let jumps = 0;
const falls = [];
const hits = [];
const reached = new Set();
let last = null;
try {
  await page.goto(`${BASE}/?challenge=mountain`);
  await waitFor(() => page.evaluate(() => window.engine?.scene?.name === "mountain" && window.game?.ui), "mountain scene", 30000);
  await recordLines();
  log("mountain loaded");
  await sleep(1000);
  await shot("01_intro_hammer");
  await waitFor(dialogueOpen, "mountain_enter dialogue", 20000);
  await sleep(1600);
  await shot("02_mountain_enter");
  await skipDialogues("03_tadeo_tips");
  await waitFor(() => page.evaluate(() => window.engine.scene.state === "play"), "play state", 10000);
  await sleep(400);
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
  const course = await page.evaluate(() => {
    const c = window.engine.scene.course;
    return { gaps: c.gaps(), checkpoints: c.checkpoints, ladders: c.ladders, bridge: c.pieces.find((p) => p.kind === "bridge") };
  });

  const playStart = Date.now();
  const opts = { skipGap: true, takeRock: false };
  let hurtAt = 0;
  let hurtKind = null;
  const end = Date.now() + 300000;
  while (Date.now() < end) {
    const s = await page.evaluate(pilot, opts);
    if (!s) throw new Error("challenge scene vanished during play");
    last = s;
    if (s.state === "finale" || s.state === "done") break;
    if (s.talking) {
      await holdKeys([]);
      await skipDialogues();
      continue;
    }
    // Failure paths: a fall into the first gap, then (after Felswand) a hit by a rolling rock
    if (s.state === "hurt" && !hurtAt) {
      hurtAt = Date.now();
      hurtKind = s.mode === "ouch" ? "hit" : "fall";
      await holdKeys([]);
      await sleep(hurtKind === "hit" ? 150 : 250);
      const pop = await page.evaluate(() => document.querySelector(".chx-pop")?.textContent ?? null);
      log(`${hurtKind} at s=${s.s.toFixed(2)} y=${s.y.toFixed(2)}, pop "${pop}"`);
      await shot(hurtKind === "hit" ? "09_autsch" : "05_hoppla");
      (hurtKind === "hit" ? hits : falls).push({ s: Math.round(s.s * 100) / 100, pop });
      continue;
    }
    if (hurtAt && s.state === "play") {
      await holdKeys([]);
      const cp = course.checkpoints[s.checkpoint].s;
      if (hurtKind === "fall") {
        const fall = falls[falls.length - 1];
        const gap = course.gaps.filter((g) => g.s0 < fall.s + 0.5).pop();
        fall.respawnS = Math.round(s.s * 100) / 100;
        log(`respawned after fall at s=${s.s.toFixed(2)} (gap starts at ${gap?.s0})`);
        if (!gap || s.s > gap.s0 - 0.3 || s.s < gap.s0 - 15 || !s.grounded) throw new Error("fall respawn was not on safe ground before the gap");
        if (opts.skipGap) {
          opts.skipGap = false;
          await sleep(200);
          await shot("06_hoppla_respawn");
        }
      } else {
        hits[hits.length - 1].respawnS = Math.round(s.s * 100) / 100;
        hits[hits.length - 1].checkpoint = s.checkpoint;
        log(`respawned after hit at s=${s.s.toFixed(2)} (checkpoint ${s.checkpoint} at ${cp})`);
        if (Math.abs(s.s - cp) > 0.5) throw new Error("hit respawn was not at the last checkpoint");
        opts.takeRock = false;
        await sleep(200);
        await shot("10_autsch_respawn");
      }
      hurtAt = 0;
      continue;
    }

    await holdKeys(s.keys);
    if (s.jump) {
      await page.keyboard.press("Space");
      jumps++;
      log(`jump (${s.why}) at s=${s.s.toFixed(2)}`);
    }

    if (s.checkpoint > 0 && !reached.has(`cp${s.checkpoint}`)) {
      reached.add(`cp${s.checkpoint}`);
      log(`checkpoint ${s.checkpoint} "${course.checkpoints[s.checkpoint].name}" at s=${s.s.toFixed(1)} y=${s.y.toFixed(1)}`);
      if (s.checkpoint === 1) {
        await sleep(200);
        await shot("07_checkpoint_felswand");
        // Let the first rolling rock hit Tadeo once
        if (!hits.length) opts.takeRock = true;
      }
      if (s.checkpoint === 3) {
        await sleep(200);
        await shot("15_checkpoint_gipfelweg");
      }
    }
    if (s.mode === "climb" && !reached.has("ladder")) {
      reached.add("ladder");
      await sleep(250);
      await shot("08_ladder");
    }
    if (s.waiting > 0 && s.s > 79 && !reached.has("rock")) {
      reached.add("rock");
      await shot("11_rock_warning");
    }
    if (s.rolling > 0 && !opts.takeRock && hits.length && !reached.has("rockjump") && s.why === "rock") {
      reached.add("rockjump");
      await sleep(180);
      await shot("12_rock_jump");
    }
    if (s.drops > 0 && !reached.has("drop")) {
      reached.add("drop");
      await shot("13_snowball_ring");
    }
    if (course.bridge && s.s > course.bridge.s0 + 3 && s.s < course.bridge.s1 && !reached.has("bridge")) {
      reached.add("bridge");
      await shot("14_rope_bridge");
    }
    if (s.s > 170 && !reached.has("stairs")) {
      reached.add("stairs");
      await shot("16_summit_stairs");
    }
    await sleep(25);
  }
  await holdKeys([]);
  if (last?.state !== "finale" && last?.state !== "done") throw new Error(`summit not reached (s=${last?.s?.toFixed(1)})`);
  playSeconds = (Date.now() - playStart) / 1000;
  log(`summit reached after ${playSeconds.toFixed(1)}s of play, ${jumps} jumps, ${falls.length} falls, ${hits.length} hits`);
  if (!falls.length || falls.some((f) => f.respawnS === undefined)) throw new Error("fall/respawn path was not exercised");
  if (!hits.length || hits.some((h) => h.respawnS === undefined)) throw new Error("hit/respawn path was not exercised");
  if (last.checkpoint < 3) throw new Error(`only ${last.checkpoint} checkpoints were reached`);
  await sleep(1800);
  await shot("17_finale_walk");
  await waitFor(() => page.evaluate(() => !!document.querySelector(".item-get.show")), "item-get", 15000);
  await sleep(900);
  await shot("18_item_get_hammer");
  await waitFor(dialogueOpen, "mountain_complete dialogue", 15000);
  await sleep(1800);
  await shot("19_mountain_complete");
  await skipDialogues();
  await waitFor(onIsland, "return to island", 30000);
  await sleep(1500);
  await shot("20_back_on_island");
  const scene = await page.evaluate(() => window.engine.scene.name ?? "island");
  log(`back on the island (scene: ${scene})`);

  // ── What was said ─────────────────────────────────────────
  const lines = await said();
  const words = (l) => l.split(": ").slice(1).join(": ").split(/\s+/).length;
  // Reason: "Gack!" is Chuleta's cluck, not a sentence
  const sentences = (l) => (l.replace(/\bGack!?/g, "").match(/[.!?]+(\s|$)/g) ?? []).length;
  check("the shrine is the old people's", lines.some((l) => l.startsWith("Chuleta: ") && l.includes("alte Volk")));
  check("the hammer's job is said", lines.some((l) => l.startsWith("Tadeo: ") && l.includes("für das Eis")));
  check("Chuleta spots the small island and the fin", lines.some((l) => l.startsWith("Chuleta: ") && l.includes("kleine Insel") && l.includes("Flosse")));
  check("the climb names no Schatzinsel", !lines.some((l) => l.includes("Schatzinsel")));
  check("every line is one or two short sentences", lines.every((l) => words(l) <= 14 && sentences(l) <= 2), lines.filter((l) => words(l) > 14 || sentences(l) > 2).join(" | "));
  check("nobody says the forbidden words", !/\b(die Alten|Altar|ewiges Eis|besänftigen)/.test(lines.join("\n")));
  passed = errors.length === 0 && checks.every((c) => c.ok);
} catch (e) {
  log(`FAILED: ${e.message}`);
  await shot("fail").catch(() => {});
}

const summary = {
  challenge: "mountain",
  passed,
  seconds: (Date.now() - t0) / 1000,
  playSeconds,
  fps: Math.round(fps * 10) / 10,
  jumps,
  falls,
  hits,
  reached: [...reached],
  last,
  checks,
  errors,
  steps,
};
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
for (const c of checks.filter((k) => !k.ok)) console.log(`FAILED CHECK: ${c.name} ${c.detail}`);
console.log(passed ? "PASS" : "FAIL", JSON.stringify({ seconds: summary.seconds, fps: summary.fps, errors: errors.length }));
await browser.close();
process.exit(passed ? 0 : 1);
