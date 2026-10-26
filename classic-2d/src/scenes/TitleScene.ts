/**
 * TitleScene — 80s retro movie-poster style main menu.
 * Dramatic gradient, Tadeo hero pose, game items, scanlines, bold typography.
 */

import { GAME_WIDTH, GAME_HEIGHT, SCENES, COLORS, FONT, TILE_SIZE, DEPTH } from "../config";
import { SaveManager } from "../systems/SaveManager";
import { QuestManager } from "../systems/QuestManager";
import { InventoryManager } from "../systems/InventoryManager";
import { AudioManager } from "../systems/AudioManager";
import { NarrationManager } from "../systems/NarrationManager";
import { QUESTS } from "../data/quests";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.TITLE });
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playMusic("music_title");

    // -----------------------------------------------------------------------
    // BACKGROUND — twilight sky fading to warm horizon
    // -----------------------------------------------------------------------
    const bg = this.add.graphics().setDepth(DEPTH.GROUND);

    // Muted twilight gradient (dark navy → dusky indigo → warm amber near horizon)
    const gradientColors = [
      0x0a1628, 0x0d1b2a, 0x11253d, 0x162d4a, 0x1b3a5c,
      0x253f5e, 0x2e4460, 0x3d4a5c, 0x5c4a40, 0x7a5a3a,
      0x9a6830, 0xb87828, 0xc88530, 0xb87828, 0x8a6035,
    ];
    const bandH = Math.ceil(GAME_HEIGHT / gradientColors.length);
    for (let i = 0; i < gradientColors.length; i++) {
      bg.fillStyle(gradientColors[i], 1);
      bg.fillRect(0, i * bandH, GAME_WIDTH, bandH + 1);
    }

    // Subtle sun glow near horizon (warm, not intense)
    bg.fillStyle(0xc88530, 0.15);
    bg.fillCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, 60);
    bg.fillStyle(0xdaa548, 0.1);
    bg.fillCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, 40);

    // Island silhouette at bottom
    const islandY = GAME_HEIGHT - 55;
    bg.fillStyle(0x1b3a20, 1);
    bg.fillRect(30, islandY, 260, 55);
    bg.fillStyle(0x24502b, 1);
    // Hill shapes
    bg.fillEllipse(80, islandY, 60, 30);
    bg.fillEllipse(140, islandY - 2, 50, 35);
    bg.fillEllipse(200, islandY, 55, 28);
    bg.fillEllipse(250, islandY + 2, 45, 24);
    bg.fillEllipse(55, islandY + 3, 40, 22);
    // Trees on the island
    bg.fillStyle(0x2e5c35, 0.9);
    bg.fillEllipse(90, islandY - 10, 14, 18);
    bg.fillEllipse(150, islandY - 14, 12, 20);
    bg.fillEllipse(210, islandY - 8, 16, 16);
    bg.fillEllipse(120, islandY - 6, 10, 14);
    // Palm tree trunk + top
    bg.fillStyle(0x4a3520, 1);
    bg.fillRect(168, islandY - 22, 2, 18);
    bg.fillStyle(0x2e5c35, 1);
    bg.fillEllipse(169, islandY - 25, 14, 10);

    // Water
    bg.fillStyle(0x152a45, 1);
    bg.fillRect(0, GAME_HEIGHT - 22, GAME_WIDTH, 22);
    bg.fillStyle(0x2a4a6a, 0.4);
    for (let wx = 0; wx < GAME_WIDTH; wx += 18) {
      bg.fillRect(wx, GAME_HEIGHT - 20, 9, 2);
    }
    bg.fillStyle(0x3a5a7a, 0.3);
    for (let wx = 8; wx < GAME_WIDTH; wx += 22) {
      bg.fillRect(wx, GAME_HEIGHT - 14, 7, 1);
    }

    // Stars in the upper sky
    for (let i = 0; i < 45; i++) {
      const sx = Phaser.Math.Between(0, GAME_WIDTH);
      const sy = Phaser.Math.Between(0, GAME_HEIGHT * 0.4);
      const size = i < 5 ? 2 : 1;
      const star = this.add.rectangle(sx, sy, size, size, 0xffffff)
        .setAlpha(Phaser.Math.FloatBetween(0.2, 0.8))
        .setDepth(DEPTH.GROUND + 1);
      this.tweens.add({
        targets: star,
        alpha: { from: star.alpha, to: 0.05 },
        duration: Phaser.Math.Between(1200, 3000),
        yoyo: true,
        repeat: -1,
      });
    }

    // -----------------------------------------------------------------------
    // TITLE — gold text with dark stroke
    // -----------------------------------------------------------------------
    const title = this.add
      .text(GAME_WIDTH / 2, 22, "SCHATZKARTENSPIEL", {
        fontSize: "14px",
        fontFamily: FONT,
        color: "#ffc107",
        fontStyle: "bold",
        stroke: "#1a1a2e",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI)
      .setResolution(4);

    // Subtitle
    this.add
      .text(GAME_WIDTH / 2, 40, "Das Abenteuer von Tadeo", {
        fontSize: "7px",
        fontFamily: FONT,
        color: "#c8a86e",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI)
      .setResolution(4);

    // Title float animation
    this.tweens.add({
      targets: title,
      y: "-=2",
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // -----------------------------------------------------------------------
    // TADEO — hero pose, center, scaled up
    // -----------------------------------------------------------------------
    const tadeo = this.add
      .sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 5, "tadeo", 6)
      .setDepth(DEPTH.PLAYER)
      .setScale(2.5);

    // Gentle hero bob
    this.tweens.add({
      targets: tadeo,
      y: "-=2",
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // -----------------------------------------------------------------------
    // GAME ITEMS — arranged around Tadeo
    // -----------------------------------------------------------------------

    // Sword (left side, angled)
    const sword = this.add.sprite(50, GAME_HEIGHT / 2 - 20, "items", 0)
      .setDepth(DEPTH.EFFECTS).setScale(1.8).setAngle(-25);
    this.tweens.add({
      targets: sword,
      y: "-=3",
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Hammer (right side, angled)
    const hammer = this.add.sprite(GAME_WIDTH - 50, GAME_HEIGHT / 2 - 20, "items", 3)
      .setDepth(DEPTH.EFFECTS).setScale(1.8).setAngle(20);
    this.tweens.add({
      targets: hammer,
      y: "-=3",
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Key (lower left)
    const key = this.add.sprite(70, GAME_HEIGHT / 2 + 25, "items", 2)
      .setDepth(DEPTH.EFFECTS).setScale(1.4);
    this.tweens.add({
      targets: key,
      angle: { from: -8, to: 8 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Berries (lower right)
    const berries = this.add.sprite(GAME_WIDTH - 70, GAME_HEIGHT / 2 + 25, "items", 1)
      .setDepth(DEPTH.EFFECTS).setScale(1.4);
    this.tweens.add({
      targets: berries,
      y: "-=2",
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // -----------------------------------------------------------------------
    // OGRE SILHOUETTE (left of center, partially behind island)
    // -----------------------------------------------------------------------
    const ogreGfx = this.add.graphics().setDepth(DEPTH.ENTITIES);
    const ox = 30;
    const oy = 68;
    // Body
    ogreGfx.fillStyle(COLORS.OGRE_SKIN, 0.6);
    ogreGfx.fillRect(ox - 8, oy, 16, 18);
    ogreGfx.fillRect(ox - 10, oy + 4, 20, 10);
    // Head
    ogreGfx.fillRect(ox - 5, oy - 8, 10, 10);
    ogreGfx.fillStyle(COLORS.OGRE_DARK, 0.7);
    ogreGfx.fillRect(ox - 6, oy - 6, 3, 3);
    // Club
    ogreGfx.fillStyle(0x5d4037, 0.6);
    ogreGfx.fillRect(ox + 8, oy - 5, 3, 20);
    ogreGfx.fillStyle(0x795548, 0.7);
    ogreGfx.fillRect(ox + 6, oy - 8, 7, 5);
    // Eyes
    ogreGfx.fillStyle(0xcc4444, 0.8);
    ogreGfx.fillRect(ox - 3, oy - 5, 2, 2);
    ogreGfx.fillRect(ox + 2, oy - 5, 2, 2);

    // -----------------------------------------------------------------------
    // SHARK SILHOUETTE (right of center)
    // -----------------------------------------------------------------------
    const sharkGfx = this.add.graphics().setDepth(DEPTH.ENTITIES);
    const shx = GAME_WIDTH - 35;
    const shy = 72;
    // Body
    sharkGfx.fillStyle(COLORS.SHARK_BODY, 0.6);
    sharkGfx.fillRect(shx - 12, shy, 24, 8);
    sharkGfx.fillRect(shx - 8, shy - 2, 16, 4);
    // Belly
    sharkGfx.fillStyle(COLORS.SHARK_BELLY, 0.4);
    sharkGfx.fillRect(shx - 8, shy + 6, 16, 2);
    // Dorsal fin
    sharkGfx.fillStyle(COLORS.SHARK_BODY, 0.7);
    sharkGfx.fillTriangle(shx, shy - 8, shx - 4, shy, shx + 4, shy);
    // Tail
    sharkGfx.fillTriangle(shx - 14, shy, shx - 18, shy - 5, shx - 18, shy + 5);
    // Eye
    sharkGfx.fillStyle(0xcc4444, 0.8);
    sharkGfx.fillRect(shx + 8, shy + 1, 2, 2);
    // Teeth
    sharkGfx.fillStyle(0xffffff, 0.6);
    for (let t = 0; t < 4; t++) {
      sharkGfx.fillRect(shx + 4 + t * 2, shy + 5, 1, 2);
    }

    // -----------------------------------------------------------------------
    // TREASURE CHEST (on the island)
    // -----------------------------------------------------------------------
    const chestGfx = this.add.graphics().setDepth(DEPTH.OBJECTS);
    const ccx = GAME_WIDTH / 2;
    const ccy = islandY + 10;
    // Body
    chestGfx.fillStyle(COLORS.CHEST, 1);
    chestGfx.fillRect(ccx - 10, ccy, 20, 12);
    // Lid
    chestGfx.fillStyle(0x7b5b47, 1);
    chestGfx.fillRect(ccx - 11, ccy - 6, 22, 7);
    // Gold inside
    chestGfx.fillStyle(COLORS.CHEST_GOLD, 0.9);
    chestGfx.fillRect(ccx - 6, ccy, 12, 6);
    // Lock
    chestGfx.fillStyle(COLORS.KEY_GOLD, 1);
    chestGfx.fillRect(ccx - 2, ccy + 5, 4, 3);
    // Sparkle
    chestGfx.fillStyle(0xffffff, 0.7);
    chestGfx.fillRect(ccx - 4, ccy + 2, 1, 1);
    chestGfx.fillRect(ccx + 3, ccy + 1, 1, 1);

    // Subtle chest glow
    const chestGlow = this.add.rectangle(ccx, ccy + 3, 28, 20, COLORS.CHEST_GOLD)
      .setDepth(DEPTH.OBJECTS - 1).setAlpha(0.08);
    this.tweens.add({
      targets: chestGlow,
      alpha: { from: 0.05, to: 0.15 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
    });

    // -----------------------------------------------------------------------
    // CRT SCANLINES — subtle retro overlay
    // -----------------------------------------------------------------------
    const scanlines = this.add.graphics().setDepth(DEPTH.UI - 1);
    scanlines.fillStyle(0x000000, 0.05);
    for (let sy = 0; sy < GAME_HEIGHT; sy += 2) {
      scanlines.fillRect(0, sy, GAME_WIDTH, 1);
    }

    // Vignette — soft darken edges
    const vignette = this.add.graphics().setDepth(DEPTH.UI - 2);
    vignette.fillStyle(0x000000, 0.3);
    vignette.fillRect(0, 0, 6, GAME_HEIGHT);
    vignette.fillRect(GAME_WIDTH - 6, 0, 6, GAME_HEIGHT);
    vignette.fillStyle(0x000000, 0.15);
    vignette.fillRect(6, 0, 6, GAME_HEIGHT);
    vignette.fillRect(GAME_WIDTH - 12, 0, 6, GAME_HEIGHT);

    // -----------------------------------------------------------------------
    // START PROMPT
    // -----------------------------------------------------------------------
    const hasSave = SaveManager.getInstance().hasSave();
    const promptLabel = hasSave
      ? "Leertaste: Fortsetzen  |  N: Neues Spiel"
      : "Drücke die Leertaste zum Starten!";

    const prompt = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 16, promptLabel, {
        fontSize: "7px",
        fontFamily: FONT,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI)
      .setResolution(4);

    this.tweens.add({
      targets: prompt,
      alpha: { from: 1, to: 0.2 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    if (NarrationManager.getInstance().supported) {
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT - 6, "V: Erzählerstimme an/aus", {
          fontSize: "6px",
          fontFamily: FONT,
          color: "#cccccc",
          stroke: "#000000",
          strokeThickness: 1,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.UI)
        .setResolution(4);
    }

    // -----------------------------------------------------------------------
    // INPUT HANDLING + DEBUG MENU (unchanged logic)
    // -----------------------------------------------------------------------
    let debugOpen = false;
    let debugSelection = 0;
    let debugContainer: Phaser.GameObjects.Container | null = null;
    let debugTexts: Phaser.GameObjects.Text[] = [];

    const updateDebugSelection = () => {
      debugTexts.forEach((t, i) => {
        t.setColor(i === debugSelection ? "#ffc107" : "#aaaaaa");
      });
    };

    const openDebugMenu = () => {
      debugOpen = true;
      debugSelection = 0;

      const panel = this.add.graphics();
      panel.fillStyle(0x000000, 0.9);
      panel.fillRect(20, 20, GAME_WIDTH - 40, GAME_HEIGHT - 40);
      panel.lineStyle(1, 0xffc107, 1);
      panel.strokeRect(20, 20, GAME_WIDTH - 40, GAME_HEIGHT - 40);

      const header = this.add
        .text(GAME_WIDTH / 2, 30, "Stage Select (Debug)", {
          fontSize: "8px",
          fontFamily: FONT,
          color: "#ffc107",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0)
        .setResolution(4);

      debugTexts = QUESTS.map((q, i) => {
        return this.add
          .text(35, 46 + i * 16, `${q.id}. ${q.name}`, {
            fontSize: "7px",
            fontFamily: FONT,
            color: "#aaaaaa",
            stroke: "#000000",
            strokeThickness: 1,
          })
          .setResolution(4);
      });

      const hint = this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT - 30, "Pfeiltasten + Leertaste | D: Schließen", {
          fontSize: "6px",
          fontFamily: FONT,
          color: "#888888",
          stroke: "#000000",
          strokeThickness: 1,
        })
        .setOrigin(0.5)
        .setResolution(4);

      debugContainer = this.add.container(0, 0, [panel, header, hint, ...debugTexts]);
      debugContainer.setDepth(1000);
      updateDebugSelection();
    };

    const closeDebugMenu = () => {
      debugOpen = false;
      if (debugContainer) {
        debugContainer.destroy(true);
        debugContainer = null;
      }
      debugTexts = [];
    };

    const jumpToMilestone = (milestone: number) => {
      // Set milestone and grant all items from prior quests
      const quest = QuestManager.getInstance();
      const inventory = InventoryManager.getInstance();
      inventory.reset();
      quest.setMilestone(milestone);
      for (const q of QUESTS) {
        if (q.id < milestone && q.reward) {
          inventory.addItem(q.reward);
        }
      }

      // Save at the trigger zone of the selected milestone
      const target = QUESTS[milestone - 1];
      const px = (target.triggerX + target.triggerW / 2) * TILE_SIZE;
      const py = (target.triggerY + target.triggerH / 2) * TILE_SIZE;
      SaveManager.getInstance().save(px, py);

      closeDebugMenu();
      this.fadeToOverworld();
    };

    this.input.keyboard!.on("keydown", (event: KeyboardEvent) => {
      if (debugOpen) {
        if (event.code === "ArrowUp") {
          debugSelection = Math.max(0, debugSelection - 1);
          updateDebugSelection();
          audio.playSfx("sfx_menu_select");
        } else if (event.code === "ArrowDown") {
          debugSelection = Math.min(QUESTS.length - 1, debugSelection + 1);
          updateDebugSelection();
          audio.playSfx("sfx_menu_select");
        } else if (event.code === "Space") {
          audio.playSfx("sfx_menu_confirm");
          jumpToMilestone(QUESTS[debugSelection].id);
        } else if (event.code === "KeyD") {
          closeDebugMenu();
        }
        return;
      }

      if (event.code === "KeyD") {
        openDebugMenu();
        return;
      }

      if (event.code === "Space") {
        audio.playSfx("sfx_menu_confirm");
        if (hasSave) {
          SaveManager.getInstance().load();
        }
        this.fadeToOverworld();
      } else if (event.code === "KeyN" && hasSave) {
        audio.playSfx("sfx_menu_confirm");
        SaveManager.getInstance().fullReset();
        this.fadeToOverworld();
      }
    });
  }

  private fadeToOverworld(): void {
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENES.OVERWORLD);
    });
  }
}
