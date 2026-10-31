/**
 * E2E: the recorded voices, in Chrome.
 *
 *  1. Every file in the manifest exists and is playable audio
 *  2. A known line plays its recording, without browser speech
 *  3. A line in the game's dialogue box plays its recording
 *  4. Lines with a changing value speak their fixed version, which has a recording
 *  5. A stale line (superseded by a newer one) never starts playing
 *  6. A line without a recording falls back to browser speech
 *  7. Without a manifest the game still talks (browser speech) and logs no errors
 *  8. Every spoken line in the source has a recording, and none is left with a changing value
 *
 * Run (dev server on :5199 must be running):  node scripts/e2e/voices.mjs
 * Proof: scripts/e2e/out/voices/summary.json
 */

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { collectLines } from "../voice/lines.mjs";

const BASE = process.env.GAME_URL ?? "http://localhost:5199/";
const OUT = new URL("./out/voices/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Reads the source the way `npm run voices` does, so a line nobody rendered shows up here instead of as browser speech. */
{
  const { lines, dynamic } = collectLines();
  const manifest = JSON.parse(readFileSync(new URL("../../public/voices/manifest.json", import.meta.url), "utf8"));
  const unrecorded = lines.filter((l) => !manifest[`${l.speaker}|${l.text}`]);
  check("every spoken line in the source has a recording", unrecorded.length === 0, `${lines.length} lines, unrecorded: ${unrecorded.map((l) => `${l.speaker}|${l.text}`).join(" / ")}`);
  check("no spoken line has a changing value without a fixed version", dynamic.length === 0, dynamic.join(" / "));
}

/** Opens the game with a log of every recording started and every browser speech request. */
async function open(query = "?notitle", prepare = async () => {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push(m.text()));
  await page.addInitScript(() => {
    window.__played = [];
    window.__spoken = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__played.push(this.src);
      return play.call(this);
    };
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (utterance) => {
      window.__spoken.push(utterance.text);
      speak(utterance);
    };
  });
  await prepare(page);
  await page.goto(BASE + query);
  await page.waitForFunction(() => window.engine && window.game, null, { timeout: 60000 });
  // Reason: browsers only allow speech after a gesture, so give the page one
  await page.keyboard.press("Shift");
  return { page, errors };
}

/** Speaks through the same module instance the game uses (dev server only). */
const speak = (page, text, speaker) =>
  page.evaluate(
    async ([t, s]) => {
      const { NarrationManager } = await import("/src/systems/NarrationManager.ts");
      NarrationManager.getInstance().speakLine(t, s);
    },
    [text, speaker],
  );

const log = (page) => page.evaluate(() => ({ played: window.__played, spoken: window.__spoken }));

{
  const { page, errors } = await open();
  await page.waitForTimeout(500);

  const files = await page.evaluate(async () => {
    const manifest = await (await fetch("voices/manifest.json")).json();
    const entries = Object.entries(manifest);
    const durations = await Promise.all(
      entries.map(
        ([, file]) =>
          new Promise((resolve) => {
            const a = new Audio(`voices/${file}`);
            a.preload = "metadata";
            a.onloadedmetadata = () => resolve(a.duration);
            a.onerror = () => resolve(0);
          }),
      ),
    );
    return { count: entries.length, unplayable: entries.filter((_, i) => !(durations[i] > 0)).map(([k]) => k) };
  });
  check("every manifest entry is playable audio", files.count > 200 && files.unplayable.length === 0, `${files.count} files, unplayable: ${files.unplayable.length}`);

  await speak(page, "Autsch!", "Tadeo");
  await page.waitForTimeout(800);
  let seen = await log(page);
  check("a known line plays its recording", seen.played.some((s) => s.includes("/voices/")) && seen.spoken.length === 0, seen.played.at(-1)?.split("/").pop());

  const changing = await page.evaluate(async () => {
    const hens = await import("/src/challenges/hens/script.ts");
    const fishing = await import("/src/challenges/fishing/script.ts");
    const manifest = await (await fetch("voices/manifest.json")).json();
    const { praise, farewell } = fishing.ending(23);
    const lines = [...hens.ending(95, 60), ...hens.ending(95, null), ...praise, ...farewell];
    return lines.filter((l) => !manifest[`${l.speaker}|${(l.spoken ?? l.text).trim()}`]).map((l) => l.text);
  });
  check("endings with changing values all have recordings", changing.length === 0, changing.join(" / "));

  const before = (await log(page)).played.length;
  await page.evaluate(async () => {
    const { NarrationManager } = await import("/src/systems/NarrationManager.ts");
    const n = NarrationManager.getInstance();
    n.speakLine("Autsch!", "Tadeo");
    n.speakLine("Hurra!", "Tadeo");
  });
  await page.waitForTimeout(800);
  seen = await log(page);
  check("a superseded line never starts playing", seen.played.length === before + 1, `${seen.played.length - before} started`);

  await speak(page, "Diesen Satz hat niemand aufgenommen.", "Tadeo");
  await page.waitForTimeout(500);
  seen = await log(page);
  check("a line without a recording uses browser speech", seen.spoken.includes("Diesen Satz hat niemand aufgenommen."));
  check("no errors with recordings", errors.length === 0, errors.join(" / "));
  await page.close();
}

{
  const { page, errors } = await open("?quest=1");
  const say = await page.evaluate(() => {
    void window.game.ui.say([{ speaker: "Tadeo", portrait: "", text: "Hurra!" }]);
    return true;
  });
  await page.waitForTimeout(1000);
  const seen = await log(page);
  check("a dialogue box line plays its recording", say && seen.played.some((s) => s.includes("/voices/")) && seen.spoken.length === 0);
  check("no errors in the dialogue box", errors.length === 0, errors.join(" / "));
  await page.close();
}

{
  const { page, errors } = await open("?notitle", (p) => p.route("**/voices/manifest.json", (r) => r.fulfill({ status: 404, body: "" })));
  await page.waitForTimeout(500);
  await speak(page, "Autsch!", "Tadeo");
  await page.waitForTimeout(500);
  const seen = await log(page);
  check("without a manifest the game falls back to browser speech", seen.spoken.includes("Autsch!") && !seen.played.some((s) => s.includes("/voices/")));
  check("no errors without a manifest", errors.length === 0, errors.join(" / "));
  await page.close();
}

await browser.close();
const passed = results.every((r) => r.ok);
writeFileSync(`${OUT}summary.json`, JSON.stringify({ passed, results }, null, 2));
console.log(passed ? "\nALL PASS" : "\nFAIL");
process.exit(passed ? 0 : 1);
