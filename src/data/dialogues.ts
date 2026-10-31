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
      text: "Zauberbeeren! Die machen böse Monster wieder lieb.",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Ich muss weiter nach Osten. Dort führt eine Brücke über den Fluss.",
    },
  ],

  // -----------------------------------------------------------------------
  // Quest 8: the ogre. The fight is told in challenges/ogre/story.ts; on the island he lifts the boulder.
  // -----------------------------------------------------------------------
  ogre_enter: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Ich brauche deine Hilfe!",
    },
    {
      speaker: "Oger",
      portrait: "",
      text: "HA! Erst musst du an mir vorbei!",
    },
  ],
  // The first line is said before the berry, the rest after the ogre has eaten it
  ogre_defeat: [
    {
      speaker: "Oger",
      portrait: "",
      text: "Ugh... Du bist stärker, als du aussiehst.",
    },
    {
      speaker: "Oger",
      portrait: "",
      text: "Oh... Ich war gar nicht immer so böse.",
    },
  ],
  // At the foot of the boulder, back on the island
  ogre_boulder: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Das ist der Riesenfels! Kannst du ihn wegheben?",
    },
    {
      speaker: "Oger",
      portrait: "",
      text: "Der Fels? Den hebe ich dir mit einer Hand!",
    },
  ],
  ogre_boulder_done: [
    {
      speaker: "Chuleta",
      portrait: "",
      text: "Wow! Mit einer Hand! Gack!",
    },
  ],

  // -----------------------------------------------------------------------
  // Quest 7: the village. The elder says where the key came from; the trials follow.
  // -----------------------------------------------------------------------
  village_enter: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Hast du den Schlüssel für die Truhe?",
    },
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Der alte Schlüssel? Der lag eines Morgens vor meiner Tür.",
    },
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Mit einem Zettel: Nur für jemanden, der klug ist. Darum gibt es die Prüfungen.",
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
  ],
  village_simon3_fail: [
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Das war leider falsch! Versuche es noch einmal mit einer neuen Aufgabe.",
    },
  ],

  // Back on the island, the key in his hand: where the hammer is, and what stands in the way
  village_after: [
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Du hast ihn dir verdient! Jetzt fehlt noch der Hammer.",
    },
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Er liegt oben auf dem Berg.",
    },
    {
      speaker: "Dorfältester",
      portrait: "portrait_npc0",
      text: "Aber ein Riesenfels versperrt den Weg. Nur der Oger ist stark genug.",
    },
    {
      speaker: "Chuleta",
      portrait: "",
      text: "Ein Monster? Gack! Die Beeren!",
    },
  ],

  // -----------------------------------------------------------------------
  // Quest 9: the mountain
  // -----------------------------------------------------------------------
  mountain_enter: [
    {
      speaker: "Chuleta",
      portrait: "",
      text: "Ein alter Schrein! Den hat das alte Volk gebaut.",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Dort oben liegt der goldene Hammer!",
    },
  ],
  mountain_complete: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Der goldene Hammer! Er ist für das Eis, hier oben im Schnee!",
    },
    {
      speaker: "Chuleta",
      portrait: "",
      text: "Schau, die kleine Insel! Und da ist die Flosse...",
    },
  ],

  // -----------------------------------------------------------------------
  // Quest 10: the shark
  // -----------------------------------------------------------------------
  // At the dock, right before the crossing
  sea_dock: [
    {
      speaker: "Käpt'n Paco",
      portrait: "",
      text: "Dein Boot ist geflickt! Der Oger hat es hergetragen.",
    },
    {
      speaker: "Käpt'n Paco",
      portrait: "",
      text: "Folge den leuchtenden Seesternen. Da ist das Wasser sicher.",
    },
  ],
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
      speaker: "Chuleta",
      portrait: "",
      text: "Der Hai ist auch ein Monster! Gack! Die Beeren!",
    },
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Hier, Hai! Mach den Mund auf!",
    },
  ],
  shark_defeat: [
    {
      speaker: "Tadeo",
      portrait: "portrait_tadeo",
      text: "Der Hai ist wieder lieb! Jetzt kann ich sicher zur Schatzinsel fahren!",
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
      text: "Und so endet das große Abenteuer von Tadeo auf der Insel.",
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
