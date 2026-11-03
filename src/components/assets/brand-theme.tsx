"use client";

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
  mark: string | null;
  name: string;
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
    mark: idOf(logoFile("mark")),
    name: tokens?.brand_name ?? "Brand",
  };
}

export function BrandTheme({ vars, children, className = "" }: { vars: BrandVars; children: React.ReactNode; className?: string }) {
  const families = [...new Set([vars.display, vars.body, vars.mono])].filter((f) => !/^(system-ui|ui-monospace|Georgia)$/.test(f));
  const href = families.length
    ? `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`).join("&")}&display=swap`
    : null;
  return (
    <div
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
