/**
 * The end of the adventure: the end card over the festival, and Space plays again.
 * Everything this game collected is gone before the card shows, so a tab closed at the card leaves nothing behind.
 */

import { Input } from "../core/Input";
import { SaveManager } from "../systems/SaveManager";
import { showEndCard } from "../ui/EndCard";
import { GameUI } from "../ui/GameUI";
import { COIN_COUNT, Coins } from "./Coins";
import { Wardrobe } from "./Wardrobe";

export async function playEnding(ui: GameUI, input: Input, coins: Coins, wardrobe: Wardrobe): Promise<void> {
  SaveManager.getInstance().deleteSave();
  const found = coins.collected;
  // Reason: with the save gone the next title screen has nothing to reset from, so the next game would start with these
  coins.reset();
  wardrobe.reset();
  await showEndCard(ui.layer, input, `${found} / ${COIN_COUNT}`);
  location.reload();
}
