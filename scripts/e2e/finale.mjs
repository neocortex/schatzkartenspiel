/**
 * E2E proof for the last quest, played the way a child reaches it.
 *
 * It starts at `?challenge=sea` and sails the real chain with real key presses:
 * the shark, the treasure island (the map card, reached through the boat trip and
 * not by URL), the eruption, the black screen and the narrator's line. When the
 * finale scene starts it reloads the page and presses Continue, which proves the
 * save. From there Tadeo walks through "Los geht's!", climbs the volcano with the
 * autopilot from `volcano.mjs`, sets the heart back with Space, and the island
 * celebrates: festival, confession, fireworks, end card, save gone.
 *
 * Run:  node scripts/e2e/finale.mjs [baseUrl]
 * Out:  scripts/e2e/out/finale/*.png + summary.json + console.log
 */

import { chromium } from "playwright";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5199";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out", "finale");
const NORTH_DOCK_END = [-36, -76];
const SAIL_BACK = "Tadeo segelt zurück, so schnell er kann.";
const HUETER_THANKS = "Danke, Tadeo. Jetzt kann ich endlich ruhen.";
const FESTIVAL_GUESTS = ["Oger", "Fuchs", "Käpt'n Paco", "Dorfältester", "Kleine Mia", "Fischer Jonas", "Bäckerin Lina", "Maulwurf", "Chuleta", "Tadeo"];
const FORBIDDEN = ["die Alten", "Altar", "ewiges Eis", "besänftigen"];
const MAX_WORDS = 14;
const MAX_FESTIVAL_LINES = 12;
/** In the wide shot: a part of the cone with the lava river on it and no sky, column or word in it. */
const LAVA_ON_THE_CONE = [0.35, 0.4, 0.48, 0.66];
// Start from an empty folder so every screenshot belongs to this run
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
// Reason: other edits to the dev server's files would trigger a Vite full reload mid-run;
// a silent mock of the HMR websocket keeps this test's page stable
await page.routeWebSocket(/.*/, () => {});
const errors = [];
const steps = [];
const checks = [];
const logs = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  logs.push(`[${m.type()}] ${m.text()}`);
});

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
const dialogueOpen = () => page.evaluate(() => !!document.querySelector(".dialogue.open")).catch(() => false);
const shot = async (name) => {
  const png = await page.screenshot({ path: join(OUT, `${name}.png`) });
  log(`screenshot ${name}.png`);
  return png;
};

async function waitFor(fn, what, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(80);
  }
  throw new Error(`timeout waiting for ${what}`);
}

/** Press Space until no dialogue is open (each press completes or advances a line). */
async function skipDialogues() {
  while (await dialogueOpen()) {
    await page.keyboard.press("Space");
    await sleep(260);
  }
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

/** Notes every dialogue line, read from the box itself, so a short line is never missed. */
async function recordLines() {
  await page.waitForFunction(() => window.game?.ui?.dialogue, null, { timeout: 30000 });
  await page.evaluate(() => {
    window.said = [];
    const box = Object.getPrototypeOf(window.game.ui.dialogue);
    const begin = box.showLine;
    box.showLine = function () {
      begin.call(this);
      window.said.push({ speaker: this.script[this.index].speaker, text: this.script[this.index].text });
    };
  });
}
const heard = () => page.evaluate(() => window.said);

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

/** What part of a frame is made of. `box` is [left, top, right, bottom] as fractions of the frame. */
const frameStats = (png, box = [0, 0, 1, 1]) =>
  page.evaluate(
    async ({ b64, box }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const g = canvas.getContext("2d");
      g.drawImage(bitmap, 0, 0);
      const [l, t] = [Math.round(box[0] * bitmap.width), Math.round(box[1] * bitmap.height)];
      const px = g.getImageData(l, t, Math.round(box[2] * bitmap.width) - l, Math.round(box[3] * bitmap.height) - t).data;
      const n = px.length / 4;
      let [r, gr, b, hot, warm] = [0, 0, 0, 0, 0];
      for (let i = 0; i < px.length; i += 4) {
        r += px[i];
        gr += px[i + 1];
        b += px[i + 2];
        // Reason: only lava's yellow-white core is this bright; the red sky has hardly any green, so it cannot count
        if (px[i] > 235 && px[i + 1] > 160) hot++;
        if (px[i] > 170 && px[i + 1] > 90 && px[i + 2] < 140) warm++;
      }
      return { r: Math.round(r / n), g: Math.round(gr / n), b: Math.round(b / n), bright: Math.round((r + gr + b) / 3 / n), hot, warm };
    },
    { b64: png.toString("base64"), box },
  );

const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("schatzkarten_save") ?? "null"));
const noSave = async () => (await saved()) === null;

