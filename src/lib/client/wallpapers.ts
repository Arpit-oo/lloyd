/**
 * Animated ASCII wallpapers. Each scene is painted in monospace characters on a canvas and
 * keeps moving: drifting sprites, particles, twinkling stars, blinking glows. A scene also sets
 * the chrome: light or dark scheme and translucent surface colors so the wallpaper shows through.
 *
 * Scenes are data (sprites + particle systems) drawn by one small engine; nothing here is a
 * bitmap, so they stay sharp at any size and cost almost nothing to ship.
 */
export type Scheme = "light" | "dark";

interface Sprite {
  art: string[];
  /** Character -> color; characters not listed use `color`. Spaces are transparent. */
  palette?: Record<string, string>;
  color: string;
  /** Start position as a fraction of the screen. */
  x: number;
  y: number;
  /** Horizontal drift in cells per second (negative = leftwards). Wraps around. */
  vx?: number;
  /** Vertical bob amplitude (cells) and period (seconds). */
  bob?: [number, number];
  /** Horizontal sway amplitude (cells) and period (seconds), for swimmers. */
  sway?: [number, number];
  alpha?: number;
}

interface Particles {
  kind: "rise" | "fall" | "twinkle" | "glow";
  chars: string;
  colors: string[];
  /** Particles per 10,000 cells. */
  density: number;
  speed?: number;
  /** Fraction of the screen height where particles live (from top). */
  band?: [number, number];
}

export interface Scene {
  id: string;
  name: string;
  scheme: Scheme;
  /** Vertical background gradient, top to bottom. */
  sky: string[];
  sprites: Sprite[];
  particles: Particles[];
  /** Chrome token overrides (see globals.css), so panels sit on the wallpaper. */
  tokens: Record<string, string>;
}

/* ---------- sprite art ---------- */

const CLOUD_A = ["      .--.      ", "   .-(    ).    ", "  (___.__)__)   "];
const CLOUD_B = ["        _  _          ", "     .-( )( )-.       ", "   .(  (   )   ).     ", "  (___.__.___.___)    "];
const CLOUD_LONG = ["  ssssssssssssss     ", "ssssssssssssssssssssss", "   ssssssssssssss    "];
const SUN = [
  "     \\   |   /     ",
  "  `.  \\  |  /  .'  ",
  "    `. .---. .'    ",
  "-- --  (   ) --  --",
  "    .' `---' `.    ",
  "  .'  /  |  \\  `.  ",
  "     /   |   \\     ",
];
const MOON = ["    _..._  ", "  .'  .::' ", " :  ::::'  ", " :  ::::.  ", "  `. '::::.", "    `-..-' "];
const TURTLE = ["      ____    ", "  .-'/_/_/'-. ", " (___/\\_/\\___>", "    ^^    ^^  "];
const KOI_ORANGE = ["  ><((((°>  "];
const KOI_WHITE = ["  ><(((°>  "];
const LILY = [" .-~-. ", "(  o  )", " `-~-' "];
const JELLY = ["  .--.  ", " ( ** ) ", "  )||(  ", "  ;||;  ", "   ''   "];
const BOAT = ["   |\\    ", "   | \\   ", " __|__\\_ ", " \\_____/ "];
const WAVE = ["~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ "];
const GRASS = ["/\\|/|\\/|\\|//\\|/|\\|/|\\/|\\|//\\|/|\\|/|\\/|\\|//\\|/|\\|/|\\/|\\|//\\|/|\\|/|\\/|\\|//\\|"];
const FLAME = ["   (  ", "  ) )  ", " ( ( ( ", "  ) ) )", " (,(,( "];

/* ---------- chrome presets ---------- */

const darkGlass = (accent: string, tint: string) => ({
  "--c-paper": "transparent",
  "--c-sidebar": `color-mix(in srgb, ${tint} 72%, transparent)`,
  "--c-panel": `color-mix(in srgb, ${tint} 86%, transparent)`,
  "--c-surface": `color-mix(in srgb, ${tint} 88%, #ffffff 4%)`,
  "--c-bubble": "rgba(255,255,255,0.12)",
  "--c-line": "rgba(255,255,255,0.12)",
  "--c-line-strong": "rgba(255,255,255,0.24)",
  "--c-scrim": `color-mix(in srgb, ${tint} 68%, transparent)`,
  "--c-accent": accent,
  "--c-muted": "#c3ccc9",
  "--c-canvas": `color-mix(in srgb, ${tint} 70%, #000 10%)`,
});

