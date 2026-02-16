# Copilot Instructions — Domino Party Game

## Project Overview

A Dominican domino party game for Android TV built with [couch-kit](https://github.com/faluciano/react-native-couch-kit). The TV acts as the shared game board (host), and up to 4 players join from their phones (clients).

## Architecture

3 packages under `packages/`, managed with Bun workspaces:

| Package  | Name                  | Purpose                                                                   |
| -------- | --------------------- | ------------------------------------------------------------------------- |
| `shared` | `@domino-game/shared` | Game logic — reducer, types, helpers. Consumed by both client and host.   |
| `client` | `@domino-game/client` | Web app (React + Vite + Tailwind + Framer Motion). Players interact here. |
| `host`   | `@domino-game/host`   | Android TV app (React Native + Expo). Displays the shared board.          |

## How couch-kit Is Used

- **Host:** `GameHostProvider` wraps the app with `reducer={dominoReducer}` and `initialState`. Uses `useRoom()`, `usePlayers()`, `useGameState<DominoGameState, DominoAction>()`.
- **Client:** `CouchKitProvider` wraps the app. Uses `useCouchKit<DominoGameState, DominoAction>()` for state, dispatch, playerId.
- **Shared:** `dominoReducer` is a plain `(state, action) => state` function. couch-kit's `createGameReducer` wraps it on the host side to handle internal actions.

## Game Rules (Dominican Domino)

- 4 players, 2 teams (players across from each other)
- 28 tiles (double-six set), 7 dealt per player
- Phases: `lobby` → `dealing` → `playing` → `round_end` → `game_end`
- The player with the highest double goes first in round 1
- Play clockwise, match tile ends
- Tranque (blocked game): team with fewer points in hand wins the round
- First team to reach the target score wins

## Important Patterns

### PLAYER_JOINED Dual Handling

Both `createGameReducer` (framework) AND `dominoReducer` (app) handle `PLAYER_JOINED`. The framework adds the player to `state.players`. The app reducer additionally assigns team membership. This is intentional — the app extends the framework's behavior.

### Bot Logic

Bot turns are handled in the **host** package via `useEffect`, NOT in the shared reducer. The host watches for bot turns and auto-dispatches `PLAY_TILE` or `PASS_TURN` with a ~600ms delay.

### State Ownership

- **Framework-managed:** `state.players` (connection tracking, reconnection)
- **App-managed:** Everything else (tiles, hands, board, teams, scores, rounds, phase)

## Package Manager

**Bun** (pinned to 1.2.19). Do NOT use npm, yarn, or pnpm.

## Build & Dev

```bash
bun install                 # install all dependencies
bun run dev:client          # start Vite dev server (web client)
bun run dev:host            # start Expo/Metro (Android TV host)
bun run typecheck           # typecheck shared then client
bun run build:client        # build web client via Vite
bun run bundle:client       # bundle web client into Android assets
bun run build:android       # full Android build (bundle + expo run)
```

## Updating @couch-kit Dependencies

When a new version of couch-kit is published:

1. Update versions in the relevant `packages/*/package.json` files:
   - `packages/shared/package.json` → `@couch-kit/core`
   - `packages/client/package.json` → `@couch-kit/client`
   - `packages/host/package.json` → `@couch-kit/host`, `@couch-kit/cli`
2. Run `bun install` to update the lockfile
3. Run `bun run typecheck` to verify type compatibility
4. Run `bun run build:client` to verify the build
5. If there are breaking changes (major bump), check the [CHANGELOG](https://github.com/faluciano/react-native-couch-kit/blob/main/packages/host/CHANGELOG.md) for migration instructions

## CI

PRs to `main` run: `bun install --frozen-lockfile` → `typecheck` → `build:client`. The `check` job must pass before merging.
