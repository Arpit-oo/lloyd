import { z } from "zod";
import { getConfig } from "@/lib/config";
import { llm, type CallContext } from "@/lib/llm/client";
import { FONT_CHOICES, type StyleRequest } from "./design";
import { StyleRequestSchema } from "./style-schema";

/**
 * References the marketer sends: example documents, screenshots or images of designs they like,
 * and links to pages. Each becomes text the writer reads (what it is, its structure and tone),
 * and images and pages also yield a suggested design (colours, fonts, spacing, hero layout) that
 * new web assets and emails start from. Brand rules still win over anything in a reference.
 */
export interface Reference {
  name: string;
  kind: "document" | "image" | "link";
  text: string;
  /** Suggested design settings, for image and link references. */
  style?: StyleRequest;
}

const DesignSchema = z.object({
  what_it_is: z.string().describe("One line: what this reference shows (e.g. 'SaaS landing page hero with product screenshot')."),
  layout: z.string().describe("Layout and structure in a few sentences: hero arrangement, sections in order, density, use of imagery."),
  visual_style: z.string().describe("Colours (with hex where you can tell), typography feel, corners, mood."),
  copy_style: z.string().describe("How the words work: headline length, tone, level of detail, calls to action. 'none' if no copy is visible."),
  suggested: StyleRequestSchema.describe("Settings that would make a page resemble this reference. Fonts only from the allowed list; null where unclear."),
});

/** Looks at an image (data URL or https URL) as a design reference. */
export async function analyzeDesign(name: string, image: string, context: string, ctx: CallContext): Promise<Reference> {
  const res = await llm.json({
    step: "reference:design",
    tier: "fast",
    effort: "low",
    system: [
      {
        text: `You study design references for a marketer who wants new assets that resemble them. Describe what you see precisely and practically.
The suggested settings should make a page look clearly like this reference: fill in every field you can see (all four colours, both fonts, spacing, corners, section tone, hero layout).
Fonts for suggested.font_display / font_body: if the page's measured CSS fonts are given, use those exact names (the headline font and the body font; they may be the same). Otherwise pick the closest of: ${FONT_CHOICES.join(", ")}.
Colours: if measured CSS colours are given, choose from them, matching what the screenshot shows for background, text, buttons and highlights.
reset_to_brand is always false.`,
      },
    ],
    input: [{ text: `Reference: ${name}\n${context}`.trim(), image }],
    schema: DesignSchema,
    schemaName: "design_reference",
    ctx,
  });
  const d = res.data;
  return {
    name,
    kind: context.startsWith("Web page") ? "link" : "image",
    text: `Design reference: ${d.what_it_is}\nLayout: ${d.layout}\nVisual style: ${d.visual_style}\nCopy style: ${d.copy_style}`,
    style: { ...d.suggested, reset_to_brand: false },
  };
}

