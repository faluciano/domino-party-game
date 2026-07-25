// ─── Domino Tile (web) ──────────────────────────────────────────────────────
// Web port of the host's PipDots / DominoTileRN. Same pip geometry and sizing,
// React Native <View> swapped for <div>.

// Standard domino half-tile pip layouts. Positions are fractions of half-cell
// size — each entry is [x%, y%] within the half-tile area.
const PIP_POSITIONS: Record<number, [number, number][]> = {
  0: [],
  1: [[50, 50]],
  2: [
    [25, 25],
    [75, 75],
  ],
  3: [
    [25, 25],
    [50, 50],
    [75, 75],
  ],
  4: [
    [25, 25],
    [75, 25],
    [25, 75],
    [75, 75],
  ],
  5: [
    [25, 25],
    [75, 25],
    [50, 50],
    [25, 75],
    [75, 75],
  ],
  6: [
    [25, 20],
    [75, 20],
    [25, 50],
    [75, 50],
    [25, 80],
    [75, 80],
  ],
};

/**
 * Renders pip dots for a single half of a domino tile.
 * `size` is the pixel size of the half-tile square.
 */
export function PipDots({ value, size }: { value: number; size: number }) {
  const dotRadius = Math.max(2, Math.round(size * 0.1));
  const positions = PIP_POSITIONS[value] || [];

  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      {positions.map(([xPct, yPct], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: (xPct / 100) * size - dotRadius,
            top: (yPct / 100) * size - dotRadius,
            width: dotRadius * 2,
            height: dotRadius * 2,
            borderRadius: "50%",
            backgroundColor: "#1a1a1a",
          }}
        />
      ))}
    </div>
  );
}

/**
 * A single domino tile rendered with pip dots.
 * - Regular tiles: horizontal (two halves side by side, wider than tall)
 * - Doubles: vertical (two halves stacked, taller than wide)
 *
 * `halfSize` controls the pixel size of each half-tile square.
 */
export function DominoTile({
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
    <div
      style={{
        width: tileWidth,
        height: tileHeight,
        backgroundColor: highlight ? "#2a4a2a" : "#f5f0e1",
        borderRadius: 3,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: highlight ? "#4ade80" : "#bbb",
        display: "flex",
        flexDirection: isDouble ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <PipDots value={displayLeft} size={halfSize - 2} />
      {/* Divider line */}
      {isDouble ? (
        <div
          style={{ width: halfSize * 0.7, height: 1, backgroundColor: "#999" }}
        />
      ) : (
        <div
          style={{ width: 1, height: halfSize * 0.7, backgroundColor: "#999" }}
        />
      )}
      <PipDots value={displayRight} size={halfSize - 2} />
    </div>
  );
}
