/**
 * Game entry point — bootstraps the Phaser.Game instance.
 */

import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, SCALE } from "./config";
import { BootScene } from "./scenes/BootScene";
import { TitleScene } from "./scenes/TitleScene";
import { OverworldScene } from "./scenes/OverworldScene";
import { VolcanoScene } from "./scenes/VolcanoScene";
import { CaveScene } from "./scenes/CaveScene";
import { ForestScene } from "./scenes/ForestScene";
import { CombatScene } from "./scenes/CombatScene";
import { VillageScene } from "./scenes/VillageScene";
import { MountainScene } from "./scenes/MountainScene";
import { SeaScene } from "./scenes/SeaScene";
import { TreasureScene } from "./scenes/TreasureScene";
import { VictoryScene } from "./scenes/VictoryScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-wrapper",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    zoom: SCALE,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [
    BootScene,
    TitleScene,
    OverworldScene,
    VolcanoScene,
    CaveScene,
    ForestScene,
    CombatScene,
    VillageScene,
    MountainScene,
    SeaScene,
    TreasureScene,
    VictoryScene,
  ],
  backgroundColor: "#1a1a2e",
};

const game = new Phaser.Game(config);

// Reason: Keep the DOM overlay sized to match the canvas as Phaser rescales it
game.events.on("ready", () => {
  const syncOverlay = () => {
    const canvas = game.canvas;
    const overlay = document.getElementById("ui-overlay");
    if (!canvas || !overlay) return;
    const rect = canvas.getBoundingClientRect();
    const wrapper = document.getElementById("game-wrapper")!;
    wrapper.style.width = `${rect.width}px`;
    wrapper.style.height = `${rect.height}px`;
  };
  syncOverlay();
  window.addEventListener("resize", syncOverlay);
  // Run once after Phaser finishes initial layout
  setTimeout(syncOverlay, 100);
});