const URL_RE = /\bhttps?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/gi;
/** Bare domains like "stripe.dev" or "linear.app/features" (not emails). */
const DOMAIN_RE = /(?<![@\w.\/-])((?:[a-z0-9-]+\.)+(?:com|dev|io|app|ai|co|org|net|design|so|xyz|studio|site|tech|cloud|me))(\/[^\s<>()"']*[^\s<>()"'.,;:!?])?(?![\w@-])/gi;

/** Links in a message (at most 3), in order. Bare domains become https:// links. */
export function extractUrls(text: string): string[] {
  const full = text.match(URL_RE) ?? [];
  const rest = text.replace(URL_RE, " ");
  const bare = [...rest.matchAll(DOMAIN_RE)].map((m) => `https://${m[0]}`);
  return [...new Set([...full, ...bare])].slice(0, 3);
}

/** Words that say "make it resemble this", as opposed to a link that is just mentioned (a CTA target, the brand's site). */
const RESEMBLE_RE = /\b(like|look|looks|style|styled|feel|vibe|reference|inspir\w*|similar|resembl\w*|mimic|copy|based on|in the style|design)\b/i;

/**
 * Links the marketer offers as references: only those in a sentence that asks to resemble
 * them ("make it look like stripe.dev"). A CTA target or the brand's own site is not fetched.
 */
export function referenceUrls(text: string): string[] {
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  return [...new Set(sentences.filter((s) => RESEMBLE_RE.test(s)).flatMap(extractUrls))].slice(0, 3);
}

/** "Make it like magihq.com", "like the reference", "same look as this site": an edit that should take a reference's design. */
export function pointsAtReference(text: string): boolean {
  if (!RESEMBLE_RE.test(text)) return false;
  return extractUrls(text).length > 0 || /\b(reference|(this|that|the|my) (site|page|website|design|screenshot|image|example|one))\b/i.test(text);
}

/** Reads the links not already among the campaign's references. */
export async function readNewLinks(urls: string[], existing: { name: string }[], ctx: CallContext): Promise<{ pages: Reference[]; failed: string[] }> {
  const fresh = urls.filter((u) => !existing.some((r) => r.name.includes(`(${u})`)));
  const results = await Promise.all(fresh.map((u) => readLink(u, ctx).catch(() => null)));
  return { pages: results.filter((p): p is Reference => !!p), failed: getConfig().FIRECRAWL_API_KEY ? fresh.filter((_, i) => !results[i]) : [] };
}

const GENERIC_FONTS = /^(inherit|initial|unset|serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+|-apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica( neue)?|arial|apple color emoji|segoe ui emoji|segoe ui symbol|noto color emoji|var\(.*)$/i;

/**
 * What a page's CSS actually uses: font families and colours by how often they appear. A
 * screenshot alone only lets the vision model guess ("a geometric sans, dark navy"), so pages
 * copied as references kept the brand's fonts and colours. Best effort: null on any failure.
 */
export async function measureCss(url: string, signal?: AbortSignal): Promise<{ fonts: string[]; colors: string[] } | null> {
  const get = async (u: string) => {
    const r = await fetch(u, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 (compatible; LloydReference/1.0)" } });
    return r.ok ? (await r.text()).slice(0, 1_500_000) : "";
  };
  try {
    const html = await get(url);
    if (!html) return null;
    const sheets = [...html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)]
      .map((m) => /href=["']([^"']+)["']/i.exec(m[0])?.[1])
      .filter((h): h is string => !!h)
      .map((h) => new URL(h.replace(/&amp;/g, "&"), url).toString());
    const googleFamilies = sheets.filter((h) => h.includes("fonts.googleapis.com")).flatMap((h) => [...new URL(h).searchParams.getAll("family")].map((f) => f.split(":")[0].replace(/\+/g, " ")));
    const css = [html.match(/<style[^>]*>[\s\S]*?<\/style>/gi)?.join("\n") ?? "", ...(await Promise.all(sheets.filter((h) => !h.includes("fonts.googleapis.com")).slice(0, 4).map((h) => get(h).catch(() => ""))))].join("\n");
    const fontCount = new Map<string, number>();
    for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
      const first = m[1].split(",")[0].trim().replace(/^["']|["']$/g, "").replace(/!important/, "").trim();
      // next/font names look like "__Inter_a1b2c3" or "__Inter_Fallback_a1b2c3".
      const name = first.replace(/^__(.+?)(_Fallback)?_[0-9a-f]{4,}$/i, "$1").replace(/_/g, " ").trim();
      if (name && !GENERIC_FONTS.test(name) && !/fallback/i.test(name)) fontCount.set(name, (fontCount.get(name) ?? 0) + 1);
    }
    const colorCount = new Map<string, number>();
    for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
      const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
      const hex = `#${h.toLowerCase()}`;
      colorCount.set(hex, (colorCount.get(hex) ?? 0) + 1);
    }
    const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k} (${c}×)`);
    const fonts = [...new Set([...googleFamilies, ...top(fontCount, 6)])];
    const colors = top(colorCount, 12);
    return fonts.length || colors.length ? { fonts, colors } : null;
  } catch {
    return null;
  }
}

/** Reads a web page as a reference: its text (via Firecrawl), its CSS fonts and colours, and, from a screenshot, its design. */
export async function readLink(url: string, ctx: CallContext): Promise<Reference | null> {
  const key = getConfig().FIRECRAWL_API_KEY;
  if (!key) return null;
  const [res, measured] = await Promise.all([
    fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown", { type: "screenshot", fullPage: false }], onlyMainContent: true }),
      signal: ctx.signal,
    }).catch(() => null),
    measureCss(url, ctx.signal),
  ]);
  if (!res?.ok) return null;
  const body = (await res.json()) as { data?: { markdown?: string; screenshot?: string; metadata?: { title?: string } } };
  const markdown = (body.data?.markdown ?? "").slice(0, 8000);
  const title = body.data?.metadata?.title ?? url;
  const cssNote = measured
    ? `\nMeasured from the page's CSS (use these real values for the suggested fonts and colours):\nFonts, most used first: ${measured.fonts.join(", ") || "unknown"}\nColours, most used first: ${measured.colors.join(", ") || "unknown"}`
    : "";
  let design: Reference | null = null;
  if (body.data?.screenshot) design = await analyzeDesign(title, body.data.screenshot, `Web page at ${url}${cssNote}`, ctx).catch(() => null);
  if (!markdown && !design) return null;
  return {
    name: `${title} (${url})`,
    kind: "link",
    text: [design?.text, cssNote.trim(), markdown && `Page text (for structure and tone only; do not copy its claims):\n${markdown}`].filter(Boolean).join("\n\n"),
    style: design?.style,
  };
}
