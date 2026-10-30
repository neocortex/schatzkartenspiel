/**
 * Finds every spoken line in src/ by reading the TypeScript source, so the
 * voice files can be rendered ahead of time.
 *
 * A line is found when its speaker stands next to it (`{ speaker, text }`,
 * `line("Tadeo", "...")`, or a helper like `tadeo("...")`). Lines kept in plain
 * constants without a speaker are attributed by the OWNERS table below.
 * A line with a changing value needs a fixed `spoken` version (second helper
 * argument) or an entry in `expandedLines`, otherwise it is reported as dynamic.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const SRC = new URL("../../src/", import.meta.url).pathname;

/** Speaker per file and constant, for strings spoken without a speaker next to them. */
const OWNERS = {
  "challenges/cave/script.ts": { oneMore: "Tadeo", gate1Open: "Tadeo", gate2Open: "Tadeo", wallOpen: "Tadeo", HINTS: "Tadeo" },
  "challenges/forest/script.ts": { BERRY_LINES: "Tadeo", OUCH_LINES: "Tadeo", WADE_LINE: "Tadeo" },
  "challenges/fishing/script.ts": {
    aimHelp: "Fischer Jonas",
    tooEarly: "Fischer Jonas",
    nowPull: "Fischer Jonas",
    firstNibble: "Fischer Jonas",
    misses: "Fischer Jonas",
    cheers: "Tadeo",
    heavy: "Tadeo",
    goldenSpotted: "Chuleta",
  },
  "challenges/fishing/species.ts": { fact: "Fischer Jonas" },
  "challenges/hens/script.ts": { CHULETA: "Chuleta", homeLine: "Kleine Mia" },
  "game/lake.ts": { lines: "Steintafel", answers: "Steintafel" },
  "game/chuletaLines.ts": { CHULETA_HINTS: "Chuleta", CHULETA_CHEERS: "Chuleta" },
  "game/Wardrobe.ts": { cheer: "Chuleta" },
  "game/sideGames.ts": { cheer: "Chuleta" },
  "game/Sightings.ts": { GUARD_LINES: "Oger", FRIEND_LINES: "Oger" },
};

const sourceFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });

const isText = (node) => node && ts.isStringLiteralLike(node);

/** Local helpers like `const tadeo = (text) => ({ speaker: "Tadeo", text })`: name → speaker, or null if passed in. */
function findHelpers(file) {
  const helpers = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrowFunction(node.initializer)) {
      let body = node.initializer.body;
      if (ts.isParenthesizedExpression(body)) body = body.expression;
      if (ts.isObjectLiteralExpression(body)) {
        const speaker = body.properties.find((p) => p.name?.getText() === "speaker");
        if (speaker && ts.isPropertyAssignment(speaker) && isText(speaker.initializer)) {
          helpers.set(node.name.getText(), speaker.initializer.text);
        } else if (speaker) {
          helpers.set(node.name.getText(), null);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return helpers;
}

/** Names of the constants, properties and functions around a node. */
function enclosingNames(node) {
  const names = [];
  for (let p = node.parent; p; p = p.parent) {
    const named = ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isFunctionDeclaration(p);
    if (named && p.name) names.push(p.name.getText());
  }
  return names;
}

/** Lines whose only changing part comes from a short fixed list in the game data. */
function expandedLines() {
  const read = (path) => readFileSync(join(SRC, path), "utf8");
  const quests = [...read("data/quests.ts").matchAll(/^\s*name: "([^"]+)"/gm)].map((m) => m[1]);
  const hens = [...read("challenges/hens/flock.ts").matchAll(/\{ name: "(\w+)"/g)].map((m) => m[1]).filter((n) => n !== "Piepsi");
  return [
    ...quests.map((name) => ({ speaker: "Tadeo", text: `Hier komme ich später wieder hin. Zuerst: ${name}!` })),
    ...hens.map((name) => ({ speaker: "Kleine Mia", text: `Juhu! ${name} ist wieder zu Hause!` })),
    { speaker: "Erzähler", text: "Erzählerstimme aktiviert." },
  ];
}

/**
 * Collects all spoken lines.
 *
 * @returns {{ lines: { speaker: string, text: string }[], dynamic: string[] }} Unique lines, plus
 *   the source of each line that changes at runtime and has no fixed spoken version.
 */
export function collectLines() {
  const found = new Map();
  const dynamic = [];
  const add = (speaker, text) => {
    const trimmed = text.trim();
    if (trimmed) found.set(`${speaker}|${trimmed}`, { speaker, text: trimmed });
  };

  for (const path of sourceFiles(SRC)) {
    const rel = relative(SRC, path);
    const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const helpers = findHelpers(file);
    const owners = OWNERS[rel] ?? {};

    const addOrReport = (speaker, node, spoken) => {
      if (isText(spoken)) add(speaker, spoken.text);
      else if (isText(node)) add(speaker, node.text);
      else if (ts.isTemplateExpression(node)) dynamic.push(`${rel}: ${node.getText()}`);
    };

    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const prop = (key) => node.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === key)?.initializer;
        if (isText(prop("speaker")) && prop("text")) {
          addOrReport(prop("speaker").text, prop("text"), prop("spoken"));
          return;
        }
        // Reason: villagers list their lines next to their name
        if (rel === "game/Npcs.ts" && isText(prop("name")) && prop("lines")) {
          for (const line of prop("lines").elements) add(prop("name").text, line.text);
          return;
        }
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && helpers.has(node.expression.text)) {
        const speaker = helpers.get(node.expression.text);
        const [first, second, third] = node.arguments;
        if (speaker) addOrReport(speaker, first, second);
        else if (isText(first)) addOrReport(first.text, second, third);
        return;
      }
      if (isText(node) && enclosingNames(node).some((name) => owners[name])) {
        add(owners[enclosingNames(node).find((name) => owners[name])], node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }

  for (const { speaker, text } of expandedLines()) add(speaker, text);
  return { lines: [...found.values()], dynamic };
}
