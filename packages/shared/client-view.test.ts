import { describe, expect, test } from "bun:test";
import {
  createClientView,
  emptyClientView,
  gameReducer,
  initialState,
  generateAllTiles,
  shuffleTiles,
  type GameState,
} from "./index";

/**
 * The guarantee behind server-side projection: a player's device must never
 * receive another player's tiles. The controller used to pick its own entry out
 * of a broadcast `hands`, which hid opponents' tiles from the UI but left them
 * in memory for anyone who opened devtools.
 */

/** A started 4-handed game: one human, three bots, tiles dealt. */
function startedGame(): GameState {
  let state = gameReducer(initialState, {
    type: "PLAYER_JOINED",
    payload: { id: "p1", name: "Alice" },
  });
  state = gameReducer(state, {
    type: "CHOOSE_TEAM",
    payload: { team: "a" },
    playerId: "p1",
  });
  return gameReducer(state, {
    type: "START_GAME",
    payload: { shuffledTiles: shuffleTiles(generateAllTiles()) },
    playerId: "p1",
  });
}

describe("createClientView", () => {
  test("a started game really deals tiles to more than one player", () => {
    // Guards the tests below: an empty hand would satisfy them while proving
    // nothing.
    const state = startedGame();
    const withTiles = Object.values(state.hands).filter((h) => h.length > 0);
    expect(withTiles.length).toBeGreaterThan(1);
  });

  test("never puts another player's tiles on the wire", () => {
    const state = startedGame();
    const others = Object.entries(state.hands).filter(([id]) => id !== "p1");
    const view = JSON.stringify(createClientView(state, "p1"));

    for (const [, tiles] of others) {
      for (const tile of tiles) {
        // The serialized payload is exactly what the transport sends.
        expect(view).not.toContain(`"${tile.id}"`);
      }
    }
  });

  test("still gives a player their own tiles", () => {
    const state = startedGame();
    const view = createClientView(state, "p1");

    expect(view.myHand.length).toBeGreaterThan(0);
    expect(view.myHand).toEqual(state.hands.p1);
  });

  test("keeps hand sizes, which the table shows anyway", () => {
    const state = startedGame();
    const view = createClientView(state, "p1");

    for (const [id, tiles] of Object.entries(state.hands)) {
      expect(view.handCounts[id]).toBe(tiles.length);
    }
  });

  test("drops the raw hands map entirely", () => {
    const state = startedGame();
    const view = createClientView(state, "p1") as unknown as Record<
      string,
      unknown
    >;
    expect(view.hands).toBeUndefined();
  });

  test("a player the game does not know gets no tiles", () => {
    const state = startedGame();
    const view = createClientView(state, "stranger");
    expect(view.myHand).toEqual([]);
  });

  test("public state survives projection", () => {
    const state = startedGame();
    const view = createClientView(state, "p1");

    expect(view.phase).toBe(state.phase);
    expect(view.teams).toEqual(state.teams);
    expect(view.currentTurn).toBe(state.currentTurn);
    expect(view.board).toEqual(state.board);
  });

  test("the empty view is shaped like a real one", () => {
    expect(emptyClientView.myHand).toEqual([]);
    expect(emptyClientView.phase).toBe("lobby");
    expect(
      (emptyClientView as unknown as Record<string, unknown>).hands,
    ).toBeUndefined();
  });
});
