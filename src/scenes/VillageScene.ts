/**
 * VillageScene — Milestone 7: Simon Says pattern memory game.
 * 3 NPCs each show a pattern of colored panels. Player repeats with arrow keys.
 */

import { GAME_WIDTH, GAME_HEIGHT, SCENES, COLORS, DEPTH, FONT } from "../config";
import { QuestManager } from "../systems/QuestManager";
import { InventoryManager } from "../systems/InventoryManager";
import { SaveManager } from "../systems/SaveManager";
import { DialogueManager } from "../systems/DialogueManager";
import { AudioManager } from "../systems/AudioManager";
import { DIALOGUES } from "../data/dialogues";
import { randomInt } from "../utils/helpers";

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";
const DIRECTIONS: Direction[] = ["UP", "DOWN", "LEFT", "RIGHT"];

type SimonState =
  | "EXPLORE"
  | "SHOWING_PATTERN"
  | "AWAITING_INPUT"
  | "AWAITING_MATH"
  | "FEEDBACK_CORRECT"
  | "FEEDBACK_WRONG"
  | "VICTORY";

interface SimonNPC {
  npcX: number;
  npcY: number;
  introKey: string;
  successKey: string;
  failKey: string;
  portrait: string;
  patternLength: number;
  pattern: Direction[];
  solved: boolean;
}

const PANEL_SIZE = 28;
const PANEL_GAP = 30;
const PANEL_CX = GAME_WIDTH / 2;
const PANEL_CY = GAME_HEIGHT / 2;

const SIMON_COLORS: Record<Direction, { base: number; lit: number }> = {
  UP:    { base: 0x4caf50, lit: 0x81c784 },
  DOWN:  { base: 0xe53935, lit: 0xff8a80 },
  LEFT:  { base: 0x42a5f5, lit: 0x90caf9 },
  RIGHT: { base: 0xffc107, lit: 0xfff176 },
};

const PANEL_POS: Record<Direction, { x: number; y: number }> = {
  UP:    { x: PANEL_CX, y: PANEL_CY - PANEL_GAP },
  DOWN:  { x: PANEL_CX, y: PANEL_CY + PANEL_GAP },
  LEFT:  { x: PANEL_CX - PANEL_GAP, y: PANEL_CY },
  RIGHT: { x: PANEL_CX + PANEL_GAP, y: PANEL_CY },
};

