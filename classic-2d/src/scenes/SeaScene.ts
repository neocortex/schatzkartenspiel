/**
 * SeaScene — Milestone 9: Paddle boat dodging waves, then shark boss fight.
 * Boat auto-scrolls upward. Player dodges waves with arrow keys.
 * 3 hearts — each wave hit costs one. Survive to the end → shark fight.
 */

import { GAME_WIDTH, GAME_HEIGHT, SCENES, COLORS, DEPTH, FONT } from "../config";
import { DialogueManager } from "../systems/DialogueManager";
import { AudioManager } from "../systems/AudioManager";
import { DIALOGUES } from "../data/dialogues";
import { randomInt } from "../utils/helpers";

const MAX_LIVES = 3;

export class SeaScene extends Phaser.Scene {
  private boat!: Phaser.Physics.Arcade.Sprite;
  private waves!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private dialogue!: DialogueManager;
  private isPlaying = false;
  private lives = MAX_LIVES;
  private heartSprites: Phaser.GameObjects.Text[] = [];
  private progressBar!: Phaser.GameObjects.Graphics;
  private tadeoSprite!: Phaser.GameObjects.Sprite;
  private returnData!: { returnX: number; returnY: number };
  private elapsed = 0;
  private duration = 15;
  private invincible = false;
  private waveLineGfx: Phaser.GameObjects.Graphics[] = [];
  private wakeTimer = 0;

  constructor() {
    super({ key: SCENES.SEA });
  }

