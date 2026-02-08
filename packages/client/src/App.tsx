import { useState } from "react";
import { useGameClient } from "@party-kit/client";
import {
  gameReducer,
  initialState,
  GameState,
  GameAction,
  DominoTile,
  canPlayTile,
  getPlayableTiles,
  getTeam,
  getDisplayName,
  isBot,
  generateAllTiles,
  shuffleTiles,
  calculatePipCount,
} from "@my-game/shared";

// ─── Tile Component ─────────────────────────────────────────────────────────

function DotPattern({ value }: { value: number }) {
  // Pip positions for each value on a half-tile (relative to a 40x40 area)
  const positions: Record<number, [number, number][]> = {
    0: [],
    1: [[20, 20]],
    2: [[12, 12], [28, 28]],
    3: [[12, 12], [20, 20], [28, 28]],
    4: [[12, 12], [28, 12], [12, 28], [28, 28]],
    5: [[12, 12], [28, 12], [20, 20], [12, 28], [28, 28]],
    6: [[12, 10], [28, 10], [12, 20], [28, 20], [12, 30], [28, 30]],
  };

  const dots = positions[value] || [];

  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="4" fill="white" />
      ))}
    </svg>
  );
}

function TileView({
  tile,
  selected,
  playable,
  onClick,
  small,
}: {
  tile: DominoTile;
  selected?: boolean;
  playable?: boolean;
  onClick?: () => void;
  small?: boolean;
}) {
  const size = small ? 0.7 : 1;
  const width = 42 * size;
  const height = 76 * size;

  return (
    <div
      onClick={onClick}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: selected
          ? "#2563eb"
          : playable
          ? "#1e3a5f"
          : "#333333",
        border: `2px solid ${
          selected ? "#60a5fa" : playable ? "#3b82f6" : "#555555"
        }`,
        borderRadius: `${5 * size}px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick ? "pointer" : "default",
        opacity: playable || selected ? 1 : 0.5,
        transition: "all 0.15s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          transform: `scale(${size * 0.85})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <DotPattern value={tile.left} />
        <div
          style={{
            width: "30px",
            height: "2px",
            backgroundColor: "#666",
            margin: "2px 0",
          }}
        />
        <DotPattern value={tile.right} />
      </div>
    </div>
  );
}

// ─── Lobby Screen ───────────────────────────────────────────────────────────

