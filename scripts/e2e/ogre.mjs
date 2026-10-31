/**
 * E2E proof for the ogre quest (quest 8): the fight and the boulder.
 *
 * Opens `?quest=8` on the island, where the boulder still shuts the mountain
 * trail, walks to the gate at the east end of the bridge and starts the fight
 * with one Space. Advances dialogues with Space and fights the whole
 * battle with real key presses on the card menu (← → to pick, Space to go).
 * It reads the live state (`window.engine.scene.phase / rules / menu /
 * blocker`) only to decide what to press: try the locked special once
 * (gentle hint), heal once after taking damage, use the special when charged,
 * otherwise attack. During the ogre's swings it presses Space when the shield
 * ring turns green. On the first swing it presses too early once ("Zu früh!")
 * and then lets the swing hit on purpose; every later swing is blocked,
 * including the big slam (BOING). Back on the island the ogre lifts the
 * boulder: his walk, his line, the throw and the landing are photographed and
 * the way to the mountain gate must be open. Passes when all checks hold and
 * no page errors occurred.
 *
 * Run:  node scripts/e2e/ogre.mjs [baseUrl]
 * Out:  scripts/e2e/out/ogre/*.png + summary.json
 */

import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installFlood, reach } from "./storyChecks.mjs";

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
const story = () => page.evaluate(() => window.game.story.e2e);
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
const sawLine = async (text) => (await said()).some((l) => l.endsWith(text));

// ── Steering ──────────────────────────────────────────────────

const held = new Set();
async function hold(keys) {
  for (const k of held) if (!keys.has(k)) await page.keyboard.up(k);
  for (const k of keys) if (!held.has(k)) await page.keyboard.down(k);
  held.clear();
  for (const k of keys) held.add(k);
}

