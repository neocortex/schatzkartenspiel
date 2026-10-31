/**
 * E2E proof for the volcano challenge (quest 2).
 *
 * Opens `?challenge=volcano`, advances the dialogues with Space and walks
 * Tadeo across the lava field with real arrow-key presses. Each tick a small
 * autopilot reads the live state (`window.engine.scene`: hero position,
 * camera yaw, trail, flying lava bombs) and picks the arrow keys that keep
 * moving along the trail while staying out of the warning circles. After the
 * first checkpoint it deliberately steps into one circle once to prove the
 * kid-friendly "Autsch!" + respawn at the checkpoint.
 *
 * The two broken crossings are played the way a child plays them, with nothing
 * but ArrowUp and Space: run until the edge stops you, tap Space. The first
 * crossing misses twice on purpose. At the goal Space frees Paco from under the
 * rock, the conversation plays, and the game goes back to the island. Passes
 * when every check holds and no page errors occurred.
 *
 * Run:  node scripts/e2e/volcano.mjs [baseUrl]
 * Out:  scripts/e2e/out/volcano/*.png + summary.json
 */

import { chromium } from "playwright";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { courseHands, pilot } from "./volcanoPilot.mjs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out", "volcano");
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
const { holdKeys, heroState, untilStopped, untilLanded } = courseHands(page);
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

// ── The crossings, played by hand ─────────────────────────────

/** Keeps pushing against an edge for a moment; true when Tadeo stayed in play and out of the lava all along. */
async function pushAgainstEdge(ms = 1200) {
  const end = Date.now() + ms;
  let safe = true;
  while (Date.now() < end) {
    const now = await heroState();
    safe = safe && now.state === "play" && !now.lava;
    await sleep(60);
  }
  return safe;
}

const hand = { misses: 0, sawOuch: false, firstMissReturned: false, secondMissReturned: false, stubSafe: null, bankSafe: null, rockSafe: null, crossed: new Set() };

/** A jump that falls short: straight up with only a tap of ArrowUp, so he comes down in the gap. */
async function missOnce() {
  await holdKeys([]);
  await sleep(150);
  await page.keyboard.press("Space");
  await holdKeys(["ArrowUp"]);
  await sleep(110);
  await holdKeys([]);
  let ouch = false;
  let word = false;
  for (let i = 0; i < 60 && !ouch; i++) {
    const now = await heroState();
    ouch = now.state === "ouch";
    word = word || now.pop.includes("Autsch");
    if (now.grounded && !now.lava && i > 12) break;
    await sleep(30);
  }
  if (!ouch) return;
  await sleep(120);
  const inOuch = await heroState();
  word = word || inOuch.pop.includes("Autsch");
  hand.misses++;
  if (hand.misses === 1) await shot("h3_missed_jump");
  await waitFor(async () => (await heroState()).state === "play", "respawn after a missed jump", 4000);
  const back = await page.evaluate(() => {
    const sc = window.engine.scene;
    const p = sc.course.checkpoints[sc.checkpoint].pos;
    return Math.hypot(sc.hero.position.x - p.x, sc.hero.position.z - p.y);
  });
  log(`missed jump ${hand.misses}: "Autsch" ${word}, back ${back.toFixed(2)} m from the checkpoint`);
  hand.sawOuch = hand.sawOuch || word;
  if (hand.misses === 1) hand.firstMissReturned = back < 1.5;
  if (hand.misses === 2) hand.secondMissReturned = back < 1.5 && word;
}