/** The island as the flow sees it. */
const island = () =>
  page.evaluate(() => {
    const g = window.game;
    const p = g.island.player.position;
    const prompt = document.querySelector(".prompt");
    return {
      player: [p.x, p.z],
      milestone: g.quest.currentMilestone,
      free: !g.busy && !g.ui.dialogue.isOpen && !window.engine.isSwitching,
      onIsland: window.engine.scene === g.island,
      prompt: prompt?.style.display !== "none" ? prompt?.textContent.trim() : "",
      rumble: g.story.e2e?.lastRumble ?? g.story.lastRumble,
    };
  });

/** Reload onto the title screen and choose Continue. */
async function reloadAndContinue() {
  await page.goto(BASE);
  await page.waitForFunction(() => window.game?.title, null, { timeout: 40000 });
  const choices = await page.evaluate(() => window.game.title.choices);
  if (choices[0] !== "continue") throw new Error(`no Continue on the title screen: ${choices}`);
  await sleep(600);
  await page.keyboard.press("Space");
  await waitFor(async () => (await island()).free, "the island to be free after Continue", 20000);
  await sleep(500);
}

// ── The boat trip ─────────────────────────────────────────────

const seaState = () => page.evaluate(() => window.engine?.scene?.e2e ?? null).catch(() => null);

/** Steers along the starfish and feeds the shark three berries in the green window. */
async function playSea() {
  await waitFor(async () => (await seaState())?.phase === "sail" || (await dialogueOpen()), "the sea to start", 40000);
  let s = await seaState();
  const end = Date.now() + 200000;
  while (s?.phase !== "shark") {
    if (Date.now() > end) throw new Error("course not finished in time");
    if (await dialogueOpen()) {
      await holdKeys([]);
      await page.keyboard.press("Space");
      await sleep(240);
    } else if (s?.phase === "sail") {
      const dx = s.safe - s.x;
      await holdKeys(Math.abs(dx) < 0.5 ? [] : [dx > 0 ? "ArrowRight" : "ArrowLeft"]);
      await sleep(50);
    } else {
      await sleep(80);
    }
    s = await seaState();
  }
  await holdKeys([]);
  log(`course done with ${s.starfish} starfish`);
  while (s?.phase === "shark" && !(s.throws >= 3 && !s.leaping)) {
    if (Date.now() > end + 120000) throw new Error("shark not calmed in time");
    if (await dialogueOpen()) {
      await page.keyboard.press("Space");
      await sleep(240);
    } else if (s.leaping && s.ringNow) {
      await sleep(120);
      await page.keyboard.press("Space");
      const n = s.throws + 1;
      await waitFor(async () => (await seaState()).throws >= n, `berry ${n}`, 8000);
      await waitFor(async () => !(await seaState()).leaping, "the leap to end", 8000);
    } else {
      await sleep(40);
    }
    s = await seaState();
  }
  log("the shark is fed");
}

// ── The treasure island, reached by the boat ──────────────────

const treasureState = () =>
  page
    .evaluate(() => {
      const s = window.engine?.scene?.state;
      if (!s || !("digs" in s)) return null;
      return {
        phase: s.phase,
        x: s.tadeo.x,
        z: s.tadeo.z,
        tx: s.target.x,
        tz: s.target.z,
        meter: s.meter,
        zone: s.zone,
        turns: s.turns,
        erupting: s.erupting,
        mapCard: !!document.querySelector(".map-card"),
        line: window.game.ui.dialogue.full,
      };
    })
    .catch(() => null);

/** The map card, in a treasure scene that the boat trip started: it must wait for a press and close from exactly one. */
async function mapCardBeat() {
  await page.waitForSelector(".map-card.ready", { timeout: 4000 });
  await sleep(1600);
  check("through the boat trip, the map card waits for a press", (await page.isVisible(".map-card")) && !(await page.isVisible(".map-card.closing")));
  await shot("01_map_card_after_the_boat");
  await page.keyboard.press("Space");
  const pressed = Date.now();
  let closing = false;
  while (!closing && Date.now() - pressed < 500) {
    closing = await page.evaluate(() => {
      const card = document.querySelector(".map-card");
      return !card || card.classList.contains("closing");
    });
  }
  check("through the boat trip, one press closes the map card", closing, `${Date.now() - pressed} ms after the press`);
  let gone = false;
  while (!gone && Date.now() - pressed < 1500) gone = !(await page.isVisible(".map-card"));
  check("the map card is gone again", gone);
}

