/**
 * The island follows the story: for every quest the wreck, boats, boulder, hedge, Paco and the ogre stand where the
 * story says, the boulder and the ogre really close the way, goals stay reachable after a Continue, and the volcano
 * rumbles a little harder each time. Part of world.mjs; `reach` is for any E2E that asks where Tadeo can walk.
 */

import { readFileSync } from "node:fs";

const row = (wreck, dockBoat, boulder, hedge, paco, ogre) => ({ wreck, pierBoat: false, dockBoat, boulder, hedge, paco, ogre });
const EARLY = row(true, false, true, true, "away", "bridge");
const MIDDLE = row(true, false, true, true, "village", "bridge");
const OPEN_FOREST = row(true, false, true, false, "village", "bridge");
const LATE = row(false, true, false, false, "dock", "dock");
/** What the island looks like at each quest. */
export const EXPECTED = {
  1: EARLY, 2: EARLY, 3: MIDDLE, 4: MIDDLE, 5: MIDDLE, 6: MIDDLE, 7: OPEN_FOREST, 8: OPEN_FOREST,
  9: row(true, false, false, false, "village", "friend"), 10: LATE, 11: LATE, 12: LATE,
};
const sameFields = (got, want) => Object.keys(want).every((k) => got[k] === want[k]);

const TRAIL_END = [55.5, -13.5];
const VILLAGE = [64, 44];
const FOREST_GATE = [-12, 26];
const VOLCANO_GATE = [-56, 14];
const CAVE_GATE = [-60, -18.5];
const SPAWN = [-66, 47];
const DOCK_END = [-36, -76];
/** The sealed end of the trail behind the boulder (walkable, right at the foot of the steps). */
const STEPS_FOOT = [54.75, -13];

/** Runs in the page: flood fill over Player's own walk rule (terrain or deck, and no collider within his radius). */
function installFlood() {
  const STEP = 0.25;
  const HALF = 175;
  const N = Math.round((HALF * 2) / STEP) + 1;
  const toCell = (v) => Math.round((v + HALF) / STEP);
  const toWorld = (c) => c * STEP - HALF;
  window.walkFlood = (from, { noFord = null, diagonal = false } = {}) => {
    const { hf, colliders, landmarks } = window.game.island.island;
    const free = (x, z) =>
      (landmarks.surfaceHeight(x, z) != null || hf.isWalkable(x, z)) &&
      !colliders.hits(x, z, 0.35) &&
      !(noFord && Math.hypot(x - noFord[0], z - noFord[1]) < 8);
    // Reason: goals such as the well or a villager stand on their own collider, so start at the nearest free cell
    let start = null;
    for (let r = 0; r <= 24 && start === null; r++) {
      for (let dz = -r; dz <= r && start === null; dz++) {
        for (let dx = -r; dx <= r && start === null; dx++) {
          const ix = toCell(from[0]) + dx;
          const iz = toCell(from[1]) + dz;
          if (free(toWorld(ix), toWorld(iz))) start = iz * N + ix;
        }
      }
    }
    const seen = new Uint8Array(N * N);
    const steps = diagonal ? [1, -1, N, -N, N + 1, N - 1, -N + 1, -N - 1] : [1, -1, N, -N];
    const stack = start === null ? [] : [start];
    if (start !== null) seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      for (const s of steps) {
        const j = i + s;
        if (seen[j]) continue;
        // 1 = walked to, 2 = looked at and blocked
        seen[j] = free(toWorld(j % N), toWorld((j / N) | 0)) ? 1 : 2;
        if (seen[j] === 1) stack.push(j);
      }
    }
    return {
      free,
      has: (x, z) => seen[toCell(z) * N + toCell(x)] === 1,
      /** Whether Tadeo can stand within `radius` of a point. */
      gets: (to, radius) => {
        const r = Math.ceil(radius / STEP);
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.hypot(dx, dz) * STEP > radius) continue;
            if (seen[(toCell(to[1]) + dz) * N + toCell(to[0]) + dx] === 1) return true;
          }
        }
        return false;
      },
    };
  };
}

/**
 * Can Tadeo walk from one point to within `radius` of another? `loose` also counts diagonal steps between cells:
 * use it to prove a way is closed. The default (only straight steps) is the stricter proof that a way is open.
 */