export class VillageScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private dialogue!: DialogueManager;
  private returnData!: { returnX: number; returnY: number };

  private gameState: SimonState = "EXPLORE";
  private simonNPCs: SimonNPC[] = [];
  private activeNPC: SimonNPC | null = null;
  private currentInputIndex = 0;

  // Panel UI
  private panelContainer!: Phaser.GameObjects.Container;
  private panelGfx!: Record<Direction, Phaser.GameObjects.Graphics>;
  private statusText!: Phaser.GameObjects.Text;
  private progressDots: Phaser.GameObjects.Graphics[] = [];
  private checkmarks: Phaser.GameObjects.Text[] = [];

  // Math challenge (3rd NPC)
  private mathAnswer = 0;
  private mathInput = "";
  private mathContainer: Phaser.GameObjects.Container | null = null;
  private mathInputText: Phaser.GameObjects.Text | null = null;
  private mathKeyHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor() {
    super({ key: SCENES.VILLAGE });
  }

  init(data: { milestone: number; returnX: number; returnY: number }): void {
    this.returnData = { returnX: data.returnX, returnY: data.returnY };
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playMusic("music_village");

    this.cameras.main.fadeIn(400);
    this.gameState = "EXPLORE";
    this.activeNPC = null;

    // Village background
    const bg = this.add.graphics().setDepth(DEPTH.GROUND);
    bg.fillStyle(COLORS.GRASS_LIGHT, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.fillStyle(COLORS.PATH, 1);
    bg.fillRect(0, GAME_HEIGHT / 2 - 8, GAME_WIDTH, 16);
    for (let i = 0; i < 3; i++) {
      const hx = 40 + i * 100;
      bg.fillStyle(COLORS.WALL, 1);
      bg.fillRect(hx, 40, 40, 30);
      bg.fillStyle(COLORS.ROOF, 1);
      bg.fillTriangle(hx - 4, 40, hx + 20, 20, hx + 44, 40);
      bg.fillStyle(COLORS.DOOR, 1);
      bg.fillRect(hx + 15, 52, 10, 18);
      // Window
      bg.fillStyle(0x81d4fa, 0.7);
      bg.fillRect(hx + 5, 48, 6, 6);
      bg.lineStyle(1, COLORS.WALL, 1);
      bg.strokeRect(hx + 5, 48, 6, 6);
      // Flowers at base of house
      const flowerColors = [0xe53935, 0xfdd835, 0x7b1fa2];
      for (let f = 0; f < 5; f++) {
        bg.fillStyle(flowerColors[f % 3], 0.9);
        bg.fillRect(hx + 3 + f * 8, 70, 2, 2);
        bg.fillStyle(0x4caf50, 0.8);
        bg.fillRect(hx + 3 + f * 8, 72, 1, 3);
      }
    }

    // Chimney smoke from first house
    const smokeX = 60;
    for (let s = 0; s < 3; s++) {
      const smoke = this.add
        .circle(smokeX, 18 - s * 8, 3 + s, 0xbdbdbd, 0.3 - s * 0.08)
        .setDepth(DEPTH.EFFECTS);
      this.tweens.add({
        targets: smoke,
        y: smoke.y - 20,
        x: smoke.x + 5,
        alpha: 0,
        duration: 3000 + s * 500,
        repeat: -1,
        ease: "Sine.easeOut",
      });
    }

    // NPCs
    this.simonNPCs = [
      {
        npcX: 60, npcY: 140,
        introKey: "village_simon1_intro", successKey: "village_simon1_success",
        failKey: "village_simon1_fail", portrait: "portrait_npc1",
        patternLength: 3, pattern: [], solved: false,
      },
      {
        npcX: 160, npcY: 140,
        introKey: "village_simon2_intro", successKey: "village_simon2_success",
        failKey: "village_simon2_fail", portrait: "portrait_npc2",
        patternLength: 4, pattern: [], solved: false,
      },
      {
        npcX: 260, npcY: 140,
        introKey: "village_simon3_intro", successKey: "village_simon3_success",
        failKey: "village_simon3_fail", portrait: "portrait_npc0",
        patternLength: 5, pattern: [], solved: false,
      },
    ];

    this.checkmarks = [];
    for (let i = 0; i < this.simonNPCs.length; i++) {
      const npc = this.simonNPCs[i];
      this.add.sprite(npc.npcX, npc.npcY, "npc", i).setDepth(DEPTH.ENTITIES);
      const check = this.add
        .text(npc.npcX, npc.npcY - 16, "", {
          fontSize: "8px", fontFamily: FONT, color: "#4caf50",
          stroke: "#000000", strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.UI)
        .setResolution(4);
      this.checkmarks.push(check);
    }

    // Player
    this.player = this.physics.add
      .sprite(20, GAME_HEIGHT / 2, "tadeo", 0)
      .setSize(10, 10)
      .setOffset(3, 14)
      .setDepth(DEPTH.PLAYER)
      .setCollideWorldBounds(true);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Simon panels (hidden initially)
    this.createSimonPanels();

    // Status text
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 10, "Sprich mit den Weisen (Leertaste)", {
        fontSize: "8px", fontFamily: FONT, color: "#e0e0e0",
        stroke: "#000000", strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI)
      .setResolution(4);

    this.dialogue = new DialogueManager(this);
    this.dialogue.startDialogue(DIALOGUES.village_enter, () => {});
  }

  update(): void {
    if (this.dialogue.isActive) {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.dialogue.advance();
      this.player.setVelocity(0, 0);
      return;
    }

    if (this.gameState === "SHOWING_PATTERN" ||
        this.gameState === "AWAITING_MATH" ||
        this.gameState === "FEEDBACK_CORRECT" ||
        this.gameState === "FEEDBACK_WRONG" ||
        this.gameState === "VICTORY") {
      this.player.setVelocity(0, 0);
      return;
    }

    if (this.gameState === "AWAITING_INPUT") {
      this.player.setVelocity(0, 0);
      let pressed: Direction | null = null;
      if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) pressed = "UP";
      else if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) pressed = "DOWN";
      else if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) pressed = "LEFT";
      else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) pressed = "RIGHT";
      if (pressed) this.handleSimonInput(pressed);
      return;
    }

    // EXPLORE: normal movement
    const speed = 55;
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown) vx = -speed;
    else if (this.cursors.right.isDown) vx = speed;
    if (this.cursors.up.isDown) vy = -speed;
    else if (this.cursors.down.isDown) vy = speed;
    this.player.setVelocity(vx, vy);

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.tryInteractNPC();
    }
  }

  // ---------------------------------------------------------------------------
  // NPC Interaction
  // ---------------------------------------------------------------------------

  private tryInteractNPC(): void {
    // Find the first unsolved NPC (enforces sequential order)
    const nextNPC = this.simonNPCs.find((n) => !n.solved);
    if (!nextNPC) return;

    const dx = this.player.x - nextNPC.npcX;
    const dy = this.player.y - nextNPC.npcY;
    if (Math.sqrt(dx * dx + dy * dy) < 28) {
      this.startSimonSays(nextNPC);
    }
  }

  private startSimonSays(npc: SimonNPC): void {
    this.activeNPC = npc;

    // 3rd NPC uses a math challenge instead of Simon Says
    if (npc === this.simonNPCs[2]) {
      this.dialogue.startDialogue(DIALOGUES[npc.introKey], () => {
        this.startMathChallenge(npc);
      });
      return;
    }

    if (npc.pattern.length === 0) {
      npc.pattern = this.generatePattern(npc.patternLength);
    }

    this.dialogue.startDialogue(DIALOGUES[npc.introKey], () => {
      this.panelContainer.setVisible(true);
      this.statusText.setVisible(true);
      this.createProgressDots(npc.patternLength);
      this.showPattern(npc);
    });
  }

  // ---------------------------------------------------------------------------
  // Pattern Logic
  // ---------------------------------------------------------------------------

  private generatePattern(length: number): Direction[] {
    const pattern: Direction[] = [];
    for (let i = 0; i < length; i++) {
      pattern.push(DIRECTIONS[randomInt(0, 3)]);
    }
    return pattern;
  }

  private showPattern(npc: SimonNPC): void {
    this.gameState = "SHOWING_PATTERN";
    this.currentInputIndex = 0;
    this.statusText.setText("Schau genau hin!");

    const stepDelay = 600;
    const litDuration = 400;

    npc.pattern.forEach((dir, i) => {
      this.time.delayedCall(stepDelay * (i + 1), () => {
        this.lightPanel(dir, litDuration);
      });
    });

    this.time.delayedCall(stepDelay * (npc.pattern.length + 1) + 200, () => {
      this.gameState = "AWAITING_INPUT";
      this.statusText.setText("Dein Zug!");
    });
  }

  private handleSimonInput(dir: Direction): void {
    const npc = this.activeNPC!;
    const expected = npc.pattern[this.currentInputIndex];

    this.lightPanel(dir, 300);

    if (dir === expected) {
      this.updateProgressDot(this.currentInputIndex);
      this.currentInputIndex++;
      if (this.currentInputIndex >= npc.pattern.length) {
        this.onPatternSuccess(npc);
      }
    } else {
      this.onPatternFail(npc);
    }
  }

  private onPatternSuccess(npc: SimonNPC): void {
    this.gameState = "FEEDBACK_CORRECT";
    AudioManager.getInstance().playSfx("sfx_simon_correct");
    this.cameras.main.flash(300, 76, 175, 80);
    this.statusText.setText("Richtig!");

    this.time.delayedCall(400, () => {
      this.hideSimonUI();
      npc.solved = true;
      const idx = this.simonNPCs.indexOf(npc);
      if (idx >= 0) this.checkmarks[idx].setText("OK");

      this.dialogue.startDialogue(DIALOGUES[npc.successKey], () => {
        this.activeNPC = null;
        this.gameState = "EXPLORE";

        if (this.simonNPCs.every((n) => n.solved)) {
          this.allSimonSolved();
        }
      });
    });
  }

  private onPatternFail(npc: SimonNPC): void {
    this.gameState = "FEEDBACK_WRONG";
    AudioManager.getInstance().playSfx("sfx_simon_wrong");
    this.cameras.main.flash(300, 229, 57, 53);
    this.cameras.main.shake(200, 0.01);
    this.statusText.setText("Falsch!");

    this.time.delayedCall(500, () => {
      this.hideSimonUI();
      this.dialogue.startDialogue(DIALOGUES[npc.failKey], () => {
        // Retry with the same pattern
        this.panelContainer.setVisible(true);
        this.statusText.setVisible(true);
        this.createProgressDots(npc.patternLength);
        this.showPattern(npc);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Math Challenge (3rd NPC)
  // ---------------------------------------------------------------------------

  private startMathChallenge(npc: SimonNPC): void {
    const a = randomInt(2, 20);
    const b = randomInt(1, 9);
    this.mathAnswer = a + b;
    this.mathInput = "";

    this.mathContainer = this.add.container(0, 0).setDepth(DEPTH.DIALOGUE);

    // Dark backdrop (same style as Simon panels)
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x1a1a2e, 0.85);
    backdrop.fillRect(PANEL_CX - 60, PANEL_CY - 40, 120, 80);
    backdrop.lineStyle(1, 0xe0e0e0, 1);
    backdrop.strokeRect(PANEL_CX - 60, PANEL_CY - 40, 120, 80);
    this.mathContainer.add(backdrop);

    // Question text
    const questionText = this.add
      .text(PANEL_CX, PANEL_CY - 22, `Was ist ${a} + ${b}?`, {
        fontSize: "9px", fontFamily: FONT, color: "#ffc107",
        stroke: "#000000", strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.DIALOGUE)
      .setResolution(4);
    this.mathContainer.add(questionText);

    // Input display
    this.mathInputText = this.add
      .text(PANEL_CX, PANEL_CY + 4, "_", {
        fontSize: "12px", fontFamily: FONT, color: "#ffffff",
        stroke: "#000000", strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.DIALOGUE)
      .setResolution(4);
    this.mathContainer.add(this.mathInputText);

    // Hint text
    const hint = this.add
      .text(PANEL_CX, PANEL_CY + 28, "Tippe die Zahl, Leertaste = OK", {
        fontSize: "6px", fontFamily: FONT, color: "#9e9e9e",
        stroke: "#000000", strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.DIALOGUE)
      .setResolution(4);
    this.mathContainer.add(hint);

    this.gameState = "AWAITING_MATH";

    // Keyboard listener for digit input
    this.mathKeyHandler = (event: KeyboardEvent) => {
      if (this.gameState !== "AWAITING_MATH") return;

      if (event.key >= "0" && event.key <= "9" && this.mathInput.length < 2) {
        this.mathInput += event.key;
        this.mathInputText!.setText(this.mathInput + "_");
      } else if (event.key === "Backspace") {
        this.mathInput = this.mathInput.slice(0, -1);
        this.mathInputText!.setText(this.mathInput.length > 0 ? this.mathInput + "_" : "_");
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        this.submitMathAnswer(npc);
      }
    };
    this.input.keyboard!.on("keydown", this.mathKeyHandler);
  }

  private submitMathAnswer(npc: SimonNPC): void {
    if (this.mathInput.length === 0) return;

    const answer = parseInt(this.mathInput, 10);
    this.removeMathListener();

    if (answer === this.mathAnswer) {
      this.destroyMathUI();
      this.onPatternSuccess(npc);
    } else {
      this.onMathFail(npc);
    }
  }

  private onMathFail(npc: SimonNPC): void {
    this.gameState = "FEEDBACK_WRONG";
    AudioManager.getInstance().playSfx("sfx_simon_wrong");
    this.cameras.main.flash(300, 229, 57, 53);
    this.cameras.main.shake(200, 0.01);

    this.destroyMathUI();
    this.time.delayedCall(500, () => {
      this.dialogue.startDialogue(DIALOGUES[npc.failKey], () => {
        // Retry with new numbers
        this.startMathChallenge(npc);
      });
    });
  }

  private destroyMathUI(): void {
    if (this.mathContainer) {
      this.mathContainer.destroy(true);
      this.mathContainer = null;
    }
    this.mathInputText = null;
  }

  private removeMathListener(): void {
    if (this.mathKeyHandler) {
      this.input.keyboard!.off("keydown", this.mathKeyHandler);
      this.mathKeyHandler = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Panel Rendering
  // ---------------------------------------------------------------------------

  private createSimonPanels(): void {
    this.panelContainer = this.add.container(0, 0).setDepth(DEPTH.DIALOGUE).setVisible(false);

    // Dark backdrop
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x1a1a2e, 0.85);
    backdrop.fillRect(PANEL_CX - 60, PANEL_CY - 55, 120, 110);
    backdrop.lineStyle(1, 0xe0e0e0, 1);
    backdrop.strokeRect(PANEL_CX - 60, PANEL_CY - 55, 120, 110);
    this.panelContainer.add(backdrop);

    this.panelGfx = {} as Record<Direction, Phaser.GameObjects.Graphics>;

    for (const dir of DIRECTIONS) {
      const pos = PANEL_POS[dir];
      const gfx = this.add.graphics();
      this.drawPanel(gfx, pos.x, pos.y, SIMON_COLORS[dir].base, dir);
      this.panelGfx[dir] = gfx;
      this.panelContainer.add(gfx);
    }

    this.statusText = this.add
      .text(PANEL_CX, PANEL_CY - 50, "", {
        fontSize: "7px", fontFamily: FONT, color: "#ffc107",
        stroke: "#000000", strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.DIALOGUE)
      .setResolution(4)
      .setVisible(false);
  }

  private drawPanel(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number, dir: Direction): void {
    const h = PANEL_SIZE / 2;
    gfx.clear();
    gfx.fillStyle(color, 1);
    gfx.fillRect(cx - h, cy - h, PANEL_SIZE, PANEL_SIZE);
    gfx.lineStyle(1, 0xffffff, 0.5);
    gfx.strokeRect(cx - h, cy - h, PANEL_SIZE, PANEL_SIZE);

    // Arrow icon
    gfx.lineStyle(2, 0xffffff, 0.9);
    const s = 5;
    switch (dir) {
      case "UP":
        gfx.lineBetween(cx, cy - s, cx - s, cy + s);
        gfx.lineBetween(cx, cy - s, cx + s, cy + s);
        break;
      case "DOWN":
        gfx.lineBetween(cx, cy + s, cx - s, cy - s);
        gfx.lineBetween(cx, cy + s, cx + s, cy - s);
        break;
      case "LEFT":
        gfx.lineBetween(cx - s, cy, cx + s, cy - s);
        gfx.lineBetween(cx - s, cy, cx + s, cy + s);
        break;
      case "RIGHT":
        gfx.lineBetween(cx + s, cy, cx - s, cy - s);
        gfx.lineBetween(cx + s, cy, cx - s, cy + s);
        break;
    }
  }

  private lightPanel(dir: Direction, duration: number): void {
    const pos = PANEL_POS[dir];
    const gfx = this.panelGfx[dir];
    const colors = SIMON_COLORS[dir];

    AudioManager.getInstance().playSfx(`sfx_simon_panel_${dir.toLowerCase()}`);
    this.drawPanel(gfx, pos.x, pos.y, colors.lit, dir);

    this.time.delayedCall(duration, () => {
      this.drawPanel(gfx, pos.x, pos.y, colors.base, dir);
    });
  }

  private hideSimonUI(): void {
    this.panelContainer.setVisible(false);
    this.statusText.setVisible(false);
    this.clearProgressDots();
    this.removeMathListener();
    this.destroyMathUI();
  }

  // ---------------------------------------------------------------------------
  // Progress Dots
  // ---------------------------------------------------------------------------

  private createProgressDots(length: number): void {
    this.clearProgressDots();
    const startX = PANEL_CX - ((length - 1) * 8) / 2;
    const dotY = PANEL_CY + 50;

    for (let i = 0; i < length; i++) {
      const dot = this.add.graphics().setDepth(DEPTH.DIALOGUE);
      dot.fillStyle(0x757575, 1);
      dot.fillCircle(startX + i * 8, dotY, 2);
      this.panelContainer.add(dot);
      this.progressDots.push(dot);
    }
  }

  private updateProgressDot(index: number): void {
    const dot = this.progressDots[index];
    if (!dot) return;
    const startX = PANEL_CX - ((this.progressDots.length - 1) * 8) / 2;
    const dotY = PANEL_CY + 50;
    dot.clear();
    dot.fillStyle(0x4caf50, 1);
    dot.fillCircle(startX + index * 8, dotY, 3);
  }

  private clearProgressDots(): void {
    for (const dot of this.progressDots) {
      dot.destroy();
    }
    this.progressDots = [];
  }

  // ---------------------------------------------------------------------------
  // Completion
  // ---------------------------------------------------------------------------

  private allSimonSolved(): void {
    this.gameState = "VICTORY";
    AudioManager.getInstance().playSfx("sfx_item_get");

    const keySprite = this.add
      .sprite(this.player.x, this.player.y - 8, "items", 2)
      .setDepth(DEPTH.UI);

    this.tweens.add({
      targets: keySprite,
      y: this.player.y - 24,
      duration: 800,
      ease: "Back.easeOut",
      onComplete: () => {
        keySprite.destroy();
        InventoryManager.getInstance().addItem("key");
        QuestManager.getInstance().completeMilestone();
        SaveManager.getInstance().save(this.returnData.returnX, this.returnData.returnY);
        this.cameras.main.fadeOut(400);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start(SCENES.OVERWORLD);
        });
      },
    });
  }
}
