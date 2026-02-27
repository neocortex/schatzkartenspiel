/**
 * Enemy stat definitions for boss fights.
 */

export interface EnemyDef {
  key: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  spriteKey: string;
  /** Lines the enemy says during combat. */
  taunts: string[];
  /** Warning text shown before a special attack. */
  specialWarning: string;
  specialDamage: number;
  /** Hint shown when player is defeated. */
  defeatHint: string;
}

export const ENEMIES: Record<string, EnemyDef> = {
  ogre: {
    key: "ogre",
    name: "Der Oger",
    hp: 50,
    maxHp: 50,
    attack: 8,
    defense: 3,
    spriteKey: "ogre",
    taunts: [
      "GRRR! Niemand überquert MEINE Brücke!",
      "Du bist nur ein kleiner Junge! Ha!",
      "Mein Hammer wird dich zerquetschen!",
      "Du hast keine Chance gegen mich!",
    ],
    specialWarning: "Der Oger hebt seinen riesigen Hammer!",
    specialDamage: 15,
    defeatHint: "Tipp: Verteidige dich, wenn der Oger seinen Hammer hebt, und heile dich mit den Zauberbeeren!",
  },
  shark: {
    key: "shark",
    name: "Der Riesenhai",
    hp: 40,
    maxHp: 40,
    attack: 10,
    defense: 2,
    spriteKey: "shark",
    taunts: [
      "Der Hai umkreist dein Boot bedrohlich!",
      "Eine riesige Flosse durchschneidet die Wellen!",
      "Das Wasser brodelt unter deinem Boot!",
      "Der Hai schnappt nach deinem Boot!",
    ],
    specialWarning: "Der Hai taucht unter und nimmt Anlauf!",
    specialDamage: 18,
    defeatHint: "Tipp: Schlage mit dem Goldenen Hammer zu, wenn der Hai auftaucht, und verteidige dich beim Rammen!",
  },
};
