/**
 * E2E: the island adventure flow, played with real key presses in Chrome.
 *
 *  1. Title screen → "Neues Abenteuer" → intro flight + dialogues (narrator, Tadeo, Henni)
 *  2. Quest 1: walk to the beach signpost, read it → quest 2 starts, game is saved
 *  3. Coins: walk through a coin → counter goes up
 *  4. Quest 3 (debug start): read all three lake tablets → quest 4 starts
 *  5. Village (debug start): chat with a villager
 *
 * Run (dev server on :5199 must be running):  node scripts/e2e/island.mjs
 * Proof: scripts/e2e/out/island/summary.json + screenshots
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.GAME_URL ?? "http://localhost:5199/";
const OUT = new URL("./out/island/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const state = () =>
  page.evaluate(() => {
    const g = window.game;
    const p = g.island.player.position;
    return {
      x: p.x,
      z: p.z,
      milestone: g.quest.currentMilestone,
      coins: g.coins.collected,
      dialogue: g.ui.dialogue.isOpen,
      busy: g.busy,
      prompt: document.querySelector(".prompt")?.style.display !== "none" ? document.querySelector(".prompt")?.textContent.trim() : null,
    };
  });

/** Press Space until no dialogue is open (each press completes or advances a line). */
async function finishDialogue(maxPresses = 40) {
  for (let i = 0; i < maxPresses; i++) {
    if (!(await state()).dialogue) return true;
    await page.keyboard.press("Space");
    await wait(250);
  }
  return !(await state()).dialogue;
}

/** Steer Tadeo towards (x, z) with the arrow keys (camera looks north: Up = -z, Right = +x). */
async function walkTo(x, z, radius = 1.2, timeoutMs = 20000) {
  const t0 = Date.now();
  const held = new Set();
  const hold = async (key, on) => {
    if (on && !held.has(key)) await page.keyboard.down(key), held.add(key);
    if (!on && held.has(key)) await page.keyboard.up(key), held.delete(key);
  };
  let s = await state();
  while (Math.hypot(s.x - x, s.z - z) > radius && Date.now() - t0 < timeoutMs) {
    const dx = x - s.x;
    const dz = z - s.z;
    await hold("ArrowRight", dx > 0.4);
    await hold("ArrowLeft", dx < -0.4);
    await hold("ArrowDown", dz > 0.4);
    await hold("ArrowUp", dz < -0.4);
    await wait(60);
    s = await state();
  }
  for (const k of [...held]) await hold(k, false);
  await wait(250);
  return Math.hypot(s.x - x, s.z - z) <= radius + 0.5;
}

async function waitUntilFree(timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await state();
    if (s.dialogue) await page.keyboard.press("Space");
    else if (!s.busy) return true;
    await wait(250);
  }
  return false;
}

// ── 1. Title + intro ────────────────────────────────────────
await page.addInitScript(() => {
  if (!sessionStorage.getItem("e2e-cleared")) {
    localStorage.clear();
    sessionStorage.setItem("e2e-cleared", "1");
  }
});
await page.goto(BASE);
await wait(4000);
check("title screen shows logo + menu", await page.isVisible(".title-screen .logo"), await page.textContent(".title-screen .menu"));
await shot("01-title");
await page.keyboard.press("Space");
await wait(6000);
await shot("02-intro-flight");
await wait(9000);
check("intro dialogue opens", (await state()).dialogue);
await shot("03-intro-dialogue");
const speakers = new Set();
for (let i = 0; i < 60 && (await state()).dialogue; i++) {
  speakers.add(await page.textContent(".dialogue .name"));
  await page.keyboard.press("Space");
  await wait(200);
}
check("intro has narrator, Tadeo and Henni", ["Erzähler", "Tadeo", "Henni"].every((s) => speakers.has(s)), [...speakers].join(", "));
check("player is free after intro", await waitUntilFree());

