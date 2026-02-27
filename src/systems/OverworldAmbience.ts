/**
 * Overworld ambience: scatter decorations, animated tiles, ambient creatures, village NPCs.
 * All functions are called from OverworldScene during create/buildTilemap.
 */

import { TILE_SIZE, MAP_COLS, MAP_ROWS, TILES, DEPTH } from "../config";

// ---------------------------------------------------------------------------
// DETERMINISTIC HASH — consistent scatter across scene re-entries
// ---------------------------------------------------------------------------

function tileHash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

function isGrass(tile: number): boolean {
  return tile === TILES.GRASS || tile === TILES.GRASS_ALT;
}

// ---------------------------------------------------------------------------
// SCATTER DECORATIONS — replace grass tiles with flowers, rocks, etc.
// ---------------------------------------------------------------------------

export function scatterDecorations(
  map: Phaser.Tilemaps.Tilemap,
  mapData: number[][],
): void {
  for (let y = 1; y < MAP_ROWS - 1; y++) {
    for (let x = 1; x < MAP_COLS - 1; x++) {
      if (!isGrass(mapData[y][x])) continue;
      // Only scatter if all 4 cardinal neighbors are grass (avoids region edges)
      if (
        !isGrass(mapData[y - 1][x]) ||
        !isGrass(mapData[y + 1][x]) ||
        !isGrass(mapData[y][x - 1]) ||
        !isGrass(mapData[y][x + 1])
      ) continue;

      // ~8% density
      if (tileHash(x, y, 42) % 100 >= 8) continue;

      const type = tileHash(x, y, 99) % 100;
      let newTile: number;
      if (type < 10) newTile = TILES.FLOWER_RED;
      else if (type < 20) newTile = TILES.FLOWER_YELLOW;
      else if (type < 30) newTile = TILES.FLOWER_PURPLE;
      else if (type < 55) newTile = TILES.SMALL_ROCK;
      else if (type < 70) newTile = TILES.MUSHROOM;
      else newTile = TILES.TALL_GRASS;

      map.putTileAt(newTile, x, y);
    }
  }
}

// ---------------------------------------------------------------------------
// ANIMATED TILES — swap water/lava frames for shimmer effect
// ---------------------------------------------------------------------------

