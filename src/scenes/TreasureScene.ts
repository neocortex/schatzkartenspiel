/**
 * TreasureScene — Milestone 10: Three mini-game finale.
 * (1) Dig: mash spacebar to fill a progress bar.
 * (2) Hammer: time strikes on a bouncing power meter to crack ice.
 * (3) Key: lockpicking — move key with arrows, find the sweet spot.
 */

import { GAME_WIDTH, GAME_HEIGHT, SCENES, COLORS, DEPTH, FONT } from "../config";
import { QuestManager } from "../systems/QuestManager";
import { SaveManager } from "../systems/SaveManager";
import { DialogueManager } from "../systems/DialogueManager";
import { AudioManager } from "../systems/AudioManager";
import { DIALOGUES } from "../data/dialogues";

type TreasurePhase = "walk" | "arrive" | "dig" | "hammer" | "key" | "open" | "done";

// Mini-game constants
const BAR_W = 120;
const BAR_H = 10;
const BAR_X = (GAME_WIDTH - BAR_W) / 2;
const DIG_PRESSES = 20;
const HAMMER_HITS = 3;
const METER_W = 100;
const METER_SPEED = 120; // pixels per second
const SWEET_SPOT_W = 30;
const KEY_RANGE = 100;
const KEY_SNAP_DIST = 10;

export class TreasureScene extends Phaser.Scene {
  private dialogue!: DialogueManager;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private phase: TreasurePhase = "walk";
  private chestGfx!: Phaser.GameObjects.Graphics;
  private returnData!: { returnX: number; returnY: number };
  private player!: Phaser.Physics.Arcade.Sprite;
  private xZone!: Phaser.Physics.Arcade.StaticGroup;
  private xMark!: Phaser.GameObjects.Text;

  // Dig state
  private digCount = 0;
  private digBarGfx!: Phaser.GameObjects.Graphics;
  private digLabel!: Phaser.GameObjects.Text;
  private shovelSprite!: Phaser.GameObjects.Graphics;

  // Hammer state
  private hammerHits = 0;
  private meterGfx!: Phaser.GameObjects.Graphics;
  private markerX = 0;
  private markerDir = 1;
  private hammerLabel!: Phaser.GameObjects.Text;
  private hitCountText!: Phaser.GameObjects.Text;
  private hammerBusy = false;

  // Key state
  private keyPosX = 0;
  private sweetSpotX = 0;
  private keyGfx!: Phaser.GameObjects.Graphics;
  private keyLabel!: Phaser.GameObjects.Text;
  private proximityText!: Phaser.GameObjects.Text;
  private keyBusy = false;

  constructor() {
    super({ key: SCENES.TREASURE });
  }

