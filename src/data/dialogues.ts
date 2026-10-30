/**
 * All dialogue scripts in German.
 * Keys correspond to trigger points in the game.
 */

export interface DialogueLine {
  speaker: string;
  portrait: string;
  text: string;
  /** Read aloud instead of `text` when the text has a changing value that has no recording. */
  spoken?: string;
}

export type DialogueScript = DialogueLine[];

export const DIALOGUES: Record<string, DialogueScript> = {
  // -----------------------------------------------------------------------
  // Milestone 1: Arrival
  // -----------------------------------------------------------------------
  intro: [
    {
      speaker: "Erzähler",
      portrait: "",
      text: "Nach langer Reise über das weite Meer erreicht Tadeo endlich die geheimnisvolle Schatzinsel...",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Das muss sie sein! Die Insel von der alten Schatzkarte! Irgendwo hier liegt ein unglaublicher Schatz verborgen.",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Ich muss die Insel erkunden und den Schatz finden. Aber zuerst sollte ich mich umsehen.",
    },
    {
      speaker: "Erzähler",
      portrait: "",
      text: "Benutze die Pfeiltasten zum Bewegen und die Leertaste zum Interagieren!",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Ich sehe Rauch im Westen... Das könnte ein Vulkan sein! Ich sollte dort nachsehen.",
    },
  ],

  // -----------------------------------------------------------------------
  // Milestone 2: Volcano
  // -----------------------------------------------------------------------
  volcano_enter: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Der Vulkan spuckt Feuer! Ich muss irgendwie an den Lavabrocken vorbei!",
    },
  ],
  volcano_complete: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Geschafft! Der Weg nach Norden ist frei.",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Ich sehe einen See im Osten. Vielleicht finde ich dort Hinweise über den Schatz!",
    },
  ],

  // -----------------------------------------------------------------------
  // Milestone 4: Cave
  // -----------------------------------------------------------------------
  cave_enter: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Eine dunkle Höhle... Zum Glück habe ich eine Fackel dabei. Irgendwo hier soll ein magisches Schwert versteckt sein!",
    },
  ],
  cave_sword: [
    {
      speaker: "Erzähler",
      portrait: "",
      text: "In einer verborgenen Kammer liegt ein altes Schwert auf einem Steinaltar. Es leuchtet schwach blau.",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Das Magische Schwert! Damit kann ich mich gegen die Gefahren der Insel verteidigen!",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Jetzt brauche ich die Zauberbeeren. Im Süden liegt ein geheimnisvoller Wald...",
    },
  ],

  // -----------------------------------------------------------------------
  // Milestone 3: Lake
  // -----------------------------------------------------------------------
  lake_tablet1: [
    {
      speaker: "Steintafel",
      portrait: "",
      text: "Vor langer Zeit lebte ein mächtiger König auf dieser Insel. Sein größter Schatz wurde an einem geheimen Ort versteckt.",
    },
  ],
  lake_tablet2: [
    {
      speaker: "Steintafel",
      portrait: "",
      text: "Nur wer mutig genug ist, alle Prüfungen zu bestehen, wird den Schatz finden. Vier Gegenstände zeigen den Weg.",
    },
  ],
  lake_tablet3: [
    {
      speaker: "Geist",
      portrait: "",
      text: "Du bist also der Auserwählte... Bestehe die Prüfungen der Insel, junger Held. Der Schatz wartet auf dich.",
    },
  ],
  lake_complete: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Vier Gegenstände also... Schwert, Beeren, Schlüssel und Hammer. Ich muss sie alle finden!",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Die Tafeln erwähnen ein Schwert in einer Höhle im Nordwesten. Da fange ich an!",
    },
  ],

  // -----------------------------------------------------------------------
  // Milestone 5: Forest
  // -----------------------------------------------------------------------
  forest_enter: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Der Zauberwald! Hier sollen magische Beeren wachsen. Aber Vorsicht vor den Dornen!",
    },
  ],
  forest_complete: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Alle fünf Zauberbeeren gesammelt! Ihre Kraft durchströmt mich. Jetzt kann ich Wunden heilen!",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Ich muss weiter nach Osten. Dort führt eine Brücke über den Fluss.",
    },
  ],

  // -----------------------------------------------------------------------
  // Milestone 6: Ogre
  // -----------------------------------------------------------------------
  ogre_enter: [
    {
      speaker: "Oger",
      portrait: "",
      text: "HALT! Wer wagt es, meine Brücke zu überqueren?!",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Ich bin Tadeo! Ich suche den Schatz dieser Insel. Lass mich vorbei!",
    },
    {
      speaker: "Oger",
      portrait: "",
      text: "HA! Dann musst du zuerst an MIR vorbei! Mach dich bereit zum Kampf!",
    },
  ],
  ogre_defeat: [
    {
      speaker: "Oger",
      portrait: "",
      text: "Ugh... Du bist stärker als du aussiehst, kleiner Mensch. Geh... die Brücke gehört dir.",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Danke! Der Weg über den Fluss ist frei!",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Im Süden sehe ich ein Dorf. Vielleicht haben die Bewohner den goldenen Schlüssel!",
    },
  ],

  // -----------------------------------------------------------------------
  // Milestone 7: Village
  // -----------------------------------------------------------------------
  village_enter: [
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Willkommen, junger Reisender! Wir haben von deiner Suche gehört.",
    },
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Wir besitzen einen goldenen Schlüssel, der die Schatztruhe öffnen kann. Aber zuerst musst du drei Prüfungen bestehen!",
    },
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Sprich mit unseren drei Weisen -- der Reihe nach! Jeder hat eine andere Aufgabe für dich.",
    },
  ],
  village_simon1_intro: [
    {
      speaker: "Weise Frau",
      portrait: "portrait_npc1",
      text: "Ich zeige dir ein Muster aus drei Schritten. Schau genau hin und wiederhole es mit den Pfeiltasten!",
    },
  ],
  village_simon1_success: [
    {
      speaker: "Weise Frau",
      portrait: "portrait_npc1",
      text: "Sehr gut! Du hast ein gutes Gedächtnis, junger Held!",
    },
  ],
  village_simon1_fail: [
    {
      speaker: "Weise Frau",
      portrait: "portrait_npc1",
      text: "Das war leider falsch! Schau nochmal genau hin...",
    },
  ],
  village_simon2_intro: [
    {
      speaker: "Weiser Mann",
      portrait: "portrait_npc2",
      text: "Meine Aufgabe ist schwieriger -- vier Schritte! Merk dir die Reihenfolge gut!",
    },
  ],
  village_simon2_success: [
    {
      speaker: "Weiser Mann",
      portrait: "portrait_npc2",
      text: "Ausgezeichnet! Du bist wirklich aufmerksam!",
    },
  ],
  village_simon2_fail: [
    {
      speaker: "Weiser Mann",
      portrait: "portrait_npc2",
      text: "Leider daneben! Versuch es nochmal. Pass gut auf!",
    },
  ],
  village_simon3_intro: [
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Die letzte Prüfung! Löse die Rechenaufgabe, um den Schlüssel zu erhalten!",
    },
  ],
  village_simon3_success: [
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Wunderbar! Du hast alle drei Prüfungen bestanden! Hier ist der Goldene Schlüssel!",
    },
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Dir fehlt noch der Hammer. Auf dem höchsten Berg im Norden liegt ein alter Schrein!",
    },
  ],
  village_simon3_fail: [
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Das war leider falsch! Versuche es noch einmal mit einer neuen Aufgabe.",
    },
  ],

  // -----------------------------------------------------------------------
  // Milestone 8: Mountain
  // -----------------------------------------------------------------------
  mountain_enter: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Der höchste Berg der Insel! Ganz oben soll ein goldener Hammer in einem Schrein liegen.",
    },
  ],
  mountain_complete: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Der Goldene Hammer! Damit kann ich sogar Eis zerschmettern!",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Ich habe alle vier Gegenstände! Jetzt muss ich zum Steg im Norden und zur Schatzinsel übersetzen!",
    },
  ],

  // -----------------------------------------------------------------------
  // Milestone 9: Shark
  // -----------------------------------------------------------------------
  sea_crossing: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Die kleine Schatzinsel liegt dort drüben! Ich muss mit dem Boot rüberfahren.",
    },
    {
      speaker: "Erzähler",
      portrait: "",
      text: "Vorsicht — hohe Wellen! Weiche ihnen mit den Pfeiltasten aus!",
    },
  ],
  sea_shark: [
    {
      speaker: "Erzähler",
      portrait: "",
      text: "Plötzlich erscheint eine riesige Flosse im Wasser...",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Ein Riesenhai! Ich muss ihn besiegen, um sicher rüberzukommen!",
    },
  ],
  shark_defeat: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Der Hai ist besiegt! Jetzt kann ich sicher zur Schatzinsel fahren!",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Das große X auf der Karte... Der Schatz muss dort vergraben sein!",
    },
  ],

  // -----------------------------------------------------------------------
  // Milestone 10: Treasure
  // -----------------------------------------------------------------------
  treasure_arrive: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Die Schatzinsel! Hier muss der Schatz vergraben sein!",
    },
    {
      speaker: "Erzähler",
      portrait: "",
      text: "Ein großes X markiert die Stelle. Tadeo beginnt zu graben...",
    },
  ],
  treasure_dig: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Eine Truhe! Aber sie ist in Eis eingeschlossen. Ich brauche den Goldenen Hammer!",
    },
  ],
  treasure_hammer: [
    {
      speaker: "Erzähler",
      portrait: "",
      text: "Mit einem mächtigen Schlag zerschmettert Tadeo das Eis!",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Jetzt noch der Goldene Schlüssel...",
    },
  ],
  treasure_open: [
    {
      speaker: "Erzähler",
      portrait: "",
      text: "Die Truhe öffnet sich mit einem goldenen Leuchten!",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "DER SCHATZ! Unglaublich! Gold, Edelsteine, und... eine Krone!",
    },
    {
      speaker: "Erzähler",
      portrait: "",
      text: "Tadeo hat den legendären Schatz der Insel gefunden! Was für ein Abenteuer!",
    },
  ],

  // -----------------------------------------------------------------------
  // Victory
  // -----------------------------------------------------------------------
  victory: [
    {
      speaker: "Erzähler",
      portrait: "",
      text: "Und so endet das große Abenteuer von Tadeo auf der Schatzinsel.",
    },
    {
      speaker: "Erzähler",
      portrait: "",
      text: "Mit Mut, Klugheit und Entschlossenheit hat er alle Prüfungen bestanden und den Schatz gefunden.",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Das war das beste Abenteuer meines Lebens! Aber wer weiß... vielleicht wartet schon das nächste!",
    },
  ],
};
