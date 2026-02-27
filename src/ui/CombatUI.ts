/**
 * Combat UI: action menu with item icons, health bars, combat log text.
 */

import { GAME_WIDTH, GAME_HEIGHT, DEPTH, COLORS, FONT } from "../config";
import { CombatState, CombatAction } from "../systems/CombatManager";

/** Item sprite frame indices (from SpriteFactory items spritesheet). */
const ITEM_FRAMES: Record<CombatAction, number> = {
  attack: 0,   // sword
  defend: 3,   // hammer (used as shield/block)
  heal: 1,     // berry
  special: 0,  // sword (drawn with star overlay)
};

interface ActionButton {
  bg: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  action: CombatAction;
  hitArea: Phaser.Geom.Rectangle;
  starGfx?: Phaser.GameObjects.Graphics;
}

export class CombatUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private playerBar: Phaser.GameObjects.Graphics;
  private enemyBar: Phaser.GameObjects.Graphics;
  private playerHpText: Phaser.GameObjects.Text;
  private enemyHpText: Phaser.GameObjects.Text;
  private logText: Phaser.GameObjects.Text;
  private logBackdrop: Phaser.GameObjects.Graphics;
  private buttons: ActionButton[] = [];
  private chargeText: Phaser.GameObjects.Text;
  private onAction: ((action: CombatAction) => void) | null = null;
  private selectedIndex = 0;
  private cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey: Phaser.Input.Keyboard.Key;
  private buttonsEnabled = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(DEPTH.UI).setScrollFactor(0);
    this.cursorKeys = scene.input.keyboard!.createCursorKeys();
    this.spaceKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    const textStroke = { stroke: "#000000", strokeThickness: 2 };

    // Player HP bar (top-left)
    this.playerBar = scene.add.graphics();
    this.container.add(this.playerBar);
    this.playerHpText = scene.add
      .text(6, 6, "Tadeo", { fontSize: "8px", fontFamily: FONT, color: "#ffffff", ...textStroke })
      .setResolution(4);
    this.container.add(this.playerHpText);

    // Enemy HP bar (top-right)
    this.enemyBar = scene.add.graphics();
    this.container.add(this.enemyBar);
    this.enemyHpText = scene.add
      .text(GAME_WIDTH - 6, 6, "Gegner", { fontSize: "8px", fontFamily: FONT, color: "#ffffff", ...textStroke })
      .setOrigin(1, 0)
      .setResolution(4);
    this.container.add(this.enemyHpText);

    // Special charge indicator
    this.chargeText = scene.add
      .text(6, 28, "Spezial: 0/3", { fontSize: "8px", fontFamily: FONT, color: "#ffc107", ...textStroke })
      .setResolution(4);
    this.container.add(this.chargeText);

    // Combat log backdrop
    this.logBackdrop = scene.add.graphics();
    this.logBackdrop.fillStyle(COLORS.UI_BG, 0.75);
    this.logBackdrop.fillRect(10, 42, GAME_WIDTH - 20, 40);
    this.logBackdrop.lineStyle(1, COLORS.UI_BORDER, 0.3);
    this.logBackdrop.strokeRect(10, 42, GAME_WIDTH - 20, 40);
    this.container.add(this.logBackdrop);

    // Combat log text
    this.logText = scene.add
      .text(GAME_WIDTH / 2, 48, "", {
        fontSize: "7px",
        fontFamily: FONT,
        color: "#ffffff",
        wordWrap: { width: GAME_WIDTH - 30 },
        lineSpacing: 3,
        stroke: "#000000",
        strokeThickness: 2,
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setResolution(4);
    this.container.add(this.logText);

    // Action buttons with item icons (bottom)
    const actions: { label: string; action: CombatAction }[] = [
      { label: "Angriff", action: "attack" },
      { label: "Abwehr", action: "defend" },
      { label: "Heilen", action: "heal" },
      { label: "Spezial", action: "special" },
    ];

    const btnW = 40;
    const btnH = 32;
    const totalW = actions.length * btnW + (actions.length - 1) * 6;
    const startX = (GAME_WIDTH - totalW) / 2;
    const btnY = GAME_HEIGHT - btnH - 4;

    for (let i = 0; i < actions.length; i++) {
      const x = startX + i * (btnW + 6);
      const cx = x + btnW / 2;
      const bg = scene.add.graphics();
      const hitArea = new Phaser.Geom.Rectangle(x, btnY, btnW, btnH);

      // Item sprite icon
      const icon = scene.add
        .sprite(cx, btnY + 12, "items", ITEM_FRAMES[actions[i].action])
        .setScale(1);

      // Small star overlay for the special button
      let starGfx: Phaser.GameObjects.Graphics | undefined;
      if (actions[i].action === "special") {
        starGfx = scene.add.graphics();
        this.drawStar(starGfx, cx + 6, btnY + 7, 0xffc107);
        this.container.add(starGfx);
      }

      // Label under icon
      const label = scene.add
        .text(cx, btnY + 26, actions[i].label, {
          fontSize: "5px",
          fontFamily: FONT,
          color: "#e0e0e0",
          stroke: "#000000",
          strokeThickness: 1,
        })
        .setOrigin(0.5)
        .setResolution(4);

      this.buttons.push({ bg, icon, label, action: actions[i].action, hitArea, starGfx });
      this.container.add(bg);
      this.container.add(icon);
      this.container.add(label);
    }

    this.drawButtons();
  }

  /** Draw a small 4-point star at the given position. */
  private drawStar(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number): void {
    gfx.fillStyle(color, 1);
    // Horizontal diamond
    gfx.fillRect(cx - 3, cy - 1, 6, 2);
    // Vertical diamond
    gfx.fillRect(cx - 1, cy - 3, 2, 6);
    // Center pixel
    gfx.fillRect(cx - 1, cy - 1, 2, 2);
  }

  /** Update the display with current combat state. */
  updateState(state: Readonly<CombatState>, enemyName: string): void {
    // Player HP bar
    this.playerBar.clear();
    this.playerBar.fillStyle(0x333333, 1);
    this.playerBar.fillRect(6, 16, 80, 6);
    const playerRatio = state.playerHp / state.playerMaxHp;
    const playerColor = playerRatio > 0.5 ? 0x4caf50 : playerRatio > 0.25 ? 0xffc107 : 0xe53935;
    this.playerBar.fillStyle(playerColor, 1);
    this.playerBar.fillRect(6, 16, Math.floor(80 * playerRatio), 6);
    this.playerHpText.setText(`Tadeo  ${state.playerHp}/${state.playerMaxHp}`);

    // Enemy HP bar
    this.enemyBar.clear();
    this.enemyBar.fillStyle(0x333333, 1);
    this.enemyBar.fillRect(GAME_WIDTH - 86, 16, 80, 6);
    const enemyRatio = state.enemyHp / state.enemyMaxHp;
    this.enemyBar.fillStyle(0xe53935, 1);
    this.enemyBar.fillRect(GAME_WIDTH - 86, 16, Math.floor(80 * enemyRatio), 6);
    this.enemyHpText.setText(`${enemyName}  ${state.enemyHp}/${state.enemyMaxHp}`);

    // Charge
    this.chargeText.setText(`Spezial: ${state.playerSpecialCharge}/3`);

    // Log — resize backdrop to fit content
    this.logText.setText(state.log.join("\n"));
    const logH = Math.max(40, this.logText.height + 12);
    this.logBackdrop.clear();
    this.logBackdrop.fillStyle(COLORS.UI_BG, 0.75);
    this.logBackdrop.fillRect(10, 42, GAME_WIDTH - 20, logH);
    this.logBackdrop.lineStyle(1, COLORS.UI_BORDER, 0.3);
    this.logBackdrop.strokeRect(10, 42, GAME_WIDTH - 20, logH);
  }

  /** Enable action buttons and set callback. */
  enableActions(onAction: (action: CombatAction) => void): void {
    this.onAction = onAction;
    this.buttonsEnabled = true;
    this.selectedIndex = 0;
    this.drawButtons();
  }

  /** Disable action buttons. */
  disableActions(): void {
    this.buttonsEnabled = false;
    this.onAction = null;
    this.drawButtons();
  }

  /** Call in scene update to handle keyboard input for button selection. */
  update(): void {
    if (!this.buttonsEnabled) return;

    if (Phaser.Input.Keyboard.JustDown(this.cursorKeys.left)) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.drawButtons();
    } else if (Phaser.Input.Keyboard.JustDown(this.cursorKeys.right)) {
      this.selectedIndex = Math.min(this.buttons.length - 1, this.selectedIndex + 1);
      this.drawButtons();
    }

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      const btn = this.buttons[this.selectedIndex];
      this.onAction?.(btn.action);
    }
  }

  private drawButtons(): void {
    for (let i = 0; i < this.buttons.length; i++) {
      const btn = this.buttons[i];
      btn.bg.clear();

      const isSelected = i === this.selectedIndex && this.buttonsEnabled;
      const borderColor = isSelected ? COLORS.UI_HIGHLIGHT : COLORS.UI_BORDER;
      const bgAlpha = this.buttonsEnabled ? 0.9 : 0.4;

      btn.bg.fillStyle(COLORS.UI_BG, bgAlpha);
      btn.bg.fillRect(btn.hitArea.x, btn.hitArea.y, btn.hitArea.width, btn.hitArea.height);
      btn.bg.lineStyle(isSelected ? 2 : 1, borderColor, 1);
      btn.bg.strokeRect(btn.hitArea.x, btn.hitArea.y, btn.hitArea.width, btn.hitArea.height);

      // Dim icons and labels when disabled
      const iconAlpha = this.buttonsEnabled ? 1 : 0.35;
      btn.icon.setAlpha(iconAlpha);
      if (btn.starGfx) btn.starGfx.setAlpha(iconAlpha);
      btn.label.setColor(isSelected ? "#ffc107" : this.buttonsEnabled ? "#e0e0e0" : "#666666");
    }
  }

  /** Show/hide the entire combat UI. */
  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  destroy(): void {
    this.container.destroy();
  }
}
