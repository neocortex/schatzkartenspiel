/**
 * Enemy entity base for combat display.
 */

import { EnemyDef } from "../data/enemies";

export class Enemy {
  sprite: Phaser.GameObjects.Sprite;
  readonly def: EnemyDef;

  constructor(scene: Phaser.Scene, x: number, y: number, def: EnemyDef) {
    this.def = def;
    this.sprite = scene.add.sprite(x, y, def.spriteKey, 0).setOrigin(0.5, 1);
  }

  /** Play the attack animation frame. */
  playAttack(): void {
    this.sprite.setFrame(1);
  }

  /** Return to idle frame. */
  playIdle(): void {
    this.sprite.setFrame(0);
  }

  /** Shake effect when taking damage. */
  takeDamageEffect(scene: Phaser.Scene): void {
    scene.tweens.add({
      targets: this.sprite,
      x: this.sprite.x + 3,
      duration: 50,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.sprite.setX(this.sprite.x);
      },
    });
    this.sprite.setTintFill(0xffffff);
    scene.time.delayedCall(150, () => {
      this.sprite.clearTint();
    });
  }

  /** Death animation. */
  playDeath(scene: Phaser.Scene, onComplete: () => void): void {
    scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      y: this.sprite.y + 10,
      duration: 800,
      ease: "Power2",
      onComplete,
    });
  }
}