/** Plays the treasure island with real key presses; returns once the eruption's line has been read. */
async function playTreasure() {
  let cardDone = false;
  let lastTurn = -1;
  const end = Date.now() + 200000;
  while (Date.now() < end) {
    const st = await treasureState();
    if (!st) {
      // Reason: the sea is still saying goodbye to the shark before it hands over to the treasure island
      if (await dialogueOpen()) await page.keyboard.press("Space");
      await sleep(200);
      continue;
    }
    if (await dialogueOpen()) {
      if (st.line.includes("Vulkan spuckt Feuer")) {
        check("no end card while the eruption line plays", !(await page.isVisible(".endcard")));
        await sleep(400);
        await page.keyboard.press("Space");
        await sleep(260);
        await page.keyboard.press("Space");
        return;
      }
      await page.keyboard.press("Space");
      await sleep(240);
      continue;
    }
    switch (st.phase) {
      case "arrive":
        if (st.mapCard && !cardDone) {
          cardDone = true;
          await mapCardBeat();
        }
        break;
      case "walk": {
        const dx = st.tx - st.x;
        const dz = st.tz - st.z;
        const key = Math.abs(dz) > Math.abs(dx) ? (dz < 0 ? "ArrowUp" : "ArrowDown") : dx < 0 ? "ArrowLeft" : "ArrowRight";
        await page.keyboard.down(key);
        await sleep(180);
        await page.keyboard.up(key);
        break;
      }
      case "dig":
      case "hammer":
        await page.keyboard.press("Space");
        await sleep(170);
        break;
      case "key":
        if (st.turns !== lastTurn) {
          lastTurn = st.turns;
          await sleep(450);
          await page.keyboard.press("Space");
        }
        await sleep(120);
        break;
      default:
        break;
    }
    await sleep(60);
  }
  throw new Error("the treasure island did not reach the eruption");
}

// ── The climb ─────────────────────────────────────────────────

