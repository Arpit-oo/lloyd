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
Allowed fonts for suggested.font_display / font_body: ${FONT_CHOICES.join(", ")} (pick the closest match, or null).
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

/** Reads the links not already among the campaign's references. */
export async function readNewLinks(urls: string[], existing: { name: string }[], ctx: CallContext): Promise<{ pages: Reference[]; failed: string[] }> {
  const fresh = urls.filter((u) => !existing.some((r) => r.name.includes(`(${u})`)));
  const results = await Promise.all(fresh.map((u) => readLink(u, ctx).catch(() => null)));
  return { pages: results.filter((p): p is Reference => !!p), failed: getConfig().FIRECRAWL_API_KEY ? fresh.filter((_, i) => !results[i]) : [] };
}

/** Reads a web page as a reference: its text (via Firecrawl) and, from a screenshot, its design. */
export async function readLink(url: string, ctx: CallContext): Promise<Reference | null> {
  const key = getConfig().FIRECRAWL_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown", { type: "screenshot", fullPage: false }], onlyMainContent: true }),
    signal: ctx.signal,
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json()) as { data?: { markdown?: string; screenshot?: string; metadata?: { title?: string } } };
  const markdown = (body.data?.markdown ?? "").slice(0, 8000);
  const title = body.data?.metadata?.title ?? url;
  let design: Reference | null = null;
  if (body.data?.screenshot) design = await analyzeDesign(title, body.data.screenshot, `Web page at ${url}`, ctx).catch(() => null);
  if (!markdown && !design) return null;
  return {
    name: `${title} (${url})`,
    kind: "link",
    text: [design?.text, markdown && `Page text (for structure and tone only; do not copy its claims):\n${markdown}`].filter(Boolean).join("\n\n"),
    style: design?.style,
  };
}