/** Steer Tadeo on the island with the arrow keys (the camera looks north: Up = -z, Right = +x). */
async function walkIsland(x, z, radius = 1, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const p = await page.evaluate(() => [window.game.island.player.position.x, window.game.island.player.position.z]);
    const [dx, dz] = [x - p[0], z - p[1]];
    if (Math.hypot(dx, dz) < radius) break;
    const keys = new Set();
    if (dx > 0.3) keys.add("ArrowRight");
    if (dx < -0.3) keys.add("ArrowLeft");
    if (dz > 0.3) keys.add("ArrowDown");
    if (dz < -0.3) keys.add("ArrowUp");
    await hold(keys);
    await sleep(40);
  }
  await hold(new Set());
}
const player = () => page.evaluate(() => [window.game.island.player.position.x, window.game.island.player.position.z]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The gate at the east end of the bridge, and the mountain gate at the far end of the trail behind the boulder. */
const GATE = [53.5, 0.5];
const MOUNTAIN_GATE = [55.5, -13.5];

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

// ── The boulder scene ─────────────────────────────────────────

/** What the scene was seen to do, filled by `watchBoulderScene`. */
const scene = { mouth: { ogre: null, tadeo: null }, longestFrame: 0, rock: { peak: 0, lastSeen: null }, ogreAtRest: null, phases: [], sat: [], bubbles: 0 };
/** The scene's phases in which the ogre is on his feet; he sits only in his seat by the river, before and after. */
const ON_HIS_FEET = ["walk", "talk", "heave", "airborne", "landed", "cheer"];

/**
 * Looks on while the ogre gets up, walks to the boulder, speaks, throws it and sits down by the river; presses Space
 * on the talks and photographs every beat once. Returns when the quest has moved on to the mountain.
 */
async function watchBoulderScene() {
  const beat = () =>
    page.evaluate(() => {
      const g = window.game;
      const ogre = g.sightings.ogre;
      const giant = g.story.boulder.prop.group.children[0];
      return {
        milestone: g.quest.currentMilestone,
        busy: g.busy,
        dialogue: !!document.querySelector(".dialogue.open"),
        line: window.said.at(-1) ?? "",
        talking: ogre.talking,
        pose: ogre.pose,
        bubble: g.sightings.bubble.speaking,
        ogreAt: [ogre.root.position.x, ogre.root.position.z],
        rockY: giant.position.y,
        ...g.story.e2e,
      };
    });
  // Reason: a stall while the scene plays is what a child would see as a stutter
  await page.evaluate(() => {
    window.frameWatch = { longest: 0, last: performance.now(), on: true };
    const tick = (now) => {
      window.frameWatch.longest = Math.max(window.frameWatch.longest, now - window.frameWatch.last);
      window.frameWatch.last = now;
      if (window.frameWatch.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const seen = new Set();
  const once = async (name, delay = 0) => {
    if (seen.has(name)) return;
    seen.add(name);
    if (delay) await sleep(delay);
    await shot(name);
  };
  // Reason: the ogre's pose and the greeting bubble are looked at on every look at the scene, also while a child would still be reading
  const note = (b) => {
    if (b.pose === "sit" && ON_HIS_FEET.includes(b.lift)) scene.sat.push(`${b.lift}`);
    // The quest is still 8 until the scene is over: any bubble up until then is the arrival greeting
    if (b.bubble && b.milestone === 8) scene.bubbles++;
  };
  const end = Date.now() + 90000;
  let last = null;
  while (Date.now() < end) {
    last = await beat();
    note(last);
    if (!scene.phases.includes(last.lift)) scene.phases.push(last.lift);
    scene.rock.peak = Math.max(scene.rock.peak, last.rockY);
    if (last.lift === "rest") scene.ogreAtRest = last.ogreAt;
    if (last.milestone >= 9 && !last.busy) break;
    if (last.dialogue) {
      // Reason: his mouth moves for his own line and stays shut for Tadeo's
      if (last.line.startsWith("Oger: Der Fels")) scene.mouth.ogre = last.talking;
      if (last.line.startsWith("Tadeo: Das ist der Riesenfels")) scene.mouth.tadeo = last.talking;
      await once(last.lift === "talk" ? "21_tadeo_asks_the_ogre" : "27_chuleta_is_impressed", 700);
      // A child reads before pressing Space: look at the ogre for two more seconds
      if (last.lift === "talk" && !seen.has("read")) {
        seen.add("read");
        for (let i = 0; i < 7; i++) {
          await sleep(300);
          note(await beat());
        }
      }
      await page.keyboard.press("Space");
      await sleep(260);
      continue;
    }
    if (last.lift === "walk") await once("20_ogre_gets_up");
    if (last.lift === "heave") await once("22_ogre_lifts", 900);
    if (last.lift === "airborne") await once("23_boulder_flies", 150);
    if (last.lift === "landed") {
      await once("24_boulder_lands", 100);
      await once("25_splash", 500);
    }
    if (last.lift === "rest") await once("28_ogre_sits_down", 900);
    await sleep(40);
  }
  scene.longestFrame = await page.evaluate(() => {
    window.frameWatch.on = false;
    return window.frameWatch.longest;
  });
  if (!(last.milestone >= 9 && !last.busy)) throw new Error(`the boulder scene did not end: ${JSON.stringify(last)}`);
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
  // The boulder shuts the trail, and the gate to the fight is at the east end of the bridge
  await page.addInitScript(installFlood);
  await page.goto(`${BASE}/?quest=8`);
  await waitFor(() => page.evaluate(() => window.game?.story && window.engine?.scene === window.game.island), "the island", 30000);
  await sleep(800);
  await recordLines();
  let island = await story();
  check("the boulder and the ogre stand on the island before the fight", island.boulder && island.ogre === "bridge", JSON.stringify(island));
  check("the boulder closes the trail to the mountain gate", !(await reach(page, GATE, MOUNTAIN_GATE, { loose: true })));
  await walkIsland(GATE[0], GATE[1] + 1.2);
  await sleep(500);
  const prompt = await page.evaluate(() => document.querySelector(".prompt")?.textContent.trim() ?? "");
  check("the gate is at the east end of the bridge", dist(await player(), GATE) < 4 && prompt.includes("Los geht's"), prompt);
  await shot("00_gate_at_the_bridge");
  await page.keyboard.press("Space");
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
  log("back on the island: the ogre gets up and goes to the boulder");
  await watchBoulderScene();
  await sleep(1200);
  await shot("30_trail_is_free");

  // ── The story afterwards ──────────────────────────────────
  const lines = await said();
  island = await story();
  check("the ogre lifts the boulder after the fight", !island.boulder && (await sawLine("Der Fels? Den hebe ich dir mit einer Hand!")), JSON.stringify(island));
  check("no rock or collider of the boulder is left", await page.evaluate(() => {
    const { colliders } = window.game.island.island;
    return window.game.story.boulder.circles.every((c) => !colliders.hits(c.x, c.z, 0));
  }));
  check("he is the friend by the river afterwards", island.ogre === "friend", island.ogre);
  const seat = await page.evaluate(() => [window.game.sightings.ogre.root.position.x, window.game.sightings.ogre.root.position.z]);
  check("he stays where he sat down once the quest moves on", scene.ogreAtRest && dist(scene.ogreAtRest, seat) < 0.3 && dist(seat, [57.5, -3]) < 0.3, JSON.stringify({ seat, scene: scene.ogreAtRest }));
  check("he stays on his feet from the moment he walks to the boulder until the throw is done", scene.sat.length === 0, `sitting during: ${scene.sat.join()}`);
  check("no greeting bubble comes up before or during the scene", scene.bubbles === 0, `${scene.bubbles} looks with a bubble up`);
  check("the scene ran through every beat", ["walk", "talk", "heave", "airborne", "landed", "cheer", "rest"].every((p) => scene.phases.includes(p)), scene.phases.join());
  check("the boulder was lifted high and thrown, not just made to vanish", scene.rock.peak > 5, `peak ${scene.rock.peak.toFixed(1)} m`);
  check("his mouth moves for his line and not for Tadeo's", scene.mouth.ogre === true && scene.mouth.tadeo === false, JSON.stringify(scene.mouth));
  check("no frame stalls during the scene", scene.longestFrame < 250, `longest frame ${scene.longestFrame.toFixed(0)} ms`);
  check("Tadeo can walk to the mountain gate afterwards", await reach(page, GATE, MOUNTAIN_GATE));
  const after = await page.evaluate(() => ({ milestone: window.game.quest.currentMilestone, busy: window.game.busy }));
  check("the quest moved on to the mountain once the scene was over", after.milestone === 9 && !after.busy, JSON.stringify(after));
  const own = await page.evaluate(async () => {
    const { DIALOGUES } = await import("/src/data/dialogues.ts");
    return [...DIALOGUES.ogre_enter, ...DIALOGUES.ogre_defeat, ...DIALOGUES.ogre_boulder, ...DIALOGUES.ogre_boulder_done].map((l) => `${l.speaker}: ${l.text}`);
  });
  const words = (l) => l.split(": ").slice(1).join(": ").split(/\s+/).length;
  // Reason: "Gack!" is Chuleta's cluck, not a sentence
  const sentences = (l) => (l.replace(/\bGack!?/g, "").match(/[.!?]+(\s|$)/g) ?? []).length;
  const spoken = lines.filter((l) => /^(Tadeo|Oger|Chuleta): /.test(l));
  check("the ogre quest's own talks were all heard", own.every((l) => lines.includes(l)), own.filter((l) => !lines.includes(l)).join(" | "));
  check("every line is one or two short sentences", [...own, ...spoken].every((l) => words(l) <= 14 && sentences(l) <= 2), [...own, ...spoken].filter((l) => words(l) > 14 || sentences(l) > 2).join(" | "));
  check("nobody says the forbidden words", !/\b(die Alten|Altar|ewiges Eis|besänftigen)/.test(lines.join("\n")));
  passed = errors.length === 0 && checks.every((c) => c.ok);
} catch (e) {
  log(`FAILED: ${e.message}`);
  await shot("fail").catch(() => {});
} finally {
  await hold(new Set()).catch(() => {});
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
  scene,
  checks,
  errors,
  steps,
  command: "node scripts/e2e/ogre.mjs",
};
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
for (const c of checks.filter((k) => !k.ok)) console.log(`FAILED CHECK: ${c.name} ${c.detail}`);
console.log(passed ? "PASS" : "FAIL", `(${summary.seconds.toFixed(1)}s, errors: ${errors.length})`);
await browser.close();
process.exit(passed ? 0 : 1);