/** Runs in the page: reads the challenge and returns which arrow keys to hold. Same pilot as in `volcano.mjs`. */
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
  const world = (ax, ay) => {
    const l = Math.hypot(ax, ay) || 1;
    return [(ax * cos - ay * sin) / l, (ax * sin + ay * cos) / l];
  };
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
  const broken = c.bridges.filter((b) => b.gap);
  const along = (b) => (h.x - b.center.x) * b.dir.x + (h.z - b.center.y) * b.dir.y;
  const crossing = broken.findIndex((b) => along(b) < b.gap[1]);
  const b = broken[crossing];
  const approach = b && [b.center.x + b.dir.x * (b.gap[0] - 2.4), b.center.y + b.dir.y * (b.gap[0] - 2.4)];
  const headFor = approach && along(b) > -b.halfLen - 9;
  const atCrossing = headFor && Math.hypot(approach[0] - h.x, approach[1] - h.z) < 1.3 ? crossing : -1;
  let best = cands[4];
  if (mode === "seek") {
    const reach = bombs.filter((f) => Math.hypot(f.x - h.x, f.z - h.z) / SPEED < f.rem - 0.15).sort((p, q) => p.rem - q.rem)[0];
    if (reach && Math.hypot(reach.x - h.x, reach.z - h.z) > 0.45) {
      const dx = reach.x - h.x;
      const dz = reach.z - h.z;
      let top = -Infinity;
      for (const k of cands) {
        const score = k.v[0] * dx + k.v[1] * dz;
        if (score > top) [top, best] = [score, k];
      }
    }
  } else {
    const point = c.pointAt(Math.min(sc.playerS + 6, c.goalS + 8));
    const tgt = headFor ? { x: approach[0], y: approach[1] } : point;
    let dx = tgt.x - h.x;
    let dz = tgt.y - h.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    let top = -Infinity;
    for (const k of cands) {
      let score = k.v[0] * dx + k.v[1] * dz;
      if (walk(k.v, 0.6).blocked && (k.ax || k.ay)) score -= 2;
      for (const bomb of bombs) {
        if (bomb.rem > 2.2) continue;
        const p = walk(k.v, bomb.rem);
        const d = Math.hypot(p.x - bomb.x, p.z - bomb.z);
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
    atCrossing,
    dialogue: !!document.querySelector(".dialogue.open"),
  };
}

const heroState = () =>
  page.evaluate(() => {
    const sc = window.engine.scene;
    const h = sc.hero.position;
    return { state: sc.state, x: h.x, z: h.z, grounded: sc.hero.grounded, onRock: !!sc.course.rockAt(h.x, h.z), lava: sc.course.lavaAt(h.x, h.z) };
  });

async function untilStopped(timeout = 6000) {
  const end = Date.now() + timeout;
  let last = await heroState();
  let still = 0;
  while (Date.now() < end) {
    await sleep(70);
    const now = await heroState();
    if (now.state !== "play") return false;
    still = Math.hypot(now.x - last.x, now.z - last.z) < 0.03 && now.grounded ? still + 1 : 0;
    if (still >= 4) return true;
    last = now;
  }
  return false;
}

async function untilLanded() {
  await sleep(120);
  for (let i = 0; i < 40; i++) {
    const now = await heroState();
    if (now.grounded || now.state !== "play") return now;
    await sleep(40);
  }
  return heroState();
}

/** One broken crossing with nothing but ArrowUp and Space; false when Tadeo was sent back and must walk here again. */
async function crossByHand() {
  await holdKeys(["ArrowUp"]);
  if (!(await untilStopped())) return false;
  await page.keyboard.press("Space");
  const onRock = await untilLanded();
  if (onRock.state !== "play" || !onRock.onRock) return false;
  await sleep(200);
  if (!(await untilStopped())) return false;
  await page.keyboard.press("Space");
  const far = await untilLanded();
  await holdKeys([]);
  return far.state === "play" && !far.lava && !far.onRock;
}

const heroHasHeart = () =>
  page.evaluate(() => {
    let found = false;
    window.engine.scene.hero.avatar.root.traverse((o) => {
      if (o.name === "feuerherz" && o.visible) found = true;
    });
    return found;
  });

/** How big the heart on Tadeo's back is on screen, in pixels, at the follow camera. */
const heartOnScreen = () =>
  page.evaluate(() => {
    const sc = window.engine.scene;
    const heart = sc.carriedHeart;
    const THREE_V = heart.position.constructor;
    const at = heart.getWorldPosition(new THREE_V());
    const size = heart.getWorldScale(new THREE_V()).x;
    const a = at.clone().project(sc.camera);
    const b = at.clone().add(new THREE_V(0, size, 0)).project(sc.camera);
    return Math.abs(a.y - b.y) * 0.5 * innerHeight;
  });

/** Climbs to the stone. Steps into a warning circle once, to prove the kind restart. */
async function climb() {
  let mode = "avoid";
  let hitCheck = null;
  let seekStart = 0;
  let last = null;
  const end = Date.now() + 240000;
  while (Date.now() < end) {
    const s = await page.evaluate(pilot, mode);
    if (!s) throw new Error("the finale scene vanished during the climb");
    last = s;
    if (s.state === "won") break;
    if (s.dialogue) {
      await holdKeys([]);
      await skipDialogues();
      continue;
    }
    if (mode === "avoid" && s.checkpoint >= 1 && !hitCheck && !seekStart) {
      mode = "seek";
      seekStart = Date.now();
    }
    if (mode === "seek" && Date.now() - seekStart > 45000) throw new Error("no hit while seeking a circle");
    if (mode === "seek" && s.state === "ouch") {
      await holdKeys([]);
      await sleep(100);
      await shot("03_climb_autsch");
      await waitFor(async () => (await heroState()).state === "play", "the respawn", 5000);
      const cp = await page.evaluate(() => {
        const sc = window.engine.scene;
        const p = sc.course.checkpoints[sc.checkpoint].pos;
        return [p.x, p.y];
      });
      const h = await heroState();
      hitCheck = { d: dist(cp, [h.x, h.z]), heart: await heroHasHeart() };
      mode = "avoid";
      continue;
    }
    if (mode === "avoid" && s.state === "play" && s.atCrossing >= 0) {
      await crossByHand();
      continue;
    }
    await holdKeys(s.state === "play" ? s.keys : []);
    await sleep(30);
  }
  await holdKeys([]);
  if (last?.state !== "won") throw new Error(`goal not reached (s=${last?.s?.toFixed(1)})`);
  return { hits: last.hits, hitCheck };
}

/** Names of the guests a shot actually has in frame (their middle projected inside the screen). */
const guestsInFrame = () =>
  page.evaluate(() => {
    const sc = window.engine.scene;
    const inFrame = [];
    for (const g of sc.guests) {
      const v = g.object.position.clone();
      g.object.getWorldPosition(v);
      v.y += 0.6;
      v.project(sc.camera);
      if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1) inFrame.push(g.name);
    }
    return inFrame;
  });

// ── Play ──────────────────────────────────────────────────────

