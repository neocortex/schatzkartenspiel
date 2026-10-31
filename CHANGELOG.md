# Changelog

## Unreleased

### Story rethink

The adventure is one story now: the volcano's heart, the Feuerherz, was stolen, and every place and object on the
island has a reason. A 7-year-old can retell it: "Der Vulkan hat ein Herz. Ein Pirat hat es gestohlen. Ich habe vier
Sachen gefunden und das Herz zurückgebracht. Und der Pirat war Paco!"

- Twelve quests instead of ten. The first is a cutscene; the village is visited twice (the elder's legend, then the
  key); the lake, the shark and the finale are new or rebuilt. The HUD counts "von 12"
- The opening: Tadeo finds a bottle with a treasure map (the map card), a shark smashes his boat, and a voice calls
  from the volcano. The map card comes back in quests 3 and 11
- The volcano shows what the eruptions did: about half as many rocks, two of the three bridges are broken and
  crossed by jumping from rock to rock, and Paco lies trapped beside the old stone with the empty heart-shaped
  hollow. Käpt'n Paco replaces Opa Kalle, with his own look and voice
- The lake: three tablets ask riddles, and the Hüter (replaces the Geist, with a real portrait) rises and tells the
  rhyme of the four things
- The cave is a natural cave with a hungry mole (Maulwurf) and painted clues for the crystals, instead of the mine
  with levers and gates
- The island follows the story (`game/StoryWorld.ts`): the thorn hedge stands until the sword opens it, the boulder
  stays on the mountain trail until the ogre lifts it, Tadeo's wreck becomes his mended boat at the north dock, Paco
  is away until the village quest and waits at the dock for the crossing, and the volcano rumbles harder after every
  finished quest
- The ogre fights because the heart is gone, and becomes a friend after he eats a berry
- The shark is calmed by three berries thrown into its open mouth, not by the hammer. The hammer is only for the
  chest's Zaubereis. The sea trail is glowing starfish
- The chest also holds the Feuerherz, a plan and Paco's note signed "P."
- The last quest brings the heart home through the volcano at full rock rate, then the whole island celebrates a
  night festival where Paco owns up, before the end card
- Chuleta's hints and cheers, the quest names and the save format (version 4, so old saves start over) follow the new
  order. "Schatzinsel" now means only the small island
- Every new or changed line has at most 14 words, and a conversation at most 5 lines (the legend, the lake rhyme and
  the festival are longer). 159 new recordings, including the new speakers Paco, Stimme, Maulwurf and Hüter
- `scripts/e2e/finale.mjs` plays the last quest through the festival; `voices.mjs` also checks that every line in the
  source has a recording
- Lettered signs are gone outside the village (signposts, "ZIEL", the ogre's toll board, "Höhle", "Zauberwald"):
  the golden star, the compass and Chuleta's hints do the guiding

### Changed

- Tadeo's hen is called Chuleta now (she was Henni)
- Tadeo's fringe sits higher, in a soft open arch, so it no longer covers his brows or makes him look angry
- New voices: every line is now recorded once with ElevenLabs and shipped as an MP3 in `public/voices/`, so the
  game speaks the same on any static host. `npm run voices` renders new or changed lines. This replaces the local
  Piper voice server, and the game no longer needs `uv`
- The game draws at most 60 frames a second, so 120 Hz screens no longer keep the graphics chip flat out
- Rendering uses at most 1.25× pixel density and 2× multisample anti-aliasing to reduce GPU load
- The voice now says a fixed sentence for the three lines with a changing value (fishing length, hen times); the
  exact number still appears on screen

### Added

- The game is published to GitHub Pages at <https://tadeo.fun> on every push to `main`
- A bigger island: four new regions grow out of the old coast, each with its own ground, plants and paths
  - Lagune: a sandy bay with a jetty, beach huts, sea turtles that pull in their heads, and a pod of
    dolphins leaping offshore
  - Dschungel: bamboo, giant leaves and mist around an old stone ruin with a pool; parrots loop over the
    tree tops
  - Sumpf: mangroves, puddles and a pond with a frog islet, a plank boardwalk to the old beach, croaking
    frogs and a cloud of fireflies
  - Blumenhügel: rolling flower meadows with a windmill, beehives and grazing sheep (one is black)
- Stepping stones across the river west of the village, new paths to every region
- Fish and dragonflies at the lagoon and the swamp pond
- `scripts/e2e/world.mjs`: walks every region path and checks landmarks, animals and fps

### Changed

- The title flyover circles wider to show the whole island
- Tadeo wears his hair with a soft fringe instead of spikes
- His companion is now Chuleta, a brown speckled hen with a red neckerchief (replaces Pico the parrot):
  she runs after Tadeo, pecks about, flutters onto his head when he rests or wades, and helps in the
  side games
- Ogre fight: the "Verteidigen" card is gone; each swing of the ogre is blocked by pressing Space when
  the shield ring turns green (too early shows "Zu früh!"), and blocks charge the special
- Mia's speckled hen is called Hilde now (Chuleta is Tadeo's hen)

### Fixed

- Classic 2D game keeps its own save, mute and narrator settings, so a 3D save on the same localhost
  port no longer drops Tadeo into the sea at the start

## 2.0.0

The game is rebuilt in 3D with Three.js (the Phaser 2D version is kept in `classic-2d/`).

### Added

- 3D island overworld with shader water, grass, vegetation, landmarks, ambient life and post-processing
- Toon characters (Tadeo, villagers, elder, wise ones) and Pico the parrot as a flying sidekick with hints
- Ten 3D challenge scenes: volcano, cave, forest, ogre battle, village festival, mountain climb,
  sea crossing with the shark, treasure island finale
- Side games in the village: fishing with Fischer Jonas, catching Kleine Mia's hens (prize hats)
- 30 gold coins with outfit unlocks (straw hat, pirate hat, sunglasses)
- Island cameos: the ogre guards the bridge (and later waves as a friend), a shark fin circles the north pier
- Title screen with island flyover, intro flight, quest beacon, compass arrow and world prompts
- Local neural German voices (Piper TTS via `uv`) with per-character voices; browser speech fallback
- End-to-end tests for the island and every challenge (`scripts/e2e/`)

### Removed

- Phaser and the 2D scenes, sprites and turn-based combat system

## 1.0.0

- Original 2D pixel-art version (Phaser 3)
