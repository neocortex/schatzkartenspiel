/**
 * Item definitions for the inventory system.
 */

export interface ItemDef {
  key: string;
  name: string;
  description: string;
  /** Frame index in the "items" spritesheet. */
  frame: number;
  /** Whether this item can be used in combat. */
  usableInCombat: boolean;
}

export const ITEMS: Record<string, ItemDef> = {
  sword: {
    key: "sword",
    name: "Magisches Schwert",
    description: "Ein verzaubertes Schwert, das in der Höhle gefunden wurde. Leuchtet blau im Kampf.",
    frame: 0,
    usableInCombat: true,
  },
  berry: {
    key: "berry",
    name: "Zauberbeeren",
    description: "Magische Beeren aus dem Zauberwald. Heilen Wunden und verleihen Superkraft.",
    frame: 1,
    usableInCombat: true,
  },
  key: {
    key: "key",
    name: "Goldener Schlüssel",
    description: "Ein goldener Schlüssel von den Dorfbewohnern. Öffnet die Schatztruhe.",
    frame: 2,
    usableInCombat: false,
  },
  hammer: {
    key: "hammer",
    name: "Goldener Hammer",
    description: "Ein mächtiger Hammer vom Berggipfel. Kann Eis und Stein zertrümmern.",
    frame: 3,
    usableInCombat: true,
  },
};
