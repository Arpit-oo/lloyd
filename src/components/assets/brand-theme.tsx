"use client";

import type { AssetStyle } from "@/lib/agent/design";
import type { DesignTokens } from "@/lib/brand/design-tokens";

/**
 * Applies the brand's extracted design tokens to asset previews as CSS variables, and loads the
 * brand's fonts from Google Fonts when they are available there. Nothing brand-specific is
 * hardcoded: every value comes from the tokens the brand layer extracted from the guidelines.
 */
export interface BrandVars {
  primary: string;
  ink: string;
  ground: string;
  accent: string;
  display: string;
  body: string;
  mono: string;
  logo: string | null;
  /** Logo for dark backgrounds (reversed / white variant), if the brand has one. */
  logoDark: string | null;
  mark: string | null;
  name: string;
  /** Layout settings (from chat edits or a design reference); template defaults when absent. */
  density: NonNullable<AssetStyle["density"]>;
  corners: NonNullable<AssetStyle["corners"]>;
  tone: NonNullable<AssetStyle["sectionTone"]>;
  heroLayout: NonNullable<AssetStyle["heroLayout"]>;
  ctaStyle: NonNullable<AssetStyle["ctaStyle"]>;
}

export function brandVars(tokens: DesignTokens | null | undefined): BrandVars {
  const color = (role: string, fallback: string) =>
    tokens?.colors.find((c) => c.role.toLowerCase().includes(role))?.hex ?? fallback;
  const font = (role: string, fallback: string) => tokens?.fonts.find((f) => f.role.toLowerCase().includes(role))?.family ?? fallback;
  const logoFile = (want: string) => tokens?.logo_files.find((l) => l.use.toLowerCase().includes(want))?.filename ?? null;
  const idOf = (file: string | null) => (file ? file.replace(/\.[a-z]+$/i, "") : null);
  return {
    primary: color("primary", "#4338ca"),
    ink: color("ink", "#1c1917"),
    ground: color("background", color("ground", "#ffffff")),
    accent: color("accent", color("secondary", "#0f766e")),
    display: font("display", font("head", "Georgia")),
    body: font("body", "system-ui"),
    mono: font("mono", "ui-monospace"),
    logo: idOf(logoFile("light") ?? tokens?.logo_files[0]?.filename ?? null),
    logoDark: idOf(
      tokens?.logo_files.find((l) => (/\b(reverse|reversed|knockout|inverse)\b|on (a )?dark/i.test(`${l.use} ${l.filename}`)) && !/on (a )?(white|light)/i.test(l.use) && !/mark/i.test(l.use))?.filename ?? null,
    ),
    mark: idOf(logoFile("mark")),
    name: tokens?.brand_name ?? "Brand",
    density: "normal",
    corners: "rounded",
    tone: "alternate",
    heroLayout: "split",
    ctaStyle: "band",
  };
}

/** Brand tokens with an asset's own design settings on top. */
export function applyStyle(vars: BrandVars, style: AssetStyle | undefined): BrandVars {
  if (!style) return vars;
  return {
    ...vars,
    primary: style.primary ?? vars.primary,
    accent: style.accent ?? vars.accent,
    ground: style.ground ?? vars.ground,
    ink: style.ink ?? vars.ink,
    display: style.fontDisplay ?? vars.display,
    body: style.fontBody ?? vars.body,
    density: style.density ?? vars.density,
    corners: style.corners ?? vars.corners,
    tone: style.sectionTone ?? vars.tone,
    heroLayout: style.heroLayout ?? vars.heroLayout,
    ctaStyle: style.ctaStyle ?? vars.ctaStyle,
  };
}

/** Relative luminance of a #rrggbb colour (0 black … 1 white); 0.5 if it can't be read. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable text colour on a filled background (buttons, badges). */
export const onColor = (bg: string) => (luminance(bg) > 0.4 ? "#111111" : "#ffffff");

/** Corner radius in px for buttons and for cards. */
export const radius = (c: BrandVars["corners"]) => ({ button: c === "sharp" ? 0 : c === "pill" ? 999 : 8, card: c === "sharp" ? 0 : c === "pill" ? 24 : 12 });

export function BrandTheme({ vars, children, className = "" }: { vars: BrandVars; children: React.ReactNode; className?: string }) {
  const families = [...new Set([vars.display, vars.body, vars.mono])].filter((f) => !/^(system-ui|ui-monospace|Georgia)$/.test(f));
  const href = families.length
    ? `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`).join("&")}&display=swap`
    : null;
  return (
    <div
      data-preview-root
      className={className}
      style={
        {
          "--brand-primary": vars.primary,
          "--brand-ink": vars.ink,
          "--brand-ground": vars.ground,
          "--brand-accent": vars.accent,
          "--brand-display": `"${vars.display}", Georgia, serif`,
          "--brand-body": `"${vars.body}", system-ui, sans-serif`,
          "--brand-mono": `"${vars.mono}", ui-monospace, monospace`,
          fontFamily: "var(--brand-body)",
        } as React.CSSProperties
      }
    >
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      {href && <link rel="stylesheet" href={href} />}
      {children}
    </div>
  );
}

export const imageUrl = (id: string | null | undefined) => (id ? `/api/images/${encodeURIComponent(id)}` : null);
