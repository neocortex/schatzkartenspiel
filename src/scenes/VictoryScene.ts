/**
 * VictoryScene — Ending cinematic after the treasure is found.
 * Shows congratulations, final dialogue, and credits.
 */

import { GAME_WIDTH, GAME_HEIGHT, SCENES, COLORS, DEPTH, FONT } from "../config";
import { DialogueManager } from "../systems/DialogueManager";
import { AudioManager } from "../systems/AudioManager";
import { DIALOGUES } from "../data/dialogues";
import { SaveManager } from "../systems/SaveManager";

export class VictoryScene extends Phaser.Scene {
  private dialogue!: DialogueManager;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: SCENES.VICTORY });
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playMusic("music_victory");

    this.cameras.main.fadeIn(800);

    // Starry night background
    const bg = this.add.graphics().setDepth(DEPTH.GROUND);
    bg.fillStyle(0x0d1b2a, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Stars
    for (let i = 0; i < 60; i++) {
      const sx = Phaser.Math.Between(0, GAME_WIDTH);
      const sy = Phaser.Math.Between(0, GAME_HEIGHT - 60);
      const size = i < 10 ? 2 : 1;
      const starColors = [0xffffff, 0xffffff, 0xffffff, 0xffd54f, 0xbbdefb];
      const color = starColors[i % starColors.length];
      const star = this.add.rectangle(sx, sy, size, size, color).setAlpha(Phaser.Math.FloatBetween(0.3, 1));
      this.tweens.add({
        targets: star,
        alpha: { from: star.alpha, to: 0.1 },
        duration: Phaser.Math.Between(800, 2500),
        yoyo: true,
        repeat: -1,
      });
    }

    // Chest glow
    const glow = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 12, 52, 34, COLORS.CHEST_GOLD)
      .setDepth(DEPTH.SHADOWS).setAlpha(0.3);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.15, to: 0.4 },
      scale: { from: 1, to: 1.1 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
    });

    // Treasure chest (open) in center
    const chestGfx = this.add.graphics().setDepth(DEPTH.OBJECTS);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 + 10;
    // Chest body
    chestGfx.fillStyle(COLORS.CHEST, 1);
    chestGfx.fillRect(cx - 20, cy, 40, 24);
    // Lid
    chestGfx.fillStyle(0x7b5b47, 1);
    chestGfx.fillRect(cx - 22, cy - 14, 44, 16);
    chestGfx.fillRect(cx - 20, cy - 16, 40, 4);
    // Gold
    chestGfx.fillStyle(COLORS.CHEST_GOLD, 1);
    chestGfx.fillRect(cx - 14, cy, 28, 14);
    // Sparkles
    chestGfx.fillStyle(0xffffff, 1);
    chestGfx.fillRect(cx - 8, cy + 4, 2, 2);
    chestGfx.fillRect(cx + 6, cy + 8, 2, 2);
    chestGfx.fillRect(cx + 2, cy + 2, 2, 2);

    // Gold particles floating up
    for (let i = 0; i < 15; i++) {
      const p = this.add
        .rectangle(
          cx + Phaser.Math.Between(-20, 20),
          cy + Phaser.Math.Between(-5, 10),
          2,
          2,
          COLORS.CHEST_GOLD
        )
        .setDepth(DEPTH.EFFECTS);
      this.tweens.add({
        targets: p,
        y: p.y - Phaser.Math.Between(30, 80),
        alpha: { from: 1, to: 0 },
        duration: Phaser.Math.Between(1500, 3000),
        delay: Phaser.Math.Between(0, 2000),
        repeat: -1,
      });
    }

    // Fireworks timer
    this.time.addEvent({
      delay: 2500,
      loop: true,
      startAt: 2000,
      callback: () => this.launchFirework(),
    });

    // Confetti rain
    const confettiColors = [0xff1744, 0x00e676, 0x2979ff, 0xffc107, 0xd500f9];
    for (let i = 0; i < 12; i++) {
      const cx2 = Phaser.Math.Between(0, GAME_WIDTH);
      const confetti = this.add.rectangle(cx2, -Phaser.Math.Between(0, GAME_HEIGHT), 2, 3,
        confettiColors[i % confettiColors.length]
      ).setDepth(DEPTH.EFFECTS).setAlpha(0.7);
      this.tweens.add({
        targets: confetti,
        y: GAME_HEIGHT + 10,
        x: cx2 + Phaser.Math.Between(-30, 30),
        duration: Phaser.Math.Between(4000, 7000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 3000),
      });
    }

    // Tadeo next to the chest
    this.add.sprite(cx - 35, cy + 10, "tadeo", 6).setDepth(DEPTH.PLAYER).setScale(1.5);

    // Victory message
    const title = this.add
      .text(GAME_WIDTH / 2, 30, "Der Schatz wurde gefunden!", {
        fontSize: "10px",
        fontFamily: FONT,
        color: "#ffd54f",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI)
      .setResolution(4);

    this.tweens.add({
      targets: title,
      scale: { from: 1, to: 1.05 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Items collected display
    const itemNames = ["Magisches Schwert", "Zauberbeeren", "Goldener Schlüssel", "Goldener Hammer"];
    for (let i = 0; i < 4; i++) {
      this.add
        .sprite(GAME_WIDTH / 2 - 50, GAME_HEIGHT - 55 + i * 14, "items", i)
        .setDepth(DEPTH.UI)
        .setScale(0.6);
      this.add
        .text(GAME_WIDTH / 2 - 38, GAME_HEIGHT - 55 + i * 14, itemNames[i], {
          fontSize: "8px",
          fontFamily: FONT,
          color: "#ffc107",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.UI)
        .setResolution(4);
    }

    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.dialogue = new DialogueManager(this);

    // Play victory dialogue
    this.time.delayedCall(1500, () => {
      this.dialogue.startDialogue(DIALOGUES.victory, () => {
        this.showCredits();
      });
    });
  }

  update(): void {
    if (this.dialogue.isActive) {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.dialogue.advance();
    }
  }

  private launchFirework(): void {
    const fx = Phaser.Math.Between(30, GAME_WIDTH - 30);
    const fy = Phaser.Math.Between(15, 70);
    const rocket = this.add.rectangle(fx, GAME_HEIGHT - 10, 1, 3, 0xffffff).setDepth(DEPTH.EFFECTS);

    this.tweens.add({
      targets: rocket,
      y: fy,
      duration: 500,
      onComplete: () => {
        rocket.destroy();
        const colors = [0xff1744, 0x00e676, 0x2979ff, 0xffc107, 0xd500f9, 0xff6d00];
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          const dist = Phaser.Math.Between(15, 35);
          const p = this.add.rectangle(fx, fy, 2, 2,
            colors[Phaser.Math.Between(0, colors.length - 1)]
          ).setDepth(DEPTH.EFFECTS);
          this.tweens.add({
            targets: p,
            x: fx + Math.cos(angle) * dist,
            y: fy + Math.sin(angle) * dist,
            alpha: 0,
            duration: Phaser.Math.Between(500, 1000),
            onComplete: () => p.destroy(),
          });
        }
      },
    });
  }

  private showCredits(): void {
    const credits = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 8, "Drücke Leertaste für ein neues Spiel", {
        fontSize: "8px",
        fontFamily: FONT,
        color: "#9e9e9e",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI)
      .setResolution(4);

    this.tweens.add({
      targets: credits,
      alpha: { from: 1, to: 0.3 },
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

    this.spaceKey.once("down", () => {
      SaveManager.getInstance().fullReset();
      this.cameras.main.fadeOut(600, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start(SCENES.TITLE);
      });
    });
  }
}
