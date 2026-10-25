/**
 * Pico the parrot's lines: how he joins the adventure, gentle hints when
 * Tadeo seems lost (per milestone), and a cheer after every finished quest.
 */

import { DialogueScript } from "../data/dialogues";

export const PICO_INTRO: DialogueScript = [
  { speaker: "Pico", portrait: "", text: "Krah! Und mich hast du wohl vergessen? Ich bin Pico, dein Papagei!" },
  { speaker: "Pico", portrait: "", text: "Wir finden den Schatz zusammen! Folge einfach dem goldenen Stern." },
  { speaker: "Pico", portrait: "", text: "Und sammle die Goldmünzen auf der Insel! Vielleicht gibt es dafür eine Überraschung..." },
  { speaker: "Tadeo", portrait: "", text: "Super, Pico! Los geht's!" },
];

/** Hint for the current milestone, said when nothing happened for a while. */
export const PICO_HINTS: Record<number, string> = {
  1: "Krah! Lies mal das Schild da vorne am Strand!",
  2: "Der Vulkan raucht im Westen. Folge dem goldenen Stern!",
  3: "Am See stehen drei alte Steintafeln. Lies sie alle!",
  4: "Die Höhle ist im Nordwesten, unter dem großen Felsen!",
  5: "Der Zauberwald liegt südlich vom See. Krah!",
  6: "Die Brücke über den Fluss ist im Osten. Vorsicht, Oger!",
  7: "Sprich mit dem Dorfältesten. Er steht vor dem großen Haus!",
  8: "Der Berg ist im Nordosten. Ganz oben glänzt der Hammer!",
  9: "Zum Steg im Norden! Dort wartet ein Boot auf uns.",
  10: "Zum Steg im Norden! Auf zur Schatzinsel!",
};

/** Cheer after finishing a milestone (keyed by the milestone just finished). */
export const PICO_CHEERS: Record<number, string> = {
  1: "Krah! Ein Vulkan? Ich hab ein bisschen Angst... aber nur ein bisschen!",
  2: "Puh, das war heiß! Meine Federn sind ganz warm!",
  3: "Ein Geist! Krah! Hast du das gesehen?",
  4: "Ein echtes Zauberschwert! Du bist ein richtiger Held!",
  5: "Mmmh, Zauberbeeren! Darf ich eine probieren? Nein? Schade!",
  6: "Der Oger ist eigentlich ganz nett, oder?",
  7: "Der goldene Schlüssel! Jetzt fehlt nur noch der Hammer!",
  8: "Was für eine Aussicht! Ich kann die Schatzinsel sehen!",
};