// ── 2. Quest 1: the signpost ────────────────────────────────
const sign = [-62.6, 43.6];
check("walked to the signpost", await walkTo(sign[0] + 1.6, sign[1] + 0.4, 1.0));
let s = await state();
check("prompt offers to read the sign", s.prompt?.includes("Lesen") ?? false, s.prompt ?? "no prompt");
await shot("04-sign-prompt");
await page.keyboard.press("Space");
await wait(600);
await shot("05-sign-dialogue");
await finishDialogue();
await wait(3500);
s = await state();
check("quest 2 (Vulkan) is active after the sign", s.milestone === 2, `milestone ${s.milestone}`);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("schatzkarten_save") ?? "null"));
check("progress was saved", saved?.milestone === 2, JSON.stringify(saved));
await shot("06-quest2-banner");

// ── 3. Coins ────────────────────────────────────────────────
const coinsBefore = (await state()).coins;
const coin = await page.evaluate(() => {
  const p = window.game.island.player.position;
  const spots = window.game.coins.spots.filter((_, i) => !window.game.coins.taken.has(i));
  spots.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  return [spots[0].x, spots[0].z];
});
await page.evaluate(([x, z]) => window.game.placePlayer(x, z + 4), coin);
await wait(500);
await walkTo(coin[0], coin[1], 0.6, 8000);
await wait(300);
s = await state();
check("walking through a coin collects it", s.coins === coinsBefore + 1, `${coinsBefore} → ${s.coins}`);
check("HUD shows the coin count", (await page.textContent(".hud-coins"))?.includes(`${s.coins} / 30`) ?? false);
await shot("07-coin");

// ── 4. Quest 3: three lake tablets ──────────────────────────
await page.goto(`${BASE}?quest=3`);
await wait(4000);
// [x, z, approach dx, approach dz] — tablet 2 stands on a steep lake bank, reachable only from the east
const tablets = [[-14, -9, 0, 1], [17, -9, 1, 0], [2, 19, 0, 1]];
for (const [i, [tx, tz, ax, az]] of tablets.entries()) {
  await page.evaluate(([x, z]) => window.game.placePlayer(x, z), [tx + ax * 3.2, tz + az * 3.2]);
  await wait(500);
  await walkTo(tx + ax * 2.2, tz + az * 2.2, 0.6, 6000);
  s = await state();
  check(`tablet ${i + 1}: prompt to read`, s.prompt?.includes("Lesen") ?? false, s.prompt ?? "no prompt");
  await page.keyboard.press("Space");
  await wait(500);
  if (i === 2) await shot("08-ghost-tablet");
  await finishDialogue();
  await wait(400);
}
await waitUntilFree();
s = await state();
check("quest 4 (Höhle) is active after all tablets", s.milestone === 4, `milestone ${s.milestone}`);
await shot("09-quest4");

// ── 5. Village chat ─────────────────────────────────────────
await page.goto(`${BASE}?quest=8`);
await wait(4000);
await page.evaluate(() => window.game.placePlayer(72, 44.4, Math.PI));
await wait(600);
s = await state();
check("villager offers a chat", s.prompt?.includes("Sprechen") ?? false, s.prompt ?? "no prompt");
await page.keyboard.press("Space");
await wait(900);
const chatName = await page.textContent(".dialogue .name");
check("chat dialogue with a villager", (await state()).dialogue && chatName === "Opa Kalle", chatName ?? "");
await shot("10-village-chat");
await finishDialogue();
await waitUntilFree();
await page.evaluate(() => window.game.placePlayer(60, 42.4, Math.PI));
await wait(600);
s = await state();
check("Fischer Jonas offers the fishing side game", s.prompt?.includes("Angeln") ?? false, s.prompt ?? "no prompt");

const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => (++n, performance.now() - t0 < 2000 ? requestAnimationFrame(tick) : resolve((n * 1000) / (performance.now() - t0)));
      requestAnimationFrame(tick);
    }),
);
check("runs smoothly (≥ 50 fps)", fps >= 50, `${fps.toFixed(1)} fps`);
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
const passed = results.every((r) => r.ok);
writeFileSync(`${OUT}summary.json`, JSON.stringify({ passed, when: new Date().toISOString(), results, errors }, null, 2));
console.log(passed ? "\nPASS" : "\nFAIL", `→ ${OUT}summary.json`);
process.exit(passed ? 0 : 1);
