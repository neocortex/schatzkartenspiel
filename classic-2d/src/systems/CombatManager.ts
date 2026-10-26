/**
 * Turn-based combat logic engine.
 * Handles damage calculation, turn order, and state transitions.
 */

import { EnemyDef } from "../data/enemies";
import { InventoryManager } from "./InventoryManager";
import { randomInt } from "../utils/helpers";

export type CombatAction = "attack" | "defend" | "heal" | "special";

export interface CombatState {
  playerHp: number;
  playerMaxHp: number;
  playerDefending: boolean;
  playerSpecialCharge: number;
  enemyHp: number;
  enemyMaxHp: number;
  enemyNextSpecial: boolean;
  turn: number;
  isPlayerTurn: boolean;
  log: string[];
  result: "ongoing" | "victory" | "defeat";
}

const PLAYER_BASE_ATTACK = 6;
const PLAYER_BASE_DEFENSE = 2;
const PLAYER_MAX_HP = 40;
const HEAL_AMOUNT = 15;
const SPECIAL_CHARGE_NEEDED = 3;
const SPECIAL_MULTIPLIER = 2.5;

export class CombatManager {
  private state: CombatState;
  private enemy: EnemyDef;
  private inventory: InventoryManager;

  constructor(enemy: EnemyDef) {
    this.enemy = enemy;
    this.inventory = InventoryManager.getInstance();
    this.state = {
      playerHp: PLAYER_MAX_HP,
      playerMaxHp: PLAYER_MAX_HP,
      playerDefending: false,
      playerSpecialCharge: 0,
      enemyHp: enemy.hp,
      enemyMaxHp: enemy.maxHp,
      enemyNextSpecial: false,
      turn: 1,
      isPlayerTurn: true,
      log: [],
      result: "ongoing",
    };
  }

  /** Get current combat state (read-only snapshot). */
  getState(): Readonly<CombatState> {
    return { ...this.state };
  }

  /** Execute a player action, then the enemy takes their turn. */
  executePlayerAction(action: CombatAction): CombatState {
    if (this.state.result !== "ongoing" || !this.state.isPlayerTurn) {
      return this.getState();
    }

    this.state.playerDefending = false;
    this.state.log = [];

    switch (action) {
      case "attack":
        this.playerAttack();
        break;
      case "defend":
        this.playerDefend();
        break;
      case "heal":
        this.playerHeal();
        break;
      case "special":
        this.playerSpecial();
        break;
    }

    // Check if enemy is defeated
    if (this.state.enemyHp <= 0) {
      this.state.enemyHp = 0;
      this.state.result = "victory";
      this.state.log.push(`${this.enemy.name} wurde besiegt!`);
      return this.getState();
    }

    // Enemy turn
    this.state.isPlayerTurn = false;
    this.enemyTurn();

    // Check if player is defeated
    if (this.state.playerHp <= 0) {
      this.state.playerHp = 0;
      this.state.result = "defeat";
      this.state.log.push("Tadeo wurde besiegt...");
      return this.getState();
    }

    // Next turn
    this.state.turn++;
    this.state.isPlayerTurn = true;
    return this.getState();
  }

  private playerAttack(): void {
    const hasSword = this.inventory.hasItem("sword");
    const weaponBonus = hasSword ? 4 : 0;
    const raw = PLAYER_BASE_ATTACK + weaponBonus + randomInt(0, 3);
    const damage = Math.max(1, raw - this.enemy.defense);
    this.state.enemyHp -= damage;
    this.state.playerSpecialCharge = Math.min(this.state.playerSpecialCharge + 1, SPECIAL_CHARGE_NEEDED);

    const weaponName = hasSword ? "dem Magischen Schwert" : "bloßen Händen";
    this.state.log.push(`Tadeo greift mit ${weaponName} an! ${damage} Schaden!`);
  }

  private playerDefend(): void {
    this.state.playerDefending = true;
    this.state.playerSpecialCharge = Math.min(this.state.playerSpecialCharge + 1, SPECIAL_CHARGE_NEEDED);
    this.state.log.push("Tadeo nimmt Verteidigungshaltung ein!");
  }

  private playerHeal(): void {
    if (!this.inventory.hasItem("berry")) {
      this.state.log.push("Tadeo hat keine Zauberbeeren!");
      return;
    }
    const healed = Math.min(HEAL_AMOUNT, this.state.playerMaxHp - this.state.playerHp);
    this.state.playerHp += healed;
    this.state.log.push(`Tadeo isst eine Zauberbeere und heilt ${healed} HP!`);
  }

  private playerSpecial(): void {
    if (this.state.playerSpecialCharge < SPECIAL_CHARGE_NEEDED) {
      this.state.log.push(`Spezialangriff noch nicht bereit! (${this.state.playerSpecialCharge}/${SPECIAL_CHARGE_NEEDED})`);
      return;
    }

    const hasHammer = this.inventory.hasItem("hammer");
    const hasSword = this.inventory.hasItem("sword");
    const weaponBonus = hasHammer ? 8 : hasSword ? 4 : 0;
    const raw = Math.floor((PLAYER_BASE_ATTACK + weaponBonus) * SPECIAL_MULTIPLIER) + randomInt(0, 5);
    const damage = Math.max(1, raw - this.enemy.defense);
    this.state.enemyHp -= damage;
    this.state.playerSpecialCharge = 0;
    this.state.log.push(`Tadeo führt einen Spezialangriff aus! ${damage} Schaden!`);
  }

  private enemyTurn(): void {
    // Decide if this turn is a special attack
    if (this.state.enemyNextSpecial) {
      this.enemySpecialAttack();
      this.state.enemyNextSpecial = false;
      return;
    }

    // Every 3rd turn, telegraph a special attack
    if (this.state.turn > 0 && this.state.turn % 3 === 0) {
      this.state.enemyNextSpecial = true;
      this.state.log.push(this.enemy.specialWarning);
      // Enemy skips normal attack while telegraphing
      return;
    }

    // Normal attack
    const raw = this.enemy.attack + randomInt(0, 3);
    const defenseBonus = this.state.playerDefending ? PLAYER_BASE_DEFENSE * 2 : PLAYER_BASE_DEFENSE;
    const damage = Math.max(1, raw - defenseBonus);
    this.state.playerHp -= damage;

    const taunt = this.enemy.taunts[randomInt(0, this.enemy.taunts.length - 1)];
    this.state.log.push(`${this.enemy.name} greift an! ${damage} Schaden!`);
    this.state.log.push(taunt);
  }

  private enemySpecialAttack(): void {
    const raw = this.enemy.specialDamage + randomInt(0, 3);
    const defenseBonus = this.state.playerDefending ? PLAYER_BASE_DEFENSE * 3 : PLAYER_BASE_DEFENSE;
    const damage = Math.max(1, raw - defenseBonus);
    this.state.playerHp -= damage;
    this.state.log.push(`${this.enemy.name} führt einen Spezialangriff aus! ${damage} Schaden!`);

    if (this.state.playerDefending) {
      this.state.log.push("Tadeos Verteidigung hat den Schaden reduziert!");
    }
  }

  /** Get the enemy definition. */
  getEnemy(): EnemyDef {
    return this.enemy;
  }
}
