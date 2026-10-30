/**
 * E2E: the 60 fps cap, in Chrome.
 *
 *  1. On a screen faster than 60 Hz (browser frame limit removed) the game draws about 60 frames a second
 *  2. The game still runs at normal speed there, and a key press between drawn frames is not lost
 *  3. On a 60 Hz screen the cap drops no frames
 *
 * Run (dev server on :5199 must be running):  node scripts/e2e/fps.mjs
 * Proof: scripts/e2e/out/fps/summary.json
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.GAME_URL ?? "http://localhost:5199/";
const OUT = new URL("./out/fps/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const GPU = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"];

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Opens the island, then counts browser ticks, drawn frames and game time for a few seconds. */
async function measure(args) {
  const browser = await chromium.launch({ channel: "chrome", args: [...GPU, ...args] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}?notitle`);
  await page.waitForFunction(() => window.engine && window.game, null, { timeout: 60000 });
  await page.waitForTimeout(5000);
  const stats = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const { engine } = window;
        const beginFrame = engine.input.beginFrame.bind(engine.input);
        let drawn = 0;
        let ticks = 0;
        let pressSeen = false;
        engine.input.beginFrame = () => {
          beginFrame();
          drawn++;
          if (engine.input.justPressed("KeyQ")) pressSeen = true;
        };
        const tick = () => {
          ticks++;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        const start = performance.now();
        const gameStart = engine.time;
        setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ" })), 1500);
        setTimeout(() => {
          const seconds = (performance.now() - start) / 1000;
          resolve({
            tickRate: Math.round(ticks / seconds),
            drawRate: +(drawn / seconds).toFixed(1),
            speed: +((engine.time - gameStart) / seconds).toFixed(3),
            pressSeen,
          });
        }, 4000);
      }),
  );
  await browser.close();
  return { ...stats, errors };
}

const fast = await measure(["--disable-gpu-vsync", "--disable-frame-rate-limit"]);
check("the browser offers more than 60 frames a second", fast.tickRate > 80, `${fast.tickRate} ticks/s`);
check("the game draws about 60 of them", fast.drawRate >= 55 && fast.drawRate <= 63, `${fast.drawRate} fps`);
check("the game runs at normal speed", Math.abs(fast.speed - 1) < 0.08, `${fast.speed}× real time`);
check("a key press between drawn frames is not lost", fast.pressSeen);
check("no errors when capped", fast.errors.length === 0, fast.errors.join(" / "));

const normal = await measure([]);
check("on a 60 Hz screen no frames are dropped", normal.drawRate >= normal.tickRate * 0.96, `${normal.drawRate} of ${normal.tickRate} fps`);
check("no errors on a 60 Hz screen", normal.errors.length === 0, normal.errors.join(" / "));

const passed = results.every((r) => r.ok);
writeFileSync(`${OUT}summary.json`, JSON.stringify({ passed, fast, normal, results }, null, 2));
console.log(passed ? "\nALL PASS" : "\nFAIL");
process.exit(passed ? 0 : 1);
