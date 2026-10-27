/**
 * Henni the hen's lines: how she joins the adventure, gentle hints when
 * Tadeo seems lost (per milestone), and a cheer after every finished quest.
 */

import { DialogueScript } from "../data/dialogues";

export const HENNI_INTRO: DialogueScript = [
  { speaker: "Henni", portrait: "", text: "Gack! Und mich hast du wohl vergessen? Ich saß die ganze Zeit in deinem Rucksack!" },
  { speaker: "Tadeo", portrait: "", text: "Henni! Du bist ja mitgekommen!" },
  { speaker: "Henni", portrait: "", text: "Na klar! Wir finden den Schatz zusammen. Folge einfach dem goldenen Stern." },
  { speaker: "Henni", portrait: "", text: "Und sammle die Goldmünzen auf der Insel! Vielleicht gibt es dafür eine Überraschung..." },
  { speaker: "Tadeo", portrait: "", text: "Super, Henni! Los geht's!" },
];

/** Hint for the current milestone, said when nothing happened for a while. */
export const HENNI_HINTS: Record<number, string> = {
  1: "Gack! Lies mal das Schild da vorne am Strand!",
  2: "Der Vulkan raucht im Westen. Folge dem goldenen Stern!",
  3: "Am See stehen drei alte Steintafeln. Lies sie alle!",
  4: "Die Höhle ist im Nordwesten, unter dem großen Felsen!",
  5: "Der Zauberwald liegt südlich vom See. Gack!",
  6: "Die Brücke über den Fluss ist im Osten. Vorsicht, Oger!",
  7: "Sprich mit dem Dorfältesten. Er steht vor dem großen Haus!",
  8: "Der Berg ist im Nordosten. Ganz oben glänzt der Hammer!",
  9: "Zum Steg im Norden! Dort wartet ein Boot auf uns.",
  10: "Zum Steg im Norden! Auf zur Schatzinsel!",
};

/** Cheer after finishing a milestone (keyed by the milestone just finished). */
export const HENNI_CHEERS: Record<number, string> = {
  1: "Gack! Ein Vulkan? Ich hab ein bisschen Angst... aber nur ein bisschen!",
  2: "Puh, war das heiß! Fast hätte ich ein gekochtes Ei gelegt!",
  3: "Ein Geist! Gack! Mir stehen alle Federn zu Berge!",
  4: "Ein echtes Zauberschwert! Du bist ein richtiger Held!",
  5: "Mmmh, Zauberbeeren! Darf ich eine picken? Nein? Schade!",
  6: "Der Oger ist eigentlich ganz nett, oder?",
  7: "Der goldene Schlüssel! Jetzt fehlt nur noch der Hammer!",
  8: "Was für eine Aussicht! Ich kann die Schatzinsel sehen!",
};
