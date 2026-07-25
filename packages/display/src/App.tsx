// ─── Domino Browser Display ─────────────────────────────────────────────────
// Web port of the Android TV host (packages/host/App.tsx). Owns the game
// runtime via RelayDisplayHost and renders the shared "god view": lobby with a
// join QR, the spiral board while playing, and the round-end / game-over
// summaries. Phones join from any network with the room code.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import QRCode from "react-qr-code";
import { RelayDisplayHost } from "@couch-kit/display";
import {
  gameReducer,
  initialState,
  getDisplayName,
  getTeam,
  isBot,
  type GameAction,
  type GameState,
} from "@my-game/shared";
import { BoardDisplay } from "./components/BoardDisplay";
import { useBotTurns } from "./use-bot-turns";

const RELAY_URL =
  import.meta.env.VITE_RELAY_URL ??
  "wss://couch-kit-relay.icycliff-4c194e2e.eastus.azurecontainerapps.io";

/** Base URL of the deployed controller. The join link appends `?room=CODE`. */
const CONTROLLER_URL = import.meta.env.VITE_CONTROLLER_URL ?? "";

const TEAM_A_COLOR = "#f59e0b";
const TEAM_B_COLOR = "#3b82f6";

/** Unambiguous room code (no easily-confused characters). */
function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 4 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

export default function App() {
  const [{ display, roomId }] = useState(() => {
    const roomId = makeRoomCode();
    const display = new RelayDisplayHost<GameState, GameAction>({
      url: RELAY_URL,
      roomId,
      reducer: gameReducer,
      initialState,
    });
    return { display, roomId };
  });

  useEffect(() => () => display.stop(), [display]);

  const state = useSyncExternalStore(display.subscribe, display.getState);

  // The display owns the runtime, so it drives the bot seats.
  useBotTurns(state, display.dispatch);

  const joinUrl = useMemo(
    () =>
      CONTROLLER_URL
        ? `${CONTROLLER_URL}${CONTROLLER_URL.includes("?") ? "&" : "?"}room=${roomId}`
        : null,
    [roomId],
  );

  return (
    <div style={styles.container}>
      {state.phase === "lobby" && (
        <LobbyView state={state} joinUrl={joinUrl} roomId={roomId} />
      )}
      {state.phase === "playing" && <PlayingView state={state} />}
      {state.phase === "round_end" && <RoundEndView state={state} />}
      {state.phase === "game_over" && <GameOverView state={state} />}
    </div>
  );
}

// ─── Lobby ──────────────────────────────────────────────────────────────────

function LobbyView({
  state,
  joinUrl,
  roomId,
}: {
  state: GameState;
  joinUrl: string | null;
  roomId: string;
}) {
  const connectedHumans = Object.values(state.players).filter(
    (p) => p.connected,
  ).length;

  return (
    <div style={styles.content}>
      {/* Left: Game info and teams */}
      <div style={styles.leftPanel}>
        <h1 style={styles.title}>Domino</h1>
        <div style={{ fontSize: 18, color: "#888", marginBottom: 24 }}>
          {connectedHumans}/4 players connected
        </div>

        <div style={{ display: "flex", width: "100%", padding: "0 40px" }}>
          <TeamColumn state={state} team="a" color={TEAM_A_COLOR} />
          <div style={{ width: 20 }} />
          <TeamColumn state={state} team="b" color={TEAM_B_COLOR} />
        </div>

        {connectedHumans >= 1 && (
          <div style={{ fontSize: 16, color: "#4ade80", marginTop: 24 }}>
            Ready! A player can start the game from their phone.
          </div>
        )}
      </div>

      {/* Right: join QR + room code */}
      <div style={styles.rightPanel}>
        <div style={styles.subtitle}>Scan to Join</div>
        <div style={styles.qrContainer}>
          {joinUrl ? (
            <QRCode value={joinUrl} size={160} />
          ) : (
            <div style={{ width: 160, color: "#333", fontSize: 13 }}>
              Set VITE_CONTROLLER_URL to show a join QR
            </div>
          )}
        </div>
        <div style={styles.roomLabel}>ROOM CODE</div>
        <div style={styles.roomCode}>{roomId}</div>
        {joinUrl && <div style={styles.urlText}>{joinUrl}</div>}
      </div>
    </div>
  );
}

