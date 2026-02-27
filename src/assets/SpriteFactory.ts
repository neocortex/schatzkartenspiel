/**
 * Programmatic pixel-art sprite generation.
 * All game art is created here as Phaser textures — no external image files needed.
 */

import { TILE_SIZE, CHAR_WIDTH, CHAR_HEIGHT, COLORS } from "../config";
import { drawDecorationTiles } from "./DecorationFactory";

type Ctx = CanvasRenderingContext2D;

/** Helper: fill a single pixel on a canvas context. */
export function px(ctx: Ctx, x: number, y: number, color: number, alpha = 1): void {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
  ctx.fillRect(x, y, 1, 1);
}

/** Helper: fill a rectangle area. */
export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
  ctx.fillRect(x, y, w, h);
}

/** Create an offscreen canvas and return its 2D context. */
export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

/**
 * Generate all game textures and register them with the Phaser texture manager.
 */
export function generateAllSprites(scene: Phaser.Scene): void {
  generateTileset(scene);
  generateTadeoSprites(scene);
  generateNPCSprites(scene);
  generateEnemySprites(scene);
  generateItemSprites(scene);
  generateUISprites(scene);
  generateParticles(scene);
}

// ---------------------------------------------------------------------------
// TILESET (16x16 each tile, arranged in a single texture atlas row)
// ---------------------------------------------------------------------------

function generateTileset(scene: Phaser.Scene): void {
  const tileCount = 32;
  const [canvas, ctx] = makeCanvas(TILE_SIZE * tileCount, TILE_SIZE);

  // Tile 0: Grass light
  drawGrassTile(ctx, 0, COLORS.GRASS_LIGHT, COLORS.GRASS_DARK);
  // Tile 1: Grass alt
  drawGrassTile(ctx, 1, COLORS.GRASS_DARK, COLORS.GRASS_LIGHT);
  // Tile 2: Water
  drawWaterTile(ctx, 2, COLORS.WATER_LIGHT, COLORS.WATER_DARK);
  // Tile 3: Deep water
  drawWaterTile(ctx, 3, COLORS.WATER_DARK, 0x1565c0);
  // Tile 4: Sand
  drawSandTile(ctx, 4);
  // Tile 5: Dirt
  drawSolidTile(ctx, 5, COLORS.DIRT, COLORS.DIRT_DARK);
  // Tile 6: Stone
  drawStoneTile(ctx, 6);
  // Tile 7: Lava
  drawLavaTile(ctx, 7);
  // Tile 8: Snow
  drawSolidTile(ctx, 8, COLORS.SNOW, 0xcfd8dc);
  // Tile 9: Path
  drawSolidTile(ctx, 9, COLORS.PATH, 0xc4b5a8);
  // Tile 10: Tree
  drawTreeTile(ctx, 10);
  // Tile 11: Bush
  drawBushTile(ctx, 11);
  // Tile 12: Bridge
  drawBridgeTile(ctx, 12);
  // Tile 13: House wall
  drawSolidTile(ctx, 13, COLORS.WALL, 0xab9a8e);
  // Tile 14: House roof
  drawRoofTile(ctx, 14);
  // Tile 15: Door
  drawDoorTile(ctx, 15);
  // Tile 16: Cave entrance
  drawCaveEntrance(ctx, 16);
  // Tile 17: Mountain
  drawMountainTile(ctx, 17);
  // Tile 18: Volcano top
  drawVolcanoTile(ctx, 18);
  // Tile 19: Chest
  drawChestTile(ctx, 19);
  // Tile 20: Sign
  drawSignTile(ctx, 20);
  // Tile 21: Dock
  drawDockTile(ctx, 21);
  // Tile 22: Boat
  drawBoatTile(ctx, 22);
  // Tile 23: Pink path
  drawPinkPathTile(ctx, 23);

  // Tiles 24-31: Decorations (flowers, rocks, mushrooms, tall grass, animated water/lava)
  drawDecorationTiles(ctx);

  scene.textures.addCanvas("tileset", canvas);
}

