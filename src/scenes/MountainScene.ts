/**
 * MountainScene — Milestone 8: Side-view climbing challenge.
 * Timed jumps between ledges, avoid falling rocks, golden hammer at the summit.
 */

import { GAME_WIDTH, GAME_HEIGHT, SCENES, COLORS, DEPTH } from "../config";
import { QuestManager } from "../systems/QuestManager";
import { InventoryManager } from "../systems/InventoryManager";
import { SaveManager } from "../systems/SaveManager";
import { DialogueManager } from "../systems/DialogueManager";
import { AudioManager } from "../systems/AudioManager";
import { DIALOGUES } from "../data/dialogues";
import { randomInt } from "../utils/helpers";

interface Ledge {
  x: number;
  y: number;
  w: number;
}

export class MountainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private dialogue!: DialogueManager;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private fallingRocks!: Phaser.Physics.Arcade.Group;
  private hammerSprite!: Phaser.GameObjects.Sprite;
  private isPlaying = false;
  private returnData!: { returnX: number; returnY: number };
  private rockTimer!: Phaser.Time.TimerEvent;
  private snowflakes: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super({ key: SCENES.MOUNTAIN });
  }

  init(data: { milestone: number; returnX: number; returnY: number }): void {
    this.returnData = { returnX: data.returnX, returnY: data.returnY };
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playMusic("music_dungeon");

    this.cameras.main.fadeIn(400);

    // Background: mountain side-view
    const bg = this.add.graphics().setDepth(DEPTH.GROUND);
    // Sky gradient
    bg.fillStyle(0x87ceeb, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.fillStyle(0x4fc3f7, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT / 3);
    // Mountain rock face
    bg.fillStyle(COLORS.STONE, 1);
    bg.fillRect(0, 30, 60, GAME_HEIGHT);
    bg.fillRect(GAME_WIDTH - 60, 30, 60, GAME_HEIGHT);
    bg.fillStyle(COLORS.STONE_DARK, 1);
    bg.fillRect(0, 30, 20, GAME_HEIGHT);
    bg.fillRect(GAME_WIDTH - 20, 30, 20, GAME_HEIGHT);

    // Rock cracks
    bg.lineStyle(1, COLORS.STONE_DARK, 0.6);
    bg.lineBetween(10, 80, 30, 100);
    bg.lineBetween(15, 150, 40, 170);
    bg.lineBetween(GAME_WIDTH - 30, 90, GAME_WIDTH - 10, 110);
    bg.lineBetween(GAME_WIDTH - 35, 160, GAME_WIDTH - 15, 180);
    // Moss
    bg.fillStyle(COLORS.TREE_LEAVES, 0.3);
    bg.fillRect(30, GAME_HEIGHT - 40, 20, 5);
    bg.fillRect(GAME_WIDTH - 50, GAME_HEIGHT - 35, 15, 5);

    // Snowflakes
    for (let i = 0; i < 15; i++) {
      const s = this.add
        .rectangle(
          Phaser.Math.Between(0, GAME_WIDTH),
          Phaser.Math.Between(-10, GAME_HEIGHT),
          1, 1, 0xffffff
        )
        .setAlpha(Phaser.Math.FloatBetween(0.3, 0.8))
        .setDepth(DEPTH.EFFECTS);
      this.snowflakes.push(s);
    }

    // Clouds
    for (let ci = 0; ci < 3; ci++) {
      const cloud = this.add.graphics().setDepth(DEPTH.SHADOWS);
      cloud.fillStyle(0xffffff, 0.4);
      cloud.fillRoundedRect(0, 0, 30, 8, 3);
      cloud.fillRoundedRect(8, -4, 16, 6, 3);
      cloud.setPosition(ci * 110, 12 + ci * 8);
      this.tweens.add({
        targets: cloud,
        x: GAME_WIDTH + 40,
        duration: 15000 + ci * 5000,
        repeat: -1,
        onRepeat: () => cloud.setX(-40),
      });
    }

    // Enable gravity for this scene
    this.physics.world.gravity.y = 400;

    // Ledges (platforms)
    this.platforms = this.physics.add.staticGroup();
    const ledges: Ledge[] = [
      { x: 40, y: GAME_HEIGHT - 10, w: GAME_WIDTH - 80 }, // Ground
      { x: 160, y: GAME_HEIGHT - 38, w: 65 },
      { x: 80, y: GAME_HEIGHT - 66, w: 65 },
      { x: 165, y: GAME_HEIGHT - 94, w: 60 },
      { x: 80, y: GAME_HEIGHT - 122, w: 60 },
      { x: 160, y: GAME_HEIGHT - 150, w: 65 },
      { x: 80, y: GAME_HEIGHT - 178, w: 60 },
      { x: 130, y: 30, w: 65 }, // Summit
    ];

    const gfx = this.add.graphics().setDepth(DEPTH.OBJECTS);
    for (const l of ledges) {
      gfx.fillStyle(COLORS.STONE_DARK, 1);
      gfx.fillRect(l.x, l.y, l.w, 8);
      gfx.fillStyle(COLORS.STONE, 1);
      gfx.fillRect(l.x, l.y, l.w, 4);
      // Snow on top ledges
      if (l.y < 100) {
        gfx.fillStyle(COLORS.SNOW, 1);
        gfx.fillRect(l.x + 2, l.y - 2, l.w - 4, 3);
      }

      // Reason: setDisplaySize ensures displayOriginX/Y match the platform
      // dimensions so the static body aligns with the visual ledge.
      const plat = this.platforms.create(l.x + l.w / 2, l.y + 4, "") as Phaser.Physics.Arcade.Sprite;
      plat.setDisplaySize(l.w, 8).setSize(l.w, 8).setVisible(false).refreshBody();
    }

    // Golden hammer at the summit
    this.hammerSprite = this.add.sprite(170, 12, "items", 3).setDepth(DEPTH.OBJECTS);
    this.tweens.add({
      targets: this.hammerSprite,
      y: 8,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    const hammerZone = this.physics.add.staticGroup();
    const hz = hammerZone.create(170, 15, "") as Phaser.Physics.Arcade.Sprite;
    hz.setSize(16, 16).setVisible(false).refreshBody();

    // Falling rocks
    this.fallingRocks = this.physics.add.group();

    // Player
    this.player = this.physics.add
      .sprite(GAME_WIDTH / 2, GAME_HEIGHT - 24, "tadeo", 0)
      .setSize(10, 14)
      .setOffset(3, 10)
      .setDepth(DEPTH.PLAYER)
      .setCollideWorldBounds(true);

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.overlap(this.player, this.fallingRocks, this.onRockHit, undefined, this);
    this.physics.add.overlap(this.player, hammerZone, this.collectHammer, undefined, this);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.dialogue = new DialogueManager(this);
    this.dialogue.startDialogue(DIALOGUES.mountain_enter, () => {
      this.isPlaying = true;
      this.startRockSpawner();
    });
  }

  update(): void {
    // Animate snowflakes
    for (const s of this.snowflakes) {
      s.y += 0.3;
      s.x += Math.sin(s.y * 0.05) * 0.3;
      if (s.y > GAME_HEIGHT + 5) {
        s.y = -5;
        s.x = Phaser.Math.Between(0, GAME_WIDTH);
      }
    }

    if (this.dialogue.isActive) {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.dialogue.advance();
      return;
    }

    if (!this.isPlaying) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const speed = 70;

    if (this.cursors.left.isDown) {
      body.setVelocityX(-speed);
    } else if (this.cursors.right.isDown) {
      body.setVelocityX(speed);
    } else {
      body.setVelocityX(0);
    }

    // Jump (only when on ground)
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && body.blocked.down) {
      body.setVelocityY(-175);
    }

    // Fell off bottom?
    if (this.player.y > GAME_HEIGHT + 10) {
      this.player.setPosition(GAME_WIDTH / 2, GAME_HEIGHT - 24);
      this.player.setVelocity(0, 0);
      this.cameras.main.flash(200, 255, 0, 0);
    }
  }

  private startRockSpawner(): void {
    this.rockTimer = this.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => {
        if (!this.isPlaying) return;
        const rx = randomInt(40, GAME_WIDTH - 40);
        const rock = this.fallingRocks.create(rx, -10, "lava_rock") as Phaser.Physics.Arcade.Sprite;
        rock.setVelocityY(randomInt(40, 80));
        rock.setBounce(0.3);
        this.time.delayedCall(6000, () => {
          if (rock.active) rock.destroy();
        });
      },
    });
  }

  private onRockHit(): void {
    if (!this.isPlaying) return;
    AudioManager.getInstance().playSfx("sfx_hit_damage");
    this.cameras.main.flash(200, 255, 0, 0);
    // Knock player down
    this.player.setVelocityY(100);
    this.player.setVelocityX(randomInt(-50, 50));
  }

  private collectHammer(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    AudioManager.getInstance().playSfx("sfx_item_get");
    if (this.rockTimer) this.rockTimer.destroy();
    this.hammerSprite.destroy();

    // Item-get animation
    const itemSprite = this.add
      .sprite(this.player.x, this.player.y - 8, "items", 3)
      .setDepth(DEPTH.UI);

    this.tweens.add({
      targets: itemSprite,
      y: this.player.y - 24,
      duration: 800,
      ease: "Back.easeOut",
      onComplete: () => {
        itemSprite.destroy();
        InventoryManager.getInstance().addItem("hammer");
        this.dialogue.startDialogue(DIALOGUES.mountain_complete, () => {
          QuestManager.getInstance().completeMilestone();
          SaveManager.getInstance().save(this.returnData.returnX, this.returnData.returnY);
          this.cameras.main.fadeOut(400);
          this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            this.scene.start(SCENES.OVERWORLD);
          });
        });
      },
    });
  }
}
