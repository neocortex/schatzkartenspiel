# Changelog

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