function drawGrassTile(ctx: Ctx, index: number, main: number, accent: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, main);
  // Grass blade details
  for (let i = 0; i < 6; i++) {
    const gx = ox + ((i * 3 + 1) % 15);
    const gy = (i * 5 + 2) % 14;
    px(ctx, gx, gy, accent);
    px(ctx, gx, gy + 1, accent);
  }
}

function drawWaterTile(ctx: Ctx, index: number, main: number, accent: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, main);
  // Wave highlights
  for (let y = 2; y < 14; y += 4) {
    for (let x = 0; x < 12; x += 3) {
      px(ctx, ox + x + (y % 3), y, accent);
      px(ctx, ox + x + (y % 3) + 1, y, accent);
    }
  }
}

function drawSandTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.SAND);
  for (let i = 0; i < 8; i++) {
    px(ctx, ox + ((i * 7 + 3) % 15), (i * 5 + 1) % 15, COLORS.SAND_DARK);
  }
}

function drawSolidTile(ctx: Ctx, index: number, main: number, accent: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, main);
  for (let i = 0; i < 5; i++) {
    px(ctx, ox + ((i * 5 + 2) % 15), (i * 7 + 3) % 15, accent);
  }
}

function drawStoneTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.STONE);
  // Stone cracks
  rect(ctx, ox + 2, 3, 5, 1, COLORS.STONE_DARK);
  rect(ctx, ox + 8, 7, 6, 1, COLORS.STONE_DARK);
  rect(ctx, ox + 1, 11, 4, 1, COLORS.STONE_DARK);
  rect(ctx, ox + 10, 13, 3, 1, COLORS.STONE_DARK);
}

function drawLavaTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.LAVA);
  for (let i = 0; i < 8; i++) {
    const lx = ox + ((i * 3 + 1) % 14);
    const ly = (i * 5 + 2) % 14;
    px(ctx, lx, ly, COLORS.LAVA_GLOW);
    px(ctx, lx + 1, ly, COLORS.LAVA_GLOW);
    px(ctx, lx, ly + 1, COLORS.LAVA_GLOW);
  }
}

function drawTreeTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.GRASS_LIGHT);
  // Trunk
  rect(ctx, ox + 6, 10, 4, 6, COLORS.TREE_TRUNK);
  // Crown
  rect(ctx, ox + 2, 2, 12, 9, COLORS.TREE_LEAVES);
  rect(ctx, ox + 4, 1, 8, 2, COLORS.TREE_LEAVES);
  // Leaf highlights
  px(ctx, ox + 4, 3, COLORS.TREE_LEAVES_LIGHT);
  px(ctx, ox + 8, 5, COLORS.TREE_LEAVES_LIGHT);
  px(ctx, ox + 6, 7, COLORS.TREE_LEAVES_LIGHT);
  px(ctx, ox + 10, 4, COLORS.TREE_LEAVES_LIGHT);
}

function drawBushTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.GRASS_LIGHT);
  rect(ctx, ox + 2, 6, 12, 8, COLORS.BUSH);
  rect(ctx, ox + 4, 4, 8, 3, COLORS.BUSH);
  px(ctx, ox + 5, 7, COLORS.TREE_LEAVES_LIGHT);
  px(ctx, ox + 9, 9, COLORS.TREE_LEAVES_LIGHT);
}

function drawBridgeTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.WATER_LIGHT);
  // Planks
  for (let y = 0; y < 16; y += 4) {
    rect(ctx, ox + 2, y, 12, 3, COLORS.BRIDGE);
    rect(ctx, ox + 2, y + 2, 12, 1, 0x8d6e63);
  }
  // Rails
  rect(ctx, ox + 1, 0, 1, 16, COLORS.TREE_TRUNK);
  rect(ctx, ox + 14, 0, 1, 16, COLORS.TREE_TRUNK);
}

function drawRoofTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.ROOF);
  // Shingle lines
  for (let y = 3; y < 16; y += 4) {
    rect(ctx, ox, y, TILE_SIZE, 1, 0xa31f1f);
  }
}

function drawDoorTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.WALL);
  rect(ctx, ox + 4, 4, 8, 12, COLORS.DOOR);
  px(ctx, ox + 10, 10, COLORS.KEY_GOLD); // doorknob
}

function drawCaveEntrance(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.STONE);
  // Dark opening
  rect(ctx, ox + 3, 4, 10, 12, COLORS.CAVE_WALL);
  rect(ctx, ox + 5, 2, 6, 3, COLORS.CAVE_WALL);
  // Arch highlight
  px(ctx, ox + 4, 3, COLORS.STONE_DARK);
  px(ctx, ox + 11, 3, COLORS.STONE_DARK);
}

function drawMountainTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.STONE);
  // Peak shape
  for (let y = 0; y < 12; y++) {
    const half = Math.floor((y * 8) / 12);
    rect(ctx, ox + 8 - half, y, half * 2, 1, COLORS.STONE_DARK);
  }
  // Snow cap
  rect(ctx, ox + 6, 0, 4, 3, COLORS.SNOW);
  px(ctx, ox + 7, 3, COLORS.SNOW);
  px(ctx, ox + 8, 3, COLORS.SNOW);
}

function drawVolcanoTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.STONE_DARK);
  // Crater
  rect(ctx, ox + 5, 0, 6, 4, COLORS.LAVA);
  rect(ctx, ox + 6, 0, 4, 2, COLORS.LAVA_GLOW);
  // Slopes
  for (let y = 4; y < 16; y++) {
    const half = Math.floor(((y - 4) * 8) / 12);
    rect(ctx, ox + 8 - half, y, half * 2, 1, COLORS.DIRT_DARK);
  }
}

function drawChestTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.GRASS_LIGHT);
  // Chest body
  rect(ctx, ox + 3, 6, 10, 8, COLORS.CHEST);
  rect(ctx, ox + 3, 6, 10, 4, 0x7b5b47);
  // Lock
  px(ctx, ox + 7, 10, COLORS.KEY_GOLD);
  px(ctx, ox + 8, 10, COLORS.KEY_GOLD);
  // Metal bands
  rect(ctx, ox + 3, 9, 10, 1, 0x5d4037);
}

function drawSignTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.GRASS_LIGHT);
  // Post
  rect(ctx, ox + 7, 8, 2, 8, COLORS.TREE_TRUNK);
  // Sign board
  rect(ctx, ox + 3, 3, 10, 6, COLORS.SAND);
  rect(ctx, ox + 3, 3, 10, 1, COLORS.TREE_TRUNK);
  rect(ctx, ox + 3, 8, 10, 1, COLORS.TREE_TRUNK);
}

function drawDockTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.WATER_LIGHT);
  // Planks
  for (let x = 0; x < 16; x += 4) {
    rect(ctx, ox + x, 2, 3, 12, COLORS.BRIDGE);
    rect(ctx, ox + x + 2, 2, 1, 12, 0x8d6e63);
  }
}

function drawBoatTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.WATER_LIGHT);
  // Hull
  rect(ctx, ox + 2, 8, 12, 5, 0x6d4c41);
  rect(ctx, ox + 3, 7, 10, 2, 0x8d6e63);
  // Mast
  rect(ctx, ox + 7, 2, 2, 6, COLORS.TREE_TRUNK);
  // Sail
  rect(ctx, ox + 9, 2, 4, 5, 0xfafafa);
}

function drawPinkPathTile(ctx: Ctx, index: number): void {
  const ox = index * TILE_SIZE;
  rect(ctx, ox, 0, TILE_SIZE, TILE_SIZE, COLORS.GRASS_LIGHT);
  // Dashed pink line
  for (let x = 0; x < 14; x += 4) {
    rect(ctx, ox + x + 1, 7, 2, 2, COLORS.PATH_PINK);
  }
}

// ---------------------------------------------------------------------------
// TADEO (16x24 character, 4 directions × 3 frames = spritesheet)
// ---------------------------------------------------------------------------

