/**
 * OverworldScene — the main island exploration map.
 * Builds the tilemap programmatically, handles camera, zone triggers, and NPC interactions.
 */

import { TILE_SIZE, MAP_COLS, MAP_ROWS, TILES, SCENES, DEPTH, GAME_WIDTH, GAME_HEIGHT } from "../config";
import { Player } from "../entities/Player";
import { QuestManager } from "../systems/QuestManager";
import { InventoryManager } from "../systems/InventoryManager";
import { SaveManager } from "../systems/SaveManager";
import { DialogueManager } from "../systems/DialogueManager";
import { AudioManager } from "../systems/AudioManager";
import { DIALOGUES } from "../data/dialogues";
import { HUD } from "../ui/HUD";
import {
  scatterDecorations, setupAnimatedTiles,
  spawnVillageNPCs, spawnAmbientCreatures,
} from "../systems/OverworldAmbience";

/** Collision tile indices (player cannot walk through these). */
const COLLISION_TILES = new Set([
  TILES.WATER, TILES.WATER_DEEP, TILES.TREE, TILES.BUSH,
  TILES.LAVA, TILES.STONE, TILES.MOUNTAIN, TILES.VOLCANO_TOP,
  TILES.HOUSE_WALL, TILES.HOUSE_ROOF,
]);

export class OverworldScene extends Phaser.Scene {
  private player!: Player;
  private hud!: HUD;
  private dialogue!: DialogueManager;
  private map!: Phaser.Tilemaps.Tilemap;
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer;
  private introPlayed = false;
  private zoneRects: { milestone: number; rect: Phaser.Geom.Rectangle; scene: string | null }[] = [];
  private lakeTablesRead = 0;
  // Reason: signs must be on grass outside the lake's sand ring (d > 0.75)
  // so they render as SIGN tiles and are reachable by the player.
  private lakeSignPositions = [
    { tx: 36, ty: 29 },  // top-left shore  (d ≈ 0.89 → grass)
    { tx: 44, ty: 29 },  // top-right shore (d ≈ 0.89 → grass)
    { tx: 40, ty: 35 },  // bottom shore    (d = 1.0  → grass)
  ];
  private questMarker!: Phaser.GameObjects.Container;
  private transitioning = false;

  constructor() {
    super({ key: SCENES.OVERWORLD });
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playMusic("music_overworld");

    this.transitioning = false;
    const mapData = this.buildTilemap();
    this.setupPlayer();
    spawnVillageNPCs(this);
    spawnAmbientCreatures(this, mapData);
    this.setupCamera();
    this.setupZoneTriggers();
    this.createQuestMarker();

    this.hud = new HUD(this);
    this.dialogue = new DialogueManager(this);

    // Fade in
    this.cameras.main.fadeIn(500);

    // Play intro dialogue on first visit
    const quest = QuestManager.getInstance();
    if (quest.currentMilestone === 1 && !this.introPlayed) {
      this.introPlayed = true;
      this.time.delayedCall(600, () => {
        this.player.setMovementEnabled(false);
        this.dialogue.startDialogue(DIALOGUES.intro, () => {
          this.player.setMovementEnabled(true);
          quest.completeMilestone();
          this.hud.refresh();
          this.updateQuestMarker();
          SaveManager.getInstance().save(this.player.sprite.x, this.player.sprite.y);
        });
      });
    }
  }

  update(): void {
    // Dialogue input
    if (this.dialogue.isActive) {
      if (this.player.justPressedSpace()) {
        this.dialogue.advance();
      }
      return;
    }

    this.player.update();
    this.checkZoneTriggers();
    this.checkLakeTablets();
  }

  // ---------------------------------------------------------------------------
  // TILEMAP CONSTRUCTION
  // ---------------------------------------------------------------------------