const lightGlass = (accent: string, tint: string) => ({
  "--c-paper": "transparent",
  "--c-sidebar": `color-mix(in srgb, ${tint} 70%, transparent)`,
  "--c-panel": `color-mix(in srgb, ${tint} 85%, transparent)`,
  "--c-surface": "rgba(255,255,255,0.9)",
  "--c-bubble": "rgba(255,255,255,0.7)",
  "--c-line": "rgba(20,40,70,0.12)",
  "--c-line-strong": "rgba(20,40,70,0.24)",
  "--c-scrim": `color-mix(in srgb, ${tint} 50%, transparent)`,
  "--c-accent": accent,
  "--c-ink": "#14243a",
  "--c-muted": "#3f5168",
  "--c-canvas": `color-mix(in srgb, ${tint} 80%, #000 4%)`,
});

/* ---------- scenes ---------- */

export const SCENES: Scene[] = [
  {
    id: "ember",
    name: "Ember",
    scheme: "dark",
    sky: ["#120c0a", "#1d120d", "#2a160e"],
    sprites: [
      { art: SUN, color: "#e0773f", palette: { "(": "#f4a259", ")": "#f4a259", "-": "#c8552c" }, x: 0.78, y: 0.16, bob: [0.6, 7] },
      { art: FLAME, color: "#e8692d", palette: { ",": "#f6b35b" }, x: 0.12, y: 0.78, bob: [0.4, 1.6] },
    ],
    particles: [
      { kind: "rise", chars: "·.'*", colors: ["#f08a4b", "#ffb36b", "#c9502a"], density: 10, speed: 3 },
      { kind: "twinkle", chars: ".", colors: ["#5a3426"], density: 18 },
    ],
    tokens: darkGlass("#e0773f", "#1d1310"),
  },
  {
    id: "cloud-drift",
    name: "Cloud Drift",
    scheme: "light",
    sky: ["#8cc4f0", "#b4dbf7", "#e3f2fc"],
    sprites: [
      { art: CLOUD_B, color: "#ffffff", x: 0.08, y: 0.12, vx: 1.2, alpha: 0.95 },
      { art: CLOUD_A, color: "#ffffff", x: 0.55, y: 0.26, vx: 0.8, alpha: 0.9 },
      { art: CLOUD_LONG, color: "#f4faff", x: 0.32, y: 0.62, vx: 1.6, alpha: 0.85 },
      { art: CLOUD_A, color: "#ffffff", x: 0.86, y: 0.48, vx: 1.0, alpha: 0.9 },
      { art: ["v  v"], color: "#4a6f94", x: 0.4, y: 0.18, vx: 3.2 },
    ],
    particles: [],
    tokens: lightGlass("#2f78c4", "#e8f3fd"),
  },
  {
    id: "lagoon",
    name: "Lagoon",
    scheme: "dark",
    sky: ["#14788a", "#0f5c69", "#093f48"],
    sprites: [
      { art: TURTLE, color: "#7fd08a", palette: { "/": "#3e8f4f", _: "#5bb56b", "^": "#a8e3a0", ">": "#a8e3a0" }, x: 0.3, y: 0.42, vx: 1.4, bob: [1.2, 6] },
      { art: TURTLE, color: "#6fc17b", palette: { "/": "#3e8f4f" }, x: 0.75, y: 0.7, vx: 0.9, bob: [0.8, 8], alpha: 0.75 },
    ],
    particles: [
      { kind: "rise", chars: "o°.", colors: ["#bff3f7", "#86dbe4"], density: 7, speed: 2 },
      { kind: "twinkle", chars: "~", colors: ["#2fb0c2"], density: 10, band: [0, 0.2] },
    ],
    tokens: darkGlass("#45c6d6", "#0d4a55"),
  },
  {
    id: "koi-pond",
    name: "Koi Pond",
    scheme: "dark",
    sky: ["#1a5249", "#133f3a", "#0c2c2a"],
    sprites: [
      { art: KOI_ORANGE, color: "#f08a3a", palette: { "°": "#1c1c1c", ">": "#ffd2a8", "<": "#ffd2a8" }, x: 0.2, y: 0.3, vx: 3, sway: [0, 1], bob: [2.5, 5] },
      { art: KOI_WHITE, color: "#f3eee6", palette: { "°": "#1c1c1c", ">": "#f27a4a" }, x: 0.6, y: 0.55, vx: -2.4, bob: [3, 7] },
      { art: KOI_ORANGE, color: "#e26b2f", palette: { "°": "#1c1c1c" }, x: 0.85, y: 0.78, vx: 2, bob: [2, 6] },
      { art: LILY, color: "#5fae5a", palette: { o: "#f6a6c1", "~": "#7cc472" }, x: 0.1, y: 0.7, bob: [0.3, 9] },
      { art: LILY, color: "#4f9e4c", palette: { o: "#ffe08a" }, x: 0.7, y: 0.15, bob: [0.3, 11] },
    ],
    particles: [{ kind: "twinkle", chars: ".", colors: ["#2d7a6d", "#3c8f80"], density: 14 }],
    tokens: darkGlass("#f08a3a", "#123b38"),
  },
  {
    id: "jellyfish",
    name: "Jellyfish",
    scheme: "dark",
    sky: ["#0a2a55", "#081f42", "#05142c"],
    sprites: [
      { art: JELLY, color: "#b9a7ff", palette: { "*": "#ffd1f0", "|": "#8f7ee0", ";": "#8f7ee0" }, x: 0.2, y: 0.55, bob: [4, 9], sway: [1.5, 13] },
      { art: JELLY, color: "#7fd3ff", palette: { "*": "#e0f6ff", "|": "#5ab0e0" }, x: 0.72, y: 0.35, bob: [5, 11], sway: [2, 15], alpha: 0.85 },
      { art: JELLY, color: "#ff9fd2", palette: { "*": "#fff" }, x: 0.48, y: 0.8, bob: [3, 8], alpha: 0.7 },
    ],
    particles: [
      { kind: "rise", chars: ".°", colors: ["#5d8fd6", "#9cc2ff"], density: 6, speed: 1.2 },
      { kind: "twinkle", chars: ".", colors: ["#1f4a86"], density: 16 },
    ],
    tokens: darkGlass("#8fb8ff", "#071a3a"),
  },
  {
    id: "paper-boats",
    name: "Paper Boats",
    scheme: "dark",
    sky: ["#23766f", "#1a5b57", "#123f3d"],
    sprites: [
      { art: BOAT, color: "#f4f1e8", palette: { "|": "#cfc9b8" }, x: 0.15, y: 0.5, vx: 0.9, bob: [0.8, 3.5] },
      { art: BOAT, color: "#ffffff", x: 0.62, y: 0.72, vx: 0.6, bob: [0.7, 4.2], alpha: 0.85 },
      { art: WAVE, color: "#5fc1b8", x: 0, y: 0.6, vx: 2, alpha: 0.5 },
      { art: WAVE, color: "#4aa9a1", x: 0.3, y: 0.82, vx: -1.5, alpha: 0.45 },
    ],
    particles: [{ kind: "twinkle", chars: "~-", colors: ["#3aa39b", "#7ad3ca"], density: 9 }],
    tokens: darkGlass("#7fe0d3", "#164a49"),
  },
  {
    id: "fireflies",
    name: "Fireflies",
    scheme: "dark",
    sky: ["#08130e", "#0b1d14", "#11291b"],
    sprites: [{ art: GRASS, color: "#1f4a2c", x: 0, y: 0.94 }],
    particles: [
      { kind: "glow", chars: "*", colors: ["#e8f06a", "#c7e85a", "#fff59a"], density: 5, speed: 0.8 },
      { kind: "twinkle", chars: ".", colors: ["#1a3a24"], density: 14 },
    ],
    tokens: darkGlass("#d6e85a", "#0a1a12"),
  },
  {
    id: "moonlit",
    name: "Moonlit",
    scheme: "dark",
    sky: ["#070d24", "#0d1a3e", "#1b2d62"],
    sprites: [
      { art: MOON, color: "#e9e1b4", palette: { ":": "#cfc596", "'": "#cfc596", ".": "#cfc596" }, x: 0.76, y: 0.1, bob: [0.3, 12] },
      { art: CLOUD_LONG, color: "#5b6fb4", x: 0.15, y: 0.22, vx: 0.7, alpha: 0.7 },
      { art: CLOUD_LONG, color: "#4a5c9e", x: 0.6, y: 0.5, vx: 0.5, alpha: 0.6 },
    ],
    particles: [{ kind: "twinkle", chars: ".*+·", colors: ["#ffffff", "#c9d6ff", "#8fa3e6"], density: 16 }],
    tokens: darkGlass("#a9b8ff", "#0b1636"),
  },
];