  init(data: { milestone: number; returnX: number; returnY: number }): void {
    this.returnData = { returnX: data.returnX, returnY: data.returnY };
    this.lives = MAX_LIVES;
    this.elapsed = 0;
    this.isPlaying = false;
    this.invincible = false;
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playMusic("music_dungeon");

    this.cameras.main.fadeIn(400);

    // Ocean background
    const bg = this.add.graphics().setDepth(DEPTH.GROUND);
    bg.fillStyle(0x0d47a1, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    for (let wy = 20; wy < GAME_HEIGHT; wy += 15) {
      bg.fillStyle(COLORS.WATER_LIGHT, 0.2);
      bg.fillRect(0, wy, GAME_WIDTH, 3);
    }

    // Distant island silhouettes on horizon
    bg.fillStyle(0x1b5e20, 0.3);
    bg.fillCircle(50, 14, 12);
    bg.fillCircle(60, 14, 8);
    bg.fillStyle(0x2e7d32, 0.2);
    bg.fillCircle(GAME_WIDTH - 40, 18, 10);
    bg.fillCircle(GAME_WIDTH - 30, 18, 7);

    // Wave line graphics (animated in update)
    this.waveLineGfx = [];
    for (let i = 0; i < 4; i++) {
      const wl = this.add.graphics().setDepth(DEPTH.GROUND + 1);
      wl.fillStyle(COLORS.WATER_LIGHT, 0.12);
      wl.fillRect(0, 0, GAME_WIDTH, 2);
      wl.setPosition(0, 30 + i * 40);
      this.waveLineGfx.push(wl);
    }

    // Boat texture
    if (!this.textures.exists("boat_sprite")) {
      const boatGfx = this.add.graphics();
      boatGfx.fillStyle(0x6d4c41, 1);
      boatGfx.fillRect(5, 16, 20, 8);
      boatGfx.fillStyle(0x8d6e63, 1);
      boatGfx.fillRect(7, 14, 16, 4);
      boatGfx.fillStyle(COLORS.TREE_TRUNK, 1);
      boatGfx.fillRect(14, 2, 2, 14);
      boatGfx.fillStyle(0xfafafa, 1);
      boatGfx.fillRect(16, 3, 8, 8);
      boatGfx.generateTexture("boat_sprite", 30, 24);
      boatGfx.destroy();
    }

    this.boat = this.physics.add
      .sprite(GAME_WIDTH / 2, GAME_HEIGHT - 40, "boat_sprite")
      .setCollideWorldBounds(true)
      .setDepth(DEPTH.PLAYER);

    this.tadeoSprite = this.add
      .sprite(this.boat.x, this.boat.y - 10, "tadeo", 9)
      .setDepth(DEPTH.PLAYER + 1);

    // Waves group
    this.waves = this.physics.add.group();
    this.physics.add.overlap(this.boat, this.waves, this.onWaveHit, undefined, this);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Hearts display (top-left)
    this.heartSprites = [];
    for (let i = 0; i < MAX_LIVES; i++) {
      const heart = this.add
        .text(8 + i * 14, 6, "\u2665", {
          fontSize: "10px",
          fontFamily: FONT,
          color: "#e53935",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setDepth(DEPTH.UI)
        .setResolution(4);
      this.heartSprites.push(heart);
    }

    // Progress bar (top-right) — shows how far across the sea
    this.progressBar = this.add.graphics().setDepth(DEPTH.UI);
    this.drawProgress();

    this.dialogue = new DialogueManager(this);
    this.dialogue.startDialogue(DIALOGUES.sea_crossing, () => {
      this.startBoatPhase();
    });
  }

  update(_time: number, delta: number): void {
    if (this.dialogue.isActive) {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.dialogue.advance();
      return;
    }

    if (!this.isPlaying) return;

    // Horizontal dodge movement
    const speed = 100;
    if (this.cursors.left.isDown) {
      this.boat.setVelocityX(-speed);
    } else if (this.cursors.right.isDown) {
      this.boat.setVelocityX(speed);
    } else {
      this.boat.setVelocityX(0);
    }

    // Vertical dodge movement (limited range)
    if (this.cursors.up.isDown) {
      this.boat.setVelocityY(-speed / 2);
    } else if (this.cursors.down.isDown) {
      this.boat.setVelocityY(speed / 2);
    } else {
      this.boat.setVelocityY(0);
    }

    this.tadeoSprite.setPosition(this.boat.x, this.boat.y - 10);

    // Animate wave lines with sine
    for (let i = 0; i < this.waveLineGfx.length; i++) {
      const base = 30 + i * 40;
      this.waveLineGfx[i].y = base + Math.sin(this.time.now / 1500 + i * 1.2) * 3;
    }

    // Boat wake particles
    this.wakeTimer += delta;
    if (this.wakeTimer > 120) {
      this.wakeTimer = 0;
      const wx = this.boat.x + Phaser.Math.Between(-4, 4);
      const wy = this.boat.y + 12;
      const wake = this.add.rectangle(wx, wy, 2, 1, 0xffffff, 0.4).setDepth(DEPTH.EFFECTS);
      this.tweens.add({
        targets: wake,
        y: wy + 15,
        alpha: 0,
        duration: 600,
        onComplete: () => wake.destroy(),
      });
    }
  }

  private startBoatPhase(): void {
    this.isPlaying = true;
    this.elapsed = 0;

    // Spawn waves periodically
    this.time.addEvent({
      delay: 700,
      loop: true,
      callback: () => {
        if (!this.isPlaying) return;
        this.spawnWave();
      },
    });

    // Progress timer — tick every second
    this.time.addEvent({
      delay: 1000,
      repeat: this.duration - 1,
      callback: () => {
        if (!this.isPlaying) return;
        this.elapsed++;
        this.drawProgress();
        if (this.elapsed >= this.duration) {
          this.boatPhaseComplete();
        }
      },
    });
  }

  private drawProgress(): void {
    this.progressBar.clear();
    const barX = GAME_WIDTH - 90;
    const barY = 8;
    const barW = 80;
    const barH = 6;

    // Background
    this.progressBar.fillStyle(0x000000, 0.5);
    this.progressBar.fillRect(barX, barY, barW, barH);
    // Fill
    const ratio = Math.min(this.elapsed / this.duration, 1);
    this.progressBar.fillStyle(0x4caf50, 1);
    this.progressBar.fillRect(barX, barY, Math.floor(barW * ratio), barH);
    // Border
    this.progressBar.lineStyle(1, 0xffffff, 0.5);
    this.progressBar.strokeRect(barX, barY, barW, barH);
  }

  private spawnWave(): void {
    if (!this.textures.exists("wave_tex")) {
      const wave = this.add.graphics();
      wave.fillStyle(COLORS.WATER_DARK, 0.8);
      wave.fillRect(0, 0, 50, 6);
      wave.fillStyle(0xffffff, 0.3);
      wave.fillRect(2, 0, 10, 2);
      wave.generateTexture("wave_tex", 50, 6);
      wave.destroy();
    }

    AudioManager.getInstance().playSfx("sfx_wave");
    const wx = randomInt(10, GAME_WIDTH - 10);
    const waveSprite = this.waves.create(wx, -10, "wave_tex") as Phaser.Physics.Arcade.Sprite;
    waveSprite.setVelocityY(randomInt(50, 90));
    this.time.delayedCall(5000, () => {
      if (waveSprite.active) waveSprite.destroy();
    });
  }

  private onWaveHit(
    _boat: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    wave: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!this.isPlaying || this.invincible) return;

    (wave as Phaser.GameObjects.GameObject).destroy();
    AudioManager.getInstance().playSfx("sfx_hit_damage");

    this.lives--;
    this.updateHearts();

    // Brief invincibility to prevent instant multi-hit
    this.invincible = true;
    this.boat.setAlpha(0.5);
    this.tadeoSprite.setAlpha(0.5);
    this.time.delayedCall(800, () => {
      this.invincible = false;
      if (this.boat.active) this.boat.setAlpha(1);
      if (this.tadeoSprite.active) this.tadeoSprite.setAlpha(1);
    });

    // Visual feedback
    this.cameras.main.flash(150, 255, 50, 50);
    this.boat.setVelocityX(randomInt(-100, 100));

    if (this.lives <= 0) {
      this.boatPhaseFail();
    }
  }

  private updateHearts(): void {
    for (let i = 0; i < MAX_LIVES; i++) {
      this.heartSprites[i].setAlpha(i < this.lives ? 1 : 0.2);
    }
  }

  private boatPhaseFail(): void {
    this.isPlaying = false;
    this.waves.clear(true, true);

    const hint = [{
      speaker: "Erzähler",
      portrait: "",
      text: "Die Wellen waren zu stark! Weiche den Wellen aus und versuche es nochmal!",
    }];
    this.dialogue.startDialogue(hint, () => {
      this.cameras.main.fadeOut(400);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.restart({
          milestone: 9,
          returnX: this.returnData.returnX,
          returnY: this.returnData.returnY,
        });
      });
    });
  }

  private boatPhaseComplete(): void {
    this.isPlaying = false;
    this.waves.clear(true, true);

    // Show shark appearance dialogue, then transition to combat
    this.dialogue.startDialogue(DIALOGUES.sea_shark, () => {
      this.cameras.main.fadeOut(400);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start(SCENES.COMBAT, {
          milestone: 9,
          returnX: this.returnData.returnX,
          returnY: this.returnData.returnY,
        });
      });
    });
  }
}
