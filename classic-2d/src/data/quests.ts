/**
 * Quest milestone definitions for all 10 stages of the adventure.
 */

export interface QuestDef {
  id: number;
  name: string;
  description: string;
  hint: string;
  scene: string | null;
  /** Tile coordinates of the zone trigger on the overworld. */
  triggerX: number;
  triggerY: number;
  triggerW: number;
  triggerH: number;
  /** Item key rewarded on completion, if any. */
  reward: string | null;
}

export const QUESTS: QuestDef[] = [
  {
    id: 1,
    name: "Ankunft auf der Insel",
    description: "Tadeo erreicht die Schatzinsel mit seinem Boot. Erkunde die Umgebung und finde den Weg ins Landesinnere.",
    hint: "Bewege dich mit den Pfeiltasten und interagiere mit dem Schild.",
    scene: null, // Plays as overworld intro cinematic
    triggerX: 7,
    triggerY: 47,
    triggerW: 6,
    triggerH: 4,
    reward: null,
  },
  {
    id: 2,
    name: "Der Vulkan",
    description: "Ein aktiver Vulkan versperrt den Weg! Weiche den herabfallenden Lavabrocken aus und erreiche die sichere Zone.",
    hint: "Bewege dich schnell nach links und rechts, um den Steinen auszuweichen!",
    scene: "VolcanoScene",
    triggerX: 8,
    triggerY: 35,
    triggerW: 6,
    triggerH: 4,
    reward: null,
  },
  {
    id: 3,
    name: "Der See",
    description: "Ein friedlicher See liegt vor dir. Lies die alten Steintafeln und erfahre die Geschichte der Insel.",
    hint: "Gehe zu jeder Steintafel und drücke die Leertaste zum Lesen.",
    scene: null, // Plays on the overworld
    triggerX: 38,
    triggerY: 30,
    triggerW: 6,
    triggerH: 4,
    reward: null,
  },
  {
    id: 4,
    name: "Die Höhle des Schwerts",
    description: "Eine dunkle Höhle verbirgt ein magisches Schwert. Finde den Weg durch das Labyrinth und löse das Rätsel der Hebel.",
    hint: "Deine Fackel leuchtet nur ein kleines Stück. Merke dir den Weg!",
    scene: "CaveScene",
    triggerX: 12,
    triggerY: 18,
    triggerW: 4,
    triggerH: 4,
    reward: "sword",
  },
  {
    id: 5,
    name: "Der Zauberwald",
    description: "Im verzauberten Wald verstecken sich 5 magische Beeren. Finde sie alle, aber Vorsicht vor den Dornenbüschen!",
    hint: "Die Beeren leuchten leicht violett zwischen den Bäumen.",
    scene: "ForestScene",
    triggerX: 35,
    triggerY: 42,
    triggerW: 6,
    triggerH: 4,
    reward: "berry",
  },
  {
    id: 6,
    name: "Der Oger an der Brücke",
    description: "Ein riesiger Oger bewacht die Brücke! Besiege ihn im Kampf mit deinem magischen Schwert.",
    hint: "Verteidige dich, wenn der Oger seinen Hammer hebt, und greife danach an!",
    scene: "CombatScene",
    triggerX: 58,
    triggerY: 28,
    triggerW: 4,
    triggerH: 4,
    reward: null,
  },
  {
    id: 7,
    name: "Das Eingeborenendorf",
    description: "Die Bewohner des Dorfes haben einen goldenen Schlüssel. Bestehe ihre drei Gedächtnisprüfungen, um ihn zu erhalten.",
    hint: "Schau genau hin, welche Farben aufleuchten, und wiederhole die Reihenfolge mit den Pfeiltasten!",
    scene: "VillageScene",
    triggerX: 62,
    triggerY: 48,
    triggerW: 6,
    triggerH: 4,
    reward: "key",
  },
  {
    id: 8,
    name: "Der Berggipfel",
    description: "Erklimme den höchsten Berg der Insel! Springe zwischen den Felsvorsprüngen und weiche fallenden Steinen aus.",
    hint: "Warte auf den richtigen Moment zum Springen. Geduld zahlt sich aus!",
    scene: "MountainScene",
    triggerX: 65,
    triggerY: 10,
    triggerW: 5,
    triggerH: 4,
    reward: "hammer",
  },
  {
    id: 9,
    name: "Die Haiattacke",
    description: "Überquere das Meer zur Schatzinsel! Steuere das Boot und besiege den riesigen Hai.",
    hint: "Weiche den Wellen aus und schlage mit dem Hammer zu, wenn der Hai auftaucht!",
    scene: "SeaScene",
    triggerX: 26,
    triggerY: 7,
    triggerW: 3,
    triggerH: 3,
    reward: null,
  },
  {
    id: 10,
    name: "Die Schatzinsel",
    description: "Du hast es geschafft! Grabe den Schatz aus, zerschlage das Eis mit dem Hammer und öffne die Truhe mit dem Schlüssel.",
    hint: "Benutze deine gesammelten Gegenstände in der richtigen Reihenfolge.",
    scene: "TreasureScene",
    triggerX: 10,
    triggerY: 5,
    triggerW: 4,
    triggerH: 4,
    reward: null,
  },
];