/** Beside the stub the bank ends at the lava too; pushing against it must not drop him in. */
async function bankCheck(i) {
  const pos = await page.evaluate((i) => {
    const sc = window.engine.scene;
    const b = sc.course.bridges.filter((x) => x.gap)[i];
    // Reason: the river runs at a slant, so one side of the deck has bank further out than the other
    for (const side of [1, -1]) {
      const x = b.center.x + b.dir.x * (b.gap[0] - 1) - b.dir.y * side * 2.8;
      const z = b.center.y + b.dir.y * (b.gap[0] - 1) + b.dir.x * side * 2.8;
      if (sc.course.canStand(x, z) && !sc.course.bridgeAt(x, z)) {
        sc.hero.teleport(x, z);
        return [x, z];
      }
    }
    return null;
  }, i);
  if (!pos) return;
  await holdKeys(["ArrowUp"]);
  await untilStopped();
  hand.bankSafe = await pushAgainstEdge();
  await shot("h1_bank_edge");
  await holdKeys([]);
}

/**
 * Plays one broken crossing with nothing but ArrowUp and Space.
 *
 * @returns true when Tadeo came out on the far side; false when he was sent back and must walk here again.
 */
async function crossByHand(i) {
  log(`crossing ${i + 1}: by hand`);
  if (i === 1 && hand.bankSafe === null) {
    await holdKeys([]);
    await bankCheck(i);
    return false;
  }
  await holdKeys(["ArrowUp"]);
  if (!(await untilStopped())) return false;
  if (hand.stubSafe === null) {
    hand.stubSafe = await pushAgainstEdge();
    await shot("h2_stub_end");
  }
  if (i === 0 && hand.misses < 2) {
    await missOnce();
    return false;
  }
  await page.keyboard.press("Space");
  await sleep(260);
  await shot(`h4_crossing${i + 1}_jump`);
  const onRock = await untilLanded();
  if (onRock.state !== "play" || !onRock.onRock) {
    log(`crossing ${i + 1}: first jump landed off the rock (state ${onRock.state}, rock ${onRock.onRock})`);
    await waitFor(async () => (await heroState()).state === "play", "respawn", 4000);
    hand.failedJumps = (hand.failedJumps ?? 0) + 1;
    return false;
  }
  await sleep(200);
  await shot(`h5_crossing${i + 1}_on_rock`);
  if (!(await untilStopped())) return false;
  if (hand.rockSafe === null) hand.rockSafe = await pushAgainstEdge();
  await page.keyboard.press("Space");
  const far = await untilLanded();
  if (far.state !== "play" || far.lava || far.onRock) {
    log(`crossing ${i + 1}: second jump landed badly (state ${far.state}, lava ${far.lava}, rock ${far.onRock})`);
    if (far.state !== "play") await waitFor(async () => (await heroState()).state === "play", "respawn", 4000);
    hand.failedJumps = (hand.failedJumps ?? 0) + 1;
    return false;
  }
  hand.crossed.add(i);
  log(`crossing ${i + 1}: across`);
  await holdKeys([]);
  return true;
}