  private buildTilemap(): number[][] {
    const mapData = this.generateMapData();

    this.map = this.make.tilemap({
      data: mapData,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });

    const tileset = this.map.addTilesetImage("tileset", "tileset", TILE_SIZE, TILE_SIZE, 0, 0)!;
    const layer = this.map.createLayer(0, tileset, 0, 0)!;
    layer.setDepth(DEPTH.GROUND);

    // Set collision on specific tiles
    layer.setCollision(Array.from(COLLISION_TILES));
    this.collisionLayer = layer;

    // World bounds
    this.physics.world.setBounds(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE);

    // Scatter decoration tiles and start tile animations
    scatterDecorations(this.map, mapData);
    setupAnimatedTiles(this, this.map);

    return mapData;
  }

  /** Generate the island tilemap as a 2D array. */
  private generateMapData(): number[][] {
    const data: number[][] = [];

    for (let row = 0; row < MAP_ROWS; row++) {
      const r: number[] = [];
      for (let col = 0; col < MAP_COLS; col++) {
        r.push(this.getTileAt(col, row));
      }
      data.push(r);
    }

    return data;
  }

  /** Determine the tile type at a given grid position. */
  private getTileAt(x: number, y: number): number {
    // Ocean border (deep water around the edges)
    if (x < 2 || x >= MAP_COLS - 2 || y < 2 || y >= MAP_ROWS - 2) {
      return TILES.WATER_DEEP;
    }
    if (x < 4 || x >= MAP_COLS - 4 || y < 4 || y >= MAP_ROWS - 4) {
      return TILES.WATER;
    }

    // Small treasure island (top-left, ~8x8)
    if (x >= 8 && x <= 16 && y >= 4 && y <= 10) {
      return this.treasureIslandTile(x, y);
    }

    // Water channel separating treasure island
    if (y < 12 && x < 20) {
      if (y >= 10 && y <= 12) return TILES.WATER;
      if (x >= 17 && x <= 20 && y < 12) return TILES.WATER;
    }

    // Reason: region checks must run BEFORE the ellipse test because some
    // regions (spawn, dock, village, mountain) extend beyond the ellipse.
    // Spawn area (bottom-left) — boat + dock
    if (x >= 5 && x <= 14 && y >= 44 && y <= 55) {
      return this.spawnRegionTile(x, y);
    }

    // Sea departure dock (top-center, extends into water)
    if (x >= 24 && x <= 30 && y >= 6 && y <= 12) {
      return this.dockRegionTile(x, y);
    }

    // Village (bottom-right)
    if (x >= 58 && x <= 70 && y >= 45 && y <= 53) {
      return this.villageRegionTile(x, y);
    }

    // Mountain (top-right)
    if (x >= 60 && x <= 72 && y >= 8 && y <= 18) {
      return this.mountainRegionTile(x, y);
    }

    // Main island shape — roughly elliptical
    const cx = MAP_COLS / 2;
    const cy = MAP_ROWS / 2 + 2;
    const rx = MAP_COLS / 2 - 4;
    const ry = MAP_ROWS / 2 - 4;
    const dist = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry);

    if (dist > 1.0) return TILES.WATER;
    if (dist > 0.92) return TILES.SAND;

    // Beach border
    if (dist > 0.85) {
      return (x + y) % 5 === 0 ? TILES.SAND : TILES.GRASS;
    }

    // --- Regions within the island ---

    // Volcano (left side)
    if (x >= 7 && x <= 14 && y >= 33 && y <= 40) {
      return this.volcanoRegionTile(x, y);
    }

    // Cave area (upper-left)
    if (x >= 10 && x <= 18 && y >= 15 && y <= 22) {
      return this.caveRegionTile(x, y);
    }

    // Lake (center)
    if (x >= 35 && x <= 45 && y >= 27 && y <= 35) {
      return this.lakeRegionTile(x, y);
    }

    // Forest (center-south)
    if (x >= 32 && x <= 42 && y >= 40 && y <= 48) {
      return this.forestRegionTile(x, y);
    }

    // River + Bridge (right side, curving across the island)
    if (x >= 53 && x <= 64 && y >= 19 && y <= 43) {
      return this.riverRegionTile(x, y);
    }

