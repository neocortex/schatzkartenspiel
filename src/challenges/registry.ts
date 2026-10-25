/**
 * Finds challenge modules by folder name and loads them on demand, so each
 * challenge's models and shaders only load when the player gets there.
 */

import { ChallengeFactory, ChallengeName } from "./types";

const MODULES = import.meta.glob<{ default: ChallengeFactory }>("./*/index.ts");

// Reason: an edit to any challenge file would otherwise reload every open game page while developing
if (import.meta.hot) import.meta.hot.accept();

export async function loadChallenge(name: ChallengeName): Promise<ChallengeFactory> {
  const load = MODULES[`./${name}/index.ts`];
  if (!load) throw new Error(`Challenge "${name}" not found in src/challenges/${name}/index.ts`);
  return (await load()).default;
}
