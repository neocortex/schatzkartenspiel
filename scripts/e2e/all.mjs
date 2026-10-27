/**
 * Runs every E2E test one after another (each opens its own Chrome) and
 * writes a combined summary.
 *
 * Run (dev server on :5199 must be running):  node scripts/e2e/all.mjs [name ...]
 * Proof: scripts/e2e/out/all.json, plus each test's own scripts/e2e/out/<name>/
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const TESTS = ["world", "island", "volcano", "cave", "forest", "ogre", "village", "mountain", "sea", "treasure", "fishing", "hens"];
const names = process.argv.length > 2 ? process.argv.slice(2) : TESTS;
const dir = new URL("./", import.meta.url).pathname;
mkdirSync(`${dir}out`, { recursive: true });

const results = [];
for (const name of names) {
  const t0 = Date.now();
  // Reason: a test that hangs must not block the rest of the run
  const run = spawnSync("node", [`${dir}${name}.mjs`], { stdio: ["ignore", "ignore", "inherit"], timeout: 8 * 60_000 });
  const ok = run.status === 0;
  const seconds = Math.round((Date.now() - t0) / 1000);
  results.push({ name, ok, seconds });
  console.log(`${ok ? "✔" : "✘"} ${name} (${seconds}s)`);
}

const passed = results.every((r) => r.ok);
writeFileSync(`${dir}out/all.json`, JSON.stringify({ passed, when: new Date().toISOString(), results }, null, 2));
console.log(passed ? "\nALL PASS" : "\nFAIL", `→ ${dir}out/all.json`);
process.exit(passed ? 0 : 1);
