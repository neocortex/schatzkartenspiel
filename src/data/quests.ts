/**
 * Quest milestone definitions for all 12 stages of the adventure.
 * Where each quest starts on the island is set by `GATES` in game/Game.ts.
 */

export interface QuestDef {
  id: number;
  name: string;
  hint: string;
  /** Item key rewarded on completion, if any. */
  reward: string | null;
}

export const QUESTS: QuestDef[] = [
  {
    id: 1,
    name: "Ankunft",
    hint: "Hör zu und schau dich um!",
    reward: null,
  },
  {
    id: 2,
    name: "Der Vulkan",
    hint: "Jemand ruft um Hilfe! Schnell zum Vulkan im Westen!",
    reward: null,
  },
  {
    id: 3,
    name: "Das Dorf",
    hint: "Paco wartet im Dorf! Geh über die Trittsteine am Fluss.",
    reward: null,
  },
  {
    id: 4,
    name: "Der See",
    hint: "Nur der Geist weiß den Weg! Lös die Rätsel am See.",
    reward: null,
  },
  {
    id: 5,
    name: "Die Höhle",
    hint: "Das Schwert liegt in der Höhle im Nordwesten. Gack!",
    reward: "sword",
  },
  {
    id: 6,
    name: "Der Zauberwald",
    hint: "Die Zauberbeeren wachsen im Zauberwald! Er liegt südlich vom See.",
    reward: "berry",
  },
  {
    id: 7,
    name: "Das Dorf",
    hint: "Der Schlüssel ist im Dorf. Sprich mit dem Dorfältesten!",
    reward: "key",
  },
  {
    id: 8,
    name: "Der Oger",
    hint: "Nur der Oger hebt den Felsen! Er sitzt auf der Brücke.",
    reward: null,
  },
  {
    id: 9,
    name: "Der Berg",
    hint: "Der Hammer liegt ganz oben auf dem Berg. Gack!",
    reward: "hammer",
  },
  {
    id: 10,
    name: "Der Hai",
    hint: "Dein Boot ist fertig! Es wartet am Steg im Norden.",
    reward: null,
  },
  {
    id: 11,
    name: "Die Schatzinsel",
    hint: "Das X wartet! Zurück zum Boot am Steg im Norden.",
    reward: null,
  },
  {
    id: 12,
    name: "Das Herz des Vulkans",
    hint: "Schnell! Das Herz muss zurück auf den alten Stein am Vulkan!",
    reward: null,
  },
];
