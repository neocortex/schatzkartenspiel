# Story Rethink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the island adventure into one coherent twelve-quest story (the stolen Feuerherz), with every quest and object explained in words a 7-year-old can follow.

**Architecture:** Quest data, hints and gates are renumbered to twelve. A new `game/StoryWorld.ts` makes the island match the current milestone (wreck, boats, boulder, hedge, Paco, ogre, rumbles) and runs the short island scenes before and after quests, so `Game.ts` stays under its size limit. The volcano challenge gets two modes (rescue, finale), the cave and the shark fight are rebuilt in place, and a new `festival` challenge reuses the village stage and the treasure fireworks.

**Tech Stack:** Three.js, TypeScript, Vite, Playwright E2E (`scripts/e2e/*.mjs`), ElevenLabs voice rendering (`npm run voices`).

**Spec:** `docs/superpowers/specs/2026-10-30-story-rethink-design.md` (German draft lines, background story and language rules live there)

## Global Constraints

- All work happens on branch `story-rethink` in the worktree `.claude/worktrees/story-rethink`, branched from `bbd0158`. Approving this plan covers commits on that branch. **Never push and never merge to `main`:** pushing publishes to tadeo.fun, and nothing reaches `main` until the owner has played it.
- Commit messages use `type(scope): subject`, with no AI co-author and no session trailer. Never `--no-verify`.
- Every new or changed spoken line: at most 14 words, one or two short sentences, one new fact. A conversation has at most 5 lines; only quest 3, the lake and the festival may run longer, and those stay under 12.
- Words not to say out loud: "die Alten", "Altar", "ewiges Eis", "besänftigen". Say "das alte Volk", "der alte Stein", "Zaubereis", "wieder lieb machen".
- "Schatzinsel" means only the small island. The big island is "die Insel".
- `AGENTS.md`: arrows + Space only; `input.consume(code)`; every speaker has a face and a voice; never a game over; clamp `pow()` bases; additive glows `fog: false`; island-wide instanced meshes `frustumCulled = false`; `Game.ts` under ~550 lines; files under ~500 lines.
- `classic-2d/` stays frozen. No new npm dependencies.
- `npx tsc --noEmit -p .` clean after every task. Dev server for E2E: `npx vite --port 5199`, started from the worktree.
- New lines play with browser speech until Task 14 renders them, so the `[voice] no recording` log is expected before then. `voices.mjs` is only required to pass from Task 14 on.

## Review Focus

1. **Continue from a save at any milestone:** the island matches the story (wreck, boats, boulder, hedge, Paco, ogre) and the objective is reachable. Pinned in Task 4.
2. **A child running along the boulder or the ogre's bridge to get past them:** there is no way through and no pocket to get stuck in. Pinned in Task 4.
3. **Missing a jump again and again, or walking off a bank or a rock:** always back at the last checkpoint with a kind "Autsch!", never stuck, and no rock lands on a hop stone. Pinned in Task 6.
4. **Mashing Space from a conversation into a riddle or crystal choice:** it never answers correctly by accident and never skips the choice. Pinned in Task 7 and Task 8.
5. **Reloading during the chain sea → treasure → finale, and starting with an old version 3 save:** Continue lands at the right spot with the right objective; an old save starts over with coins and hats kept. Pinned in Task 1 and Task 13.

---

### Task 1: Worktree, baseline and twelve quests

**Files:**
- Modify: `src/data/quests.ts`, `src/data/items.ts`, `src/game/chuletaLines.ts`, `src/game/Game.ts`, `src/game/Sightings.ts`, `src/systems/SaveManager.ts`
- Test: `scripts/e2e/island.mjs`

**Interfaces:**
- Produces: `QUESTS` with 12 entries, milestone numbers as listed below. `QuestDef` keeps `id`, `name`, `hint`, `reward`; `description`, `scene` and `trigger*` go because nothing reads them.
- Produces: `GATES` keyed by the new numbers, still in `Game.ts`. Milestone 12 joins in Task 13.

| # | `name` | `reward` | Gate |
|---|---|---|---|
| 1 | Ankunft | — | none (ends with the intro) |
| 2 | Der Vulkan | — | `volcano` at `LANDMARKS.volcanoGate` |
| 3 | Das Dorf | — | talk at `VILLAGE.elder` (Task 7) |
| 4 | Der See | — | tablets (Task 7) |
| 5 | Die Höhle | sword | `cave` at [-60, -18.5] |
| 6 | Der Zauberwald | berry | `forest` at `LANDMARKS.forestGate` |
| 7 | Das Dorf | key | `village` at `VILLAGE.elder` |
| 8 | Der Oger | — | `ogre` at [53.5, 0.5], `back` [53.5, 0.5] |
| 9 | Der Berg | hammer | `mountain` at [55.5, -13.5] |
| 10 | Der Hai | — | `sea` at `LANDMARKS.northDockEnd` |
| 11 | Die Schatzinsel | — | `treasure` at `LANDMARKS.northDockEnd` |
| 12 | Das Herz des Vulkans | — | `finale` at `LANDMARKS.volcanoGate` (Task 13) |

- [ ] **Step 1: Create the worktree and move the design docs over**

Run from the main checkout:
```bash
git worktree add -b story-rethink .claude/worktrees/story-rethink bbd0158
cp docs/superpowers/specs/2026-10-30-story-rethink-design.md docs/superpowers/specs/2026-10-26-island-expansion-design.md .claude/worktrees/story-rethink/docs/superpowers/specs/
cp docs/superpowers/plans/2026-10-30-story-rethink.md .claude/worktrees/story-rethink/docs/superpowers/plans/
cd .claude/worktrees/story-rethink && npm ci && cp ../../../.env .env
git add docs && git commit -m "docs(story): add story rethink design and plan"
```
Leave the main checkout's copies alone until the merge. Git refuses to overwrite them, so they are deleted right before the owner's merge, after checking they match the branch.

- [ ] **Step 2: Record the baseline**

Run `npx vite --port 5199` in the background, then `node scripts/e2e/all.mjs`. Keep the printed result and the fps numbers in `scripts/e2e/out/baseline.txt` (git-ignored). The two newest commits on `bbd0158` never had an E2E run, so any failure here is noted as already there. Also save the current spoken lines for the check in Task 14:
```bash
node -e 'import("./scripts/voice/lines.mjs").then(m=>require("fs").writeFileSync("scripts/e2e/out/baseline-lines.json",JSON.stringify(m.collectLines().lines)))'
```

- [ ] **Step 3: Update `island.mjs` to fail on the old numbering**

Replace the sign checks. New checks:
```js
check("twelve quests", await page.evaluate(async () => (await import("/src/data/quests.ts")).QUESTS.length) === 12);
check("save version is 4", saved?.version === 4, JSON.stringify(saved));
// Old saves (Review Focus 5): seed localStorage with { version: 3, milestone: 6, items: ["sword"], ... } and reload
check("an old save offers no Continue", (await page.evaluate(() => window.game.title.choices)).join() === "new");
check("coins and hats survive an old save", coinsAfter === coinsSeeded && hatsAfter.length === hatsSeeded.length);
```
The storage keys for coins and hats are in `game/Coins.ts` and `game/Wardrobe.ts`.