/** Everything the course promises before a single step is taken. */
function courseFacts() {
  const sc = window.engine.scene;
  const c = sc.course;
  const d = sc.director;
  const broken = c.bridges.filter((b) => b.gap);
  // Edge-to-edge gaps along a crossing: stub end to rock, rock to rock, rock to stub end
  const gaps = [];
  const rockOf = (b) =>
    c.rocks
      .filter((r) => Math.hypot(r.x - b.center.x, r.z - b.center.y) < b.halfLen)
      .sort((p, q) => (p.x - b.center.x) * b.dir.x + (p.z - b.center.y) * b.dir.y - ((q.x - b.center.x) * b.dir.x + (q.z - b.center.y) * b.dir.y));
  for (const b of broken) {
    const at = (u) => ({ x: b.center.x + b.dir.x * u, z: b.center.y + b.dir.y * u, r: 0 });
    const path = [at(b.gap[0]), ...rockOf(b), at(b.gap[1])];
    for (let i = 0; i < path.length - 1; i++) gaps.push(Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z) - path[i].r - path[i + 1].r);
  }
  // Bombs aimed at Tadeo while he stands on a rock or at a stub's end: not one of them may land near a rock
  let picks = 0;
  let near = 0;
  const still = { x: 0, y: 0, z: 0 };
  for (const r of c.rocks) {
    for (let i = 0; i < 400; i++) {
      const t = d.pickTarget({ x: r.x, y: r.y, z: r.z }, c.trailS(r.x, r.z), still, 2.6);
      if (!t) continue;
      picks++;
      if (c.rocks.some((q) => Math.hypot(t.x - q.x, t.z - q.z) < 3)) near++;
    }
  }
  // The scripted run to the rock starts wherever he crosses the goal line: no spot across the trail may leave him stuck
  const rescue = sc.set.rescue;
  const line = c.goalS + 3;
  const lineAt = c.pointAt(line);
  const lineDir = c.tangentAt(line);
  let blockedRuns = 0;
  for (let k = -1; k <= 1; k += 0.125) {
    const off = k * c.halfWidth(line);
    const x0 = lineAt.x - lineDir.y * off;
    const z0 = lineAt.y + lineDir.x * off;
    if (!c.canStand(x0, z0)) continue;
    const len = Math.hypot(rescue.liftSpot.x - x0, rescue.liftSpot.y - z0);
    for (let u = 0; u <= len; u += 0.2) {
      const x = x0 + ((rescue.liftSpot.x - x0) * u) / len;
      const z = z0 + ((rescue.liftSpot.y - z0) * u) / len;
      if (!c.canStand(x, z) || sc.set.colliders.hits(x, z, 0.35)) {
        blockedRuns++;
        break;
      }
    }
  }
  return {
    blockedRuns,
    intervalStart: d.intervalAt(0),
    intervalEnd: d.intervalAt(1),
    wholeBridges: c.bridges.filter((b) => !b.gap).length,
    firstBridgeWhole: !c.bridges[0].gap,
    crossings: broken.length,
    rocks: sc.e2e.rocks,
    gaps,
    perCrossing: broken.map((b) => rockOf(b).length),
    picks,
    near,
    paco: sc.e2e.paco,
    lifts: sc.e2e.lifts,
    liftsNeeded: sc.e2e.liftsNeeded,
    fog: sc.scene.fog.color.getHexString(),
  };
}

const sourceFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []));

/** Close-up of the stone: camera in front of the hollow, Tadeo moved there so the sharp shadows cover it. */
async function altarCloseUps() {
  await page.evaluate(() => {
    const sc = window.engine.scene;
    const a = sc.set.altar;
    const yaw = a.group.rotation.y;
    const front = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const at = a.hollowAt;
    sc.__start = { x: sc.hero.position.x, z: sc.hero.position.z };
    sc.hero.teleport(at.x + front.x * 7, at.z + front.z * 7);
    window.__shots = {
      wide: { pos: { x: at.x + front.x * 9 + front.z * 4, y: at.y + 2.4, z: at.z + front.z * 9 - front.x * 4 }, look: { x: at.x, y: at.y - 0.4, z: at.z } },
      near: { pos: { x: at.x + front.x * 3.6 + front.z * 1.1, y: at.y + 0.9, z: at.z + front.z * 3.6 - front.x * 1.1 }, look: { x: at.x, y: at.y - 0.05, z: at.z } },
    };
    document.querySelector(".dialogue").style.visibility = "hidden";
  });
  const view = async (name, shotKey, heart) => {
    await page.evaluate(
      ([shotKey, heart]) => {
        const sc = window.engine.scene;
        const s = window.__shots[shotKey];
        const V = sc.hero.position.constructor;
        const pos = new V(s.pos.x, s.pos.y, s.pos.z);
        const look = new V(s.look.x, s.look.y, s.look.z);
        sc.cinematic = () => ({ pos, look });
        sc.set.altar.setHeart(heart);
      },
      [shotKey, heart],
    );
    await sleep(700);
    await shot(name);
  };
  await view("a1_altar_wide", "wide", false);
  await view("a2_altar_empty", "near", false);
  await view("a3_altar_heart", "near", true);
  await view("a4_altar_heart_wide", "wide", true);
  await page.evaluate(() => {
    const sc = window.engine.scene;
    sc.set.altar.setHeart(false);
    sc.hero.teleport(sc.__start.x, sc.__start.z);
    sc.cinematic = () => {
      const p = sc.hero.position;
      const V = p.constructor;
      return { pos: new V(p.x + 3.5, p.y + 3.2, p.z + 7.5), look: new V(p.x - 0.5, p.y + 1.4, p.z - 2) };
    };
    document.querySelector(".dialogue").style.visibility = "";
    delete window.__shots;
  });
}

