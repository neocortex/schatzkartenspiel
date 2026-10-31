/**
 * E2E proof for the sea challenge (quest 10: berries for the shark).
 *
 * Opens `?quest=10` on the island, where Paco and the ogre wait at the dock with
 * the mended boat and the wreck has gone. Tadeo walks to the end of the pier and
 * hears Paco; then the whole crossing is played with real key presses: the live
 * state (`window.engine.scene.e2e`) only decides which arrow key to hold (towards
 * the starfish trail's next safe x) and when the shark's timing ring is green.
 * On the first leap it presses Space too early on purpose and then lets the leap
 * go by, so the shark only flops beside the boat. Three berries in the green
 * window calm the shark. Passes when it swims away happy, the chain runs on into
 * the treasure island and the save points back to the dock at quest 11.
 *
 * Run:  node scripts/e2e/sea.mjs [baseUrl]
 * Out:  scripts/e2e/out/sea/*.png + summary.json
 */

import { chromium } from "playwright";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5199";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out", "sea");
const SEA_DIR = join(HERE, "..", "..", "src", "challenges", "sea");
const NORTH_DOCK_END = [-36, -76];
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
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
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

/** Steer Tadeo on the island with the arrow keys (the camera looks north: Up = -z, Right = +x). */
async function walkIsland(x, z, radius = 0.6, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const p = await page.evaluate(() => [window.game.island.player.position.x, window.game.island.player.position.z]);
    if (dist(p, [x, z]) < radius) break;
    const keys = [];
    if (x - p[0] > 0.3) keys.push("ArrowRight");
    if (x - p[0] < -0.3) keys.push("ArrowLeft");
    if (z - p[1] > 0.3) keys.push("ArrowDown");
    if (z - p[1] < -0.3) keys.push("ArrowUp");
    await hold(new Set(keys));
    await sleep(40);
  }
  await hold(new Set());
}

/** Notes every dialogue line, so a short line is never missed. */
async function recordLines() {
  await page.evaluate(() => {
    window.said = [];
    const box = Object.getPrototypeOf(window.game.ui.dialogue);
    const begin = box.showLine;
    box.showLine = function () {
      begin.call(this);
      window.said.push(`${this.script[this.index].speaker}: ${this.script[this.index].text}`);
    };
  });
}

/**
 * Runs in the page, every frame of the sea scene: what mood the shark is in, where each thrown berry flies,
 * and how far the jaw opens from each landing until the next leap (or, after the last berry, the wave goodbye).
 */
function watchFight() {
  const sc = window.engine.scene;
  const watch = { moods: [], flights: [], mouthAfterFeed: [] };
  window.seaWatch = watch;
  let flight = null;
  let fed = 0;
  let mouth = null;
  const tick = () => {
    if (window.engine.scene !== sc) return;
    if (watch.moods.at(-1) !== sc.shark.mood) watch.moods.push(sc.shark.mood);
    if (sc.fight.leaping || sc.shark.waving) mouth = null;
    if (sc.fight.throws > fed) {
      fed = sc.fight.throws;
      mouth = { landed: performance.now(), ms: 0, jaw: 0, jawAtMs: 0 };
      watch.mouthAfterFeed.push(mouth);
    }
    if (mouth) {
      mouth.ms = Math.round(performance.now() - mouth.landed);
      if (sc.shark.jawOpen > mouth.jaw) {
        mouth.jaw = sc.shark.jawOpen;
        mouth.jawAtMs = mouth.ms;
      }
    }
    const berry = sc.scene.getObjectByName("thrownBerry");
    if (berry?.visible) {
      const y = berry.position.y;
      flight ??= { start: performance.now(), fromY: y, peakY: y };
      flight.peakY = Math.max(flight.peakY, y);
      flight.end = performance.now();
      flight.gap = berry.position.distanceTo(sc.shark.mouthPos());
      flight.toY = y;
    } else if (flight) {
      watch.flights.push({ ms: Math.round(flight.end - flight.start), gap: flight.gap, arc: flight.peakY - Math.max(flight.fromY, flight.toY) });
      flight = null;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Frames the game really draws per second (the 60 fps cap can skip browser ticks). */
const drawRate = (ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const input = window.engine.input;
        const begin = input.beginFrame;
        let drawn = 0;
        input.beginFrame = function () {
          drawn++;
          begin.call(input);
        };
        const start = performance.now();
        setTimeout(() => {
          input.beginFrame = begin;
          resolve((drawn * 1000) / (performance.now() - start));
        }, ms);
      }),
    ms,
  );

const waitForScene = async (name, timeout = 40000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await page.evaluate(() => window.engine.scene?.constructor?.name ?? "")).toLowerCase().includes(name)) return true;
    await sleep(100);
  }
  return false;
};

