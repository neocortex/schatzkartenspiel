# AGENTS.md

Project guidance for coding agents. See README.md for setup, controls and debug URL parameters.

## What this is

A 3D island adventure (Three.js + TypeScript + Vite) for a 7-year-old German-speaking player.
Graphics quality ("wow") and joy matter more than anything else. It is live at https://tadeo.fun: every push to
`main` publishes it to GitHub Pages (`.github/workflows/deploy.yml`).

## Run

- `npm run dev` — dev server on :3000
- `npm run voices` — render new or changed spoken lines with ElevenLabs (needs `ELEVENLABS_API_KEY` in `.env`);
  `npm run voices -- --dry-run` shows what would be rendered without spending credits
- `npx tsc --noEmit -p .` — type-check (must be clean)
- E2E: start `npx vite --port 5199`, then `node scripts/e2e/<name>.mjs` (world, island, volcano, cave, forest,
  ogre, village, mountain, sea, treasure, fishing, hens, voices, fps). Proof goes to `scripts/e2e/out/<name>/`.

## Architecture

- `core/Engine.ts` runs one `GameScene` at a time (scene, camera, optional `post` settings) with
  fades between them. `Engine.onFrame` runs before the scene update; `Game` uses it for the UI and flow.
- The island is the old ellipse plus four region lobes (lagoon, jungle, swamp, hills); `world/regions.ts`
  owns the lobes and their terrain, and `hf.regionAt(x, z, REGION_INDEX.<name>)` says where a region is.
  Landmarks sit at their `SPOTS` entry in `world/layout.ts`, which also feeds the vegetation keep-outs.
- `game/Game.ts` is the adventure flow on the island (title, intro, objectives, NPC talks, coins,
  launching challenges, rewards, saving). Keep it under ~550 lines: put new features in their own
  module in `game/` (see `Sightings.ts`, `sideGames.ts`, `Wardrobe.ts`, `lake.ts`, `hedgeOpening.ts`).
- Challenges live in `src/challenges/<name>/index.ts` and default-export a `ChallengeFactory`
  (`challenges/types.ts`). They are found by `challenges/registry.ts` (`import.meta.glob`) and loaded
  on demand. A challenge resolves `finished` when won; the flow hands out the reward.
- Helpers used by several challenges go to `src/challenges/shared/`, not into another challenge's folder.
  Sibling challenges built as a pair reuse each other's files (sea → ogre kit, forest → cave materials,
  mountain → `volcano/kit`); a third user of such a file is the moment to move it to `shared/`.
- `classic-2d/` is the original Phaser 2D game, kept as a frozen snapshot for nostalgia. It has its own
  `package.json` and is not part of the type-check, build or E2E runs. Don't change it.

## Conventions

- **Never a game over.** Mistakes restart the current attempt with a kind line.
- **Text is German, for a 7-year-old:** short sentences, simple words, warm and funny.
- **Every speaker needs a face and a voice:** add new speakers to `SPEAKERS` in `ui/Dialogue.ts`
  (portrait or emoji, colour) and to `CAST` in `scripts/voice/generate.mjs`.
- **Every spoken line is a recording in `public/voices/`:** after adding or changing a line, run `npm run voices`
  and commit the files. `scripts/voice/lines.mjs` finds lines next to their speaker; a line in a plain constant
  needs an `OWNERS` entry there. The game logs `[voice] no recording` and uses browser speech for a line it misses.
- **Lines with a changing value** (a time, a length) cannot be recorded: give them a fixed `spoken` version.
- **Controls are arrows + Space only** (M = mute, V = voice toggle are global).
- **Input:** read presses with `input.consume(code)`. Presses stay readable from the start of a frame
  until the next frame begins, so code resuming after an `await` still sees them.
- Instanced meshes spread over the whole island need `frustumCulled = false`.
- In the browser console use `window.game` only after `main.ts` ran (`<div id="game">` shadows it before).

## Shader pitfalls

- Clamp `pow()` bases (`pow(max(x, 0.0), k)`): a slightly negative base is NaN on Metal, and bloom
  smears a single NaN pixel into a black screen.
- Additive glow materials need `fog: false`, otherwise fog turns them into pale slabs.