/** Reads the conversations at the goal line by line, advancing with Space. */
async function hearLines() {
  const heard = [];
  const end = Date.now() + 40000;
  while (Date.now() < end && !(await onIsland())) {
    if (!(await dialogueOpen())) {
      await sleep(120);
      continue;
    }
    // Reason: Space first finishes the typewriter, so the line is read whole; the second press moves on
    await page.keyboard.press("Space");
    await sleep(160);
    const line = await page.evaluate(() => ({ speaker: document.querySelector(".dialogue .name")?.textContent, text: document.querySelector(".dialogue .text")?.textContent }));
    if (!heard.length || heard[heard.length - 1].text !== line.text) {
      heard.push(line);
      log(`${line.speaker}: ${line.text}`);
      await sleep(350);
      await shot(`g${heard.length}_line`);
    }
    await page.keyboard.press("Space");
    await sleep(320);
  }
  return heard;
}

/** A mode with the heart: Tadeo carries it, the sky and the rock rate follow the mode, and Paco is not there. */
async function heartModeChecks(rescueFog) {
  const wiring = await page.evaluate(async () => {
    const { VolcanoChallenge } = await import("/src/challenges/volcano/VolcanoChallenge.ts");
    const { RESCUE } = await import("/src/challenges/volcano/modes.ts");
    const sky = { zenith: RESCUE.sky.zenith.clone().setHex(0x2a1420), horizon: RESCUE.sky.horizon.clone().setHex(0xc23a1e), sunGlow: RESCUE.sky.sunGlow.clone().setHex(0xff5a2a) };
    const c = new VolcanoChallenge({ engine: window.engine, ui: window.game.ui }, { bombInterval: [1.15, 0.6], sky, carriesHeart: true, ending: async () => {} });
    window.__heartRun = c;
    await window.engine.setScene(c, 300);
    return true;
  });
  check("a mode's fields reach the challenge", wiring === true);
  await waitFor(() => page.evaluate(() => window.__heartRun?.state === "intro" && !!document.querySelector(".dialogue.open")), "heart run's first line", 20000);
  await skipDialogues();
  await waitFor(() => page.evaluate(() => window.engine.scene.state === "play"), "heart run in play", 10000);
  await sleep(1800);
  const facts = await page.evaluate(() => {
    const sc = window.engine.scene;
    let heart = false;
    sc.hero.avatar.root.traverse((o) => {
      if (o.name === "feuerherz") heart = true;
    });
    return {
      heart,
      start: sc.director.intervalAt(0),
      end: sc.director.intervalAt(1),
      paco: sc.e2e.paco,
      fog: sc.scene.fog.color.getHexString(),
      altar: !!sc.set.altar,
    };
  });
  check("a mode with the heart puts it on Tadeo", facts.heart);
  check("a mode's rock rate reaches the bombs", facts.start === 1.15 && facts.end === 0.6, `${facts.start}→${facts.end}`);
  check("no Paco when Tadeo carries the heart", facts.paco === "none", facts.paco);
  check("a mode's sky reaches the scene", facts.fog !== rescueFog && facts.altar, `${rescueFog}→${facts.fog}`);
  await shot("z1_carrying_the_heart");
}

// ── Play ──────────────────────────────────────────────────────

