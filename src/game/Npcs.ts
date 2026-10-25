/**
 * Island people — the village elder, the two wise ones and a few villagers.
 * They idle, turn towards Tadeo when he comes close and have something
 * friendly to say when he talks to them.
 */

import * as THREE from "three";
import { Humanoid, blobShadow } from "../characters/Humanoid";
import { createElder, createWiseWoman, createWiseMan, createVillager } from "../characters/cast";
import { Heightfield } from "../world/Heightfield";
import { Colliders } from "../world/Colliders";
import { VILLAGE, P2 } from "../world/layout";
import { DialogueScript } from "../data/dialogues";

export type NpcId = "elder" | "wiseWoman" | "wiseMan" | "villager0" | "villager1" | "villager2" | "villager3";

export interface Npc {
  id: NpcId;
  speaker: string;
  avatar: Humanoid;
  position: THREE.Vector3;
  /** Direction they face when nobody is around. */
  homeFacing: number;
  /** Lines for casual chats (picked in turn). */
  chatter: DialogueScript;
  chatIndex: number;
}

const line = (speaker: string, text: string) => ({ speaker, portrait: "", text });

const VILLAGERS: { at: P2; facing: number; name: string; lines: string[] }[] = [
  {
    at: [60, 40],
    facing: 0.6,
    name: "Fischer Jonas",
    lines: [
      "Hallo Tadeo! Heute beißen die Fische besonders gut.",
      "Hast du die Krabben am Strand gesehen? Die laufen immer seitwärts!",
    ],
  },
  {
    at: [69, 50],
    facing: -2.4,
    name: "Bäckerin Lina",
    lines: ["Mmmh, riechst du das? Frisches Kokosbrot!", "Wer mutig ist, braucht ein gutes Frühstück!"],
  },
  {
    at: [56, 49],
    facing: 2.2,
    name: "Kleine Mia",
    lines: ["Wollen wir Fangen spielen? Du bist dran!", "Ich habe gehört, im Zauberwald leuchten die Pilze in der Nacht!"],
  },
  {
    at: [72, 42],
    facing: -1.2,
    name: "Opa Kalle",
    lines: ["Als ich jung war, habe ich auch nach dem Schatz gesucht...", "Vor dem Oger an der Brücke hatten wir alle Angst."],
  },
];

export class Npcs {
  readonly group = new THREE.Group();
  readonly list: Npc[] = [];
  private shadows: THREE.Mesh[] = [];

  constructor(private hf: Heightfield, colliders: Colliders) {
    this.spawn("elder", "Dorfältester", createElder(), VILLAGE.elder, 0, [
      line("Dorfältester", "Ah, Tadeo! Schön, dass du uns besuchst."),
      line("Dorfältester", "Unser Dorf ist klein, aber unsere Herzen sind groß."),
    ]);
    this.spawn("wiseWoman", "Weise Frau", createWiseWoman(), VILLAGE.wiseWoman, 1.2, [
      line("Weise Frau", "Die Sterne erzählen von einem mutigen Jungen mit einer Schatzkarte..."),
      line("Weise Frau", "Ein gutes Gedächtnis ist wertvoller als Gold."),
    ]);
    this.spawn("wiseMan", "Weiser Mann", createWiseMan(), VILLAGE.wiseMan, -1.3, [
      line("Weiser Mann", "Hmm, hmm... Hast du schon einmal bis hundert gezählt?"),
      line("Weiser Mann", "Wer genau hinschaut, entdeckt die schönsten Dinge."),
    ]);
    VILLAGERS.forEach((v, i) => {
      const id = `villager${i}` as NpcId;
      this.spawn(id, v.name, createVillager(i), v.at, v.facing, v.lines.map((t) => ({ ...line(v.name, t), portrait: id })));
    });
    for (const npc of this.list) colliders.add(npc.position.x, npc.position.z, 0.45);
  }

  private spawn(id: NpcId, speaker: string, avatar: Humanoid, at: P2, facing: number, chatter: DialogueScript): void {
    const position = new THREE.Vector3(at[0], this.hf.heightAt(at[0], at[1]), at[1]);
    avatar.root.position.copy(position);
    avatar.root.rotation.y = facing;
    const shadow = blobShadow(0.5);
    shadow.position.set(position.x, position.y + 0.04, position.z);
    this.group.add(avatar.root, shadow);
    this.shadows.push(shadow);
    this.list.push({ id, speaker, avatar, position, homeFacing: facing, chatter, chatIndex: 0 });
  }

  get(id: NpcId): Npc {
    return this.list.find((n) => n.id === id)!;
  }

  /** Nearest NPC within `range` of a point, if any. */
  nearest(p: THREE.Vector3, range: number): Npc | null {
    let best: Npc | null = null;
    let bestD = range;
    for (const n of this.list) {
      const d = Math.hypot(n.position.x - p.x, n.position.z - p.z);
      if (d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  /** Next casual chat line for this NPC (cycles through their lines). */
  nextChat(npc: Npc): DialogueScript {
    const l = npc.chatter[npc.chatIndex % npc.chatter.length];
    npc.chatIndex++;
    return [l];
  }

  update(dt: number, player: THREE.Vector3): void {
    for (const n of this.list) {
      const d = Math.hypot(player.x - n.position.x, player.z - n.position.z);
      // Reason: people turn towards Tadeo when he is close, then drift back to their usual view
      const target = d < 5 ? Math.atan2(player.x - n.position.x, player.z - n.position.z) : n.homeFacing;
      let delta = target - n.avatar.root.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      n.avatar.root.rotation.y += delta * Math.min(dt * 4, 1);
      n.avatar.update(dt, { speed: 0, grounded: true, vy: 0 });
    }
  }
}
