"use client";

import { useEffect, useState } from "react";

/**
 * Lloyd as a stack of five layers, drawn in code: an exploded isometric tower of slabs from the
 * brief at the bottom to the finished campaign on top. Pointing at a layer (or its text) lights
 * it up; otherwise the stack steps through them on its own. Original artwork, no images.
 */
const ACCENT = "#e255d0";
const VIEW_W = 440;
const VIEW_H = 672;
const HW = 150; // half width of a slab's top face
const HH = 86; // half height of a slab's top face
const TH = 16; // slab thickness
const CX = VIEW_W / 2;
const cyOf = (i: number) => 560 - i * 112;

type Glyph = "brief" | "brand" | "memory" | "guard" | "campaign";

/** Bottom to top. `side` says which column the text sits in on wide screens. */
const LAYERS: { key: Glyph; title: string; text: string; side: "left" | "right" }[] = [
  { key: "brief", title: "Brief", text: "Typed, pasted or attached. A clear brief goes straight to a plan; a vague one gets one to three sharp questions.", side: "left" },
  { key: "brand", title: "Brand layer", text: "Reads the whole brand folder, ranks every document by authority and settles contradictions with quotes.", side: "right" },
  { key: "memory", title: "Memory", text: "Preferences carry into the next campaign. Launch dates and one-off numbers don't. You can see and edit it all.", side: "left" },
  { key: "guard", title: "Guard", text: "Every asset is checked against the brand's facts and banned claims before you see it, and fixed if needed.", side: "right" },
  { key: "campaign", title: "Campaign", text: "Posts, emails, blog posts and landing pages, each shown like the real thing and edited one at a time in chat.", side: "left" },
];

export function LayerStack() {
  const [active, setActive] = useState(LAYERS.length - 1);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + LAYERS.length - 1) % LAYERS.length), 3200);
    return () => clearInterval(t);
  }, [paused]);

  const pick = (i: number) => {
    setActive(i);
    setPaused(true);
  };
  // Inactive slabs first (bottom to top), the lit one last so it sits in front.
  const order = [...LAYERS.keys()].filter((i) => i !== active).concat(active);

  const item = (i: number, align: "left" | "right" | "center") => {
    const l = LAYERS[i];
    const on = i === active;
    return (
      <button
        key={l.key}
        type="button"
        onMouseEnter={() => pick(i)}
        onFocus={() => pick(i)}
        onClick={() => pick(i)}
        aria-pressed={on}
        className={`block w-full max-w-[320px] rounded-xl py-2 transition-colors duration-300 ${align === "right" ? "ml-auto text-right" : "text-left"} ${on ? "text-white" : "text-white/45 hover:text-white/75"}`}
      >
        <span className="block text-[22px] font-medium tracking-tight">{l.title}</span>
        <span className={`mt-1.5 block text-[15px] leading-relaxed ${on ? "text-white/80" : ""}`}>{l.text}</span>
      </button>
    );
  };

  return (
    <div onMouseLeave={() => setPaused(false)} className="mx-auto max-w-6xl">
      {/* Wide screens: text in two columns, placed level with each slab. */}
      <div className="hidden grid-cols-[1fr_minmax(0,440px)_1fr] gap-8 md:grid">
        {(["left", "right"] as const).map((side) => (
          <div key={side} className={`relative ${side === "right" ? "order-3" : ""}`}>
            {LAYERS.map((l, i) =>
              l.side === side ? (
                <div key={l.key} className="absolute inset-x-0 -translate-y-1/2" style={{ top: `${((cyOf(i) + 8) / VIEW_H) * 100}%` }}>
                  {item(i, side === "left" ? "right" : "left")}
                </div>
              ) : null,
            )}
          </div>
        ))}
        <div className="order-2">
          <Stack order={order} active={active} onPick={pick} />
        </div>
      </div>

      {/* Narrow screens: the stack, then the layers as a list, top layer first. */}
      <div className="md:hidden">
        <div className="mx-auto max-w-[320px]">
          <Stack order={order} active={active} onPick={pick} />
        </div>
        <div className="mt-8 space-y-3">{[...LAYERS.keys()].reverse().map((i) => item(i, "center"))}</div>
      </div>
    </div>
  );
}