function LobbyScreen({
  state,
  playerId,
  sendAction,
}: {
  state: GameState;
  playerId: string | null;
  sendAction: (action: GameAction) => void;
}) {
  const myTeam = playerId ? getTeam(state, playerId) : null;
  const connectedHumans = Object.values(state.players).filter(
    (p) => p.connected
  ).length;

  const handleChooseTeam = (team: "a" | "b") => {
    sendAction({ type: "CHOOSE_TEAM", payload: { team } });
  };

  const handleStartGame = () => {
    const tiles = shuffleTiles(generateAllTiles());
    sendAction({ type: "START_GAME", payload: { shuffledTiles: tiles } });
  };

  const renderTeamSlots = (team: "a" | "b") => {
    const members = state.teams[team];
    const slots = [];

    for (let i = 0; i < 2; i++) {
      const memberId = members[i];
      if (memberId) {
        const isSelf = memberId === playerId;
        const name = getDisplayName(state, memberId);
        const isBotPlayer = isBot(state, memberId);
        slots.push(
          <div
            key={i}
            style={{
              padding: "8px 12px",
              backgroundColor: isSelf ? "#1e3a5f" : "#2a2a2a",
              borderRadius: "8px",
              marginBottom: "4px",
              border: isSelf ? "1px solid #3b82f6" : "1px solid #444",
              fontSize: "0.9rem",
            }}
          >
            {name} {isBotPlayer ? "(Bot)" : ""} {isSelf ? "(You)" : ""}
          </div>
        );
      } else {
        slots.push(
          <div
            key={i}
            style={{
              padding: "8px 12px",
              backgroundColor: "#1a1a1a",
              borderRadius: "8px",
              marginBottom: "4px",
              border: "1px dashed #444",
              fontSize: "0.9rem",
              color: "#666",
            }}
          >
            Empty (bot will fill)
          </div>
        );
      }
    }
    return slots;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px",
        flex: 1,
        justifyContent: "center",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>Domino</h1>
      <p style={{ color: "#888", marginBottom: "20px", fontSize: "0.85rem" }}>
        {connectedHumans}/4 players connected
      </p>

      <div
        style={{
          display: "flex",
          gap: "16px",
          width: "100%",
          maxWidth: "360px",
          marginBottom: "24px",
        }}
      >
        {/* Team A */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              textAlign: "center",
              fontWeight: "bold",
              marginBottom: "8px",
              color: "#f59e0b",
              fontSize: "0.9rem",
            }}
          >
            Team A
          </div>
          {renderTeamSlots("a")}
          {myTeam !== "a" && (
            <button
              onClick={() => handleChooseTeam("a")}
              style={{
                width: "100%",
                padding: "8px",
                marginTop: "8px",
                backgroundColor: "#f59e0b",
                color: "black",
                border: "none",
                borderRadius: "8px",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Join A
            </button>
          )}
        </div>

        {/* Team B */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              textAlign: "center",
              fontWeight: "bold",
              marginBottom: "8px",
              color: "#3b82f6",
              fontSize: "0.9rem",
            }}
          >
            Team B
          </div>
          {renderTeamSlots("b")}
          {myTeam !== "b" && (
            <button
              onClick={() => handleChooseTeam("b")}
              style={{
                width: "100%",
                padding: "8px",
                marginTop: "8px",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Join B
            </button>
          )}
        </div>
      </div>

      {connectedHumans >= 1 && (
        <button
          onClick={handleStartGame}
          style={{
            padding: "14px 40px",
            backgroundColor: "#22c55e",
            color: "white",
            border: "none",
            borderRadius: "12px",
            fontSize: "1.1rem",
            fontWeight: "bold",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(34, 197, 94, 0.3)",
          }}
        >
          Start Game
        </button>
      )}
    </div>
  );
}

// ─── Playing Screen ─────────────────────────────────────────────────────────

function PlayingScreen({
  state,
  playerId,
  sendAction,
}: {
  state: GameState;
  playerId: string | null;
  sendAction: (action: GameAction) => void;
}) {
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);

  if (!playerId) return <div>Connecting...</div>;

  const myHand = state.hands[playerId] || [];

  // If we're in the playing phase but don't have tiles yet, the host state
  // hasn't been hydrated. Show a brief loading indicator rather than an
  // empty hand that confuses the player.
  if (myHand.length === 0 && state.board.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "#888" }}>
        Loading game...
      </div>
    );
  }
  const isMyTurn = state.currentTurn === playerId;
  let playableTiles = isMyTurn
    ? getPlayableTiles(myHand, state.boardEnds)
    : [];

  // Round 1, first tile: only the double-six (la mula) is playable
  if (isMyTurn && !state.boardEnds && state.roundNumber === 1) {
    playableTiles = playableTiles.filter((t) => t.id === "6-6");
  }

  const playableIds = new Set(playableTiles.map((t) => t.id));
  const mustPass = isMyTurn && playableTiles.length === 0;

  const currentTurnName = state.currentTurn
    ? getDisplayName(state, state.currentTurn)
    : "";
  const currentTurnIsBot = state.currentTurn
    ? isBot(state, state.currentTurn)
    : false;

  const selectedTile = myHand.find((t) => t.id === selectedTileId);
  const selectedPlayability = selectedTile
    ? canPlayTile(selectedTile, state.boardEnds)
    : null;

  // If selected tile can only go on one end, auto-play
  const handleTileSelect = (tile: DominoTile) => {
    if (!isMyTurn || !playableIds.has(tile.id)) return;

    const playability = canPlayTile(tile, state.boardEnds);
    const canLeft = playability.left;
    const canRight = playability.right;

    // First tile or only one end: auto-play
    if (!state.boardEnds || (canLeft && !canRight)) {
      sendAction({
        type: "PLAY_TILE",
        payload: { tileId: tile.id, end: "left" },
      });
      setSelectedTileId(null);
      return;
    }
    if (!canLeft && canRight) {
      sendAction({
        type: "PLAY_TILE",
        payload: { tileId: tile.id, end: "right" },
      });
      setSelectedTileId(null);
      return;
    }

    // Both ends: show choice
    setSelectedTileId(tile.id);
  };

  const handlePlayEnd = (end: "left" | "right") => {
    if (!selectedTileId) return;
    sendAction({
      type: "PLAY_TILE",
      payload: { tileId: selectedTileId, end },
    });
    setSelectedTileId(null);
  };

  const handlePass = () => {
    sendAction({ type: "PASS" });
  };

  const myTeam = getTeam(state, playerId);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        padding: "8px 10px",
        overflow: "hidden",
      }}
    >
      {/* Top bar: scores and turn */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "6px",
          fontSize: "0.8rem",
        }}
      >
        <div>
          <span style={{ color: "#f59e0b", fontWeight: "bold" }}>
            A: {state.scores.a}
          </span>
          <span style={{ margin: "0 8px", color: "#555" }}>|</span>
          <span style={{ color: "#3b82f6", fontWeight: "bold" }}>
            B: {state.scores.b}
          </span>
        </div>
        <div style={{ color: "#888" }}>
          Round {state.roundNumber} | You:{" "}
          <span
            style={{
              color: myTeam === "a" ? "#f59e0b" : "#3b82f6",
              fontWeight: "bold",
            }}
          >
            Team {myTeam?.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Board ends indicator */}
      {state.boardEnds && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "20px",
            padding: "6px",
            backgroundColor: "#1a2a1a",
            borderRadius: "8px",
            marginBottom: "6px",
            fontSize: "0.75rem",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#888", marginBottom: "1px" }}>Left</div>
            <div
              style={{
                fontSize: "1.3rem",
                fontWeight: "bold",
                color: "#4ade80",
              }}
            >
              {state.boardEnds.left}
            </div>
          </div>
          <div style={{ color: "#555" }}>
            {state.board.length} tiles played
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#888", marginBottom: "1px" }}>Right</div>
            <div
              style={{
                fontSize: "1.3rem",
                fontWeight: "bold",
                color: "#4ade80",
              }}
            >
              {state.boardEnds.right}
            </div>
          </div>
        </div>
      )}

      {/* Turn indicator */}
      <div
        style={{
          textAlign: "center",
          padding: "6px",
          marginBottom: "6px",
          backgroundColor: isMyTurn ? "#1a3a1a" : "#2a2a2a",
          borderRadius: "8px",
          border: isMyTurn ? "1px solid #22c55e" : "1px solid #333",
          fontSize: "0.85rem",
        }}
      >
        {isMyTurn ? (
          <span style={{ color: "#22c55e", fontWeight: "bold" }}>
            Your turn!
          </span>
        ) : (
          <span style={{ color: "#888" }}>
            Waiting for {currentTurnName}
            {currentTurnIsBot ? " (Bot)" : ""}...
          </span>
        )}
      </div>

      {/* End selection (when tile matches both ends) */}
      {selectedTileId && selectedPlayability && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "8px",
            marginBottom: "6px",
          }}
        >
          {selectedPlayability.left && (
            <button
              onClick={() => handlePlayEnd("left")}
              style={{
                padding: "8px 16px",
                backgroundColor: "#22c55e",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Left ({state.boardEnds?.left})
            </button>
          )}
          {selectedPlayability.right && (
            <button
              onClick={() => handlePlayEnd("right")}
              style={{
                padding: "8px 16px",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Right ({state.boardEnds?.right})
            </button>
          )}
          <button
            onClick={() => setSelectedTileId(null)}
            style={{
              padding: "8px 12px",
              backgroundColor: "#444",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Pass button */}
      {mustPass && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px" }}>
          <button
            onClick={handlePass}
            style={{
              padding: "10px 24px",
              backgroundColor: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontWeight: "bold",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Pass (No playable tiles)
          </button>
        </div>
      )}

      {/* My hand */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", flexShrink: 0 }}>
        <div style={{ color: "#888", fontSize: "0.75rem", marginBottom: "2px", textAlign: "center" }}>
          Your hand ({myHand.length} tiles, {calculatePipCount(myHand)} pips)
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "4px",
            paddingBottom: "4px",
          }}
        >
          {myHand.map((tile) => (
            <TileView
              key={tile.id}
              tile={tile}
              selected={tile.id === selectedTileId}
              playable={isMyTurn && playableIds.has(tile.id)}
              onClick={() => handleTileSelect(tile)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Round End Screen ───────────────────────────────────────────────────────

function RoundEndScreen({
  state,
  sendAction,
}: {
  state: GameState;
  sendAction: (action: GameAction) => void;
}) {
  const result = state.lastRoundResult;
  if (!result) return null;

  const handleNewRound = () => {
    const tiles = shuffleTiles(generateAllTiles());
    sendAction({ type: "NEW_ROUND", payload: { shuffledTiles: tiles } });
  };

  const winnerName = result.winnerId
    ? getDisplayName(state, result.winnerId)
    : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        padding: "20px",
      }}
    >
      <h2 style={{ fontSize: "1.3rem", marginBottom: "4px" }}>
        Round {state.roundNumber} Complete
      </h2>

      <div
        style={{
          fontSize: "1.1rem",
          marginBottom: "16px",
          color:
            result.reason === "domino" ? "#22c55e" : "#f59e0b",
        }}
      >
        {result.reason === "domino"
          ? `Domino! ${winnerName} went out!`
          : "Tranque! (Blocked)"}
      </div>

      <div
        style={{
          backgroundColor: "#2a2a2a",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "20px",
          width: "100%",
          maxWidth: "280px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "8px",
            fontSize: "0.9rem",
          }}
        >
          <span style={{ color: "#888" }}>
            Team {result.winner.toUpperCase()} wins round
          </span>
          <span style={{ color: "#22c55e", fontWeight: "bold" }}>
            +{result.pointsAwarded} pts
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.85rem",
            color: "#888",
          }}
        >
          <span>Pips remaining: A={result.pipCounts.a} B={result.pipCounts.b}</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "32px",
          marginBottom: "24px",
          fontSize: "1.2rem",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#f59e0b", fontWeight: "bold" }}>Team A</div>
          <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{state.scores.a}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#3b82f6", fontWeight: "bold" }}>Team B</div>
          <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{state.scores.b}</div>
        </div>
      </div>

      <button
        onClick={handleNewRound}
        style={{
          padding: "14px 40px",
          backgroundColor: "#22c55e",
          color: "white",
          border: "none",
          borderRadius: "12px",
          fontSize: "1.1rem",
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        Next Round
      </button>
    </div>
  );
}

// ─── Game Over Screen ───────────────────────────────────────────────────────

function GameOverScreen({
  state,
  sendAction,
}: {
  state: GameState;
  sendAction: (action: GameAction) => void;
}) {
  const winner = state.scores.a >= state.targetScore ? "a" : "b";

  const handleReset = () => {
    sendAction({ type: "RESET_GAME" });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        padding: "20px",
      }}
    >
      <h1 style={{ fontSize: "1.8rem", marginBottom: "8px" }}>Game Over!</h1>
      <div
        style={{
          fontSize: "1.3rem",
          color: winner === "a" ? "#f59e0b" : "#3b82f6",
          fontWeight: "bold",
          marginBottom: "24px",
        }}
      >
        Team {winner.toUpperCase()} Wins!
      </div>

      <div style={{ display: "flex", gap: "32px", marginBottom: "32px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#f59e0b", fontWeight: "bold" }}>Team A</div>
          <div style={{ fontSize: "2.5rem", fontWeight: "bold" }}>
            {state.scores.a}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#3b82f6", fontWeight: "bold" }}>Team B</div>
          <div style={{ fontSize: "2.5rem", fontWeight: "bold" }}>
            {state.scores.b}
          </div>
        </div>
      </div>

      <div style={{ color: "#888", marginBottom: "24px" }}>
        {state.roundNumber} rounds played
      </div>

      <button
        onClick={handleReset}
        style={{
          padding: "14px 40px",
          backgroundColor: "#3b82f6",
          color: "white",
          border: "none",
          borderRadius: "12px",
          fontSize: "1.1rem",
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        New Game
      </button>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

export default function App() {
  const { state, sendAction: rawSendAction, status, playerId } = useGameClient<
    GameState,
    GameAction
  >({
    reducer: gameReducer,
    initialState,
    debug: true,
  });

  // Wrap sendAction to always inject playerId into actions.
  // @party-kit does NOT inject the sender's ID into actions,
  // so the reducer would see playerId as undefined and reject the action.
  const sendAction = (action: GameAction) => {
    rawSendAction({ ...action, playerId: playerId ?? undefined } as GameAction);
  };

  if (status !== "connected") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100dvh",
          backgroundColor: "#1a1a1a",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ marginBottom: "1rem", fontSize: "1.5rem" }}>Domino</h1>
        <div
          style={{
            fontSize: "0.9rem",
            color: status === "connecting" ? "#f59e0b" : "#ef4444",
          }}
        >
          {status === "connecting" ? "Connecting..." : `Status: ${status}`}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100dvh",
        backgroundColor: "#1a1a1a",
        color: "white",
        fontFamily: "system-ui, sans-serif",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {state.phase === "lobby" && (
        <LobbyScreen
          state={state}
          playerId={playerId}
          sendAction={sendAction}
        />
      )}
      {state.phase === "playing" && (
        <PlayingScreen
          state={state}
          playerId={playerId}
          sendAction={sendAction}
        />
      )}
      {state.phase === "round_end" && (
        <RoundEndScreen state={state} sendAction={sendAction} />
      )}
      {state.phase === "game_over" && (
        <GameOverScreen state={state} sendAction={sendAction} />
      )}
    </div>
  );
}