- [ ] **Step 4: Run it to see it fail**

Run: `node scripts/e2e/island.mjs`. Expected: FAIL on "twelve quests" and "save version is 4".

- [ ] **Step 5: Renumber**

- `quests.ts`: the table above. `hint` says the same as the Chuleta hint below. Update the file comment ("all 12 stages").
- `items.ts` descriptions follow the rhyme: sword for the thorns, berries for the monsters, hammer for the ice, key for the chest.
- `SaveManager.ts`: `SAVE_VERSION = 4`.
- `Sightings.ts`: `OGRE_QUEST = 8`, `SEA_QUEST = 10`.
- `Game.ts`: remove `SIGN`, `SIGN_TEXT`, `readSign` and the milestone-1 objective. Until Task 5, the intro ends with `await this.advance()`. Until Task 7, milestone 3 is a plain talk with the elder (`village_enter`) followed by `advance()`, and milestone 4 uses the existing `readTablet`. Milestone 7 keeps `villageElder()`. In `playChallenge`, milestone 10 chains into 11 and milestone 11 calls `ending()` until Task 13.
- `remarkAtFutureGates`: skip gates 11 and 12 as well as gates at the current objective's own spot (quests 3 and 7 share `VILLAGE.elder`, and quests 2 and 12 share the volcano gate). Tablets count as "later" while `m < 4`.
- Banners: cave "Kapitel 5", forest "Kapitel 6", treasure "Kapitel 11" instead of "Letzte Aufgabe".

`CHULETA_HINTS` (exact copy):
```ts
2: "Jemand ruft um Hilfe! Schnell zum Vulkan im Westen!",
3: "Paco wartet im Dorf! Geh über die Trittsteine am Fluss.",
4: "Nur der Geist weiß den Weg! Lös die Rätsel am See.",
5: "Das Schwert liegt in der Höhle im Nordwesten. Gack!",
6: "Die Zauberbeeren wachsen im Zauberwald! Er liegt südlich vom See.",
7: "Der Schlüssel ist im Dorf. Sprich mit dem Dorfältesten!",
8: "Nur der Oger hebt den Felsen! Er sitzt auf der Brücke.",
9: "Der Hammer liegt ganz oben auf dem Berg. Gack!",
10: "Dein Boot ist fertig! Es wartet am Steg im Norden.",
11: "Das X wartet! Zurück zum Boot am Steg im Norden.",
12: "Schnell! Das Herz muss zurück auf den alten Stein am Vulkan!",
```
`CHULETA_CHEERS` (keyed by the quest just finished):
```ts
2: "Puh, war das heiß! Fast hätte ich ein gekochtes Ei gelegt!",
3: "Ein Geist? Gack! Mir stehen jetzt schon die Federn zu Berge!",
4: "Gack! Wie meint er das?",
5: "Ein echtes Zauberschwert! Du bist ein richtiger Held!",
6: "Mmmh, Zauberbeeren! Darf ich eine picken? Nein? Schade!",
7: "Der goldene Schlüssel! Jetzt fehlt nur noch der Hammer!",
8: "Der Oger ist eigentlich ganz nett, oder?",
9: "Was für eine Aussicht! Ich kann die kleine Insel sehen!",
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit -p . && node scripts/e2e/island.mjs`. Expected: clean, PASS.

- [ ] **Step 7: Commit** with `feat(story): renumber the adventure to twelve quests`.

---

### Task 2: The new cast

**Files:**
- Create: `src/characters/Mole.ts`, `src/characters/Hueter.ts`
- Modify: `src/characters/cast.ts`, `src/ui/Dialogue.ts`, `src/ui/Snapshots.ts`, `src/game/Npcs.ts`, `src/game/sideGames.ts`, `scripts/voice/generate.mjs`
- Test: `scripts/e2e/island.mjs`

