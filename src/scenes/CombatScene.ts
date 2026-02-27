/**
 * CombatScene — Reusable turn-based boss fight scene.
 * Used for both the Ogre (milestone 6) and the Shark (milestone 9).
 */

import { GAME_WIDTH, GAME_HEIGHT, SCENES, COLORS, DEPTH, FONT } from "../config";
import { CombatManager, CombatAction, CombatState } from "../systems/CombatManager";
import { QuestManager } from "../systems/QuestManager";
import { SaveManager } from "../systems/SaveManager";
import { DialogueManager } from "../systems/DialogueManager";
import { AudioManager } from "../systems/AudioManager";
import { DIALOGUES } from "../data/dialogues";
import { ENEMIES, EnemyDef } from "../data/enemies";
import { Enemy } from "../entities/Enemy";
import { CombatUI } from "../ui/CombatUI";

export class CombatScene extends Phaser.Scene {
  private combatManager!: CombatManager;
  private combatUI!: CombatUI;
  private dialogue!: DialogueManager;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enemyEntity!: Enemy;
  private tadeoSprite!: Phaser.GameObjects.Sprite;
  private enemyDef!: EnemyDef;
  private milestone!: number;
  private returnData!: { returnX: number; returnY: number };
  private isBusy = false;

  constructor() {
    super({ key: SCENES.COMBAT });
  }

  init(data: { milestone: number; returnX: number; returnY: number }): void {
    this.milestone = data.milestone;
    this.returnData = { returnX: data.returnX, returnY: data.returnY };

    // Determine which enemy based on milestone
    if (this.milestone === 6) {
      this.enemyDef = ENEMIES.ogre;
    } else {
      this.enemyDef = ENEMIES.shark;
    }
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playMusic("music_combat");

    this.cameras.main.fadeIn(400);
    this.isBusy = false;

    // Combat background
    const bg = this.add.graphics().setDepth(DEPTH.GROUND);
    if (this.milestone === 6) {
      // Bridge/river background for ogre
      bg.fillStyle(COLORS.GRASS_DARK, 1);
      bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      bg.fillStyle(COLORS.WATER_LIGHT, 1);
      bg.fillRect(0, GAME_HEIGHT - 40, GAME_WIDTH, 40);
      bg.fillStyle(COLORS.BRIDGE, 1);
      bg.fillRect(60, GAME_HEIGHT - 45, GAME_WIDTH - 120, 10);
      // Trees behind combat area
      bg.fillStyle(COLORS.TREE_TRUNK, 1);
      bg.fillRect(20, GAME_HEIGHT - 80, 4, 20);
      bg.fillRect(GAME_WIDTH - 24, GAME_HEIGHT - 85, 4, 25);
      bg.fillStyle(COLORS.TREE_LEAVES, 1);
      bg.fillCircle(22, GAME_HEIGHT - 85, 10);
      bg.fillCircle(GAME_WIDTH - 22, GAME_HEIGHT - 90, 12);
      // Grass blades
      bg.fillStyle(COLORS.GRASS_LIGHT, 0.5);
      for (let gx = 0; gx < GAME_WIDTH; gx += 8) {
        bg.fillRect(gx, GAME_HEIGHT - 42, 2, 3);
      }
    } else {
      // Sea background for shark
      bg.fillStyle(0x0d47a1, 1);
      bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      bg.fillStyle(COLORS.WATER_LIGHT, 0.3);
      for (let wy = 20; wy < GAME_HEIGHT; wy += 30) {
        for (let wx = 0; wx < GAME_WIDTH; wx += 40) {
          bg.fillRect(wx + (wy % 20), wy, 20, 3);
        }
      }
      // Bubble particles (start on a timer)
    }

    // Bubble spawner for shark fights
    if (this.milestone === 9) {
      this.time.addEvent({
        delay: 600,
        loop: true,
        callback: () => {
          const bx = Phaser.Math.Between(20, GAME_WIDTH - 20);
          const bubble = this.add.circle(bx, GAME_HEIGHT, 2, 0xbbdefb, 0.5).setDepth(DEPTH.EFFECTS);
          this.tweens.add({
            targets: bubble,
            y: -10,
            alpha: 0,
            duration: Phaser.Math.Between(2000, 4000),
            onComplete: () => bubble.destroy(),
          });
        },
      });
    }

    // Tadeo (left side)
    this.tadeoSprite = this.add
      .sprite(60, GAME_HEIGHT - 70, "tadeo", 6) // right-facing
      .setDepth(DEPTH.PLAYER)
      .setScale(2);

    // Enemy (right side)
    this.enemyEntity = new Enemy(this, GAME_WIDTH - 80, GAME_HEIGHT - 55, this.enemyDef);
    this.enemyEntity.sprite.setDepth(DEPTH.ENTITIES).setScale(1.5);

    // Combat manager
    this.combatManager = new CombatManager(this.enemyDef);

    // UI
    this.combatUI = new CombatUI(this);
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.dialogue = new DialogueManager(this);

    // Update UI with initial state
    this.combatUI.updateState(this.combatManager.getState(), this.enemyDef.name);

    // Intro dialogue, then start combat
    // Reason: milestone 9 (shark) already showed sea_enter in SeaScene,
    // so skip the intro dialogue to avoid showing it twice.
    if (this.milestone === 9) {
      this.enablePlayerTurn();
    } else {
      const introKey = "ogre_enter";
      this.dialogue.startDialogue(DIALOGUES[introKey], () => {
        this.enablePlayerTurn();
      });
    }
  }