export const SCENE_SCHEMES: Record<string, Scheme> = Object.fromEntries(SCENES.map((s) => [s.id, s.scheme]));

/* ---------- engine ---------- */

interface Particle {
  x: number;
  y: number;
  ch: string;
  color: string;
  phase: number;
  speed: number;
}

interface State {
  cols: number;
  rows: number;
  particles: { def: Particles; items: Particle[] }[];
}

const rand = (seed: { v: number }) => {
  seed.v = (seed.v * 1664525 + 1013904223) % 4294967296;
  return seed.v / 4294967296;
};

export function createScene(scene: Scene, cols: number, rows: number): State {
  const seed = { v: 7 };
  return {
    cols,
    rows,
    particles: scene.particles.map((def) => {
      const n = Math.round((cols * rows * def.density) / 10_000);
      const [b0, b1] = def.band ?? [0, 1];
      return {
        def,
        items: Array.from({ length: n }, () => ({
          x: rand(seed) * cols,
          y: (b0 + rand(seed) * (b1 - b0)) * rows,
          ch: def.chars[Math.floor(rand(seed) * def.chars.length)],
          color: def.colors[Math.floor(rand(seed) * def.colors.length)],
          phase: rand(seed) * Math.PI * 2,
          speed: (def.speed ?? 1) * (0.5 + rand(seed)),
        })),
      };
    }),
  };
}

