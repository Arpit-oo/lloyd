/**
 * Original artwork for the Lloyd page, drawn in code: a halftone
 * ribbon and line-drawn overlapping shapes. No external images.
 */

const MAGENTA = "#d936c4";
const CORAL = "#f2785c";
const PINK = "#ff70ff";
const ORANGE = "#ff5f2e";

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

/** Full-width halftone band: pink field, orange sweeps, grainy edges and a dot screen. */
export function HeroBanner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1440 216" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <pattern id="hb-dots" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
          <circle cx="3.5" cy="3.5" r="1.5" fill="#fff" fillOpacity="0.38" />
        </pattern>
        <pattern id="hb-dots-o" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
          <circle cx="3" cy="3" r="1.3" fill={ORANGE} fillOpacity="0.55" />
        </pattern>
        <filter id="hb-grain" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="14" />
        </filter>
        <linearGradient id="hb-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="hb-mask"><rect width="1440" height="216" fill="url(#hb-fade)" /></mask>
      </defs>
      <rect width="1440" height="216" fill={PINK} />
      <g filter="url(#hb-grain)" fill={ORANGE}>
        <path d="M150 -30 C 300 30 380 110 300 250 L 560 250 C 630 140 540 30 450 -30 Z" />
        <path d="M640 -30 L 790 -30 C 840 50 930 110 1030 100 C 1110 92 1150 160 1120 250 L 880 250 C 840 170 720 150 650 80 Z" />
        <path d="M1210 -30 L 1470 -30 L 1470 250 L 1350 250 C 1290 160 1270 60 1210 -30 Z" />
      </g>
      <g filter="url(#hb-grain)" fill="#ff9cff" fillOpacity="0.9">
        <path d="M-20 120 C 60 90 120 140 110 250 L -20 250 Z" />
        <path d="M470 -30 C 520 40 600 60 640 20 L 650 -30 Z" />
      </g>
      <rect width="1440" height="216" fill="url(#hb-dots)" />
      <rect width="1440" height="216" fill="url(#hb-dots-o)" mask="url(#hb-mask)" opacity="0.6" />
    </svg>
  );
}
