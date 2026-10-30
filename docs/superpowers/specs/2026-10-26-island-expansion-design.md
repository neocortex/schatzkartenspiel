# Bigger island, better story, side quests — design

Status: approved to build in stages (2026-10-26). Built in the worktree branch `worktree-island-expansion`
so the current game stays playable on `main`.

The story section and stage 2 are replaced by `2026-10-30-story-rethink-design.md`.

## Why

Tadeo (7) loves the island but wants *more world*: more to explore, more kinds of nature and animals,
a story that makes sense from the first minute, and coins and items that are actually good for something.
The model is Zelda-like: one island overworld to roam, plus "dungeons" (the existing challenge scenes).
Graphics quality ("wow") and joy matter more than anything else.

## Goals

1. **Bigger island** (~1.7× land area) with **four new regions**, each with its own look (terrain colours,
   plants, animals, one landmark) and something to find or do.
2. **Better story order**: start next to the village, learn the legend, collect the items in an order where
   each one is needed for the next step. The treasure is the island's **heart-stone** (plus gold and
   rocket plans); the finale carries it to the volcano and calms it, then the village celebrates.
3. **Side quests and secrets** across the island; **coins buy things** in a shop; **items matter**.

## Non-goals (later projects)

Action-RPG enemies on the island, an open-world boat, the rocket/space sequel, a new voice backend.

## Anti-goals (would make this a failure even if it works)

- Long empty walks. Every region needs something to look at or do within a few seconds of walking.
- Any way to fail permanently. **Never a game over**: mistakes restart the attempt with a kind line.
- Text that is too long or too hard for a 7-year-old.
- Frame-rate drops on the Mac (keep ~60 fps; E2E reports fps).
- Breaking an existing challenge.

## Constraints

- All `AGENTS.md` conventions: German text for a 7-year-old, every speaker has a face and a voice,
  arrows + Space only, `input.consume`, `frustumCulled = false` on island-wide instanced meshes,
  clamped `pow()` in shaders, `fog: false` on additive glows, `Game.ts` ≤ ~550 lines (it is at 545:
  new flow goes into new modules in `game/`), files ≤ ~500 lines.
- **Keep every existing world coordinate.** The island grows by adding land around the current one,
  so no landmark, gate, NPC spot or E2E walking route moves.
- Every stage ends with E2E proof (`scripts/e2e/out/<name>/`) and all existing E2E tests passing.

## The map

World x = east, z = south. The current island (ellipse centre (0, 6), radii 98 × 70) stays as it is.
The coastline becomes the smooth union of that ellipse and four new lobes. `WORLD_HALF` grows from 135
to ~175 and the heightfield resolution grows with it so the cell size stays ~0.55.

| Region | Where (centre, radii) | Look | Plants | Animals | Landmark | Something to do |
|---|---|---|---|---|---|---|
| **Lagunenstrand** (arrival) | south-east, ~(88, 88), 42 × 34, just south of the village | white sand, turquoise shallow lagoon behind a sand spit | palms, hibiscus bushes, beach grass, coral rocks in the shallows | sea turtles, crabs, dolphins jumping offshore, fish in the lagoon | arrival jetty with Tadeo's boat, beach huts | turtle side quest |
| **Dschungel** | south, ~(5, 104), 50 × 36, below the enchanted forest | deep saturated green, dark soil, mist | bamboo, big-leaf plants, ferns, giant flowers, vines | parrots, a monkey (Coco) | jungle waterfall pool + old stone ruin | monkey side quest |
| **Seerosensumpf** | south-west, ~(-58, 94), 30 × 26 | olive-green, muddy shores, still water | mangroves, reeds, lily pads with flowers | frogs, dragonflies, fireflies at the pond | the frog king's islet in the pond | lily-pad jumping side quest |
| **Blumenhügel** | east, ~(128, 2), 34 × 44, beyond the village and the mountain shoulder | bright rolling hills with flower fields | flower meadows, light round trees, hedges | sheep, bees/butterflies | windmill on the highest hill | exploration (view, hidden coins) |

Also:
- **River** extends south through the new land to a mouth between jungle and lagoon.
- **Southern river crossing**: stepping stones (jumping!) across the river near the old south coast,
  so the west side is reachable from the village without passing the ogre's bridge.
- **Mountain trail boulder**: a big boulder blocks the trail just past the bridge junction until the
  ogre is a friend (he lifts it away). Needed because the trail is reachable from the village side.
- The **old landing beach** in the south-west becomes a quiet cove (the old pier stays) — explorable,
  with coins.
- New paths connect village ↔ lagoon, village ↔ hills, stepping stones ↔ jungle ↔ swamp ↔ forest.
- The title-screen orbit widens to show the whole bigger island.

### Graphics

- Terrain gets per-region palettes through a second mask texture (region weights), blended softly.
- New plant species are built in the existing flora style (merged primitives, vertex colours, wind sway).
- New animals use the existing instanced critter system (`world/ambient/`).
- Region landmarks are `Site`s like the existing set pieces.
- Ambient detail per region: mist in the jungle, fireflies over the swamp, dolphins and fish at the lagoon.

## The story (new order)

