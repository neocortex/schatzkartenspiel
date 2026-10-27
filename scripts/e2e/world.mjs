/**
 * E2E: the bigger island — the four new regions (Lagunenstrand, Dschungel,
 * Seerosensumpf, Blumenhügel) exist, look different and can be reached, while
 * every old quest spot stays exactly where it was.
 *
 *  1. Terrain: old spots unchanged, piers over water, regions, lagoon, ford, size
 *  2. Landmarks and walking routes between the regions
 *  3. Screenshots: map from above, every region from the ground, landmark close-ups
 *  4. Smoothness and console errors
 *
 * Run (dev server on :5199 must be running):  node scripts/e2e/world.mjs
 * Proof: scripts/e2e/out/world/summary.json + screenshots
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.GAME_URL ?? "http://localhost:5199/";
const OUT = new URL("./out/world/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/** Terrain heights at the old quest spots, measured before the island grew. */
const BASELINE = {"spawn":[-66,47,0.21],"sign":[-62.6,43.6,1.043],"volcanoGate":[-56,14,3.018],"tablet0":[-14,-9,3.755],"tablet1":[17,-9,3.33],"tablet2":[2,19,2.765],"cave":[-60,-18.5,2.127],"forestGate":[-12,26,3.763],"ogreGate":[38,0,2.571],"ogreBack":[53.5,0.5,2.651],"elder":[65,37,2.406],"plaza":[64,44,2.124],"mountainGate":[55.5,-13.5,2.927],"northDockEnd":[-36,-76,-15.4],"lake":[2,2,-2.6],"jonasBack":[61.9,42.8,2.175]};
/** Walkable cells on a 2-unit grid over ±175 before the island grew. */
const OLD_WALKABLE = 3927;
const REGIONS = ["lagoon", "jungle", "swamp", "hills"];

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !m.text().includes("/tts") && errors.push(m.text()));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);

/**
 * Mean screen brightness (0-255) — a NaN pixel smeared by bloom turns the screen black.
 * `rows` picks a band of the 36-row downsample (0 = top of the screen).
 */
async function brightness(rows = [0, 36]) {
  // Reason: the WebGL canvas has no preserved drawing buffer, so measure a real screenshot instead
  const png = (await page.screenshot()).toString("base64");
  return page.evaluate(
    async ({ png, rows }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const g = document.createElement("canvas");
      g.width = 64;
      g.height = 36;
      const x = g.getContext("2d");
      x.drawImage(img, 0, 0, 64, 36);
      const d = x.getImageData(0, rows[0], 64, rows[1] - rows[0]).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
      return s / (d.length / 4);
    },
    { png, rows },
  );
}

const fpsOver = (ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => (++n, performance.now() - t0 < ms ? requestAnimationFrame(tick) : resolve((n * 1000) / (performance.now() - t0)));
        requestAnimationFrame(tick);
      }),
    ms,
  );

// ── 1. Terrain ──────────────────────────────────────────────
await page.goto(`${BASE}?notitle`);
await page.waitForFunction(() => window.game?.island?.island?.hf, null, { timeout: 30000 });
await wait(1500);

const terrain = await page.evaluate(
  async ({ baseline, regions }) => {
    const { LOBES, SPOTS } = await import("/src/world/layout.ts");
    const island = window.game.island.island;
    const hf = island.hf;
    const off = Object.entries(baseline)
      .map(([k, [x, z, h]]) => [k, +(hf.heightAt(x, z) - h).toFixed(3)])
      .filter(([, d]) => Math.abs(d) > 0.15);
    let walkable = 0;
    for (let z = -175; z <= 175; z += 2) for (let x = -175; x <= 175; x += 2) if (hf.isWalkable(x, z)) walkable++;
    const region = typeof hf.regionAt === "function" ? Object.fromEntries(regions.map((r, i) => [r, +hf.regionAt(LOBES[r].c[0], LOBES[r].c[1], i).toFixed(2)])) : null;
    const at = (p) => (p ? +hf.heightAt(p[0], p[1]).toFixed(2) : null);
    const ford = SPOTS?.ford;
    return {
      off,
      walkable,
      region,
      pierSouth: at([-84, 66]),
      pierNorth: at([-36, -76]),
      lagoonWater: at(SPOTS?.lagoonWater),
      fordWalkable: ford ? hf.isWalkable(ford[0], ford[1]) : false,
      riverNorthOfFord: ford ? hf.isWalkable(ford[0] + 2, ford[1] - 12) : true,
    };
  },
  { baseline: BASELINE, regions: REGIONS },
);
check("old quest spots unchanged (±0.15)", terrain.off.length === 0, JSON.stringify(terrain.off));
check("old piers still end over water", terrain.pierSouth < -0.5 && terrain.pierNorth < -5, `south ${terrain.pierSouth}, north ${terrain.pierNorth}`);
for (const r of REGIONS) check(`region ${r} exists`, (terrain.region?.[r] ?? 0) > 0.8, String(terrain.region?.[r] ?? "regionAt missing"));
check("lagoon is shallow water", terrain.lagoonWater > -1.2 && terrain.lagoonWater < -0.2, String(terrain.lagoonWater));
check("ford is wadeable, river north of it is not", terrain.fordWalkable && !terrain.riverNorthOfFord, `ford ${terrain.fordWalkable}, river ${terrain.riverNorthOfFord}`);
console.log(`walkable cells: ${terrain.walkable} (old ${OLD_WALKABLE})`);
check("island is ≥ 1.6× bigger", OLD_WALKABLE > 0 && terrain.walkable >= OLD_WALKABLE * 1.6, `${terrain.walkable} vs ${OLD_WALKABLE}`);

