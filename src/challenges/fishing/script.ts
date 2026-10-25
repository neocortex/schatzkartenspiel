/**
 * Everything said on the jetty (German, short and warm, for a 7-year-old):
 * the intro with the controls, short remarks during play (speech bubbles,
 * read aloud), the message in the bottle and the happy ending.
 */

import { DialogueScript } from "../../data/dialogues";

const jonas = (text: string) => ({ speaker: "Fischer Jonas", portrait: "villager0", text });
const tadeo = (text: string) => ({ speaker: "Tadeo", portrait: "", text });
const pico = (text: string) => ({ speaker: "Pico", portrait: "", text });

export const GOAL = 5;

export const INTRO: DialogueScript = [
  jonas("Willkommen auf meinem Steg, Tadeo! Schau mal ins Wasser."),
  tadeo("Wow! Das Wasser ist so klar. Da schwimmen ja ganz viele bunte Fische!"),
  jonas("Mit den Pfeiltasten zielst du. Mit der Leertaste wirfst du die Angel aus."),
  jonas("Wenn der Schwimmer ganz untertaucht, drückst du schnell die Leertaste!"),
  pico("Krah! Fang fünf Fische, Tadeo! Ich zähle mit!"),
];

/** Short remarks shown in speech bubbles (and read aloud). */
export const SAY = {
  aimHelp: "Ziel mit den Pfeiltasten. Dann Leertaste!",
  tooEarly: "Noch nicht! Warte, bis er ganz untertaucht.",
  nowPull: "Jetzt! Leertaste!",
  firstNibble: "Psst! Da knabbert einer!",
  cheers: ["Juhu, ich hab einen!", "Hurra!", "Ja! Gefangen!", "Schau mal, Pico!"],
  misses: [
    "Hoppla, der war flink! Macht nichts, gleich beißt der nächste.",
    "Der hat sich nur erschreckt. Versuch es nochmal!",
    "Nicht schlimm! Auch ich fange nicht jeden Fisch.",
  ],
  goldenSpotted: "Krah! Da glitzert was! Der goldene Fisch!",
  heavy: "Oh, der ist aber schwer!",
};

export const BOTTLE: DialogueScript = [
  tadeo("Eine Flaschenpost! Da ist ein Zettel drin."),
  tadeo("Da steht: Der Schatz liegt unter dem großen roten X."),
  pico("Krah! Ein Schatz! Ich wünsche mir eine goldene Socke!"),
  jonas("Hoho! Das ist zwar kein Fisch, aber ein toller Fang. Weiter geht's!"),
];

export function ending(bestCm: number): { praise: DialogueScript; farewell: DialogueScript } {
  return {
    praise: [
      jonas("Fünf Fische! Tadeo, du bist ein echter Meisterangler!"),
      jonas(`Dein größter Fisch war ${bestCm} Zentimeter lang!`),
      tadeo("Juhu! Und sogar der goldene Fisch war dabei!"),
      pico("Krah! Ich habe mitgezählt! Eins, zwei, drei, vier, fünf!"),
      jonas("Und jetzt lassen wir die Fische wieder frei. Die wollen nach Hause."),
    ],
    farewell: [tadeo("Tschüss, ihr Fische! Bis zum nächsten Mal!"), jonas("Komm bald wieder, Tadeo. Mein Steg ist immer für dich da!")],
  };
}

/** Every fixed line, so the voice server can prepare them while the scene loads. */
export const ALL_LINES = [
  ...INTRO,
  ...BOTTLE,
  ...SAY.misses.map(jonas),
  ...SAY.cheers.map(tadeo),
  jonas(SAY.aimHelp),
  jonas(SAY.tooEarly),
  jonas(SAY.nowPull),
  jonas(SAY.firstNibble),
  pico(SAY.goldenSpotted),
  tadeo(SAY.heavy),
];
