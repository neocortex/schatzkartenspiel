/**
 * Extra short German lines for the cave challenge (the main story lines
 * `cave_enter` and `cave_sword` live in data/dialogues.ts).
 */

import { DialogueScript } from "../../data/dialogues";

const tadeo = (text: string) => ({ speaker: "Tadeo", portrait: "portrait_tadeo", text });
const narrator = (text: string) => ({ speaker: "Erzähler", portrait: "", text });

export const LINES = {
  firstGate: [
    tadeo("Da vorne ist ein Gittertor! Und daneben leuchtet ein Hebel..."),
    narrator("Lauf zum Hebel und drücke die Leertaste, um ihn zu ziehen!"),
  ] as DialogueScript,
  grotto: [
    tadeo("Wow, ein unterirdischer See! Das Tor da hinten hat zwei Steine."),
    tadeo("Dann brauche ich bestimmt zwei Hebel. Ich schaue links und rechts nach!"),
  ] as DialogueScript,
  runeHall: [
    tadeo("Drei Hebel in drei Farben! Und an der Wand leuchten drei Steine."),
    narrator("Ziehe die Hebel in der Reihenfolge der Steine an der Wand – von links nach rechts!"),
  ] as DialogueScript,
  oneMore: "Ein Stein leuchtet! Jetzt noch der andere Hebel.",
  gate1Open: "Das Tor ist offen! Weiter geht's!",
  gate2Open: "Geschafft! Was wohl hinter diesem Tor wartet?",
  wallOpen: "Eine geheime Kammer! Da glitzert etwas...",
};

/** Gentle nudges after pulling a rune-hall lever in the wrong order. */
export const HINTS = [
  "Hoppla! Schau genau auf die Steine an der Wand.",
  "Fast! Der blinkende Stein zeigt, welche Farbe als Nächstes kommt.",
  "Nochmal! Von links nach rechts – wie beim Lesen.",
];
