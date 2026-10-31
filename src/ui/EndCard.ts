/**
 * The final "Ende" card shown over the island's festival, with the number of
 * coins found and what comes next. Resolves when the player presses Space to play again.
 */

import { Input } from "../core/Input";

export async function showEndCard(layer: HTMLElement, input: Input, coins: string): Promise<void> {
  const card = document.createElement("div");
  card.className = "endcard";
  card.innerHTML = `
    <div class="banner show" style="position:static;transform:none">
      <div class="small">Ende</div><div class="big">Du hast die Insel gerettet!</div>
    </div>
    <div class="end-sub">Danke fürs Spielen, Tadeo! · Goldmünzen: ${coins}</div>
    <div class="end-teaser">Tadeo segelt in seinem geflickten Boot nach Hause.<br />Und bald kommt die Rakete! 🚀</div>
    <div class="end-sub"><span class="key">Leertaste</span> Nochmal spielen</div>`;
  layer.appendChild(card);
  requestAnimationFrame(() => card.classList.add("show"));
  // Reason: ignore Space presses still left over from the last dialogue
  await new Promise((r) => setTimeout(r, 2500));
  input.consume("Space");
  await new Promise<void>((resolve) => {
    const check = () => (input.consume("Space") ? resolve() : requestAnimationFrame(check));
    check();
  });
}
