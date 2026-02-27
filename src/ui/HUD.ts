/**
 * Heads-up display: quest name and inventory slots.
 * No background bar — text stroke and icon outlines keep everything readable.
 */

import { DEPTH, GAME_WIDTH, FONT } from "../config";
import { QuestManager } from "../systems/QuestManager";
import { InventoryManager } from "../systems/InventoryManager";
import { ITEMS } from "../data/items";

export class HUD {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private itemSlots: Phaser.GameObjects.Sprite[] = [];
  private questText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(DEPTH.UI).setScrollFactor(0);

    // Quest text (top-left with heavy stroke for readability)
    this.questText = scene.add
      .text(3, 3, "", {
        fontSize: "7px",
        fontFamily: FONT,
        color: "#ffc107",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0, 0)
      .setResolution(4);
    this.container.add(this.questText);

    // Item slots (top-right, no background)
    const slotKeys = ["sword", "berry", "key", "hammer"];
    for (let i = 0; i < slotKeys.length; i++) {
      const slot = scene.add
        .sprite(GAME_WIDTH - 46 + i * 12, 7, "items", ITEMS[slotKeys[i]].frame)
        .setScale(0.65)
        .setAlpha(0.7);
      this.itemSlots.push(slot);
      this.container.add(slot);
    }

    this.refresh();
  }

  /** Update HUD to reflect current game state. */
  refresh(): void {
    const quest = QuestManager.getInstance();
    const inventory = InventoryManager.getInstance();

    this.questText.setText(`${quest.currentMilestone}. ${quest.currentQuest.name}`);

    const slotKeys = ["sword", "berry", "key", "hammer"];
    for (let i = 0; i < slotKeys.length; i++) {
      this.itemSlots[i].setAlpha(inventory.hasItem(slotKeys[i]) ? 1 : 0.35);
    }
  }

  show(): void {
    this.container.setVisible(true);
  }

  hide(): void {
    this.container.setVisible(false);
  }

  destroy(): void {
    this.container.destroy();
  }
}