  update(): void {
    if (this.dialogue.isActive) {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.dialogue.advance();
      return;
    }

    this.combatUI.update();
  }

  private enablePlayerTurn(): void {
    this.isBusy = false;
    this.combatUI.enableActions((action: CombatAction) => {
      if (this.isBusy) return;
      this.isBusy = true;
      this.combatUI.disableActions();
      this.executeAction(action);
    });
  }

  private executeAction(action: CombatAction): void {
    const audio = AudioManager.getInstance();
    const hpBefore = this.combatManager.getState().playerHp;

    if (action === "attack") audio.playSfx("sfx_attack");
    else if (action === "defend") audio.playSfx("sfx_defend");
    else if (action === "special") audio.playSfx("sfx_special");
    // Reason: heal SFX is deferred until after combat resolves,
    // so it only plays when the berry is actually used.

    const state = this.combatManager.executePlayerAction(action);

    // Visual feedback for successful heal
    if (action === "heal") {
      const healed = state.playerHp - hpBefore;
      // healed > 0 means net HP gain even after enemy attack;
      // check the log to see if the berry was actually consumed.
      const didHeal = state.log.some((l) => l.includes("heilt"));
      if (didHeal) {
        audio.playSfx("sfx_heal");
        this.cameras.main.flash(200, 50, 200, 50);
        this.spawnHealNumber(healed);
      } else {
        // No berries — play a dull thud so the player knows it failed
        audio.playSfx("sfx_hammer_miss");
      }
    }

    // Animate player attack
    if (action === "attack" || action === "special") {
      this.animatePlayerAttack(() => this.processResult(state));
    } else {
      this.processResult(state);
    }
  }

  private animatePlayerAttack(onDone: () => void): void {
    // Tadeo lunges forward
    this.tweens.add({
      targets: this.tadeoSprite,
      x: this.tadeoSprite.x + 20,
      duration: 150,
      yoyo: true,
      ease: "Power2",
      onComplete: () => {
        this.enemyEntity.takeDamageEffect(this);
        this.spawnHitParticles(this.enemyEntity.sprite.x, this.enemyEntity.sprite.y, 0xffffff);
        onDone();
      },
    });
  }

