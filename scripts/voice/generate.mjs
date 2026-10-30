/**
 * Renders every spoken line once with ElevenLabs and saves it to public/voices/,
 * together with manifest.json ("speaker|text" → file) that the game reads.
 * Only new or changed lines cost credits; recordings nobody uses are deleted.
 *
 * Needs ELEVENLABS_API_KEY in .env (a paid plan, because free plans cannot use library voices).
 *
 *   npm run voices              render what is missing
 *   npm run voices -- --dry-run show what would be rendered, spend nothing
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { collectLines } from "./lines.mjs";

const OUT = new URL("../../public/voices/", import.meta.url).pathname;
const FORMAT = "mp3_44100_96";

const V4 = "eleven_v4";
const V2 = "eleven_multilingual_v2";

/** Who speaks with which ElevenLabs library voice and model. */
const NARRATOR = { voice: "yYTemNXovAWXGGqLADJf", model: V4 }; // Finn Fable
const ELDER = { voice: "YyYOpSknZlewhHezK5bv", model: V4 }; // Oswald
const PACO = { voice: "pfvZahoGcT3NdpxRuNkg", model: V4 }; // Bruno, der Bär
const CAST = {
  Erzähler: NARRATOR,
  Steintafel: NARRATOR,
  Tadeo: { voice: "Ewvy14akxdhONg4fmNry", model: V4 }, // Finnegan
  Chuleta: { voice: "zndmYEEoWWxRYyEL2ZZY", model: V4 }, // Lumi
  Oger: { voice: "XQSEqtl2af3AAUCwmX7b", model: V2 }, // Gorak
  Dorfältester: ELDER,
  "Käpt'n Paco": PACO,
  Stimme: PACO,
  Maulwurf: { voice: "2HDQZbLZn0MJCgru92h7", model: V4 }, // Knurps
  "Kleine Mia": { voice: "QNDh5mDABxDpT3PEzjST", model: V4 }, // Emmy
  Fuchs: { voice: "1TdRi8sZB0xAhMlS3uBQ", model: V4 }, // Skylo
  "Weise Frau": { voice: "yL6cMfg79EwETG98xIR2", model: V4 }, // Laura Mondschein
  "Weiser Mann": { voice: "2baru8J0e15nxuG3bzXy", model: V4 }, // Cornelius
  "Bäckerin Lina": { voice: "1iF3vHdwHKuVKSPDK23Z", model: V4 }, // Louisa
  "Fischer Jonas": { voice: "Cx9eG8CNCDtCPeLiemtm", model: V4 }, // Holger
  Hüter: { voice: "XSqtBhCcfQ9Pn4yLIHsk", model: V4 }, // Fritz
};

/** The text as the voices read it: Chuleta is a Spanish name, and a German voice only says its "ch" right as "tsch". */
const forVoice = (text) => text.replaceAll("Chuleta", "Tschuleta");

/** File name of a recording; it changes with the voice, model or text, so changed lines are rendered again. */
const fileName = ({ voice, model }, text) =>
  `${createHash("sha1").update(JSON.stringify([voice, model, FORMAT, forVoice(text)])).digest("hex").slice(0, 16)}.mp3`;

async function render({ voice, model }, text) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=${FORMAT}`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text: forVoice(text), model_id: model }),
  });
  if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { audio: Buffer.from(await res.arrayBuffer()), credits: Number(res.headers.get("character-cost") ?? 0) };
}

const { lines, dynamic } = collectLines();

const uncast = [...new Set(lines.map((l) => l.speaker))].filter((speaker) => !CAST[speaker]);
if (uncast.length) {
  console.error(`No voice in CAST for: ${uncast.join(", ")}`);
  process.exit(1);
}

const manifest = Object.fromEntries(lines.map((l) => [`${l.speaker}|${l.text}`, fileName(CAST[l.speaker], l.text)]));
const missing = lines.filter((l) => !existsSync(`${OUT}${manifest[`${l.speaker}|${l.text}`]}`));
const unused = existsSync(OUT)
  ? readdirSync(OUT).filter((f) => f.endsWith(".mp3") && !Object.values(manifest).includes(f))
  : [];
const characters = missing.reduce((sum, l) => sum + l.text.length, 0);

console.log(`${lines.length} lines, ${missing.length} to render (${characters} characters), ${unused.length} unused`);
if (dynamic.length) console.log(`Changing lines without a fixed spoken version:\n  ${dynamic.join("\n  ")}`);

if (process.argv.includes("--dry-run")) {
  for (const l of missing) console.log(`  ${l.speaker}: ${l.text}`);
  process.exit(0);
}

if (missing.length && !process.env.ELEVENLABS_API_KEY) {
  console.error("ELEVENLABS_API_KEY is not set (see .env)");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
let credits = 0;
for (const [index, line] of missing.entries()) {
  const key = `${line.speaker}|${line.text}`;
  // Reason: stop at the first error; files already saved are kept, so running again resumes here
  const { audio, credits: cost } = await render(CAST[line.speaker], line.text);
  writeFileSync(`${OUT}${manifest[key]}`, audio);
  credits += cost;
  console.log(`[${index + 1}/${missing.length}] ${key}`);
}

for (const file of unused) rmSync(`${OUT}${file}`);
writeFileSync(`${OUT}manifest.json`, `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`Done. Credits used: ${credits}`);
