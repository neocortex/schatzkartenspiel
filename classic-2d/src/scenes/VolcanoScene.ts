/**
 * VolcanoScene — Milestone 2: Dodge falling lava rocks for 30 seconds.
 */

import { GAME_WIDTH, GAME_HEIGHT, SCENES, COLORS, FONT, DEPTH } from "../config";
import { QuestManager } from "../systems/QuestManager";
import { SaveManager } from "../systems/SaveManager";
import { DialogueManager } from "../systems/DialogueManager";
import { AudioManager } from "../systems/AudioManager";
import { DIALOGUES } from "../data/dialogues";
import { randomInt } from "../utils/helpers";

export class VolcanoScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private rocks!: Phaser.Physics.Arcade.Group;
  private dialogue!: DialogueManager;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private timerText!: Phaser.GameObjects.Text;
  private timeLeft = 30;
  private isPlaying = false;
  private returnData!: { returnX: number; returnY: number };
  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private countdownTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super({ key: SCENES.VOLCANO });
  }

  init(data: { milestone: number; returnX: number; returnY: number }): void {
    this.returnData = { returnX: data.returnX, returnY: data.returnY };
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playMusic("music_dungeon");

    this.cameras.main.fadeIn(400);
    this.isPlaying = false;

    // Background — volcano with lava
    const bg = this.add.graphics();
    bg.fillStyle(0x3e2723, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.fillStyle(COLORS.DIRT_DARK, 1);
    bg.fillRect(0, GAME_HEIGHT - 30, GAME_WIDTH, 30);
    bg.fillStyle(COLORS.DIRT, 1);
    bg.fillRect(0, GAME_HEIGHT - 32, GAME_WIDTH, 4);
    bg.fillStyle(COLORS.STONE_DARK, 1);
    bg.fillTriangle(60, GAME_HEIGHT - 30, 160, 20, 260, GAME_HEIGHT - 30);
    bg.fillStyle(COLORS.LAVA, 0.8);
    bg.fillRect(145, 20, 30, 15);
    bg.fillStyle(COLORS.LAVA_GLOW, 0.6);
    bg.fillRect(150, 22, 20, 8);

    // Distant mountain silhouettes
    bg.fillStyle(COLORS.STONE, 0.3);
    bg.fillTriangle(10, GAME_HEIGHT - 30, 50, 60, 90, GAME_HEIGHT - 30);
    bg.fillTriangle(230, GAME_HEIGHT - 30, 280, 50, 310, GAME_HEIGHT - 30);
    bg.fillTriangle(270, GAME_HEIGHT - 30, 300, 70, 320, GAME_HEIGHT - 30);

    // Ground crack lines
    bg.lineStyle(1, COLORS.LAVA, 0.4);
    bg.lineBetween(30, GAME_HEIGHT - 20, 70, GAME_HEIGHT - 15);
    bg.lineBetween(100, GAME_HEIGHT - 18, 130, GAME_HEIGHT - 22);
    bg.lineBetween(180, GAME_HEIGHT - 16, 220, GAME_HEIGHT - 12);
    bg.lineBetween(250, GAME_HEIGHT - 20, 290, GAME_HEIGHT - 18);

    // Darker shading on volcano slope
    bg.fillStyle(0x4e342e, 0.5);
    bg.fillTriangle(65, GAME_HEIGHT - 30, 160, 24, 180, GAME_HEIGHT - 30);

    this.player = this.physics.add
      .sprite(GAME_WIDTH / 2, GAME_HEIGHT - 42, "tadeo", 0)
      .setCollideWorldBounds(true)
      .setSize(12, 10)
      .setOffset(2, 14);

    this.rocks = this.physics.add.group();
    this.physics.add.overlap(this.player, this.rocks, this.onHit, undefined, this);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.timerText = this.add
      .text(GAME_WIDTH / 2, 10, `Zeit: ${this.timeLeft}`, {
        fontSize: "10px",
        fontFamily: FONT,
        color: "#ffc107",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setResolution(4)
      .setScrollFactor(0);

    this.dialogue = new DialogueManager(this);
    this.dialogue.startDialogue(DIALOGUES.volcano_enter, () => {
      this.startChallenge();
    });
  }

  update(): void {
    if (this.dialogue.isActive) {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.dialogue.advance();
      }
      return;
    }

    if (!this.isPlaying) return;

    const speed = 100;
    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-speed);
      this.player.setFrame(4);
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(speed);
      this.player.setFrame(7);
    } else {
      this.player.setVelocityX(0);
      this.player.setFrame(0);
    }
  }

  private startChallenge(): void {
    this.isPlaying = true;
    this.spawnLavaParticles();
    this.timeLeft = 30;

    this.spawnTimer = this.time.addEvent({
      delay: 600,
      loop: true,
      callback: () => {
        this.spawnRock();
      },
    });

    this.countdownTimer = this.time.addEvent({
      delay: 1000,
      repeat: 29,
      callback: () => {
        this.timeLeft--;
        this.timerText.setText(`Zeit: ${this.timeLeft}`);
        if (this.timeLeft <= 10 && this.timeLeft > 0) {
          AudioManager.getInstance().playSfx("sfx_timer_warn");
        }
        // Increase rock spawn rate over time by recreating the timer
        if (this.spawnTimer && (this.timeLeft === 20 || this.timeLeft === 10)) {
          const newDelay = this.timeLeft === 20 ? 450 : 300;
          this.spawnTimer.destroy();
          this.spawnTimer = this.time.addEvent({
            delay: newDelay,
            loop: true,
            callback: () => { this.spawnRock(); },
          });
        }
        if (this.timeLeft <= 0) {
          this.winChallenge();
        }
      },
    });
  }

  /** Spawn lava glow and smoke particles at the crater for visual atmosphere. */
  private spawnLavaParticles(): void {
    // Lava glow particles — 2 orange/yellow rectangles every 500ms
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (!this.isPlaying) return;
        for (let i = 0; i < 2; i++) {
          const px = Phaser.Math.Between(148, 172);
          const color = Phaser.Math.RND.pick([COLORS.LAVA, COLORS.LAVA_GLOW]);
          const particle = this.add.rectangle(px, 22, 2, 2, color).setDepth(DEPTH.EFFECTS);
          this.tweens.add({
            targets: particle,
            y: 22 - Phaser.Math.Between(10, 25),
            alpha: 0,
            duration: Phaser.Math.Between(600, 1000),
            ease: "Sine.easeOut",
            onComplete: () => {
              particle.destroy();
            },
          });
        }
      },
    });

    // Smoke particles — 1 gray rectangle every 700ms
    this.time.addEvent({
      delay: 700,
      loop: true,
      callback: () => {
        if (!this.isPlaying) return;
        const px = Phaser.Math.Between(152, 168);
        const smoke = this.add.rectangle(px, 22, 2, 2, 0x9e9e9e, 0.4).setDepth(DEPTH.EFFECTS);
        this.tweens.add({
          targets: smoke,
          y: 22 - Phaser.Math.Between(15, 35),
          x: px - Phaser.Math.Between(5, 15),
          alpha: 0,
          duration: Phaser.Math.Between(800, 1400),
          ease: "Sine.easeOut",
          onComplete: () => {
            smoke.destroy();
          },
        });
      },
    });
  }

  private spawnRock(): void {
    AudioManager.getInstance().playSfx("sfx_lava_fall");
    const x = randomInt(10, GAME_WIDTH - 10);
    const rock = this.rocks.create(x, -8, "lava_rock") as Phaser.Physics.Arcade.Sprite;
    rock.setVelocityY(randomInt(50, 100));
    rock.setAngularVelocity(randomInt(-200, 200));
    this.time.delayedCall(5000, () => {
      if (rock.active) rock.destroy();
    });
  }

  private onHit(): void {
    if (!this.isPlaying) return;
    AudioManager.getInstance().playSfx("sfx_hit_damage");
    this.isPlaying = false;
    this.spawnTimer?.destroy();
    this.countdownTimer?.destroy();

    this.cameras.main.flash(300, 255, 0, 0);
    this.player.setTintFill(0xff0000);

    this.time.delayedCall(1000, () => {
      this.player.clearTint();
      const hint = QuestManager.getInstance().currentQuest.hint;
      const hintLine = [{ speaker: "Tipp", portrait: "", text: hint }];
      this.dialogue.startDialogue(hintLine, () => {
        this.rocks.clear(true, true);
        this.player.setPosition(GAME_WIDTH / 2, GAME_HEIGHT - 42);
        this.timeLeft = 30;
        this.timerText.setText(`Zeit: ${this.timeLeft}`);
        this.startChallenge();
      });
    });
  }

  private winChallenge(): void {
    this.isPlaying = false;
    this.spawnTimer?.destroy();
    this.rocks.clear(true, true);
    AudioManager.getInstance().playSfx("sfx_victory_fanfare");

    this.dialogue.startDialogue(DIALOGUES.volcano_complete, () => {
      QuestManager.getInstance().completeMilestone();
      SaveManager.getInstance().save(this.returnData.returnX, this.returnData.returnY);
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start(SCENES.OVERWORLD);
      });
    });
  }
}
