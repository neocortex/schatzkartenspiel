/**
 * ForestScene — Milestone 5: Find 5 magic berries hidden among trees.
 * Some bushes are traps (thorns). Timer adds pressure.
 */

import { GAME_WIDTH, GAME_HEIGHT, SCENES, COLORS, DEPTH, FONT } from "../config";
import { QuestManager } from "../systems/QuestManager";
import { InventoryManager } from "../systems/InventoryManager";
import { SaveManager } from "../systems/SaveManager";
import { DialogueManager } from "../systems/DialogueManager";
import { AudioManager } from "../systems/AudioManager";
import { DIALOGUES } from "../data/dialogues";
import { randomInt } from "../utils/helpers";

const FOREST_SIZE = 320;

export class ForestScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private dialogue!: DialogueManager;
  private berriesCollected = 0;
  private berryCountText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private timeLeft = 60;
  private isPlaying = false;
  private returnData!: { returnX: number; returnY: number };

  constructor() {
    super({ key: SCENES.FOREST });
  }

  init(data: { milestone: number; returnX: number; returnY: number }): void {
    this.returnData = { returnX: data.returnX, returnY: data.returnY };
    this.berriesCollected = 0;
    this.timeLeft = 60;
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playMusic("music_village");

    this.cameras.main.fadeIn(400);

    // Forest floor
    const bg = this.add.graphics().setDepth(DEPTH.GROUND);
    bg.fillStyle(COLORS.GRASS_DARK, 1);
    bg.fillRect(0, 0, FOREST_SIZE, FOREST_SIZE);
    // Floor detail
    for (let i = 0; i < 100; i++) {
      const fx = randomInt(0, FOREST_SIZE);
      const fy = randomInt(0, FOREST_SIZE);
      bg.fillStyle(COLORS.GRASS_LIGHT, 0.3);
      bg.fillRect(fx, fy, 2, 2);
    }

    // Ground mushrooms
    for (let m = 0; m < 6; m++) {
      const mx = 30 + ((m * 47) % (FOREST_SIZE - 60));
      const my = 30 + ((m * 73) % (FOREST_SIZE - 60));
      bg.fillStyle(COLORS.MUSHROOM_STEM, 1);
      bg.fillRect(mx, my + 2, 2, 3);
      bg.fillStyle(COLORS.MUSHROOM_CAP, 1);
      bg.fillRect(mx - 1, my, 4, 2);
    }

    const trees = this.physics.add.staticGroup();

    // Dense tree layout
    const treePositions: { x: number; y: number }[] = [];
    for (let i = 0; i < 25; i++) {
      let tx: number, ty: number;
      let tooClose: boolean;
      let attempts = 0;
      // Reason: spacing of 28 guarantees 16px gaps between 12px tree bodies,
      // so the 10px player can always fit through.
      do {
        tx = randomInt(16, FOREST_SIZE - 16);
        ty = randomInt(16, FOREST_SIZE - 16);
        tooClose =
          (tx < 60 && ty < 60) || // clear start area
          treePositions.some((p) => Math.abs(p.x - tx) < 28 && Math.abs(p.y - ty) < 28);
        attempts++;
      } while (tooClose && attempts < 200);
      if (attempts >= 200) continue; // skip if no valid spot found

      treePositions.push({ x: tx, y: ty });

      // Draw tree
      const treeGfx = this.add.graphics().setDepth(DEPTH.OBJECTS);
      treeGfx.fillStyle(COLORS.TREE_TRUNK, 1);
      treeGfx.fillRect(tx - 2, ty + 4, 4, 8);
      // Vary crown color based on tree index
      const crownColor = i % 3 === 0 ? COLORS.TREE_LEAVES : i % 3 === 1 ? COLORS.TREE_LEAVES_LIGHT : COLORS.BUSH;
      treeGfx.fillStyle(crownColor, 1);
      treeGfx.fillCircle(tx, ty, 8);
      treeGfx.fillStyle(COLORS.TREE_LEAVES_LIGHT, 0.5);
      treeGfx.fillCircle(tx - 2, ty - 2, 3);

      const treeBody = trees.create(tx, ty + 4, "") as Phaser.Physics.Arcade.Sprite;
      treeBody.setSize(12, 12).setVisible(false).refreshBody();
    }

    // Leaf particles — falling leaves from random trees
    this.time.addEvent({
      delay: 3000,
      loop: true,
      callback: () => {
        if (treePositions.length === 0) return;
        const tree = treePositions[randomInt(0, treePositions.length - 1)];
        const leaf = this.add
          .rectangle(tree.x, tree.y, 2, 1, COLORS.TREE_LEAVES)
          .setAlpha(0.7)
          .setDepth(DEPTH.EFFECTS);
        this.tweens.add({
          targets: leaf,
          y: tree.y + randomInt(20, 30),
          x: tree.x + randomInt(-8, 8),
          alpha: 0,
          duration: 2500,
          onComplete: () => leaf.destroy(),
        });
      },
    });

    // Place 5 berries in random open spots
    const berryGroup = this.physics.add.staticGroup();
    const berryPositions: { x: number; y: number }[] = [];
    for (let b = 0; b < 5; b++) {
      let bx: number, by: number;
      let valid: boolean;
      let attempts = 0;
      do {
        bx = randomInt(30, FOREST_SIZE - 30);
        by = randomInt(30, FOREST_SIZE - 30);
        // Reason: 24px clearance from trees ensures the player can reach the
        // berry without getting stuck on adjacent tree collision bodies.
        valid =
          !treePositions.some((t) => Math.abs(t.x - bx) < 24 && Math.abs(t.y - by) < 24) &&
          !berryPositions.some((p) => Math.abs(p.x - bx) < 25 && Math.abs(p.y - by) < 25);
        attempts++;
      } while (!valid && attempts < 200);

      berryPositions.push({ x: bx, y: by });

      const berrySprite = this.add.sprite(bx, by, "items", 1).setDepth(DEPTH.OBJECTS);
      // Glow effect
      this.tweens.add({
        targets: berrySprite,
        alpha: { from: 0.7, to: 1 },
        scale: { from: 0.9, to: 1.1 },
        duration: 800,
        yoyo: true,
        repeat: -1,
      });

      const berryZone = berryGroup.create(bx, by, "") as Phaser.Physics.Arcade.Sprite;
      berryZone.setSize(12, 12).setVisible(false).refreshBody();
      (berryZone as any).__sprite = berrySprite;
    }

    // Place 4 thorn bushes as traps
    const thornGroup = this.physics.add.staticGroup();
    for (let t = 0; t < 4; t++) {
      let thx: number, thy: number;
      let valid: boolean;
      do {
        thx = randomInt(30, FOREST_SIZE - 30);
        thy = randomInt(30, FOREST_SIZE - 30);
        valid =
          !treePositions.some((p) => Math.abs(p.x - thx) < 15 && Math.abs(p.y - thy) < 15) &&
          !berryPositions.some((p) => Math.abs(p.x - thx) < 20 && Math.abs(p.y - thy) < 20);
      } while (!valid);

      const thornGfx = this.add.graphics().setDepth(DEPTH.OBJECTS);
      thornGfx.fillStyle(COLORS.BUSH, 1);
      thornGfx.fillCircle(thx, thy, 6);
      thornGfx.fillStyle(0x8d6e63, 1);
      // Thorns
      for (let s = 0; s < 6; s++) {
        const angle = (s / 6) * Math.PI * 2;
        thornGfx.fillRect(thx + Math.cos(angle) * 6, thy + Math.sin(angle) * 6, 2, 2);
      }

      const thornBody = thornGroup.create(thx, thy, "") as Phaser.Physics.Arcade.Sprite;
      thornBody.setSize(12, 12).setVisible(false).refreshBody();
    }

    // Player
    this.player = this.physics.add
      .sprite(20, 20, "tadeo", 0)
      .setSize(10, 10)
      .setOffset(3, 14)
      .setDepth(DEPTH.PLAYER)
      .setCollideWorldBounds(true);

    this.physics.world.setBounds(0, 0, FOREST_SIZE, FOREST_SIZE);
    this.physics.add.collider(this.player, trees);

    // Berry collection
    this.physics.add.overlap(this.player, berryGroup, (_p, berry) => {
      const b = berry as Phaser.Physics.Arcade.Sprite;
      const sprite = (b as any).__sprite as Phaser.GameObjects.Sprite;
      if (sprite) sprite.destroy();
      b.destroy();
      AudioManager.getInstance().playSfx("sfx_berry_collect");
      this.berriesCollected++;
      this.berryCountText.setText(`Beeren: ${this.berriesCollected}/5`);
      if (this.berriesCollected >= 5) this.winChallenge();
    });

    // Thorn damage
    this.physics.add.overlap(this.player, thornGroup, () => {
      if (!this.isPlaying) return;
      AudioManager.getInstance().playSfx("sfx_hit_damage");
      this.cameras.main.flash(200, 255, 0, 0);
      this.timeLeft = Math.max(0, this.timeLeft - 5);
      this.timerText.setText(`Zeit: ${this.timeLeft}`);
    });

    // Camera
    this.cameras.main.setBounds(0, 0, FOREST_SIZE, FOREST_SIZE);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Fireflies
    for (let f = 0; f < 7; f++) {
      const fx = randomInt(10, FOREST_SIZE - 10);
      const fy = randomInt(10, FOREST_SIZE - 10);
      const firefly = this.add.rectangle(fx, fy, 1, 1, 0xffeb3b).setDepth(DEPTH.EFFECTS);
      this.tweens.add({
        targets: firefly,
        alpha: { from: 0.2, to: 1.0 },
        duration: randomInt(1000, 2000),
        yoyo: true,
        repeat: -1,
      });
      this.tweens.add({
        targets: firefly,
        x: fx + randomInt(-10, 10),
        y: fy + randomInt(-10, 10),
        duration: randomInt(3000, 5000),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // UI
    this.berryCountText = this.add
      .text(4, 4, "Beeren: 0/5", {
        fontSize: "8px", fontFamily: FONT, color: "#ce93d8",
        stroke: "#000000", strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.UI)
      .setResolution(4);

    this.timerText = this.add
      .text(GAME_WIDTH - 4, 4, `Zeit: ${this.timeLeft}`, {
        fontSize: "8px", fontFamily: FONT, color: "#ffc107",
        stroke: "#000000", strokeThickness: 2,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.UI)
      .setResolution(4);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.dialogue = new DialogueManager(this);
    this.dialogue.startDialogue(DIALOGUES.forest_enter, () => {
      this.startChallenge();
    });
  }

  update(): void {
    if (this.dialogue.isActive) {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.dialogue.advance();
      this.player.setVelocity(0, 0);
      return;
    }

    if (!this.isPlaying) {
      this.player.setVelocity(0, 0);
      return;
    }

    const speed = 55;
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown) vx = -speed;
    else if (this.cursors.right.isDown) vx = speed;
    if (this.cursors.up.isDown) vy = -speed;
    else if (this.cursors.down.isDown) vy = speed;
    this.player.setVelocity(vx, vy);
    if (vx !== 0 && vy !== 0) this.player.body!.velocity.normalize().scale(speed);
  }

  private startChallenge(): void {
    this.isPlaying = true;
    this.time.addEvent({
      delay: 1000,
      repeat: 59,
      callback: () => {
        if (!this.isPlaying) return;
        this.timeLeft--;
        this.timerText.setText(`Zeit: ${this.timeLeft}`);
        if (this.timeLeft <= 10 && this.timeLeft > 0) {
          AudioManager.getInstance().playSfx("sfx_timer_warn");
        }
        if (this.timeLeft <= 0) this.loseChallenge();
      },
    });
  }

  private winChallenge(): void {
    this.isPlaying = false;
    AudioManager.getInstance().playSfx("sfx_item_get");
    InventoryManager.getInstance().addItem("berry");
    this.dialogue.startDialogue(DIALOGUES.forest_complete, () => {
      QuestManager.getInstance().completeMilestone();
      SaveManager.getInstance().save(this.returnData.returnX, this.returnData.returnY);
      this.cameras.main.fadeOut(400);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start(SCENES.OVERWORLD);
      });
    });
  }

  private loseChallenge(): void {
    this.isPlaying = false;
    const hint = [{ speaker: "Tipp", portrait: "", text: QuestManager.getInstance().currentQuest.hint }];
    this.dialogue.startDialogue(hint, () => {
      this.scene.restart({
        milestone: 5,
        returnX: this.returnData.returnX,
        returnY: this.returnData.returnY,
      });
    });
  }
}