function generateTadeoSprites(scene: Phaser.Scene): void {
  const directions = 4; // down, left, right, up
  const frames = 3; // standing, walk1, walk2
  const w = CHAR_WIDTH;
  const h = CHAR_HEIGHT;
  const [canvas, ctx] = makeCanvas(w * frames, h * directions);

  for (let dir = 0; dir < directions; dir++) {
    for (let frame = 0; frame < frames; frame++) {
      drawTadeo(ctx, frame * w, dir * h, dir, frame);
    }
  }

  // Reason: Phaser runtime supports canvas but types expect HTMLImageElement
  scene.textures.addSpriteSheet("tadeo", canvas as unknown as HTMLImageElement, {
    frameWidth: w,
    frameHeight: h,
  });
}

function drawTadeo(ctx: Ctx, ox: number, oy: number, dir: number, frame: number): void {
  // Reason: dir 0=down, 1=left, 2=right, 3=up. frame 0=stand, 1/2=walk.
  const walkOffset = frame === 1 ? -1 : frame === 2 ? 1 : 0;

  // Boots (bottom)
  rect(ctx, ox + 4, oy + 21, 3, 3, COLORS.TADEO_BOOTS);
  rect(ctx, ox + 9, oy + 21, 3, 3, COLORS.TADEO_BOOTS);
  // Walk animation: shift legs
  if (frame === 1) {
    rect(ctx, ox + 3, oy + 21, 3, 3, COLORS.TADEO_BOOTS);
    rect(ctx, ox + 10, oy + 21, 3, 3, COLORS.TADEO_BOOTS);
  } else if (frame === 2) {
    rect(ctx, ox + 5, oy + 21, 3, 3, COLORS.TADEO_BOOTS);
    rect(ctx, ox + 8, oy + 21, 3, 3, COLORS.TADEO_BOOTS);
  }

  // Pants
  rect(ctx, ox + 4, oy + 16, 8, 5, COLORS.TADEO_PANTS);

  // Shirt / torso
  rect(ctx, ox + 3, oy + 9, 10, 7, COLORS.TADEO_SHIRT);
  // Arms
  rect(ctx, ox + 1, oy + 10, 2, 5, COLORS.TADEO_SHIRT);
  rect(ctx, ox + 13, oy + 10, 2, 5, COLORS.TADEO_SHIRT);
  // Hands
  rect(ctx, ox + 1, oy + 15, 2, 2, COLORS.TADEO_SKIN);
  rect(ctx, ox + 13, oy + 15, 2, 2, COLORS.TADEO_SKIN);
  // Arm walk sway
  if (frame !== 0) {
    rect(ctx, ox + 1 + walkOffset, oy + 10, 2, 5, COLORS.TADEO_SHIRT);
    rect(ctx, ox + 13 - walkOffset, oy + 10, 2, 5, COLORS.TADEO_SHIRT);
  }

  // Head
  rect(ctx, ox + 4, oy + 2, 8, 7, COLORS.TADEO_SKIN);

  // Hair (blonde)
  rect(ctx, ox + 3, oy + 1, 10, 3, COLORS.TADEO_HAIR);
  rect(ctx, ox + 4, oy + 0, 8, 2, COLORS.TADEO_HAIR);

  // Face details depend on direction
  if (dir === 0) {
    // Facing down — eyes and mouth visible
    px(ctx, ox + 5, oy + 5, 0x000000); // left eye
    px(ctx, ox + 10, oy + 5, 0x000000); // right eye
    px(ctx, ox + 7, oy + 7, 0x000000); // mouth
    px(ctx, ox + 8, oy + 7, 0x000000);
  } else if (dir === 3) {
    // Facing up — back of head, hair only
    rect(ctx, ox + 4, oy + 2, 8, 5, COLORS.TADEO_HAIR);
  } else if (dir === 1) {
    // Left — one eye on left side
    px(ctx, ox + 5, oy + 5, 0x000000);
    px(ctx, ox + 5, oy + 7, 0x000000); // mouth
    // Side hair
    rect(ctx, ox + 3, oy + 1, 3, 4, COLORS.TADEO_HAIR);
  } else {
    // Right — one eye on right side
    px(ctx, ox + 10, oy + 5, 0x000000);
    px(ctx, ox + 10, oy + 7, 0x000000); // mouth
    rect(ctx, ox + 10, oy + 1, 3, 4, COLORS.TADEO_HAIR);
  }
}