// ── Play ──────────────────────────────────────────────────────

let passed = false;
let fps = 0;
let collected = 0;
let finished = false;
try {
  // ── The hammer stays out of it ────────────────────────────
  const seaSources = readdirSync(SEA_DIR)
    .map((f) => readFileSync(join(SEA_DIR, f), "utf8"))
    .join("\n");
  check("no hammer in the sea scene", !/createHammer/.test(seaSources));
  check("nothing of the hammer fight is left", !/hammer|bonk|dizzy/i.test(seaSources), seaSources.match(/.*(hammer|bonk|dizzy).*/i)?.[0] ?? "");
  check("the boat is the mended one", /patched: true/.test(readFileSync(join(SEA_DIR, "boat.ts"), "utf8")));

  // ── At the dock ───────────────────────────────────────────
  await page.goto(`${BASE}/?quest=10`);
  await waitFor(() => page.evaluate(() => window.game?.story && window.engine?.scene === window.game.island), "the island", 30000);
  await sleep(800);
  await recordLines();
  const story = await page.evaluate(() => window.game.story.e2e);
  check("Paco and the ogre wait at the dock", story.paco === "dock" && story.ogre === "dock" && story.dockBoat, JSON.stringify(story));
  check("the wreck left the beach", !story.wreck);
  await page.evaluate(([x, z]) => window.game.placePlayer(x, z), [-33, -69.5]);
  await sleep(800);
  await walkIsland(-34.5, -73.3);
  await sleep(500);
  const prompt = await page.evaluate(() => document.querySelector(".prompt")?.textContent.trim() ?? "");
  check("the end of the pier offers the crossing", prompt.includes("Los geht"), prompt);
  await shot("00_dock");
  await page.keyboard.press("Space");
  await waitFor(dialogueOpen, "Paco at the dock", 5000);
  await sleep(1200);
  await shot("00a_paco_talks");
  await skipDialogues();
  await waitFor(async () => (await state())?.challenge === "sea", "sea scene", 20000);
  await page.evaluate(watchFight);
  log("sea loaded");
  await sleep(1400);
  await shot("01_pier_home_island");
  await waitFor(dialogueOpen, "sea_crossing dialogue", 15000);
  await sleep(600);
  await skipDialogues("02_sea_crossing");
  await waitFor(async () => (await state()).phase === "sail", "sailing", 10000);
  await sleep(1500);
  await shot("03_setting_sail");
  check("the trail is starfish", await page.evaluate(() => !!window.engine.scene.scene.getObjectByName("starfish")));
  const trail = await page.evaluate(() => {
    const scene = window.engine.scene.scene;
    const fish = scene.getObjectByName("starfish");
    const glow = scene.getObjectByName("starfishGlow");
    return { instanced: fish.isInstancedMesh, count: fish.count, culled: fish.frustumCulled || glow.frustumCulled, fog: glow.material.fog, additive: glow.material.blending === 2 };
  });
  check("the trail's glow is additive, without fog, and never culled", trail.instanced && trail.count > 30 && !trail.culled && !trail.fog && trail.additive, JSON.stringify(trail));
  fps = await drawRate(2500);
  let baseline = 57.7;
  try {
    baseline = Number(readFileSync(join(HERE, "out", "baseline.txt"), "utf8").match(/drawRate ([\d.]+)/)[1]);
  } catch {
    // Reason: the baseline file is a local proof, not in git; a fresh clone falls back to the number it held
  }
  check("runs at the baseline fps", fps >= baseline - 3, `${fps.toFixed(1)}, baseline ${baseline}`);

  // Steer along the starfish trail with the arrow keys
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
  collected = s.starfish;
  log(`course done with ${collected} starfish`);
  check("starfish are collected along the trail", collected > 25, collected);

  // ── The shark ─────────────────────────────────────────────
  await waitFor(dialogueOpen, "sea_shark dialogue", 20000);
  await sleep(500);
  await skipDialogues("07_shark_fin");
  await waitFor(async () => (await state()).leaping, "first leap", 30000);
  const hands = await page.evaluate(() => ({ berries: window.engine.scene.boat.berries.visible, hammer: "hammer" in window.engine.scene.boat }));
  check("Tadeo holds the berries, no hammer", hands.berries && !hands.hammer, JSON.stringify(hands));
  await sleep(150);
  const throwsBeforeMiss = (await state()).throws;
  const beforeRing = await state();
  await page.keyboard.press("Space");
  log("pressed Space too early on purpose");
  await sleep(250);
  await shot("08_too_early");
  await waitFor(async () => !(await state()).leaping, "the first leap to pass", 10000);
  await sleep(600);
  await shot("08a_splash");
  const throwsAfterMiss = (await state()).throws;
  check("a press outside the green window doesn't count", throwsAfterMiss === throwsBeforeMiss && !beforeRing.ringNow, `${throwsBeforeMiss} then ${throwsAfterMiss}`);
  check("a miss is no game over: the fight goes on", (await state()).phase === "shark");
  await page.keyboard.press("Space");
  await sleep(200);
  check("a press between the leaps doesn't count either", (await state()).throws === throwsAfterMiss);

  let shotRing = false;
  const sharkEnd = Date.now() + 120000;
  while (true) {
    if (Date.now() > sharkEnd) throw new Error("shark not calmed within 120 s");
    s = await state();
    if (!s || s.phase !== "shark") break;
    if (s.throws >= 3 && !s.leaping) break;
    if (s.leaping && s.ringNow) {
      if (!shotRing) {
        await shot("09_green_ring");
        shotRing = true;
      }
      await sleep(120);
      await page.keyboard.press("Space");
      const n = s.throws + 1;
      log(`throw ${n}`);
      await sleep(120);
      await shot(`10_berry_${n}_flying`);
      await waitFor(async () => (await state()).throws >= n, `berry ${n} landing`, 8000);
      const landed = Date.now();
      await shot(`11_chomp_${n}`);
      await sleep(600);
      await shot(`12_chewing_${n}`);
      // Reason: 3.5 s of game time plus the 0.1 s hit stop: the swallow is done and the shark is still up, showing its face
      await sleep(3600 - (Date.now() - landed));
      await shot(`12a_swallowed_${n}`);
      await waitFor(async () => !(await state()).leaping, "leap over", 8000);
      continue;
    }
    await sleep(40);
  }
  const fed = await state();
  log(`shark got ${fed.throws} berries`);
  check("three throws in the green window calm the shark", fed.throws === 3, fed.throws);
  await waitFor(() => page.evaluate(() => window.engine.scene.shark.waving), "the shark waving", 20000);
  await sleep(800);
  await shot("13_shark_waves_goodbye");
  const hearts = await page.evaluate(() => window.engine.scene.hearts.group.children.filter((h) => h.visible).length);
  check("hearts rise from the happy shark", hearts > 0, hearts);
  await waitFor(() => page.evaluate(() => !window.engine.scene.shark.waving), "the wave to end", 10000);
  await sleep(350);
  await shot("14_tail_flip");
  await waitFor(dialogueOpen, "shark_defeat dialogue", 20000);
  await skipDialogues();
  await waitFor(async () => (await state())?.phase === "arrive", "arrival", 10000);
  const fight = await state();
  check("the shark swims away happy", fight.mood === "happy", fight.mood);
  const watch = await page.evaluate(() => window.seaWatch);
  check("the shark goes from angry to happy, never dizzy", watch.moods[0] !== "happy" && watch.moods.includes("angry") && watch.moods.at(-1) === "happy" && !watch.moods.includes("dizzy"), watch.moods.join(" > "));
  check("each throw flies a berry, a press too early none", watch.flights.length === 3, JSON.stringify(watch.flights));
  check("the berry arcs for about 0.35 s", watch.flights.every((f) => f.ms > 250 && f.ms < 550 && f.arc > 0.2), JSON.stringify(watch.flights));
  check("the berry lands in the mouth", watch.flights.every((f) => f.gap < 0.9), JSON.stringify(watch.flights));
  // Reason: chewing opens the jaw up to 0.2 and at rest it stands at 0.15; a leap opens it to 1.2. The length proves each watch covered the whole swallow
  check("the mouth stays small from each landing until the next leap", watch.mouthAfterFeed.length === 3 && watch.mouthAfterFeed.every((m) => m.jaw < 0.3 && m.ms > 4000), JSON.stringify(watch.mouthAfterFeed.map(({ ms, jaw, jawAtMs }) => ({ ms, jaw: +jaw.toFixed(2), jawAtMs }))));
  await sleep(4000);
  await shot("15_treasure_island_ahead");
  await waitFor(dialogueOpen, "X dialogue", 40000);
  await sleep(600);
  await skipDialogues("16_beach_x");
  await sleep(500);
  await shot("17_geschafft");
  await waitFor(async () => (await state())?.phase === "done" || (await state())?.challenge !== "sea", "finished", 20000);
  finished = true;
  log("sea challenge finished");

  // ── What was said ─────────────────────────────────────────
  const lines = await page.evaluate(() => window.said);
  log(lines.join(" | "));
  const words = (l) => l.split(": ").slice(1).join(": ").split(/\s+/).length;
  // Reason: "Gack!" is Chuleta's cluck, not a sentence
  const sentences = (l) => (l.replace(/\bGack!?/g, "").match(/[.!?]+(\s|$)/g) ?? []).length;
  check("Paco says who brought the boat", lines.some((l) => l.startsWith("Käpt'n Paco: ") && l.includes("geflickt") && l.includes("Oger")));
  check("Paco explains the starfish", lines.some((l) => l.includes("Seesternen")));
  check("Chuleta knows what a monster needs", lines.some((l) => l.startsWith("Chuleta: ") && l.includes("Beeren")));
  check("Tadeo offers the berries", lines.includes("Tadeo: Hier, Hai! Mach den Mund auf!"));
  check("afterwards the shark is friendly", lines.some((l) => l.startsWith("Tadeo: ") && l.includes("wieder lieb")));
  check("nobody beats the shark", !/besieg/.test(lines.join("\n")));
  check("every line is one or two short sentences", lines.every((l) => words(l) <= 14 && sentences(l) <= 2), lines.filter((l) => words(l) > 14 || sentences(l) > 2).join(" | "));
  check("nobody says the forbidden words", !/\b(die Alten|Altar|ewiges Eis|besänftigen)/.test(lines.join("\n")));

  // ── On to the treasure island ─────────────────────────────
  check("the chain into the treasure still runs", await waitForScene("treasure"));
  await sleep(1500);
  await shot("18_next_challenge");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("schatzkarten_save")));
  check("the save points to the dock at quest 11", saved.milestone === 11 && dist([saved.playerX, saved.playerY], NORTH_DOCK_END) < 6, JSON.stringify(saved));
  check("the berries stay in the inventory", saved.items.includes("berry"), saved.items.join(", "));
  passed = errors.length === 0 && checks.every((c) => c.ok);
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
  starfish: collected,
  checks,
  errors,
  steps,
  command: "node scripts/e2e/sea.mjs",
};
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
for (const c of checks.filter((k) => !k.ok)) console.log(`FAILED CHECK: ${c.name} ${c.detail}`);
console.log(passed ? "PASS" : "FAIL", `(${summary.seconds.toFixed(1)}s, errors: ${errors.length})`);
await browser.close();
process.exit(passed ? 0 : 1);