// Region water (lagoon, pool, puddles, pond) may only dig into the ground: where region weights reach out
// over the sea it must never lift the sea floor into shoals. The frog islet is the one raised spot.
const shoals = await page.evaluate(async () => {
  const { Noise2D } = await import("/src/core/noise.ts");
  const { regionWater, regionWeights } = await import("/src/world/regions.ts");
  const { SPOTS } = await import("/src/world/layout.ts");
  const noise = new Noise2D(1337);
  const w = [0, 0, 0, 0];
  const found = [];
  for (let z = -175; z <= 175; z += 2) {
    for (let x = -175; x <= 175; x += 2) {
      regionWeights(x, z, noise, w);
      if (w.every((v) => v < 0.001) || Math.hypot(x - SPOTS.frogIslet[0], z - SPOTS.frogIslet[1]) < 4) continue;
      // Deep sea, shallow sea and low land; pathD 99 = away from paths, where puddles may form
      for (const h of [-15, -2, 0.5]) {
        const dug = regionWater(h, x, z, noise, w, 99);
        if (dug > h + 0.001) found.push([x, z, h, +dug.toFixed(2)]);
      }
    }
  }
  return found;
});
check("region water never lifts the sea floor", shoals.length === 0, `${shoals.length} raised cells ${JSON.stringify(shoals.slice(0, 4))}`);

// ── 2. Plants ───────────────────────────────────────────────
const PLANTS = ["bamboo", "bigLeaf", "fern", "giantFlower", "hibiscus", "mangrove", "reeds", "lilyPad", "flowerPatch", "lightTree"];
const flora = await page.evaluate(() => {
  const counts = {};
  let lilyOff = 0;
  let lilyAtSea = 0;
  const hf = window.game.island.island.hf;
  // Deep water within 8 units means the pad drifts on the open sea, not in a pond or puddle
  const nearSea = (x, z) => [4, 8].some((r) => [0, 1, 2, 3, 4, 5, 6, 7].some((k) => hf.heightAt(x + Math.cos(k * 0.785) * r, z + Math.sin(k * 0.785) * r) < -3));
  window.game.island.island.scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.name.startsWith("flora:")) return;
    const kind = o.name.slice(6);
    counts[kind] = (counts[kind] ?? 0) + o.count;
    if (kind !== "lilyPad") return;
    const m = o.matrix.clone();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      if (Math.abs(m.elements[13]) > 0.06) lilyOff++;
      if (nearSea(m.elements[12], m.elements[14])) lilyAtSea++;
    }
  });
  return { counts, lilyOff, lilyAtSea };
});
for (const k of PLANTS) check(`plant ${k} grows`, (flora.counts[k] ?? 0) >= 10, String(flora.counts[k] ?? 0));
check("lily pads float on the water", (flora.counts.lilyPad ?? 0) > 0 && flora.lilyOff === 0, `${flora.lilyOff} off the surface`);
check("no lily pads on the open sea", flora.lilyAtSea === 0, `${flora.lilyAtSea} next to deep water`);