// ---------------------------------------------------------------------------
// NPC SPRITES (16x24, 3 variants)
// ---------------------------------------------------------------------------

function generateNPCSprites(scene: Phaser.Scene): void {
  const variants = 3;
  const w = CHAR_WIDTH;
  const h = CHAR_HEIGHT;
  const [canvas, ctx] = makeCanvas(w * variants, h);
  const clothColors = [0xff6f00, 0x00897b, 0x6a1b9a];

  for (let v = 0; v < variants; v++) {
    drawNPC(ctx, v * w, 0, clothColors[v]);
  }

  scene.textures.addSpriteSheet("npc", canvas as unknown as HTMLImageElement, { frameWidth: w, frameHeight: h });
}

function drawNPC(ctx: Ctx, ox: number, oy: number, clothColor: number): void {
  // Feet
  rect(ctx, ox + 4, oy + 21, 3, 3, 0x3e2723);
  rect(ctx, ox + 9, oy + 21, 3, 3, 0x3e2723);
  // Legs
  rect(ctx, ox + 4, oy + 16, 8, 5, 0x5d4037);
  // Body
  rect(ctx, ox + 3, oy + 9, 10, 7, clothColor);
  // Arms
  rect(ctx, ox + 1, oy + 10, 2, 5, clothColor);
  rect(ctx, ox + 13, oy + 10, 2, 5, clothColor);
  rect(ctx, ox + 1, oy + 15, 2, 2, COLORS.NPC_SKIN);
  rect(ctx, ox + 13, oy + 15, 2, 2, COLORS.NPC_SKIN);
  // Head
  rect(ctx, ox + 4, oy + 2, 8, 7, COLORS.NPC_SKIN);
  // Hair (black)
  rect(ctx, ox + 3, oy + 1, 10, 3, 0x212121);
  rect(ctx, ox + 4, oy + 0, 8, 2, 0x212121);
  // Eyes
  px(ctx, ox + 5, oy + 5, 0x000000);
  px(ctx, ox + 10, oy + 5, 0x000000);
  px(ctx, ox + 7, oy + 7, 0x000000);
  px(ctx, ox + 8, oy + 7, 0x000000);
}

// ---------------------------------------------------------------------------
// ENEMY SPRITES
// ---------------------------------------------------------------------------

function generateEnemySprites(scene: Phaser.Scene): void {
  generateOgreSprite(scene);
  generateSharkSprite(scene);
}

function generateOgreSprite(scene: Phaser.Scene): void {
  const w = 32;
  const h = 40;
  const [canvas, ctx] = makeCanvas(w * 2, h); // 2 frames: idle, attack

  for (let f = 0; f < 2; f++) {
    const ox = f * w;
    const attackRaise = f === 1 ? -4 : 0;

    // Feet
    rect(ctx, ox + 8, h - 5, 6, 5, 0x3e2723);
    rect(ctx, ox + 18, h - 5, 6, 5, 0x3e2723);
    // Legs
    rect(ctx, ox + 8, h - 12, 16, 7, 0x4e342e);
    // Body (large)
    rect(ctx, ox + 5, 12, 22, 16, COLORS.OGRE_SKIN);
    rect(ctx, ox + 7, 10, 18, 4, COLORS.OGRE_SKIN);
    // Arms
    rect(ctx, ox + 1, 14, 4, 12, COLORS.OGRE_SKIN);
    rect(ctx, ox + 27, 14 + attackRaise, 4, 12, COLORS.OGRE_SKIN);
    // Hammer in right hand
    rect(ctx, ox + 27, 8 + attackRaise, 4, 6, COLORS.HAMMER_HANDLE);
    rect(ctx, ox + 25, 4 + attackRaise, 8, 5, COLORS.STONE);
    // Head
    rect(ctx, ox + 9, 2, 14, 10, COLORS.OGRE_SKIN);
    // Eyes (angry)
    rect(ctx, ox + 11, 5, 3, 2, 0xffeb3b);
    rect(ctx, ox + 18, 5, 3, 2, 0xffeb3b);
    px(ctx, ox + 12, 5, 0x000000);
    px(ctx, ox + 19, 5, 0x000000);
    // Mouth
    rect(ctx, ox + 13, 9, 6, 2, 0x3e2723);
    // Teeth
    px(ctx, ox + 14, 9, 0xffffff);
    px(ctx, ox + 17, 9, 0xffffff);
    // Horns
    rect(ctx, ox + 9, 0, 3, 4, COLORS.OGRE_DARK);
    rect(ctx, ox + 20, 0, 3, 4, COLORS.OGRE_DARK);
  }

  scene.textures.addSpriteSheet("ogre", canvas as unknown as HTMLImageElement, { frameWidth: w, frameHeight: h });
}

