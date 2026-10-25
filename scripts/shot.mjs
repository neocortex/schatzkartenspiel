/**
 * Dev helper: open the game in headless Chromium (GPU enabled), optionally
 * drive it with key presses, then save a screenshot and print console output.
 *
 * Usage: node scripts/shot.mjs <url> <out.png> [steps...]
 *   steps: wait:<ms> | press:<Key> | hold:<Key>:<ms> | shot:<extra.png> | fps
 */

import { chromium } from "playwright";

const [url, out, ...steps] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node scripts/shot.mjs <url> <out.png> [steps...]");
  process.exit(1);
}

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("response", (r) => {
  if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`);
});

await page.goto(url);
for (const step of steps.length ? steps : ["wait:4000"]) {
  const [kind, a, b] = step.split(":");
  if (kind === "wait") await page.waitForTimeout(Number(a));
  else if (kind === "press") await page.keyboard.press(a);
  else if (kind === "shot") await page.screenshot({ path: a });
  else if (kind === "hold") {
    await page.keyboard.down(a);
    await page.waitForTimeout(Number(b));
    await page.keyboard.up(a);
  } else if (kind === "fps") {
    const fps = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const t0 = performance.now();
          const tick = () => {
            frames++;
            if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
            else resolve((frames * 1000) / (performance.now() - t0));
          };
          requestAnimationFrame(tick);
        }),
    );
    logs.push(`[fps] ${fps.toFixed(1)}`);
  }
}
await page.screenshot({ path: out });

const gpu = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
});
console.log(`gpu: ${gpu}`);
console.log(logs.join("\n"));
await browser.close();
