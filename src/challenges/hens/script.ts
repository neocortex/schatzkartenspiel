/**
 * Everything Mia, Tadeo and Henni say in the hen game — short, warm German
 * sentences for a seven-year-old. Every line is read aloud by the voice
 * server, so `ALL_LINES` lists the fixed ones for prefetching.
 */

import { DialogueLine, DialogueScript } from "../../data/dialogues";
import { timeWords } from "./hud";

const mia = (text: string): DialogueLine => ({ speaker: "Kleine Mia", portrait: "villager2", text });
const tadeo = (text: string): DialogueLine => ({ speaker: "Tadeo", portrait: "", text });
const henni = (text: string): DialogueLine => ({ speaker: "Henni", portrait: "", text });

export const INTRO: DialogueScript = [
  mia("Oh je, Tadeo! Alle meine Hühner sind ausgebüxt!"),
  mia("Fängst du sie für mich? Lauf einfach in ein Huhn hinein. Dann flattert es in den Stall."),
  henni("Gack! Mit der Leertaste machst du einen großen Hüpfer nach vorne!"),
  tadeo("Na wartet, ihr Hühner! Ich komme!"),
];

export const GOLDEN: DialogueScript = [
  mia("Oh, schau mal! Da ist ja noch Goldi, mein goldenes Huhn!"),
  mia("Goldi versteckt sich gern hinter dem Heu. Sie ist flink, aber sie wird schnell müde."),
  tadeo("Dich finde ich auch, Goldi!"),
];

/** The happy ending, with the time and whether it is a new record. */
export function ending(seconds: number, best: number | null): DialogueScript {
  const lines: DialogueScript = [
    mia("Juhu! Alle sieben sind wieder zu Hause! Du bist ein echter Hühnerheld, Tadeo!"),
    mia(`Du hast alle in ${timeWords(seconds)} gefangen!`),
  ];
  if (best === null) lines.push(mia("Das ist dein erster Rekord! Vielleicht bist du nächstes Mal noch schneller."));
  else if (seconds < best) lines.push(mia("Das ist ein neuer Rekord! So schnell warst du noch nie!"));
  else lines.push(mia(`Dein Rekord liegt bei ${timeWords(best)}. Das schaffst du auch noch!`));
  lines.push(
    tadeo("Puh! Das hat Spaß gemacht. Die Hühner sind ganz schön flink!"),
    henni("Gack, gack! Das sind ja alles meine Cousinen!"),
    mia("Hihi! Komm mit, Tadeo. Ich habe eine Überraschung für dich!"),
  );
  return lines;
}

/** Mia's cheer when a bird lands in the coop. */
export function homeLine(name: string, chick: boolean): string {
  return chick ? `Piepsi, mein Kleines! Danke, Tadeo!` : `Juhu! ${name} ist wieder zu Hause!`;
}

export const HENNI = {
  close: ["Gack! Schnapp es dir!", "Schnell, Tadeo!", "Gack! Fast!", "Hopp, spring!"],
  tired: "Gack! Das Huhn ist müde. Jetzt schnell!",
  chick: "Piep, piep! Das Küken läuft dir hinterher. Bring es zu Mia!",
  hint: "Gack! Da drüben ist noch ein Huhn!",
  chickHint: "Gack! Bring das Küken zu Mia!",
  goldDash: "Gack! Goldi rennt zum nächsten Heuhaufen!",
  goldTired: "Goldi ist ganz müde. Jetzt kannst du sie fangen!",
};

const NAMES = ["Berta", "Frieda", "Lotte", "Hilde", "Rosi"];

/** Fixed lines (dialogue and bubbles) for the voice server to prepare early. */
export const ALL_LINES: { text: string; speaker: string }[] = [
  ...INTRO,
  ...GOLDEN,
  ...NAMES.map((n) => mia(homeLine(n, false))),
  mia(homeLine("Piepsi", true)),
  ...[...HENNI.close, HENNI.tired, HENNI.chick, HENNI.hint, HENNI.chickHint, HENNI.goldDash, HENNI.goldTired].map(henni),
];