function generateSharkSprite(scene: Phaser.Scene): void {
  const w = 48;
  const h = 24;
  const [canvas, ctx] = makeCanvas(w * 2, h); // 2 frames: swim, attack

  for (let f = 0; f < 2; f++) {
    const ox = f * w;
    const jawOpen = f === 1 ? 3 : 0;

    // Body
    rect(ctx, ox + 8, 6, 28, 12, COLORS.SHARK_BODY);
    rect(ctx, ox + 12, 4, 20, 4, COLORS.SHARK_BODY);
    // Belly
    rect(ctx, ox + 10, 14, 24, 4, COLORS.SHARK_BELLY);
    // Tail
    rect(ctx, ox + 0, 8, 10, 8, COLORS.SHARK_BODY);
    rect(ctx, ox + 0, 4, 4, 6, COLORS.SHARK_BODY);
    rect(ctx, ox + 0, 14, 4, 6, COLORS.SHARK_BODY);
    // Dorsal fin
    rect(ctx, ox + 20, 1, 6, 5, COLORS.SHARK_BODY);
    rect(ctx, ox + 22, 0, 3, 2, COLORS.SHARK_BODY);
    // Eye
    px(ctx, ox + 34, 7, 0x000000);
    px(ctx, ox + 35, 7, 0xffeb3b);
    // Mouth
    rect(ctx, ox + 36, 12 + jawOpen, 10, 2, 0x3e2723);
    // Teeth
    for (let t = 0; t < 4; t++) {
      px(ctx, ox + 37 + t * 2, 11 + jawOpen, 0xffffff);
    }
  }

  scene.textures.addSpriteSheet("shark", canvas as unknown as HTMLImageElement, { frameWidth: w, frameHeight: h });
}

// ---------------------------------------------------------------------------
// ITEM SPRITES (16x16 each)
// ---------------------------------------------------------------------------

function generateItemSprites(scene: Phaser.Scene): void {
  const items = ["sword", "berry", "key", "hammer", "heart", "chest_open"];
  const [canvas, ctx] = makeCanvas(16 * items.length, 16);

  drawSword(ctx, 0, 0);
  drawBerry(ctx, 16, 0);
  drawKey(ctx, 32, 0);
  drawHammer(ctx, 48, 0);
  drawHeart(ctx, 64, 0);
  drawChestOpen(ctx, 80, 0);

  scene.textures.addSpriteSheet("items", canvas as unknown as HTMLImageElement, { frameWidth: 16, frameHeight: 16 });
}

function drawSword(ctx: Ctx, ox: number, oy: number): void {
  // Blade
  rect(ctx, ox + 7, oy + 1, 2, 9, COLORS.SWORD_BLADE);
  px(ctx, ox + 7, oy + 0, COLORS.SWORD_BLADE);
  // Glow
  px(ctx, ox + 6, oy + 2, COLORS.SWORD_GLOW);
  px(ctx, ox + 9, oy + 4, COLORS.SWORD_GLOW);
  // Guard
  rect(ctx, ox + 4, oy + 10, 8, 2, COLORS.SWORD_HILT);
  // Hilt
  rect(ctx, ox + 7, oy + 12, 2, 3, COLORS.SWORD_HILT);
  // Pommel
  px(ctx, ox + 7, oy + 15, COLORS.KEY_GOLD);
  px(ctx, ox + 8, oy + 15, COLORS.KEY_GOLD);
}

