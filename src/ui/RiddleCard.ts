/**
 * The riddle card: a slab of old stone with the glowing runes of the lake
 * tablets, three big answers on it and one of them lit. Arrows move the light,
 * Space picks the answer under it. Each answer is read aloud when it lights up.
 */

import "./riddleCard.css";
import { Input } from "../core/Input";
import { audio } from "../audio/Audio";
import { NarrationManager } from "../systems/NarrationManager";

/** Space does nothing this long, so a press meant for the riddle's last line can't answer it unseen. */
const MIN_OPEN_MS = 400;
/** How long the picked answer shows before the card goes. */
const PICK_MS = 450;
/** Matches the `riddle-out` animation in riddleCard.css. */
const CLOSE_MS = 260;
const SPEAKER = "Steintafel";

/** The pieces a rune is carved from, in a 20 x 20 box. */
const STROKES = [
  "M10 2V18",
  "M3 4H17",
  "M4 4L16 16",
  "M4 16L16 4",
  "M4 10H16",
  "M3 15L10 6L17 15",
  "M5 4H15V10H5Z",
];

/** A column of runes, each made of two or three strokes; the same seed always carves the same column. */
function runeColumn(seed: number): string {
  let state = seed;
  const next = (n: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return Math.floor((state / 2147483648) * n);
  };
  const glyphs = Array.from({ length: 7 }, (_, row) => {
    const used = new Set<number>();
    const count = 2 + next(2);
    while (used.size < count) used.add(next(STROKES.length));
    return `<g transform="translate(0 ${row * 22})">${[...used].map((s) => `<path d="${STROKES[s]}"/>`).join("")}</g>`;
  });
  return `<svg class="riddle-runes" viewBox="0 0 20 152" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${glyphs.join("")}</svg>`;
}

/** The sun and eye carved at the top of every tablet. */
const SUN = `
  <svg class="riddle-sun" viewBox="-20 -20 40 40" fill="none" stroke-width="2.4" stroke-linecap="round">
    <circle r="7"/><circle r="2.2" fill="currentColor"/>
    ${Array.from({ length: 8 }, (_, i) => `<path d="M0 -11V-16" transform="rotate(${i * 45})"/>`).join("")}
  </svg>`;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const esc = (text: string) => text.replace(/[&<>]/g, (c) => ESCAPES[c]);

/**
 * Ask a riddle's three answers on a stone card.
 *
 * @param layer The UI layer the card is added to.
 * @param input Arrows move the light, Space picks. The scene underneath must leave both alone while the card is up
 *   (the island does when controls are off).
 * @param answers The words to choose from. The light starts on the first, so the first is never the right one.
 * @param lines The riddle, shown above the answers so it can be read again after a wrong try.
 * @returns The index of the chosen answer, once the card has gone.
 */
export async function askRiddle(layer: HTMLElement, input: Input, answers: string[], lines: string[] = []): Promise<number> {
  const card = document.createElement("div");
  card.className = "riddle-card";
  card.innerHTML = `
    <div class="riddle-stone">
      ${SUN}${runeColumn(3)}${runeColumn(11)}
      <div class="riddle-lines">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>
      <ol class="riddle-answers">
        ${answers.map((a) => `<li class="riddle-answer"><span class="riddle-mark"></span><span class="riddle-word">${esc(a)}</span></li>`).join("")}
      </ol>
      <div class="riddle-keys"><span class="riddle-keycap">▲</span><span class="riddle-keycap">▼</span><span class="riddle-space"></span></div>
    </div>`;
  layer.appendChild(card);
  const plates = [...card.querySelectorAll<HTMLElement>(".riddle-answer")];

  let index = 0;
  const light = (i: number) => {
    index = i;
    plates.forEach((p, k) => p.classList.toggle("active", k === i));
    NarrationManager.getInstance().speakLine(answers[i], SPEAKER);
  };
  light(0);

  const openedAt = performance.now();
  setTimeout(() => card.classList.add("ready"), MIN_OPEN_MS);
  await new Promise<void>((resolve) => {
    const check = () => {
      const step = (input.consume("ArrowDown") || input.consume("ArrowRight") ? 1 : 0) - (input.consume("ArrowUp") || input.consume("ArrowLeft") ? 1 : 0);
      const to = Math.min(Math.max(index + step, 0), answers.length - 1);
      if (to !== index) {
        audio.playSfx("sfx_menu_select", 0.3);
        light(to);
      }
      // Reason: a press that comes in the first moments is thrown away, never kept for later
      if (input.consume("Space") && performance.now() - openedAt >= MIN_OPEN_MS) resolve();
      else requestAnimationFrame(check);
    };
    check();
  });

  audio.playSfx("sfx_menu_confirm", 0.5);
  plates[index].classList.add("chosen");
  await new Promise((r) => setTimeout(r, PICK_MS));
  card.classList.add("closing");
  await new Promise((r) => setTimeout(r, CLOSE_MS));
  card.remove();
  return index;
}