**Interfaces:**
- Produces: `createVillager(3)` returns Käpt'n Paco (old sailor, white beard, captain's hat).
- Produces: `createPaco(): Humanoid` in `cast.ts`, which `createVillager(3)` calls.
- Produces: `createMole(): Mole` with `root: THREE.Group`, `update(dt: number): void`, `dig(): Promise<void>`, `hungry: boolean`.
- Produces: `createHueter(): Hueter` with `root: THREE.Group`, `update(dt: number, time: number): void`, `rise(): Promise<void>`, `fade(): Promise<void>`. See-through, with the stone head's face (`stoneHead` in `regionSites.ts`). Additive parts use `fog: false`.
- Produces: `SPEAKERS` entries `"Käpt'n Paco"` (portrait `villager3`), `Stimme` (emoji 🗣️, Paco's colour), `Maulwurf` (portrait `maulwurf`), `Hüter` (portrait `hueter`). `Opa Kalle`, `Geist` and `Schild` go.
- Produces: `CAST` entries with the same names. `Hüter` takes Geist's voice id, `Stimme` shares Paco's entry, and `Schild` and `Geist` go.

- [ ] **Step 1: Update the E2E to fail**

In `island.mjs`, the chat check expects `chatName === "Käpt'n Paco"` (placed at quest 3 or later for now). Add:
```js
const portraits = await page.evaluate(async () => Object.keys((await import("/src/ui/Snapshots.ts")).renderSnapshots().portraits));
check("every new speaker has a portrait", ["maulwurf", "hueter", "villager3"].every((k) => portraits.includes(k)));
```

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/e2e/island.mjs`. Expected: FAIL on the chat name and portraits.

- [ ] **Step 3: Implement the cast**

Models, portraits, `SPEAKERS`, `CAST` as above. In `Npcs.ts`, rename the speaker and keep the line "Als ich jung war, habe ich auch nach dem Schatz gesucht..." as a clue. Add `Fischer Jonas`: "Mit meinem kleinen Boot bleibe ich am Ufer. Wegen dem Hai." Read the other villagers' chat lines and change anything that contradicts the story or calls the big island Schatzinsel.

In `sideGames.ts`, Mia's invite becomes: "Tadeo, Hilfe! Der Vulkan hat gerumpelt, und meine Hühner sind weggelaufen!"

Pick two ElevenLabs voices as defaults from the account's library: a warm old sailor who speaks German for Paco, and a small squeaky one for the mole. The owner hears them in Task 14, and swapping one only changes the id in `CAST`. Don't render yet.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && node scripts/e2e/island.mjs`. Expected: clean, PASS. Save portrait screenshots to `scripts/e2e/out/island/`.

- [ ] **Step 5: Commit** with `feat(characters): add Paco, the mole and the Hüter`.

---

### Task 3: No lettered signs in the wild, natural cave mouth

**Files:**
- Modify: `src/world/models/coastSites.ts:113,142`, `src/world/models/eastSites.ts:81,194`, `src/world/models/regionSites.ts:171`, `src/world/models/monuments.ts:195,311` (and `caveEntrance`), `src/world/models/westSites.ts:49,121`, `src/challenges/volcano/set.ts:62,140`, `src/challenges/ogre/gorgeDressing.ts:183-184`, `src/challenges/sea/scenery.ts:124`
- Test: `scripts/e2e/world.mjs`

**Interfaces:**
- Consumes/Produces: nothing new. Sign helpers remain in their file for the village's "Willkommen" and "Markt", Mia's coop and boat names.

- [ ] **Step 1: Add the failing source check to `world.mjs`**

```js
// Node side: scan the files named above
const banned = /boardSign\(|signpost\(|warningTriangle\(|"(Höhle|Zauberwald|Achtung Lava!|Achtung, Lava!|Brücke|ZIEL|Zur Schatzinsel|Froschkönig|Oger-Brücke|Zoll: 1 Kuchen!)"/;
check("no lettered signs outside the village", offenders.length === 0, offenders.join(", "));
```
`offenders` lists each of those files whose text matches `banned`, excluding helper definitions. Also add a screenshot of the cave mouth from the ground.

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/e2e/world.mjs`. Expected: FAIL listing all eight files.

- [ ] **Step 3: Remove the signs and rebuild the cave mouth**

Delete each call and any helper this makes unused. `caveEntrance` loses mine timbers, rails and the sign and becomes a natural opening: rock arch, boulders, dark hollow, the two torches go. `forestArch` keeps its shape without the lettering. In `volcano/set.ts`, only the "ZIEL" lettering and board signs go here; the arch itself goes in Task 6.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && node scripts/e2e/world.mjs`. Expected: clean, PASS. Look at the screenshot of the cave mouth: no straight timber, no text.

- [ ] **Step 5: Commit** with `feat(world): remove lettered signs from the wild`.

---

### Task 4: StoryWorld — the island follows the story

**Files:**
- Create: `src/game/StoryWorld.ts`, `src/world/models/storyProps.ts`
- Modify: `src/game/Game.ts`, `src/game/Npcs.ts`, `src/game/Sightings.ts`, `src/world/Landmarks.ts`, `src/world/models/coastSites.ts`, `src/world/models/boats.ts`, `src/world/ambient/Volcano.ts`
- Test: `scripts/e2e/world.mjs`

**Interfaces:**
- Produces in `StoryWorld.ts`:
```ts
export interface StoryWorldState {
  wreck: boolean; pierBoat: boolean; dockBoat: boolean; boulder: boolean; hedge: boolean;
  paco: "away" | "village" | "dock"; ogre: "bridge" | "friend" | "dock"; lastRumble: number;
}
export class StoryWorld {
  /** Makes the island match milestone m. Safe to call repeatedly. */
  apply(m: number): void;
  /** Shake, smoke and sound after a finished quest; strength = finished / 12, in 0..1. */
  rumble(finished: number): void;
  /** Short island scene before and after a quest's challenge. */
  beforeQuest(m: number): Promise<void>;
  afterQuest(m: number): Promise<void>;
  update(dt: number, time: number): void;
  get e2e(): StoryWorldState;
}
```
- Produces in `storyProps.ts`: `wreckedBoat(atlas): Model`, `thornHedge(): StoryProp`, `mountainBoulder(): StoryProp`, where `StoryProp` has `group: THREE.Group` and `remove(): Promise<void>`.
- Produces in `Npcs.ts`: `setSpot(id: NpcId, at: P2 | null): void`. `null` hides the NPC and removes its collider.
- Produces in `Landmarks.ts`: `setBoatVisible(name: string, visible: boolean): void`.
- Produces in `Sightings.ts`: the ogre's third spot (north dock) at `m >= SEA_QUEST`.
- Produces in `ambient/Volcano.ts`: `burst(strength: number): void`, uses the existing smoke particles.
- Produces in `Game.ts`: `story: StoryWorld`; `apply` runs in `setupMilestone`, after a Continue, on a new game and in `advance`; `rumble` runs in `advance`.

Required state (`?quest=N`):

| m | 1–2 | 3–5 | 6 | 7–8 | 9 | 10–12 |
|---|---|---|---|---|---|---|
| `wreck` | yes | yes | yes | yes | yes | no |
| `pierBoat` | no | no | no | no | no | no |
| `dockBoat` | no | no | no | no | no | yes |
| `boulder` | yes | yes | yes | yes | no | no |
| `hedge` | yes | yes | yes | no | no | no |
| `paco` | away | village | village | village | village | dock |
| `ogre` | bridge | bridge | bridge | bridge | friend | dock |

- [ ] **Step 1: Write the failing checks in `world.mjs`**

```js
for (const [m, want] of Object.entries(EXPECTED)) { // the table above
  await page.goto(`${base}?quest=${m}`);
  const got = await page.evaluate(() => window.game.story.e2e);
  check(`island state at quest ${m}`, sameFields(got, want), JSON.stringify(got));
}
// In-page flood fill over Player's own walk rule (hf.isWalkable, colliders.hits, landmarks.surfaceHeight)
check("boulder blocks the trail, from the village", !reach([64, 44], [55.5, -13.5]) /* at quest 8 */);
check("boulder blocks the trail, from the west", !reach([-12, 26], [55.5, -13.5]) /* at quest 8 */);
check("trail open once the boulder is gone", reach([64, 44], [55.5, -13.5]) /* at quest 9 */);
check("no pocket: every walkable cell near the boulder reaches the village", pocketFree /* at quest 8 */);
// noFord treats cells within 8 units of SPOTS.ford as walls, so only the bridge can connect the two sides
check("ogre's bridge closed before quest 9", !reach([-12, 26], [64, 44], { noFord: true }) /* at quest 8 */);
check("ford open at quest 3", reach([-56, 14], [65, 37]) /* at quest 3 */);
// Review Focus 1: seed a v4 save, reload, press Continue
for (const m of [2, 6, 8, 10, 12]) check(`Continue at quest ${m} matches the island and the goal is reachable`, sameFields(...) && reach(player, goal));
check("rumble grows", rumble(3) < rumble(8) && rumble(8) < rumble(11));
check("runs at the baseline fps", fps >= baselineFps - 3, `${fps}`);
```
The baseline fps comes from `scripts/e2e/out/baseline.txt`. Goals at quests 10–12 count as reachable because the bridge is open after quest 8.

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/e2e/world.mjs`. Expected: FAIL at `window.game.story`.

- [ ] **Step 3: Implement**

- `coastSites.ts`: the pier at the landing beach no longer gets a boat. The wreck goes on the sand by the pier (use `wreckedBoat`, in the colours of `NORTH_DOCK_BOAT` from `sea/boat.ts`). The larger `shipwreck(3)` that already stands off the coast and in the sea and treasure scenes stays: it now reads as Paco's old ship.
- The north dock boat gets visible patches on its hull: a `patched: boolean` option on `BoatColors`, which `sea/boat.ts` uses too in Task 11.
- Boulder: on the trail at about [55.5, -7], plus smaller rocks and colliders so that the flood-fill checks pass. Every collider must have a rock you can see on it. Tune with the checks, don't guess.
- Hedge: a tall thorn hedge across the `forestArch` at `LANDMARKS.forestGate`, with colliders.
- `beforeQuest` and `afterQuest` are empty switch statements here. Tasks 9, 10 and 11 fill them. `Game.playChallenge` runs them in this order: `beforeQuest(m)` → `enterChallenge` → reward → `backToIsland` → `popItem` → `afterQuest(m)` → `advance`. A `?challenge=` debug start skips `beforeQuest` because the island isn't on screen yet. Move the wreck, ogre and Paco when `apply(10)` runs.
- `rumble`: `rig.addShake(0.2 + 0.5 * strength)`, `Volcano.burst(strength)`, and the existing low rumble sound if there is one (otherwise pick the deepest existing sfx). Not a full eruption.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && node scripts/e2e/world.mjs && node scripts/e2e/island.mjs`. Expected: clean, PASS. Look at the screenshots of the wreck, the boulder and the hedge.

- [ ] **Step 5: Commit** with `feat(story): make the island follow the quest state`.

---

### Task 5: Quest 1 — the opening

**Files:**
- Create: `src/game/opening.ts`, `src/ui/MapCard.ts`
- Modify: `src/game/Game.ts` (`intro`), `src/game/chuletaLines.ts`, `src/data/dialogues.ts`, `src/ui/ui.css`
- Test: `scripts/e2e/island.mjs`

**Interfaces:**
- Produces: `showMapCard(layer: HTMLElement, input: Input): Promise<void>`. A parchment with a small island and a big X, drawn as inline SVG, with no text (`.map-card`). Space closes it after 0.4 s.
- Produces: `playOpening(deps: OpeningDeps): Promise<void>`, with `OpeningDeps` holding `{ engine, ui, island, talk, startCinematic, endCinematic, placePlayer, chuleta }`.
- Produces: dialogue keys `intro_bottle`, `intro_arrival`. `CHULETA_INTRO` becomes a shorter backpack gag.

- [ ] **Step 1: Update `island.mjs` to fail**

```js
check("map card shows and has no text", await page.isVisible(".map-card") && (await page.textContent(".map-card")).trim() === "");
check("intro has narrator, Tadeo, Chuleta and Stimme", ["Erzähler", "Tadeo", "Chuleta", "Stimme"].every((s) => speakers.has(s)));
check("no sign quest", !speakers.has("Schild"));
check("quest 1 completes by itself", s.milestone === 2 && s.free, JSON.stringify(s));
check("banner says 2 von 12", (await bannerText()).includes("2 von 12"));
check("no boat at the landing pier, wreck on the sand", e2e.wreck && !e2e.pierBoat);
```

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/e2e/island.mjs`. Expected: FAIL on the map card.

- [ ] **Step 3: Implement the opening**

Order: fade from black → `intro_bottle` narration over a quiet beach sky shot (2 narrator lines) → map card → Tadeo's line → short sea cinematic on the island scene (a temporary group west of the landing beach: his boat using `NORTH_DOCK_BOAT`, `createShark()` fin, a hard hit with `rig.addShake`, fade to black, dispose the group) → the existing flight down onto the landing beach → `CHULETA_INTRO` → `intro_arrival` ("Gack! Der Hai hat unser Boot kaputt gemacht!", Stimme "Hilfe! Hilfe!", Tadeo "Das kommt vom Vulkan! Schnell!") → HUD on → `advance()`.

Keep the lines from the spec's quest 1. The cinematic stays under 12 seconds and Space advances only the dialogue.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && node scripts/e2e/island.mjs`. Expected: clean, PASS. Look at the screenshots of the card and the hit.

- [ ] **Step 5: Commit** with `feat(story): open with the bottle, the map and the shark`.

---

### Task 6: Quest 2 — the volcano with rock hops, the altar and Paco

**Files:**
- Create: `src/challenges/volcano/modes.ts`, `src/challenges/volcano/altar.ts`, `src/challenges/volcano/rescue.ts`
- Modify: `src/challenges/volcano/course.ts`, `hero.ts`, `director.ts`, `set.ts`, `VolcanoChallenge.ts`, `index.ts`, `src/world/models/items.ts`, `src/data/dialogues.ts`
- Test: `scripts/e2e/volcano.mjs`

**Interfaces:**
- Produces in `modes.ts`:
```ts
export interface VolcanoMode {
  bombInterval: [start: number, end: number];
  sky: SkyPalette;
  carriesHeart: boolean;
  /** Runs at the altar once Tadeo reaches the goal. */
  ending(c: VolcanoChallenge): Promise<void>;
}
export const RESCUE: VolcanoMode; // bombInterval [2.3, 1.2], today's sky, carriesHeart false
```
- Produces in `VolcanoChallenge.ts`: `constructor(ctx: ChallengeContext, mode: VolcanoMode)`; `state` keeps its values; `e2e` getter `{ paco: "stuck" | "free" | "none"; lifts: number; liftsNeeded: number; rocks: HopRock[]; lastCheckpoint: number; bombsNearRocks: number }`.
- Produces in `course.ts`:
```ts
export interface HopRock { x: number; z: number; r: number; y: number }
readonly rocks: HopRock[];
rockAt(x: number, z: number): HopRock | null;
/** True inside the corridor of a broken crossing, where an airborne Tadeo may fly over lava. */
canLeap(x: number, z: number): boolean;
/** True on lava inside a broken crossing, off the rocks and bridge stubs. */
lavaAt(x: number, z: number): boolean;
```
- Produces in `hero.ts`: `HeroWorld.canLeap(x, z)`, checked only while `!grounded`.
- Produces in `director.ts`: `BombDirector` takes the interval pair; `intervalAt(p: number): number` replaces the hard-coded `lerp(1.15, 0.6, p)`. No bomb targets a spot within 3 units of a `HopRock`.
- Produces in `altar.ts`: `Altar` with `group`, `hollowAt: THREE.Vector3`, `setHeart(on: boolean): void`. Ancient stone with a heart-shaped hollow, no text.
- Produces in `items.ts`: `createFeuerherz(): THREE.Group`, a glowing heart model. It is not an `ItemKey`.

- [ ] **Step 1: Update `volcano.mjs` to fail**

Teach the autopilot to press Space at a crossing's bank. New checks:
```js
check("half the rocks", director.intervalAt(0) === 2.3 && director.intervalAt(1) === 1.2);
check("one whole bridge, two crossings of rocks", wholeBridges === 1 && crossings === 2);
check("rocks are generous", rocks.every((r) => r.r >= 1.1) && maxGap <= 2.2);
// Review Focus 3
check("walking off a bank or rock doesn't drop you in lava", stateAfterWalk === "play" && !lavaUnderTadeo);
check("a missed jump says Autsch and returns to the checkpoint", sawOuch && atLastCheckpoint);
check("missing twice in a row still returns", secondMissReturned);
check("no bomb lands near a hop rock", e2e.bombsNearRocks === 0);
check("no ZIEL arch", !/goalArch|"ZIEL"/.test(volcanoSources));
check("Tadeo frees Paco with Space", e2e.paco === "free" && e2e.lifts === e2e.liftsNeeded);
check("the challenge ends only after that", state === "won");
```

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/e2e/volcano.mjs`. Expected: FAIL on `intervalAt`.

- [ ] **Step 3: Implement**

- `BROKEN_RIVERS = [1, 2]`: the first river keeps its bridge to teach the course, the next two become hops. Each gets short broken bridge stubs on both banks (`bridgeModel` variant) and 1–2 rocks. `ground` and `canStand` include the rocks. **Physics:** jump air time 0.65 s × walk speed 6.2 = 4.0 units reach, so rock radius ≥ 1.1 and edge-to-edge gap ≤ 2.2.
- `hero.ts`: while grounded, `canStand` still stops him at the bank and on a rock's edge, so only a jump leaves the ground. While airborne, `canStand || canLeap`.
- `VolcanoChallenge.update`: `if (state === "play" && hero.grounded && course.lavaAt(x, z)) this.hit(hero.position)`. Respawn works as it does for a bomb.
- `set.ts`: `goalArch` goes, the `Altar` stands at the goal with a heavy rock and Paco beside it. Keep the golden beacon.
- `rescue.ts` `rescueEnding`: camera on Paco, status bar as in the treasure dig, Space 6 times lifts the rock. Then the conversation in two beats, because the spec's draft has six lines: (1) Paco "Danke, Junge! Ich bin Käpt'n Paco." / Tadeo "Was ist das für ein Stein?" / Paco "Ach, alter Kram." (2) Tadeo "Mein Boot ist kaputt." / Paco "Das flicke ich dir. Komm ins Dorf!" / Paco "Nimm die Trittsteine. Auf der Brücke sitzt ein Oger."
- `index.ts`: `new VolcanoChallenge(ctx, RESCUE)`. The tip lines stay, plus one new one: "Die Brücke ist kaputt! Mit der Leertaste springe ich über die Steine."

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && node scripts/e2e/volcano.mjs && node scripts/e2e/mountain.mjs`. Expected: clean, PASS (mountain shares `volcano/kit`).

- [ ] **Step 5: Commit** with `feat(volcano): add rock hops, the altar and Paco's rescue`.

---

### Task 7: Quests 3 and 4 — the legend and the riddles

**Files:**
- Create: `src/game/lake.ts`, `src/ui/RiddleCard.ts`
- Modify: `src/game/Game.ts`, `src/data/dialogues.ts`, `src/world/Landmarks.ts`, `src/world/models/westSites.ts`, `scripts/voice/lines.mjs`
- Test: `scripts/e2e/island.mjs`

**Interfaces:**
- Consumes: `showMapCard` (Task 5), `createHueter` (Task 2), `StoryWorld.apply`.
- Produces: `askRiddle(layer: HTMLElement, input: Input, answers: string[]): Promise<number>`. Arrows move, Space confirms, and Space is ignored for the first 0.4 s (`.riddle-card`). The highlight starts at index 0, and each answer is spoken when highlighted.
- Produces in `lake.ts`: `RIDDLES: { lines: string[]; answers: string[]; right: number }[]` and `class Lake { solved: Set<number>; solve(i: number): Promise<boolean>; rise(): Promise<void>; get e2e(): { solved: number; lit: boolean[]; ghost: boolean } }`, held as `Game.lake`.
- Produces in `Landmarks.ts`: `lightTablet(i: number): void`.
- Produces: `DIALOGUES` keys `elder_legend`, `elder_after_map`, `lake_wrong`, `lake_hueter`, `lake_rhyme`, `lake_after_rhyme`. The old `lake_tablet*` and `lake_complete` go.
- `OWNERS` entry `"game/lake.ts": { lines: "Steintafel", answers: "Steintafel" }`.

Riddle data (right is never index 0, so mashing Space is always wrong):
```ts
{ lines: ["Ich laufe immer mit dir mit, ich sage nie ein Wort.", "Und kommt die Nacht, dann bin ich fort."], answers: ["Chuleta", "Schatten", "Wind"], right: 1 },
{ lines: ["Mein Haus trag ich auf dem Rücken, ich muss mich nie danach bücken."], answers: ["Krabbe", "Papagei", "Schildkröte"], right: 2 },
{ lines: ["Ich bin ein Berg mit rotem Bauch, ich spucke Feuer, Stein und Rauch."], answers: ["Drache", "Vulkan", "Kamin"], right: 1 },
```
Riddle 1 is split in two lines because the spec's single line has 18 words.

- [ ] **Step 1: Update `island.mjs` to fail**

```js
// Quest 3
check("elder tells the legend at quest 3 and no challenge starts", speakers.has("Dorfältester") && scene === "island");
check("the map card appears", mapCardSeen);
check("Paco says Hm, hm.", lines.includes("Hm, hm."));
// Quest 4
check("mashing Space never solves a riddle", (await lake()).solved === 0 && sawKindLine); // Review Focus 4
check("a wrong answer keeps the tablet dark", !(await lake()).lit[0]);
check("the right answer lights the tablet", (await lake()).lit[0] && (await lake()).solved === 1);
check("any order works", solvedInOrder([2, 0, 1]));
check("the ghost rises after the third", (await lake()).ghost);
check("the rhyme is said and Tadeo repeats it", lines.includes("Das Schwert aus dem Fels zerschneidet den Dorn,") && lines.some((l) => l.startsWith("Also: Das Schwert")));
check("quest 5 (Höhle) is active", s.milestone === 5);
```

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/e2e/island.mjs`. Expected: FAIL on the legend check.

- [ ] **Step 3: Implement**

- `Game.objectives`: milestone 3 → talk at `VILLAGE.elder`: `elder_legend` (5 lines) → Tadeo "Moment! Ich habe eine Karte!" → map card → `elder_after_map` (3 lines) → `advance`. Milestone 4 → one objective per unsolved tablet, verb "Lesen", `lake.solve(i)`.
- `lake.solve`: Steintafel says the lines, the card asks. Wrong: `lake_wrong` ("Hm, das passt noch nicht. Versuch es noch einmal!") and ask again. Right: `lightTablet(i)`.
- After the third, camera on the lake, `Hueter.rise()`, then `lake_hueter` (3 lines), `lake_rhyme` (4 lines), Tadeo's two lines "Also: Das Schwert für die Dornen. Die Beeren für die Monster." / "Der Hammer für das Eis. Der Schlüssel für die Truhe!", `lake_after_rhyme` (2 lines). That is 11 lines. Chuleta's "Gack! Wie meint er das?" is her cheer for quest 4 (Task 1), which keeps the conversation under 12.
- After a reload, solved tablets are not kept (as today), so they must all be asked again without an error. Tablets start dark.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && node scripts/e2e/island.mjs`. Expected: clean, PASS.

- [ ] **Step 5: Commit** with `feat(story): add the elder's legend and the lake riddles`.

---

### Task 8: Quest 5 — a natural cave

**Files:**
- Create: `src/challenges/cave/paintings.ts`
- Delete: `src/challenges/cave/mine.ts`
- Modify: `src/challenges/cave/layout.ts`, `mechanisms.ts`, `chamber.ts`, `world.ts`, `index.ts`, `script.ts`, `scripts/voice/lines.mjs`
- Test: `scripts/e2e/cave.mjs`

**Interfaces:**
- Consumes: `createMole()` (Task 2).
- Produces in `layout.ts`: `ROCKFALL_CELLS` = today's `GATE_CELLS[0..1]`; `CRYSTAL_WALL_CELL` = `GATE_CELLS[2]`; `MUSHROOMS: [number, number][]` = today's lever cells 0–2; `CRYSTALS: { cell: [number, number]; color: "red" | "white" | "green" }[]` = today's lever cells 3–5; `ALTAR_CELL` becomes `SWORD_CELL`. `LeverSpec` and its trails go. Same `MAP`, same rooms.
- Produces in `mechanisms.ts`: `Mushroom` (`picked`, `pick()`, glows), `Rockfall` (`open`, `clear(): Promise<void>`), `CrystalButton` (`lit`, `touch()`, `dim()`), `CrystalWall` (`open`, `opening: Promise<void>`). `Lever`, `Gate`, `SecretWall` and `RuneTrail` go.
- Produces in `index.ts`: phases `"intro" | "rockfall1" | "rockfall2" | "test" | "chamber" | "done"`; `e2e` getter `{ phase, mushrooms: { x, z, picked }[], carried: number, rockfalls: boolean[], mole: { x, z }, crystals: { x, z, color, lit }[], order: string[], orderStep: number, wallOpen: boolean, sword: { x, z }, tiles }`.
- `OWNERS` for `challenges/cave/script.ts` updated to the new constant names. Mole lines use speaker `Maulwurf`.
- Don't remove materials in `cave/materials.ts` that `forest/` imports.

- [ ] **Step 1: Rewrite the puzzle part of `cave.mjs` to fail**

```js
check("no mine, no levers", !fs.existsSync("src/challenges/cave/mine.ts") && !/\b(Lever|RuneTrail|SecretWall|Gate)\b/.test(caveSources));
check("the mole asks for a mushroom first", sawLine("Maulwurf") && !s.rockfalls[0]);
check("one mushroom clears the first rockfall", s.rockfalls[0]);
check("two more clear the second", s.rockfalls[1]);
check("order is volcano, peak, forest", s.order.join() === "red,white,green");
check("mashing Space on a crystal doesn't skip the test", !s.wallOpen); // Review Focus 4
check("a wrong crystal dims them with a kind line", s.orderStep === 0 && s.crystals.every((c) => !c.lit));
check("the right order opens the wall", s.wallOpen);
check("the sword is taken and Tadeo says what it's for", s.phase === "done" && lines.some((l) => l.includes("Dornen")));
```

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/e2e/cave.mjs`. Expected: FAIL on "no mine, no levers".

- [ ] **Step 3: Rebuild**

- `world.ts`: no `buildMine`. Rockfalls at the first two gate cells block the map as gates do today (`w.blocked`). The mole sits beside each rockfall, and it visibly digs before `clear()` finishes. Tadeo keeps his torch.
- First stop: 1 mushroom. Second stop: 2 mushrooms in the side alcoves. Tadeo carries them and hands them over with Space at the mole.
- Third stop: `paintings.ts` draws the volcano, the snowy peak and the forest on canvas textures on the wall of the rune hall, next to the crystal wall. Touching in order lights each. A wrong one dims them all with a kind line.
- `chamber.ts`: stepped altar, pillars and rune circle go. The sword sits in a great crystal under the existing shaft of daylight, and `flare`, `setReveal` and `swordAt` keep working.
- `paintings.ts` also paints the heart, the thorns and the hammer along the corridors, without words.
- Lines as in the spec's quest 5; the hint for each phase is reason + place.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && node scripts/e2e/cave.mjs && node scripts/e2e/forest.mjs`. Expected: clean, PASS. Check the screenshots: no straight beams, no rails, no carved stone except the old test wall.

- [ ] **Step 5: Commit** with `feat(cave): replace the mine with a natural cave and the mole`.

---

### Task 9: Quest 6 — the thorn hedge

**Files:**
- Modify: `src/game/StoryWorld.ts`, `src/challenges/forest/script.ts`, `src/data/dialogues.ts`
- Test: `scripts/e2e/forest.mjs`

**Interfaces:**
- Consumes: `StoryWorld.beforeQuest(6)`, `thornHedge().remove()` (Task 4).
- The spec's Flocke lines keep the existing speaker `Fuchs`.

- [ ] **Step 1: Add failing checks to `forest.mjs`**

```js
// Start on the island at ?quest=6
check("the hedge closes the gate before the sword", (await story()).hedge);
check("pressing Space opens the hedge before the forest starts", !(await story()).hedge && await waitForScene("forest")); // plus a screenshot of the blue light
check("Flocke explains the hedge", lines.some((l) => l.includes("Nur vor seinem Licht")));
check("the berries' job is said", lines.some((l) => l.includes("wieder lieb")));
check("after the forest the hedge stays open", !(await story()).hedge);
```

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/e2e/forest.mjs`. Expected: FAIL on "pressing Space opens the hedge".

- [ ] **Step 3: Implement**

`beforeQuest(6)`: Tadeo holds up the sword, blue glow (`fog: false`), the hedge shrinks into the ground in about 2 s, then the challenge starts. `forest/script.ts` takes the spec's quest 6 lines.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && node scripts/e2e/forest.mjs`. Expected: clean, PASS.

- [ ] **Step 5: Commit** with `feat(forest): open the thorn hedge with the sword`.

---

### Task 10: Quests 7, 8 and 9 — key, ogre, boulder, mountain

**Files:**
- Modify: `src/game/StoryWorld.ts`, `src/game/Game.ts` (`villageElder`), `src/data/dialogues.ts`, `src/challenges/ogre/story.ts`, `src/challenges/mountain/MountainChallenge.ts` (lines only), `src/challenges/village/trials.ts` (lines only)
- Test: `scripts/e2e/village.mjs`, `scripts/e2e/ogre.mjs`, `scripts/e2e/mountain.mjs`

**Interfaces:**
- Consumes: `StoryWorld.afterQuest(7|8)`, `Sightings` ogre, `mountainBoulder().remove()` (Task 4).
- Produces in `Sightings.ts`: `ogreLift(at: P2): Promise<void>` walks the ogre next to the boulder and plays `windup`, then `wave`.

- [ ] **Step 1: Add failing checks**

```js
// village.mjs
check("elder explains the key before the trials", lines.some((l) => l.includes("eines Morgens vor meiner Tür")));
check("after the trials he sends Tadeo to the ogre", lines.some((l) => l.includes("Riesenfels")));
// ogre.mjs
check("the gate is at the east end of the bridge", dist(player, [53.5, 0.5]) < 4 && prompt.includes("Los geht's"));
check("the ogre lifts the boulder after the fight", !(await story()).boulder && sawLine("Der Fels? Den hebe ich dir mit einer Hand!"));
check("Tadeo can walk to the mountain gate afterwards", reach([53.5, 0.5], [55.5, -13.5]));
// mountain.mjs
check("the shrine is the old people's", lines.some((l) => l.includes("alte Volk")));
check("the hammer's job is said", lines.some((l) => l.includes("für das Eis")));
```

- [ ] **Step 2: Run them to see them fail**

Run: `node scripts/e2e/village.mjs; node scripts/e2e/ogre.mjs; node scripts/e2e/mountain.mjs`. Expected: each FAILs on its new checks.

- [ ] **Step 3: Implement**

- Village: `village_enter` becomes the elder's two key lines. `afterQuest(7)` plays the rest, split so that no line runs over 14 words: "Du hast ihn dir verdient! Jetzt fehlt noch der Hammer." / "Er liegt oben auf dem Berg." / "Aber ein Riesenfels versperrt den Weg. Nur der Oger ist stark genug." / Chuleta "Ein Monster? Gack! Die Beeren!". The trials stay exactly as they are. Their welcome and thanks lines say what the key test is for, but only if that fits under the language rules.
- Ogre: `ogre/story.ts` `intro` and `outro` take the spec's quest 8 lines. `afterQuest(8)`: back at [53.5, 0.5], the ogre walks to the boulder, the line, the boulder rises and is thrown off the trail (`remove()`), rocks and colliders go.
- Mountain: lines only, from the spec's quest 9. Check the challenge doesn't name the Schatzinsel for the big island.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && node scripts/e2e/village.mjs && node scripts/e2e/ogre.mjs && node scripts/e2e/mountain.mjs`. Expected: clean, PASS.

- [ ] **Step 5: Commit** with `feat(story): connect the key, the ogre, the boulder and the climb`.

---

### Task 11: Quest 10 — berries for the shark

**Files:**
- Modify: `src/challenges/sea/sharkFight.ts`, `boat.ts`, `seaUI.ts`, `course.ts`, `SeaChallenge.ts`, `src/game/StoryWorld.ts`, `src/data/dialogues.ts`
- Test: `scripts/e2e/sea.mjs`

**Interfaces:**
- Consumes: `StoryWorld.beforeQuest(10)`, `Npcs.setSpot`, `createBerries` (`world/models/items.ts`).
- Produces in `sharkFight.ts`: `THROWS_NEEDED = 3`; `throws: number` replaces `bonks`, `feed()` replaces `bonk()`, `FightStage.onFeed` replaces `onBonk`; `leaping` and `ringNow` unchanged; the shark's last mood is `"happy"`, never `"dizzy"`.
- Produces in `boat.ts`: `berries: THREE.Group` replaces `hammer`; poses `stand` and `throw`. `patched: true` from `NORTH_DOCK_BOAT`.
- Produces in `seaUI.ts`: `showFeeds(n: number)`, berry slots.

- [ ] **Step 1: Update `sea.mjs` to fail**

```js
check("no hammer in the sea scene", !/createHammer/.test(seaSources));
check("Paco and the ogre wait at the dock", story.paco === "dock" && story.ogre === "dock" && story.dockBoat);
check("the wreck left the beach", !story.wreck);
check("three throws in the green window calm the shark", fight.throws === 3);
check("the shark swims away happy", fight.mood === "happy");
check("a press outside the green window doesn't count", throwsAfterMiss === throwsBeforeMiss);
check("the trail is starfish", await page.evaluate(() => !!window.engine.scene.scene.getObjectByName("starfish")));
check("Paco explains the starfish", lines.some((l) => l.includes("Seesternen")));
check("the chain into the treasure still runs", await waitForScene("treasure"));
check("the save points to the dock at quest 11", saved.milestone === 11 && dist([saved.playerX, saved.playerY], northDockEnd) < 6);
```

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/e2e/sea.mjs`. Expected: FAIL on "no hammer".

- [ ] **Step 3: Implement**

- `beforeQuest(10)`: at the dock, Paco's two lines from the spec, then the challenge.
- The fight keeps its timing: same `ringNow` window, same attack. Space in the window throws a berry that arcs into the open mouth (a small mesh, 0.35 s). A miss works as today.
- Lines: Chuleta "Der Hai ist auch ein Monster! Gack! Die Beeren!", Tadeo "Hier, Hai! Mach den Mund auf!". `TAUNTS`, `OUCH` and banner: "Wirf die Beeren in sein Maul!". The `shark_defeat` line says the shark is friendly now.
- `course.ts`: golden stars become glowing starfish (`name = "starfish"`), still collected the same way.
- Berries stay in the inventory.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && node scripts/e2e/sea.mjs`. Expected: clean, PASS.

- [ ] **Step 5: Commit** with `feat(sea): calm the shark with berries instead of the hammer`.

---

### Task 12: Quest 11 — the heart in the chest

**Files:**
- Modify: `src/challenges/treasure/chest.ts`, `script.ts`, `index.ts`, `stage.ts`, `src/data/dialogues.ts`
- Test: `scripts/e2e/treasure.mjs`

**Interfaces:**
- Consumes: `createFeuerherz()` (Task 6), `showMapCard` (Task 5).
- Produces in `chest.ts`: `Chest.heart`, `Chest.plan`, `Chest.note` (`THREE.Group`, revealed one at a time), with gold, jewels and the crown as today.
- Produces in `script.ts`: `erupt(s)` replaces `victory`. `party` moves to Task 13.
- Produces: `TreasureState` gains `heart: boolean`, `note: boolean`, `erupting: boolean`.

- [ ] **Step 1: Update `treasure.mjs` to fail**

```js
check("map card on arrival", mapCardSeen);
check("Chuleta explains Zaubereis", lines.some((l) => l.includes("Zaubereis")));
check("the note is read", lines.includes('Ein Zettel. "Es tut mir leid. P."'));
check("the heart comes out and is warm", state.heart && lines.some((l) => l.includes("ganz warm")));
check("no end card and no party here", !(await page.isVisible(".endcard")));
check("the volcano erupts on the horizon", state.erupting);
```

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/e2e/treasure.mjs`. Expected: FAIL on the map card.

- [ ] **Step 3: Implement**

Run order: `arrive` (with the map card) → `walkToX` → `dig` → `hammer` → `unlock` → `openChest` (note, heart, plan, gold, crown flight) → `erupt`. A volcano silhouette with glow and smoke on the horizon, the camera turned to it, and the narrator line "Da! Der Vulkan spuckt Feuer! Schnell zurück!". `index.ts` no longer calls `party`. Lines from the spec's quest 11; check `dialogues.ts:305-408` for anything that no longer fits.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && node scripts/e2e/treasure.mjs`. Expected: clean, PASS.

- [ ] **Step 5: Commit** with `feat(treasure): find the Feuerherz and Paco's note in the chest`.

---

### Task 13: Quest 12 — the finale and the festival

**Files:**
- Create: `src/challenges/finale/index.ts`, `src/challenges/finale/ending.ts`, `src/challenges/festival/index.ts`, `src/challenges/festival/script.ts`, `scripts/e2e/finale.mjs`
- Modify: `src/challenges/types.ts`, `src/challenges/volcano/modes.ts`, `src/challenges/village/plaza.ts`, `src/game/Game.ts`, `src/ui/EndCard.ts`, `src/data/dialogues.ts`, `scripts/e2e/all.mjs`
- Test: `scripts/e2e/finale.mjs`

**Interfaces:**
- Consumes: `VolcanoMode`, `Altar`, `createFeuerherz`, `createHueter`, `VillageStage`, `Fireworks` and confetti from `treasure/fx.ts`, `createOgre`, `Fox`, `createMole`.
- Produces: `ChallengeName` gains `"finale" | "festival"`. `FINALE: VolcanoMode` = `bombInterval [1.15, 0.6]`, a redder sky, `carriesHeart: true`, `ending` from `finale/ending.ts`.
- Produces in `plaza.ts`: `setNight(): void`.
- Produces in `festival/index.ts`: `state` getter `{ phase: "talk" | "party"; present: string[]; fireworks: boolean }`.
- Produces in `Game.ts`: `GATES[12] = { at: LANDMARKS.volcanoGate, challenge: "finale" }`; `private finale(): Promise<void>` = `enterChallenge("finale")`, `enterChallenge("festival")`, `ending()`.
- Produces in `EndCard.ts`: "Du hast die Insel gerettet!", the coin count and a rocket teaser.

- [ ] **Step 1: Write `finale.mjs` and add it to `TESTS` after `treasure`**

```js
// Full path from ?challenge=finale, with the volcano autopilot
check("the sky is redder and the rate is back to today's", director.intervalAt(0) === 1.15 && director.intervalAt(1) === 0.6);
check("Tadeo carries the heart", await heroHasHeart());
check("the heart goes into the hollow", altar.heart);
check("the rocks stop and the lava dims", bombsAfter === 0 && lavaDimmed);
check("the Hüter fades", hueterGone && lines.includes("Danke, Tadeo. Jetzt kann ich endlich ruhen."));
check("the festival is at night with everyone", ["Oger", "Fuchs", "Käpt'n Paco", "Dorfältester", "Kleine Mia", "Fischer Jonas", "Bäckerin Lina"].every((n) => state.present.includes(n)));
check("Paco confesses", lines.some((l) => l.includes("das war ich")));
check("P wie Paco", lines.includes("P wie Paco!"));
check("the rocket plan and the golden egg", lines.some((l) => l.includes("Rakete")) && lines.some((l) => l.includes("goldenes Ei")));
check("end card says the island is saved", (await page.textContent(".endcard")).includes("Du hast die Insel gerettet!"));
check("save is gone after the end", await noSave());
// Review Focus 5: the chain
// Seed a version 4 save at milestone 11 at the north dock, reload, Continue
check("Continue at 11 goes to the dock", dist(player, northDockEnd) < 6 && prompt.includes("Los geht's"));
// Play ?challenge=treasure to its end with the steering from treasure.mjs; when the finale scene starts, reload, Continue
check("the treasure saves quest 12", saved.milestone === 12);
check("Continue at 12 goes to the volcano gate", dist(player, volcanoGate) < 6 && prompt.includes("Los geht's"));
check("side games are not locked at 12", canTalkToJonas);
check("runs at the baseline fps at the festival", fps >= baselineFps - 3);
```

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/e2e/finale.mjs`. Expected: FAIL at the loader (`finale` doesn't exist).

- [ ] **Step 3: Implement**

- `Game.playChallenge`: milestone 11 → `quest.completeMilestone()`, `saveAt(LANDMARKS.volcanoGate)`, fade to black, narrator "Tadeo segelt zurück, so schnell er kann.", then `playChallenge(12)`. Milestone 10 → `saveAt(northDockEnd)` as today. Milestone 12 → `finale()`.
- `finale/ending.ts`: Tadeo walks to `Altar.hollowAt` and sets the heart in. Light, bombs stop, lava dims, rainbow, `Hueter.fade()`, his thanks line.
- `festival/`: `new VillageStage(ctx.ui)`, `plaza.setNight()`, drums and stones hidden, the cast placed around the fire, Tadeo in the crown, `Fireworks` and confetti. Spec's seven lines. The party then loops under the end card as the treasure party did. The end card's teaser says he sails home in his mended boat and that the rocket comes next.
- `festival` reuses `village/` and `treasure/fx.ts`. Both are single extra users, so nothing moves to `shared/`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && node scripts/e2e/finale.mjs && node scripts/e2e/volcano.mjs && node scripts/e2e/village.mjs && node scripts/e2e/treasure.mjs`. Expected: clean, PASS. Look at the night screenshots.

- [ ] **Step 5: Commit** with `feat(story): add the finale and the island festival`.

---

### Task 14: Voices, language check, docs and hand-over

**Files:**
- Modify: `public/voices/*`, `scripts/voice/generate.mjs` (if the owner swaps a voice), `scripts/e2e/voices.mjs`, `README.md`, `CHANGELOG.md`, `AGENTS.md`
- Test: `scripts/e2e/all.mjs`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Run the one-off language check**

A throwaway script in the scratchpad, not committed. It compares `collectLines().lines` to `scripts/e2e/out/baseline-lines.json` and lists every new or changed line that:
- has more than 14 words,
- has more than 2 sentences (ignoring "Gack!"),
- contains "die Alten", "Altar", "ewiges Eis" or "besänftigen",
- contains "Schatzinsel" where it means the big island, "Kalle", "Henni" or "Geist" as a speaker.

It also walks `DialogueScript` arrays with the TypeScript parser and lists any with more than 5 lines, except quest 3, the lake and the festival. Expected after fixes: nothing listed. Save the output to `scripts/e2e/out/voices/language-check.txt`.

- [ ] **Step 2: Let the owner pick the voices**

Render three candidates each for Paco and the mole, two short lines per candidate, into `scripts/e2e/out/voices/samples/`. Ask the owner to choose. Put the chosen ids in `CAST`.

- [ ] **Step 3: Render all lines**

Run: `npm run voices -- --dry-run`, check the count looks right, then `npm run voices`. Expected: the dry run afterwards reports nothing missing. Run `node scripts/e2e/voices.mjs`: PASS, with no `[voice] no recording` and nothing reported as dynamic.

- [ ] **Step 4: Update the docs**

- `README.md`: the story, quest count, controls unchanged.
- `CHANGELOG.md`: a new section for the story rethink.
- `AGENTS.md`: test list gains `finale`; the map note on `SPOTS` stays; the "Game.ts is at" size note if it changed; a line about `StoryWorld` and how the island follows the milestone.

- [ ] **Step 5: Run the full proof**

Run: `node scripts/e2e/all.mjs`. Expected: all PASS, fps within 3 of `scripts/e2e/out/baseline.txt`, `npx tsc --noEmit -p .` clean. Anything that also failed in the baseline is reported as such.

- [ ] **Step 6: Commit** with `docs(story): render voices and document the twelve quests`.

- [ ] **Step 7: Hand over for the owner's play test**

Do not merge or push. Start `npm run dev` in the worktree on a free port and tell the owner where to play it. The final check is the owner's: Tadeo plays it and can retell the story roughly like this:

> Der Vulkan hat ein Herz. Ein Pirat hat es gestohlen. Darum wacht der Vulkan auf. Ich habe vier Sachen gefunden und das Herz zurückgebracht. Und der Pirat war Paco!