| # | Quest | What happens | Item |
|---|---|---|---|
| 1 | **Ankunft am Lagunenstrand** | Boat lands at the lagoon. The volcano "hiccups" (rumble, smoke burst, Henni: "Gack! Was war das?"). Fischer Jonas greets them and sends them to the village elder. | — |
| 2 | **Das Dorf** | Elder tells the legend: the island's heart-stone kept the volcano asleep; long ago the old king hid it in a chest on the treasure island, frozen in ice, and gave the golden key to the village. Now the volcano wakes up. The drum trials (village challenge) earn the key. Elder: "Für die Reise brauchst du ein Schwert — in der Höhle im Nordwesten. Geh über die Trittsteine im Süden." | golden key |
| 3 | **Die Höhle des Schwerts** | Cave challenge (unchanged). | sword |
| 4 | **Der Zauberwald** | Sword cuts the thorn hedge at the forest gate; berries (forest challenge, unchanged). | berries |
| 5 | **Der Oger an der Brücke** | Ogre fight (berries heal). Tadeo gives a berry, the ogre becomes a friend and **lifts the boulder off the mountain trail**. | — |
| 6 | **Der Berggipfel** | Mountain challenge (unchanged). | hammer |
| 7 | **Die Haiattacke** | Sea challenge (unchanged; hammer bonks the shark). Chains straight into 8. | — |
| 8 | **Die Schatzinsel** | Dig, smash the ice (hammer), open with the key. The chest holds the **glowing heart-stone**, gold and a rolled-up **rocket plan** (the crown still flies onto Tadeo's head). Boat back to the north dock. | heart-stone |
| 9 | **Das Herz des Vulkans** | The volcano erupts. Tadeo carries the heart-stone through the lava field (volcano challenge, reused) to an old altar at its foot; the volcano calms, a rainbow appears. **Island festival** in the village (everyone dances, fireworks, Henni lays a golden egg), then the end card teases the rocket. | — |

Details:
- The lake tablets become optional **Geheimsteine** (secret stones), see side quests.
- Henni's hints and cheers are re-keyed to the new numbers and rewritten where the story changed.
- The HUD item slots follow the new order: key, sword, berries, hammer.
- Volcano hiccups recur on the island now and then (small shake + smoke), a little stronger each quest.
- Old saves cannot be mapped to the new numbers: `SAVE_VERSION` goes up, so an old save starts a new
  game (coins and hats are stored separately and stay).

## Side quests, secrets and coins

All side quests are optional, can be done in any order and never fail.

| Side quest | Who (face + voice) | Task | Reward |
|---|---|---|---|
| **Schildkröten-Babys** | Turtle mum Tilda (lagoon) | Five baby turtles wandered into the dunes. Walk near one and it follows Tadeo in a little line; bring them all to the water. | coins + a shell necklace (outfit) |
| **Affe Coco** | Bäckerin Lina asks; Coco the monkey (jungle) | Coco stole Lina's coconuts. He sits in a tree; touch the tree and he jumps to the next one. After the third tag he laughs and gives them back. | coins + Lina's cake hat / coins |
| **Seerosen-Sprung** | the frog king (swamp) | Jump across lily pads (some sink slowly) to his islet. Falling in only means wading back to the start, with Henni giggling. | coins + frog crown for Henni |
| **Geheimsteine** | Henni reads them | Six secret stones (three at the lake, one each in jungle, swamp, hills) each tell a piece of the heart-stone legend. All six → a reward. | golden egg-shaped trophy / coins |

**Coins** become money:
- More coins (≈ 60) spread over the bigger island, many in secret corners (cove, hills, swamp islet, ruins).
- A **market stall** in the village (Händlerin Rosa) sells the outfits that today unlock automatically
  at 10/20/30 coins (straw hat, pirate hat, sunglasses), plus things for Henni (a bow, tiny sunglasses).
  Tadeo picks with the arrows and buys with Space.
- Prize outfits from side games stay prizes (not for sale).

**Items matter**: key → chest; sword → thorns + ogre fight; berries → heal in the fight + befriend the ogre;
hammer → shark + ice; heart-stone → finale.

## Stages

Each stage is played and checked before the next one starts.

1. **Bigger island** — new land, regions, terrain colours, plants, animals, landmarks, paths, stepping
   stones and the lagoon arrival jetty (unused until stage 2). The current story still plays unchanged.
   Proof: new `scripts/e2e/world.mjs` (screenshots of every region from the ground and above, walks
   between regions, fps, no console errors) + all existing E2E tests pass.
2. **New story order** — quests, dialogue, Henni lines, gates, mountain-trail boulder + ogre lifting it, treasure chest
   contents and return, volcano finale with altar, festival, end card, save version, HUD order.
   Proof: updated `island.mjs`, `treasure.mjs`, `volcano.mjs`, plus a new `finale.mjs`.
3. **Side quests and shop** — market stall and coin economy, the four side quests, secret stones.
   Proof: one E2E per side quest plus `shop.mjs`.

## Calls I made (to check while reading)

- Island grows by lobes around the unchanged current island, rather than scaling everything up.
- Region choice (lagoon, jungle, swamp, flower hills) and their placement.
- Southern stepping stones as the second river crossing; boulder on the mountain trail.
- Volcano finale reuses the existing lava-field course with a new goal (altar), instead of a new climb.
- Old saves start over (coins and hats are kept).
- Shop sells the existing coin outfits; side-quest prizes are not for sale.

## Left to the builder

Exact coastline shapes and coordinates (tuned visually), plant/animal models, palettes, coin spots,
names of minor NPCs, prices.
