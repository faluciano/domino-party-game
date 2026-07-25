// ─── Bot Turns ──────────────────────────────────────────────────────────────
// Port of the bot-turn effect in packages/host/App.tsx's GameScreen. Whoever
// owns the runtime drives the bots; on a cross-network setup that's the browser
// display, so this must run here or bot seats would stall the game.

import { useEffect, useRef } from "react";
import {
  canPlayTile,
  getPlayableTiles,
  isBot,
  type GameAction,
  type GameState,
} from "@my-game/shared";

/** Delay before a bot plays, so the table can follow what happened. */
const BOT_MOVE_DELAY_MS = 600;

export function useBotTurns(
  state: GameState,
  dispatch: (action: GameAction) => void,
): void {
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state.phase !== "playing" || !state.currentTurn) return;
    if (!isBot(state, state.currentTurn)) return;

    if (botTimerRef.current) {
      clearTimeout(botTimerRef.current);
    }

    const botId = state.currentTurn;
    const botHand = state.hands[botId];
    if (!botHand) return;

    botTimerRef.current = setTimeout(() => {
      const playable = getPlayableTiles(botHand, state.boardEnds);

      if (playable.length > 0) {
        // Round 1, first tile: must play the double-six (la mula)
        let tile = playable[0];
        if (!state.boardEnds && state.roundNumber === 1) {
          const mula = botHand.find((t) => t.id === "6-6");
          if (mula) tile = mula;
        }

        const playability = canPlayTile(tile, state.boardEnds);

        let end: "left" | "right";
        if (!state.boardEnds) {
          end = "left";
        } else if (playability.left && !playability.right) {
          end = "left";
        } else if (!playability.left && playability.right) {
          end = "right";
        } else {
          // Both ends work, pick left
          end = "left";
        }

        dispatch({
          type: "PLAY_TILE",
          payload: { tileId: tile.id, end },
          playerId: botId,
        });
      } else {
        dispatch({
          type: "PASS",
          playerId: botId,
        });
      }
    }, BOT_MOVE_DELAY_MS);

    return () => {
      if (botTimerRef.current) {
        clearTimeout(botTimerRef.current);
      }
    };
    // Matches the host's dependency list: re-evaluate on turn/phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentTurn, state.phase]);
}
