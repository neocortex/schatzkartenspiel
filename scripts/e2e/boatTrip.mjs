/**
 * The chain up to quest 12, played with real key presses: the sea from `?challenge=sea` and the treasure island it
 * runs on into, up to the eruption. Used by finale.mjs; sea.mjs and treasure.mjs have their own instrumented runs.
 */

export function boatTrip({ page, check, shot, log, waitFor, dialogueOpen, holdKeys }) {
  const sleep = (ms) => page.waitForTimeout(ms);

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
          turns: s.turns,
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

  /**
   * Plays the treasure island with real key presses, until the eruption's line has been read.
   *
   * @returns whether the map card showed up: the caller checks it, because a card that never comes runs no card check.
   */
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
          return cardDone;
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

  return { playSea, playTreasure };
}
