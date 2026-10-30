# Handoff: Island expansion — stages 2 and 3, voices, leftovers

**Date:** 2026-10-27
**Branch:** `worktree-island-expansion` (worktree `.claude/worktrees/island-expansion`, not merged into `main`)
**Last Commit:** `99500a7 feat(world): grow the island with four new regions`

## Goal

Make Schatzkartenspiel (3D island adventure for Tadeo, 7, German) "Zelda-like": a bigger island with regions plus
the challenges as "dungeons", a better-ordered story ending with treasure option 1 (heart-stone + gold + rocket plans),
side quests, and coins with a purpose. Spec (all three stages): `docs/superpowers/specs/2026-10-26-island-expansion-design.md`.
The user asked for it in stages, in this worktree, so they can keep playing `main` meanwhile.

## Completed

- [x] Quick wins — `e54d762`: Henni the hen replaces Pico, Tadeo's fringe, ogre swings blocked with timed Space, Mia's hen → Hilde
- [x] Design + stage 1 plan — `3882758` (`docs/superpowers/plans/2026-10-26-island-expansion-stage1.md`)
- [x] Stage 1, bigger island — `99500a7`: lagoon, jungle, swamp, flower hills (landmarks, plants, animals, paths, signposts,
  stepping stones), wider title flyover, `scripts/e2e/world.mjs`
  - Final review by a fresh reviewer: "with fixes". Fixed with RED→GREEN checks in world.mjs: swamp puddles lifted the
    open-sea floor, lily pads floated at sea, jungle mist read as grey discs over Tadeo

## In Progress / Next Steps

- [ ] **Ask the user about merging.** The branch is 3 commits on `4c252e5`; `main` moved on (`898a7c9` classic-2d save fix,
  `f077b8e` changelog) → expect a `CHANGELOG.md` conflict under Unreleased. The quick wins were first built uncommitted in
  the main checkout, so run `git status` there before merging (it may still hold copies of them).
- [ ] **Stage 2 — new story order** (spec "The story (new order)" + "Stages" 2). Write a plan first with
  `superpowers:writing-plans`, using the stage 1 plan as the template. Scope:
  - quests, dialogue, Henni lines, gates, HUD order key/sword/berries/hammer
  - berries heal in the ogre fight and befriend the ogre, who lifts the mountain-trail boulder
  - chest holds the heart-stone, gold and the rocket plan; volcano altar finale, island festival
  - the end card teases the rocket; `SAVE_VERSION` goes up
  - Proof: updated `island.mjs`, `treasure.mjs`, `volcano.mjs` + a new `finale.mjs`
  - The stepping stones moved **west** of the village (`SPOTS.ford` [38,50]): text must say "im Westen", not "im Süden"
    (the spec still says southern). The lagoon arrival jetty (`SPOTS.lagoonJetty`) is built but unused until stage 2.
- [ ] **Stage 3 — side quests and shop** (spec "Side quests, secrets and coins"):
  - Tilda's turtle babies, Affe Coco, Seerosen-Sprung with the frog king, six Geheimsteine
  - ≈60 coins; Händlerin Rosa's market stall
  - Every new speaker goes in `SPEAKERS` (`ui/Dialogue.ts`), `SPEAKER_VOICES` (`systems/NarrationManager.ts`) and
    `scripts/voice/tts_server.py`. Proof: one E2E per side quest + `shop.mjs`.
- [ ] **Voices (waiting on the user).** Recommended: ElevenLabs. The user creates an account and sets
  `ELEVENLABS_API_KEY`; then render the same five test lines and let the user and Tadeo pick by ear.
  - Free alternative: finish testing Qwen3-TTS locally (voices designed from a text description). A partial 1.3/4.5 GB
    download sits in `~/.cache/huggingface/hub/models--Qwen--Qwen3-TTS-12Hz-1.7B-VoiceDesign`.
  - Today's voices: Piper via `scripts/voice/tts_server.py`.