export function setupAnimatedTiles(
  scene: Phaser.Scene,
  map: Phaser.Tilemaps.Tilemap,
): void {
  const layer = map.getLayer(0)!.tilemapLayer;
  let waterFrame = 0;
  let lavaFrame = 0;

  scene.time.addEvent({
    delay: 800,
    loop: true,
    callback: () => {
      if (waterFrame === 0) {
        map.replaceByIndex(TILES.WATER, TILES.WATER_ALT, undefined, undefined, undefined, undefined, layer);
        waterFrame = 1;
      } else {
        map.replaceByIndex(TILES.WATER_ALT, TILES.WATER, undefined, undefined, undefined, undefined, layer);
        waterFrame = 0;
      }
    },
  });

  scene.time.addEvent({
    delay: 600,
    loop: true,
    callback: () => {
      if (lavaFrame === 0) {
        map.replaceByIndex(TILES.LAVA, TILES.LAVA_ALT, undefined, undefined, undefined, undefined, layer);
        lavaFrame = 1;
      } else {
        map.replaceByIndex(TILES.LAVA_ALT, TILES.LAVA, undefined, undefined, undefined, undefined, layer);
        lavaFrame = 0;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// VILLAGE NPCs — decorative characters standing in the village
// ---------------------------------------------------------------------------

export function spawnVillageNPCs(scene: Phaser.Scene): void {
  const positions = [
    { x: 62 * TILE_SIZE + 8, y: 48 * TILE_SIZE + 8, variant: 0 },
    { x: 66 * TILE_SIZE + 8, y: 50 * TILE_SIZE + 8, variant: 1 },
    { x: 69 * TILE_SIZE + 8, y: 48 * TILE_SIZE + 8, variant: 2 },
  ];

  for (const pos of positions) {
    const npc = scene.add
      .sprite(pos.x, pos.y, "npc", pos.variant)
      .setDepth(DEPTH.ENTITIES);

    scene.tweens.add({
      targets: npc,
      y: pos.y - 1,
      duration: 1200 + pos.variant * 200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }
}

// ---------------------------------------------------------------------------
// AMBIENT CREATURES — birds, butterflies, fish
// ---------------------------------------------------------------------------

export function spawnAmbientCreatures(
  scene: Phaser.Scene,
  mapData: number[][],
): void {
  spawnBirds(scene);
  spawnButterflies(scene, mapData);
  spawnFish(scene, mapData);
}

function spawnBirds(scene: Phaser.Scene): void {
  for (let i = 0; i < 2; i++) {
    const bird = scene.add
      .sprite(-20, 100 + i * 200, "creature_bird", 0)
      .setDepth(DEPTH.EFFECTS)
      .setVisible(false);

    // Wing flap
    scene.time.addEvent({
      delay: 300,
      loop: true,
      callback: () => {
        if (!bird.visible) return;
        bird.setFrame(bird.frame.name === "0" ? 1 : 0);
      },
    });

    // Periodic flight across the map
    const launchBird = () => {
      const startY = Phaser.Math.Between(80, MAP_ROWS * TILE_SIZE - 200);
      bird.setPosition(-20, startY).setVisible(true);
      scene.tweens.add({
        targets: bird,
        x: MAP_COLS * TILE_SIZE + 30,
        y: startY + Phaser.Math.Between(-60, 60),
        duration: 8000,
        ease: "Linear",
        onComplete: () => {
          bird.setVisible(false);
          scene.time.delayedCall(Phaser.Math.Between(6000, 14000), launchBird);
        },
      });
    };

    scene.time.delayedCall(Phaser.Math.Between(2000, 8000) + i * 4000, launchBird);
  }
}

function spawnButterflies(scene: Phaser.Scene, mapData: number[][]): void {
  // Find flower positions for butterfly placement
  const flowerPositions: { x: number; y: number }[] = [];
  for (let y = 0; y < MAP_ROWS && flowerPositions.length < 20; y++) {
    for (let x = 0; x < MAP_COLS && flowerPositions.length < 20; x++) {
      const t = mapData[y][x];
      if (t === TILES.FLOWER_RED || t === TILES.FLOWER_YELLOW || t === TILES.FLOWER_PURPLE) {
        flowerPositions.push({ x: x * TILE_SIZE + 8, y: y * TILE_SIZE + 4 });
      }
    }
  }

  // Pick up to 3 flower spots for butterflies
  const count = Math.min(3, flowerPositions.length);
  for (let i = 0; i < count; i++) {
    const idx = tileHash(i, 0, 77) % flowerPositions.length;
    const fp = flowerPositions[idx];

    const bf = scene.add
      .sprite(fp.x, fp.y, "creature_butterfly", 0)
      .setDepth(DEPTH.EFFECTS);

    // Wing flap
    scene.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => bf.setFrame(bf.frame.name === "0" ? 1 : 0),
    });

    // Gentle drift
    const drift = () => {
      scene.tweens.add({
        targets: bf,
        x: fp.x + Phaser.Math.Between(-14, 14),
        y: fp.y + Phaser.Math.Between(-10, 10),
        duration: Phaser.Math.Between(2000, 4000),
        ease: "Sine.easeInOut",
        onComplete: drift,
      });
    };
    drift();

    // Alpha pulse
    scene.tweens.add({
      targets: bf,
      alpha: { from: 0.6, to: 1 },
      duration: 1200 + i * 300,
      yoyo: true,
      repeat: -1,
    });
  }
}

function spawnFish(scene: Phaser.Scene, mapData: number[][]): void {
  // Find a water tile in the lake area for fish jumping
  const lakeWater: { x: number; y: number }[] = [];
  for (let y = 28; y <= 34; y++) {
    for (let x = 36; x <= 44; x++) {
      if (mapData[y][x] === TILES.WATER) {
        lakeWater.push({ x: x * TILE_SIZE + 8, y: y * TILE_SIZE + 8 });
      }
    }
  }
  if (lakeWater.length === 0) return;

  const fish = scene.add
    .sprite(0, 0, "creature_fish")
    .setDepth(DEPTH.EFFECTS)
    .setVisible(false);

  const doJump = () => {
    const spot = lakeWater[Phaser.Math.Between(0, lakeWater.length - 1)];
    fish.setPosition(spot.x, spot.y).setVisible(true).setAlpha(1);

    // Arc jump
    scene.tweens.add({
      targets: fish,
      y: spot.y - 12,
      duration: 400,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => {
        // Splash particles
        for (let i = 0; i < 4; i++) {
          const drop = scene.add
            .rectangle(spot.x + Phaser.Math.Between(-4, 4), spot.y, 1, 1, 0xbbdefb)
            .setDepth(DEPTH.EFFECTS);
          scene.tweens.add({
            targets: drop,
            y: spot.y - Phaser.Math.Between(3, 8),
            alpha: 0,
            duration: 400,
            onComplete: () => drop.destroy(),
          });
        }
        fish.setVisible(false);
        scene.time.delayedCall(Phaser.Math.Between(5000, 10000), doJump);
      },
    });
  };

  scene.time.delayedCall(3000, doJump);
}