let passed = false;
let fps = 0;
let playSeconds = 0;
let respawnCheck = null;
const reached = new Set();
let last = null;
let flyingNearRocks = 0;
try {
  await page.goto(`${BASE}/?challenge=volcano`);
  await waitFor(() => page.evaluate(() => window.engine?.scene?.state === "intro"), "volcano scene", 25000);
  log("volcano loaded");

  const facts = await page.evaluate(courseFacts);
  const maxGap = Math.max(...facts.gaps);
  check("half the rocks", facts.intervalStart === 2.3 && facts.intervalEnd === 1.2, `${facts.intervalStart}→${facts.intervalEnd}`);
  check("one whole bridge, two crossings of rocks", facts.wholeBridges === 1 && facts.crossings === 2 && facts.firstBridgeWhole, `${facts.wholeBridges} whole, ${facts.crossings} broken`);
  check("each crossing has one or two rocks", facts.perCrossing.every((n) => n >= 1 && n <= 2), facts.perCrossing.join(","));
  check("rocks are generous", facts.rocks.every((r) => r.r >= 1.1) && maxGap <= 2.2, `radii ${facts.rocks.map((r) => r.r.toFixed(2))}, max gap ${maxGap.toFixed(2)}`);
  check("no bomb is ever aimed near a hop rock", facts.picks > 0 && facts.near === 0, `${facts.near} of ${facts.picks}`);
  const volcanoSources = sourceFiles(join(HERE, "..", "..", "src", "challenges", "volcano")).map((f) => readFileSync(f, "utf8")).join("\n");
  check("no ZIEL arch", !/goalArch|"ZIEL"/.test(volcanoSources));
  check("Paco starts under the rock", facts.paco === "stuck" && facts.lifts === 0 && facts.liftsNeeded === 6, `${facts.paco}, ${facts.lifts}/${facts.liftsNeeded}`);
  check("the way to the rock is free from anywhere across the trail", facts.blockedRuns === 0, `${facts.blockedRuns} blocked`);

  await sleep(2400);
  await shot("01_intro_volcano");
  await waitFor(dialogueOpen, "volcano_enter dialogue", 20000);
  await sleep(500);
  await shot("02_volcano_enter");
  await altarCloseUps();

  // The tips, read as they come: the one about the broken bridge must be among them
  let heardBridgeTip = false;
  while (await dialogueOpen()) {
    await page.keyboard.press("Space");
    await sleep(220);
    // Reason: a press either finishes the typing or moves on, so only reading after every press sees each whole line
    const text = await page.evaluate(() => document.querySelector(".dialogue .text")?.textContent ?? "");
    if (text.includes("Die Brücke ist kaputt")) heardBridgeTip = true;
  }
  check("Tadeo says how to cross the broken bridge", heardBridgeTip);
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
  const end = Date.now() + 240000;
  while (Date.now() < end) {
    const s = await page.evaluate(pilot, mode);
    if (!s) throw new Error("challenge scene vanished during play");
    last = s;
    flyingNearRocks = Math.max(flyingNearRocks, s.bombsNearRocks);
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
    if (mode === "seek" && !respawnCheck && Date.now() - seekStart > 45000) throw new Error("no hit while seeking a circle");
    if (mode === "avoid" && s.state === "play" && s.atCrossing >= 0) {
      await crossByHand(s.atCrossing);
      continue;
    }
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
      await shot("11_goal_altar");
    }
    await sleep(30);
  }
  await holdKeys([]);
  if (last?.state !== "won") throw new Error(`goal not reached (s=${last?.s?.toFixed(1)})`);
  playSeconds = (Date.now() - playStart) / 1000;
  log(`goal reached after ${playSeconds.toFixed(1)}s of play, hits ${last.hits}, checkpoints ${[...reached].join(",")}`);
  if (!respawnCheck) throw new Error("hit/respawn path was not exercised");
  if (last.checkpoint < 3) throw new Error(`only ${last.checkpoint} checkpoints were reached`);

  check("walking off a bank or rock doesn't drop you in lava", hand.stubSafe && hand.bankSafe && hand.rockSafe, `stub ${hand.stubSafe}, bank ${hand.bankSafe}, rock ${hand.rockSafe}`);
  check("a missed jump says Autsch and returns to the checkpoint", hand.sawOuch && hand.firstMissReturned);
  check("missing twice in a row still returns", hand.secondMissReturned);
  check("both crossings can be played with ArrowUp and Space alone", hand.crossed.size === 2 && !hand.failedJumps, `failed jumps ${hand.failedJumps ?? 0}`);
  const live = await page.evaluate(() => window.engine.scene.e2e);
  check("no bomb lands near a hop rock", live.bombsNearRocks === 0 && flyingNearRocks === 0, `counted ${live.bombsNearRocks}, seen ${flyingNearRocks}`);

  // ── At the stone ──────────────────────────────────────────
  check("reaching the goal does not free Paco by itself", live.paco === "stuck" && live.lifts === 0, `${live.paco} ${live.lifts}`);
  await sleep(600);
  await shot("12_at_the_goal");
  await waitFor(() => page.evaluate(() => !!document.querySelector(".prompt") && document.querySelector(".prompt").style.display !== "none"), "lift prompt", 15000);
  await sleep(1300);
  await shot("13_paco_stuck");
  await sleep(2500);
  const waiting = await page.evaluate(() => ({ e2e: window.engine.scene.e2e, state: window.engine.scene.state, dialogue: !!document.querySelector(".dialogue.open"), status: document.body.innerText.includes("Stein") }));
  check("the challenge waits for Tadeo", !(await onIsland()) && waiting.e2e.paco === "stuck" && !waiting.dialogue && waiting.status, `${waiting.e2e.paco}, status ${waiting.status}`);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Space");
    await sleep(320);
    if (i === 2) await shot("14_lifting");
  }
  await sleep(300);
  await shot("15_rock_rolls_away");
  const freed = await page.evaluate(() => ({ ...window.engine.scene.e2e, state: window.engine.scene.state }));
  check("Tadeo frees Paco with Space", freed.paco === "free" && freed.lifts === freed.liftsNeeded, `${freed.paco} ${freed.lifts}/${freed.liftsNeeded}`);
  check("the challenge ends only after that", freed.state === "won" && !(await onIsland()), freed.state);
  await sleep(1200);
  await shot("16_paco_free");

  const heard = await hearLines();
  const want = [
    ["Käpt'n Paco", "Danke, Junge! Ich bin Käpt'n Paco."],
    ["Tadeo", "Was ist das für ein Stein?"],
    ["Käpt'n Paco", "Ach, alter Kram."],
    ["Tadeo", "Mein Boot ist kaputt."],
    ["Käpt'n Paco", "Das flicke ich dir. Komm ins Dorf!"],
    ["Käpt'n Paco", "Nimm die Trittsteine. Auf der Brücke sitzt ein Oger."],
  ];
  check("the conversation plays in two beats, line by line", want.every(([sp, tx], i) => heard[i]?.speaker === sp && heard[i]?.text === tx) && heard.length === want.length, `${heard.length} lines`);
  await waitFor(onIsland, "return to island", 30000);
  await sleep(1500);
  await shot("20_back_on_island");
  log("back on the island");

  await heartModeChecks(facts.fog);

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  passed = checks.every((c) => c.ok);
} catch (e) {
  log(`FAILED: ${e.message}`);
  await shot("fail").catch(() => {});
}

const failed = checks.filter((c) => !c.ok).map((c) => c.name);
const summary = {
  challenge: "volcano",
  passed,
  seconds: (Date.now() - t0) / 1000,
  playSeconds,
  fps: Math.round(fps * 10) / 10,
  hits: last?.hits ?? null,
  checkpoints: last?.checkpoint ?? null,
  respawnCheck,
  misses: hand.misses,
  checks,
  failed,
  errors,
  steps,
  command: "node scripts/e2e/volcano.mjs",
};
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(passed ? "PASS" : "FAIL", `(${summary.seconds.toFixed(1)}s, checks ${checks.length - failed.length}/${checks.length}, errors: ${errors.length})`);
await browser.close();
process.exit(passed ? 0 : 1);