function drawBerry(ctx: Ctx, ox: number, oy: number): void {
  // Berry cluster
  rect(ctx, ox + 5, oy + 6, 3, 3, COLORS.BERRY);
  rect(ctx, ox + 8, oy + 5, 3, 3, COLORS.BERRY);
  rect(ctx, ox + 6, oy + 9, 3, 3, COLORS.BERRY);
  // Glow
  px(ctx, ox + 6, oy + 6, COLORS.BERRY_GLOW);
  px(ctx, ox + 9, oy + 5, COLORS.BERRY_GLOW);
  px(ctx, ox + 7, oy + 9, COLORS.BERRY_GLOW);
  // Stem
  rect(ctx, ox + 7, oy + 3, 1, 3, 0x2e7d32);
  // Leaf
  rect(ctx, ox + 8, oy + 2, 3, 2, 0x4caf50);
}

function drawKey(ctx: Ctx, ox: number, oy: number): void {
  // Bow (ring)
  rect(ctx, ox + 4, oy + 2, 6, 5, COLORS.KEY_GOLD);
  rect(ctx, ox + 6, oy + 3, 2, 3, 0x000000); // hole
  // Shaft
  rect(ctx, ox + 7, oy + 7, 2, 6, COLORS.KEY_GOLD);
  // Teeth
  rect(ctx, ox + 9, oy + 11, 2, 2, COLORS.KEY_GOLD);
  rect(ctx, ox + 9, oy + 9, 2, 1, COLORS.KEY_GOLD);
}

function drawHammer(ctx: Ctx, ox: number, oy: number): void {
  // Handle
  rect(ctx, ox + 7, oy + 6, 2, 9, COLORS.HAMMER_HANDLE);
  // Head
  rect(ctx, ox + 3, oy + 1, 10, 6, COLORS.HAMMER_HEAD);
  rect(ctx, ox + 4, oy + 0, 8, 1, COLORS.HAMMER_HEAD);
  // Highlight
  px(ctx, ox + 5, oy + 2, 0xfff176);
  px(ctx, ox + 6, oy + 2, 0xfff176);
}

function drawHeart(ctx: Ctx, ox: number, oy: number): void {
  // Heart shape
  rect(ctx, ox + 3, oy + 4, 10, 7, COLORS.HEART);
  rect(ctx, ox + 2, oy + 3, 5, 4, COLORS.HEART);
  rect(ctx, ox + 9, oy + 3, 5, 4, COLORS.HEART);
  rect(ctx, ox + 4, oy + 11, 8, 2, COLORS.HEART);
  rect(ctx, ox + 6, oy + 13, 4, 1, COLORS.HEART);
  px(ctx, ox + 7, oy + 14, COLORS.HEART);
  px(ctx, ox + 8, oy + 14, COLORS.HEART);
  // Highlight
  px(ctx, ox + 4, oy + 4, 0xff8a80);
  px(ctx, ox + 5, oy + 4, 0xff8a80);
}

function drawChestOpen(ctx: Ctx, ox: number, oy: number): void {
  // Chest body
  rect(ctx, ox + 2, oy + 8, 12, 7, COLORS.CHEST);
  // Open lid
  rect(ctx, ox + 1, oy + 3, 14, 5, 0x7b5b47);
  rect(ctx, ox + 2, oy + 2, 12, 2, 0x7b5b47);
  // Gold inside
  rect(ctx, ox + 4, oy + 8, 8, 4, COLORS.CHEST_GOLD);
  // Sparkle
  px(ctx, ox + 6, oy + 9, 0xffffff);
  px(ctx, ox + 9, oy + 10, 0xffffff);
}

// ---------------------------------------------------------------------------
// UI SPRITES
// ---------------------------------------------------------------------------