export const reach = (page, from, to, { radius = 2, noFord = false, loose = false } = {}) =>
  page.evaluate(
    async ({ from, to, radius, noFord, loose }) => {
      const { SPOTS } = await import("/src/world/layout.ts");
      return window.walkFlood(from, { noFord: noFord ? SPOTS.ford : null, diagonal: loose }).gets(to, radius);
    },
    { from, to, radius, noFord, loose },
  );

export async function storyChecks({ page, BASE, check, shot, wait, brightness }) {
  await page.addInitScript(installFlood);
  const open = async (query) => {
    await page.goto(`${BASE}${query}`);
    await page.waitForFunction(() => window.game?.story && window.engine?.scene === window.game.island, null, { timeout: 30000 });
    await wait(600);
  };
  const story = () => page.evaluate(() => window.game.story.e2e);
  const place = async (x, z) => {
    await page.evaluate(([x, z]) => window.game.placePlayer(x, z), [x, z]);
    await wait(500);
  };
  const player = () => page.evaluate(() => [window.game.island.player.position.x, window.game.island.player.position.z]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const promptText = () => page.evaluate(() => {
    const el = document.querySelector(".prompt");
    return el && el.style.display !== "none" ? el.textContent.trim() : null;
  });
  /** Steer Tadeo with the arrow keys; camera looks north, so Up = -z and Right = +x. Returns whether he arrived. */
  const walkTo = async (x, z, radius = 1, timeoutMs = 8000) => {
    const t0 = Date.now();
    const held = new Set();
    const hold = async (key, on) => {
      if (on && !held.has(key)) await page.keyboard.down(key), held.add(key);
      if (!on && held.has(key)) await page.keyboard.up(key), held.delete(key);
    };
    let p = await player();
    while (dist(p, [x, z]) > radius && Date.now() - t0 < timeoutMs) {
      const [dx, dz] = [x - p[0], z - p[1]];
      await hold("ArrowRight", dx > 0.3);
      await hold("ArrowLeft", dx < -0.3);
      await hold("ArrowDown", dz > 0.3);
      await hold("ArrowUp", dz < -0.3);
      await wait(50);
      p = await player();
    }
    for (const k of [...held]) await hold(k, false);
    await wait(150);
    return dist(await player(), [x, z]) <= radius + 0.4;
  };
  /** Hold one arrow key for a while, like a child running at something. */
  const run = async (key, ms) => {
    await page.keyboard.down(key);
    await wait(ms);
    await page.keyboard.up(key);
    await wait(150);
  };
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

  // ── The island at each quest ──────────────────────────────
  for (const [m, want] of Object.entries(EXPECTED)) {
    await open(`?quest=${m}`);
    const got = await story();
    check(`island state at quest ${m}`, sameFields(got, want), JSON.stringify(got));
  }

  // ── The way past the boulder and the ogre ─────────────────
  await open("?quest=8");
  check("boulder blocks the trail, from the village", !(await reach(page, VILLAGE, TRAIL_END, { loose: true })));
  check("boulder blocks the trail, from the west", !(await reach(page, FOREST_GATE, TRAIL_END, { loose: true })));
  check("ogre's bridge closed before quest 9", !(await reach(page, FOREST_GATE, VILLAGE, { noFord: true, loose: true })));
  const pocket = await page.evaluate(([center, village, steps]) => {
    const { boulder } = window.game.story;
    // Reason: the mountain's face has walkable spots nobody can ever get to, rocks or not; only a spot the rocks cut off is a pocket
    boulder.set(false);
    const noRocks = window.walkFlood(village, { diagonal: true });
    boulder.set(true);
    const fromVillage = window.walkFlood(village, { diagonal: true });
    const fromSteps = window.walkFlood(steps, { diagonal: true });
    let villageSide = 0;
    let trailSide = 0;
    const orphans = [];
    for (let z = center[1] - 10; z <= center[1] + 10; z += 0.25) {
      for (let x = center[0] - 10; x <= center[0] + 10; x += 0.25) {
        if (Math.hypot(x - center[0], z - center[1]) > 10 || !fromVillage.free(x, z) || !noRocks.has(x, z)) continue;
        if (fromVillage.has(x, z)) villageSide++;
        else if (fromSteps.has(x, z)) trailSide++;
        else orphans.push([x, z]);
      }
    }
    return { villageSide, trailSide, orphans: orphans.length, sample: orphans.slice(0, 4) };
  }, [[55.5, -8.5], VILLAGE, STEPS_FOOT]);
  check("no pocket: every walkable cell near the boulder reaches the village, or is the sealed trail behind it", pocket.orphans === 0 && pocket.villageSide > 100, JSON.stringify(pocket));
  /** Looks over each collider of a barrier: is something of the prop standing on it? */
  const bareSpots = (name) =>
    page.evaluate((name) => {
      const barrier = window.game.story[name];
      const group = barrier.prop.group;
      group.updateMatrixWorld(true);
      const points = [];
      group.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 3) {
          // Reason: every Vector3 in the page comes from the prop's own position, three is not a global here
          points.push(group.position.clone().set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld));
        }
      });
      const { hf } = window.game.island.island;
      const bare = [];
      for (const c of barrier.circles) {
        for (let k = 0; k < 9; k++) {
          const a = (k / 8) * Math.PI * 2;
          const r = k === 8 ? 0 : c.r * 0.8;
          const x = c.x + Math.cos(a) * r;
          const z = c.z + Math.sin(a) * r;
          const covered = points.some((p) => Math.hypot(p.x - x, p.z - z) < 0.8 && p.y > hf.heightAt(x, z) + 0.2);
          if (!covered) bare.push([+x.toFixed(1), +z.toFixed(1)]);
        }
      }
      return { circles: barrier.circles.length, bare };
    }, name);
  const rocks = await bareSpots("boulder");
  check("every collider of the boulder has a rock on it", rocks.circles > 0 && rocks.bare.length === 0, JSON.stringify(rocks));

  // A child running at the rocks and along them: he never gets past and always gets away again
  let past = false;
  const stuck = [];
  for (const x of [53, 55, 57, 59, 61]) {
    await walkTo(x, -3);
    await run("ArrowUp", 1600);
    const p = await player();
    past ||= dist(p, TRAIL_END) < 2.5;
    await shot(`50_run_at_boulder_x${x}`);
    await run("ArrowDown", 700);
    if (dist(await player(), p) < 1) stuck.push(p);
  }
  check("running at the boulder never gets past it", !past);
  check("he can always walk away from the rocks", stuck.length === 0, JSON.stringify(stuck));
  await place(36, 1.1);
  await run("ArrowRight", 2600);
  const leftRail = await player();
  await place(36, -1.1);
  await run("ArrowRight", 2600);
  const rightRail = await player();
  check("running along either rail never gets past the ogre", leftRail[0] < 44 && rightRail[0] < 44, JSON.stringify({ leftRail, rightRail }));

  await open("?quest=9");
  check("trail open once the boulder is gone", await reach(page, VILLAGE, TRAIL_END));
  await place(55.5, -3);
  check("Tadeo walks up to the steps at quest 9", await walkTo(STEPS_FOOT[0], -11.5, 1.2));
  check("the mountain gate offers the climb", (await promptText())?.includes("Los geht") ?? false, String(await promptText()));

  await open("?quest=3");
  check("ford open at quest 3", await reach(page, VOLCANO_GATE, [65, 37], { radius: 2.7 }));

  // ── Walking in at the cave and the hedge ──────────────────
  await open("?quest=5");
  check("the landing beach reaches the cave gate at quest 5", await reach(page, SPAWN, CAVE_GATE, { radius: 3.4 }));
  await place(-60, -9);
  check("Tadeo walks up to the cave mouth", await walkTo(-60, -17.5, 1));
  check("the cave offers its prompt", (await promptText())?.includes("Los geht") ?? false, String(await promptText()));

  await open("?quest=6");
  check("the cave reaches the forest gate at quest 6", await reach(page, [-60, -16], FOREST_GATE, { radius: 3.4 }));
  await place(-4, 23);
  check("Tadeo walks up to the hedge from the lake path", await walkTo(FOREST_GATE[0], FOREST_GATE[1] - 2.6, 1));
  check("the hedge leaves the forest gate's prompt in reach", (await promptText())?.includes("Los geht") ?? false, String(await promptText()));
  await shot("51_hedge_prompt");
  await run("ArrowDown", 1500);
  check("he cannot run through the hedge", (await player())[1] < FOREST_GATE[1] + 1, JSON.stringify(await player()));
  const thorns = await bareSpots("hedge");
  check("every collider of the hedge has thorns on it", thorns.circles > 3 && thorns.bare.length === 0, JSON.stringify(thorns));

  // ── apply and remove ──────────────────────────────────────
  await open("?quest=8");
  await page.evaluate(() => {
    const s = window.game.story;
    s.apply(8);
    s.apply(8);
    s.apply(9);
  });
  check("applying a quest twice leaves no walls behind", await reach(page, VILLAGE, TRAIL_END));
  await page.evaluate(() => window.game.story.apply(8));
  check("applying an earlier quest closes the trail again", !(await reach(page, VILLAGE, TRAIL_END, { loose: true })));
  await page.evaluate(() => {
    window.game.story.apply(1);
    window.boulderGone = window.game.story.boulder.remove();
    window.hedgeGone = window.game.story.hedge.remove();
  });
  await page.evaluate(() => Promise.all([window.boulderGone, window.hedgeGone]));
  const left = await story();
  check("remove() takes the boulder and the hedge away", !left.boulder && !left.hedge, JSON.stringify(left));
  check("the rocks' colliders go with them", await reach(page, VILLAGE, TRAIL_END));
  const back = await page.evaluate(() => {
    const s = window.game.story;
    s.apply(1);
    const parts = [];
    s.boulder.prop.group.traverse((o) => o.isMesh && parts.push(o.scale.x));
    return { state: s.e2e, parts };
  });
  check("a removed prop can come back whole", back.state.boulder && back.state.hedge && back.parts.every((v) => Math.abs(v - 1) < 1e-6), JSON.stringify(back));

  // ── Nothing hides inside a story collider ─────────────────
  const buried = await page.evaluate(() => {
    const { colliders } = window.game.island.island;
    const count = (m) => {
      window.game.story.apply(m);
      return window.game.coins.spots.filter((s) => colliders.hits(s.x, s.z, 0)).length;
    };
    return { early: count(1), friend: count(9), dock: count(10) };
  });
  check("no coin lies inside the rocks, the hedge, the wreck, Paco or the ogre", buried.early + buried.friend + buried.dock === 0, JSON.stringify(buried));
  const wreckWall = await page.evaluate(async () => {
    const { SPOTS } = await import("/src/world/layout.ts");
    const { colliders } = window.game.island.island;
    const s = window.game.story;
    s.apply(9);
    const before = colliders.hits(SPOTS.wreck[0], SPOTS.wreck[1], 0);
    s.apply(10);
    return { before, after: colliders.hits(SPOTS.wreck[0], SPOTS.wreck[1], 0) };
  });
  check("the wreck's colliders leave with it", wreckWall.before && !wreckWall.after, JSON.stringify(wreckWall));

  // ── Continue from a save ──────────────────────────────────
  const SAVES = { 2: { at: [-66, 47], items: [] }, 6: { at: [-60, -16], items: ["sword"] }, 8: { at: [65, 39.5], items: ["sword", "berry", "key"] }, 10: { at: [55.5, -11], items: ["sword", "berry", "key", "hammer"] }, 12: { at: DOCK_END, items: ["sword", "berry", "key", "hammer"] } };
  for (const [m, { at, items }] of Object.entries(SAVES)) {
    await page.evaluate(({ m, at, items }) => {
      localStorage.setItem("schatzkarten_save", JSON.stringify({ version: 4, milestone: Number(m), items, playerX: at[0], playerY: at[1], timestamp: Date.now() }));
    }, { m, at, items });
    await page.goto(BASE);
    await page.waitForFunction(() => window.game?.title, null, { timeout: 30000 });
    await wait(300);
    await page.keyboard.press("Space");
    await page.waitForFunction(() => !window.game.busy && !window.game.title, null, { timeout: 15000 });
    await wait(500);
    const got = await story();
    const goal = await page.evaluate(() => window.game.objectives()[0] ?? null);
    const pos = await player();
    // Reason: quest 12 has no gate of its own yet, the volcano gate is where it starts
    const reachable = await reach(page, pos, goal?.at ?? VOLCANO_GATE, { radius: (goal?.radius ?? 3.5) - 0.1 });
    check(`Continue at quest ${m} matches the island and the goal is reachable`, sameFields(got, EXPECTED[m]) && reachable, JSON.stringify({ got, goal: goal?.at, reachable }));
  }
  await page.evaluate(() => localStorage.removeItem("schatzkarten_save"));

  // ── Rumbles ───────────────────────────────────────────────
  await open("?quest=3");
  const rumble = (n) =>
    page.evaluate((n) => {
      const g = window.game;
      const volcano = g.island.island.ambient.volcano;
      g.island.rig.shake = 0;
      g.story.rumble(n);
      return { shake: g.island.rig.shake, smoke: volcano.burstLevel, plume: volcano.plume.visible, strength: g.story.e2e.lastRumble };
    }, n);
  const [r3, r8, r11] = [await rumble(3), await rumble(8), await rumble(11)];
  const grows = (k) => r3[k] < r8[k] && r8[k] < r11[k];
  check("rumble grows", grows("shake") && grows("smoke") && grows("strength") && r3.plume, JSON.stringify({ r3, r8, r11 }));
  check("rumble strength is finished / 12", Math.abs(r3.strength - 0.25) < 1e-6 && Math.abs(r11.strength - 11 / 12) < 1e-6, String(r3.strength));

  await place(65, 39.5);
  await wait(400);
  const promptBefore = await promptText();
  await page.evaluate(() => window.game.story.rumble(6));
  await wait(400);
  check("a rumble leaves the prompt alone", promptBefore?.includes("Sprechen") && (await promptText()) === promptBefore, String(promptBefore));
  await page.keyboard.press("Space");
  await wait(700);
  const talkBefore = await page.evaluate(() => ({ open: window.game.ui.dialogue.isOpen }));
  await page.evaluate(() => window.game.story.rumble(11));
  await wait(400);
  const talkAfter = await page.evaluate(() => ({ open: window.game.ui.dialogue.isOpen, busy: window.game.busy }));
  check("a rumble does not interrupt a conversation", talkBefore.open && talkAfter.open && talkAfter.busy, JSON.stringify({ talkBefore, talkAfter }));

  // ── How it looks and runs ─────────────────────────────────
  const camShot = async (query, name) => {
    await page.goto(`${BASE}?cam=${query}`);
    await page.waitForFunction(() => window.game?.island, null, { timeout: 30000 });
    await wait(5000);
    await shot(name);
    check(`${name.slice(3)} view renders (not black)`, (await brightness()) > 40);
  };
  /** Two frames of a prop's exit, from the view the page is on. */
  const exitShots = async (barrier, name) => {
    await page.evaluate((b) => {
      window.gone = window.game.story[b].remove();
    }, barrier);
    await wait(600);
    await shot(`${name}_early`);
    await wait(700);
    await shot(`${name}_late`);
    await page.evaluate(() => window.gone);
  };
  await camShot("-64,5.5,52,-71,1,43", "53_wreck");
  await camShot("56,6,4,55.5,2.5,-8", "54_boulder");
  await exitShots("boulder", "52_boulder_leaving");
  await camShot("-12,11,37,-12,4,27", "55_hedge_forest_side");
  await exitShots("hedge", "52_hedge_leaving");
  await camShot("-9,7,14,-12,5,27", "56_hedge_lake_side");

  await open("?quest=1");
  await place(-66, 47);
  await wait(2500);
  await shot("57_wreck_from_spawn");
  const fpsWreck = await drawRate(4000);
  await open("?quest=8");
  await place(54, 0);
  await wait(2500);
  await shot("58_boulder_from_bridge");
  const fpsBoulder = await drawRate(4000);
  await open("?quest=6");
  await place(-6, 21);
  await wait(2500);
  await shot("59_hedge_from_path");
  const fpsHedge = await drawRate(4000);
  await open("?quest=10");
  await place(-22, -44);
  await wait(2000);
  await shot("60_dock_ogre");
  await place(-33, -69.5);
  await wait(2500);
  await shot("61_dock_boat");
  let baseline = 57.7;
  try {
    baseline = Number(readFileSync(new URL("../e2e/out/baseline.txt", import.meta.url), "utf8").match(/drawRate ([\d.]+)/)[1]);
  } catch {
    // Reason: the baseline file is a local proof, not in git; a fresh clone falls back to the number it held
  }
  const fps = Math.min(fpsWreck, fpsBoulder, fpsHedge);
  check("runs at the baseline fps", fps >= baseline - 3, `${fps.toFixed(1)} (wreck ${fpsWreck.toFixed(1)}, boulder ${fpsBoulder.toFixed(1)}, hedge ${fpsHedge.toFixed(1)}), baseline ${baseline}`);
}
