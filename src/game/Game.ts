/**
 * Game — the adventure flow on the island: title screen, intro flight, quest
 * objectives (beacon, compass arrow, "Leertaste" prompts), conversations,
 * launching the challenge scenes, handing out rewards and saving progress.
 */

import * as THREE from "three";
import { Engine } from "../core/Engine";
import { Shot } from "../core/CameraRig";
import { IslandScene } from "../scenes/IslandScene";
import { GameUI } from "../ui/GameUI";
import { Bubble } from "../ui/Hud";
import { Beacon } from "./Beacon";
import { Npcs, Npc } from "./Npcs";
import { Title } from "./Title";
import { Henni } from "../characters/Henni";
import { HENNI_INTRO, HENNI_HINTS, HENNI_CHEERS } from "./henniLines";
import { Coins, COIN_COUNT } from "./Coins";
import { Wardrobe } from "./Wardrobe";
import { SIDE_GAMES, SideGame } from "./sideGames";
import { Sightings } from "./Sightings";
import { showEndCard } from "../ui/EndCard";
import { QuestManager } from "../systems/QuestManager";
import { InventoryManager } from "../systems/InventoryManager";
import { SaveManager } from "../systems/SaveManager";
import { NarrationManager } from "../systems/NarrationManager";
import { QUESTS } from "../data/quests";
import { DialogueScript } from "../data/dialogues";
import { LANDMARKS, VILLAGE, P2 } from "../world/layout";
import { loadChallenge } from "../challenges/registry";
import { ChallengeName } from "../challenges/types";
import { audio } from "../audio/Audio";
import { ItemKey } from "../world/models/items";

interface Objective {
  at: P2;
  radius: number;
  verb: string;
  run(): Promise<void>;
}

/**
 * Where each challenge starts on the island, by milestone. `back` = where Tadeo stands afterwards.
 * Cave and mountain use the walkable spots in front of the built entrances (the layout points sit on
 * the cliff face and in the river).
 */
const GATES: Record<number, { at: P2; challenge: ChallengeName; back?: P2 }> = {
  2: { at: LANDMARKS.volcanoGate, challenge: "volcano" },
  4: { at: [-60, -18.5], challenge: "cave" },
  5: { at: LANDMARKS.forestGate, challenge: "forest" },
  6: { at: [38, 0], challenge: "ogre", back: [53.5, 0.5] },
  7: { at: VILLAGE.elder, challenge: "village" },
  8: { at: [55.5, -13.5], challenge: "mountain" },
  9: { at: LANDMARKS.northDockEnd, challenge: "sea" },
  10: { at: LANDMARKS.northDockEnd, challenge: "treasure" },
};

/** Signpost next to the landing beach (quest 1), placed by src/world/models/coastSites.ts. */
const SIGN: P2 = [-62.6, 43.6];

const SIGN_TEXT: DialogueScript = [
  {
    speaker: "Schild",
    portrait: "",
    text: "Willkommen auf der Schatzinsel! Im Westen raucht der Vulkan, in der Mitte glitzert der See, und im Osten liegt das Dorf.",
  },
  { speaker: "Tadeo", portrait: "", text: "Der Vulkan ist ganz nah. Da gehe ich zuerst hin!" },
];