function Stack({ order, active, onPick }: { order: number[]; active: number; onPick: (i: number) => void }) {
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Lloyd's five layers, ${LAYERS[active].title} highlighted`}>
      <defs>
        <radialGradient id="ls-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.85" />
          <stop offset="55%" stopColor={ACCENT} stopOpacity="0.18" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </radialGradient>
        <filter id="ls-bloom" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* The spine the slabs hang on. */}
      <line x1={CX} y1={cyOf(4)} x2={CX} y2={cyOf(0)} stroke={ACCENT} strokeOpacity="0.18" strokeDasharray="3 5" />
      {order.map((i) => (
        <Slab key={LAYERS[i].key} i={i} on={i === active} onPick={() => onPick(i)} />
      ))}
    </svg>
  );
}

function Slab({ i, on, onPick }: { i: number; on: boolean; onPick: () => void }) {
  const cy = cyOf(i);
  const l = LAYERS[i];
  const top = `M${CX} ${cy - HH} L${CX + HW} ${cy} L${CX} ${cy + HH} L${CX - HW} ${cy} Z`;
  const inset = 0.88;
  const rim = `M${CX} ${cy - HH * inset} L${CX + HW * inset} ${cy} L${CX} ${cy + HH * inset} L${CX - HW * inset} ${cy} Z`;
  const left = `M${CX - HW} ${cy} L${CX} ${cy + HH} L${CX} ${cy + HH + TH} L${CX - HW} ${cy + TH} Z`;
  const right = `M${CX + HW} ${cy} L${CX} ${cy + HH} L${CX} ${cy + HH + TH} L${CX + HW} ${cy + TH} Z`;
  const studs = [
    [CX, cy - HH * 0.8],
    [CX + HW * 0.8, cy],
    [CX, cy + HH * 0.8],
    [CX - HW * 0.8, cy],
  ];
  const stroke = { stroke: ACCENT, strokeOpacity: on ? 1 : 0.32, strokeWidth: on ? 1.4 : 1, strokeLinejoin: "round" as const };
  // Rounded: server and client must print the same number.
  const angle = Math.round((-Math.atan2(HH, HW) * 180 * 100) / Math.PI) / 100;
  return (
    <g
      onMouseEnter={onPick}
      onClick={onPick}
      style={{ transform: on ? "translateY(-10px)" : "translateY(0)", transition: "transform 450ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
      className="cursor-(--cursor-hand)"
    >
      <path d={left} fill={on ? "#1d1222" : "#121014"} fillOpacity={on ? 1 : 0.7} {...stroke} />
      <path d={right} fill={on ? "#150d19" : "#0f0d11"} fillOpacity={on ? 1 : 0.7} {...stroke} />
      <path d={top} fill={on ? "#170f1b" : "#131115"} fillOpacity={on ? 1 : 0.55} {...stroke} />
      <ellipse cx={CX} cy={cy} rx={HW * 0.62} ry={HH * 0.62} fill="url(#ls-glow)" style={{ opacity: on ? 1 : 0.12, transition: "opacity 450ms" }} />
      <path d={rim} fill="none" stroke={ACCENT} strokeOpacity={on ? 0.55 : 0.16} />
      {studs.map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y - 3.5} L${x + 6} ${y} L${x} ${y + 3.5} L${x - 6} ${y} Z`} fill="none" stroke={ACCENT} strokeOpacity={on ? 0.9 : 0.3} />
      ))}
      <g style={{ opacity: on ? 1 : 0.28, transition: "opacity 450ms" }} filter={on ? "url(#ls-bloom)" : undefined}>
        <LayerGlyph kind={l.key} x={CX} y={cy} />
      </g>
      <text
        x={CX + HW / 2}
        y={cy + HH / 2 + TH / 2 + 1}
        transform={`rotate(${angle} ${CX + HW / 2} ${cy + HH / 2 + TH / 2 + 1})`}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="12"
        fontStyle="italic"
        fontWeight="600"
        letterSpacing="0.5"
        fill={ACCENT}
        style={{ opacity: on ? 1 : 0.35, transition: "opacity 450ms" }}
      >
        {l.title}
      </text>
    </g>
  );
}

/** One object per layer, standing on the middle of its slab. */
function LayerGlyph({ kind, x, y }: { kind: Glyph; x: number; y: number }) {
  const line = { stroke: "#ffd9f8", strokeWidth: 1.8, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const tint = { fill: ACCENT, fillOpacity: 0.32, stroke: ACCENT, strokeWidth: 1.4 };
  return (
    <g transform={`translate(${x} ${y - 14})`}>
      {kind === "brief" && (
        <>
          {/* A brief, with a question bubble beside it. */}
          <rect x={-30} y={-30} width={38} height={48} rx={4} {...tint} />
          <path d="M-22 -18 h22 M-22 -9 h22 M-22 0 h14" {...line} />
          <path d="M10 -40 h30 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-14 l-8 7 v-7 h-8 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6 z" {...tint} />
          <path d="M21 -31 a4 4 0 1 1 5 4 v3 M26 -19 v0.5" {...line} />
        </>
      )}
      {kind === "brand" && (
        <>
          {/* Three documents ranked by authority: the front one wins. */}
          <rect x={-6} y={-40} width={36} height={44} rx={4} {...tint} fillOpacity={0.12} />
          <rect x={-18} y={-32} width={36} height={44} rx={4} {...tint} fillOpacity={0.2} />
          <rect x={-30} y={-24} width={36} height={44} rx={4} {...tint} />
          <path d="M-22 -12 h20 M-22 -4 h20 M-22 4 h12" {...line} />
          <circle cx={6} cy={-24} r={8} fill="#170f1b" stroke="#ffd9f8" strokeWidth={1.8} />
          <path d="M2.5 -24 l2.5 2.5 l4.5 -5" {...line} />
        </>
      )}
      {kind === "memory" && (
        <>
          {/* A small web of remembered things. */}
          <path d="M-28 -8 L-6 -30 L22 -18 L14 8 L-12 12 Z M-6 -30 L-12 12 M22 -18 L-28 -8" stroke={ACCENT} strokeWidth={1.4} fill="none" strokeOpacity={0.9} />
          {[[-28, -8, 6], [-6, -30, 7], [22, -18, 6], [14, 8, 5], [-12, 12, 6]].map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#170f1b" stroke="#ffd9f8" strokeWidth={1.8} />
          ))}
          <circle cx={-6} cy={-30} r={2.5} fill="#ffd9f8" />
        </>
      )}
      {kind === "guard" && (
        <>
          {/* A shield over a checked claim. */}
          <path d="M0 -42 l24 9 v16 c0 16 -11 26 -24 31 c-13 -5 -24 -15 -24 -31 v-16 z" {...tint} />
          <path d="M-10 -14 l7 7 l14 -15" {...line} strokeWidth={2.4} />
        </>
      )}
      {kind === "campaign" && (
        <>
          {/* The finished assets, fanned out: a post, an email, a page. */}
          <g transform="rotate(-14 -10 0)">
            <rect x={-38} y={-34} width={30} height={40} rx={3} {...tint} fillOpacity={0.18} />
            <path d="M-32 -26 h18 M-32 -19 h12" {...line} strokeOpacity={0.6} />
          </g>
          <g transform="rotate(12 10 0)">
            <rect x={8} y={-34} width={30} height={40} rx={3} {...tint} fillOpacity={0.18} />
            <path d="M14 -26 h18 M14 -19 h12" {...line} strokeOpacity={0.6} />
          </g>
          <rect x={-17} y={-44} width={34} height={46} rx={3} {...tint} />
          <rect x={-11} y={-38} width={22} height={12} rx={2} fill="#ffd9f8" fillOpacity={0.35} />
          <path d="M-11 -18 h22 M-11 -11 h16 M-11 -4 h19" {...line} />
        </>
      )}
    </g>
  );
}
