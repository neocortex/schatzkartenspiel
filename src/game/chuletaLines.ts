/**
 * Chuleta the hen's lines: how she joins the adventure, gentle hints when
 * Tadeo seems lost (per milestone), and a cheer after every finished quest.
 */

import { DialogueScript } from "../data/dialogues";

export const CHULETA_INTRO: DialogueScript = [
  { speaker: "Chuleta", portrait: "", text: "Gack! Und mich hast du wohl vergessen? Ich saß die ganze Zeit in deinem Rucksack!" },
  { speaker: "Tadeo", portrait: "", text: "Chuleta! Du bist ja mitgekommen!" },
  { speaker: "Chuleta", portrait: "", text: "Na klar! Wir finden den Schatz zusammen. Folge einfach dem goldenen Stern." },
  { speaker: "Chuleta", portrait: "", text: "Und sammle die Goldmünzen auf der Insel! Vielleicht gibt es dafür eine Überraschung..." },
  { speaker: "Tadeo", portrait: "", text: "Super, Chuleta! Los geht's!" },
];

/** Hint for the current milestone, said when nothing happened for a while. */
export const CHULETA_HINTS: Record<number, string> = {
  2: "Jemand ruft um Hilfe! Schnell zum Vulkan im Westen!",
  3: "Paco wartet im Dorf! Geh über die Trittsteine am Fluss.",
  4: "Nur der Geist weiß den Weg! Lös die Rätsel am See.",
  5: "Das Schwert liegt in der Höhle im Nordwesten. Gack!",
  6: "Die Zauberbeeren wachsen im Zauberwald! Er liegt südlich vom See.",
  7: "Der Schlüssel ist im Dorf. Sprich mit dem Dorfältesten!",
  8: "Nur der Oger hebt den Felsen! Er sitzt auf der Brücke.",
  9: "Der Hammer liegt ganz oben auf dem Berg. Gack!",
  10: "Dein Boot ist fertig! Es wartet am Steg im Norden.",
  11: "Das X wartet! Zurück zum Boot am Steg im Norden.",
  12: "Schnell! Das Herz muss zurück auf den alten Stein am Vulkan!",
};

/** Cheer after finishing a milestone (keyed by the milestone just finished). */
export const CHULETA_CHEERS: Record<number, string> = {
  2: "Puh, war das heiß! Fast hätte ich ein gekochtes Ei gelegt!",
  3: "Ein Geist? Gack! Mir stehen jetzt schon die Federn zu Berge!",
  4: "Gack! Wie meint er das?",
  5: "Ein echtes Zauberschwert! Du bist ein richtiger Held!",
  6: "Mmmh, Zauberbeeren! Darf ich eine picken? Nein? Schade!",
  7: "Der goldene Schlüssel! Jetzt fehlt nur noch der Hammer!",
  8: "Der Oger ist eigentlich ganz nett, oder?",
  9: "Was für eine Aussicht! Ich kann die kleine Insel sehen!",
};
