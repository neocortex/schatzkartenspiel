/**
 * Decoration tile drawing and creature sprite generation.
 * Extends the tileset with flowers, rocks, mushrooms, tall grass,
 * and alternate water/lava frames for animation.
 */

import { TILE_SIZE, COLORS } from "../config";
import { px, rect, makeCanvas } from "./SpriteFactory";

type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------------------
// DECORATION TILES (indices 24-31, drawn onto the shared tileset canvas)
// ---------------------------------------------------------------------------

/** Draw decoration tiles 24-31 onto the tileset canvas context. */
export function drawDecorationTiles(ctx: Ctx): void {
  drawFlowerTile(ctx, 24, COLORS.FLOWER_RED, COLORS.FLOWER_CENTER);
  drawFlowerTile(ctx, 25, COLORS.FLOWER_YELLOW, 0xffffff);
  drawFlowerTile(ctx, 26, COLORS.FLOWER_PURPLE, COLORS.FLOWER_CENTER);
  drawSmallRockTile(ctx, 27);
  drawMushroomTile(ctx, 28);
  drawTallGrassTile(ctx, 29);
  drawWaterAltTile(ctx, 30);
  drawLavaAltTile(ctx, 31);
}

function drawFlowerTile(ctx: Ctx, index: number, petalColor: number, centerColor: number): void {
  const ox = index * TILE_SIZE;
  // Grass base
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.GRASS_LIGHT);
  for (let i = 0; i < 4; i++) {
    px(ctx, ox + ((i * 5 + 2) % 15), (i * 7 + 3) % 15, COLORS.GRASS_DARK);
  }
  // Stem
  px(ctx, ox + 7, 10, COLORS.TREE_LEAVES);
  px(ctx, ox + 7, 11, COLORS.TREE_LEAVES);
  px(ctx, ox + 7, 12, COLORS.TREE_LEAVES);
  // Leaf on stem
  px(ctx, ox + 8, 11, COLORS.TREE_LEAVES);
  // Petals (3x3 cross pattern)
  px(ctx, ox + 7, 7, petalColor);
  px(ctx, ox + 6, 8, petalColor);
  px(ctx, ox + 7, 8, centerColor);
  px(ctx, ox + 8, 8, petalColor);
  px(ctx, ox + 7, 9, petalColor);
  // Extra petal detail for larger flowers
  px(ctx, ox + 6, 7, petalColor, 0.6);
  px(ctx, ox + 8, 7, petalColor, 0.6);
}

function drawSmallRockTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  // Grass base
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.GRASS_LIGHT);
  for (let i = 0; i < 4; i++) {
    px(ctx, ox + ((i * 5 + 2) % 15), (i * 7 + 3) % 15, COLORS.GRASS_DARK);
  }
  // Rock body — irregular rounded shape
  rect(ctx, ox + 5, 9, 7, 4, COLORS.STONE);
  rect(ctx, ox + 6, 8, 5, 1, COLORS.STONE);
  rect(ctx, ox + 6, 13, 5, 1, COLORS.STONE);
  // Highlight on top
  px(ctx, ox + 6, 9, 0xbdbdbd);
  px(ctx, ox + 7, 9, 0xbdbdbd);
  // Shadow on bottom
  rect(ctx, ox + 6, 12, 5, 1, COLORS.STONE_DARK);
  // Crack
  px(ctx, ox + 8, 10, COLORS.STONE_DARK);
  px(ctx, ox + 9, 11, COLORS.STONE_DARK);
}

function drawMushroomTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  // Grass base
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.GRASS_LIGHT);
  for (let i = 0; i < 4; i++) {
    px(ctx, ox + ((i * 5 + 2) % 15), (i * 7 + 3) % 15, COLORS.GRASS_DARK);
  }
  // Stem
  rect(ctx, ox + 7, 11, 2, 3, COLORS.MUSHROOM_STEM);
  // Cap
  rect(ctx, ox + 5, 8, 6, 3, COLORS.MUSHROOM_CAP);
  rect(ctx, ox + 6, 7, 4, 1, COLORS.MUSHROOM_CAP);
  // White spots on cap
  px(ctx, ox + 6, 8, COLORS.MUSHROOM_SPOT);
  px(ctx, ox + 9, 9, COLORS.MUSHROOM_SPOT);
  // Shadow under cap
  px(ctx, ox + 6, 11, COLORS.STONE_DARK, 0.3);
  px(ctx, ox + 9, 11, COLORS.STONE_DARK, 0.3);
}

function drawTallGrassTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  // Darker grass base
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.GRASS_DARK);
  // Dense tall blades
  const bladeColor = COLORS.TREE_LEAVES;
  const lightBlade = COLORS.TREE_LEAVES_LIGHT;
  for (let i = 0; i < 8; i++) {
    const bx = ox + 1 + (i * 2);
    const bh = 3 + (i % 3);
    const color = i % 3 === 0 ? lightBlade : bladeColor;
    for (let j = 0; j < bh; j++) {
      px(ctx, bx, 12 - bh + j, color);
    }
  }
  // A few extra accent pixels
  px(ctx, ox + 3, 8, lightBlade);
  px(ctx, ox + 11, 7, lightBlade);
}

function drawWaterAltTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.WATER_LIGHT);
  // Shifted wave highlights (offset by 2 from original for animation frame)
  for (let y = 0; y < 14; y += 4) {
    for (let x = 0; x < 12; x += 3) {
      px(ctx, ox + x + ((y + 2) % 3), y + 2, COLORS.WATER_DARK);
      px(ctx, ox + x + ((y + 2) % 3) + 1, y + 2, COLORS.WATER_DARK);
    }
  }
  // Extra shimmer
  px(ctx, ox + 5, 5, 0xbbdefb, 0.5);
  px(ctx, ox + 12, 10, 0xbbdefb, 0.5);
}

function drawLavaAltTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.LAVA);
  // Shifted glow spots (offset from original)
  for (let i = 0; i < 8; i++) {
    const lx = ox + ((i * 3 + 3) % 14);
    const ly = (i * 5 + 4) % 14;
    px(ctx, lx, ly, COLORS.LAVA_GLOW);
    px(ctx, lx + 1, ly, COLORS.LAVA_GLOW);
    px(ctx, lx, ly + 1, 0xffcc02);
  }
}

// ---------------------------------------------------------------------------
// CREATURE SPRITES
// ---------------------------------------------------------------------------

/** Generate small creature sprite textures (bird, butterfly, fish). */
export function generateCreatureSprites(scene: Phaser.Scene): void {
  generateBirdSprite(scene);
  generateButterflySprite(scene);
  generateFishSprite(scene);
}

function generateBirdSprite(scene: Phaser.Scene): void {
  const w = 8;
  const h = 8;
  const [canvas, ctx] = makeCanvas(w * 2, h);

  // Frame 0: wings up
  let ox = 0;
  px(ctx, ox + 1, 2, 0x3e2723);
  px(ctx, ox + 6, 2, 0x3e2723);
  px(ctx, ox + 2, 3, 0x3e2723);
  px(ctx, ox + 5, 3, 0x3e2723);
  px(ctx, ox + 3, 4, 0x5d4037);
  px(ctx, ox + 4, 4, 0x5d4037);
  px(ctx, ox + 3, 5, 0x5d4037);
  px(ctx, ox + 4, 5, 0x5d4037);

  // Frame 1: wings down
  ox = w;
  px(ctx, ox + 3, 2, 0x5d4037);
  px(ctx, ox + 4, 2, 0x5d4037);
  px(ctx, ox + 3, 3, 0x5d4037);
  px(ctx, ox + 4, 3, 0x5d4037);
  px(ctx, ox + 2, 4, 0x3e2723);
  px(ctx, ox + 5, 4, 0x3e2723);
  px(ctx, ox + 1, 5, 0x3e2723);
  px(ctx, ox + 6, 5, 0x3e2723);

  scene.textures.addSpriteSheet("creature_bird", canvas as unknown as HTMLImageElement, {
    frameWidth: w,
    frameHeight: h,
  });
}

function generateButterflySprite(scene: Phaser.Scene): void {
  const w = 6;
  const h = 6;
  const [canvas, ctx] = makeCanvas(w * 2, h);
  const wingColor = 0xffab40;
  const wingTip = 0xff6d00;

  // Frame 0: wings open
  let ox = 0;
  px(ctx, ox + 0, 1, wingColor);
  px(ctx, ox + 1, 1, wingColor);
  px(ctx, ox + 4, 1, wingColor);
  px(ctx, ox + 5, 1, wingColor);
  px(ctx, ox + 0, 2, wingTip);
  px(ctx, ox + 1, 2, wingColor);
  px(ctx, ox + 4, 2, wingColor);
  px(ctx, ox + 5, 2, wingTip);
  px(ctx, ox + 2, 2, 0x3e2723);
  px(ctx, ox + 3, 2, 0x3e2723);
  px(ctx, ox + 2, 3, 0x3e2723);
  px(ctx, ox + 3, 3, 0x3e2723);

  // Frame 1: wings closed
  ox = w;
  px(ctx, ox + 2, 1, wingColor);
  px(ctx, ox + 3, 1, wingColor);
  px(ctx, ox + 2, 2, 0x3e2723);
  px(ctx, ox + 3, 2, 0x3e2723);
  px(ctx, ox + 2, 3, 0x3e2723);
  px(ctx, ox + 3, 3, 0x3e2723);

  scene.textures.addSpriteSheet("creature_butterfly", canvas as unknown as HTMLImageElement, {
    frameWidth: w,
    frameHeight: h,
  });
}

function generateFishSprite(scene: Phaser.Scene): void {
  const w = 8;
  const h = 6;
  const [canvas, ctx] = makeCanvas(w, h);
  const body = 0x42a5f5;
  const belly = 0xbbdefb;

  // Body
  rect(ctx, 2, 1, 4, 3, body);
  rect(ctx, 1, 2, 1, 2, body);
  rect(ctx, 6, 2, 1, 1, body);
  // Belly highlight
  px(ctx, 3, 3, belly);
  px(ctx, 4, 3, belly);
  // Tail
  px(ctx, 0, 1, body);
  px(ctx, 0, 4, body);
  px(ctx, 0, 2, body);
  px(ctx, 0, 3, body);
  // Eye
  px(ctx, 5, 2, 0x000000);
  // Dorsal fin
  px(ctx, 3, 0, body);
  px(ctx, 4, 0, body);

  scene.textures.addCanvas("creature_fish", canvas);
}