// ── 3. Landmarks + getting around ───────────────────────────
const sites = await page.evaluate(async () => {
  const { SPOTS } = await import("/src/world/layout.ts");
  const island = window.game.island.island;
  const lm = island.landmarks;
  const names = new Set();
  island.scene.traverse((o) => o.name && names.add(o.name.split(":")[0]));
  const sails = island.scene.getObjectByName("windmill:sails");
  const before = sails?.rotation.x ?? 0;
  await new Promise((r) => setTimeout(r, 1000));
  return {
    jetty: lm.surfaceHeight(...SPOTS.lagoonJettyEnd),
    ford: lm.surfaceHeight(...SPOTS.ford),
    sites: ["lagoon", "jungleRuin", "frogIslet", "windmill", "ford", "boardwalk"].filter((n) => !names.has(n)),
    sailsTurn: sails ? Math.abs(sails.rotation.x - before) > 0.05 : false,
  };
});
check("new landmarks are built", sites.sites.length === 0, sites.sites.length ? `missing ${sites.sites.join(", ")}` : "");
check("lagoon jetty is walkable", sites.jetty !== null, String(sites.jetty));
check("ford stepping stones are walkable", sites.ford !== null, String(sites.ford));
check("windmill sails turn", sites.sailsTurn);

const state = () =>
  page.evaluate(() => {
    const p = window.game.island.player.position;
    return { x: p.x, z: p.z };
  });
/** Steer Tadeo towards (x, z) with the arrow keys (camera looks north: Up = -z, Right = +x). */
async function walkTo(x, z, radius = 1.5, timeoutMs = 12000) {
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
    // Reason: pick the arrow combination closest to the straight line (tan 22.5° ≈ 0.41), so the walk follows the path instead of cutting corners
    const sideways = Math.abs(dx) > 0.4 && Math.abs(dx) >= Math.abs(dz) * 0.41;
    const forward = Math.abs(dz) > 0.4 && Math.abs(dz) >= Math.abs(dx) * 0.41;
    await hold("ArrowRight", sideways && dx > 0);
    await hold("ArrowLeft", sideways && dx < 0);
    await hold("ArrowDown", forward && dz > 0);
    await hold("ArrowUp", forward && dz < 0);
    await wait(60);
    s = await state();
  }
  for (const k of [...held]) await hold(k, false);
  return Math.hypot(s.x - x, s.z - z) <= radius + 0.5;
}
/** Walk a route of waypoints; returns the first waypoint that could not be reached, or null. */
async function walkRoute(route) {
  await page.evaluate(([x, z]) => window.game.placePlayer(x, z), route[0]);
  await wait(800);
  for (const [x, z] of route.slice(1)) if (!(await walkTo(x, z))) return [x, z, await state()];
  return null;
}
const ROUTES = {
  "village → lagoon": [[60, 51], [59, 60], [64, 72], [72, 84], [78, 95]],
  "village → ford → lake": [[58, 47], [48, 48], [38, 50], [30, 52], [26, 54], [22, 40], [19, 27], [17, 15]],
  "ford → jungle → swamp → old beach": [[30, 52], [24, 64], [20, 78], [14, 90], [3, 98], [-5, 101], [-20, 102], [-36, 98], [-41, 94], [-50, 82], [-57, 68], [-62, 56], [-65, 48]],
  "bridge → flower hills": [[56, 10], [70, 7], [88, 5], [104, 3], [118, 2]],
};
for (const [name, route] of Object.entries(ROUTES)) {
  const stuck = await walkRoute(route);
  check(`walk ${name}`, stuck === null, stuck ? `stuck before ${stuck[0]},${stuck[1]} at ${stuck[2].x.toFixed(1)},${stuck[2].z.toFixed(1)}` : "");
}

// ── 4. Screenshots ──────────────────────────────────────────
await page.goto(`${BASE}?cam=0,420,60,10,0,10`);
await wait(6000);
await shot("00_map");
check("map view renders (not black)", (await brightness()) > 40);

/** Ground-level look at each region (spawn spots are walkable ground in that region). */
const VIEWS = { lagoon: [80, 97], jungle: [0, 92], swamp: [-48, 86], hills: [108, 4] };
await page.goto(`${BASE}?notitle`);
await page.waitForFunction(() => window.game?.island, null, { timeout: 30000 });
await wait(2500);
let n = 10;
for (const [name, [x, z]] of Object.entries(VIEWS)) {
  await page.evaluate(([x, z]) => window.game.placePlayer(x, z, Math.PI), [x, z]);
  await wait(3500);
  await shot(`${n++}_${name}`);
  check(`${name} view renders (not black)`, (await brightness()) > 40);
  if (name === "jungle") {
    const fps = await fpsOver(3000);
    check("jungle runs smoothly (≥ 50 fps)", fps >= 50, `${fps.toFixed(1)} fps`);
    // Mist hangs between the far trees (top of the screen) but leaves Tadeo's ground clear, no grey discs
    const showMist = (on) => page.evaluate((on) => (window.game.island.island.scene.getObjectByName("smoke-mist").visible = on), on);
    const FAR = [0, 12];
    const NEAR = [12, 36];
    const lift = { far: 0, near: 0 };
    for (let k = 0; k < 3; k++) {
      await showMist(false);
      await wait(150);
      const clear = { far: await brightness(FAR), near: await brightness(NEAR) };
      await showMist(true);
      await wait(150);
      lift.far += ((await brightness(FAR)) - clear.far) / 3;
      lift.near += ((await brightness(NEAR)) - clear.near) / 3;
    }
    check("jungle mist leaves Tadeo's ground clear (lower view lifts < 5/255)", lift.near < 5, `+${lift.near.toFixed(1)}`);
    check("jungle mist still shows in the distance (top view lifts > 3/255)", lift.far > 3, `+${lift.far.toFixed(1)}`);
  }
}

