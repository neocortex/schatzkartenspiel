/**
 * Game entry point — boots the Three.js engine and starts the adventure.
 */

import "@fontsource/fredoka/400.css";
import "@fontsource/fredoka/600.css";
import "./style.css";
import { Engine } from "./core/Engine";
import { Game } from "./game/Game";

const engine = new Engine(document.getElementById("game")!);
engine.start();
const game = new Game(engine);
void game.start();

// Reason: expose the engine and game for E2E tests and debugging in the browser console
Object.assign(window, { engine, game });
