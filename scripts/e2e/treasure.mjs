/**
 * E2E: play quest 11 from start to finish with real key presses — close the
 * map card, steer Tadeo to the X with the arrow keys, dig with Space, smash the
 * ice (two hits timed into the golden zone, the rest plain mashing), turn the
 * key, click through the dialogues — and verify what the chest holds, in which
 * order it comes out, and that the volcano erupts on the horizon, on the side
 * of the world where it really lies.
 *
 * The end card now belongs to the festival after quest 12, so "no end card" is
 * checked at the moment the eruption line plays. The run stops at phase "done",
 * then checks that `finished` really resolves and that no party starts after it.
 * The chain on into quest 12 is proven by finale.mjs.
 *
 * Live state (Tadeo's position, the X, the hammer meter, the reveals) is read
 * from `window.engine.scene.state`; every action is a real keyboard press.
 *
 * Usage: node scripts/e2e/treasure.mjs [baseUrl]
 * Output: scripts/e2e/out/treasure/{*.png, summary.json, console.log}
 */

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = "scripts/e2e/out/treasure";
const TIMEOUT_MS = 240_000;
const ERUPTION_LINE = "Da! Der Vulkan spuckt Feuer! Schnell zurück!";
const NOTE_LINE = 'Ein Zettel. "Es tut mir leid. P."';
/** Burning pixels above the crater's rim: the fountain makes far more, a lava bomb crossing alone or a quiet crater far fewer. */
const FIRE_ABOVE_RIM = 3000;
const FORBIDDEN = ["die Alten", "Altar", "ewiges Eis", "besänftigen"];
const OLD_ENDING = ["Und so endet", "legendären Schatz", "besten Abenteuer", "alle Prüfungen bestanden und den Schatz"];
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

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== "" ? ` (${detail})` : ""}`);
};

const started = Date.now();
await page.goto(`${BASE}/?challenge=treasure`);

let reloads = 0;
page.on("framenavigated", (f) => {
  if (f === page.mainFrame() && Date.now() - started > 3000) reloads++;
});

const read = () =>
  page
    .evaluate(() => {
      const s = window.engine?.scene?.state;
      const chest = window.engine?.scene?.stage?.chest;
      return {
        phase: s?.phase ?? null,
        x: s?.tadeo.x ?? 0,
        z: s?.tadeo.z ?? 0,
        tx: s?.target.x ?? 0,
        tz: s?.target.z ?? 0,
        digs: s?.digs ?? 0,
        ice: s?.ice ?? 1,
        hits: s?.hits ?? 0,
        perfectHits: s?.perfectHits ?? 0,
        meter: s?.meter ?? 0,
        zone: s?.zone ?? [0, 0],
        turns: s?.turns ?? 0,
        note: s?.note ?? false,
        heart: s?.heart ?? false,
        plan: s?.plan ?? false,
        gold: s?.gold ?? false,
        crowned: s?.crowned ?? false,
        erupting: s?.erupting ?? false,
        shown: { note: !!chest?.note?.visible, heart: !!chest?.heart?.visible, plan: !!chest?.plan?.visible },
        mapCard: !!document.querySelector(".map-card"),
        dialogue: !!document.querySelector(".dialogue.open"),
        line: window.game?.ui?.dialogue?.full ?? "",
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

/** Every line the dialogue box begins, as "Name: text": read from the box itself, so a quick line is never missed. */
await page.waitForFunction(() => window.game?.ui?.dialogue, null, { timeout: 30000 });
await page.evaluate(() => {
  const box = Object.getPrototypeOf(window.game.ui.dialogue);
  const begin = box.showLine;
  window.said = [];
  box.showLine = function () {
    begin.call(this);
    window.said.push(`${this.script[this.index].speaker}: ${this.script[this.index].text}`);
  };
});

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

/** The eruption as the camera sees it: the crater's bearing against the world map, and whether it is in the frame. */
const volcanoView = () =>
  page.evaluate(async () => {
    const { LANDMARKS } = await import("/src/world/layout.ts");
    const { VOLCANO_AT } = await import("/src/challenges/treasure/eruption.ts");
    const stage = window.engine.scene.stage;
    const crater = stage.eruption.crater;
    const onMap = Math.atan2(LANDMARKS.volcano[0] - LANDMARKS.treasureIsland[0], LANDMARKS.volcano[1] - LANDMARKS.treasureIsland[1]);
    const inScene = Math.atan2(crater.x, crater.z);
    const screen = crater.clone().project(stage.camera);
    const toCrater = crater.clone().sub(stage.camera.position).normalize();
    const box = document.querySelector(".dialogue.open")?.getBoundingClientRect();
    return {
      offMapDeg: (Math.abs(onMap - inScene) * 180) / Math.PI,
      screen: { x: screen.x, y: screen.y },
      // Reason: above the highest notch of the rim, so the lava rivers on the cone cannot count as fire
      rimY: crater.clone().setY(crater.y + 9).project(stage.camera).y,
      facing: stage.camera.getWorldDirection(crater.clone()).dot(toCrater),
      crabsDance: stage.critters.party,
      plume: stage.eruption.running,
      footPx: ((1 - VOLCANO_AT.clone().project(stage.camera).y) / 2) * innerHeight,
      boxTopPx: box?.top ?? null,
    };
  });

/**
 * Does the frame read as a volcano spitting fire? Counts burning pixels above the crater's rim, where the rivers on the
 * cone cannot help and a pale sky has too little colour to pass, and smoke in the column above it: pixels much darker
 * than the open sky at the same height, so a sky that is dark itself does not count. A grey blob on the horizon has
 * neither. `sky` is how bright the open sky is: fire only stands out against a dark one.
 */
const fireInFrame = (png, { screen, rimY }) =>
  page.evaluate(
    async ({ b64, screen, rimY }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const g = canvas.getContext("2d");
      g.drawImage(bitmap, 0, 0);
      const cx = ((screen.x + 1) / 2) * bitmap.width;
      const cy = ((1 - screen.y) / 2) * bitmap.height;
      const rim = ((1 - rimY) / 2) * bitmap.height;
      const count = (x0, y0, x1, y1, test) => {
        const [l, t] = [Math.max(0, Math.round(x0)), Math.max(0, Math.round(y0))];
        const [w, h] = [Math.min(bitmap.width, Math.round(x1)) - l, Math.min(bitmap.height, Math.round(y1)) - t];
        if (w <= 0 || h <= 0) return 0;
        const px = g.getImageData(l, t, w, h).data;
        let n = 0;
        for (let i = 0; i < px.length; i += 4) if (test(px[i], px[i + 1], px[i + 2])) n++;
        return n;
      };
      // Reason: the median, because a lava bomb crossing the patch would drag a mean up and make the sky look bright
      const median = (x0, y0, x1, y1) => {
        const px = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        const brightness = [];
        for (let i = 0; i < px.length; i += 4) brightness.push((px[i] + px[i + 1] + px[i + 2]) / 3);
        return brightness.sort((a, b) => a - b)[brightness.length >> 1];
      };
      // Reason: the wind leans the column to the screen's left, so the open sky to compare with is on the right
      const skyLeft = Math.min(Math.round(cx + 420), bitmap.width - 80);
      const sky = median(skyLeft, 10, skyLeft + 70, Math.max(Math.round(cy - 40), 20));
      return {
        burning: count(cx - 90, rim - 90, cx + 90, rim, (r, gr, b) => r > 215 && gr > 60 && r - b > 100),
        sky: Math.round(sky),
        smoke: count(cx - 260, 0, cx + 160, cy - 30, (r, gr, b) => (r + gr + b) / 3 < sky * 0.72),
      };
    },
    { b64: png.toString("base64"), screen, rimY },
  );

const phasesSeen = new Set();
const walk = { presses: 0, arrowUpMovesAway: null };
let digPresses = 0;
let hammerPresses = 0;
let timedPresses = 0;
let keyPresses = 0;
let dialogueCount = 0;
let inDialogue = false;
const dialoguesPerPhase = {};
let lastKeyTurn = -1;
let mapCardSeen = false;
let mapCardDone = false;
let atEruption = null;
let quietView = null;
let final = null;
/** The state at the moment each reveal first showed, to prove their order. */
const revealed = {};

/** Hold an arrow key for a moment and report how Tadeo moved. */
async function step(key, ms) {
  const before = await read();
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  walk.presses++;
  const after = await read();
  if (key === "ArrowUp" && before && after && walk.arrowUpMovesAway === null && before.phase === "walk") {
    walk.arrowUpMovesAway = after.z < before.z - 0.05;
  }
}

/**
 * The map card must wait for a press and close from exactly one. Reason: the scene updates before the card's poll, so
 * a scene that reads Space (a waiter from `nextKey`) takes this press first: the card then stays up and this check fails.
 */
async function mapCardBeat() {
  mapCardSeen = true;
  mapCardDone = true;
  await page.waitForSelector(".map-card.ready", { timeout: 4000 });
  await page.waitForTimeout(1600);
  check("the map card waits for a press", (await page.isVisible(".map-card")) && !(await page.isVisible(".map-card.closing")));
  check("the map card has no text", (await page.textContent(".map-card")).trim() === "");
  await page.screenshot({ path: `${OUT}/00b-map-card.png` });
  await page.keyboard.press("Space");
  const pressed = Date.now();
  let closing = false;
  while (!closing && Date.now() - pressed < 500) {
    closing = await page.evaluate(() => {
      const card = document.querySelector(".map-card");
      return !card || card.classList.contains("closing");
    });
  }
  check("one press closes the map card in this scene", closing, `${Date.now() - pressed} ms after the press`);
  let gone = false;
  while (!gone && Date.now() - pressed < 1500) gone = !(await page.isVisible(".map-card"));
  check("the card is gone again", gone);
}

/**
 * Where the camera looks at the instant the crater blows. Reason: measured in the page, because this test's own loop
 * may be busy with a screenshot at that moment and would only see the camera after it has arrived.
 */
const watchBlast = () =>
  page.evaluate(() => {
    const stage = window.engine.scene.stage;
    if (window.blastWatched) return;
    window.blastWatched = true;
    const start = stage.eruption.start;
    stage.eruption.start = function (time) {
      const toCrater = this.crater.clone().sub(stage.camera.position).normalize();
      window.facingAtBlast = stage.camera.getWorldDirection(this.crater.clone()).dot(toCrater);
      start.call(this, time);
    };
  });

/**
 * Where each thing from the chest first shows, and where the chest's rim is. Reason: measured in the page on every
 * frame, because a thing that shows above the rim has popped out of thin air even if it ends up in the right place.
 */
const watchChest = () =>
  page.evaluate(() => {
    if (window.firstSeen) return;
    window.firstSeen = {};
    const chest = window.engine.scene.stage.chest;
    window.chestRim = chest.inner.getWorldPosition(chest.inner.position.clone()).y;
    const update = chest.update;
    chest.update = function (dt, time) {
      update.call(this, dt, time);
      for (const name of ["note", "heart", "plan"]) {
        const item = this[name];
        if (item.visible && window.firstSeen[name] === undefined) window.firstSeen[name] = item.getWorldPosition(item.position.clone()).y;
      }
    };
  });

/** What has to be true while the eruption line is on screen. */
async function eruptionMoment(st) {
  const view = await volcanoView();
  const endcard = await page.isVisible(".endcard");
  await page.waitForTimeout(900);
  const png = await page.screenshot({ path: `${OUT}/09-erupt-3-line.png` });
  const later = await volcanoView();
  const fire = await fireInFrame(png, later);
  // Reason: a lava bomb can cross the box in any one frame, but the fountain is there in all of them
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(350);
    fire.burning = Math.min(fire.burning, (await fireInFrame(await page.screenshot(), later)).burning);
  }
  const fps = await drawRate(2500);
  atEruption = { st, view, endcard, fire, fps };
}

while (Date.now() - started < TIMEOUT_MS) {
  const st = await read();
  if (!st) {
    await page.waitForTimeout(500);
    continue;
  }
  if (st.phase) phasesSeen.add(st.phase);
  if (st.phase === "done") {
    final = st;
    break;
  }
  if (st.shown.heart && !shots.has("08-reveal-2a-heart-rising")) {
    // Reason: it starts hidden inside the chest, so its first moment is when it comes up through the rim
    await page
      .waitForFunction(
        () => {
          const heart = window.engine.scene.stage.chest.heart;
          return heart.getWorldPosition(heart.position.clone()).y > window.chestRim - 0.1;
        },
        null,
        { timeout: 2000, polling: "raf" },
      )
      .catch(() => {});
    await shotOnce("08-reveal-2a-heart-rising");
  }
  // Each reveal gets a moment without a dialogue box, and its own picture
  for (const [flag, name] of [
    ["note", "08-reveal-1-note"],
    ["heart", "08-reveal-2-heart"],
    ["plan", "08-reveal-3-plan"],
    ["gold", "08-reveal-4-gold"],
    ["crowned", "08-reveal-5-crown"],
  ]) {
    if (st[flag] && !revealed[flag]) {
      revealed[flag] = st;
      await shotOnce(name, flag === "gold" ? 900 : 0);
    }
  }
  if (st.erupting && !revealed.erupting) {
    revealed.erupting = st;
    await shotOnce("09-erupt-1-boom", 200);
  }
  if (st.dialogue) {
    if (!inDialogue) {
      // A new conversation started: one screenshot of its first line
      inDialogue = true;
      dialogueCount++;
      dialoguesPerPhase[st.phase] = (dialoguesPerPhase[st.phase] ?? 0) + 1;
      await shotOnce(`dlg-${st.phase}-${dialoguesPerPhase[st.phase]}`, 700);
    }
    if (st.line === ERUPTION_LINE && !atEruption) await eruptionMoment(st);
    if (st.line.includes("ganz warm")) await shotOnce("08-reveal-2b-heart-warm", 500);
    await page.keyboard.press("Space");
    await page.waitForTimeout(280);
    continue;
  }
  inDialogue = false;
  switch (st.phase) {
    case "arrive":
      await shotOnce("00-establishing", 1200);
      if (st.mapCard && !mapCardDone) await mapCardBeat();
      break;
    case "walk": {
      await shotOnce("01-walk", 400);
      const dx = st.tx - st.x;
      const dz = st.tz - st.z;
      // First move straight up (away from the camera) to verify the controls, then head for the X
      if (walk.arrowUpMovesAway === null) await step("ArrowUp", 260);
      else if (Math.abs(dz) > Math.abs(dx)) await step(dz < 0 ? "ArrowUp" : "ArrowDown", 180);
      else await step(dx < 0 ? "ArrowLeft" : "ArrowRight", 180);
      if (walk.presses === 4) await shotOnce("02-walking");
      break;
    }
    case "dig":
      if (st.digs === 5) await shotOnce("03-dig");
      await page.keyboard.press("Space");
      digPresses++;
      await page.waitForTimeout(170);
      break;
    case "reveal":
      await shotOnce("04-reveal", 700);
      break;
    case "hammer": {
      // Two hits timed into the golden zone, the rest plain mashing
      if (timedPresses < 2) {
        if (st.meter < st.zone[0] + 0.03 || st.meter > st.zone[1] - 0.03) {
          await page.waitForTimeout(15);
          continue;
        }
        timedPresses++;
      }
      await page.keyboard.press("Space");
      hammerPresses++;
      if (hammerPresses === 2) await shotOnce("05-hammer", 120);
      await page.waitForTimeout(timedPresses <= 2 && hammerPresses <= 2 ? 500 : 190);
      break;
    }
    case "key":
      if (st.turns !== lastKeyTurn) {
        lastKeyTurn = st.turns;
        if (st.turns === 1) await shotOnce("06-key", 300);
        await page.waitForTimeout(450);
        await page.keyboard.press("Space");
        keyPresses++;
      }
      await page.waitForTimeout(120);
      break;
    case "open":
      await watchChest();
      await shotOnce("07-open", 1100);
      break;
    case "erupt":
      await watchBlast();
      if (st.erupting) await shotOnce("09-erupt-2-volcano", 1900);
      else {
        await shotOnce("09-erupt-0-quiet", 3500);
        quietView ??= await volcanoView();
      }
      break;
    default:
      break;
  }
  await page.waitForTimeout(60);
}

// The run stopped at "done", which the script sets itself: only `finished` says that the flow got the challenge back
const ended = await page
  .evaluate(() => Promise.race([window.engine.scene.finished.then(() => "finished"), new Promise((r) => setTimeout(() => r("still waiting"), 3000))]))
  .catch(() => null);
// Reason: the old party started right after `finished`, under the end card, so this has to look after it
await page.waitForTimeout(1000);
const afterEnd = await page
  .evaluate(() => {
    const stage = window.engine.scene.stage;
    return { crabsDance: stage.critters.party };
  })
  .catch(() => null);

const said = (await page.evaluate(() => window.said).catch(() => null)) ?? [];
const facingAtBlast = await page.evaluate(() => window.facingAtBlast).catch(() => null);
const firstSeen = await page.evaluate(() => ({ items: window.firstSeen, rim: window.chestRim })).catch(() => null);
const quiet = quietView ? await fireInFrame(readFileSync(`${OUT}/09-erupt-0-quiet.png`), quietView) : null;
const lines = said.map((l) => l.replace(/^[^:]+: /, ""));
const state = final ?? (await read()) ?? {};

// ── The brief's checks ────────────────────────────────────
check("map card on arrival", mapCardSeen);
check("Chuleta explains Zaubereis", said.some((l) => l.startsWith("Chuleta: ") && l.includes("Zaubereis")));
check("the note is read", lines.includes(NOTE_LINE));
check("Chuleta wonders about the P", said.includes("Chuleta: P? Wie Pirat?"));
check("the heart comes out and is warm", state.heart && lines.some((l) => l.includes("ganz warm")));
check("the eruption line plays", said.includes(`Erzähler: ${ERUPTION_LINE}`));
check("no end card and no party while the line plays", atEruption && !atEruption.endcard && !atEruption.view.crabsDance, JSON.stringify(atEruption ? { endcard: atEruption.endcard, crabsDance: atEruption.view.crabsDance } : null));
check("no party starts after the challenge ends", afterEnd && !afterEnd.crabsDance, JSON.stringify(afterEnd));
check("the volcano erupts on the horizon", atEruption?.st.erupting && atEruption.view.plume);

// ── What the chest gives, one thing at a time ─────────────
check("nothing shows before its turn", revealed.note?.shown.note && !revealed.note.shown.heart && !revealed.note.shown.plan, JSON.stringify(revealed.note?.shown ?? null));
check("first the note, alone", revealed.note && !revealed.note.heart && !revealed.note.plan && !revealed.note.gold);
check("then the heart, before the plan and the gold", revealed.heart?.note && !revealed.heart.plan && !revealed.heart.gold && revealed.heart.shown.heart);
check("then the plan, before the gold", revealed.plan?.heart && !revealed.plan.gold && revealed.plan.shown.plan);
check("then the gold, then the crown on his head", revealed.gold?.plan && !revealed.gold.crowned && revealed.crowned?.gold);
check("then the eruption", revealed.erupting?.crowned);
check(
  "each thing rises out of the chest, from below its rim",
  firstSeen?.items && ["note", "heart", "plan"].every((name) => firstSeen.items[name] < firstSeen.rim),
  JSON.stringify(firstSeen),
);
check(
  "the chest's heart is the Feuerherz from the stone",
  await page.evaluate(() => !!window.engine.scene.stage?.chest.heart.getObjectByName("feuerherz")).catch(() => false),
);

// ── Where the volcano is ──────────────────────────────────
const view = atEruption?.view;
check("the volcano lies where the map says, seen from this island", view && view.offMapDeg < 2, view ? `${view.offMapDeg.toFixed(2)} deg off` : "");
check("the camera is already on the volcano when it blows", facingAtBlast > 0.98, `facing ${facingAtBlast?.toFixed(3)}`);
check("the camera is turned to it", view && view.facing > 0.97 && Math.abs(view.screen.x) < 0.75 && Math.abs(view.screen.y) < 0.95, JSON.stringify(view?.screen ?? null));
check("it reads as a volcano spitting fire", atEruption?.fire.burning > FIRE_ABOVE_RIM && atEruption?.fire.smoke > 3000, JSON.stringify(atEruption?.fire ?? null));
check("no fire above the rim before the blast", quiet?.burning < FIRE_ABOVE_RIM, JSON.stringify(quiet));
check("the sky is dark, so the fire stands out", atEruption?.fire.sky < 60, `sky brightness ${atEruption?.fire.sky}`);
check("the whole volcano stands above the dialogue box", view?.boxTopPx !== null && view?.footPx < view?.boxTopPx, `foot at ${view?.footPx?.toFixed(0)} px, box at ${view?.boxTopPx?.toFixed(0)} px`);
let baseline = 57.7;
try {
  baseline = Number(readFileSync("scripts/e2e/out/baseline.txt", "utf8").match(/drawRate ([\d.]+)/)[1]);
} catch {
  // Reason: the baseline file is a local proof, not in git; a fresh clone falls back to the number it held
}
check("runs at the baseline fps during the eruption", atEruption?.fps >= baseline - 3, `${atEruption?.fps?.toFixed(1)}, baseline ${baseline}`);

// ── The words ─────────────────────────────────────────────
check("no word from the forbidden list", !said.some((l) => FORBIDDEN.some((w) => l.includes(w))));
check("nothing is left of the old 'treasure is the end' story", !said.some((l) => OLD_ENDING.some((w) => l.includes(w))));
const long = said.filter((l) => l.replace(/^[^:]+: /, "").split(/\s+/).length > 14);
check("every line has at most 14 words", long.length === 0, long.join(" | "));
const convoSizes = await page.evaluate(async () => {
  const { DIALOGUES } = await import("/src/data/dialogues.ts");
  return Object.fromEntries(Object.entries(DIALOGUES).filter(([k]) => k.startsWith("treasure_")).map(([k, v]) => [k, v.length]));
});
check("a conversation has at most 5 lines", Object.values(convoSizes).every((n) => n <= 5), JSON.stringify(convoSizes));
check("the hammer is only for the ice", !said.some((l) => /Hammer/.test(l) && !/Hammer schafft|Eis/.test(l)), said.filter((l) => /Hammer/.test(l)).join(" | "));

// ── The play itself ───────────────────────────────────────
check("arrow up walks away from the camera", walk.arrowUpMovesAway === true);
check("at least one super hit", (state.perfectHits ?? 0) >= 1, `${state.perfectHits ?? 0}`);
check("the challenge ends by itself after the line", state.phase === "done" && ended === "finished", `${ended}`);
check("no page errors", errors.length === 0, errors.join(" | "));

const summary = {
  test: "treasure",
  passed: checks.every((c) => c.ok),
  checks,
  walkKeyPresses: walk.presses,
  digPresses,
  hammer: { presses: hammerPresses, hits: state.hits, perfectHits: state.perfectHits, timedPresses },
  keyPresses,
  dialogues: dialogueCount,
  said,
  phasesSeen: [...phasesSeen],
  durationSec: Math.round((Date.now() - started) / 1000),
  devServerReloads: reloads,
  errors,
  screenshots: [...shots].map((s) => `${OUT}/${s}.png`),
};
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
writeFileSync(`${OUT}/console.log`, logs.join("\n"));
console.log(summary.passed ? "PASS" : "FAIL", `${checks.filter((c) => c.ok).length}/${checks.length} checks, ${summary.durationSec} s`);
await browser.close();
process.exit(summary.passed ? 0 : 1);