/** Paints one frame. `t` is seconds since start; `cell` the character size in px. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, state: State, t: number, w: number, h: number, cell: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  scene.sky.forEach((c, i) => grad.addColorStop(i / Math.max(1, scene.sky.length - 1), c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.font = `${Math.round(cell * 1.05)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textBaseline = "top";
  const cw = cell * 0.62;
  const { cols, rows } = state;

  // Particles
  for (const { def, items } of state.particles) {
    for (const p of items) {
      let x = p.x;
      let y = p.y;
      let a = 1;
      if (def.kind === "rise") y = (((p.y - t * p.speed) % rows) + rows) % rows;
      if (def.kind === "fall") y = (p.y + t * p.speed) % rows;
      if (def.kind === "twinkle") a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.3 * p.speed + p.phase));
      if (def.kind === "glow") {
        x = p.x + Math.sin(t * 0.3 * p.speed + p.phase) * 3;
        y = p.y + Math.cos(t * 0.25 * p.speed + p.phase) * 2;
        a = Math.max(0, Math.sin(t * 1.1 * p.speed + p.phase));
        if (a > 0.05) {
          const gx = x * cw;
          const gy = y * cell;
          const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, cell * 2.4);
          g.addColorStop(0, `${p.color}${alphaHex(a * 0.45)}`);
          g.addColorStop(1, `${p.color}00`);
          ctx.fillStyle = g;
          ctx.fillRect(gx - cell * 2.4, gy - cell * 2.4, cell * 4.8, cell * 4.8);
        }
      }
      if (def.kind === "rise" && def.chars.includes("o")) x = p.x + Math.sin(t + p.phase) * 0.8;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillText(p.ch, x * cw, y * cell);
    }
  }

  // Sprites
  for (const s of scene.sprites) {
    const width = Math.max(...s.art.map((l) => l.length));
    let x = s.x * cols + (s.vx ?? 0) * t;
    if (s.vx) x = (((x + width) % (cols + width * 2)) + cols + width * 2) % (cols + width * 2) - width;
    if (s.sway) x += Math.sin((t / s.sway[1]) * Math.PI * 2) * s.sway[0];
    let y = s.y * rows;
    if (s.bob) y += Math.sin((t / s.bob[1]) * Math.PI * 2) * s.bob[0];
    ctx.globalAlpha = s.alpha ?? 1;
    // Swimmers face their direction of travel.
    const flip = (s.vx ?? 0) < 0;
    s.art.forEach((line, row) => {
      const chars = flip ? [...line].reverse().map(mirror) : [...line];
      chars.forEach((ch, col) => {
        if (ch === " ") return;
        ctx.fillStyle = s.palette?.[ch] ?? s.color;
        ctx.fillText(ch, (x + col) * cw, (y + row) * cell);
      });
    });
  }
  ctx.globalAlpha = 1;
}

const MIRROR: Record<string, string> = { "<": ">", ">": "<", "(": ")", ")": "(", "/": "\\", "\\": "/", "[": "]", "]": "[" };
const mirror = (c: string) => MIRROR[c] ?? c;
const alphaHex = (a: number) => Math.round(Math.min(1, Math.max(0, a)) * 255).toString(16).padStart(2, "0");
