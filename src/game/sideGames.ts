/**
 * Side games villagers offer at any time, next to the main quest: fishing
 * with Fischer Jonas and catching Kleine Mia's runaway hens. The first win
 * earns a prize hat; after that they can be played again just for fun.
 */

import { ChallengeName } from "../challenges/types";
import { OutfitId } from "../characters/hats";
import { DialogueScript } from "../data/dialogues";
import { NpcId } from "./Npcs";
import { P2 } from "../world/layout";

export interface SideGame {
  challenge: ChallengeName;
  /** The villager who offers it. */
  host: NpcId;
  /** Where Tadeo stands after the game: facing the host, just outside talking range. */
  back: P2;
  /** Prompt verb shown next to the villager. */
  verb: string;
  invite: DialogueScript;
  /** Invitation once the prize is won. */
  again: DialogueScript;
  prize: OutfitId;
  prizeName: string;
  /** What Chuleta says about the prize. */
  cheer: string;
}

const jonas = (text: string) => ({ speaker: "Fischer Jonas", portrait: "villager0", text });
const mia = (text: string) => ({ speaker: "Kleine Mia", portrait: "villager2", text });
const tadeo = (text: string) => ({ speaker: "Tadeo", portrait: "", text });

export const SIDE_GAMES: SideGame[] = [
  {
    challenge: "fishing",
    host: "villager0",
    back: [61.9, 42.8],
    verb: "Angeln",
    invite: [
      jonas("Hallo Tadeo! Heute beißen die Fische besonders gut."),
      jonas("Kommst du mit auf den Steg? Wer fünf Fische fängt, bekommt meinen alten Anglerhut!"),
      tadeo("Au ja, ich komme mit!"),
    ],
    again: [jonas("Na, Meisterangler? Noch eine Runde auf dem Steg?"), tadeo("Klar!")],
    prize: "fishingHat",
    prizeName: "Anglerhut",
    cheer: "Gack! Mit dem Anglerhut fängst du jeden Fisch, Tadeo!",
  },
  {
    challenge: "hens",
    host: "villager2",
    back: [56, 52.4],
    verb: "Hühner fangen",
    invite: [
      mia("Tadeo, Hilfe! Meine Hühner sind aus dem Stall gelaufen!"),
      mia("Fängst du sie wieder ein? Dann bekommst du die goldene Hühnerkönig-Krone!"),
      tadeo("Keine Sorge, Mia. Ich fange sie alle!"),
    ],
    again: [mia("Oh nein, die Hühner sind schon wieder weg! Hilfst du mir noch einmal?"), tadeo("Na klar!")],
    prize: "crown",
    prizeName: "Hühnerkönig-Krone",
    cheer: "Gack, gack! Hoch lebe König Tadeo, der Hühnerkönig!",
  },
];
