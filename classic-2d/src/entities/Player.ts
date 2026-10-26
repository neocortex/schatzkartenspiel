/**
 * Tadeo player entity — handles movement, animation, and interaction.
 */

import { CHAR_WIDTH, CHAR_HEIGHT, DEPTH } from "../config";

const SPEED = 60;

/** Direction indices matching the spritesheet row layout. */
enum Dir {
  DOWN = 0,
  LEFT = 1,
  RIGHT = 2,
  UP = 3,
}

export class Player {
  sprite: Phaser.Physics.Arcade.Sprite;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private interactKey: Phaser.Input.Keyboard.Key;
  private facing: Dir = Dir.DOWN;
  private canMove = true;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.physics.add
      .sprite(x, y, "tadeo", 0)
      .setSize(12, 10)
      .setOffset(2, 14)
      .setDepth(DEPTH.PLAYER);

    this.sprite.setCollideWorldBounds(true);

    // Create walk animations (4 directions × 2 walk frames)
    const dirs = ["down", "left", "right", "up"];
    for (let d = 0; d < 4; d++) {
      scene.anims.create({
        key: `tadeo_walk_${dirs[d]}`,
        frames: [
          { key: "tadeo", frame: d * 3 + 1 },
          { key: "tadeo", frame: d * 3 },
          { key: "tadeo", frame: d * 3 + 2 },
          { key: "tadeo", frame: d * 3 },
        ],
        frameRate: 8,
        repeat: -1,
      });
      scene.anims.create({
        key: `tadeo_idle_${dirs[d]}`,
        frames: [{ key: "tadeo", frame: d * 3 }],
        frameRate: 1,
      });
    }

    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.interactKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  /** Call every frame to handle input and movement. */
  update(): void {
    if (!this.canMove) {
      this.sprite.setVelocity(0, 0);
      return;
    }

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown) {
      vx = -SPEED;
      this.facing = Dir.LEFT;
    } else if (this.cursors.right.isDown) {
      vx = SPEED;
      this.facing = Dir.RIGHT;
    }

    if (this.cursors.up.isDown) {
      vy = -SPEED;
      if (vx === 0) this.facing = Dir.UP;
    } else if (this.cursors.down.isDown) {
      vy = SPEED;
      if (vx === 0) this.facing = Dir.DOWN;
    }

    body.setVelocity(vx, vy);

    // Normalize diagonal movement
    if (vx !== 0 && vy !== 0) {
      body.velocity.normalize().scale(SPEED);
    }

    // Animation
    const dirs = ["down", "left", "right", "up"];
    const dirName = dirs[this.facing];
    if (vx !== 0 || vy !== 0) {
      this.sprite.anims.play(`tadeo_walk_${dirName}`, true);
    } else {
      this.sprite.anims.play(`tadeo_idle_${dirName}`, true);
    }
  }

  /** Check if interact key was just pressed. */
  justInteracted(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.interactKey);
  }

  /** Check if space was just pressed (for dialogue advance). */
  justPressedSpace(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.interactKey);
  }

  /** Freeze/unfreeze player movement (for dialogues, cutscenes). */
  setMovementEnabled(enabled: boolean): void {
    this.canMove = enabled;
    if (!enabled) {
      this.sprite.setVelocity(0, 0);
      const dirs = ["down", "left", "right", "up"];
      this.sprite.anims.play(`tadeo_idle_${dirs[this.facing]}`, true);
    }
  }

  /** Get tile coordinates. */
  getTilePos(tileSize: number): { tx: number; ty: number } {
    return {
      tx: Math.floor(this.sprite.x / tileSize),
      ty: Math.floor(this.sprite.y / tileSize),
    };
  }

  /** Set position directly (scene transition, loading save). */
  setPosition(x: number, y: number): void {
    this.sprite.setPosition(x, y);
  }

  /** Get the facing direction name. */
  getFacing(): string {
    return ["down", "left", "right", "up"][this.facing];
  }
}