    // Default grass with variation
    return (x * 7 + y * 13) % 11 === 0 ? TILES.GRASS_ALT : TILES.GRASS;
  }

  // --- Region tile generators ---

  private treasureIslandTile(x: number, y: number): number {
    if (x === 8 || x === 16 || y === 4 || y === 10) return TILES.SAND;
    if (x === 12 && y === 7) return TILES.CHEST;
    if ((x === 10 || x === 14) && y === 6) return TILES.TREE;
    return TILES.GRASS;
  }

  private volcanoRegionTile(x: number, y: number): number {
    // Cone shape: narrow at crater (y=34), widening to base (y=39)
    const cx = 10.5;
    const topY = 34;
    const baseY = 39;
    const progress = Math.max(0, (y - topY) / (baseY - topY));
    const halfW = 0.8 + progress * 2.8;
    const dx = Math.abs(x - cx);
    if (dx > halfW + 0.5 || y > baseY) return TILES.DIRT;
    // Lava crater
    if (y === topY && dx <= 0.8) return TILES.LAVA;
    if (y === topY) return TILES.VOLCANO_TOP;
    if (y === topY + 1 && dx <= 1.2) return TILES.VOLCANO_TOP;
    // Outer dirt ring at the edge of the cone
    if (dx > halfW - 0.5) return TILES.DIRT;
    return TILES.STONE;
  }

  private caveRegionTile(x: number, y: number): number {
    // Cave entrance at the base
    if (x === 14 && y === 20) return TILES.CAVE_ENTRANCE;
    // Rounded rock mound — elliptical shape
    const cx = 14;
    const cy = 18;
    const dx = (x - cx) / 3.5;
    const dy = (y - cy) / 2.5;
    const d = dx * dx + dy * dy;
    if (d > 1) return TILES.GRASS;
    // Top of mound is darker stone
    if (y <= 17) return TILES.STONE;
    return TILES.STONE;
  }

  private lakeRegionTile(x: number, y: number): number {
    // Reason: sign check runs BEFORE the ellipse so signs are never overwritten
    // by water/sand. Positions are on the grass ring (d > 0.75).
    if ((x === 36 && y === 29) || (x === 44 && y === 29) || (x === 40 && y === 35)) {
      return TILES.SIGN;
    }

    const lx = x - 35;
    const ly = y - 27;
    const d = (lx - 5) * (lx - 5) / 25 + (ly - 4) * (ly - 4) / 16;
    if (d < 0.6) return TILES.WATER;
    if (d < 0.75) return TILES.SAND;
    return TILES.GRASS;
  }

  private forestRegionTile(x: number, y: number): number {
    if ((x + y) % 3 === 0) return TILES.TREE;
    if ((x * 3 + y * 7) % 11 === 0) return TILES.BUSH;
    return TILES.GRASS;
  }

  private riverRegionTile(x: number, y: number): number {
    // River center follows a sine curve, anchored at x=58 at the bridge (y=29)
    const riverCenter = 58 + Math.round(Math.sin((y - 29) * 0.25) * 3);

    // Bridge crosses the river at y=28-30
    if (y >= 28 && y <= 30 && x >= riverCenter && x <= riverCenter + 1) {
      return TILES.BRIDGE;
    }

    // River water (2 tiles wide)
    if (x >= riverCenter && x <= riverCenter + 1) return TILES.WATER;

    // Default grass with variation
    return (x * 7 + y * 13) % 11 === 0 ? TILES.GRASS_ALT : TILES.GRASS;
  }

  private villageRegionTile(x: number, y: number): number {
    // Houses
    if (y === 47 && (x === 61 || x === 65 || x === 69)) return TILES.DOOR;
    if (y === 46 && (x === 61 || x === 65 || x === 69)) return TILES.HOUSE_WALL;
    if (y === 45 && (x === 61 || x === 65 || x === 69)) return TILES.HOUSE_ROOF;
    if ((y === 46 || y === 47) && ((x >= 60 && x <= 62) || (x >= 64 && x <= 66) || (x >= 68 && x <= 70))) {
      return TILES.HOUSE_WALL;
    }
    if (y === 45 && ((x >= 60 && x <= 62) || (x >= 64 && x <= 66) || (x >= 68 && x <= 70))) {
      return TILES.HOUSE_ROOF;
    }
    if (y === 49) return TILES.PATH;
    return TILES.GRASS;
  }

  private mountainRegionTile(x: number, y: number): number {
    // Triangular peak: narrow at summit (y=9), widening to base (y=17)
    const cx = 66;
    const topY = 9;
    const baseY = 17;
    if (y < topY || y > baseY) return TILES.GRASS;
    const progress = (y - topY) / (baseY - topY);
    const halfW = 0.6 + progress * 5;
    const dx = Math.abs(x - cx);
    if (dx > halfW) return TILES.GRASS;
    // Snow cap
    if (y <= topY + 2) return TILES.SNOW;
    // Rocky upper section
    if (y <= topY + 5) return TILES.MOUNTAIN;
    // Stone foothills
    return TILES.STONE;
  }

  private dockRegionTile(x: number, y: number): number {
    // Dock planks extending from island edge into water
    if (x >= 26 && x <= 28 && y >= 7 && y <= 9) return TILES.DOCK;
    // Boat moored at the end of the dock
    if (x === 27 && y === 6) return TILES.BOAT;
    // Sandy shore at the dock entrance
    if (y === 10 && x >= 26 && x <= 28) return TILES.SAND;
    // Water around the dock
    if (y <= 9) return TILES.WATER;
    return TILES.GRASS;
  }

  private spawnRegionTile(x: number, y: number): number {
    // Dock planks extending into the water at the south edge
    if (y >= 52 && x >= 8 && x <= 10) return TILES.DOCK;
    // Boat moored next to the dock
    if (y === 51 && x === 9) return TILES.BOAT;
    // Sandy beach strip
    if (y >= 49 && y <= 52) return TILES.SAND;
    // Water south of the beach (so dock extends into water, not grass)
    if (y >= 53) return TILES.WATER;
    // Grassy land above beach
    if (y >= 44 && y <= 48) {
      if ((x + y) % 7 === 0) return TILES.TREE;
      return TILES.GRASS;
    }
    return TILES.GRASS;
  }

  // ---------------------------------------------------------------------------
  // PLAYER SETUP
  // ---------------------------------------------------------------------------

  private setupPlayer(): void {
    const save = SaveManager.getInstance().load();
    // Spawn on the beach next to the boat dock
    let startX = save ? save.playerX : 9 * TILE_SIZE + TILE_SIZE / 2;
    let startY = save ? save.playerY : 49 * TILE_SIZE + TILE_SIZE / 2;

    // Reason: milestone 10 takes place on the treasure island. If the saved
    // position is still on the main island, teleport the player across.
    const quest = QuestManager.getInstance();
    if (quest.currentMilestone >= 10) {
      const tx = Math.floor(startX / TILE_SIZE);
      const ty = Math.floor(startY / TILE_SIZE);
      if (!(tx >= 8 && tx <= 16 && ty >= 4 && ty <= 10)) {
        startX = 12 * TILE_SIZE + TILE_SIZE / 2;
        startY = 8 * TILE_SIZE + TILE_SIZE / 2;
      }
    }

    this.player = new Player(this, startX, startY);
    this.physics.add.collider(this.player.sprite, this.collisionLayer);
  }

  private setupCamera(): void {
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
    this.cameras.main.setBounds(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE);
    this.cameras.main.setRoundPixels(true);
  }

  // ---------------------------------------------------------------------------
  // QUEST MARKER — floating arrow over the next objective
  // ---------------------------------------------------------------------------

  private createQuestMarker(): void {
    // Arrow shape drawn with graphics
    const arrow = this.add.graphics();
    arrow.fillStyle(0xffc107, 1);
    // Downward pointing arrow
    arrow.fillTriangle(0, 0, 8, 0, 4, 6);
    arrow.fillRect(2, -5, 4, 5);
    arrow.generateTexture("quest_arrow", 8, 11);
    arrow.destroy();

    const arrowSprite = this.add.sprite(0, 0, "quest_arrow").setDepth(DEPTH.EFFECTS);
    this.questMarker = this.add.container(0, 0, [arrowSprite]).setDepth(DEPTH.EFFECTS);

    // Bobbing animation
    this.tweens.add({
      targets: arrowSprite,
      y: -4,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.updateQuestMarker();
  }

  private updateQuestMarker(): void {
    const quest = QuestManager.getInstance();
    const q = quest.currentQuest;
    if (!q) {
      this.questMarker.setVisible(false);
      return;
    }
    // Position marker at center of the quest trigger zone
    const mx = (q.triggerX + q.triggerW / 2) * TILE_SIZE;
    const my = q.triggerY * TILE_SIZE - 6;
    this.questMarker.setPosition(mx, my);
    this.questMarker.setVisible(true);
  }

  // ---------------------------------------------------------------------------
  // ZONE TRIGGERS
  // ---------------------------------------------------------------------------

  private setupZoneTriggers(): void {
    const quests = QuestManager.getInstance().allQuests;
    for (const q of quests) {
      if (q.scene) {
        this.zoneRects.push({
          milestone: q.id,
          rect: new Phaser.Geom.Rectangle(
            q.triggerX * TILE_SIZE,
            q.triggerY * TILE_SIZE,
            q.triggerW * TILE_SIZE,
            q.triggerH * TILE_SIZE
          ),
          scene: q.scene,
        });
      }
    }
  }

  private checkZoneTriggers(): void {
    if (this.transitioning) return;

    const quest = QuestManager.getInstance();
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;

    for (const zone of this.zoneRects) {
      if (!zone.rect.contains(px, py)) continue;
      if (!quest.isMilestoneAccessible(zone.milestone)) continue;
      if (quest.currentMilestone !== zone.milestone) continue;

      // Player entered a milestone zone — transition to its scene
      AudioManager.getInstance().playSfx("sfx_door");
      this.transitioning = true;
      this.player.setMovementEnabled(false);
      SaveManager.getInstance().save(px, py);

      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start(zone.scene!, {
          milestone: zone.milestone,
          returnX: px,
          returnY: py,
        });
      });
      break;
    }
  }

  // ---------------------------------------------------------------------------
  // LAKE TABLETS (Milestone 3 — on overworld)
  // ---------------------------------------------------------------------------

  private checkLakeTablets(): void {
    const quest = QuestManager.getInstance();
    if (quest.currentMilestone !== 3) return;
    if (!this.player.justInteracted()) return;

    const { tx, ty } = this.player.getTilePos(TILE_SIZE);

    for (let i = 0; i < this.lakeSignPositions.length; i++) {
      const sign = this.lakeSignPositions[i];
      if (Math.abs(tx - sign.tx) <= 1 && Math.abs(ty - sign.ty) <= 1) {
        const keys = ["lake_tablet1", "lake_tablet2", "lake_tablet3"];
        if (DIALOGUES[keys[i]]) {
          this.player.setMovementEnabled(false);
          this.dialogue.startDialogue(DIALOGUES[keys[i]], () => {
            this.lakeTablesRead |= 1 << i;
            this.player.setMovementEnabled(true);

            // All 3 read? Complete milestone 4
            if (this.lakeTablesRead === 0b111) {
              AudioManager.getInstance().playSfx("sfx_item_get");
              this.player.setMovementEnabled(false);
              this.dialogue.startDialogue(DIALOGUES.lake_complete, () => {
                quest.completeMilestone();
                this.hud.refresh();
                this.updateQuestMarker();
                SaveManager.getInstance().save(this.player.sprite.x, this.player.sprite.y);
                this.player.setMovementEnabled(true);
              });
            }
          });
        }
        break;
      }
    }
  }

  /** Called when returning from a milestone scene. */
  returnFromMilestone(data: { milestone: number; returnX: number; returnY: number }): void {
    this.player.setPosition(data.returnX, data.returnY);
    this.cameras.main.fadeIn(400);
    this.hud.refresh();
    this.updateQuestMarker();
    this.player.setMovementEnabled(true);
  }
}