  init(data: { milestone: number; returnX: number; returnY: number }): void {
    this.returnData = { returnX: data.returnX, returnY: data.returnY };
    this.phase = "walk";
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playMusic("music_overworld");

    this.cameras.main.fadeIn(400);

    // Beach background
    const bg = this.add.graphics().setDepth(DEPTH.GROUND);
    bg.fillStyle(0x87ceeb, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT / 2);
    bg.fillStyle(COLORS.SAND, 1);
    bg.fillRect(0, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT / 2);
    bg.fillStyle(COLORS.SAND_DARK, 1);
    for (let i = 0; i < 20; i++) {
      bg.fillRect(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(GAME_HEIGHT / 2, GAME_HEIGHT), 3, 1);
    }
    // Ocean wave line at horizon
    bg.fillStyle(COLORS.WATER_DARK, 0.6);
    bg.fillRect(0, GAME_HEIGHT / 2 - 3, GAME_WIDTH, 3);
    bg.fillStyle(0xffffff, 0.2);
    for (let wx = 0; wx < GAME_WIDTH; wx += 20) {
      bg.fillRect(wx + 4, GAME_HEIGHT / 2 - 3, 8, 1);
    }

    // Seashells on sand
    const shellColors = [0xfce4ec, 0xffffff, 0xf8bbd0, 0xffccbc];
    const shellPositions = [
      { x: 70, y: GAME_HEIGHT / 2 + 55 },
      { x: 180, y: GAME_HEIGHT / 2 + 40 },
      { x: 250, y: GAME_HEIGHT / 2 + 65 },
      { x: 130, y: GAME_HEIGHT / 2 + 70 },
    ];
    for (let i = 0; i < shellPositions.length; i++) {
      const sp = shellPositions[i];
      bg.fillStyle(shellColors[i % shellColors.length], 0.8);
      bg.fillRect(sp.x, sp.y, 3, 2);
      bg.fillRect(sp.x + 1, sp.y - 1, 1, 1);
    }

    // Palm trees
    for (const px of [40, GAME_WIDTH - 40]) {
      bg.fillStyle(COLORS.TREE_TRUNK, 1);
      bg.fillRect(px - 2, GAME_HEIGHT / 2 - 30, 4, 35);
      bg.fillStyle(COLORS.TREE_LEAVES, 1);
      bg.fillCircle(px, GAME_HEIGHT / 2 - 35, 15);
      bg.fillStyle(COLORS.TREE_LEAVES_LIGHT, 0.5);
      bg.fillCircle(px - 3, GAME_HEIGHT / 2 - 38, 6);
    }

    // Animated ocean waves
    const waveLines: Phaser.GameObjects.Graphics[] = [];
    for (let i = 0; i < 3; i++) {
      const wl = this.add.graphics().setDepth(DEPTH.GROUND + 1);
      wl.fillStyle(0xffffff, 0.15 - i * 0.03);
      wl.fillRect(0, GAME_HEIGHT / 2 - 1 + i * 4, GAME_WIDTH, 2);
      waveLines.push(wl);
    }
    // Gentle wave animation
    this.tweens.add({
      targets: waveLines,
      y: -2,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Crab on sand (slides left and right)
    const crab = this.add.graphics().setDepth(DEPTH.EFFECTS);
    crab.fillStyle(0xd32f2f, 1);
    crab.fillRect(-3, -2, 6, 4);
    crab.fillStyle(0xb71c1c, 1);
    crab.fillRect(-5, -1, 2, 2);
    crab.fillRect(3, -1, 2, 2);
    crab.fillStyle(0x000000, 1);
    crab.fillRect(-1, -2, 1, 1);
    crab.fillRect(2, -2, 1, 1);
    crab.setPosition(200, GAME_HEIGHT / 2 + 50);
    this.tweens.add({
      targets: crab,
      x: 240,
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // X marks the spot
    this.xMark = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, "X", {
        fontSize: "20px",
        fontFamily: FONT,
        color: "#e53935",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.OBJECTS)
      .setResolution(4);

    // Chest (hidden initially)
    this.chestGfx = this.add.graphics().setDepth(DEPTH.OBJECTS).setVisible(false);
    this.drawChest(GAME_WIDTH / 2 - 16, GAME_HEIGHT / 2 + 15, false);

    // Tadeo (movable — starts at left edge, walks to X)
    this.player = this.physics.add
      .sprite(30, GAME_HEIGHT / 2 + 30, "tadeo", 0)
      .setSize(10, 10)
      .setOffset(3, 14)
      .setDepth(DEPTH.PLAYER)
      .setCollideWorldBounds(true);

    // Overlap zone at the X mark
    this.xZone = this.physics.add.staticGroup();
    const zone = this.xZone.create(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, "") as Phaser.Physics.Arcade.Sprite;
    zone.setSize(20, 20).setVisible(false).refreshBody();
    this.physics.add.overlap(this.player, this.xZone, this.onReachX, undefined, this);

    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.dialogue = new DialogueManager(this);
  }

  update(_time: number, delta: number): void {
    if (this.dialogue.isActive) {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.dialogue.advance();
      this.player.setVelocity(0, 0);
      return;
    }

    if (this.phase === "walk") {
      const speed = 55;
      let vx = 0;
      let vy = 0;
      if (this.cursors.left.isDown) vx = -speed;
      else if (this.cursors.right.isDown) vx = speed;
      if (this.cursors.up.isDown) vy = -speed;
      else if (this.cursors.down.isDown) vy = speed;
      this.player.setVelocity(vx, vy);
      return;
    }

    if (this.phase === "dig") {
      this.updateDig();
    } else if (this.phase === "hammer") {
      this.updateHammer(delta);
    } else if (this.phase === "key") {
      this.updateKey(delta);
    }
  }

  // ---------------------------------------------------------------------------
  // Walk → Arrive at X
  // ---------------------------------------------------------------------------

  private onReachX(): void {
    if (this.phase !== "walk") return;
    this.phase = "arrive";
    this.player.setVelocity(0, 0);
    this.dialogue.startDialogue(DIALOGUES.treasure_arrive, () => {
      this.phase = "dig";
      this.startDigPhase();
    });
  }

  // ---------------------------------------------------------------------------
  // PHASE 1: DIG — Spacebar Mashing
  // ---------------------------------------------------------------------------

  private startDigPhase(): void {
    this.digCount = 0;
    const panelY = GAME_HEIGHT - 45;

    // Dark panel behind UI
    const panel = this.add.graphics().setDepth(DEPTH.UI);
    panel.fillStyle(COLORS.UI_BG, 0.8);
    panel.fillRect(BAR_X - 10, panelY - 20, BAR_W + 20, 42);

    this.digLabel = this.add
      .text(GAME_WIDTH / 2, panelY - 12, "Leertaste hämmern!", {
        fontSize: "8px",
        fontFamily: FONT,
        color: "#ffc107",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI)
      .setResolution(4);

    this.digBarGfx = this.add.graphics().setDepth(DEPTH.UI);
    this.drawDigBar(0);

    // Shovel icon next to the X
    this.shovelSprite = this.add.graphics().setDepth(DEPTH.EFFECTS);
    this.drawShovel(GAME_WIDTH / 2 + 10, GAME_HEIGHT / 2 + 20);
  }

  private updateDig(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.spaceKey)) return;

    AudioManager.getInstance().playSfx("sfx_dig");
    this.digCount++;
    const progress = Math.min(this.digCount / DIG_PRESSES, 1);
    this.drawDigBar(progress);

    // Shovel bob animation
    this.tweens.add({
      targets: this.shovelSprite,
      y: this.shovelSprite.y - 4,
      duration: 80,
      yoyo: true,
    });

    // Sand particles
    for (let i = 0; i < 3; i++) {
      const p = this.add
        .rectangle(
          GAME_WIDTH / 2 + Phaser.Math.Between(-15, 15),
          GAME_HEIGHT / 2 + 25,
          2, 2,
          COLORS.SAND_DARK
        )
        .setDepth(DEPTH.EFFECTS);
      this.tweens.add({
        targets: p,
        x: p.x + Phaser.Math.Between(-20, 20),
        y: p.y + Phaser.Math.Between(-30, -10),
        alpha: 0,
        duration: Phaser.Math.Between(300, 600),
        onComplete: () => p.destroy(),
      });
    }

    if (this.digCount >= DIG_PRESSES) {
      this.phase = "arrive"; // disable input temporarily
      this.digBarGfx.destroy();
      this.digLabel.destroy();
      this.shovelSprite.destroy();
      this.xMark.destroy();

      // Shake + reveal chest with ice
      this.cameras.main.shake(500, 0.01);
      this.time.delayedCall(500, () => {
        this.chestGfx.setVisible(true);
        this.drawIce(GAME_WIDTH / 2 - 20, GAME_HEIGHT / 2 + 10, 0);
        this.dialogue.startDialogue(DIALOGUES.treasure_dig, () => {
          this.phase = "hammer";
          this.startHammerPhase();
        });
      });
    }
  }

  private drawDigBar(progress: number): void {
    const y = GAME_HEIGHT - 35;
    this.digBarGfx.clear();
    // Background
    this.digBarGfx.fillStyle(0x333333, 1);
    this.digBarGfx.fillRect(BAR_X, y, BAR_W, BAR_H);
    // Fill
    this.digBarGfx.fillStyle(COLORS.CHEST_GOLD, 1);
    this.digBarGfx.fillRect(BAR_X + 1, y + 1, (BAR_W - 2) * progress, BAR_H - 2);
    // Border
    this.digBarGfx.lineStyle(1, COLORS.UI_BORDER, 1);
    this.digBarGfx.strokeRect(BAR_X, y, BAR_W, BAR_H);
  }

  private drawShovel(x: number, y: number): void {
    // Handle
    this.shovelSprite.fillStyle(COLORS.TREE_TRUNK, 1);
    this.shovelSprite.fillRect(x, y - 10, 2, 14);
    // Blade
    this.shovelSprite.fillStyle(COLORS.STONE, 1);
    this.shovelSprite.fillRect(x - 2, y + 4, 6, 4);
    this.shovelSprite.fillStyle(COLORS.STONE_DARK, 1);
    this.shovelSprite.fillRect(x - 2, y + 6, 6, 2);
  }

  // ---------------------------------------------------------------------------
  // PHASE 2: HAMMER — Timing Strikes
  // ---------------------------------------------------------------------------

  private startHammerPhase(): void {
    this.hammerHits = 0;
    this.markerX = 0;
    this.markerDir = 1;
    this.hammerBusy = false;

    const panelY = GAME_HEIGHT - 50;
    const panel = this.add.graphics().setDepth(DEPTH.UI);
    panel.fillStyle(COLORS.UI_BG, 0.8);
    panel.fillRect((GAME_WIDTH - METER_W) / 2 - 10, panelY - 22, METER_W + 20, 50);

    this.hammerLabel = this.add
      .text(GAME_WIDTH / 2, panelY - 14, "Im grünen Bereich drücken!", {
        fontSize: "8px",
        fontFamily: FONT,
        color: "#ffc107",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI)
      .setResolution(4);

    this.hitCountText = this.add
      .text(GAME_WIDTH / 2, panelY + 18, `Treffer: 0/${HAMMER_HITS}`, {
        fontSize: "8px",
        fontFamily: FONT,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI)
      .setResolution(4);

    this.meterGfx = this.add.graphics().setDepth(DEPTH.UI);
  }

  private updateHammer(delta: number): void {
    if (this.hammerBusy) return;

    // Move marker back and forth
    this.markerX += this.markerDir * METER_SPEED * (delta / 1000);
    if (this.markerX >= METER_W) {
      this.markerX = METER_W;
      this.markerDir = -1;
    } else if (this.markerX <= 0) {
      this.markerX = 0;
      this.markerDir = 1;
    }

    this.drawMeter();

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.hammerBusy = true;
      const sweetStart = (METER_W - SWEET_SPOT_W) / 2;
      const sweetEnd = sweetStart + SWEET_SPOT_W;
      const hit = this.markerX >= sweetStart && this.markerX <= sweetEnd;

      if (hit) {
        AudioManager.getInstance().playSfx("sfx_hammer_hit");
        this.hammerHits++;
        this.hitCountText.setText(`Treffer: ${this.hammerHits}/${HAMMER_HITS}`);
        this.cameras.main.flash(150, 100, 255, 100);

        // Update ice cracks
        this.chestGfx.clear();
        this.drawChest(GAME_WIDTH / 2 - 16, GAME_HEIGHT / 2 + 15, false);
        this.drawIce(GAME_WIDTH / 2 - 20, GAME_HEIGHT / 2 + 10, this.hammerHits);
        this.chestGfx.setVisible(true);

        if (this.hammerHits >= HAMMER_HITS) {
          this.phase = "arrive";
          this.meterGfx.destroy();
          this.hammerLabel.destroy();
          this.hitCountText.destroy();

          // Ice shatter
          this.cameras.main.shake(300, 0.02);
          this.cameras.main.flash(200, 100, 200, 255);
          this.spawnIceParticles();

          this.time.delayedCall(400, () => {
            this.chestGfx.clear();
            this.drawChest(GAME_WIDTH / 2 - 16, GAME_HEIGHT / 2 + 15, false);
            this.chestGfx.setVisible(true);
            this.dialogue.startDialogue(DIALOGUES.treasure_hammer, () => {
              this.phase = "key";
              this.startKeyPhase();
            });
          });
          return;
        }
      } else {
        AudioManager.getInstance().playSfx("sfx_hammer_miss");
        this.cameras.main.flash(100, 255, 50, 50);
      }

      // Brief pause before resuming
      this.time.delayedCall(300, () => {
        this.hammerBusy = false;
      });
    }
  }

  private drawMeter(): void {
    const meterX = (GAME_WIDTH - METER_W) / 2;
    const meterY = GAME_HEIGHT - 40;

    this.meterGfx.clear();
    // Background
    this.meterGfx.fillStyle(0x333333, 1);
    this.meterGfx.fillRect(meterX, meterY, METER_W, BAR_H);
    // Sweet spot (green zone in center)
    const sweetStart = (METER_W - SWEET_SPOT_W) / 2;
    this.meterGfx.fillStyle(0x4caf50, 0.7);
    this.meterGfx.fillRect(meterX + sweetStart, meterY, SWEET_SPOT_W, BAR_H);
    // Border
    this.meterGfx.lineStyle(1, COLORS.UI_BORDER, 1);
    this.meterGfx.strokeRect(meterX, meterY, METER_W, BAR_H);
    // Marker
    this.meterGfx.fillStyle(0xffffff, 1);
    this.meterGfx.fillRect(meterX + this.markerX - 1, meterY - 2, 3, BAR_H + 4);
  }

  private spawnIceParticles(): void {
    for (let i = 0; i < 12; i++) {
      const p = this.add
        .rectangle(
          GAME_WIDTH / 2 + Phaser.Math.Between(-15, 15),
          GAME_HEIGHT / 2 + 20,
          Phaser.Math.Between(2, 4),
          Phaser.Math.Between(2, 4),
          0x81d4fa
        )
        .setDepth(DEPTH.EFFECTS);
      this.tweens.add({
        targets: p,
        x: p.x + Phaser.Math.Between(-40, 40),
        y: p.y + Phaser.Math.Between(-40, -5),
        alpha: 0,
        duration: Phaser.Math.Between(400, 800),
        onComplete: () => p.destroy(),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // PHASE 3: KEY — Lockpicking
  // ---------------------------------------------------------------------------

  private startKeyPhase(): void {
    this.keyPosX = 0;
    this.sweetSpotX = Phaser.Math.Between(-KEY_RANGE / 2 + 15, KEY_RANGE / 2 - 15);
    this.keyBusy = false;

    const panelY = GAME_HEIGHT - 55;
    const panel = this.add.graphics().setDepth(DEPTH.UI);
    panel.fillStyle(COLORS.UI_BG, 0.8);
    panel.fillRect((GAME_WIDTH - KEY_RANGE) / 2 - 15, panelY - 22, KEY_RANGE + 30, 55);

    this.keyLabel = this.add
      .text(GAME_WIDTH / 2, panelY - 14, "Pfeiltasten: bewegen | Leertaste: probieren", {
        fontSize: "6px",
        fontFamily: FONT,
        color: "#ffc107",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI)
      .setResolution(4);

    this.proximityText = this.add
      .text(GAME_WIDTH / 2, panelY + 22, "Kalt...", {
        fontSize: "8px",
        fontFamily: FONT,
        color: "#64b5f6",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI)
      .setResolution(4);

    this.keyGfx = this.add.graphics().setDepth(DEPTH.UI);
  }

  private updateKey(delta: number): void {
    if (this.keyBusy) return;

    // Move key with arrow keys
    const moveSpeed = 60 * (delta / 1000);
    if (this.cursors.left.isDown) {
      this.keyPosX = Math.max(-KEY_RANGE / 2, this.keyPosX - moveSpeed);
    } else if (this.cursors.right.isDown) {
      this.keyPosX = Math.min(KEY_RANGE / 2, this.keyPosX + moveSpeed);
    }

    const dist = Math.abs(this.keyPosX - this.sweetSpotX);

    // Update proximity text
    if (dist > 30) {
      this.proximityText.setText("Kalt...");
      this.proximityText.setColor("#64b5f6");
    } else if (dist > 15) {
      this.proximityText.setText("Wärmer...");
      this.proximityText.setColor("#ffb74d");
    } else {
      this.proximityText.setText("Heiß!");
      this.proximityText.setColor("#ef5350");
    }

    this.drawKeyMeter(dist);

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.keyBusy = true;

      if (dist <= KEY_SNAP_DIST) {
        // Success!
        AudioManager.getInstance().playSfx("sfx_key_unlock");
        this.phase = "open";
        this.keyGfx.destroy();
        this.keyLabel.destroy();
        this.proximityText.destroy();
        this.cameras.main.flash(200, 255, 215, 0);
        this.time.delayedCall(300, () => {
          this.openChest();
        });
      } else {
        // Failed attempt — lock jiggles
        AudioManager.getInstance().playSfx("sfx_key_jiggle");
        this.cameras.main.shake(100, 0.005);
        this.time.delayedCall(400, () => {
          this.keyBusy = false;
        });
      }
    }
  }

  private drawKeyMeter(dist: number): void {
    const cx = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 40;
    const rangeStart = cx - KEY_RANGE / 2;

    this.keyGfx.clear();

    // Track background
    this.keyGfx.fillStyle(0x333333, 1);
    this.keyGfx.fillRect(rangeStart, y, KEY_RANGE, BAR_H);
    this.keyGfx.lineStyle(1, COLORS.UI_BORDER, 1);
    this.keyGfx.strokeRect(rangeStart, y, KEY_RANGE, BAR_H);

    // Key marker
    const keyScreenX = cx + this.keyPosX;
    this.keyGfx.fillStyle(COLORS.KEY_GOLD, 1);
    this.keyGfx.fillRect(keyScreenX - 3, y - 1, 6, BAR_H + 2);
    // Key teeth detail
    this.keyGfx.fillRect(keyScreenX - 1, y + BAR_H + 1, 2, 3);

    // Wobble indicator above key (faster when closer)
    const wobbleSpeed = dist > 30 ? 1500 : dist > 15 ? 600 : 200;
    const wobbleAmt = dist > 30 ? 1 : dist > 15 ? 2 : 3;
    const wobble = Math.sin(this.time.now / wobbleSpeed * Math.PI * 2) * wobbleAmt;
    // Small triangle above key
    this.keyGfx.fillStyle(0xffffff, 0.8);
    this.keyGfx.fillTriangle(
      keyScreenX + wobble, y - 6,
      keyScreenX - 3 + wobble, y - 3,
      keyScreenX + 3 + wobble, y - 3
    );
  }

  // ---------------------------------------------------------------------------
  // CHEST OPEN + VICTORY
  // ---------------------------------------------------------------------------

  private openChest(): void {
    AudioManager.getInstance().playSfx("sfx_chest_open");
    AudioManager.getInstance().playMusic("music_victory");
    this.chestGfx.clear();
    this.drawChest(GAME_WIDTH / 2 - 16, GAME_HEIGHT / 2 + 15, true);
    this.chestGfx.setVisible(true);

    // Gold particles
    for (let i = 0; i < 20; i++) {
      const p = this.add
        .rectangle(
          GAME_WIDTH / 2 + Phaser.Math.Between(-5, 5),
          GAME_HEIGHT / 2 + 20,
          2, 2,
          COLORS.CHEST_GOLD
        )
        .setDepth(DEPTH.EFFECTS);
      this.tweens.add({
        targets: p,
        x: p.x + Phaser.Math.Between(-40, 40),
        y: p.y + Phaser.Math.Between(-50, -10),
        alpha: 0,
        duration: Phaser.Math.Between(800, 1500),
        ease: "Power2",
        onComplete: () => p.destroy(),
      });
    }

    this.dialogue.startDialogue(DIALOGUES.treasure_open, () => {
      QuestManager.getInstance().completeMilestone();
      SaveManager.getInstance().save(this.returnData.returnX, this.returnData.returnY);
      this.cameras.main.fadeOut(600, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start(SCENES.VICTORY);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // DRAWING HELPERS
  // ---------------------------------------------------------------------------

  private drawChest(x: number, y: number, open: boolean): void {
    if (open) {
      this.chestGfx.fillStyle(COLORS.CHEST, 1);
      this.chestGfx.fillRect(x, y + 8, 32, 16);
      // Lid open
      this.chestGfx.fillStyle(0x7b5b47, 1);
      this.chestGfx.fillRect(x - 2, y - 4, 36, 12);
      // Gold
      this.chestGfx.fillStyle(COLORS.CHEST_GOLD, 1);
      this.chestGfx.fillRect(x + 4, y + 8, 24, 10);
      // Sparkle
      this.chestGfx.fillStyle(0xffffff, 1);
      this.chestGfx.fillRect(x + 10, y + 12, 2, 2);
      this.chestGfx.fillRect(x + 20, y + 10, 2, 2);
    } else {
      this.chestGfx.fillStyle(COLORS.CHEST, 1);
      this.chestGfx.fillRect(x, y, 32, 20);
      this.chestGfx.fillStyle(0x7b5b47, 1);
      this.chestGfx.fillRect(x, y, 32, 8);
      // Lock
      this.chestGfx.fillStyle(COLORS.KEY_GOLD, 1);
      this.chestGfx.fillRect(x + 14, y + 10, 4, 4);
      // Metal bands
      this.chestGfx.fillStyle(0x5d4037, 1);
      this.chestGfx.fillRect(x, y + 8, 32, 2);
    }
  }

  private drawIce(x: number, y: number, cracks: number): void {
    // Reason: each hammer hit reduces the ice opacity and adds crack lines,
    // giving visual feedback that the ice is breaking.
    const alpha = 0.6 - cracks * 0.15;
    this.chestGfx.fillStyle(0x81d4fa, Math.max(alpha, 0.1));
    this.chestGfx.fillRect(x, y, 40, 28);
    this.chestGfx.fillStyle(0xb3e5fc, Math.max(alpha - 0.1, 0.05));
    this.chestGfx.fillRect(x + 5, y + 3, 10, 6);
    this.chestGfx.fillRect(x + 22, y + 8, 8, 4);

    // Crack lines
    this.chestGfx.lineStyle(1, 0xffffff, 0.5);
    if (cracks >= 1) {
      this.chestGfx.lineBetween(x + 20, y, x + 15, y + 14);
      this.chestGfx.lineBetween(x + 15, y + 14, x + 22, y + 28);
    }
    if (cracks >= 2) {
      this.chestGfx.lineBetween(x + 10, y + 5, x + 25, y + 18);
      this.chestGfx.lineBetween(x + 30, y, x + 20, y + 20);
    }
  }
}
