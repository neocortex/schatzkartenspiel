# Bigger Island (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the island by four new regions (Lagunenstrand, Dschungel, Seerosensumpf, Blumenhügel), each with its own terrain colours, plants, animals and landmark, while the current story keeps playing unchanged.

**Architecture:** The coastline becomes a smooth union of the current ellipse and four lobes defined in `world/layout.ts`. A new `world/regions.ts` owns the lobe maths (coast distance, region weights, region height shaping); `Heightfield` bakes region weights into a second RGBA texture (`uRegionTex`) that terrain and grass shaders read for per-region palettes. Plants, landmarks and animals read region weights through `hf.regionAt()`.

**Tech Stack:** Three.js, TypeScript, Vite, Playwright E2E (`scripts/e2e/*.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-26-island-expansion-design.md` (section "The map", stage 1)

## Global Constraints

- Keep every existing world coordinate: heights at existing quest spots stay within ±0.15 of the baseline below.
- `AGENTS.md`: `frustumCulled = false` on island-wide instanced meshes; clamp `pow()` bases; additive glows `fog: false`; files ≤ ~500 lines; `Game.ts` ≤ ~550 lines.
- Text German for a 7-year-old (signposts).
- Keep ~60 fps on the Mac: E2E asserts ≥ 50 fps in the densest new region.
- No commits unless the user asks (user rule). No new npm dependencies.
- `npx tsc --noEmit -p .` clean after every task.
- Dev server for E2E: `npx vite --port 5199` (runs from the worktree).

Baseline heights (measured on `main` before any change, `hf.heightAt`):

```js
const BASELINE = {"spawn":[-66,47,0.21],"sign":[-62.6,43.6,1.043],"volcanoGate":[-56,14,3.018],"tablet0":[-14,-9,3.755],"tablet1":[17,-9,3.33],"tablet2":[2,19,2.765],"cave":[-60,-18.5,2.127],"forestGate":[-12,26,3.763],"ogreGate":[38,0,2.571],"ogreBack":[53.5,0.5,2.651],"elder":[65,37,2.406],"plaza":[64,44,2.124],"mountainGate":[55.5,-13.5,2.927],"northDockEnd":[-36,-76,-15.4],"lake":[2,2,-2.6],"jonasBack":[61.9,42.8,2.175]};
```

## Review Focus

1. Walking from the old island into each new region: no invisible walls, no un-walkable seams where the lobes meet the old coast (a child just walks south and should arrive).
2. The old landing pier (`spawnPierEnd` (-84, 66)) and north pier must still end over water — the swamp lobe must not turn the bay into land.
3. Night/NaN safety: new shader code must not produce NaN (black screen with bloom) — screenshot brightness check in every region.
4. The river stays a barrier except at the ford and the bridge; the ford is wadeable (Tadeo is never stuck in water).
5. Old challenges that reuse the island mapping (`challenges/volcano/kit/stage.ts` uses `WORLD_HALF`/`HF_N`) still look right after the world grows — run `volcano.mjs` and `mountain.mjs`.

---

### Task 1: Bigger world, lobes, region weights, palettes

**Files:**
- Create: `src/world/regions.ts`
- Modify: `src/world/layout.ts` (WORLD_HALF, LOBES, SPOTS, RIVER, PATHS)
- Modify: `src/world/Heightfield.ts` (coast from `coastDistance`, region shaping, region texture, `regionAt`)
- Modify: `src/world/Terrain.ts` (`WorldUniforms.uRegionTex`, region palette in `grassColor` and sand)
- Modify: `src/world/Grass.ts` (pass region weights to `grassColor`)
- Modify: `src/world/Island.ts` (add `uRegionTex` uniform)
- Modify: any other `WorldUniforms` literal (grep `uMaskTex:`; e.g. challenge stages) to include `uRegionTex`
- Test: `scripts/e2e/world.mjs` (create)

**Interfaces:**
- Produces (layout.ts):
  - `WORLD_HALF = 175`
  - `export type RegionName = "lagoon" | "jungle" | "swamp" | "hills"`
  - `export const LOBES: Record<RegionName, { c: P2; rx: number; rz: number }>` — starting values (tune visually): lagoon `(90, 86) 40×32`, jungle `(2, 104) 50×34`, swamp `(-56, 96) 30×24`, hills `(128, 4) 34×44`
  - `export const SPOTS: { lagoonBeach: P2; lagoonJetty: P2; lagoonJettyEnd: P2; lagoonWater: P2; ford: P2; jungleRuin: P2; junglePool: P2; swampPond: P2; frogIslet: P2; windmill: P2 }` (tuned visually; `lagoonWater` is a point inside the shallow lagoon)
  - `RIVER` extended past `[34, 86]` south to the new coast (mouth between jungle and lagoon)
- Produces (regions.ts):
  - `export const REGION_INDEX: Record<RegionName, 0 | 1 | 2 | 3>` = lagoon 0, jungle 1, swamp 2, hills 3
  - `export function coastDistance(x: number, z: number): number` — smooth-min (k ≈ 0.12) of the normalised ellipse distances of `ISLAND` and all `LOBES` (1.0 = coast before noise)
  - `export function regionWeights(x: number, z: number, noise: Noise2D, out: [number, number, number, number]): void` — each in 0..1, `smoothstep(1.0, 0.65, lobeDistance + fbm·0.1)`, 0 on the old island
  - `export function shapeRegions(h: number, x: number, z: number, noise: Noise2D): number` — region height shaping: lagoon low beach (0.5–1.3) with a shallow lagoon basin (−0.3 … −1.1) at `SPOTS.lagoonWater` open to the sea; jungle hilly (2–7) with a pool at `SPOTS.junglePool`; swamp flat (0.3–1.0) with wadeable puddles (≥ −0.4) and a deeper pond (−1.2) at `SPOTS.swampPond` around a dry islet at `SPOTS.frogIslet`; hills rolling (3–12, slopes < 0.7) peaking at `SPOTS.windmill`
- Produces (Heightfield.ts): `regionTexture: THREE.DataTexture` (RGBA8, same grid) and `regionAt(x: number, z: number, r: 0 | 1 | 2 | 3): number`; the river bed at `SPOTS.ford` (radius ~5) is raised to −0.3 so it is wadeable
- Produces (Terrain.ts / HF_GLSL): `uniform sampler2D uRegionTex; vec4 hfRegion(vec2 xz)`; `grassColor(vec2 xz, float forest, vec4 region)`
- Palettes (add to `TERRAIN_COLORS`): `lagoonSand #fff3d6`, `jungle #1f7a3a`, `jungleLight #49a83a`, `swamp #6b7a3a`, `swampMud #5a4a32`, `hills #8fcf4a`, `hillsLight #c8e46a`

- [ ] **Step 1: Write the failing E2E** `scripts/e2e/world.mjs` (same harness style as `island.mjs`: Chrome, metal flags, `check()`, `summary.json`, screenshots to `scripts/e2e/out/world/`). Checks:
  - `old spots unchanged`: for every `BASELINE` entry, `|hf.heightAt(x,z) − h| ≤ 0.15`
  - `piers still over water`: `hf.heightAt(-84, 66) < -0.5` and `hf.heightAt(-36, -76) < -5`
  - for each region `r` in lagoon, jungle, swamp, hills: `hf.regionAt(LOBES[r].c) > 0.8` (read `LOBES` via `window.game`-reachable import is not possible → hard-code the four centres in the test)
  - `lagoon is shallow water`: `-1.2 < heightAt(SPOTS.lagoonWater) < -0.2`
  - `ford is wadeable`: `island.island.hf.isWalkable(...SPOTS.ford)` is true and the river 12 units north of the ford is not walkable
  - `world is bigger`: count walkable cells on a 2-unit grid over ±175 — at least 1.6× the count over the old world (hard-code old count measured in step 2)
  - top-down screenshot `00_map.png` via `?cam=0,420,60,10,0,10`
  - no console errors
- [ ] **Step 2: Run it to make sure it fails** — `node scripts/e2e/world.mjs`; expected: region checks fail (`regionAt` is not a function). Record the old walkable-cell count printed by the test and hard-code it.
- [ ] **Step 3: Implement** layout, regions, heightfield, terrain and grass changes as listed in Interfaces. `HF_N` = 641 (cell ≈ 0.547). Region palettes: lagoon → whiter sand + brighter sand line; jungle → `mix(grass, jungle…)` darker and more saturated; swamp → olive grass, mud near water (h < 0.6); hills → bright lime with `hillsLight` patches.
- [ ] **Step 4: Run it to make sure it passes** — `node scripts/e2e/world.mjs`; expected: all ✔. Look at `00_map.png`: four lobes visible, smooth coast, lagoon turquoise.
- [ ] **Step 5: Regression** — `npx tsc --noEmit -p .` clean; `node scripts/e2e/island.mjs`, `node scripts/e2e/volcano.mjs`, `node scripts/e2e/mountain.mjs` pass.

### Task 2: Region plants

**Files:**
- Create: `src/world/models/regionFlora.ts`
- Modify: `src/world/Vegetation.ts` (species, `pick()` per region, KEEP_OUT for `SPOTS`, water placement for lily pads)
- Test: `scripts/e2e/world.mjs` (add checks)

**Interfaces:**
- Consumes: `hf.regionAt`, `SPOTS`, `LOBES` (Task 1); `FloraModel`, `part/merge/displace/softNormals/gradient` (existing `flora.ts`, `core/geo.ts`)
- Produces (regionFlora.ts), each `(seed: number) => FloraModel` in the existing chunky toon style: `bamboo`, `bigLeaf` (banana/monstera, double-sided leaves), `fern`, `giantFlower`, `hibiscus`, `mangrove`, `reeds`, `lilyPad` (flat, sits on the water at y = 0.02, no collider), `flowerPatch` (low colourful clump, no collider), `lightTree` (rounder, paler canopy for the hills)

- [ ] **Step 1: Add failing checks** to `world.mjs`: `regional plants exist` — the vegetation group (`window.game.island.island.scene` → find `InstancedMesh`es) has instances of every new species (name meshes `flora:<species>`), and `lily pads float` — all `lilyPad` instance y positions are within 0.05 of 0.
- [ ] **Step 2: Run** — expected FAIL (species missing).
- [ ] **Step 3: Implement** models and `pick()` rules: lagoon → palms, hibiscus, beach grass (`reeds` tinted light); jungle → bamboo groves, bigLeaf, fern, giantFlower, few `tree`; swamp → mangrove at the water edge, reeds, lilyPad on pond water (h between −1.4 and −0.2), deadTree rare; hills → lightTree groves, flowerPatch fields, bush. Region rules run before the old meadow rules, weighted by `regionAt` so borders blend. Name every `InstancedMesh` `flora:<species>`; set `frustumCulled = false` on the new ones (island-wide).
- [ ] **Step 4: Run** — `node scripts/e2e/world.mjs` all ✔; add ground-level screenshots `10_lagoon.png`, `11_jungle.png`, `12_swamp.png`, `13_hills.png` (via `?spawn=x,z&notitle`, wait 4 s) and look at them.
- [ ] **Step 5: fps** — add check `jungle runs smoothly (≥ 50 fps)` measured like `island.mjs` (rAF count over 3 s) at the jungle spawn.

### Task 3: Region landmarks, paths, ford stones, signposts

**Files:**
- Create: `src/world/models/regionSites.ts` (lagoon jetty + boat + beach huts, jungle ruin + pool rocks, swamp frog islet, hills windmill with turning sails, ford stepping stones)
- Modify: `src/world/Landmarks.ts` (call the builders)
- Modify: `src/world/layout.ts` (`PATHS`: village ↔ lagoon, village ↔ hills, village ↔ ford ↔ lake ring, ford ↔ jungle ↔ swamp ↔ old cove)
- Modify: `src/world/models/eastSites.ts` `buildSignposts` (new signs at the new junctions: "Lagune", "Dschungel", "Sumpf", "Windmühle", "Dorf")
- Modify: `src/game/Coins.ts` KEEP_CLEAR only if a coin lands on a new landmark (coins keep `COIN_COUNT = 30` in stage 1)
- Test: `scripts/e2e/world.mjs`

**Interfaces:**
- Consumes: `SPOTS`, `LandmarkContext` (`site`, `deck`, `boat`, `animate`), `Site.put/block`, existing model helpers in `models/shapes.ts`, `models/props.ts`, `models/boats.ts`
- Produces: walkable decks for the lagoon jetty and each ford stone (stone tops 0.35 above water); `boat("lagoon", …)`; windmill sails animated via `ctx.animate`

- [ ] **Step 1: Add failing checks**: `lagoon jetty walkable` — `island.surfaceHeight` at `SPOTS.lagoonJettyEnd` is non-null; `ford stones walkable` — `surfaceHeight` at `SPOTS.ford` non-null; `windmill turns` — mesh named `windmill:sails` rotation changes over 1 s; `walk village → lagoon` and `walk village → ford → lake` with `walkTo` (copy the helper from `island.mjs`) each succeed within 25 s.
- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Implement** builders and paths. Stepping stones: 6–8 flat round stones across the ford, ~1.1 apart, each a short deck. Windmill: stone tower + cap + four cloth sails on a hub mesh named `windmill:sails` (separate object added with `ctx.add`, rotated in `ctx.animate`).
- [ ] **Step 4: Run** — all ✔; screenshots `20_jetty.png`, `21_ford.png`, `22_windmill.png`, `23_ruin.png`, `24_frog_islet.png`; look at them.

### Task 4: Region animals and ambience

**Files:**
- Create: `src/world/ambient/regionCritterModels.ts` (turtle, frog, sheep, parrot, dolphin geometries tagged with `tagPart`)
- Modify: `src/world/ambient/critterAnims.ts` (TURTLE_ANIM, FROG_ANIM, SHEEP_ANIM, PARROT_ANIM, DOLPHIN_ANIM)
- Create: `src/world/ambient/Turtles.ts`, `Frogs.ts`, `Sheep.ts`, `Dolphins.ts` (behaviour like `Crabs.ts`/`Rabbits.ts`: spawn near focus inside their region via `findSpot` + `hf.regionAt`, recycle when far, shy away from the player)
- Modify: `src/world/Ambient.ts` (create/update them; parrots = colourful `Birds` variant limited to the jungle; fireflies over the swamp pond and mist in the jungle reuse existing systems)
- Test: `scripts/e2e/world.mjs`

**Interfaces:**
- Consumes: `CritterMesh`, `findSpot`, `rnd`, `hf.regionAt`, `SPOTS`
- Produces: `class Turtles|Frogs|Sheep|Dolphins { readonly object: THREE.Object3D; update(dt: number, time: number, focus: THREE.Vector3): void }`; each CritterMesh named `turtles`, `frogs`, `sheep`, `dolphins`, `parrots`

- [ ] **Step 1: Add failing checks**: for each region spawn, after 3 s the matching critter mesh has ≥ 2 visible instances near the player (turtles at the lagoon beach, frogs at the swamp, sheep on the hills, parrots in the jungle, dolphins seen from the lagoon jetty).
- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Implement** the species. Behaviours: turtles plod slowly on sand and sometimes into the shallows; frogs hop in short arcs near water; sheep graze and wander slowly; parrots fly loops between tree tops; dolphins jump in arcs offshore of the lagoon.
- [ ] **Step 4: Run** — all ✔; region screenshots retaken; fps check still ≥ 50.

### Task 5: Title view, docs, full regression

**Files:**
- Modify: `src/game/Game.ts` `titleScreen()` orbit (radius and centre to frame the bigger island; numbers only)
- Modify: `README.md` (regions, `world.mjs`), `CHANGELOG.md` (Unreleased), `AGENTS.md` (E2E list gains `world`; note `world/regions.ts` owns the lobes)
- Modify: `scripts/e2e/all.mjs` (add `world`)

- [ ] **Step 1:** Widen the title orbit; screenshot the title via `?` (no params) and look at it.
- [ ] **Step 2:** Update docs.
- [ ] **Step 3: Full regression** — `npx tsc --noEmit -p .` clean; run every E2E: `world, island, volcano, cave, forest, ogre, village, mountain, sea, treasure, fishing, hens`; all pass; summaries in `scripts/e2e/out/<name>/summary.json`.
- [ ] **Step 4:** Report to the user with the map screenshot and the region screenshots; ask whether to commit.