let passed = false;
let fps = 0;
try {
  // ── The loader knows both new scenes ──────────────────────
  await page.goto(`${BASE}/?notitle`);
  await page.waitForFunction(() => window.game?.island, null, { timeout: 40000 });
  const loader = await page.evaluate(async () => {
    const { loadChallenge } = await import("/src/challenges/registry.ts");
    const out = {};
    for (const name of ["finale", "festival"]) {
      try {
        out[name] = typeof (await loadChallenge(name));
      } catch (e) {
        out[name] = e.message;
      }
    }
    return out;
  });
  check("the loader finds the finale and the festival", loader.finale === "function" && loader.festival === "function", JSON.stringify(loader));
  if (loader.finale !== "function" || loader.festival !== "function") throw new Error(`loader: ${JSON.stringify(loader)}`);

  // ── ?challenge=finale: the mode ───────────────────────────
  await page.goto(`${BASE}/?challenge=finale`);
  await waitFor(() => page.evaluate(() => !!window.engine?.scene?.director && !!window.engine.scene.mode?.carriesHeart).catch(() => false), "the finale scene", 40000);
  await waitFor(dialogueOpen, "the finale's first line", 20000);
  const mode = await page.evaluate(async () => {
    const { RESCUE } = await import("/src/challenges/volcano/modes.ts");
    const sc = window.engine.scene;
    const hsl = (c) => c.getHSL({ h: 0, s: 0, l: 0 });
    // Reason: the finale's zenith is also much darker, so "redder" is red's share of the colour, not its amount
    const redShare = (c) => c.r / (c.r + c.g + c.b);
    return {
      start: sc.director.intervalAt(0),
      end: sc.director.intervalAt(1),
      zenith: { finale: sc.mode.sky.zenith.getHexString(), rescue: RESCUE.sky.zenith.getHexString() },
      zenithRedder: redShare(sc.mode.sky.zenith) > redShare(RESCUE.sky.zenith),
      horizonRedder: redShare(sc.mode.sky.horizon) > redShare(RESCUE.sky.horizon),
      zenithDarker: hsl(sc.mode.sky.zenith).l < hsl(RESCUE.sky.zenith).l,
    };
  });
  const redSky = await frameStats(await shot("02_red_sky_at_the_start"), [0, 0, 1, 0.3]);
  check(
    "the sky is redder and the rate is back to today's",
    mode.start === 1.15 && mode.end === 0.6 && mode.zenithRedder && mode.horizonRedder && mode.zenithDarker && redSky.r > redSky.b + 20,
    `${mode.start}→${mode.end}, ${mode.zenith.rescue}→${mode.zenith.finale}, sky on screen r${redSky.r} g${redSky.g} b${redSky.b}`,
  );

  // ── Continue at 11 goes to the dock ───────────────────────
  await page.evaluate(() => localStorage.setItem("schatzkarten_save", JSON.stringify({ version: 4, milestone: 11, items: [], playerX: -36, playerY: -76, timestamp: Date.now() })));
  await reloadAndContinue();
  const at11 = await island();
  check("Continue at 11 goes to the dock", at11.milestone === 11 && dist(at11.player, NORTH_DOCK_END) < 6 && at11.prompt.includes("Los geht's"), JSON.stringify(at11));
  await page.evaluate(() => localStorage.removeItem("schatzkarten_save"));

  // ── The chain: the sea runs on into the treasure, and the eruption into the finale ──
  await page.goto(`${BASE}/?challenge=sea`);
  await recordLines();
  await playSea();
  await playTreasure();
  await waitFor(() => page.evaluate((line) => window.game.ui.dialogue.full === line, SAIL_BACK), "the narrator's line over black", 15000);
  await sleep(1500);
  const blackPng = await shot("04_black_and_the_narrator");
  const black = await frameStats(blackPng, [0, 0, 1, 0.55]);
  const box = await page.evaluate(() => {
    const el = document.querySelector(".dialogue.open");
    const r = el?.getBoundingClientRect();
    return r ? [r.left / innerWidth, r.top / innerHeight, r.right / innerWidth, r.bottom / innerHeight] : null;
  });
  const boxStats = box ? await frameStats(blackPng, box) : { bright: 0 };
  check("the narrator's line stands on black", black.bright < 4 && boxStats.bright > 40, `above the box ${black.bright}, the box ${boxStats.bright}`);
  check("no end card and no walk between the eruption and the finale", !(await page.isVisible(".endcard")) && !(await page.evaluate(() => window.engine.scene === window.game.island)));
  const line = await heard();
  check("the narrator says it", line.some((l) => l.speaker === "Erzähler" && l.text === SAIL_BACK));
  await skipDialogues();
  await waitFor(() => page.evaluate(() => !!window.engine.scene?.mode?.carriesHeart).catch(() => false), "the finale scene after the treasure", 30000);
  log("the finale scene started straight from the treasure island");
  await waitFor(async () => (await saved())?.milestone === 12, "the save at quest 12", 5000);
  const save12 = await saved();
  check("the treasure saves quest 12", save12.milestone === 12, JSON.stringify(save12));

  // ── Continue at 12 ────────────────────────────────────────
  await reloadAndContinue();
  const gate = await page.evaluate(async () => {
    const { LANDMARKS } = await import("/src/world/layout.ts");
    return LANDMARKS.volcanoGate;
  });
  const at12 = await island();
  check("Continue at 12 goes to the volcano gate", at12.milestone === 12 && dist(at12.player, gate) < 6 && at12.prompt.includes("Los geht's"), JSON.stringify(at12));
  check("the strongest rumble greets him there", at12.rumble === 1, at12.rumble);
  await shot("05_continue_at_the_gate");
  // Jonas stands far from the gate; the walk is not what is tested here
  await page.evaluate(() => {
    const g = window.game;
    const jonas = g.npcs.get("villager0").position;
    g.placePlayer(jonas.x + 1.6, jonas.z + 0.6);
  });
  await sleep(700);
  const atJonas = await island();
  await page.keyboard.press("Space");
  await sleep(500);
  const canTalkToJonas = atJonas.prompt.includes("Angeln") && (await dialogueOpen());
  check("side games are not locked at 12", canTalkToJonas, JSON.stringify(atJonas));
  await reloadAndContinue();

  // ── Through the gate and up the volcano ───────────────────
  await recordLines();
  await page.keyboard.press("Space");
  await waitFor(() => page.evaluate(() => !!window.engine.scene?.mode?.carriesHeart).catch(() => false), "the finale through the gate", 30000);
  log("through Los geht's");
  await waitFor(dialogueOpen, "the finale's first line", 20000);
  await sleep(500);
  await shot("06_finale_opening");
  await skipDialogues();
  await waitFor(() => page.evaluate(() => window.engine.scene.state === "play"), "play", 10000);
  await sleep(1600);
  check("Tadeo carries the heart", await heroHasHeart());
  const heartPx = await heartOnScreen();
  check("the heart reads at a glance at the follow camera", heartPx > 30, `${heartPx.toFixed(0)} px`);
  await shot("07_climb_with_the_heart");
  const climbed = await climb();
  check("a hit restarts kindly at the checkpoint and he keeps the heart", climbed.hitCheck && climbed.hitCheck.d < 1.5 && climbed.hitCheck.heart, JSON.stringify(climbed.hitCheck));
  log(`reached the stone with ${climbed.hits} hits`);

  // ── At the stone ──────────────────────────────────────────
  const hollowEmpty = await page.evaluate(() => !window.engine.scene.set.altar.heart.visible);
  await waitFor(() => page.evaluate(() => !!window.engine.scene.prompt), "the prompt at the stone", 15000);
  check("the distance pill is gone at the stone", !(await page.isVisible(".status")));
  await sleep(1200);
  await shot("08_at_the_stone");
  await sleep(1500);
  const waiting = await page.evaluate(() => ({ prompt: window.engine.scene.prompt?.verb, inHollow: window.engine.scene.set.altar.heart.visible, onBack: !!window.engine.scene.carriedHeart?.parent, shown: document.querySelector(".prompt")?.style.display !== "none" }));
  check("the stone waits for the child's own press", hollowEmpty && !waiting.inHollow && waiting.onBack && waiting.shown, JSON.stringify(waiting));
  // Reason: wraps the launcher, so a bomb thrown after the heart is home cannot go unnoticed between two looks
  await page.evaluate(() => {
    const bombs = window.engine.scene.bombs;
    const launch = bombs.launch;
    window.launches = 0;
    bombs.launch = function (...args) {
      window.launches++;
      return launch.apply(this, args);
    };
  });
  await page.keyboard.press("Space");
  await sleep(450);
  await shot("09_heart_flying_in");
  const stage = () =>
    page.evaluate(() => {
      const sc = window.engine.scene;
      return { phase: sc.ending?.phase, inHollow: sc.set.altar.heart.visible, cool: sc.ending?.cool.value, reveal: sc.ending?.rainbowReveal, stopped: sc.director.stopped, flying: sc.bombs.flying.length, launches: window.launches, dialogue: !!document.querySelector(".dialogue.open"), hueter: sc.ending?.hueter.root.visible };
    });
  await waitFor(async () => (await stage()).inHollow, "the heart in the hollow", 8000);
  await sleep(120);
  await shot("10_heart_home_light");
  const home = await stage();
  check("the heart goes into the hollow", home.inHollow && !(await heroHasHeart()), JSON.stringify(home));
  check("the rocks in the air are gone the moment the heart is home", home.stopped && home.flying === 0, `stopped ${home.stopped}, flying ${home.flying}`);
  await sleep(700);
  await shot("11_light_column");
  await waitFor(async () => (await stage()).phase === "wide", "the wide shot", 10000);
  await sleep(1300);
  const pngHot = await shot("12_wide_still_hot");
  const hotBefore = await frameStats(pngHot);
  const lavaBefore = await frameStats(pngHot, LAVA_ON_THE_CONE);
  await waitFor(async () => (await stage()).phase === "calm", "the calm to begin", 10000);
  await sleep(1800);
  await shot("13_lava_dimming");
  await waitFor(async () => (await stage()).cool >= 1, "the lava to cool", 15000);
  await waitFor(async () => (await stage()).reveal >= 1, "the rainbow to have risen", 8000);
  await sleep(200);
  const pngCalm = await shot("14_rainbow");
  const hotAfter = await frameStats(pngCalm);
  const lavaAfter = await frameStats(pngCalm, LAVA_ON_THE_CONE);
  const after = await stage();
  const lavaMaterial = await page.evaluate(() => {
    const out = [];
    window.engine.scene.scene.traverse((o) => {
      if (o.name.startsWith("lava-river") || o.name === "crater-lake") out.push(o.material.uniforms.uCool.value);
    });
    return out;
  });
  check("the rocks stop and the lava dims", after.stopped && after.flying === 0 && after.launches === home.launches && lavaMaterial.every((v) => v === 1) && lavaAfter.hot < lavaBefore.hot * 0.5, `flying ${after.flying}, launches before the heart was home ${home.launches} and by now ${after.launches}, white-hot pixels on the cone ${lavaBefore.hot}→${lavaAfter.hot}`);
  check("the sky clears", hotAfter.b > hotBefore.b + 15 || hotAfter.bright > hotBefore.bright + 15, `r${hotBefore.r} g${hotBefore.g} b${hotBefore.b} → r${hotAfter.r} g${hotAfter.g} b${hotAfter.b}`);
  check("the rainbow rises", after.reveal >= 1, after.reveal);
  await waitFor(dialogueOpen, "the Hüter's thanks", 30000);
  await sleep(900);
  await shot("15_hueter_thanks");
  const smiling = await page.evaluate(() => window.engine.scene.ending.hueter.smiling);
  check("the Hüter smiles when he thanks Tadeo", smiling === true);
  await skipDialogues();
  await sleep(1400);
  await shot("16_hueter_fading");
  await waitFor(() => page.evaluate(() => window.engine.scene.ending?.hueter.root.visible === false).catch(() => true), "the Hüter to be gone", 8000);
  const lines1 = (await heard()).map((l) => l.text);
  const hueterGone = await page.evaluate(() => window.engine.scene.ending?.hueter.root.visible === false).catch(() => false);
  check("the Hüter fades", hueterGone && lines1.includes(HUETER_THANKS), `gone ${hueterGone}`);
  await sleep(1500);
  await shot("17_geschafft_with_the_rainbow");

  // ── The festival ──────────────────────────────────────────
  await waitFor(() => page.evaluate(() => window.engine.scene?.state?.phase === "talk").catch(() => false), "the festival", 30000);
  const presentAt = await page.evaluate(() => window.engine.scene.state);
  check("the festival is at night with everyone", FESTIVAL_GUESTS.every((n) => presentAt.present.includes(n)), presentAt.present.join(", "));
  check("no fireworks while they talk", presentAt.fireworks === false);
  await page.waitForFunction(() => window.engine.scene.atWide, null, { timeout: 15000, polling: "raf" });
  await sleep(400);
  const nightPng = await shot("18_festival_night_wide");
  const nightSky = await frameStats(nightPng, [0.05, 0, 0.95, 0.14]);
  const nightAll = await frameStats(nightPng);
  check("the sky is night blue", nightSky.bright < 70 && nightSky.b > nightSky.r, `r${nightSky.r} g${nightSky.g} b${nightSky.b}`);
  check("the fire and lanterns stand out warm against it", nightAll.warm > 3000, nightAll.warm);
  const framed = await guestsInFrame();
  check("the wide shot has everyone in frame", FESTIVAL_GUESTS.every((n) => framed.includes(n)), framed.join(", "));
  check("the drums and answer stones are gone", await page.evaluate(() => !window.engine.scene.stage.drums.group.visible && !window.engine.scene.stage.stones.group.visible));
  const crowned = await page.evaluate(() => {
    let crown = false;
    window.engine.scene.stage.tadeo.avatar.head.traverse((o) => {
      if (o.name === "crown" && o.visible) crown = true;
    });
    return crown;
  });
  check("Tadeo wears the crown", crowned);
  const shotAt = { "das war ich": "19_paco_confesses", "P wie Paco": "20_p_wie_paco", "gut gemacht": "21_elder_forgives", "Gold ist": "22_gold_for_the_village", Rakete: "23_rocket_plan", "goldenes Ei": "24_golden_egg" };
  const festivalEnd = Date.now() + 120000;
  while (Date.now() < festivalEnd) {
    const open = await dialogueOpen();
    const st = await page.evaluate(() => window.engine.scene?.state?.phase).catch(() => null);
    if (st === "party") break;
    if (open) {
      const current = await page.evaluate(() => window.game.ui.dialogue.full);
      for (const [text, name] of Object.entries(shotAt)) {
        if (current.includes(text)) {
          delete shotAt[text];
          await sleep(1300);
          await shot(name);
        }
      }
      await page.keyboard.press("Space");
      await sleep(260);
    } else {
      await sleep(100);
    }
  }
  const all = await heard();
  const lines = all.map((l) => l.text);
  check("Paco confesses", all.some((l) => l.speaker === "Käpt'n Paco" && l.text.includes("das war ich")));
  check("P wie Paco", lines.includes("P wie Paco!"));
  check("the rocket plan and the golden egg", lines.some((l) => l.includes("Rakete")) && lines.some((l) => l.includes("goldenes Ei")));
  const festivalLines = all.slice(all.findIndex((l) => l.text.includes("das war ich")));
  check("the festival stays a short conversation", festivalLines.length <= MAX_FESTIVAL_LINES, festivalLines.length);
  const wordy = all.filter((l) => l.text.split(/\s+/).length > MAX_WORDS).map((l) => l.text);
  check(`no line of the last quest is longer than ${MAX_WORDS} words`, wordy.length === 0, wordy.join(" | "));
  // Reason: "..." is a pause inside a sentence, not the end of one
  const longLines = all.filter((l) => l.text.replace(/\.\.\./g, " ").split(/[.!?]+\s*/).filter(Boolean).length > 3).map((l) => l.text);
  check("every line is a few short sentences", longLines.length === 0, longLines.join(" | "));
  const forbidden = lines.filter((l) => FORBIDDEN.some((w) => l.includes(w)));
  check("no forbidden words", forbidden.length === 0, forbidden.join(" | "));

  // ── The party under the end card ──────────────────────────
  await waitFor(() => page.isVisible(".endcard"), "the end card", 10000);
  await sleep(1500);
  const party = await page.evaluate(() => window.engine.scene.state);
  check("the party loops: fireworks are on", party.phase === "party" && party.fireworks === true, JSON.stringify(party));
  const card = await page.textContent(".endcard");
  check("end card says the island is saved", card.includes("Du hast die Insel gerettet!"), card.replace(/\s+/g, " ").trim());
  check("the end card counts the coins", /Goldmünzen: \d+ \/ \d+/.test(card));
  check("the end card promises the rocket and the mended boat", card.includes("Rakete") && card.includes("Boot"));
  check("save is gone after the end", await noSave());
  await sleep(2600);
  await shot("25_end_card_fireworks");
  const sparks = await page.evaluate(() => window.engine.scene.fireworks.sparks.alive ?? null);
  fps = await drawRate(3000);
  let baselineFps = 57.7;
  try {
    baselineFps = Number(readFileSync(join(HERE, "out", "baseline.txt"), "utf8").match(/drawRate ([\d.]+)/)[1]);
  } catch {
    // Reason: the baseline file is a local proof, not in git; a fresh clone falls back to the number it held
  }
  check("runs at the baseline fps at the festival", fps >= baselineFps - 3, `${fps.toFixed(1)}, baseline ${baselineFps}, sparks ${sparks}`);
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.game?.title, null, { timeout: 40000 });
  check("Space on the end card starts the game again, with no Continue", (await page.evaluate(() => window.game.title.choices)).join() === "new");

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  passed = checks.every((c) => c.ok);
} catch (e) {
  log(`FAILED: ${e.message}`);
  await shot("fail").catch(() => {});
}

const failed = checks.filter((c) => !c.ok).map((c) => c.name);
writeFileSync(join(OUT, "console.log"), logs.join("\n"));
writeFileSync(
  join(OUT, "summary.json"),
  JSON.stringify({ challenge: "finale", passed, seconds: (Date.now() - t0) / 1000, fps: Math.round(fps * 10) / 10, checks, failed, errors, steps, command: "node scripts/e2e/finale.mjs" }, null, 2),
);
console.log(passed ? "PASS" : "FAIL", `(${((Date.now() - t0) / 1000).toFixed(1)}s, checks ${checks.length - failed.length}/${checks.length}, errors: ${errors.length})`);
await browser.close();
process.exit(passed ? 0 : 1);
