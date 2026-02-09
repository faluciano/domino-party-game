import { IGameState, IPlayer } from "@couch-kit/core";

// ─── Tile Types ─────────────────────────────────────────────────────────────

export interface DominoTile {
  id: string;
  left: number;
  right: number;
}

export interface BoardTile {
  tile: DominoTile;
  /** "flipped" means the tile was reversed to match the board end */
  flipped: boolean;
}

// ─── Bot Type ───────────────────────────────────────────────────────────────

export interface Bot {
  id: string;
  name: string;
  team: "a" | "b";
  seat: number;
}

// ─── Round Result ───────────────────────────────────────────────────────────

export interface RoundResult {
  winner: "a" | "b";
  reason: "domino" | "tranque";
  pointsAwarded: number;
  pipCounts: { a: number; b: number };
  /** The player/bot who won (emptied hand or had lowest pips) */
  winnerId: string | null;
}

// ─── Game State ─────────────────────────────────────────────────────────────

export interface GameState extends IGameState {
  /** Fine-grained game phase */
  phase: "lobby" | "playing" | "round_end" | "game_over";

  /** Team rosters: player/bot IDs */
  teams: { a: string[]; b: string[] };
  /** Player/bot ID -> seat index (0-3, clockwise) */
  seats: Record<string, number>;

  /** Bots in the game */
  bots: Record<string, Bot>;

  /** Player/bot ID -> tiles in hand */
  hands: Record<string, DominoTile[]>;
  /** The chain of played tiles on the board */
  board: BoardTile[];
  /** The two open ends of the chain, null before first tile is played */
  boardEnds: { left: number; right: number } | null;
  /** Index of the first tile played in the board array (shifts right on left plays) */
  centerIndex: number;

  /** Current turn: player/bot ID */
  currentTurn: string | null;
  /** Turn order (clockwise by seat: 0, 1, 2, 3) */
  turnOrder: string[];
  /** Consecutive passes (4 = tranque) */
  consecutivePasses: number;

  /** Who leads the next/current round */
  roundStarter: string | null;
  /** Current round number (1-based) */
  roundNumber: number;

  /** Cumulative team scores */
  scores: { a: number; b: number };
  /** Result of the last completed round */
  lastRoundResult: RoundResult | null;

  /** Target score to win the game */
  targetScore: number;

  /** Secret -> playerId mapping for session recovery across reconnects */
  sessions: Record<string, string>;
}

// ─── Actions ────────────────────────────────────────────────────────────────

export type GameAction =
  | {
      type: "PLAYER_JOINED";
      payload: {
        id: string;
        name?: string;
        avatar?: string;
        secret?: string;
      };
    }
  | { type: "PLAYER_LEFT"; payload: { playerId: string } }
  | { type: "CHOOSE_TEAM"; payload: { team: "a" | "b" }; playerId?: string }
  | {
      type: "START_GAME";
      payload: { shuffledTiles: DominoTile[] };
      playerId?: string;
    }
  | {
      type: "PLAY_TILE";
      payload: { tileId: string; end: "left" | "right" };
      playerId?: string;
    }
  | { type: "PASS"; playerId?: string }
  | { type: "NEW_ROUND"; payload: { shuffledTiles: DominoTile[] } }
  | { type: "RESET_GAME" };

// ─── Constants ──────────────────────────────────────────────────────────────

const TARGET_SCORE = 200;
const PLAYERS_PER_TEAM = 2;
const TOTAL_PLAYERS = 4;
const TILES_PER_HAND = 7;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate the full double-six domino set (28 tiles). */
export function generateAllTiles(): DominoTile[] {
  const tiles: DominoTile[] = [];
  for (let left = 0; left <= 6; left++) {
    for (let right = left; right <= 6; right++) {
      tiles.push({ id: `${left}-${right}`, left, right });
    }
  }
  return tiles;
}

