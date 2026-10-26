/**
 * BootScene — generates all sprites and shows a loading progress bar.
 */

import { GAME_WIDTH, GAME_HEIGHT, SCENES, FONT } from "../config";
import { generateAllSprites } from "../assets/SpriteFactory";
import { generateCreatureSprites } from "../assets/DecorationFactory";
import { generateAllSounds } from "../assets/SoundFactory";
import { AudioManager } from "../systems/AudioManager";
import { NarrationManager } from "../systems/NarrationManager";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.BOOT });
  }

  preload(): void {
    // Progress bar
    const barW = 160;
    const barH = 10;
    const barX = (GAME_WIDTH - barW) / 2;
    const barY = GAME_HEIGHT / 2;

    const bg = this.add.graphics();
    bg.fillStyle(0x333333, 1);
    bg.fillRect(barX, barY, barW, barH);

    const bar = this.add.graphics();

    const loadingText = this.add
      .text(GAME_WIDTH / 2, barY - 16, "Lade Abenteuer...", {
        fontSize: "8px",
        fontFamily: FONT,
        color: "#ffc107",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setResolution(4);

    this.load.on("progress", (value: number) => {
      bar.clear();
      bar.fillStyle(0xffc107, 1);
      bar.fillRect(barX + 1, barY + 1, (barW - 2) * value, barH - 2);
    });

    this.load.on("complete", () => {
      bg.destroy();
      bar.destroy();
      loadingText.destroy();
    });

    // Reason: We don't load external files — sprites are generated in create().
    // But Phaser needs at least one load event to fire progress, so add a dummy.
    this.load.json("dummy", "data:application/json;base64,e30=");
  }

  create(): void {
    // Generate all programmatic sprites
    generateAllSprites(this);
    generateCreatureSprites(this);

    // Generate all programmatic sounds
    generateAllSounds(this);
    AudioManager.getInstance().init(this);
    NarrationManager.getInstance().init();

    // Brief delay for the loading screen to be visible
    this.time.delayedCall(300, () => {
      this.scene.start(SCENES.TITLE);
    });
  }
}
