/**
 * Save/load system using localStorage.
 * Auto-saves at each milestone completion.
 */

import { QuestManager } from "./QuestManager";
import { InventoryManager } from "./InventoryManager";

/** Bump this when save format or game layout changes to invalidate old saves. */
const SAVE_VERSION = 3;

interface SaveData {
  version: number;
  milestone: number;
  items: string[];
  playerX: number;
  playerY: number;
  timestamp: number;
}

const SAVE_KEY = "schatzkarten_save";

export class SaveManager {
  private static instance: SaveManager;

  private constructor() {}

  static getInstance(): SaveManager {
    if (!SaveManager.instance) {
      SaveManager.instance = new SaveManager();
    }
    return SaveManager.instance;
  }

  /** Save current game state. */
  save(playerX: number, playerY: number): void {
    const quest = QuestManager.getInstance();
    const inventory = InventoryManager.getInstance();

    const data: SaveData = {
      version: SAVE_VERSION,
      milestone: quest.currentMilestone,
      items: inventory.getItemKeys(),
      playerX,
      playerY,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Reason: localStorage might be full or unavailable in some contexts
      console.warn("Speichern fehlgeschlagen");
    }
  }

  /** Load game state. Returns the save data or null if no save exists. */
  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data: SaveData = JSON.parse(raw);

      // Invalidate saves from older versions
      if (!data.version || data.version < SAVE_VERSION) {
        this.deleteSave();
        return null;
      }

      QuestManager.getInstance().setMilestone(data.milestone);
      InventoryManager.getInstance().setItems(data.items);

      return data;
    } catch {
      return null;
    }
  }

  /** Check if a valid save file exists. */
  hasSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return data.version === SAVE_VERSION;
    } catch {
      return false;
    }
  }

  /** Delete the save file. */
  deleteSave(): void {
    localStorage.removeItem(SAVE_KEY);
  }

  /** Reset all managers and delete save. */
  fullReset(): void {
    QuestManager.getInstance().reset();
    InventoryManager.getInstance().reset();
    this.deleteSave();
  }
}
