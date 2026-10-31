/**
 * Playing the volcano course in an E2E test: the autopilot that runs in the page, the arrow keys it holds, and how to
 * read what Tadeo is doing at a broken crossing. Used by volcano.mjs and finale.mjs.
 */

/**
 * Runs in the page: reads the challenge state and returns which arrow keys to hold.
 * mode "avoid" walks along the trail and dodges warning circles; "seek" walks into
 * the next reachable circle (to test the hit + respawn path).
 */
export function pilot(mode) {
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
  // Same mapping as the hero controller: arrow axis → world direction for the camera yaw
  const world = (ax, ay) => {
    const l = Math.hypot(ax, ay) || 1;
    return [(ax * cos - ay * sin) / l, (ax * sin + ay * cos) / l];
  };
  // Where Tadeo would be after t seconds of holding this direction (stops at the first blocked step)
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

  // The next broken crossing still ahead: head for the deck's centre line a few steps before its stub ends
  const broken = c.bridges.filter((b) => b.gap);
  const along = (b) => (h.x - b.center.x) * b.dir.x + (h.z - b.center.y) * b.dir.y;
  const crossing = broken.findIndex((b) => along(b) < b.gap[1]);
  const b = broken[crossing];
  const approach = b && [b.center.x + b.dir.x * (b.gap[0] - 2.4), b.center.y + b.dir.y * (b.gap[0] - 2.4)];
  const headFor = approach && along(b) > -b.halfLen - 9;
  const atCrossing = headFor && Math.hypot(approach[0] - h.x, approach[1] - h.z) < 1.3 ? crossing : -1;

  let best = cands[4];
  let nearest = null;
  for (const bomb of bombs) {
    const d = Math.hypot(bomb.x - h.x, bomb.z - h.z);
    if (!nearest || d < nearest.d) nearest = { d, rem: bomb.rem };
  }
  if (mode === "seek") {
    const reach = bombs.filter((b) => Math.hypot(b.x - h.x, b.z - h.z) / SPEED < b.rem - 0.15).sort((a, b) => a.rem - b.rem)[0];
    if (reach && Math.hypot(reach.x - h.x, reach.z - h.z) > 0.45) {
      const dx = reach.x - h.x;
      const dz = reach.z - h.z;
      let top = -Infinity;
      for (const k of cands) {
        const sc2 = k.v[0] * dx + k.v[1] * dz;
        if (sc2 > top) [top, best] = [sc2, k];
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
      const near = walk(k.v, 0.6);
      if (near.blocked && (k.ax || k.ay)) score -= 2;
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
    onBridge: !!c.bridgeAt(h.x, h.z),
    atCrossing,
    bombsNearRocks: sc.bombs.flying.filter((f) => c.rocks.some((r) => Math.hypot(f.to.x - r.x, f.to.z - r.z) < 3)).length,
    nearest,
    dialogue: !!document.querySelector(".dialogue.open"),
    status: document.body.innerText.match(/noch \d+ m/)?.[0] ?? null,
  };
}

/** The real-key side of the pilot, for one page. */
export function courseHands(page) {
  const sleep = (ms) => page.waitForTimeout(ms);

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

  /** What matters about Tadeo at a crossing, read from the page. */
  const heroState = () =>
    page.evaluate(() => {
      const sc = window.engine.scene;
      const c = sc.course;
      const h = sc.hero.position;
      return {
        state: sc.state,
        x: h.x,
        y: h.y,
        z: h.z,
        grounded: sc.hero.grounded,
        onRock: !!c.rockAt(h.x, h.z),
        lava: c.lavaAt(h.x, h.z),
        checkpoint: sc.checkpoint,
        pop: [...document.querySelectorAll(".chx-pop")].map((e) => e.textContent).join(" "),
      };
    });

  /** Holds the keys already down until Tadeo stands still; false when something knocked him out of play. */
  async function untilStopped(timeout = 6000) {
    const end = Date.now() + timeout;
    let last = await heroState();
    let still = 0;
    while (Date.now() < end) {
      await sleep(70);
      const now = await heroState();
      if (now.state !== "play") return false;
      const moved = Math.hypot(now.x - last.x, now.z - last.z);
      still = moved < 0.03 && now.grounded ? still + 1 : 0;
      if (still >= 4) return true;
      last = now;
    }
    return false;
  }

  /** Waits for the jump in progress to end. */
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
  async function crossPlainly() {
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

  return { holdKeys, heroState, untilStopped, untilLanded, crossPlainly };
}
