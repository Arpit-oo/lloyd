/**
 * Original artwork for the Lloyd page, drawn in code: isometric glowing tiles, a halftone
 * ribbon and line-drawn overlapping shapes. No external images.
 */

const MAGENTA = "#d936c4";
const CORAL = "#f2785c";

/** A dark isometric slab with a glowing icon on top and a label along its edge. */
export function IsoTile({ label, glyph }: { label: string; glyph: "doc" | "chat" | "shield" | "brain" | "scroll" }) {
  const id = `iso-${glyph}`;
  return (
    <svg viewBox="0 0 240 170" className="h-auto w-full" role="img" aria-label={label}>
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor={MAGENTA} stopOpacity="0.75" />
          <stop offset="60%" stopColor={MAGENTA} stopOpacity="0.12" />
          <stop offset="100%" stopColor={MAGENTA} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1630" />
          <stop offset="100%" stopColor="#0d0a10" />
        </linearGradient>
      </defs>
      {/* sides */}
      <path d="M20 85 L120 135 L120 152 L20 102 Z" fill={`url(#${id}-side)`} stroke={MAGENTA} strokeOpacity="0.5" />
      <path d="M220 85 L120 135 L120 152 L220 102 Z" fill="#120c16" stroke={MAGENTA} strokeOpacity="0.5" />
      {/* top */}
      <path d="M120 35 L220 85 L120 135 L20 85 Z" fill="#17101b" stroke={MAGENTA} strokeOpacity="0.8" />
      <path d="M120 35 L220 85 L120 135 L20 85 Z" fill={`url(#${id}-glow)`} />
      {/* grid lines on the top face */}
      {[0.25, 0.5, 0.75].map((t) => (
        <g key={t} stroke={MAGENTA} strokeOpacity="0.18">
          <line x1={20 + 100 * t} y1={85 - 50 * t} x2={120 + 100 * t} y2={135 - 50 * t} />
          <line x1={20 + 100 * t} y1={85 + 50 * t} x2={120 + 100 * t} y2={35 + 50 * t} />
        </g>
      ))}
      {/* corner studs */}
      {[[120, 43], [208, 85], [120, 127], [32, 85]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" fill={MAGENTA} />)}
      {/* glyph, drawn flat in the middle of the top face */}
      <g transform="translate(120 80)" stroke="#ffd6f6" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {glyph === "doc" && (
          <>
            <path d="M-14 -20 h18 l10 10 v30 h-28 z" fill={MAGENTA} fillOpacity="0.35" />
            <path d="M-8 -4 h16 M-8 4 h16 M-8 12 h10" />
          </>
        )}
        {glyph === "chat" && (
          <>
            <path d="M-20 -16 h40 v24 h-22 l-10 9 v-9 h-8 z" fill={MAGENTA} fillOpacity="0.35" />
            <circle cx="-8" cy="-4" r="1.5" fill="#ffd6f6" /><circle cx="0" cy="-4" r="1.5" fill="#ffd6f6" /><circle cx="8" cy="-4" r="1.5" fill="#ffd6f6" />
          </>
        )}
        {glyph === "shield" && (
          <>
            <path d="M0 -22 l18 7 v12 c0 12 -8 20 -18 24 c-10 -4 -18 -12 -18 -24 v-12 z" fill={MAGENTA} fillOpacity="0.35" />
            <path d="M-8 0 l6 6 l11 -12" />
          </>
        )}
        {glyph === "brain" && (
          <>
            <path d="M-2 -18 c-10 -4 -20 4 -17 12 c-6 4 -4 14 4 15 c2 7 10 8 13 3 z" fill={MAGENTA} fillOpacity="0.35" />
            <path d="M2 -18 c10 -4 20 4 17 12 c6 4 4 14 -4 15 c-2 7 -10 8 -13 3 z" fill={MAGENTA} fillOpacity="0.35" />
          </>
        )}
        {glyph === "scroll" && (
          <>
            <rect x="-18" y="-18" width="36" height="34" rx="4" fill={MAGENTA} fillOpacity="0.35" />
            <path d="M-11 -8 h22 M-11 0 h22 M-11 8 h12" />
          </>
        )}
      </g>
      <text x="150" y="128" fill={MAGENTA} fontSize="9" fontWeight="600" letterSpacing="1.2" transform="rotate(-26.5 150 128)" opacity="0.9">
        {label.toUpperCase()}
      </text>
    </svg>
  );
}

/** A pink-to-coral halftone ribbon of slanted tiles, for wide banners. */
export function HalftoneRibbon({ className = "" }: { className?: string }) {
  const cols = 36;
  const rows = 7;
  return (
    <svg viewBox={`0 0 ${cols * 40} ${rows * 26}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="ribbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f39ae6" />
          <stop offset="100%" stopColor={CORAL} />
        </linearGradient>
        <pattern id="dots" width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.9" fill="#fff" fillOpacity="0.35" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#ribbon)" />
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((__, c) => {
          // Tiles tilt more toward the top, flattening toward the bottom.
          const skew = (rows - r) * 2.4;
          const x = c * 40;
          const y = r * 26;
          return <path key={`${r}-${c}`} d={`M${x} ${y + skew} L${x + 40} ${y} L${x + 40} ${y + 13} L${x} ${y + 13 + skew} Z`} fill={MAGENTA} fillOpacity={0.18 + (rows - r) * 0.05} />;
        }),
      )}
      <rect width="100%" height="100%" fill="url(#dots)" />
    </svg>
  );
}

/** Line-drawn overlapping shapes with a gradient where they meet, one per audience. */
export function OverlapMark({ variant }: { variant: 0 | 1 | 2 | 3 }) {
  const id = `ov-${variant}`;
  const fill = (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor={MAGENTA} />
      <stop offset="100%" stopColor={CORAL} />
    </linearGradient>
  );
  const stroke = { stroke: "currentColor", strokeWidth: 1.6, fill: "none" };
  return (
    <svg viewBox="0 0 80 80" className="h-16 w-16 text-ink" aria-hidden>
      <defs>{fill}</defs>
      {variant === 0 && (
        <>
          <clipPath id={`${id}-c`}><circle cx="32" cy="44" r="20" /></clipPath>
          <circle cx="48" cy="34" r="20" fill={`url(#${id})`} clipPath={`url(#${id}-c)`} />
          <circle cx="32" cy="44" r="20" {...stroke} />
          <circle cx="48" cy="34" r="20" {...stroke} />
        </>
      )}
      {variant === 1 && (
        <>
          <clipPath id={`${id}-c`}><circle cx="28" cy="48" r="14" /></clipPath>
          <circle cx="46" cy="36" r="24" fill={`url(#${id})`} clipPath={`url(#${id}-c)`} />
          <circle cx="28" cy="48" r="14" {...stroke} />
          <circle cx="46" cy="36" r="24" {...stroke} />
        </>
      )}
      {variant === 2 && (
        <>
          <rect x="30" y="30" width="20" height="20" fill={`url(#${id})`} />
          <rect x="14" y="26" width="36" height="36" {...stroke} />
          <rect x="30" y="14" width="36" height="36" {...stroke} />
        </>
      )}
      {variant === 3 && (
        <>
          <clipPath id={`${id}-c`}><rect x="34" y="12" width="34" height="34" /></clipPath>
          <circle cx="32" cy="46" r="20" fill={`url(#${id})`} clipPath={`url(#${id}-c)`} />
          <circle cx="32" cy="46" r="20" {...stroke} />
          <rect x="34" y="12" width="34" height="34" {...stroke} />
        </>
      )}
    </svg>
  );
}
