/**
 * CaveScene — Milestone 3: Navigate a dark cave maze to find the magic sword.
 * Limited torch visibility, simple maze with dead ends.
 */

import { GAME_WIDTH, GAME_HEIGHT, SCENES, COLORS, TILE_SIZE, DEPTH } from "../config";
import { QuestManager } from "../systems/QuestManager";
import { InventoryManager } from "../systems/InventoryManager";
import { SaveManager } from "../systems/SaveManager";
import { DialogueManager } from "../systems/DialogueManager";
import { AudioManager } from "../systems/AudioManager";
import { DIALOGUES } from "../data/dialogues";
import { randomInt } from "../utils/helpers";

const CAVE_COLS = 20;
const CAVE_ROWS = 15;
const CAVE_TILE = 16;
const TORCH_RADIUS = 36;

// Reason: 0 = floor, 1 = wall, 3 = entrance
const CAVE_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,0,1,0,1,0,1,0,1,1,0,1,0,1,1,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,1,0,1],
  [1,0,1,1,1,1,1,1,1,0,1,1,1,1,1,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,1],
  [1,1,1,1,0,1,1,0,1,1,1,0,1,1,0,1,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,0,1,0,1,0,0,0,0,1,0,1],
  [1,0,1,1,1,1,0,1,1,0,1,0,1,0,1,1,0,0,0,1],
  [1,0,0,0,0,0,0,1,0,0,0,0,1,0,1,0,0,1,1,1],
  [1,1,1,0,1,1,1,1,0,1,1,1,1,0,1,0,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,1,0,1],
  [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

// Sword spawn corners (opposite to entrance at bottom-left)
const SWORD_CORNERS = [
  { r: 1, c: 1 },    // top-left
  { r: 1, c: 18 },   // top-right
  { r: 13, c: 18 },  // bottom-right
];

export class CaveScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private spotlight!: Phaser.GameObjects.Image;
  private dialogue!: DialogueManager;
  private swordCollected = false;
  private returnData!: { returnX: number; returnY: number };

  constructor() {
    super({ key: SCENES.CAVE });
  }

  init(data: { milestone: number; returnX: number; returnY: number }): void {
    this.returnData = { returnX: data.returnX, returnY: data.returnY };
    this.swordCollected = false;
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playMusic("music_dungeon");

    this.cameras.main.fadeIn(400);

    // Pick a random sword corner
    const corner = SWORD_CORNERS[randomInt(0, SWORD_CORNERS.length - 1)];
    const swordX = corner.c * CAVE_TILE + CAVE_TILE / 2;
    const swordY = corner.r * CAVE_TILE + CAVE_TILE / 2;

    // Draw cave tiles
    const wallGfx = this.add.graphics().setDepth(DEPTH.GROUND);
    const floorGfx = this.add.graphics().setDepth(DEPTH.GROUND);
    let startX = 0;
    let startY = 0;

    const walls = this.physics.add.staticGroup();

    for (let r = 0; r < CAVE_ROWS; r++) {
      for (let c = 0; c < CAVE_COLS; c++) {
        const tx = c * CAVE_TILE;
        const ty = r * CAVE_TILE;
        const tile = CAVE_MAP[r][c];

        if (tile === 1) {
          wallGfx.fillStyle(COLORS.CAVE_WALL, 1);
          wallGfx.fillRect(tx, ty, CAVE_TILE, CAVE_TILE);
          // Stalactites — draw on wall tiles where the tile below is a floor tile
          if (r + 1 < CAVE_ROWS && CAVE_MAP[r + 1][c] !== 1 && (c * 7 + r * 13) % 5 === 0) {
            wallGfx.fillStyle(0x5d4037, 1);
            wallGfx.fillTriangle(tx + 4, ty + CAVE_TILE, tx + 8, ty + CAVE_TILE + 5, tx + 12, ty + CAVE_TILE);
          }
          // Reason: setDisplaySize ensures displayOriginX/Y match CAVE_TILE so
          // the static body aligns with the visual wall after refreshBody().
          const w = walls.create(tx + CAVE_TILE / 2, ty + CAVE_TILE / 2, "") as Phaser.Physics.Arcade.Sprite;
          w.setDisplaySize(CAVE_TILE, CAVE_TILE).setSize(CAVE_TILE, CAVE_TILE).setVisible(false).refreshBody();
        } else {
          floorGfx.fillStyle(COLORS.CAVE_FLOOR, 1);
          floorGfx.fillRect(tx, ty, CAVE_TILE, CAVE_TILE);
          // Floor detail
          if ((c + r) % 3 === 0) {
            floorGfx.fillStyle(0x4e342e, 1);
            floorGfx.fillRect(tx + 4, ty + 4, 2, 2);
          }
          // Blue puddle pixels
          if ((c + r) % 7 === 0) {
            floorGfx.fillStyle(0x42a5f5, 0.3);
            floorGfx.fillRect(tx + 8, ty + 10, 3, 2);
          }
          // Bone-colored pixels
          if ((c * 3 + r) % 9 === 0) {
            floorGfx.fillStyle(0xefebe9, 0.4);
            floorGfx.fillRect(tx + 2, ty + 8, 2, 1);
          }
        }

        if (tile === 3) {
          // Reason: spawn one tile right of entrance so player isn't at the world edge
          startX = tx + CAVE_TILE + CAVE_TILE / 2;
          startY = ty + CAVE_TILE / 2;
        }
      }
    }

    // Glowing crystals on wall tiles
    const crystalPositions = [
      { r: 2, c: 3 },
      { r: 6, c: 6 },
      { r: 10, c: 10 },
      { r: 4, c: 16 },
    ];
    for (const pos of crystalPositions) {
      if (CAVE_MAP[pos.r][pos.c] === 1) {
        const cx = pos.c * CAVE_TILE + CAVE_TILE / 2;
        const cy = pos.r * CAVE_TILE + CAVE_TILE / 2;
        const crystal = this.add.rectangle(cx, cy, 3, 5, 0x81d4fa).setDepth(DEPTH.OBJECTS);
        this.tweens.add({
          targets: crystal,
          alpha: { from: 0.4, to: 0.9 },
          duration: 1500,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    }

    // Sword sprite
    const sword = this.add.sprite(swordX, swordY, "items", 0).setDepth(DEPTH.OBJECTS);
    this.tweens.add({
      targets: sword,
      y: swordY - 3,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Reason: body offset reduced from 14 to 7 so the physics body fits within
    // 16px cave tiles without clipping into the wall row below.
    this.player = this.physics.add
      .sprite(startX, startY, "tadeo", 0)
      .setSize(10, 10)
      .setOffset(3, 7)
      .setDepth(DEPTH.PLAYER)
      .setCollideWorldBounds(true);

    this.physics.world.setBounds(0, 0, CAVE_COLS * CAVE_TILE, CAVE_ROWS * CAVE_TILE);
    this.physics.add.collider(this.player, walls);

    // Sword pickup zone
    const swordZone = this.add.zone(swordX, swordY, CAVE_TILE, CAVE_TILE);
    this.physics.add.existing(swordZone, true);
    this.physics.add.overlap(this.player, swordZone, () => {
      if (this.swordCollected) return;
      this.swordCollected = true;
      sword.destroy();
      swordZone.destroy();
      this.collectSword();
    });

    // Darkness: a pre-baked spotlight sprite that follows the player.
    // Reason: RenderTexture fill/erase approach had issues with camera scrolling
    // and opacity accumulation. A static sprite is simpler and fully reliable.
    this.createSpotlightTexture();
    this.spotlight = this.add.image(this.player.x, this.player.y, "cave_spotlight")
      .setDepth(DEPTH.EFFECTS);

    // Ambient dust motes — 3 tiny white rectangles with slow random drift
    for (let i = 0; i < 3; i++) {
      const dustX = Phaser.Math.Between(3 * CAVE_TILE, 17 * CAVE_TILE);
      const dustY = Phaser.Math.Between(3 * CAVE_TILE, 12 * CAVE_TILE);
      const dust = this.add.rectangle(dustX, dustY, 1, 1, 0xffffff).setAlpha(0.2).setDepth(DEPTH.EFFECTS);
      // Alpha cycling
      this.tweens.add({
        targets: dust,
        alpha: { from: 0.1, to: 0.4 },
        duration: Phaser.Math.Between(2000, 3500),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      // Slow random drift
      const driftRadius = Phaser.Math.Between(30, 40);
      this.tweens.add({
        targets: dust,
        x: dustX + Phaser.Math.Between(-driftRadius, driftRadius),
        y: dustY + Phaser.Math.Between(-driftRadius, driftRadius),
        duration: Phaser.Math.Between(4000, 6000),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Camera
    this.cameras.main.setBounds(0, 0, CAVE_COLS * CAVE_TILE, CAVE_ROWS * CAVE_TILE);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Intro dialogue
    this.dialogue = new DialogueManager(this);
    this.dialogue.startDialogue(DIALOGUES.cave_enter, () => {});
  }

  update(): void {
    if (this.dialogue.isActive) {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.dialogue.advance();
      }
      this.player.setVelocity(0, 0);
      this.spotlight.setPosition(this.player.x, this.player.y);
      return;
    }

    const speed = 50;
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown) vx = -speed;
    else if (this.cursors.right.isDown) vx = speed;
    if (this.cursors.up.isDown) vy = -speed;
    else if (this.cursors.down.isDown) vy = speed;

    this.player.setVelocity(vx, vy);
    if (vx !== 0 && vy !== 0) {
      this.player.body!.velocity.normalize().scale(speed);
    }

    this.spotlight.setPosition(this.player.x, this.player.y);
  }

  /**
   * Create a large dark texture with a transparent radial circle in the center.
   * Sized so the dark edges always cover the full viewport regardless of player position.
   */
  private createSpotlightTexture(): void {
    if (this.textures.exists("cave_spotlight")) return;

    const w = GAME_WIDTH * 2;
    const h = GAME_HEIGHT * 2;
    const cx = w / 2;
    const cy = h / 2;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;

    // Fill entirely with semi-transparent black
    ctx.fillStyle = "rgba(0, 0, 0, 0.93)";
    ctx.fillRect(0, 0, w, h);

    // Erase a soft radial circle in the center (the torch light)
    ctx.globalCompositeOperation = "destination-out";
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, TORCH_RADIUS);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.7)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    this.textures.addCanvas("cave_spotlight", canvas);
  }

  private collectSword(): void {
    AudioManager.getInstance().playSfx("sfx_item_get");
    // Item-get animation
    const itemSprite = this.add
      .sprite(this.player.x, this.player.y - 8, "items", 0)
      .setDepth(DEPTH.UI);

    this.tweens.add({
      targets: itemSprite,
      y: this.player.y - 24,
      duration: 800,
      ease: "Back.easeOut",
      onComplete: () => {
        itemSprite.destroy();
        InventoryManager.getInstance().addItem("sword");
        this.dialogue.startDialogue(DIALOGUES.cave_sword, () => {
          this.completeMilestone();
        });
      },
    });
  }

  private completeMilestone(): void {
    QuestManager.getInstance().completeMilestone();
    SaveManager.getInstance().save(this.returnData.returnX, this.returnData.returnY);
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENES.OVERWORLD);
    });
  }
}
