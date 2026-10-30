# Story rethink — design

Status: written for approval (2026-10-30). Replaces "The story (new order)" and stage 2 of
`2026-10-26-island-expansion-design.md`. Its stage 3 (side quests, shop) stays a later project.

## Why

The current story is a chain of "and then". Tadeo goes to the volcano for no reason, the volcano gives nothing and
unblocks nothing, he names four items no tablet mentions, two islands are called Schatzinsel, the treasure helps
nobody, and the map the game is named after never appears.

The owner wants "a very coherent story in which there's a reason for why things are the way they are". Tadeo (7, the
real player) must also be able to follow it: the reasons exist for coherence, but what he hears has to be simple.

## Goals

1. Every quest has a reason to go there, and every object has a reason to be where it is.
2. All island trouble has one cause: the Feuerherz was stolen.
3. A 7-year-old can follow the game and retell it at the end.
4. The four items each have a clear job, said out loud before Tadeo needs them.
5. No lettered signs in the wild. The wild places are natural or ancient.

## Non-goals (next iteration)

Side quests (the turtle Frau Moos, the ruin's mysteries, the old stage 3 list), the shop and coin economy.
`classic-2d/` stays frozen.

## Anti-goals (a failure even if it works)

- **Explanation dumps.** Backstory told in long speeches, or words a 7-year-old doesn't know.
- **A softened volcano.** No hiccups, no gentle puffs. It is a proper volcano with lava and falling rocks.
- **The hammer on the shark.** The hammer is only for the chest's ice.
- **A game over.** Mistakes restart the attempt with a kind line, as everywhere else.
- **Anything unexplained** in the wild: an object with no owner or a task with no reason.
- **A broken challenge or a frame-rate drop** on the Mac.

## Constraints

- All `AGENTS.md` conventions: arrows + Space only, every speaker has a face and a voice, every spoken line is a
  recording, `Game.ts` stays under ~550 lines (it is at 533, so new flow goes into new modules in `game/`).
- World coordinates stay, except what this document moves.
- **Pushing to `main` publishes to tadeo.fun.** Build on a branch, and nothing reaches `main` until the owner has
  played it.
- Branch from `bbd0158` on `main`, which holds the Henni → Chuleta rename and the fringe fix. Those two commits are not
  pushed, and the owner decides when they ship.

## The background story (for us, never told in one go)

**The Alten.** Long ago an ancient people lived on the island. In a hollow at the foot of the volcano they found its
glowing heart, the Feuerherz. While it lies there the volcano sleeps, the island's monsters stay calm and magic things
grow. They built an altar around it and named a guardian, the Hüter. What they made to protect it:

- **Berries.** They carry a little of the heart's magic and soothe any monster on the island. The Hüter used them when
  one grew restless.
- **Thorn hedge and sword.** A magic hedge protects the Zauberwald and its berries. It only gives way to the light of
  one great crystal, deep in a natural cave. They cut a single blade from that crystal, which is why no other sword
  works. It rests in the crystal when not in use, in a chamber guarded by a test of the Alten.
- **Shrine and hammer.** The heart burns anyone who steals it and only warms someone bringing it home. To move it
  safely in an emergency you need eternal ice, found only on the snowy summit, and only one golden hammer breaks that
  ice. So they built an old path up the mountain (the stairs, ladders, rope bridge and flags that are there today) and
  a shrine on top for the hammer.

The Alten vanished, leaving the altar, shrine, riddle tablets, jungle ruin and a stone head with the Hüter's face. The
Hüter's ghost stayed, but a ghost has no hands: he can watch and speak, but touch nothing. His riddle tablets stand at
the lake, so only a clever visitor can wake him.

**The young pirate.** Much later, villagers settled on the island and built the bridge, docks, windmill, lighthouse and
beach huts. Then a young pirate called Paco landed, in love with everything that shines. He took the heart, and it
burned his hands. So he climbed to the shrine, broke off eternal ice and left the heavy hammer behind. He froze the
heart into his chest with all his loot, buried it on a small northern island and drew a map.

That same night the volcano began to wake, searching for its heart, and the monsters turned angry. The ogre under the
bridge grew mean, and a giant shark began circling the small island. It smashed Paco's ship and he washed ashore. He
was horrified but too ashamed to confess, so he left the chest key on the elder's doorstep at night, with a note: only
for someone clever. He stayed on as plain Käpt'n Paco.

**Sixty years later.** The volcano keeps getting worse. Paco is too old to fix it, and giving a villager the map would
mean admitting who he is. So he throws it into the sea in a bottle: for a treasure, somebody will come. He still climbs
up to look at the empty altar. Nobody on the island knows where the chest is, which is why a stranger with the map
matters.

## How Tadeo hears it

### Language rules

These apply to every new or changed line.

- At most 14 words per spoken line, one or two short sentences, one new fact per line.
- A conversation has at most 5 lines. Only quest 3, the lake and the festival may run longer, and those stay under 12.
- Say only what Tadeo needs right now. Everything else stays in the background above.
- Only words a 7-year-old knows. Don't say "die Alten", "Altar", "ewiges Eis" or "besänftigen". Say "das alte Volk",
  "der alte Stein", "Zaubereis" and "wieder lieb machen".
- The rhyme is the one place for slightly richer words, so Tadeo repeats it right away in plain words.
- When an item is found, Tadeo says once what it is for.
- Chuleta's hint for each quest gives the reason and the place in one sentence (`CHULETA_HINTS`).
- Pictures do part of the telling: the map card, the empty altar, the cave paintings, the four item slots on the HUD.

### What Tadeo can retell at the end

> Der Vulkan hat ein Herz. Ein Pirat hat es gestohlen. Darum wacht der Vulkan auf. Ich habe vier Sachen gefunden und
> das Herz zurückgebracht. Und der Pirat war Paco!

### The rhyme

> Das Schwert aus dem Fels zerschneidet den Dorn,
> die Beere im Wald nimmt den Monstern den Zorn.
> Der Hammer vom Berg zerschlägt das Eis,
> der Schlüssel vom Dorf für das Herz, so heiß.

Tadeo right after: "Also: Das Schwert für die Dornen. Die Beeren für die Monster. Der Hammer für das Eis. Der Schlüssel
für die Truhe!"

## The game, quest by quest

Twelve quests. The German lines are drafts that show the level: keep the facts and the simplicity, and adjust the
wording freely.

### 1. Ankunft

Why: a bottle with a map sends him sailing, the shark breaks his boat, someone calls for help.

- Opening, in place of today's narration: Tadeo finds the bottle on a beach near his home, the **map card** shows the
  small island and a big X. The map card has no text, and also appears in quests 3 and 11.
- A short cinematic at sea: his small boat, a fin, a hard hit, fade. The current washes them to today's landing beach.
- The boat lies wrecked on the sand; the pier no longer has a boat. Chuleta climbs out of the backpack (today's gag).
- A voice calls from the volcano. The sign quest is gone, so the first task is simply walking to the volcano gate.
  Quest 1 completes at the end of the intro.

> Erzähler: Eines Morgens findet Tadeo am Strand eine Flaschenpost.
> Erzähler: Darin ist eine alte Schatzkarte. Sie zeigt eine kleine Insel mit einem großen X.
> Tadeo: Ein Schatz! Den hole ich mir!
> Chuleta: Gack! Der Hai hat unser Boot kaputt gemacht!
> Stimme: Hilfe! Hilfe!
> Tadeo: Das kommt vom Vulkan! Schnell!

### 2. Der Vulkan

Why: someone is in trouble. The eruptions broke the old path, which is why he has to jump.

- Same course, a proper volcano. **About half as many rocks** as today: the dangerous-bomb interval in
  `volcano/director.ts` goes from 1.15→0.6 s to about 2.3→1.2 s.
- Of the three lava rivers, **one keeps its bridge and two get rock hops**: broken bridge ends, rocks to jump across
  with Space. Missing a jump is treated like a hit: "Autsch!" and back to the last checkpoint.
- The "ZIEL" arch with bunting and lanterns goes. At the finish stands the **ancient altar with an empty heart-shaped
  hollow**, and Paco with his foot under a fallen rock. Tadeo frees him by pressing Space a few times, like the digging
  in the treasure scene.
- Paco goes ahead to the village. He isn't in the village before this quest is done.

> Paco: Danke, Junge! Ich bin Käpt'n Paco.
> Tadeo: Was ist das für ein Stein?
> Paco: Ach, alter Kram.
> Tadeo: Mein Boot ist kaputt. — Paco: Das flicke ich dir. Komm ins Dorf!
> Paco: Nimm die Trittsteine. Auf der Brücke sitzt ein Oger.

### 3. Das Dorf

Why: Paco sent him. The ogre holds the bridge, so the stepping stones get a purpose.

- Tadeo walks to the village (about 25 seconds), talks to the elder at `VILLAGE.elder`, and no challenge follows. The
  map card appears. Fishing and hens work as today.

> Dorfältester: Du hast Paco gerettet. Danke, Tadeo!
> Dorfältester: Unser Vulkan hat ein Herz: das Feuerherz.
> Dorfältester: Solange es auf dem alten Stein liegt, schläft der Vulkan.
> Dorfältester: Aber ein Pirat hat es gestohlen. Jetzt wacht der Vulkan auf!
> Dorfältester: Und niemand weiß, wo das Herz ist.
> Tadeo: Moment! Ich habe eine Karte!
> Dorfältester: Das X! Dort muss es sein!
> Paco: Hm, hm.
> Dorfältester: Wie du hinkommst, weiß nur der Geist am See.

### 4. Der See

Why: only the ghost knows the way, and he only answers clever visitors.

- Each of the three tablets asks a riddle (speaker Steintafel). Tadeo picks one of three answers with the arrows and
  confirms with Space. A wrong answer gets a kind line and he tries again. A right one lights the tablet. They can be
  done in any order, as today.
- After the third, the Hüter's ghost rises out of the lake. He needs a figure with the stone head's face.

| Riddle | Answers (right one first) |
|---|---|
| Ich laufe immer mit dir mit, ich sage nie ein Wort. Und kommt die Nacht, dann bin ich fort. | Schatten / Chuleta / Wind |
| Mein Haus trag ich auf dem Rücken, ich muss mich nie danach bücken. | Schildkröte / Krabbe / Papagei |
| Ich bin ein Berg mit rotem Bauch, ich spucke Feuer, Stein und Rauch. | Vulkan / Drache / Kamin |

> Hüter: Ich bin der Hüter. Ich habe auf das Herz aufgepasst.
> Hüter: Aber ich bin ein Geist. Ich habe keine Hände.
> Hüter: Du hast Hände, Tadeo. Bring das Herz zurück!
> (the rhyme, then Tadeo's plain version)
> Hüter: Keine Angst vor dem Herz. Es verbrennt nur Diebe.
> Hüter: Und der Pirat... Er ist näher, als du denkst.
> Chuleta: Gack! Wie meint er das?

### 5. Die Höhle

Why: the rhyme. The rockfalls come from the volcano's shaking; the last door is the old people's test.

- A natural cave. Gone: `mine.ts` (rails, timber, cart, crates), levers, portcullis gates, rune trails, the stepped
  altar, carved pillars and rune circle. The cave mouth on the island becomes a natural opening. Tadeo keeps his torch.
- Same map and the same three stops as today:
  1. **First rockfall:** a hungry mole digs through it for one glowing mushroom.
  2. **Second rockfall:** for two more, found in the side alcoves.
  3. **The old test:** a smooth crystal wall. Cave paintings show a volcano, a snowy peak and a forest; Tadeo touches the
     red, white and green crystals in that order. A mistake dims them with a kind line. The wall then opens.
- The sword rests in the great crystal, under the shaft of daylight that is already in the chamber. More paintings
  along the way show the heart, the thorns and the hammer without words.

> Maulwurf: Ich habe Hunger! Bring mir einen Leuchtpilz, dann grabe ich dir den Weg frei.
> Tadeo: Die Bilder an der Wand! Erst der Vulkan, dann der Schneeberg, dann der Wald.
> Tadeo: Das Schwert! Es leuchtet blau. Damit komme ich durch die Dornen!

### 6. Der Zauberwald

Why: the rhyme, and now he has the one thing that opens the hedge.

- A big thorn hedge closes the forest gate on the island until Tadeo has the sword. Its "Zauberwald" lettering goes.
  With the sword, a short scene: blue light, the hedge shrinks back and stays open.
- The forest challenge plays as today.

> Flocke: Das Schwert vom Hüter! Nur vor seinem Licht haben die Dornen Angst.
> Flocke: Die Büsche hier drin sind nur wilde Dornen. Lauf einfach drumherum.
> Tadeo: Zauberbeeren! Die machen böse Monster wieder lieb.

### 7. Das Dorf again

Why: the rhyme names the key. Nobody knew what the old key was for until now.

- Quest name "Das Dorf", replacing "Das Eingeborenendorf". The drum trials and maths question play as today, with their
  reason from the note.
- The elder sends him on: the hammer is on the mountain, and a boulder blocks the trail.

> Dorfältester: Der alte Schlüssel? Der lag eines Morgens vor meiner Tür.
> Dorfältester: Mit einem Zettel: Nur für jemanden, der klug ist. Darum gibt es die Prüfungen.
> Dorfältester: Du hast ihn dir verdient! Jetzt fehlt noch der Hammer. Er liegt oben auf dem Berg.
> Dorfältester: Aber ein Riesenfels versperrt den Weg. Nur der Oger ist stark genug.
> Chuleta: Ein Monster? Gack! Die Beeren!

### 8. Der Oger

Why: Tadeo needs his strength. The ogre is angry because the heart is gone.

- The fight plays as today. He won't take a berry while raging, so Tadeo holds him off with the sword first. The
  "Oger-Brücke" and "Zoll" boards go.
- **The start moves to the east end of the bridge**, because Tadeo now comes from the village (`GATES`, today at
  [38, 0] on the west side).
- Back on the island: **a boulder blocks the mountain trail** between the junction [54, 2] and the mountain gate
  [55.5, -13.5], and must not be walkable around. It is there from the start of the game. The ogre lifts it away in a
  short scene.

> Tadeo: Ich brauche deine Hilfe!
> Oger: HA! Erst musst du an mir vorbei!
> Oger: Mmmh! Die schmeckt ja wie Kuchen!
> Oger: Oh... Ich war gar nicht immer so böse.
> Oger: Der Fels? Den hebe ich dir mit einer Hand!

### 9. Der Berg

Why: the trail is open and the hammer lies there. The climb is the old people's path.

- The challenge plays as built, including the shrine and the rolling rocks. Text changes only.

> Chuleta: Ein alter Schrein! Den hat das alte Volk gebaut.
> Tadeo: Der goldene Hammer! Hier oben ist Schnee. Er ist für das Eis!
> Chuleta: Schau! Die kleine Insel! Und da ist die Flosse...

### 10. Der Hai

Why: the only way to the X. The boat is Tadeo's own, mended.

- On the island: the north dock has **no boat until this quest**. Then Tadeo's mended, patched boat is there, with Paco
  and the ogre beside it. The wreck leaves the beach. The ogre moves from his spot by the bridge to the dock.
- The sail keeps its course. The golden trail is now glowing starfish, and Paco explains them.
- **The fight keeps its timing and changes what it means:** the shark leaps with its mouth open, and Space in the green
  window throws berries in. Three throws and it calms and swims away, happy instead of dizzy. This touches
  `sea/sharkFight.ts`, `boat.ts` (berries in hand instead of the hammer), `seaUI.ts` (berry slots) and the shark's
  lines.
- Jonas's chat explains why nobody simply lends a boat: "Mit meinem kleinen Boot bleibe ich am Ufer. Wegen dem Hai."

> Paco: Dein Boot ist geflickt! Der Oger hat es hergetragen.
> Paco: Folge den leuchtenden Seesternen. Da ist das Wasser sicher.
> Chuleta: Der Hai ist auch ein Monster! Gack! Die Beeren!
> Tadeo: Hier, Hai! Mach den Mund auf!

### 11. Die Schatzinsel

Why: the X on the map. Chains straight from quest 10, as today.

- Dig, hammer and key play as today. The chest now also holds **the Feuerherz** (a new glowing model), a rolled-up plan
  and a note. Gold, jewels and the crown flight stay.
- The party and end card move to the festival. The scene ends with the volcano erupting on the horizon.

> Tadeo: Eine Truhe! Aber sie steckt in Eis.
> Chuleta: Das ist Zaubereis! Das schmilzt nie. Nur der Hammer schafft es!
> Tadeo: Ein Zettel. "Es tut mir leid. P."
> Chuleta: P? Wie Pirat?
> Tadeo: Das Herz! Ich habe ein bisschen Angst... Oh. Es ist ganz warm!
> Erzähler: Da! Der Vulkan spuckt Feuer! Schnell zurück!

### 12. Das Herz des Vulkans

Why: the eruption is real now, and the heart has to go home.

- **A direct cut, with no walk:** one narrator line over a fade ("Tadeo segelt zurück, so schnell er kann.") goes from
  the small island straight into the course, the way quest 10 chains into 11. There is no empty walk at the climax, so
  the island needs no full-eruption state.
- If a save is resumed during this quest (Continue always loads onto the island), Tadeo stands at the volcano gate with
  the strongest rumble. Side games are not locked.
- The volcano course again, in its hardest form: **today's full rock rate**, the same rock hops, a darker or redder sky.
  Tadeo carries the heart. Hits work as in quest 2.
- At the altar he sets the heart in the hollow: light, the rocks stop, the lava dims, a rainbow appears. The ghost
  thanks him and fades.
- **Festival at night**, reusing the village campfire stage with its crowd, plus the treasure scene's fireworks and
  confetti. Present: everyone, including the ogre and Flocke. Paco confesses, and then comes the end card.

> Hüter: Danke, Tadeo. Jetzt kann ich endlich ruhen.
> Paco: Ich muss euch etwas sagen. Der Pirat... das war ich.
> Paco: Ich war jung und dumm. Es tut mir leid.
> Paco: Und die Flaschenpost war auch von mir.
> Tadeo: P wie Paco!
> Dorfältester: Du hast uns Tadeo geschickt. Das hast du gut gemacht.
> Tadeo: Das Gold ist für das Dorf! Und was ist das? Ein Plan... für eine Rakete!
> Chuleta: Gack! Ein goldenes Ei!

End card: "Du hast die Insel gerettet!", the coin count and a rocket teaser. Tadeo keeps the crown and sails home in his
mended boat.

## World changes

**Volcano rumbles.** After each finished quest the island shakes and the volcano smokes, a little stronger each time.
Quest 12 is the only full eruption.

**Lettered signs go, everywhere outside the village:**

| Where | What |
|---|---|
| `world/models/coastSites.ts:113, 142` | Beach signpost, "Zur Schatzinsel" at the north dock |
| `world/models/eastSites.ts:81, 194` | Trailhead signpost, junction signposts |
| `world/models/regionSites.ts:171` | "Froschkönig" |
| `world/models/monuments.ts:195, 311` | "Höhle", "Zauberwald" |
| `world/models/westSites.ts:49, 121` | "!" warning triangles, "Achtung Lava!" |
| `challenges/volcano/set.ts:62, 140` | "ZIEL", its board signs |
| `challenges/ogre/gorgeDressing.ts:183-184` | "Oger-Brücke", "Zoll: 1 Kuchen!" |
| `challenges/sea/scenery.ts:124` | "Zur Schatzinsel" |

The golden star, compass and Chuleta's hints do the guiding. **These stay:** "Willkommen" and "Markt" in the village,
Mia's coop, boat names.

**Landmarks stay:** lighthouse, windmill, beehives and beach huts (villagers); tablets, altar, shrine, jungle ruin and
stone head (the Alten). Mountain and volcano paths count as the Alten's. The boardwalk stays too.

**Names.** "Schatzinsel" means only the small island. The big one is simply "die Insel". "Opa Kalle" becomes
**Käpt'n Paco**.

**Cast changes** (`SPEAKERS` in `ui/Dialogue.ts`, `CAST` in `scripts/voice/generate.mjs`):

| Speaker | Change |
|---|---|
| Käpt'n Paco | Replaces Opa Kalle, with a new look (old sailor, beard, captain's hat) and his own voice, because he shares scenes with the elder, whose voice Kalle used today. Keep his line "Als ich jung war, habe ich auch nach dem Schatz gesucht..." as a clue. |
| Stimme | The voice from the volcano, using Paco's voice |
| Maulwurf | New model, portrait and voice |
| Hüter | Replaces Geist. Same voice, a real portrait. |
| Schild | Removed |
| Oger, Flocke and the rest | Unchanged |

**State.** `QUESTS`, `GATES`, `CHULETA_HINTS` and `CHULETA_CHEERS` are renumbered to twelve. `Sightings`: `OGRE_QUEST`
becomes 8, `SEA_QUEST` becomes 10. HUD order stays sword, berry, key, hammer, which is already the order they're found
in. `SAVE_VERSION` goes from 3 to 4, so old saves start over. Mia's invitation says the rumbling scared her hens.

## Proof

Each stage ends with E2E proof in `scripts/e2e/out/<name>/`.

- Updated: `island.mjs` (intro, quests 1–4, map card, riddles, no sign quest), `volcano.mjs` (rock hops, freeing Paco),
  `cave.mjs` (mole, crystals), `forest.mjs` (hedge), `village.mjs`, `ogre.mjs` (east start, boulder), `mountain.mjs`,
  `sea.mjs` (berries, no hammer), `treasure.mjs` (heart, note), `voices.mjs`, `world.mjs` (boulder, no signs).
- New: `finale.mjs` (quest 12 through the festival to the end card).
- `npx tsc --noEmit -p .` clean, fps as before, `npm run voices -- --dry-run` reports nothing missing.
- A one-off check that lists any new or changed story line above 14 words.
- **Final check, by the owner:** Tadeo plays it and can retell the story roughly as in the retelling above.

## Calls I made (to check while reading)

- Paco's name; the words "Feuerherz", "Hüter" and "Zaubereis".
- Paco is the pirate and sent the bottle, and the note is signed "P."
- A beach near Tadeo's home as where he finds the bottle.
- Paco goes ahead to the village instead of walking with Tadeo, because a following NPC adds work and little story.
- Half the rocks in quest 2, today's rate in quest 12; two of three bridges become hops.
- The ogre's joke sign "Zoll: 1 Kuchen!" goes with the other signs, and the "!" triangles too, so the rule stays simple.
- The boardwalk stays, since the correction was that only lettered signs go.
- The big island gets no name of its own.
- The festival reuses the village stage rather than a new scene.
- Quest 12 starts with a direct cut from the small island, not a walk from the north dock.
- The first quest is a cutscene, so the HUD's first real task reads "2 von 12".

## Left to the builder

Exact camera work and cinematic length, model and portrait design (mole, ghost, heart, wreck, patched boat, boulder,
hedge, paintings), how the map card is drawn, riddle UI (reusing the village maths question's choice UI if it fits),
hop-rock placement and size (generous for a 7-year-old), starfish look, exact wording within the language rules, which
ElevenLabs voices (let the owner hear Paco's and the mole's), how the volcano's two modes are wired, and the order of
the work.
