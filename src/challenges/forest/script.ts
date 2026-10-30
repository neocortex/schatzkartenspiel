/**
 * Extra German lines for the forest challenge (besides `forest_enter` and
 * `forest_complete`): meeting Flocke the fox, and short remarks shown in
 * speech bubbles while collecting berries or bumping into thorns.
 */

import { DialogueScript } from "../../data/dialogues";

const fox = (text: string) => ({ speaker: "Fuchs", portrait: "", text });

export const MEET_FOX: DialogueScript = [
  fox("Hallo Tadeo! Ich bin Flocke, der Zauberfuchs."),
  fox("Das Schwert vom Hüter! Nur vor seinem Licht haben die Dornen Angst."),
  fox("Die Büsche hier drin sind nur wilde Dornen. Lauf einfach drumherum."),
  fox("Fünf Zauberbeeren leuchten im Wald. Folge mir!"),
];

/** Tadeo's bubble after each berry (index = berries collected so far - 1). */
export const BERRY_LINES = ["Eine Zauberbeere! Lecker!", "Zwei! Wo ist die nächste?", "Schon drei!", "Nur noch eine!"];

export const OUCH_LINES = ["Autsch!", "Au, das piekst!", "Aua! Dornen!", "Autsch, autsch!"];

/** What Flocke says in a bubble at certain moments. */
export const FOX_LINES = {
  firstOuch: "Vorsicht, Dornen!",
  follow: "Hier lang!",
  hedge: "Der Eingang ist hinten!",
  bye: "Gute Reise, Tadeo!",
};

export const WADE_LINE = "Brr, das Wasser ist kalt!";
