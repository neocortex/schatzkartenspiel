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
  intro_bottle: [
    {
      speaker: "Erzähler",
      portrait: "",
      text: "Eines Morgens findet Tadeo am Strand eine Flaschenpost.",
    },
    {
      speaker: "Erzähler",
      portrait: "",
      text: "Darin ist eine alte Schatzkarte. Sie zeigt eine kleine Insel mit einem großen X.",
    },
  ],
  intro_treasure: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Ein Schatz! Den hole ich mir!",
    },
  ],
  intro_arrival: [
    {
      speaker: "Chuleta",
      portrait: "",
      text: "Gack! Der Hai hat unser Boot kaputt gemacht!",
    },
    {
      speaker: "Stimme",
      portrait: "",
      text: "Hilfe! Hilfe!",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Das kommt vom Vulkan! Schnell!",
    },
    {
      speaker: "Chuleta",
      portrait: "",
      text: "Folge dem goldenen Stern! Gack!",
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
  // Paco under the rock is free. The empty hollow behind him is the game's mystery, so he brushes it aside.
  volcano_paco_thanks: [
    {
      speaker: "Käpt'n Paco",
      portrait: "",
      text: "Danke, Junge! Ich bin Käpt'n Paco.",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Was ist das für ein Stein?",
    },
    {
      speaker: "Käpt'n Paco",
      portrait: "",
      text: "Ach, alter Kram.",
    },
  ],
  volcano_paco_boat: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Mein Boot ist kaputt.",
    },
    {
      speaker: "Käpt'n Paco",
      portrait: "",
      text: "Das flicke ich dir. Komm ins Dorf!",
    },
    {
      speaker: "Käpt'n Paco",
      portrait: "",
      text: "Nimm die Trittsteine. Auf der Brücke sitzt ein Oger.",
    },
  ],

  // -----------------------------------------------------------------------
  // Milestone 4: Cave
  // -----------------------------------------------------------------------
  cave_enter: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Eine dunkle Höhle! Zum Glück habe ich meine Fackel.",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Da vorne versperren Steine den Weg. Und da sitzt ein Maulwurf!",
    },
  ],
  cave_sword: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Das Schwert! Es leuchtet blau.",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Damit komme ich durch die Dornen!",
    },
  ],

  // -----------------------------------------------------------------------
  // Quest 3: the elder tells the legend; the map shows where the heart is
  // -----------------------------------------------------------------------
  elder_legend: [
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Du hast Paco gerettet. Danke, Tadeo!",
    },
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Unser Vulkan hat ein Herz: das Feuerherz.",
    },
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Solange es auf dem alten Stein liegt, schläft der Vulkan.",
    },
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Aber ein Pirat hat es gestohlen. Jetzt wacht der Vulkan auf!",
    },
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Und niemand weiß, wo das Herz ist.",
    },
    // Tadeo's line ends the script; the map card follows it
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Moment! Ich habe eine Karte!",
    },
  ],
  elder_after_map: [
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Das X! Dort muss es sein!",
    },
    {
      speaker: "Käpt'n Paco",
      portrait: "",
      text: "Hm, hm.",
    },
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Wie du hinkommst, weiß nur der Geist am See.",
    },
  ],

  // -----------------------------------------------------------------------
  // Quest 4: three riddles wake the ghost at the lake (the riddles are in game/lake.ts)
  // -----------------------------------------------------------------------
  lake_wrong: [
    {
      speaker: "Steintafel",
      portrait: "",
      text: "Hm, das passt noch nicht. Versuch es noch einmal!",
    },
  ],
  lake_hueter: [
    {
      speaker: "Hüter",
      portrait: "",
      text: "Ich bin der Hüter. Ich habe auf das Herz aufgepasst.",
    },
    {
      speaker: "Hüter",
      portrait: "",
      text: "Aber ich bin ein Geist. Ich habe keine Hände.",
    },
    {
      speaker: "Hüter",
      portrait: "",
      text: "Du hast Hände, Tadeo. Bring das Herz zurück!",
    },
  ],
  // The four rhyming lines, then Tadeo's plain version of them
  lake_rhyme: [
    {
      speaker: "Hüter",
      portrait: "",
      text: "Das Schwert aus dem Fels zerschneidet den Dorn,",
    },
    {
      speaker: "Hüter",
      portrait: "",
      text: "die Beere im Wald nimmt den Monstern den Zorn.",
    },
    {
      speaker: "Hüter",
      portrait: "",
      text: "Der Hammer vom Berg zerschlägt das Eis,",
    },
    {
      speaker: "Hüter",
      portrait: "",
      text: "der Schlüssel vom Dorf für das Herz, so heiß.",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Also: Das Schwert für die Dornen. Die Beeren für die Monster.",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Der Hammer für das Eis. Der Schlüssel für die Truhe!",
    },
  ],
  lake_after_rhyme: [
    {
      speaker: "Hüter",
      portrait: "",
      text: "Keine Angst vor dem Herz. Es verbrennt nur Diebe.",
    },
    {
      speaker: "Hüter",
      portrait: "",
      text: "Und der Pirat... Er ist näher, als du denkst.",
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
