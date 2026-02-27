/**
 * Generic NPC entity for villagers and other interactive characters.
 */

import { DEPTH } from "../config";

export class NPC {
  sprite: Phaser.Physics.Arcade.Sprite;
  readonly name: string;
  readonly dialogueKey: string;
  private interactionRadius = 24;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    name: string,
    dialogueKey: string,
    variant: number = 0
  ) {
    this.name = name;
    this.dialogueKey = dialogueKey;
    this.sprite = scene.physics.add
      .sprite(x, y, "npc", variant)
      .setImmovable(true)
      .setDepth(DEPTH.ENTITIES);

    this.sprite.setSize(12, 10).setOffset(2, 14);
  }

  /** Check if the player is close enough to interact. */
  isInRange(playerX: number, playerY: number): boolean {
    const dx = this.sprite.x - playerX;
    const dy = this.sprite.y - playerY;
    return Math.sqrt(dx * dx + dy * dy) <= this.interactionRadius;
  }

  /** Add a simple idle bobbing animation. */
  addIdleAnimation(scene: Phaser.Scene): void {
    scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 1,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }
}
