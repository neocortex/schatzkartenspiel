/**
 * Simple slot-based inventory system.
 * Tracks collected items and provides lookup for combat/quest use.
 */

import { ITEMS, ItemDef } from "../data/items";

export class InventoryManager {
  private static instance: InventoryManager;
  private items: Set<string> = new Set();

  private constructor() {}

  static getInstance(): InventoryManager {
    if (!InventoryManager.instance) {
      InventoryManager.instance = new InventoryManager();
    }
    return InventoryManager.instance;
  }

  /** Add an item by key. */
  addItem(key: string): void {
    if (ITEMS[key]) {
      this.items.add(key);
    }
  }

  /** Check if an item is in inventory. */
  hasItem(key: string): boolean {
    return this.items.has(key);
  }

  /** Remove an item (consumed). */
  removeItem(key: string): void {
    this.items.delete(key);
  }

  /** Get all collected item definitions. */
  getItems(): ItemDef[] {
    return Array.from(this.items)
      .map((k) => ITEMS[k])
      .filter(Boolean);
  }

  /** Get all collected item keys. */
  getItemKeys(): string[] {
    return Array.from(this.items);
  }

  /** Get combat-usable items. */
  getCombatItems(): ItemDef[] {
    return this.getItems().filter((item) => item.usableInCombat);
  }

  /** Set items from a saved list (for save/load). */
  setItems(keys: string[]): void {
    this.items = new Set(keys);
  }

  /** Reset inventory. */
  reset(): void {
    this.items.clear();
  }
}