- [ ] **Deferred review minors (stage 1):**
  - the jungle-pool lily-pad branch is dead code (`Vegetation.ts` KEEP_OUT r 9 returns first)
  - the heightfield build costs ≈ +380 ms (`lobeDistance` recomputed ~10× per cell in `world/regions.ts`)
  - `Vegetation.region()` relies on `REGION_INDEX` key order
  - new paths re-rolled the coin spots, so a save's `taken` indexes shift (stage 2's `SAVE_VERSION` bump settles it)
  - spec items never built: jungle waterfall, lagoon coral rocks, hedges and bees on the hills
  - `world.mjs` lacks an off-path seam walk and a hills fps sample
- [ ] **Leftovers for the user to decide:** the partial Qwen download (above); two logs in the gitignored
  `.playwright-mcp/` folder.

## Key Decisions

- **No Google Cloud TTS**: never use `GOOGLE_APPLICATION_CREDENTIALS` — it is the user's work account.
- **No OpenAI TTS**: the account had no credits, and its speech models shut down on 6 Jan 2027.
- **Commits only when asked**, conventional style, no AI co-author or session trailers.
- **Lobes instead of rescaling**: the island grows by lobes around the unchanged old island. Old quest spots keep their
  height (±0.15) and both piers still end over water, so the existing challenges and E2E routes keep working.
- **Region water only digs** (`Math.min` in `regionWater`): region weights reach out over the sea, and lifting there
  made shoals.
- **Mist fades within 34 units of the camera**: Tadeo's ground stays clear and the haze sits among the far trees.
- **Stage 1 rulings, each with its cost if wrong**: `.superpowers/sdd/2026-10-26-island-expansion-stage1/progress.md`
  (git-ignored; read it before touching `src/world/`). It covers the ford move, `lobeDepth`, the ±0.3 blend band, the
  boardwalk and the walker steering.

## Dead Ends (Don't Repeat These)

- **Ford at [36,68] with a flat height cut**: the east bank there is an enclosed sea inlet, and the cut made cliffs.
  Fixed by moving it to [38,50] with a cone.
- **Region blend band of ±0.15**: it left unwalkable ridges at the seams.
- **Shoal test "sea beyond coast distance 1.15 must be deep"**: the coast noise reaches ±0.26 and the old mountains rise
  from the sea, so it flagged old features. Test the cause instead: `regionWater` never raises the ground.
- **Measuring the mist by whole-frame brightness**: the intended far haze dominates. Measure the lower ⅔ (near Tadeo) and
  the top ⅓ (far) separately.
- **Kokoro TTS**: it has no German child voice.
- **The worktree guard**: it refuses compound shell and `git -C <main checkout>`. Use plain commands, Edit/Write, or a
  script file in the ledger dir; Node scripts that import playwright must live inside the worktree.

## Current State

- **Tests:**
  - full E2E suite before the review fixes → 12/12 pass
  - after the fixes → world, island, volcano, cave and forest pass; the test server stopped during `ogre` (fight won,
    then the browser closed), so ogre, village, mountain, sea, treasure, fishing and hens still need a post-fix run:
    `npx vite --port 5199`, then `node scripts/e2e/all.mjs ogre village mountain sea treasure fishing hens`
  - the fixes touched `regions.ts`, `Vegetation.ts` and `Smoke.ts` (a new `uNearFade` uniform, 0 for every style but mist)
- **Type-check:** `npx tsc --noEmit -p .` clean
- **Manual verification:**
  - close-ups of every new animal (the parrot model was reworked into a macaw, dolphin fins now break the surface)
  - title orbit, map and region screenshots in `scripts/e2e/out/world/`
- **Servers:** none left running. E2E runs need `npx vite --port 5199`; `npm run dev` (:3000) also starts the voice
  server on :5299.

## Context for Next Session

Stage 1 is done and committed but not merged. The user plays `main` on :3000, so ask before merging or touching `main`.
The next real work is the stage 2 plan; the biggest risk is the story rewrite breaking existing E2E flows (island,
treasure, volcano), so plan their updates alongside the quest changes. Voices are blocked until the user picks
ElevenLabs (and sets the key) or the local Qwen option.

**Recommended first action:** read the spec and the stage 1 ledger, ask the user whether to merge stage 1, then run
`superpowers:writing-plans` for "Stage 2 (new story order) of docs/superpowers/specs/2026-10-26-island-expansion-design.md".
