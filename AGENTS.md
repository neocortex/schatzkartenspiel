# AGENTS.md

Project guidance for coding agents. See README.md for setup, controls and debug URL parameters.

## What this is

A 3D island adventure (Three.js + TypeScript + Vite) for a 7-year-old German-speaking player.
Graphics quality ("wow") and joy matter more than anything else; it is played locally, not shipped.

## Run

- `npm run dev` — dev server on :3000, also starts the voice server (`uv run scripts/voice/tts_server.py`)
- `npx tsc --noEmit -p .` — type-check (must be clean)
- E2E: start `npx vite --port 5199`, then `node scripts/e2e/<name>.mjs` (island, volcano, cave, forest,
  ogre, village, mountain, sea, treasure, fishing, hens). Proof goes to `scripts/e2e/out/<name>/`.

## Architecture

- `core/Engine.ts` runs one `GameScene` at a time (scene, camera, optional `post` settings) with
  fades between them. `Engine.onFrame` runs before the scene update; `Game` uses it for the UI and flow.
- `game/Game.ts` is the adventure flow on the island (title, intro, objectives, NPC talks, coins,
  launching challenges, rewards, saving). Keep it under ~550 lines: put new features in their own
  module in `game/` (see `Sightings.ts`, `sideGames.ts`, `Wardrobe.ts`).
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
  (portrait or emoji, colour) and to `SPEAKER_VOICES` in `systems/NarrationManager.ts`.
  Voices are defined in `scripts/voice/tts_server.py`.
- **Controls are arrows + Space only** (M = mute, V = voice toggle are global).
- **Input:** read presses with `input.consume(code)`. Presses stay readable from the start of a frame
  until the next frame begins, so code resuming after an `await` still sees them.
- Instanced meshes spread over the whole island need `frustumCulled = false`.
- In the browser console use `window.game` only after `main.ts` ran (`<div id="game">` shadows it before).

## Shader pitfalls

- Clamp `pow()` bases (`pow(max(x, 0.0), k)`): a slightly negative base is NaN on Metal, and bloom
  smears a single NaN pixel into a black screen.
- Additive glow materials need `fog: false`, otherwise fog turns them into pale slabs.
