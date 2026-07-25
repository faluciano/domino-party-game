// ─── Spiral Chain Layout (shared with the Android TV host) ─────────────────
// Copied verbatim from packages/host/App.tsx lines 155-540: this is pure
// geometry with no React Native dependency, so the web display lays the board
// out exactly like the TV does.

import type { BoardTile } from "@my-game/shared";

// ─── Spiral Chain Layout with 90° Corner Turns ─────────────────────────────

export type Direction = "right" | "down" | "left" | "up";

export interface PositionedTile {
  bt: BoardTile;
  x: number;
  y: number;
  index: number;
  /** Visual rotation in degrees applied to the tile component */
  rotation: 0 | 90 | -90 | 180;
}

/** Get the natural (unrotated) pixel dimensions of a tile. */
export function getTileDimensions(
  bt: BoardTile,
  halfSize: number,
): { w: number; h: number } {
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
export function getRotatedDimensions(
  bt: BoardTile,
  halfSize: number,
  rotation: 0 | 90 | -90 | 180,
): { w: number; h: number } {
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
function getRotation(
  dir: Direction,
  arm: "right" | "left",
): 0 | 90 | -90 | 180 {
  if (arm === "right") {
    switch (dir) {
      case "right":
        return 0;
      case "down":
        return 90;
      case "left":
        return 180;
      case "up":
        return -90;
    }
  } else {
    switch (dir) {
      case "left":
        return 0;
      case "up":
        return 90;
      case "right":
        return 180;
      case "down":
        return -90;
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
 * Right arm corners (connecting face = displayLeft, first half):
 *   right→down: 90°    left→up:  -90°
 *   down→left:  180°   up→right: 0°
 *
 * Left arm corners (connecting face = displayRight, second half):
 *   Values are shifted 180° from right arm so the second half aligns instead.
 *   left→up:    90°    right→down: -90°
 *   up→right:   180°   down→left:  0°
 */
function getCornerRotation(
  oldDir: Direction,
  arm: "right" | "left",
): 0 | 90 | -90 | 180 {
  if (arm === "right") {
    switch (oldDir) {
      case "right":
        return 90; // right→down corner
      case "down":
        return 180; // down→left corner
      case "left":
        return -90; // left→up corner
      case "up":
        return 0; // up→right corner
    }
  } else {
    switch (oldDir) {
      case "left":
        return 90; // left→up corner
      case "up":
        return 180; // up→right corner
      case "right":
        return -90; // right→down corner
      case "down":
        return 0; // down→left corner
    }
  }
}

/** Clockwise turn sequence: right → down → left → up → right → ... */
function nextDirectionCW(dir: Direction): Direction {
  const seq: Direction[] = ["right", "down", "left", "up"];
  return seq[(seq.indexOf(dir) + 1) % 4];
}

/** Counter-clockwise turn sequence: left → up → right → down → left → ... */
function nextDirectionCCW(dir: Direction): Direction {
  const seq: Direction[] = ["left", "up", "right", "down"];
  return seq[(seq.indexOf(dir) + 1) % 4];
}

/**
 * Check if a tile at (x, y) with given dimensions exceeds the boundary
 * in the current direction.
 */
function hitsEdge(
  dir: Direction,
  x: number,
  y: number,
  w: number,
  h: number,
  boardWidth: number,
  boardHeight: number,
  margin: number,
): boolean {
  switch (dir) {
    case "right":
      return x + w > boardWidth - margin;
    case "left":
      return x < margin;
    case "down":
      return y + h > boardHeight - margin;
    case "up":
      return y < margin;
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
  arm: "right" | "left",
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
    if (dir === "left") {
      x = cursorX - tileW;
    } else if (dir === "up") {
      y = cursorY - tileH;
    }
    // for 'right' and 'down', x/y = cursorX/cursorY (top-left corner)

    // ── Check if the tile hits the boundary ──
    if (hitsEdge(dir, x, y, tileW, tileH, boardWidth, boardHeight, margin)) {
      // This tile becomes a CORNER tile: turn to the next direction.
      // Place it at the cursor position (not snapped to edge) to avoid gaps.
      const newDir = turnFn(dir);
      const newRotation = getCornerRotation(dir, arm);
      const { w: cornerW, h: cornerH } = getRotatedDimensions(
        bt,
        halfSize,
        newRotation,
      );

      // Position the corner tile relative to the cursor, aligned so its
      // connecting face meets the chain from the old direction.
      //
      // Right arm connecting face = displayLeft (first half of tile).
      // Left arm connecting face = displayRight (second half of tile).
      //
      // Because the two arms use different halves as the connecting face,
      // the left arm's corner tiles need a cross-axis offset so that the
      // second half (rather than the first) lines up with the preceding
      // straight tiles.  The offset equals (halfSize - cornerDimension)
      // in the axis perpendicular to the old direction.
      const crossOffset =
        arm === "left"
          ? halfSize - (dir === "right" || dir === "left" ? cornerH : cornerW)
          : 0;

      let cornerX = cursorX;
      let cornerY = cursorY;

      if (dir === "right") {
        cornerX = cursorX;
        cornerY = cursorY + crossOffset;
      } else if (dir === "down") {
        cornerX = cursorX + crossOffset;
        cornerY = cursorY;
      } else if (dir === "left") {
        cornerX = cursorX - cornerW;
        cornerY = cursorY + crossOffset;
      } else if (dir === "up") {
        cornerX = cursorX + crossOffset;
        cornerY = cursorY - cornerH;
      }

      positioned.push({
        bt,
        x: cornerX,
        y: cornerY,
        index: originalIndex,
        rotation: newRotation,
      });

      // Advance cursor for the next tile in the new direction
      if (newDir === "right") {
        cursorX = cornerX + cornerW + gap;
        cursorY = cornerY;
      } else if (newDir === "down") {
        cursorX = cornerX;
        cursorY = cornerY + cornerH + gap;
      } else if (newDir === "left") {
        cursorX = cornerX - gap;
        cursorY = cornerY;
      } else if (newDir === "up") {
        cursorX = cornerX;
        cursorY = cornerY - gap;
      }

      dir = newDir;
    } else {
      // ── Normal placement ──
      positioned.push({ bt, x, y, index: originalIndex, rotation });

      // Advance cursor
      if (dir === "right") {
        cursorX = x + tileW + gap;
      } else if (dir === "down") {
        cursorY = y + tileH + gap;
      } else if (dir === "left") {
        cursorX = x - gap;
      } else if (dir === "up") {
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
export function computeCenteredChainLayout(
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
    rightTiles,
    rightStartX,
    centerY,
    "right",
    "right",
    nextDirectionCW,
    boardWidth,
    boardHeight,
    halfSize,
    gap,
    margin,
  );

  // ── Left arm: tiles safeCenter-1 → 0, spiraling counter-clockwise ──
  const leftTiles: { bt: BoardTile; originalIndex: number }[] = [];
  for (let i = safeCenter - 1; i >= 0; i--) {
    leftTiles.push({ bt: board[i], originalIndex: i });
  }

  // Left arm cursor: starts to the left of the center tile
  const leftStartX = centerX - gap;
  const leftArm = layoutArm(
    leftTiles,
    leftStartX,
    centerY,
    "left",
    "left",
    nextDirectionCCW,
    boardWidth,
    boardHeight,
    halfSize,
    gap,
    margin,
  );

  return { tiles: [...leftArm, centerTile, ...rightArm] };
}
