import { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { GameHostProvider, useGameHost } from '@party-kit/host';
import QRCode from 'react-native-qrcode-svg';
import RNFS from 'react-native-fs';
import {
  gameReducer,
  initialState,
  GameState,
  GameAction,
  BoardTile,
  getDisplayName,
  getTeam,
  isBot,
  getPlayableTiles,
  canPlayTile,
} from '@my-game/shared';

// ─── Asset Extraction (Android) ─────────────────────────────────────────────

async function copyAssetsDirectory(assetDir: string, destDir: string): Promise<void> {
  const destExists = await RNFS.exists(destDir);
  if (!destExists) {
    await RNFS.mkdir(destDir);
  }

  const entries = await RNFS.readDirAssets(assetDir);

  for (const entry of entries) {
    const assetPath = assetDir ? `${assetDir}/${entry.name}` : entry.name;
    const destPath = `${destDir}/${entry.name}`;

    if (entry.isDirectory()) {
      await copyAssetsDirectory(assetPath, destPath);
    } else {
      await RNFS.copyFileAssets(assetPath, destPath);
    }
  }
}

function useExtractAssets() {
  const [staticDir, setStaticDir] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(Platform.OS === 'android');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const extract = async () => {
      try {
        const destDir = `${RNFS.DocumentDirectoryPath}/www`;
        const exists = await RNFS.exists(destDir);
        if (exists) {
          await RNFS.unlink(destDir);
        }

        const hasAssets = await RNFS.existsAssets('www');
        if (!hasAssets) {
          setError('No www assets found in APK. Run "bun run bundle:client" first.');
          setLoading(false);
          return;
        }

        await copyAssetsDirectory('www', destDir);
        setStaticDir(destDir);
        setLoading(false);
      } catch (e) {
        setError(`Failed to extract assets: ${(e as Error).message}`);
        setLoading(false);
      }
    };

    extract();
  }, []);

  return { staticDir, loading, error };
}

// ─── Pip Dot Positions ───────────────────────────────────────────────────────
// Standard domino half-tile pip layouts. Positions are fractions of half-cell size.
// Each position is [x%, y%] within the half-tile area.

const PIP_POSITIONS: Record<number, [number, number][]> = {
  0: [],
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 20], [75, 20], [25, 50], [75, 50], [25, 80], [75, 80]],
};

/**
 * Renders pip dots for a single half of a domino tile.
 * `size` is the pixel size of the half-tile square.
 */
function PipDots({ value, size }: { value: number; size: number }) {
  const dotRadius = Math.max(2, Math.round(size * 0.1));
  const positions = PIP_POSITIONS[value] || [];

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {positions.map(([xPct, yPct], i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: (xPct / 100) * size - dotRadius,
            top: (yPct / 100) * size - dotRadius,
            width: dotRadius * 2,
            height: dotRadius * 2,
            borderRadius: dotRadius,
            backgroundColor: '#1a1a1a',
          }}
        />
      ))}
    </View>
  );
}

/**
 * A single domino tile rendered with pip dots.
 * - Regular tiles: horizontal (two halves side by side, wider than tall)
 * - Doubles: vertical (two halves stacked, taller than wide)
 *
 * `halfSize` controls the pixel size of each half-tile square.
 */
