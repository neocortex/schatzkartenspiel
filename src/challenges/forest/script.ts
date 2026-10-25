/**
 * Extra German lines for the forest challenge (besides `forest_enter` and
 * `forest_complete`): meeting Flocke the fox, and short remarks shown in
 * speech bubbles while collecting berries or bumping into thorns.
 */

import { DialogueScript } from "../../data/dialogues";

const fox = (text: string) => ({ speaker: "Fuchs", portrait: "", text });
const tadeo = (text: string) => ({ speaker: "Tadeo", portrait: "portrait_tadeo", text });

export const MEET_FOX: DialogueScript = [
  fox("Hallo Tadeo! Ich bin Flocke, der Zauberfuchs."),
  tadeo("Ein sprechender Fuchs! Weißt du, wo die Zauberbeeren wachsen?"),
  fox("Klar! Fünf Beeren leuchten hier im Wald. Lauf mir einfach nach!"),
  fox("Aber pass auf die Dornenbüsche auf. Die pieksen!"),
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
