/**
 * Linear quest progression tracker.
 * Manages which milestone the player is on and gates zone access.
 */

import { QUESTS, QuestDef } from "../data/quests";

export class QuestManager {
  private static instance: QuestManager;
  private currentMilestoneIndex = 0;

  private constructor() {}

  static getInstance(): QuestManager {
    if (!QuestManager.instance) {
      QuestManager.instance = new QuestManager();
    }
    return QuestManager.instance;
  }

  /** Get the current milestone number (1-based). */
  get currentMilestone(): number {
    return this.currentMilestoneIndex + 1;
  }

  /** Get the current quest definition. */
  get currentQuest(): QuestDef {
    return QUESTS[this.currentMilestoneIndex];
  }

  /** Get a quest by its 1-based milestone number. */
  getQuest(milestone: number): QuestDef | undefined {
    return QUESTS[milestone - 1];
  }

  /** Advance to the next milestone. Returns the new quest or null if game is complete. */
  completeMilestone(): QuestDef | null {
    if (this.currentMilestoneIndex < QUESTS.length - 1) {
      this.currentMilestoneIndex++;
      return this.currentQuest;
    }
    return null;
  }

  /** Check if a given milestone is accessible (current or past). */
  isMilestoneAccessible(milestone: number): boolean {
    return milestone <= this.currentMilestone;
  }

  /** Check if the game is complete (all milestones done). */
  get isGameComplete(): boolean {
    return this.currentMilestoneIndex >= QUESTS.length;
  }

  /** Set milestone directly (for save/load). */
  setMilestone(milestone: number): void {
    this.currentMilestoneIndex = Math.max(0, Math.min(milestone - 1, QUESTS.length - 1));
  }

  /** Get all quests. */
  get allQuests(): QuestDef[] {
    return QUESTS;
  }

  /** Reset to the beginning. */
  reset(): void {
    this.currentMilestoneIndex = 0;
  }
}
