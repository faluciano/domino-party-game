// ─── Board Display (web) ────────────────────────────────────────────────────
// Web port of the host's BoardDisplay. The host measures its area with RN's
// `onLayout`; on the web we use a ResizeObserver so the spiral layout re-flows
// when the browser window (or TV resolution) changes.

import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardTile } from "@my-game/shared";
import {
  computeCenteredChainLayout,
  getTileDimensions,
  getRotatedDimensions,
} from "../board-layout";
import { DominoTile } from "./DominoTile";

export const HALF_SIZE = 22;
export const TILE_GAP = 3;

export function BoardDisplay({
  board,
  centerIndex,
  currentTurnName,
}: {
  board: BoardTile[];
  centerIndex: number;
  currentTurnName: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (size.width === 0 || size.height === 0 || board.length === 0) return null;
    return computeCenteredChainLayout(
      board,
      centerIndex,
      size.width,
      size.height,
      HALF_SIZE,
      TILE_GAP,
    );
  }, [board, centerIndex, size.width, size.height]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, alignSelf: "stretch", position: "relative", minHeight: 0 }}
    >
      {board.length === 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#555", fontSize: 18 }}>
            {currentTurnName} plays first...
          </span>
        </div>
      ) : layout ? (
        <div style={{ position: "absolute", inset: 0 }}>
          {layout.tiles.map((pt) => {
            const naturalDims = getTileDimensions(pt.bt, HALF_SIZE);
            const rotatedDims = getRotatedDimensions(
              pt.bt,
              HALF_SIZE,
              pt.rotation,
            );

            return (
              <div
                key={pt.index}
                style={{
                  position: "absolute",
                  left: pt.x,
                  top: pt.y,
                  width: rotatedDims.w,
                  height: rotatedDims.h,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {pt.rotation === 0 ? (
                  <DominoTile
                    left={pt.bt.tile.left}
                    right={pt.bt.tile.right}
                    flipped={pt.bt.flipped}
                    halfSize={HALF_SIZE}
                  />
                ) : (
                  <div
                    style={{
                      width: naturalDims.w,
                      height: naturalDims.h,
                      transform: `rotate(${pt.rotation}deg)`,
                    }}
                  >
                    <DominoTile
                      left={pt.bt.tile.left}
                      right={pt.bt.tile.right}
                      flipped={pt.bt.flipped}
                      halfSize={HALF_SIZE}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
