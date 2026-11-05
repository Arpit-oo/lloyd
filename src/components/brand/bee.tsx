/**
 * Lloyd, the bee. Drawn as pixel art from a character grid so it stays crisp at any size and
 * can be animated with plain CSS (wings flutter, body bobs). Purely decorative: aria-hidden
 * unless a label is given.
 */
export const GRID = [
  "......K....K....",
  ".......K..K.....",
  "......KKKKKK....",
  ".....KYYYYYYK...",
  "..WWKYYYYYYYYK..",
  ".WWWKYKYYYYKYK..",
  ".WwWKYYYYYYYYYK.",
  ".WWKYYKYYYYKYYK.",
  "..WKYYYKKKKYYYK.",
  "...KOYYYYYYYYOK.",
  "...KKKKKKKKKKKK.",
  "....KYYYYYYYYK..",
  "....KOOOOOOOOK..",
  ".....KKKKKKKK...",
];

export const COLOR: Record<string, string> = {
  K: "#1d1a14",
  Y: "#f7c51e",
  O: "#e8901b",
  W: "#bfe3f7",
  w: "#e6f5fd",
};

const WIDTH = GRID[0].length;
const HEIGHT = GRID.length;

type Mood = "still" | "hover" | "fly";

export function Bee({ size = 24, mood = "still", label, className = "" }: { size?: number; mood?: Mood; label?: string; className?: string }) {
  const cells = GRID.flatMap((row, y) => [...row].map((c, x) => ({ c, x, y }))).filter((p) => p.c !== ".");
  const wing = cells.filter((p) => p.c === "W" || p.c === "w");
  const body = cells.filter((p) => p.c !== "W" && p.c !== "w");
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={size}
      height={(size * HEIGHT) / WIDTH}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`${mood === "hover" ? "bee-hover" : mood === "fly" ? "bee-fly" : ""} ${className}`}
    >
      <g className={mood === "still" ? undefined : "bee-wings"}>
        {wing.map((p) => <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={1.02} height={1.02} fill={COLOR[p.c]} />)}
      </g>
      {body.map((p) => <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={1.02} height={1.02} fill={COLOR[p.c]} />)}
    </svg>
  );
}
