# Changelog

## Unreleased

### Changed

- New voices: every line is now recorded once with ElevenLabs and shipped as an MP3 in `public/voices/`, so the
  game speaks the same on any static host. `npm run voices` renders new or changed lines. This replaces the local
  Piper voice server, and the game no longer needs `uv`
- The game draws at most 60 frames a second, so 120 Hz screens no longer keep the graphics chip flat out
- The voice now says a fixed sentence for the three lines with a changing value (fishing length, hen times); the
  exact number still appears on screen

### Added

- A bigger island: four new regions grow out of the old coast, each with its own ground, plants and paths
  - Lagune: a sandy bay with a jetty, beach huts, sea turtles that pull in their heads, and a pod of
    dolphins leaping offshore
  - Dschungel: bamboo, giant leaves and mist around an old stone ruin with a pool; parrots loop over the
    tree tops
  - Sumpf: mangroves, puddles and a pond with a frog islet, a plank boardwalk to the old beach, croaking
    frogs and a cloud of fireflies
  - Blumenhügel: rolling flower meadows with a windmill, beehives and grazing sheep (one is black)
- Stepping stones across the river west of the village, new paths and signposts to every region
- Fish and dragonflies at the lagoon and the swamp pond
- `scripts/e2e/world.mjs`: walks every region path and checks landmarks, animals and fps

### Changed

- The title flyover circles wider to show the whole island
- Tadeo wears his hair with a soft fringe instead of spikes
- His companion is now Henni, a brown speckled hen with a red neckerchief (replaces Pico the parrot):
  she runs after Tadeo, pecks about, flutters onto his head when he rests or wades, and helps in the
  side games
- Ogre fight: the "Verteidigen" card is gone; each swing of the ogre is blocked by pressing Space when
  the shield ring turns green (too early shows "Zu früh!"), and blocks charge the special
- Mia's speckled hen is called Hilde now (Henni is Tadeo's hen)

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
