import { z } from "zod";
import type { Brand } from "@/lib/brand";
import { llm, type CallContext } from "@/lib/llm/client";
import type { MemoryForPrompt } from "@/lib/memory/store";
import { ASSET_LABEL, ASSET_SCHEMAS, type AssetContent } from "../asset-types";
import { brandBlock, campaignBlock, channelBlock } from "../context";
import { describeStyle, FONT_CHOICES, mergeStyle, type BrandLook } from "../design";
import { StyleRequestSchema } from "../style-schema";
import type { CampaignData } from "../types";
import { WRITER_RULES } from "./writer";

/**
 * Edits one asset in place. The model returns patch operations on named paths
 * ("subject", "sections.2.body_markdown", "posts.0.text") instead of rewriting the whole asset,
 * so "fix the intro" on a long blog costs a paragraph of output, not the whole post.
 * Design requests (colours, fonts, spacing, corners, hero layout) come back as a style request.
 * The patched asset is re-validated against its schema before it becomes a new version.
 */
const EditSchema = z.object({
  summary: z.string().describe("One sentence on what actually changed (text via ops, design via style). Never describe a change you did not make."),
  style: StyleRequestSchema,
  off_brand_note: z.string().nullable().describe("If a colour or font you set is not the brand's own, one plain sentence saying so and naming the closest brand option; else null."),
  ops: z.array(
    z.object({
      path: z.string().describe("Dot path into the asset JSON, e.g. 'text', 'subject', 'sections.2.body_markdown', 'posts.0.text', 'hero.headline', 'image.image_id'."),
      value_json: z.string().describe("New value as JSON (a JSON string literal for text)."),
    }),
  ),
});

const EDIT_RULES = `${WRITER_RULES}

You are now EDITING an existing asset. Change only what the marketer asked for and keep everything else exactly as it is.
Return patch operations on the smallest paths that achieve the edit. Replace whole arrays only if items are added, removed or reordered.
Brand rules still apply to the edited text.
When asked to change the voice, persona, tone or theme of the writing, rewrite the text substantially so the change is obvious on a first read; a light polish does not count. If brand rules stop you from doing part of it, say exactly which part in the summary.

Structure is editable through ops: add, remove or reorder sections (landing page, blog) or blocks (email), and change a section's "kind" (features, steps, faq, proof, limits, text, cta, code) or a block's kind, which changes how it is laid out.

Design requests go in "style", never in the text. Leave every style field null unless the request is about that aspect:
- colours: #rrggbb hex values (pick a faithful hex for named colours, e.g. electric purple #8f00ff);
- fonts: only from the allowed fonts listed below;
- density (spacing), corners, section_tone, hero_layout, cta_style: the listed options.
Translate taste words: "more premium/editorial" = roomy + a serif display font + sharp corners; "friendlier" = rounded or pill corners; "punchier/bolder" = dark section tone or a stronger primary; "tighter" = compact.
If the marketer points at a design reference ("like the reference", "like this site"), use the design notes and suggested style in the reference material.
If a colour or font is not the brand's own, still apply it (the marketer asked) and explain in off_brand_note.
The page template itself (nav, order of hero then sections) and exact pixel layout cannot be changed here. If the marketer wants a completely different design, say in the summary that they can use "Free-form design" in the asset panel.`;

export async function editAsset(
  brand: Brand,
  data: CampaignData,
  memories: MemoryForPrompt[],
  content: AssetContent,
  instruction: string,
  ctx: CallContext,
): Promise<{ content: AssetContent; summary: string }> {
  const channel = await channelBlock(brand, content.type, ctx);
  const look = brandLook(brand);
  const res = await llm.json({
    step: `edit:${content.type}`,
    tier: "writer",
    effort: "low",
    system: [brandBlock(brand, EDIT_RULES), campaignBlock(data, memories)],
    input: [
      channel.block,
      { label: "current asset", text: `Current ${ASSET_LABEL[content.type]}:\n${JSON.stringify(content.data, null, 2)}` },
      {
        label: "design options",
        text: `Brand palette: ${(brand.tokens?.colors ?? []).map((c) => `${c.name} ${c.hex} (${c.role})`).join("; ") || "unknown"}
Brand fonts: ${look.fonts.join(", ") || "unknown"}
Allowed fonts: ${[...new Set([...look.fonts, ...FONT_CHOICES])].join(", ")}
Current design settings on this asset: ${describeStyle(content.style)}`,
      },
      { label: "edit request", text: `Edit request: "${instruction}"` },
    ],
    schema: EditSchema,
    schemaName: "edit",
    cacheKey: `brand:${brand.hash}`,
    ctx,
  });

  const next = structuredClone(content.data) as Record<string, unknown>;
  for (const op of res.data.ops) setPath(next, op.path, JSON.parse(op.value_json));
  const parsed = ASSET_SCHEMAS[content.type].parse(next);
  const style = mergeStyle(content.style, res.data.style, look);
  const summary = [res.data.summary, res.data.off_brand_note].filter(Boolean).join(" ");
  const { style: _s, ...rest } = content;
  void _s;
  return { content: { ...rest, data: parsed, ...(style ? { style } : {}) } as AssetContent, summary };
}

/** The brand's own colours and fonts, from the extracted design tokens. */
export function brandLook(brand: Pick<Brand, "tokens">): BrandLook {
  return { palette: (brand.tokens?.colors ?? []).map((c) => c.hex), fonts: (brand.tokens?.fonts ?? []).map((f) => f.family) };
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".").filter(Boolean);
  let cur: Record<string, unknown> | unknown[] = obj;
  keys.forEach((k, i) => {
    const key: string | number = Array.isArray(cur) ? Number(k) : k;
    if (i === keys.length - 1) {
      (cur as Record<string | number, unknown>)[key] = value;
      return;
    }
    const nextVal = (cur as Record<string | number, unknown>)[key];
    if (nextVal === undefined || nextVal === null || typeof nextVal !== "object") throw new Error(`Edit path not found: ${path}`);
    cur = nextVal as Record<string, unknown>;
  });
}