function DominoTileRN({
  left,
  right,
  flipped,
  halfSize = 22,
  highlight,
}: {
  left: number;
  right: number;
  flipped?: boolean;
  halfSize?: number;
  highlight?: boolean;
}) {
  const displayLeft = flipped ? right : left;
  const displayRight = flipped ? left : right;
  const isDouble = displayLeft === displayRight;

  // Doubles are rendered vertically (taller), regulars are horizontal (wider)
  const tileWidth = isDouble ? halfSize : halfSize * 2;
  const tileHeight = isDouble ? halfSize * 2 : halfSize;

  return (
    <View
      style={{
        width: tileWidth,
        height: tileHeight,
        backgroundColor: highlight ? '#2a4a2a' : '#f5f0e1',
        borderRadius: 3,
        borderWidth: 1,
        borderColor: highlight ? '#4ade80' : '#bbb',
        flexDirection: isDouble ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <PipDots value={displayLeft} size={halfSize - 2} />
      {/* Divider line */}
      {isDouble ? (
        <View style={{ width: halfSize * 0.7, height: 1, backgroundColor: '#999' }} />
      ) : (
        <View style={{ width: 1, height: halfSize * 0.7, backgroundColor: '#999' }} />
      )}
      <PipDots value={displayRight} size={halfSize - 2} />
    </View>
  );
}

// ─── Spiral Chain Layout with 90° Corner Turns ─────────────────────────────

type Direction = 'right' | 'down' | 'left' | 'up';

interface PositionedTile {
  bt: BoardTile;
  x: number;
  y: number;
  index: number;
  /** Visual rotation in degrees applied to the tile component */
  rotation: 0 | 90 | -90 | 180;
}

/** Get the natural (unrotated) pixel dimensions of a tile. */
function getTileDimensions(bt: BoardTile, halfSize: number): { w: number; h: number } {
  const dL = bt.flipped ? bt.tile.right : bt.tile.left;
  const dR = bt.flipped ? bt.tile.left : bt.tile.right;
  const isDouble = dL === dR;
  return {
    w: isDouble ? halfSize : halfSize * 2,
    h: isDouble ? halfSize * 2 : halfSize,
  };
}

/**
 * Get tile dimensions accounting for rotation.
 * ±90° swaps w/h. 0° and 180° keep original dimensions.
 */
function getRotatedDimensions(bt: BoardTile, halfSize: number, rotation: 0 | 90 | -90 | 180): { w: number; h: number } {
  const dims = getTileDimensions(bt, halfSize);
  if (rotation === 90 || rotation === -90) return { w: dims.h, h: dims.w };
  return dims;
}

/**
 * Get the visual rotation for a tile based on its chain direction and which arm it belongs to.
 *
 * The rotation ensures the tile's connecting face (toward center) points in the correct direction:
 * - Right arm: connecting face = displayLeft (left face as rendered)
 * - Left arm: connecting face = displayRight (right face as rendered)
 *
 * Right arm rotations:
 *   right → 0°    (connecting left face points left, toward center)
 *   down  → 90°   (connecting left face points up, toward tile above)
 *   left  → 180°  (connecting left face points right, toward center)
 *   up    → -90°  (connecting left face points down, toward tile below)
 *
 * Left arm rotations:
 *   left  → 0°    (connecting right face points right, toward center)
 *   up    → 90°   (connecting right face points down, toward tile below)
 *   right → 180°  (connecting right face points left, toward center)
 *   down  → -90°  (connecting right face points up, toward tile above)
 */
function getRotation(dir: Direction, arm: 'right' | 'left'): 0 | 90 | -90 | 180 {
  if (arm === 'right') {
    switch (dir) {
      case 'right': return 0;
      case 'down': return 90;
      case 'left': return 180;
      case 'up': return -90;
    }
  } else {
    switch (dir) {
      case 'left': return 0;
      case 'up': return 90;
      case 'right': return 180;
      case 'down': return -90;
    }
  }
}

/**
 * Get the visual rotation for a CORNER tile based on the OLD direction
 * (before turning) and which arm it belongs to.
 *
 * Corner tiles are transitional: they bridge two directions. The connecting
 * face must be adjacent to the chain from the OLD direction, not the new one.
 *
 * Right arm corners (clockwise turns):
 *   right→down: connecting left face must point left (toward horizontal chain) → 90°
 *   down→left:  connecting left face must point up (toward vertical chain)    → 180°
 *   left→up:    connecting left face must point right (toward horizontal chain)→ -90°
 *   up→right:   connecting left face must point down (toward vertical chain)  → 0°
 *
 * Left arm corners (counter-clockwise turns):
 *   left→up:    connecting right face must point right (toward horizontal chain) → -90°
 *   up→right:   connecting right face must point down (toward vertical chain)    → 0°
 *   right→down: connecting right face must point left (toward horizontal chain)  → 90°
 *   down→left:  connecting right face must point up (toward vertical chain)      → 180°
 */
function getCornerRotation(oldDir: Direction, arm: 'right' | 'left'): 0 | 90 | -90 | 180 {
  if (arm === 'right') {
    switch (oldDir) {
      case 'right': return 90;    // right→down corner
      case 'down': return 180;    // down→left corner
      case 'left': return -90;    // left→up corner
      case 'up': return 0;        // up→right corner
    }
  } else {
    switch (oldDir) {
      case 'left': return -90;    // left→up corner
      case 'up': return 0;        // up→right corner
      case 'right': return 90;    // right→down corner
      case 'down': return 180;    // down→left corner
    }
  }
}

/** Clockwise turn sequence: right → down → left → up → right → ... */
function nextDirectionCW(dir: Direction): Direction {
  const seq: Direction[] = ['right', 'down', 'left', 'up'];
  return seq[(seq.indexOf(dir) + 1) % 4];
}

/** Counter-clockwise turn sequence: left → up → right → down → left → ... */
function nextDirectionCCW(dir: Direction): Direction {
  const seq: Direction[] = ['left', 'up', 'right', 'down'];
  return seq[(seq.indexOf(dir) + 1) % 4];
}

/**
 * Check if a tile at (x, y) with given dimensions exceeds the boundary
 * in the current direction.
 */
function hitsEdge(
  dir: Direction, x: number, y: number, w: number, h: number,
  boardWidth: number, boardHeight: number, margin: number,
): boolean {
  switch (dir) {
    case 'right': return x + w > boardWidth - margin;
    case 'left': return x < margin;
    case 'down': return y + h > boardHeight - margin;
    case 'up': return y < margin;
  }
}

/**
 * Lay out one arm of the domino chain using a spiral pattern with 90° corner turns.
 *
 * When a tile would exceed the boundary, it becomes a corner tile:
 * rotated to the new direction and placed at the cursor position (not snapped to edge).
 *
 * Right arm spirals clockwise:  right → down → left → up → ...
 * Left arm spirals counter-clockwise: left → up → right → down → ...
 */
function layoutArm(
  tiles: { bt: BoardTile; originalIndex: number }[],
  startX: number,
  startY: number,
  initialDir: Direction,
  arm: 'right' | 'left',
  turnFn: (dir: Direction) => Direction,
  boardWidth: number,
  boardHeight: number,
  halfSize: number,
  gap: number,
  margin: number,
): PositionedTile[] {
  const positioned: PositionedTile[] = [];
  if (tiles.length === 0) return positioned;

  let cursorX = startX;
  let cursorY = startY;
  let dir = initialDir;

  for (let i = 0; i < tiles.length; i++) {
    const { bt, originalIndex } = tiles[i];
    const rotation = getRotation(dir, arm);
    const { w: tileW, h: tileH } = getRotatedDimensions(bt, halfSize, rotation);

    // ── Compute the proposed position for this tile ──
    let x = cursorX;
    let y = cursorY;
    if (dir === 'left') {
      x = cursorX - tileW;
    } else if (dir === 'up') {
      y = cursorY - tileH;
    }
    // for 'right' and 'down', x/y = cursorX/cursorY (top-left corner)

    // ── Check if the tile hits the boundary ──
    if (hitsEdge(dir, x, y, tileW, tileH, boardWidth, boardHeight, margin)) {
      // This tile becomes a CORNER tile: turn to the next direction.
      // Place it at the cursor position (not snapped to edge) to avoid gaps.
      const newDir = turnFn(dir);
      const newRotation = getCornerRotation(dir, arm);
      const { w: cornerW, h: cornerH } = getRotatedDimensions(bt, halfSize, newRotation);

      // Position the corner tile relative to the cursor, aligned to the
      // previous direction's flow so it connects seamlessly.
      let cornerX = cursorX;
      let cornerY = cursorY;

      if (dir === 'right') {
        // Cursor is at the right edge of the last tile + gap.
        // Corner tile starts here, oriented for the new direction (down).
        cornerX = cursorX;
        cornerY = cursorY;
      } else if (dir === 'down') {
        // Cursor is below the last tile + gap.
        cornerX = cursorX;
        cornerY = cursorY;
      } else if (dir === 'left') {
        // Cursor is at the left edge of the last tile - gap.
        // Corner tile's right edge aligns with cursor.
        cornerX = cursorX - cornerW;
        cornerY = cursorY;
      } else if (dir === 'up') {
        // Cursor is above the last tile - gap.
        // Corner tile's bottom edge aligns with cursor.
        cornerX = cursorX;
        cornerY = cursorY - cornerH;
      }

      positioned.push({ bt, x: cornerX, y: cornerY, index: originalIndex, rotation: newRotation });

      // Advance cursor for the next tile in the new direction
      if (newDir === 'right') {
        cursorX = cornerX + cornerW + gap;
        cursorY = cornerY;
      } else if (newDir === 'down') {
        cursorX = cornerX;
        cursorY = cornerY + cornerH + gap;
      } else if (newDir === 'left') {
        cursorX = cornerX - gap;
        cursorY = cornerY;
      } else if (newDir === 'up') {
        cursorX = cornerX;
        cursorY = cornerY - gap;
      }

      dir = newDir;
    } else {
      // ── Normal placement ──
      positioned.push({ bt, x, y, index: originalIndex, rotation });

      // Advance cursor
      if (dir === 'right') {
        cursorX = x + tileW + gap;
      } else if (dir === 'down') {
        cursorY = y + tileH + gap;
      } else if (dir === 'left') {
        cursorX = x - gap;
      } else if (dir === 'up') {
        cursorY = y - gap;
      }
    }
  }

  return positioned;
}

/**
 * Compute a centered spiral chain layout for the domino board.
 *
 * - The center tile (first tile played) is placed at the horizontal centre,
 *   vertically centred in the board area.
 * - The RIGHT arm spirals clockwise: right → down → left → up → ...
 * - The LEFT arm spirals counter-clockwise: left → up → right → down → ...
 * - The board has a fixed viewport (no scrolling).
 */
function computeCenteredChainLayout(
  board: BoardTile[],
  centerIndex: number,
  boardWidth: number,
  boardHeight: number,
  halfSize: number,
  gap: number,
): { tiles: PositionedTile[] } {
  if (board.length === 0) return { tiles: [] };

  const margin = 8;
  const safeCenter = Math.max(0, Math.min(centerIndex, board.length - 1));

  // ── Center tile ──
  const centerBt = board[safeCenter];
  const centerDims = getTileDimensions(centerBt, halfSize);
  const centerX = Math.round(boardWidth / 2 - centerDims.w / 2);
  const centerY = Math.round(boardHeight / 2 - centerDims.h / 2);

  const centerTile: PositionedTile = {
    bt: centerBt,
    x: centerX,
    y: centerY,
    index: safeCenter,
    rotation: 0,
  };

  // ── Right arm: tiles safeCenter+1 → end, spiraling clockwise ──
  const rightTiles: { bt: BoardTile; originalIndex: number }[] = [];
  for (let i = safeCenter + 1; i < board.length; i++) {
    rightTiles.push({ bt: board[i], originalIndex: i });
  }

  const rightStartX = centerX + centerDims.w + gap;
  const rightArm = layoutArm(
    rightTiles, rightStartX, centerY,
    'right', 'right', nextDirectionCW,
    boardWidth, boardHeight, halfSize, gap, margin,
  );

  // ── Left arm: tiles safeCenter-1 → 0, spiraling counter-clockwise ──
  const leftTiles: { bt: BoardTile; originalIndex: number }[] = [];
  for (let i = safeCenter - 1; i >= 0; i--) {
    leftTiles.push({ bt: board[i], originalIndex: i });
  }

  // Left arm cursor: starts to the left of the center tile
  const leftStartX = centerX - gap;
  const leftArm = layoutArm(
    leftTiles, leftStartX, centerY,
    'left', 'left', nextDirectionCCW,
    boardWidth, boardHeight, halfSize, gap, margin,
  );

  return { tiles: [...leftArm, centerTile, ...rightArm] };
}

// ─── Board Display Component ────────────────────────────────────────────────

const HALF_SIZE = 22;
const TILE_GAP = 3;

function BoardDisplay({ board, centerIndex, currentTurnName }: { board: BoardTile[]; centerIndex: number; currentTurnName: string }) {
  const [boardWidth, setBoardWidth] = useState(0);
  const [boardHeight, setBoardHeight] = useState(0);

  const layout = useMemo(() => {
    if (boardWidth === 0 || boardHeight === 0 || board.length === 0) return null;
    return computeCenteredChainLayout(board, centerIndex, boardWidth, boardHeight, HALF_SIZE, TILE_GAP);
  }, [board, centerIndex, boardWidth, boardHeight]);

  return (
    <View
      style={{ flex: 1, alignSelf: 'stretch' }}
      onLayout={(e) => {
        setBoardWidth(e.nativeEvent.layout.width);
        setBoardHeight(e.nativeEvent.layout.height);
      }}
    >
      {board.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#555', fontSize: 18 }}>
            {currentTurnName} plays first...
          </Text>
        </View>
      ) : layout ? (
        <View style={{ flex: 1, width: '100%', position: 'relative' }}>
          {layout.tiles.map((pt) => {
            const naturalDims = getTileDimensions(pt.bt, HALF_SIZE);
            const rotatedDims = getRotatedDimensions(pt.bt, HALF_SIZE, pt.rotation);

            return (
              <View
                key={pt.index}
                style={{
                  position: 'absolute',
                  left: pt.x,
                  top: pt.y,
                  width: rotatedDims.w,
                  height: rotatedDims.h,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {pt.rotation === 0 ? (
                  <DominoTileRN
                    left={pt.bt.tile.left}
                    right={pt.bt.tile.right}
                    flipped={pt.bt.flipped}
                    halfSize={HALF_SIZE}
                  />
                ) : (
                  <View style={{
                    width: naturalDims.w,
                    height: naturalDims.h,
                    transform: [{ rotate: `${pt.rotation}deg` }],
                  }}>
                    <DominoTileRN
                      left={pt.bt.tile.left}
                      right={pt.bt.tile.right}
                      flipped={pt.bt.flipped}
                      halfSize={HALF_SIZE}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ─── Game Screen ────────────────────────────────────────────────────────────

const GameScreen = () => {
  const { state, dispatch, serverUrl, serverError } = useGameHost<GameState, GameAction>();
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clientUrl = serverUrl ? `${serverUrl}/index` : null;

  // ── Bot turn logic ──────────────────────────────────────────────────────
  useEffect(() => {
    if (state.phase !== 'playing' || !state.currentTurn) return;
    if (!isBot(state, state.currentTurn)) return;

    // Clear any existing timer
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
          const mula = botHand.find((t) => t.id === '6-6');
          if (mula) tile = mula;
        }

        const playability = canPlayTile(tile, state.boardEnds);

        let end: 'left' | 'right';
        if (!state.boardEnds) {
          end = 'left';
        } else if (playability.left && !playability.right) {
          end = 'left';
        } else if (!playability.left && playability.right) {
          end = 'right';
        } else {
          // Both ends work, pick left
          end = 'left';
        }

        dispatch({
          type: 'PLAY_TILE',
          payload: { tileId: tile.id, end },
          playerId: botId,
        });
      } else {
        // Bot must pass
        dispatch({
          type: 'PASS',
          playerId: botId,
        });
      }
    }, 600);

    return () => {
      if (botTimerRef.current) {
        clearTimeout(botTimerRef.current);
      }
    };
  }, [state.currentTurn, state.phase]);

  if (serverError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Server Error: {serverError.message}</Text>
      </View>
    );
  }

  // ── Lobby Phase ─────────────────────────────────────────────────────────
  if (state.phase === 'lobby') {
    const connectedHumans = Object.values(state.players).filter((p) => p.connected).length;

    const renderTeamColumn = (team: 'a' | 'b', color: string) => {
      const members = state.teams[team];
      return (
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color, marginBottom: 12 }}>
            Team {team.toUpperCase()}
          </Text>
          {[0, 1].map((i) => {
            const memberId = members[i];
            if (memberId) {
              const name = getDisplayName(state, memberId);
              const botPlayer = isBot(state, memberId);
              return (
                <View
                  key={i}
                  style={{
                    backgroundColor: '#2a2a2a',
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    borderRadius: 8,
                    marginBottom: 8,
                    minWidth: 160,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#444',
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 18 }}>
                    {name} {botPlayer ? '(Bot)' : ''}
                  </Text>
                </View>
              );
            }
            return (
              <View
                key={i}
                style={{
                  backgroundColor: '#1a1a1a',
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 8,
                  marginBottom: 8,
                  minWidth: 160,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#333',
                  borderStyle: 'dashed',
                }}
              >
                <Text style={{ color: '#555', fontSize: 16 }}>Empty (bot)</Text>
              </View>
            );
          })}
        </View>
      );
    };

    return (
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Left: Game info and teams */}
          <View style={styles.leftPanel}>
            <Text style={styles.title}>Domino</Text>
            <Text style={{ fontSize: 18, color: '#888', marginBottom: 24 }}>
              {connectedHumans}/4 players connected
            </Text>

            <View style={{ flexDirection: 'row', width: '100%', paddingHorizontal: 40 }}>
              {renderTeamColumn('a', '#f59e0b')}
              <View style={{ width: 20 }} />
              {renderTeamColumn('b', '#3b82f6')}
            </View>

            {connectedHumans >= 1 && (
              <Text style={{ fontSize: 16, color: '#4ade80', marginTop: 24 }}>
                Ready! A player can start the game from their phone.
              </Text>
            )}
          </View>

          {/* Right: QR code */}
          <View style={styles.rightPanel}>
            <Text style={styles.subtitle}>Scan to Join</Text>
            <View style={styles.qrContainer}>
              <QRCode
                value={clientUrl || 'waiting...'}
                size={160}
                color="black"
                backgroundColor="white"
              />
            </View>
            <Text style={styles.urlText}>{clientUrl || 'Starting server...'}</Text>
          </View>
        </View>
      </View>
    );
  }

  // ── Playing Phase ───────────────────────────────────────────────────────
  if (state.phase === 'playing') {
    const currentTurnName = state.currentTurn ? getDisplayName(state, state.currentTurn) : '';
    const currentTurnIsBot = state.currentTurn ? isBot(state, state.currentTurn) : false;

    // Seat display order: 0, 1, 2, 3
    const seatToPlayer: Record<number, string> = {};
    for (const [id, seat] of Object.entries(state.seats)) {
      seatToPlayer[seat] = id;
    }

    return (
      <View style={styles.container}>
        {/* Top bar: scores */}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 8,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#f59e0b' }}>
              Team A: {state.scores.a}
            </Text>
            <Text style={{ fontSize: 18, color: '#555', marginHorizontal: 16 }}>|</Text>
            <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#3b82f6' }}>
              Team B: {state.scores.b}
            </Text>
          </View>
          <Text style={{ fontSize: 16, color: '#888' }}>
            Round {state.roundNumber} | Target: {state.targetScore}
          </Text>
        </View>

        {/* Main area */}
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Left: Player info */}
          <View style={{ width: 180, paddingHorizontal: 12, justifyContent: 'center' }}>
            {[0, 1, 2, 3].map((seat) => {
              const pid = seatToPlayer[seat];
              if (!pid) return null;
              const name = getDisplayName(state, pid);
              const team = getTeam(state, pid);
              const isCurrent = pid === state.currentTurn;
              const handSize = state.hands[pid]?.length ?? 0;
              const botPlayer = isBot(state, pid);

              return (
                <View
                  key={seat}
                  style={{
                    backgroundColor: isCurrent ? '#1a3a1a' : '#222',
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 6,
                    borderWidth: isCurrent ? 2 : 1,
                    borderColor: isCurrent ? '#22c55e' : '#333',
                  }}
                >
                  <Text style={{
                    color: team === 'a' ? '#f59e0b' : '#3b82f6',
                    fontWeight: 'bold',
                    fontSize: 14,
                  }}>
                    {name} {botPlayer ? '(Bot)' : ''}
                  </Text>
                  <Text style={{ color: '#888', fontSize: 12 }}>
                    {handSize} tiles {isCurrent ? ' << TURN' : ''}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Center: Board + Turn Indicator */}
          <View style={{ flex: 1 }}>
            <BoardDisplay board={state.board} centerIndex={state.centerIndex} currentTurnName={currentTurnName} />

            {/* Turn indicator */}
            <View style={{
              marginTop: 8,
              paddingHorizontal: 20,
              paddingVertical: 8,
              backgroundColor: '#1a3a1a',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: '#22c55e',
              alignSelf: 'center',
            }}>
              <Text style={{ color: '#22c55e', fontSize: 16, fontWeight: 'bold' }}>
                {currentTurnName}{currentTurnIsBot ? ' (Bot)' : ''}'s turn
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ── Round End Phase ─────────────────────────────────────────────────────
  if (state.phase === 'round_end' && state.lastRoundResult) {
    const result = state.lastRoundResult;
    const winnerName = result.winnerId ? getDisplayName(state, result.winnerId) : null;

    return (
      <View style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 36, fontWeight: 'bold', color: 'white', marginBottom: 12 }}>
            Round {state.roundNumber} Complete
          </Text>

          <Text style={{
            fontSize: 24,
            color: result.reason === 'domino' ? '#22c55e' : '#f59e0b',
            marginBottom: 24,
          }}>
            {result.reason === 'domino'
              ? `Domino! ${winnerName} went out!`
              : 'Tranque! (Blocked)'}
          </Text>

          <Text style={{
            fontSize: 20,
            color: result.winner === 'a' ? '#f59e0b' : '#3b82f6',
            fontWeight: 'bold',
            marginBottom: 8,
          }}>
            Team {result.winner.toUpperCase()} wins +{result.pointsAwarded} points
          </Text>

          <Text style={{ fontSize: 16, color: '#888', marginBottom: 32 }}>
            Pips remaining: Team A = {result.pipCounts.a}, Team B = {result.pipCounts.b}
          </Text>

          <View style={{ flexDirection: 'row', gap: 60 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#f59e0b' }}>Team A</Text>
              <Text style={{ fontSize: 48, fontWeight: 'bold', color: 'white' }}>{state.scores.a}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#3b82f6' }}>Team B</Text>
              <Text style={{ fontSize: 48, fontWeight: 'bold', color: 'white' }}>{state.scores.b}</Text>
            </View>
          </View>

          <Text style={{ fontSize: 16, color: '#4ade80', marginTop: 32 }}>
            Waiting for a player to start next round...
          </Text>
        </View>
      </View>
    );
  }

  // ── Game Over Phase ─────────────────────────────────────────────────────
  if (state.phase === 'game_over') {
    const winner = state.scores.a >= state.targetScore ? 'a' : 'b';

    return (
      <View style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 48, fontWeight: 'bold', color: 'white', marginBottom: 16 }}>
            Game Over!
          </Text>

          <Text style={{
            fontSize: 32,
            fontWeight: 'bold',
            color: winner === 'a' ? '#f59e0b' : '#3b82f6',
            marginBottom: 32,
          }}>
            Team {winner.toUpperCase()} Wins!
          </Text>

          <View style={{ flexDirection: 'row', gap: 80 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#f59e0b' }}>Team A</Text>
              <Text style={{ fontSize: 64, fontWeight: 'bold', color: 'white' }}>{state.scores.a}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#3b82f6' }}>Team B</Text>
              <Text style={{ fontSize: 64, fontWeight: 'bold', color: 'white' }}>{state.scores.b}</Text>
            </View>
          </View>

          <Text style={{ fontSize: 18, color: '#888', marginTop: 32 }}>
            {state.roundNumber} rounds played
          </Text>

          <Text style={{ fontSize: 16, color: '#4ade80', marginTop: 16 }}>
            A player can start a new game from their phone.
          </Text>
        </View>
      </View>
    );
  }

  // Fallback
  return (
    <View style={styles.container}>
      <Text style={{ color: 'white', fontSize: 18 }}>Loading...</Text>
    </View>
  );
};

// ─── Root App ───────────────────────────────────────────────────────────────

export default function App() {
  const { staticDir, loading, error } = useExtractAssets();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4ade80" />
        <Text style={styles.loadingText}>Preparing game assets...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <GameHostProvider config={{ reducer: gameReducer, initialState, staticDir, debug: true }}>
      <GameScreen />
    </GameHostProvider>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    padding: 20,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  leftPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightPanel: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 40,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 20,
    color: '#aaaaaa',
    marginBottom: 12,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 16,
  },
  urlText: {
    fontSize: 14,
    color: '#888888',
    marginTop: 12,
  },
  loadingText: {
    fontSize: 20,
    color: '#aaaaaa',
    marginTop: 20,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#ef4444',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