const TABLET_DIALOGUES = ["lake_tablet1", "lake_tablet2", "lake_tablet3"];
const TALK_RANGE = 2.8;
/** Seconds without progress before Henni offers a hint. */
const HINT_AFTER = 45;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export class Game {
  private ui = new GameUI();
  private island = new IslandScene();
  private beacon = new Beacon();
  private npcs: Npcs;
  private bubble: Bubble;
  private henni: Henni;
  private henniBubble: Bubble;
  private hintTimer = 0;
  private coins: Coins;
  private wardrobe: Wardrobe;
  private sightings: Sightings;
  private quest = QuestManager.getInstance();
  /** True while a cutscene, conversation or challenge owns the controls. */
  private busy = true;
  private title: Title | null = null;
  private cinematic: ((t: number) => Shot) | null = null;
  private cinematicTime = 0;
  private tabletsRead = new Set<number>();
  private remarkCooldown = 0;
  private tmp = new THREE.Vector3();

  constructor(private engine: Engine) {
    this.npcs = new Npcs(this.island.island.hf, this.island.island.colliders);
    this.henni = new Henni(this.island.player);
    this.henni.snap();
    this.island.scene.add(this.npcs.group, this.beacon.group, this.henni.root);
    this.bubble = new Bubble(this.ui.layer);
    this.henniBubble = new Bubble(this.ui.layer);
    // Reason: coins come after the NPCs so none lands inside a villager
    this.coins = new Coins(this.island.island.hf, this.island.island.colliders);
    this.island.scene.add(this.coins.group);
    this.wardrobe = new Wardrobe(this.island.player.avatar, this.henni, this.ui, (t) => this.henniSay(t));
    this.wardrobe.dress(this.coins.collected);
    const { landmarks, hf, colliders } = this.island.island;
    this.sightings = new Sightings((x, z) => landmarks.surfaceHeight(x, z) ?? hf.heightAt(x, z), colliders, this.ui.layer);
    this.island.scene.add(this.sightings.group);
    engine.onFrame = (dt, time) => this.frame(dt, time);
  }

  async start(): Promise<void> {
    NarrationManager.getInstance().init();
    const params = new URLSearchParams(location.search);
    if (params.has("coins")) {
      this.coins.setCollected(Number(params.get("coins")));
      this.wardrobe.dress(this.coins.collected);
    }
    // Reason: debug camera views are for screenshots of the world — no UI, no flow
    if (params.has("cam") || params.has("closeup")) {
      this.ui.hud.setVisible(false);
      await this.engine.setScene(this.island, 0);
      return;
    }
    const challenge = params.get("challenge") as ChallengeName | null;
    const milestone = Number(params.get("quest") ?? 0);
    const side = SIDE_GAMES.find((s) => s.challenge === challenge);
    if (side) {
      this.setupMilestone(milestone || 1);
      await this.playSideGame(side);
      this.busy = false;
      return;
    }
    if (challenge) {
      const m = Number(Object.keys(GATES).find((k) => GATES[Number(k)].challenge === challenge) ?? 1);
      this.setupMilestone(m);
      await this.playChallenge(m);
      return;
    }
    if (milestone || params.has("notitle")) {
      this.setupMilestone(milestone || 1);
      await this.engine.setScene(this.island, 300);
      this.islandAudio();
      this.busy = false;
      return;
    }
    await this.titleScreen();
  }

  // ── Per-frame ─────────────────────────────────────────────

  private frame(dt: number, time: number): void {
    const input = this.engine.input;
    // Reason: UI first so Space advances a dialogue instead of making Tadeo jump
    this.ui.update(dt, input);
    this.title?.update(input);
    if (this.engine.scene !== this.island) return;

    const player = this.island.player;
    this.npcs.update(dt, player.position);
    this.sightings.update(dt, player.position, this.quest.currentMilestone, (v) => {
      const s = this.project(v.x, v.y, v.z);
      return s.behind ? null : this.pixels(s);
    });
    if (this.cinematic) {
      this.cinematicTime += dt;
      this.island.rig.jumpToShot(this.cinematic(this.cinematicTime));
    }

    const free = !this.busy && !this.ui.dialogue.isOpen && !this.engine.isSwitching;
    player.controlsEnabled = free;
    const objectives = free ? this.objectives() : [];
    const main = this.mainObjective(objectives);

    // Beacon + compass towards the current goal
    if (main) this.tmp.set(main.at[0], this.groundAt(main.at), main.at[1]);
    this.beacon.set(main ? this.tmp : null);
    this.beacon.update(dt, time, main ? this.distance(main.at) : 99, this.island.camera);
    this.ui.hud.updateCompass(main ? this.project(this.tmp.x, this.tmp.y, this.tmp.z) : null);

    // Interaction prompt: quest objectives first, then casual chats
    const near = objectives.find((o) => this.distance(o.at) < o.radius);
    const npc = !near && free ? this.npcs.nearest(player.position, TALK_RANGE) : null;
    if (near) {
      this.showPrompt(near.at, near.verb);
      if (input.consume("Space")) void this.run(() => near.run());
    } else if (npc) {
      const side = SIDE_GAMES.find((s) => s.host === npc.id);
      this.showPrompt([npc.position.x, npc.position.z], side?.verb ?? "Sprechen");
      if (input.consume("Space")) void this.run(() => (side ? this.playSideGame(side, npc) : this.talk(this.npcs.nextChat(npc), npc)));
    } else {
      this.ui.prompt.show(null);
    }

    this.remarkCooldown -= dt;
    if (free) this.remarkAtFutureGates();
    const head = this.project(player.position.x, player.position.y + 2.3, player.position.z);
    this.bubble.place(head.behind ? null : this.pixels(head));

    if (this.coins.update(dt, time, player.position)) this.wardrobe.onCoins(this.coins.collected);

    // Henni comes along; she offers a hint when nothing has happened for a while
    this.henni.update(dt);
    this.henni.talking = this.henniBubble.speaking;
    const hp = this.henni.position;
    const beak = this.project(hp.x, hp.y + 0.75, hp.z);
    this.henniBubble.place(beak.behind ? null : this.pixels(beak));
    this.hintTimer = free ? this.hintTimer + dt : 0;
    if (this.hintTimer > HINT_AFTER && HENNI_HINTS[this.quest.currentMilestone]) {
      this.henniSay(HENNI_HINTS[this.quest.currentMilestone]);
      this.hintTimer = -HINT_AFTER;
    }

    if (free) {
      const inVillage = this.distance(VILLAGE.plaza) < 24;
      audio.playMusic(inVillage ? "music_village" : "music_overworld");
    }
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy = true;
    this.ui.prompt.show(null);
    try {
      await action();
    } finally {
      this.busy = false;
    }
  }

  // ── Quest objectives ──────────────────────────────────────

  private objectives(): Objective[] {
    const m = this.quest.currentMilestone;
    if (m === 1) return [{ at: SIGN, radius: 3, verb: "Lesen", run: () => this.readSign() }];
    if (m === 3) {
      return LANDMARKS.tablets
        .map((at, i) => ({ at, i }))
        .filter(({ i }) => !this.tabletsRead.has(i))
        .map(({ at, i }) => ({ at, radius: 3.2, verb: "Lesen", run: () => this.readTablet(i) }));
    }
    const gate = GATES[m];
    if (!gate) return [];
    if (m === 7) return [{ at: gate.at, radius: TALK_RANGE, verb: "Sprechen", run: () => this.villageElder() }];
    return [{ at: gate.at, radius: 3.5, verb: "Los geht's!", run: () => this.playChallenge(m) }];
  }

  /** The goal the beacon marks: the nearest open objective. */
  private mainObjective(list: Objective[]): Objective | null {
    let best: Objective | null = null;
    for (const o of list) if (!best || this.distance(o.at) < this.distance(best.at)) best = o;
    return best;
  }

  private async readSign(): Promise<void> {
    await this.talk(SIGN_TEXT);
    await this.advance();
  }

  private async readTablet(i: number): Promise<void> {
    await this.talk(TABLET_DIALOGUES[this.tabletsRead.size]);
    this.tabletsRead.add(i);
    if (this.tabletsRead.size < 3) return;
    await this.talk("lake_complete");
    await this.advance();
  }

  private async villageElder(): Promise<void> {
    await this.talk("village_enter", this.npcs.get("elder"));
    await this.playChallenge(7);
  }

  /** Short remark when Tadeo wanders to a place whose quest comes later. */
  private remarkAtFutureGates(): void {
    if (this.remarkCooldown > 0) return;
    const m = this.quest.currentMilestone;
    const later: P2[] = [];
    for (const [k, g] of Object.entries(GATES)) if (Number(k) > m && Number(k) !== 10) later.push(g.at);
    if (m < 3) later.push(...LANDMARKS.tablets);
    if (later.some((at) => this.distance(at) < 4.5)) {
      const text = `Hier komme ich später wieder hin. Zuerst: ${this.quest.currentQuest.name}!`;
      this.bubble.say(text, 3800);
      NarrationManager.getInstance().speakLine(text, "Tadeo");
      this.remarkCooldown = 12;
    }
  }

  // ── Flow ──────────────────────────────────────────────────

  private async titleScreen(): Promise<void> {
    this.ui.hud.setVisible(false);
    this.startCinematic((t) => {
      const a = 0.9 + t * 0.045;
      return {
        pos: new THREE.Vector3(18 + Math.cos(a) * 205, 88 + Math.sin(t * 0.2) * 6, 28 + Math.sin(a) * 165),
        look: new THREE.Vector3(18, 4, 28),
      };
    });
    await this.engine.setScene(this.island, 1400);
    audio.playMusic("music_title");
    audio.setAmbience(true);
    const save = SaveManager.getInstance();
    this.title = new Title(this.ui.layer, save.hasSave());
    const choice = await this.title.choose();
    this.title = null;
    await this.engine.fade(1, 700);

    const data = choice === "continue" ? save.load() : null;
    if (data) {
      this.placePlayer(data.playerX, data.playerY);
      this.endCinematic(0.01);
      this.ui.hud.refresh();
      this.ui.hud.setVisible(true);
      this.islandAudio();
      await this.engine.fade(0, 800);
      void this.ui.hud.showBanner("Willkommen zurück!", this.quest.currentQuest.name);
      this.busy = false;
      return;
    }
    save.fullReset();
    this.coins.reset();
    this.wardrobe.reset();
    this.wardrobe.dress(0);
    this.tabletsRead.clear();
    this.ui.hud.refresh();
    await this.intro();
  }

  /** Flight from the open sea down to Tadeo on the landing beach, then the intro talk. */
  private async intro(): Promise<void> {
    const p = this.island.player;
    this.placePlayer(LANDMARKS.spawn[0], LANDMARKS.spawn[1], 0);
    const from: Shot = { pos: new THREE.Vector3(-150, 34, 135), look: new THREE.Vector3(-74, 4, 56) };
    const to: Shot = {
      pos: p.position.clone().add(new THREE.Vector3(1.5, 4.5, 8.5)),
      look: p.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
    };
    this.startCinematic((t) => {
      const k = ease(Math.min(t / 9, 1));
      return { pos: from.pos.clone().lerp(to.pos, k), look: from.look.clone().lerp(to.look, k) };
    });
    this.islandAudio();
    await this.engine.fade(0, 1200);
    await wait(3600);
    await this.ui.hud.showBanner("Kapitel 1", QUESTS[0].name, 3200);
    await wait(2400);
    this.endCinematic(1.8);
    await this.talk("intro");
    await this.talk(HENNI_INTRO);
    this.ui.hud.setVisible(true);
    this.busy = false;
  }

  /** Fade into a challenge scene, wait for the win, then reward and return to the island. */
  private async playChallenge(milestone: number): Promise<void> {
    const gate = GATES[milestone];
    await this.enterChallenge(gate.challenge);

    const reward = QUESTS[milestone - 1].reward as ItemKey | null;
    if (reward) InventoryManager.getInstance().addItem(reward);
    if (milestone === 10) return this.ending();
    if (milestone === 9) {
      // Reason: the boat trip ends on the treasure island, so the finale follows straight away
      this.quest.completeMilestone();
      this.saveAt(LANDMARKS.northDockEnd);
      return this.playChallenge(10);
    }

    const back = gate.back ?? gate.at;
    await this.backToIsland([back[0], back[1] + (gate.back ? 0 : 2.5)]);
    if (reward) this.ui.hud.popItem(reward);
    await this.advance();
  }

  /** A villager's side game: invitation, the game itself, then the prize hat on the first win. */
  private async playSideGame(side: SideGame, npc?: Npc): Promise<void> {
    const won = this.wardrobe.hasPrize(side.prize);
    if (npc) await this.talk(won ? side.again : side.invite, npc);
    await this.enterChallenge(side.challenge);
    const host = this.npcs.get(side.host).position;
    await this.backToIsland(side.back, Math.atan2(host.x - side.back[0], host.z - side.back[1]));
    await this.wardrobe.givePrize(side.prize, side.prizeName, side.cheer, this.coins.collected);
  }

  /** Fade into a challenge scene and wait until the player wins it. */
  private async enterChallenge(name: ChallengeName): Promise<void> {
    const factory = await loadChallenge(name);
    this.ui.hud.setVisible(false);
    this.ui.prompt.show(null);
    this.ui.hud.updateCompass(null);
    this.bubble.place(null);
    audio.setAmbience(false);
    const challenge = factory({ engine: this.engine, ui: this.ui });
    await this.engine.setScene(challenge, 700);
    await challenge.finished;
    this.ui.status(null);
  }

  private async backToIsland(at: P2, facing?: number): Promise<void> {
    this.placePlayer(at[0], at[1], facing);
    this.endCinematic(0.01);
    await this.engine.setScene(this.island, 700);
    this.islandAudio();
    this.ui.hud.setVisible(true);
  }

  /** Complete the current milestone, save and announce the next quest. */
  private async advance(): Promise<void> {
    const finished = this.quest.currentMilestone;
    this.quest.completeMilestone();
    const p = this.island.player.position;
    this.saveAt([p.x, p.z]);
    this.ui.hud.refresh();
    this.hintTimer = 0;
    audio.playSfx("sfx_victory_fanfare", 0.6);
    await this.ui.hud.showBanner(`Neue Aufgabe · ${this.quest.currentMilestone} von ${QUESTS.length}`, this.quest.currentQuest.name);
    if (HENNI_CHEERS[finished]) this.henniSay(HENNI_CHEERS[finished]);
  }

  private henniSay(text: string): void {
    this.henniBubble.say(text, 4800);
    NarrationManager.getInstance().speakLine(text, "Henni");
  }

  private async ending(): Promise<void> {
    SaveManager.getInstance().deleteSave();
    await showEndCard(this.ui.layer, this.engine.input, `${this.coins.collected} / ${COIN_COUNT}`);
    this.coins.reset();
    location.reload();
  }

  // ── Helpers ───────────────────────────────────────────────

  /** Play a conversation; with an NPC the camera frames both of them. */
  private async talk(script: string | DialogueScript, npc?: Npc): Promise<void> {
    const rig = this.island.rig;
    const p = this.island.player;
    if (npc) {
      p.facing = Math.atan2(npc.position.x - p.position.x, npc.position.z - p.position.z);
      const mid = p.position.clone().lerp(npc.position, 0.5);
      const dir = npc.position.clone().sub(p.position).setY(0).normalize();
      const side = new THREE.Vector3(dir.z, 0, -dir.x);
      if (side.z < 0) side.negate();
      rig.setShot({ pos: mid.clone().addScaledVector(side, 5.6).add(new THREE.Vector3(0, 2.4, 0)), look: mid.add(new THREE.Vector3(0, 1.1, 0)) }, 0.9);
    }
    rig.setZoom(0.62);
    this.ui.dialogue.onLine = (speaker) => {
      p.avatar.pose = speaker === "Tadeo" ? "talk" : "normal";
      if (npc) npc.avatar.pose = speaker === npc.speaker ? "talk" : "normal";
    };
    await this.ui.say(script);
    this.ui.dialogue.onLine = null;
    p.avatar.pose = "normal";
    if (npc) {
      npc.avatar.pose = "normal";
      rig.setShot(null, 0.9);
    }
    rig.setZoom(1);
  }

  /** Set quest state as if milestones 1..m-1 were done (debug starts) and place Tadeo near the goal. */
  private setupMilestone(m: number): void {
    this.quest.setMilestone(m);
    const items = QUESTS.slice(0, m - 1).map((q) => q.reward).filter((r): r is string => !!r);
    InventoryManager.getInstance().setItems(items);
    this.ui.hud.refresh();
    this.ui.hud.setVisible(true);
    const goal = m === 1 ? LANDMARKS.spawn : (this.objectives()[0]?.at ?? LANDMARKS.spawn);
    const hf = this.island.island.hf;
    const spot = [[0, 5], [5, 0], [-5, 0], [0, -5]].map(([dx, dz]) => [goal[0] + dx, goal[1] + dz]).find(([x, z]) => hf.isWalkable(x, z));
    const [x, z] = spot ?? LANDMARKS.spawn;
    this.placePlayer(x, z);
  }

  /** Teleport Tadeo and bring the camera and Henni along. */
  private placePlayer(x: number, z: number, facing?: number): void {
    const p = this.island.player;
    p.teleport(x, z, facing);
    p.avatar.root.updateMatrixWorld(true);
    this.island.rig.follow(p.position, p.velocity);
    this.island.rig.snap();
    this.henni.snap();
  }

  private islandAudio(): void {
    audio.playMusic("music_overworld");
    audio.setAmbience(true);
  }

  private saveAt(at: P2): void {
    SaveManager.getInstance().save(at[0], at[1]);
  }

  private startCinematic(fn: (t: number) => Shot): void {
    this.cinematic = fn;
    this.cinematicTime = 0;
    this.island.rig.jumpToShot(fn(0));
  }

  /** Hand the camera back to the follow rig with a smooth blend. */
  private endCinematic(seconds: number): void {
    this.cinematic = null;
    this.island.rig.setShot(null, seconds);
  }

  private showPrompt(at: P2, verb: string): void {
    const s = this.project(at[0], this.groundAt(at) + 2.6, at[1]);
    this.ui.prompt.show(s.behind ? null : this.pixels(s), verb);
  }

  private groundAt(at: P2): number {
    return Math.max(this.island.island.hf.heightAt(at[0], at[1]), 0);
  }

  private distance(at: P2): number {
    const p = this.island.player.position;
    return Math.hypot(p.x - at[0], p.z - at[1]);
  }

  private project(x: number, y: number, z: number): { x: number; y: number; behind: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.island.camera);
    return { x: v.x, y: v.y, behind: v.z > 1 };
  }

  private pixels(s: { x: number; y: number }): { x: number; y: number } {
    return { x: (s.x * 0.5 + 0.5) * window.innerWidth, y: (-s.y * 0.5 + 0.5) * window.innerHeight };
  }
}
