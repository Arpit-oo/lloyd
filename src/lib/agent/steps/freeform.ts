import { z } from "zod";
import type { Brand } from "@/lib/brand";
import { llm, type CallContext } from "@/lib/llm/client";
import { ASSET_LABEL, type AssetContent } from "../asset-types";
import { brandBlock, campaignBlock } from "../context";
import type { CampaignData } from "../types";

/**
 * Free-form design: the model writes a complete, self-contained HTML page for one asset.
 * The marketer opts in past a warning, because nothing here enforces the brand's look.
 * What stays enforced: the copy comes from the asset's checked content (no new claims), the
 * page is checked again by the guard as displayed, and it runs in a sandbox with scripts removed.
 */
const FreeformSchema = z.object({
  summary: z.string().describe("One sentence on the design, for the chat."),
  html: z.string().describe("A complete HTML document: <!doctype html>, inline <style>, no <script>."),
});

const RULES = `You are a senior web designer. Build ONE complete, self-contained HTML page for the asset below.
- Output a full document: <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" ...><style>...</style></head><body>...</body></html>.
- All CSS inline in one <style> tag. Google Fonts via <link> are allowed. No JavaScript, no <script>, no event handlers, no forms that submit anywhere, no iframes.
- Use the asset's copy as given. You may shorten, split or re-order it for the layout, but never add claims, statistics, customers, certifications or promises that are not in the copy.
- Images: only the URLs listed under "Images you may use". No external images.
- Follow the marketer's design direction. Where they don't specify, start from the brand's colours and fonts.
- Make it look like a real, polished, modern page, responsive down to 375px wide.`;

export async function generateFreeform(
  brand: Brand,
  data: CampaignData,
  content: AssetContent,
  direction: string,
  ctx: CallContext,
  previous?: { html: string; change: string },
): Promise<{ html: string; summary: string }> {
  const images = collectImageIds(content.data).map((id) => `/api/images/${encodeURIComponent(id)}`);
  const tokens = brand.tokens;
  const res = await llm.json({
    step: `freeform:${content.type}`,
    tier: "writer",
    effort: "low",
    maxOutputTokens: 24_000,
    system: [brandBlock(brand, RULES), campaignBlock(data, [])],
    input: [
      {
        label: "brand look",
        text: `Brand colours: ${(tokens?.colors ?? []).map((c) => `${c.name} ${c.hex} (${c.role})`).join("; ") || "unknown"}
Brand fonts: ${(tokens?.fonts ?? []).map((f) => `${f.family} (${f.role})`).join("; ") || "unknown"}
Images you may use: ${images.join(", ") || "none"}`,
      },
      { label: "asset copy", text: `${ASSET_LABEL[content.type]} copy (JSON):\n${JSON.stringify(content.data, null, 2)}` },
      previous
        ? {
            label: "current design",
            text: `This is the page's current HTML. Apply the marketer's change request and keep everything else about the design the same. Make the text match the copy above.
Change request: "${previous.change}"
If the request names a site or style (e.g. "like stripe.dev"), restyle the page in that site's recognisable look (layout, colour, type, density) using what you know of it and any reference material, without copying its logo, wording or claims.
Original design direction: "${direction}"

${previous.html}`,
          }
        : { label: "design direction", text: `Design direction from the marketer: "${direction}"\nIf it names a site or style (e.g. "like stripe.dev"), design in that site's recognisable look using what you know of it and any reference material, without copying its logo, wording or claims.` },
    ],
    schema: FreeformSchema,
    schemaName: "freeform",
    cacheKey: `brand:${brand.hash}`,
    ctx,
  });
  return { html: sanitizeHtml(res.data.html), summary: res.data.summary };
}

/** Removes scripts, event handlers, javascript: URLs and embedded frames. The preview iframe is sandboxed too. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*\/?>/gi, "")
    .replace(/<(iframe|object|embed)[\s\S]*?(<\/\1\s*>|\/>)/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

function collectImageIds(data: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    for (const [k, x] of Object.entries(v)) {
      if (k === "image_id" && typeof x === "string" && x) out.add(x);
      else walk(x);
    }
  };
  walk(data);
  return [...out];
}
