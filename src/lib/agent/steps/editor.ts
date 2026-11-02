import { z } from "zod";
import type { Brand } from "@/lib/brand";
import { llm, type CallContext } from "@/lib/llm/client";
import type { MemoryForPrompt } from "@/lib/memory/store";
import { ASSET_LABEL, ASSET_SCHEMAS, type AssetContent } from "../asset-types";
import { brandBlock, campaignBlock, channelBlock } from "../context";
import type { CampaignData } from "../types";
import { WRITER_RULES } from "./writer";

/**
 * Edits one asset in place. The model returns patch operations on named paths
 * ("subject", "sections.2.body_markdown", "posts.0.text") instead of rewriting the whole asset,
 * so "fix the intro" on a long blog costs a paragraph of output, not the whole post.
 * The patched asset is re-validated against its schema before it becomes a new version.
 */
const EditSchema = z.object({
  summary: z.string().describe("One sentence on what changed, for the chat."),
  ops: z.array(
    z.object({
      path: z.string().describe("Dot path into the asset JSON, e.g. 'text', 'subject', 'sections.2.body_markdown', 'posts.0.text', 'hero.headline', 'image.image_id'."),
      value_json: z.string().describe("New value as JSON (a JSON string literal for text)."),
    }),
  ),
});

const EDIT_RULES = `${WRITER_RULES}

You are now EDITING an existing asset. Change only what the marketer asked for and keep everything else exactly as it is.
Return patch operations on the smallest paths that achieve the edit. Replace whole arrays only if items are added or removed.
Brand rules still apply to the edited text.`;

export async function editAsset(
  brand: Brand,
  data: CampaignData,
  memories: MemoryForPrompt[],
  content: AssetContent,
  instruction: string,
  ctx: CallContext,
): Promise<{ content: AssetContent; summary: string }> {
  const channel = await channelBlock(brand, content.type, ctx);
  const res = await llm.json({
    step: `edit:${content.type}`,
    tier: "writer",
    effort: "low",
    system: [brandBlock(brand, EDIT_RULES), campaignBlock(data, memories)],
    input: [
      channel.block,
      { label: "current asset", text: `Current ${ASSET_LABEL[content.type]}:\n${JSON.stringify(content.data, null, 2)}` },
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
  return { content: { type: content.type, data: parsed } as AssetContent, summary: res.data.summary };
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