// Animals and ambience: each species shows up around Tadeo in its own region
/** Visible instances of the critter mesh(es) called `name` within `r` of (x, z). */
const critterCount = (name, x, z, r) =>
  page.evaluate(
    ([name, x, z, r]) => {
      let count = 0;
      window.game.island.island.scene.traverse((o) => {
        const pose = o.name === name ? o.geometry?.attributes.aPose : null;
        if (!pose) return;
        const anim = o.geometry.attributes.aAnim;
        for (let i = 0; i < pose.count; i++) if (anim.getW(i) > 0 && Math.hypot(pose.getX(i) - x, pose.getZ(i) - z) < r) count++;
      });
      return count;
    },
    [name, x, z, r],
  );
/** Where Tadeo stands, which critter mesh must show up near him, and how near. */
const ANIMALS = {
  "turtles at the lagoon beach": [80, 97, "turtles", 30],
  "frogs at the swamp": [-48, 86, "frogs", 30],
  "sheep on the flower hills": [108, 4, "sheep", 30],
  "parrots in the jungle": [0, 92, "parrots", 35],
  "dolphins off the lagoon jetty": [95, 100, "dolphins", 70],
};
n = 30;
for (const [label, [x, z, name, r]] of Object.entries(ANIMALS)) {
  await page.evaluate(([x, z]) => window.game.placePlayer(x, z, Math.PI), [x, z]);
  await wait(3000);
  const seen = await critterCount(name, x, z, r);
  await shot(`${n++}_${name}`);
  check(label, seen >= 2, `${seen} ${name}`);
}
const pond = [-56, 98];
const lagoon = [100, 96];
check("dragonflies over the swamp pond", (await critterCount("dragonflies", ...pond, 25)) >= 2);
check("dragonflies over the lagoon", (await critterCount("dragonflies", ...lagoon, 25)) >= 2);
const glow = await page.evaluate(() => {
  const scene = window.game.island.island.scene;
  return { fireflies: scene.getObjectByName("fireflies:swamp")?.geometry.instanceCount ?? 0, mist: !!scene.getObjectByName("smoke-mist") };
});
check("fireflies glow over the swamp", glow.fireflies >= 50, String(glow.fireflies));
check("mist drifts through the jungle", glow.mist);

/** Close-ups of the new landmarks from a fixed camera: spot (x, z), camera offset (dx, dy, dz), look-at height. */
const CLOSEUPS = {
  "20_jetty": [90, 99, -12, 6, 12, 1],
  "21_ford": [38, 50, -9, 6, 10, 0],
  "22_windmill": [126, 2, -16, 7, 14, 5],
  "23_ruin": [-8, 110, 5, 6, -13, 2],
  "24_frog_islet": [-56, 98, 8, 5, 9, 1],
  "25_boardwalk": [-62.8, 56, 9, 6, 6, 0.5],
};
const grounds = await page.evaluate((spots) => spots.map(([x, z]) => window.game.island.island.hf.heightAt(x, z)), Object.values(CLOSEUPS));
for (const [i, [name, [x, z, dx, dy, dz, look]]] of Object.entries(CLOSEUPS).entries()) {
  const y = grounds[i];
  await page.goto(`${BASE}?cam=${x + dx},${y + dy},${z + dz},${x},${y + look},${z}`);
  await wait(6000);
  await shot(name);
  check(`${name.slice(3)} close-up renders (not black)`, (await brightness()) > 40);
}

// ── 5. Errors ───────────────────────────────────────────────
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
const passed = results.every((r) => r.ok);
writeFileSync(`${OUT}summary.json`, JSON.stringify({ passed, when: new Date().toISOString(), results, errors }, null, 2));
console.log(passed ? "\nPASS" : "\nFAIL", `→ ${OUT}summary.json`);
process.exit(passed ? 0 : 1);
