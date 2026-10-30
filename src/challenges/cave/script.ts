/**
 * Short German lines for the cave challenge (the main story lines `cave_enter`
 * and `cave_sword` live in data/dialogues.ts).
 */

import { DialogueScript } from "../../data/dialogues";

const tadeo = (text: string) => ({ speaker: "Tadeo", portrait: "portrait_tadeo", text });
const maulwurf = (text: string) => ({ speaker: "Maulwurf", portrait: "", text });

export const LINES = {
  moleAsks: [maulwurf("Ich habe Hunger! Bring mir einen Leuchtpilz, dann grabe ich dir den Weg frei.")] as DialogueScript,
  moleSmells: [maulwurf("Ich rieche einen Leuchtpilz! Gib ihn mir, dann grabe ich dir den Weg frei.")] as DialogueScript,
  moleReminder: [maulwurf("Mein Bauch knurrt! Der Leuchtpilz wächst links, hinten im Dunkeln.")] as DialogueScript,
  moleAsksTwo: [
    maulwurf("Noch mehr Steine! Bring mir zwei Leuchtpilze, dann grabe ich wieder."),
    tadeo("Zwei Pilze? Ich suche links und rechts!"),
  ] as DialogueScript,
  moleReminderTwo: [maulwurf("Zwei Pilze, bitte! Sie wachsen links und rechts, ganz hinten.")] as DialogueScript,
  moleOneMore: [maulwurf("Mmh, einer! Ich brauche noch einen. Schau auf der anderen Seite.")] as DialogueScript,
  /** Said while handing the mushrooms over, one script per rockfall. */
  handOver: [[tadeo("Hier, dein Leuchtpilz!")], [tadeo("Hier sind deine zwei Pilze!")]] as DialogueScript[],
  /** The mole with his mouth full, one script per rockfall. */
  moleFed: [
    [maulwurf("Mmh, lecker! Jetzt grabe ich.")],
    [maulwurf("Mmh, satt! Hinter den Steinen ist die Wand vom alten Volk.")],
  ] as DialogueScript[],
  paintings: [
    tadeo("Die Bilder an der Wand! Erst der Vulkan, dann der Schneeberg, dann der Wald."),
    tadeo("Rot wie der Vulkan, weiß wie der Schnee, grün wie der Wald!"),
  ] as DialogueScript,
};

/** Tadeo's remarks in a speech bubble. */
export const TADEO_REMARKS = {
  pickedForMole: "Ein Leuchtpilz! Den bringe ich dem Maulwurf.",
  pickedOneOfTwo: "Ein Pilz! Jetzt noch der andere.",
  pickedBoth: "Zwei Pilze! Schnell zum Maulwurf!",
  wayOpen: "Der Weg ist frei! Danke, Maulwurf!",
  hallOpen: "Geschafft! Was wohl da hinten wartet?",
  wallOpen: "Die Wand ist offen! Da glitzert etwas...",
};

/** Kind words after a wrong crystal; the second one says outright where to start. */
export const WRONG_CRYSTAL = [
  "Hoppla! Schau nochmal auf die Bilder an der Wand.",
  "Fast! Zuerst kommt der Vulkan. Das ist der rote Kristall.",
  "Macht nichts! Die Bilder zeigen, was zuerst kommt.",
];

/** What Tadeo thinks aloud when nothing has happened for a while: the reason, then the place. */
export const PHASE_HINTS = {
  meetMole: "Steine versperren den Weg. Der Maulwurf da vorne kann graben.",
  findFirst: "Der Maulwurf hat Hunger. Der Leuchtpilz wächst links, hinten im Dunkeln.",
  findTwo: "Der Maulwurf braucht zwei Pilze. Sie wachsen links und rechts, ganz hinten.",
  findOther: "Ein Pilz fehlt noch. Er wächst auf der anderen Seite vom See.",
  bring: "Der Maulwurf wartet auf die Pilze. Er sitzt bei den Steinen.",
  test: "Die Wand öffnet sich nur mit Kristallen. Schau auf die Bilder an der Wand.",
  chamber: "Die Wand ist offen. Das Schwert wartet dahinter!",
};
