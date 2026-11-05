/**
 * Per-asset design settings a marketer can change in chat ("use electric purple", "roomier",
 * "image as the hero background"), or that a design reference suggests. Previews apply them on
 * top of the brand's design tokens; absent fields mean "use the brand / template default".
 *
 * Shared by server (editor, writer, references) and client (renderers). No Node imports.
 */
export const DENSITIES = ["compact", "normal", "roomy"] as const;
export const CORNERS = ["sharp", "rounded", "pill"] as const;
export const SECTION_TONES = ["light", "alternate", "dark"] as const;
export const HERO_LAYOUTS = ["split", "centered", "image_background"] as const;
export const CTA_STYLES = ["band", "card"] as const;

/** Fonts offered besides the brand's own (all on Google Fonts, so previews can load them). */
export const FONT_CHOICES = [
  "Inter",
  "DM Sans",
  "Plus Jakarta Sans",
  "Manrope",
  "Space Grotesk",
  "IBM Plex Sans",
  "Work Sans",
  "Playfair Display",
  "Fraunces",
  "Lora",
  "IBM Plex Serif",
  "DM Serif Display",
] as const;

export interface AssetStyle {
  primary?: string;
  accent?: string;
  ground?: string;
  ink?: string;
  fontDisplay?: string;
  fontBody?: string;
  density?: (typeof DENSITIES)[number];
  corners?: (typeof CORNERS)[number];
  sectionTone?: (typeof SECTION_TONES)[number];
  heroLayout?: (typeof HERO_LAYOUTS)[number];
  ctaStyle?: (typeof CTA_STYLES)[number];
  /** Colours and fonts in use that are not the brand's own. */
  offBrand?: string[];
}

/** What an edit or a design reference asks for. null = leave unchanged. */
export interface StyleRequest {
  primary: string | null;
  accent: string | null;
  background: string | null;
  text: string | null;
  font_display: string | null;
  font_body: string | null;
  density: AssetStyle["density"] | null;
  corners: AssetStyle["corners"] | null;
  section_tone: AssetStyle["sectionTone"] | null;
  hero_layout: AssetStyle["heroLayout"] | null;
  cta_style: AssetStyle["ctaStyle"] | null;
  reset_to_brand: boolean;
}

export const EMPTY_STYLE_REQUEST: StyleRequest = {
  primary: null,
  accent: null,
  background: null,
  text: null,
  font_display: null,
  font_body: null,
  density: null,
  corners: null,
  section_tone: null,
  hero_layout: null,
  cta_style: null,
  reset_to_brand: false,
};

const HEX = /^#[0-9a-f]{6}$/i;

export interface BrandLook {
  palette: string[];
  fonts: string[];
}

/** A font name a design reference measured from its CSS: plain words, so it is safe in CSS and a Google Fonts URL. */
const FONT_NAME = /^[A-Za-z][A-Za-z0-9 -]{1,39}$/;

/**
 * Applies a request on top of the current style. Invalid colours are ignored; fonts must be the
 * brand's or the listed choices, unless `anyFont` (a design reference's own font, e.g. copied
 * from a site the marketer pointed at), which then loads from Google Fonts or falls back.
 */
export function mergeStyle(current: AssetStyle | undefined, req: StyleRequest, brand: BrandLook, opts: { anyFont?: boolean } = {}): AssetStyle | undefined {
  if (req.reset_to_brand) return undefined;
  const allowedFonts = new Map([...brand.fonts, ...FONT_CHOICES].map((f) => [f.toLowerCase(), f]));
  const font = (f: string | null) => (f ? (allowedFonts.get(f.trim().toLowerCase()) ?? (opts.anyFont && FONT_NAME.test(f.trim()) ? f.trim() : undefined)) : undefined);
  const hex = (h: string | null) => (h && HEX.test(h.trim()) ? h.trim().toLowerCase() : undefined);
  const set: AssetStyle = {
    primary: hex(req.primary),
    accent: hex(req.accent),
    ground: hex(req.background),
    ink: hex(req.text),
    fontDisplay: font(req.font_display),
    fontBody: font(req.font_body),
    density: req.density && DENSITIES.includes(req.density) ? req.density : undefined,
    corners: req.corners && CORNERS.includes(req.corners) ? req.corners : undefined,
    sectionTone: req.section_tone && SECTION_TONES.includes(req.section_tone) ? req.section_tone : undefined,
    heroLayout: req.hero_layout && HERO_LAYOUTS.includes(req.hero_layout) ? req.hero_layout : undefined,
    ctaStyle: req.cta_style && CTA_STYLES.includes(req.cta_style) ? req.cta_style : undefined,
  };
  const merged = { ...current };
  for (const [k, v] of Object.entries(set)) if (v !== undefined) (merged as Record<string, unknown>)[k] = v;
  return finalizeStyle(merged, brand);
}

/** Drops empty fields and recomputes which colours and fonts are off-brand. */
export function finalizeStyle(style: AssetStyle | undefined, brand: BrandLook): AssetStyle | undefined {
  if (!style) return undefined;
  // offPalette: the earlier name of offBrand, on assets edited before fonts were added.
  const { offBrand: _old, offPalette: _legacy, ...rest } = style as AssetStyle & { offPalette?: unknown };
  void _old;
  void _legacy;
  const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null)) as AssetStyle;
  if (!Object.keys(clean).length) return undefined;
  const palette = new Set(brand.palette.map((h) => h.toLowerCase()));
  const fonts = new Set(brand.fonts.map((f) => f.toLowerCase()));
  const off = [
    ...[clean.primary, clean.accent, clean.ground, clean.ink].filter((c): c is string => !!c && !palette.has(c)),
    ...[clean.fontDisplay, clean.fontBody].filter((f): f is string => !!f && !fonts.has(f.toLowerCase())),
  ];
  return off.length ? { ...clean, offBrand: [...new Set(off)] } : clean;
}

/** One-line description for prompts. */
export function describeStyle(style: AssetStyle | undefined): string {
  if (!style) return "none (brand defaults)";
  const { offBrand: _o, ...rest } = style;
  void _o;
  return JSON.stringify(rest);
}