/** Shuffle an array using Fisher-Yates (returns a new array). */
export function shuffleTiles(tiles: DominoTile[]): DominoTile[] {
  const arr = [...tiles];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Calculate total pip count for a hand. */
export function calculatePipCount(hand: DominoTile[]): number {
  return hand.reduce((sum, t) => sum + t.left + t.right, 0);
}

/** Check if a tile can be played on either end. */
export function canPlayTile(
  tile: DominoTile,
  boardEnds: { left: number; right: number } | null,
): { left: boolean; right: boolean } {
  // First tile can always be played
  if (!boardEnds) return { left: true, right: true };

  const matchesLeft =
    tile.left === boardEnds.left || tile.right === boardEnds.left;
  const matchesRight =
    tile.left === boardEnds.right || tile.right === boardEnds.right;

  return { left: matchesLeft, right: matchesRight };
}

/** Get all playable tiles from a hand given the current board ends. */
export function getPlayableTiles(
  hand: DominoTile[],
  boardEnds: { left: number; right: number } | null,
): DominoTile[] {
  return hand.filter((tile) => {
    const { left, right } = canPlayTile(tile, boardEnds);
    return left || right;
  });
}

/** Get which team a player/bot belongs to. */
export function getTeam(state: GameState, id: string): "a" | "b" | null {
  if (state.teams.a.includes(id)) return "a";
  if (state.teams.b.includes(id)) return "b";
  return null;
}

/** Check if an ID belongs to a bot. */
export function isBot(state: GameState, id: string): boolean {
  return id in state.bots;
}

/** Get display name for a player or bot. */
export function getDisplayName(state: GameState, id: string): string {
  if (state.bots[id]) return state.bots[id].name;
  if (state.players[id]) return state.players[id].name;
  return "Unknown";
}

/** Dominican bot names. */
const BOT_NAMES = ["Ramon", "Yolanda", "Miguelina", "Bienvenido"];

// ─── Initial State ──────────────────────────────────────────────────────────

export const initialState: GameState = {
  status: "lobby",
  players: {},
  phase: "lobby",
  teams: { a: [], b: [] },
  seats: {},
  bots: {},
  hands: {},
  board: [],
  boardEnds: null,
  centerIndex: 0,
  currentTurn: null,
  turnOrder: [],
  consecutivePasses: 0,
  roundStarter: null,
  roundNumber: 0,
  scores: { a: 0, b: 0 },
  lastRoundResult: null,
  targetScore: TARGET_SCORE,
  sessions: {},
};

// ─── Reducer Helpers ────────────────────────────────────────────────────────

/**
 * Migrate a reconnecting player from their old socket ID to the new one.
 * This replaces every reference to `oldId` across the entire game state
 * so that @couch-kit (which only knows the new socket ID) can continue
 * addressing this player correctly.
 */
function migratePlayer(
  state: GameState,
  oldId: string,
  newId: string,
  secret: string,
): GameState {
  const oldPlayer = state.players[oldId];

  // Build new players map: remove old entry, add new entry
  const newPlayers = { ...state.players };
  delete newPlayers[oldId];
  newPlayers[newId] = { ...oldPlayer, id: newId, connected: true };

  // Migrate team rosters
  const newTeams = {
    a: state.teams.a.map((id) => (id === oldId ? newId : id)),
    b: state.teams.b.map((id) => (id === oldId ? newId : id)),
  };

  // Migrate seats
  const newSeats = { ...state.seats };
  if (oldId in newSeats) {
    newSeats[newId] = newSeats[oldId];
    delete newSeats[oldId];
  }

  // Migrate hands
  const newHands = { ...state.hands };
  if (oldId in newHands) {
    newHands[newId] = newHands[oldId];
    delete newHands[oldId];
  }

  // Migrate turn order
  const newTurnOrder = state.turnOrder.map((id) => (id === oldId ? newId : id));

  // Migrate currentTurn and roundStarter
  const newCurrentTurn =
    state.currentTurn === oldId ? newId : state.currentTurn;
  const newRoundStarter =
    state.roundStarter === oldId ? newId : state.roundStarter;

  // Update session map
  const newSessions = { ...state.sessions, [secret]: newId };

  return {
    ...state,
    players: newPlayers,
    teams: newTeams,
    seats: newSeats,
    hands: newHands,
    turnOrder: newTurnOrder,
    currentTurn: newCurrentTurn,
    roundStarter: newRoundStarter,
    sessions: newSessions,
  };
}

function assignSeatAndTeam(state: GameState, playerId: string): GameState {
  // Count humans in each team
  const humansInA = state.teams.a.filter((id) => !state.bots[id]).length;
  const humansInB = state.teams.b.filter((id) => !state.bots[id]).length;

  // Auto-assign to the team with fewer humans
  let team: "a" | "b";
  if (humansInA <= humansInB) {
    team = "a";
  } else {
    team = "b";
  }

  // Don't exceed 2 humans per team
  if (team === "a" && humansInA >= PLAYERS_PER_TEAM) {
    team = "b";
  } else if (team === "b" && humansInB >= PLAYERS_PER_TEAM) {
    team = "a";
  }

  return {
    ...state,
    teams: {
      ...state.teams,
      [team]: [...state.teams[team], playerId],
    },
  };
}

function fillBotsAndAssignSeats(state: GameState): GameState {
  const newTeams = { a: [...state.teams.a], b: [...state.teams.b] };
  let newBots: Record<string, Bot> = {};
  let botIndex = 0;

  // Remove any existing bots from teams
  for (const botId of Object.keys(state.bots)) {
    newTeams.a = newTeams.a.filter((id) => id !== botId);
    newTeams.b = newTeams.b.filter((id) => id !== botId);
  }

  // Fill team A to 2 members
  while (newTeams.a.length < PLAYERS_PER_TEAM) {
    const usedNames = Object.values(newBots).map((b) => b.name);
    while (usedNames.includes(BOT_NAMES[botIndex] || `Bot ${botIndex + 1}`)) {
      botIndex++;
    }
    const name = BOT_NAMES[botIndex] || `Bot ${botIndex + 1}`;
    const botId = `bot_${botIndex}`;
    newBots[botId] = { id: botId, name, team: "a", seat: -1 };
    newTeams.a.push(botId);
    botIndex++;
  }

  // Fill team B to 2 members
  while (newTeams.b.length < PLAYERS_PER_TEAM) {
    const usedNames = Object.values(newBots).map((b) => b.name);
    while (usedNames.includes(BOT_NAMES[botIndex] || `Bot ${botIndex + 1}`)) {
      botIndex++;
    }
    const name = BOT_NAMES[botIndex] || `Bot ${botIndex + 1}`;
    const botId = `bot_${botIndex}`;
    newBots[botId] = { id: botId, name, team: "b", seat: -1 };
    newTeams.b.push(botId);
    botIndex++;
  }

  // Assign seats: 0,2 = Team A (partners across), 1,3 = Team B
  const seats: Record<string, number> = {};
  seats[newTeams.a[0]] = 0;
  seats[newTeams.b[0]] = 1;
  seats[newTeams.a[1]] = 2;
  seats[newTeams.b[1]] = 3;

  // Update bot seat values
  for (const botId of Object.keys(newBots)) {
    if (seats[botId] !== undefined) {
      newBots[botId] = { ...newBots[botId], seat: seats[botId] };
    }
  }

  return {
    ...state,
    teams: newTeams,
    bots: newBots,
    seats,
  };
}

function dealTiles(state: GameState, shuffledTiles: DominoTile[]): GameState {
  // Build turn order by seat: 0, 1, 2, 3
  const seatToPlayer: Record<number, string> = {};
  for (const [id, seat] of Object.entries(state.seats)) {
    seatToPlayer[seat] = id;
  }
  const turnOrder = [0, 1, 2, 3].map((seat) => seatToPlayer[seat]);

  // Deal 7 tiles to each player/bot in seat order
  const hands: Record<string, DominoTile[]> = {};
  for (let i = 0; i < TOTAL_PLAYERS; i++) {
    const playerId = turnOrder[i];
    hands[playerId] = shuffledTiles.slice(
      i * TILES_PER_HAND,
      (i + 1) * TILES_PER_HAND,
    );
  }

  return { ...state, hands, turnOrder };
}

function findFirstPlayer(state: GameState): string {
  // First round: whoever has the double-six (la mula) goes first
  if (state.roundNumber === 1) {
    for (const [playerId, hand] of Object.entries(state.hands)) {
      if (hand.some((t) => t.id === "6-6")) {
        return playerId;
      }
    }
  }

  // Subsequent rounds: the winner of the previous round starts
  if (state.roundStarter) {
    // Verify this player is actually in the game (has a hand dealt)
    if (
      state.hands[state.roundStarter] &&
      state.hands[state.roundStarter].length > 0
    ) {
      return state.roundStarter;
    }
    // If roundStarter is on a team, find their partner or teammate
    const team = getTeam(state, state.roundStarter);
    if (team) {
      const teammate = state.teams[team].find(
        (id) =>
          id !== state.roundStarter &&
          state.hands[id] &&
          state.hands[id].length > 0,
      );
      if (teammate) return teammate;
    }
  }

  // Fallback: first player in turn order who has a hand
  for (const pid of state.turnOrder) {
    if (state.hands[pid] && state.hands[pid].length > 0) {
      return pid;
    }
  }

  // Ultimate fallback
  return state.turnOrder[0];
}

function advanceTurn(state: GameState): string {
  const idx = state.turnOrder.indexOf(state.currentTurn!);
  const nextIdx = (idx + 1) % state.turnOrder.length;
  return state.turnOrder[nextIdx];
}

function resolveRoundEnd(
  state: GameState,
  reason: "domino" | "tranque",
  winnerId: string | null,
): GameState {
  // Calculate pip counts per team
  const pipCounts = { a: 0, b: 0 };
  for (const [id, hand] of Object.entries(state.hands)) {
    const team = getTeam(state, id);
    if (team) {
      pipCounts[team] += calculatePipCount(hand);
    }
  }

  let winnerTeam: "a" | "b";
  let pointsAwarded: number;

  if (reason === "domino") {
    // Winner's team scores the opponents' total pips
    winnerTeam = getTeam(state, winnerId!)!;
    const loserTeam = winnerTeam === "a" ? "b" : "a";
    pointsAwarded = pipCounts[loserTeam];
  } else {
    // Tranque: team with fewer pips wins, scores the difference
    if (pipCounts.a < pipCounts.b) {
      winnerTeam = "a";
      pointsAwarded = pipCounts.b - pipCounts.a;
    } else if (pipCounts.b < pipCounts.a) {
      winnerTeam = "b";
      pointsAwarded = pipCounts.a - pipCounts.b;
    } else {
      // Exact tie: no points awarded, team A gets nominal "win" for round ordering
      winnerTeam = "a";
      pointsAwarded = 0;
    }
  }

  const newScores = {
    a: state.scores.a + (winnerTeam === "a" ? pointsAwarded : 0),
    b: state.scores.b + (winnerTeam === "b" ? pointsAwarded : 0),
  };

  const roundResult: RoundResult = {
    winner: winnerTeam,
    reason,
    pointsAwarded,
    pipCounts,
    winnerId,
  };

  const isGameOver =
    newScores.a >= state.targetScore || newScores.b >= state.targetScore;

  // For tranque with no specific winnerId, find the player on winning team
  // with the lowest individual pip count to be the round starter
  let roundStarterId: string;
  if (winnerId) {
    roundStarterId = winnerId;
  } else {
    // Tranque: find the player on the winning team with lowest pips
    let bestId = state.teams[winnerTeam][0];
    let bestPips = Infinity;
    for (const memberId of state.teams[winnerTeam]) {
      const hand = state.hands[memberId];
      if (hand) {
        const pips = calculatePipCount(hand);
        if (pips < bestPips) {
          bestPips = pips;
          bestId = memberId;
        }
      }
    }
    roundStarterId = bestId;
  }

  return {
    ...state,
    phase: isGameOver ? "game_over" : "round_end",
    status: isGameOver ? "ended" : "playing",
    scores: newScores,
    lastRoundResult: roundResult,
    currentTurn: null,
    roundStarter: roundStarterId,
  };
}

// ─── Reducer ────────────────────────────────────────────────────────────────

export const gameReducer = (
  state: GameState,
  action: GameAction,
): GameState => {
  switch (action.type) {
    // ── Player Management ───────────────────────────────────────────────

    case "PLAYER_JOINED": {
      const { id, name, avatar, secret } = action.payload;

      // Don't add duplicates (same socket ID already in state)
      if (state.players[id]) {
        return {
          ...state,
          players: {
            ...state.players,
            [id]: { ...state.players[id], connected: true },
          },
        };
      }

      // ── Session Recovery ─────────────────────────────────────────────
      // If this secret was previously used by another player, migrate
      // all their data to the new socket ID (couch-kit generates a new
      // random socketId on every TCP connection).
      if (secret && state.sessions[secret]) {
        const oldId = state.sessions[secret];
        const oldPlayer = state.players[oldId];

        if (oldPlayer) {
          return migratePlayer(state, oldId, id, secret);
        }
      }

      // ── New Player ───────────────────────────────────────────────────
      // Max 4 humans
      const humanCount = Object.values(state.players).filter(
        (p) => p.connected,
      ).length;
      if (humanCount >= TOTAL_PLAYERS) return state;

      const player: IPlayer = {
        id,
        name: name || `Player ${Object.keys(state.players).length + 1}`,
        avatar,
        isHost: Object.keys(state.players).length === 0,
        connected: true,
      };

      let newState: GameState = {
        ...state,
        players: { ...state.players, [id]: player },
        sessions: secret ? { ...state.sessions, [secret]: id } : state.sessions,
      };

      // Auto-assign to a team if in lobby
      if (state.phase === "lobby") {
        newState = assignSeatAndTeam(newState, id);
      }

      return newState;
    }

    case "PLAYER_LEFT": {
      const { playerId } = action.payload;
      const player = state.players[playerId];
      if (!player) return state;
      return {
        ...state,
        players: {
          ...state.players,
          [playerId]: { ...player, connected: false },
        },
      };
    }

    // ── Lobby Actions ───────────────────────────────────────────────────

    case "CHOOSE_TEAM": {
      const playerId = action.playerId;
      if (!playerId || state.phase !== "lobby") return state;

      const targetTeam = action.payload.team;

      // Check target team isn't full of humans
      const humansInTarget = state.teams[targetTeam].filter(
        (id) => !state.bots[id],
      ).length;
      if (humansInTarget >= PLAYERS_PER_TEAM) return state;

      // Remove player from current team, add to target
      const newTeams = {
        a: state.teams.a.filter((id) => id !== playerId),
        b: state.teams.b.filter((id) => id !== playerId),
      };
      newTeams[targetTeam] = [...newTeams[targetTeam], playerId];

      return { ...state, teams: newTeams };
    }

    // ── Game Flow ───────────────────────────────────────────────────────

    case "START_GAME": {
      if (state.phase !== "lobby" && state.phase !== "round_end") return state;

      // Need at least 1 connected human
      const connectedHumans = Object.values(state.players).filter(
        (p) => p.connected,
      ).length;
      if (connectedHumans === 0) return state;

      // Fill empty seats with bots and assign seats
      let newState = fillBotsAndAssignSeats(state);

      // Deal tiles
      newState = dealTiles(newState, action.payload.shuffledTiles);

      const roundNumber = state.phase === "lobby" ? 1 : state.roundNumber + 1;

      newState = {
        ...newState,
        roundNumber,
        phase: "playing",
        status: "playing",
        board: [],
        boardEnds: null,
        centerIndex: 0,
        consecutivePasses: 0,
        lastRoundResult: null,
      };

      const firstPlayer = findFirstPlayer(newState);
      newState = { ...newState, currentTurn: firstPlayer };

      return newState;
    }

    case "PLAY_TILE": {
      if (state.phase !== "playing") return state;

      const playerId = action.playerId;
      if (!playerId || playerId !== state.currentTurn) return state;

      const { tileId, end } = action.payload;
      const hand = state.hands[playerId];
      if (!hand) return state;

      const tileIndex = hand.findIndex((t) => t.id === tileId);
      if (tileIndex === -1) return state;

      const tile = hand[tileIndex];

      // Validate the tile can be played on the chosen end
      const playability = canPlayTile(tile, state.boardEnds);
      if (!playability[end]) return state;

      // Determine orientation and new board ends
      let boardTile: BoardTile;
      let newBoardEnds: { left: number; right: number };

      if (!state.boardEnds) {
        // First tile on the board — in round 1, must be double-six (la mula)
        if (state.roundNumber === 1 && tile.id !== "6-6") return state;
        boardTile = { tile, flipped: false };
        newBoardEnds = { left: tile.left, right: tile.right };
      } else if (end === "left") {
        const connectValue = state.boardEnds.left;
        if (tile.right === connectValue) {
          boardTile = { tile, flipped: false };
          newBoardEnds = { ...state.boardEnds, left: tile.left };
        } else {
          boardTile = { tile, flipped: true };
          newBoardEnds = { ...state.boardEnds, left: tile.right };
        }
      } else {
        const connectValue = state.boardEnds.right;
        if (tile.left === connectValue) {
          boardTile = { tile, flipped: false };
          newBoardEnds = { ...state.boardEnds, right: tile.right };
        } else {
          boardTile = { tile, flipped: true };
          newBoardEnds = { ...state.boardEnds, right: tile.left };
        }
      }

      // Add tile to the appropriate end of the board
      const newBoard =
        end === "left"
          ? [boardTile, ...state.board]
          : [...state.board, boardTile];

      // Track center index: left prepends shift the original first tile right.
      // The very first tile on the board is always the center (index 0).
      const newCenterIndex =
        end === "left" && state.board.length > 0
          ? state.centerIndex + 1
          : state.centerIndex;

      // Remove tile from hand
      const newHand = [...hand];
      newHand.splice(tileIndex, 1);

      let newState: GameState = {
        ...state,
        hands: { ...state.hands, [playerId]: newHand },
        board: newBoard,
        boardEnds: newBoardEnds,
        centerIndex: newCenterIndex,
        consecutivePasses: 0,
      };

      // Check if player emptied their hand (domino!)
      if (newHand.length === 0) {
        return resolveRoundEnd(newState, "domino", playerId);
      }

      // Advance turn
      newState = { ...newState, currentTurn: advanceTurn(newState) };
      return newState;
    }

    case "PASS": {
      if (state.phase !== "playing") return state;

      const playerId = action.playerId;
      if (!playerId || playerId !== state.currentTurn) return state;

      // Validate: player must have no playable tiles
      const hand = state.hands[playerId];
      if (!hand) return state;

      const playable = getPlayableTiles(hand, state.boardEnds);
      if (playable.length > 0) return state;

      const newPasses = state.consecutivePasses + 1;

      // Check for tranque (all 4 players passed consecutively)
      if (newPasses >= TOTAL_PLAYERS) {
        return resolveRoundEnd(
          { ...state, consecutivePasses: newPasses },
          "tranque",
          null,
        );
      }

      return {
        ...state,
        consecutivePasses: newPasses,
        currentTurn: advanceTurn(state),
      };
    }

    case "NEW_ROUND": {
      if (state.phase !== "round_end") return state;

      let newState: GameState = {
        ...state,
        board: [],
        boardEnds: null,
        centerIndex: 0,
        consecutivePasses: 0,
        lastRoundResult: null,
      };

      newState = dealTiles(newState, action.payload.shuffledTiles);

      const roundNumber = state.roundNumber + 1;
      newState = {
        ...newState,
        roundNumber,
        phase: "playing",
        status: "playing",
      };

      const firstPlayer = findFirstPlayer(newState);
      newState = { ...newState, currentTurn: firstPlayer };

      return newState;
    }

    case "RESET_GAME": {
      // Preserve connected players and sessions, reset everything else
      const resetPlayers: Record<string, IPlayer> = {};
      for (const [id, player] of Object.entries(state.players)) {
        if (player.connected) {
          resetPlayers[id] = player;
        }
      }

      // Preserve sessions for connected players only
      const resetSessions: Record<string, string> = {};
      for (const [secret, playerId] of Object.entries(state.sessions)) {
        if (resetPlayers[playerId]) {
          resetSessions[secret] = playerId;
        }
      }

      let newState: GameState = {
        ...initialState,
        players: resetPlayers,
        sessions: resetSessions,
      };

      // Re-assign teams for connected players
      for (const id of Object.keys(resetPlayers)) {
        newState = assignSeatAndTeam(newState, id);
      }

      return newState;
    }

    default:
      return state;
  }
};
