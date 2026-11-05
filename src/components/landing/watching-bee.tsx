"use client";

import { useEffect, useRef, useState } from "react";
import { COLOR, GRID } from "@/components/brand/bee";

/** Pixel positions of the bee's two eyes in GRID. */
const EYES = [
  { x: 6, y: 5 },
  { x: 11, y: 5 },
];
const WIDTH = GRID[0].length;
const HEIGHT = GRID.length;
/** How far a pupil can travel from the middle of its eye, in grid pixels. */
const REACH = 0.38;

/**
 * Lloyd the bee, large, with eyes that follow the pointer around the page. The eyes are drawn
 * over the pixel grid (white, with a pupil that shifts toward the pointer) and blink now and then.
 * Purely decorative.
 */
export function WatchingBee({ size = 120, className = "" }: { size?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0.1 });

  useEffect(() => {
    let frame = 0;
    let target = { x: 0, y: 0 };
    const move = (e: PointerEvent) => {
      target = { x: e.clientX, y: e.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = ref.current?.getBoundingClientRect();
        if (!box) return;
        // Aim from between the eyes; ease off when the pointer is close, so it doesn't go cross-eyed.
        // The viewBox starts at -0.5 and is one pixel wider and taller than the grid.
        const cx = box.left + (box.width * (9 + 0.5)) / (WIDTH + 1);
        const cy = box.top + (box.height * (5.5 + 0.5)) / (HEIGHT + 1);
        const dx = target.x - cx;
        const dy = target.y - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const pull = Math.min(dist / 160, 1) * REACH;
        setLook({ x: (dx / dist) * pull, y: (dy / dist) * pull });
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
    };
  }, []);

  const cells = GRID.flatMap((row, y) => [...row].map((c, x) => ({ c, x, y }))).filter((p) => p.c !== "." && !EYES.some((e) => e.x === p.x && e.y === p.y));
  const wing = cells.filter((p) => p.c === "W" || p.c === "w");
  const body = cells.filter((p) => p.c !== "W" && p.c !== "w");
  return (
    <svg ref={ref} viewBox={`-0.5 -0.5 ${WIDTH + 1} ${HEIGHT + 1}`} width={size} height={(size * (HEIGHT + 1)) / (WIDTH + 1)} aria-hidden className={`bee-hover ${className}`}>
      <g className="bee-wings" shapeRendering="crispEdges">
        {wing.map((p) => <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={1.02} height={1.02} fill={COLOR[p.c]} />)}
      </g>
      <g shapeRendering="crispEdges">
        {body.map((p) => <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={1.02} height={1.02} fill={COLOR[p.c]} />)}
      </g>
      {EYES.map((e) => (
        <g key={e.x} className="bee-blink">
          <rect x={e.x - 0.4} y={e.y - 0.45} width={1.8} height={1.9} rx={0.35} fill="#fff" stroke={COLOR.K} strokeWidth={0.22} />
          <rect x={e.x + 0.5 - 0.45 + look.x} y={e.y + 0.5 - 0.45 + look.y} width={0.9} height={0.9} rx={0.2} fill={COLOR.K} style={{ transition: "x 90ms linear, y 90ms linear" }} />
          <rect x={e.x + 0.5 - 0.3 + look.x} y={e.y + 0.5 - 0.35 + look.y} width={0.28} height={0.28} fill="#fff" style={{ transition: "x 90ms linear, y 90ms linear" }} />
        </g>
      ))}
    </svg>
  );
}