function TeamColumn({
  state,
  team,
  color,
}: {
  state: GameState;
  team: "a" | "b";
  color: string;
}) {
  const members = state.teams[team];

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{ fontSize: 24, fontWeight: "bold", color, marginBottom: 12 }}
      >
        Team {team.toUpperCase()}
      </div>
      {[0, 1].map((i) => {
        const memberId = members[i];
        if (memberId) {
          return (
            <div key={i} style={styles.seatFilled}>
              <span style={{ color: "white", fontSize: 18 }}>
                {getDisplayName(state, memberId)}{" "}
                {isBot(state, memberId) ? "(Bot)" : ""}
              </span>
            </div>
          );
        }
        return (
          <div key={i} style={styles.seatEmpty}>
            <span style={{ color: "#555", fontSize: 16 }}>Empty (bot)</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Playing ────────────────────────────────────────────────────────────────

function PlayingView({ state }: { state: GameState }) {
  const currentTurnName = state.currentTurn
    ? getDisplayName(state, state.currentTurn)
    : "";
  const currentTurnIsBot = state.currentTurn
    ? isBot(state, state.currentTurn)
    : false;

  // Seat display order: 0, 1, 2, 3
  const seatToPlayer: Record<number, string> = {};
  for (const [id, seat] of Object.entries(state.seats)) {
    seatToPlayer[seat] = id;
  }

  return (
    <>
      {/* Top bar: scores */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <span
            style={{ fontSize: 22, fontWeight: "bold", color: TEAM_A_COLOR }}
          >
            Team A: {state.scores.a}
          </span>
          <span style={{ fontSize: 18, color: "#555", margin: "0 16px" }}>
            |
          </span>
          <span
            style={{ fontSize: 22, fontWeight: "bold", color: TEAM_B_COLOR }}
          >
            Team B: {state.scores.b}
          </span>
        </div>
        <span style={{ fontSize: 16, color: "#888" }}>
          Round {state.roundNumber} | Target: {state.targetScore}
        </span>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left: Player info */}
        <div
          style={{
            width: 180,
            padding: "0 12px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flexShrink: 0,
            boxSizing: "border-box",
          }}
        >
          {[0, 1, 2, 3].map((seat) => {
            const pid = seatToPlayer[seat];
            if (!pid) return null;
            const name = getDisplayName(state, pid);
            const team = getTeam(state, pid);
            const isCurrent = pid === state.currentTurn;
            const handSize = state.hands[pid]?.length ?? 0;

            return (
              <div
                key={seat}
                style={{
                  backgroundColor: isCurrent ? "#1a3a1a" : "#222",
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 6,
                  borderWidth: isCurrent ? 2 : 1,
                  borderStyle: "solid",
                  borderColor: isCurrent ? "#22c55e" : "#333",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    color: team === "a" ? TEAM_A_COLOR : TEAM_B_COLOR,
                    fontWeight: "bold",
                    fontSize: 14,
                  }}
                >
                  {name} {isBot(state, pid) ? "(Bot)" : ""}
                </div>
                <div style={{ color: "#888", fontSize: 12 }}>
                  {handSize} tiles {isCurrent ? " << TURN" : ""}
                </div>
              </div>
            );
          })}
        </div>

        {/* Center: Board + turn indicator */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <BoardDisplay
            board={state.board}
            centerIndex={state.centerIndex}
            currentTurnName={currentTurnName}
          />

          <div style={styles.turnIndicator}>
            <span
              style={{ color: "#22c55e", fontSize: 16, fontWeight: "bold" }}
            >
              {currentTurnName}
              {currentTurnIsBot ? " (Bot)" : ""}'s turn
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Round End ──────────────────────────────────────────────────────────────

function RoundEndView({ state }: { state: GameState }) {
  const result = state.lastRoundResult;
  if (!result) return <div style={styles.centered}>Loading...</div>;

  const winnerName = result.winnerId
    ? getDisplayName(state, result.winnerId)
    : null;

  return (
    <div style={styles.centered}>
      <div
        style={{
          fontSize: 36,
          fontWeight: "bold",
          color: "white",
          marginBottom: 12,
        }}
      >
        Round {state.roundNumber} Complete
      </div>

      <div
        style={{
          fontSize: 24,
          color: result.reason === "domino" ? "#22c55e" : TEAM_A_COLOR,
          marginBottom: 24,
        }}
      >
        {result.reason === "domino"
          ? `Domino! ${winnerName} went out!`
          : "Tranque! (Blocked)"}
      </div>

      <div
        style={{
          fontSize: 20,
          color: result.winner === "a" ? TEAM_A_COLOR : TEAM_B_COLOR,
          fontWeight: "bold",
          marginBottom: 8,
        }}
      >
        Team {result.winner.toUpperCase()} wins +{result.pointsAwarded} points
      </div>

      <div style={{ fontSize: 16, color: "#888", marginBottom: 32 }}>
        Pips remaining: Team A = {result.pipCounts.a}, Team B ={" "}
        {result.pipCounts.b}
      </div>

      <ScorePair scores={state.scores} valueSize={48} labelSize={22} gap={60} />

      <div style={{ fontSize: 16, color: "#4ade80", marginTop: 32 }}>
        Waiting for a player to start next round...
      </div>
    </div>
  );
}

// ─── Game Over ──────────────────────────────────────────────────────────────

function GameOverView({ state }: { state: GameState }) {
  const winner = state.scores.a >= state.targetScore ? "a" : "b";

  return (
    <div style={styles.centered}>
      <div
        style={{
          fontSize: 48,
          fontWeight: "bold",
          color: "white",
          marginBottom: 16,
        }}
      >
        Game Over!
      </div>

      <div
        style={{
          fontSize: 32,
          fontWeight: "bold",
          color: winner === "a" ? TEAM_A_COLOR : TEAM_B_COLOR,
          marginBottom: 32,
        }}
      >
        Team {winner.toUpperCase()} Wins!
      </div>

      <ScorePair scores={state.scores} valueSize={64} labelSize={24} gap={80} />

      <div style={{ fontSize: 18, color: "#888", marginTop: 32 }}>
        {state.roundNumber} rounds played
      </div>

      <div style={{ fontSize: 16, color: "#4ade80", marginTop: 16 }}>
        A player can start a new game from their phone.
      </div>
    </div>
  );
}

function ScorePair({
  scores,
  valueSize,
  labelSize,
  gap,
}: {
  scores: { a: number; b: number };
  valueSize: number;
  labelSize: number;
  gap: number;
}) {
  return (
    <div style={{ display: "flex", gap }}>
      {(["a", "b"] as const).map((team) => (
        <div
          key={team}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: labelSize,
              fontWeight: "bold",
              color: team === "a" ? TEAM_A_COLOR : TEAM_B_COLOR,
            }}
          >
            Team {team.toUpperCase()}
          </div>
          <div
            style={{ fontSize: valueSize, fontWeight: "bold", color: "white" }}
          >
            {scores[team]}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    backgroundColor: "#1a1a1a",
    color: "white",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    padding: 20,
    boxSizing: "border-box",
    overflow: "hidden",
  },
  content: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    minHeight: 0,
  },
  leftPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  rightPanel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 40,
  },
  title: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#ffffff",
    margin: "0 0 8px",
  },
  subtitle: {
    fontSize: 20,
    color: "#aaaaaa",
    marginBottom: 12,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: "white",
    borderRadius: 16,
    lineHeight: 0,
  },
  roomLabel: {
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: 2,
    color: "#888888",
    marginTop: 16,
  },
  roomCode: {
    fontSize: 44,
    fontWeight: 800,
    letterSpacing: "0.3em",
    textIndent: "0.3em",
    color: "#ffffff",
    lineHeight: 1.1,
  },
  urlText: {
    fontSize: 14,
    color: "#888888",
    marginTop: 12,
  },
  seatFilled: {
    backgroundColor: "#2a2a2a",
    padding: "10px 20px",
    borderRadius: 8,
    marginBottom: 8,
    minWidth: 160,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#444",
    boxSizing: "border-box",
  },
  seatEmpty: {
    backgroundColor: "#1a1a1a",
    padding: "10px 20px",
    borderRadius: 8,
    marginBottom: 8,
    minWidth: 160,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#333",
    boxSizing: "border-box",
  },
  turnIndicator: {
    marginTop: 8,
    padding: "8px 20px",
    backgroundColor: "#1a3a1a",
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#22c55e",
    alignSelf: "center",
    flexShrink: 0,
  },
  centered: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 0,
  },
} satisfies Record<string, React.CSSProperties>;