function generateUISprites(scene: Phaser.Scene): void {
  // Portrait frame for dialogues (32x32)
  {
    const [canvas, ctx] = makeCanvas(32, 32);
    rect(ctx, 0, 0, 32, 32, 0x5d4037);
    rect(ctx, 1, 1, 30, 30, COLORS.UI_BG);
    // Draw small Tadeo face
    rect(ctx, 8, 6, 16, 14, COLORS.TADEO_SKIN);
    rect(ctx, 6, 4, 20, 6, COLORS.TADEO_HAIR);
    rect(ctx, 8, 2, 16, 4, COLORS.TADEO_HAIR);
    px(ctx, 11, 12, 0x000000);
    px(ctx, 20, 12, 0x000000);
    px(ctx, 14, 16, 0x000000);
    px(ctx, 17, 16, 0x000000);
    scene.textures.addCanvas("portrait_tadeo", canvas);
  }

  // NPC portraits
  const npcColors: [string, number][] = [
    ["portrait_npc0", 0xff6f00],
    ["portrait_npc1", 0x00897b],
    ["portrait_npc2", 0x6a1b9a],
  ];
  for (const [key, clothColor] of npcColors) {
    const [canvas, ctx] = makeCanvas(32, 32);
    rect(ctx, 0, 0, 32, 32, 0x5d4037);
    rect(ctx, 1, 1, 30, 30, COLORS.UI_BG);
    rect(ctx, 8, 6, 16, 14, COLORS.NPC_SKIN);
    rect(ctx, 6, 4, 20, 6, 0x212121);
    rect(ctx, 8, 2, 16, 4, 0x212121);
    rect(ctx, 8, 20, 16, 8, clothColor);
    px(ctx, 11, 12, 0x000000);
    px(ctx, 20, 12, 0x000000);
    px(ctx, 14, 16, 0x000000);
    px(ctx, 17, 16, 0x000000);
    scene.textures.addCanvas(key, canvas);
  }

  // Button background (60x20)
  {
    const [canvas, ctx] = makeCanvas(60, 20);
    rect(ctx, 0, 0, 60, 20, COLORS.UI_BORDER);
    rect(ctx, 1, 1, 58, 18, COLORS.UI_BG);
    scene.textures.addCanvas("button_bg", canvas);
  }

  // Lava rock projectile (8x8)
  {
    const [canvas, ctx] = makeCanvas(8, 8);
    rect(ctx, 1, 0, 6, 8, COLORS.LAVA);
    rect(ctx, 0, 1, 8, 6, COLORS.LAVA);
    px(ctx, 2, 2, COLORS.LAVA_GLOW);
    px(ctx, 4, 3, COLORS.LAVA_GLOW);
    px(ctx, 3, 5, COLORS.LAVA_GLOW);
    scene.textures.addCanvas("lava_rock", canvas);
  }

  // Torch glow (for cave scene)
  {
    const [canvas, ctx] = makeCanvas(128, 128);
    const cx = 64;
    const cy = 64;
    for (let r = 64; r > 0; r--) {
      const alpha = (r / 64) * 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fill();
    }
    // Clear center for visibility
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    scene.textures.addCanvas("torch_mask", canvas);
  }
}

// ---------------------------------------------------------------------------
// PARTICLE TEXTURES
// ---------------------------------------------------------------------------

function generateParticles(scene: Phaser.Scene): void {
  // Generic white particle (4x4)
  {
    const [canvas, ctx] = makeCanvas(4, 4);
    rect(ctx, 0, 0, 4, 4, 0xffffff);
    scene.textures.addCanvas("particle_white", canvas);
  }

  // Gold sparkle particle (4x4)
  {
    const [canvas, ctx] = makeCanvas(4, 4);
    rect(ctx, 1, 0, 2, 4, COLORS.KEY_GOLD);
    rect(ctx, 0, 1, 4, 2, COLORS.KEY_GOLD);
    scene.textures.addCanvas("particle_gold", canvas);
  }

  // Fire particle (4x4)
  {
    const [canvas, ctx] = makeCanvas(4, 4);
    rect(ctx, 0, 0, 4, 4, COLORS.LAVA);
    rect(ctx, 1, 1, 2, 2, COLORS.LAVA_GLOW);
    scene.textures.addCanvas("particle_fire", canvas);
  }
}