  private processResult(state: Readonly<CombatState>): void {
    this.combatUI.updateState(state, this.enemyDef.name);

    if (state.result === "victory") {
      this.handleVictory();
      return;
    }

    if (state.result === "defeat") {
      this.handleDefeat();
      return;
    }

    // Show enemy action with delay
    if (!state.isPlayerTurn) {
      // Reason: This branch shouldn't trigger since executePlayerAction returns after enemy turn,
      // but kept as safety check.
      this.enablePlayerTurn();
      return;
    }

    // Animate enemy attack if it happened (longer delay so player can read their own result)
    const hadEnemyAttack = state.log.some((l) => l.includes("greift an") || l.includes("Spezialangriff"));
    if (hadEnemyAttack) {
      this.time.delayedCall(800, () => {
        AudioManager.getInstance().playSfx("sfx_enemy_attack");
        this.enemyEntity.playAttack();
        this.cameras.main.shake(100, 0.005);
        this.time.delayedCall(300, () => {
          this.enemyEntity.playIdle();
          AudioManager.getInstance().playSfx("sfx_enemy_hit");
          // Flash Tadeo red
          this.tadeoSprite.setTintFill(0xff0000);
          this.spawnHitParticles(this.tadeoSprite.x, this.tadeoSprite.y, 0xff4444);
          this.time.delayedCall(200, () => {
            this.tadeoSprite.clearTint();
            this.enablePlayerTurn();
          });
        });
      });
    } else {
      this.time.delayedCall(800, () => {
        this.enablePlayerTurn();
      });
    }
  }

  private spawnHitParticles(x: number, y: number, color: number): void {
    for (let i = 0; i < 5; i++) {
      const p = this.add.rectangle(x, y, 2, 2, color).setDepth(DEPTH.EFFECTS);
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-20, 20),
        y: y + Phaser.Math.Between(-20, 20),
        alpha: 0,
        duration: Phaser.Math.Between(200, 400),
        onComplete: () => p.destroy(),
      });
    }
  }

  private spawnHealNumber(healed: number): void {
    const label = healed >= 0 ? `+${healed}` : `${healed}`;
    const color = healed >= 0 ? "#4caf50" : "#e53935";
    const txt = this.add
      .text(this.tadeoSprite.x, this.tadeoSprite.y - 16, label, {
        fontSize: "10px",
        fontFamily: FONT,
        color,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.UI)
      .setResolution(4);
    this.tweens.add({
      targets: txt,
      y: txt.y - 20,
      alpha: 0,
      duration: 1000,
      ease: "Power2",
      onComplete: () => txt.destroy(),
    });
  }

  private handleVictory(): void {
    AudioManager.getInstance().playSfx("sfx_victory_fanfare");
    this.enemyEntity.playDeath(this, () => {
      const defeatKey = this.milestone === 6 ? "ogre_defeat" : "shark_defeat";
      this.dialogue.startDialogue(DIALOGUES[defeatKey], () => {
        QuestManager.getInstance().completeMilestone();
        // Reason: after defeating the shark (milestone 9), teleport player
        // to the treasure island instead of back to the main island dock.
        if (this.milestone === 9) {
          SaveManager.getInstance().save(12 * 16 + 8, 8 * 16 + 8);
        } else {
          SaveManager.getInstance().save(this.returnData.returnX, this.returnData.returnY);
        }
        this.combatUI.destroy();
        this.cameras.main.fadeOut(500);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start(SCENES.OVERWORLD);
        });
      });
    });
  }

  private handleDefeat(): void {
    AudioManager.getInstance().playSfx("sfx_defeat");
    // Flash and show hint
    this.cameras.main.flash(500, 255, 0, 0);
    this.time.delayedCall(800, () => {
      const hint = [{ speaker: "Tipp", portrait: "", text: this.enemyDef.defeatHint }];
      this.dialogue.startDialogue(hint, () => {
        // Restart combat
        this.combatUI.destroy();
        this.scene.restart({
          milestone: this.milestone,
          returnX: this.returnData.returnX,
          returnY: this.returnData.returnY,
        });
      });
    });
  }
}
