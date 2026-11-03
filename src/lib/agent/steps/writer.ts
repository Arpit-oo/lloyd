import type { Brand } from "@/lib/brand";
import { llm, type CallContext } from "@/lib/llm/client";
import type { MemoryForPrompt } from "@/lib/memory/store";
import { ASSET_LABEL, ASSET_SCHEMAS, type AssetContent } from "../asset-types";
import { assetBlock, brandBlock, campaignBlock, channelBlock } from "../context";
import type { CampaignData, PlanItem } from "../types";
import { imageCandidates, renderCandidates } from "./images";
import { renderResearch, research, type ResearchFinding } from "./research";

/**
 * Writes one asset from its plan item. Each asset gets its own context pack (see context.ts),
 * so a LinkedIn post never carries the blog playbook and an edit never touches siblings.
 */
export const WRITER_RULES = `You write marketing assets that a senior marketer at this brand would publish as-is.

- Follow the brand kernel, the campaign block and the channel playbook. When they disagree, the brand kernel and brand-check decisions win.
- Facts: use only facts from the brand context, the campaign, or the verified web research given. Never invent customers, numbers, quotes, dates, features or prices.
- Names: product and company names exactly as the kernel writes them, including first-mention rules.
- Proof: if no allowed proof exists for this product, write without it. A thin asset beats a borrowed number.
- Third-party statistics: only from the verified research list, with publisher, date and link as the brand requires.
- Write for the asset's audience in the brand's voice. Sound like a person, not a template. No filler, no hype words the brand bans.
- Images: pick at most one image id from the candidates, respecting the brief's image rules and each caution; null if none fits.
- Fill every field of the schema realistically for the channel (sender, subject, handle, byline, CTA).
- Links: only URLs that appear in the brand context or the brief, and only where the page matches the link text. If no known URL fits (e.g. no demo-booking page is given), leave the url null; never point a CTA at an unrelated page or invent a path. No bracketed placeholders like [address] anywhere: leave a detail out rather than fake it.
- Never promise response times, SLAs, support levels, prices, roadmap items or capabilities the context does not state. Describe only what the product does today, in the brand's words.
- Lead with the strongest TRUE thing for this audience. A status not yet achieved (e.g. a certification in progress) is a supporting fact, never a headline or subject line, unless the marketer explicitly asks for it.`;

/** The cached prefix shared by every asset of one type: identical for the prewarm and the writes. */
export async function writerPrefix(brand: Brand, data: CampaignData, memories: MemoryForPrompt[], type: PlanItem["type"], ctx: CallContext) {
  const channel = await channelBlock(brand, type, ctx);
  return { system: [brandBlock(brand, WRITER_RULES), campaignBlock(data, memories)], channel };
}

export interface WriteResult {
  content: AssetContent;
  sources: { docs: string[]; research: ResearchFinding[]; researchRejected: string[]; imageCandidates: string[] };
  callId: string;
}

export async function writeAsset(
  brand: Brand,
  data: CampaignData,
  memories: MemoryForPrompt[],
  item: PlanItem,
  ctx: CallContext,
  onText?: (soFar: string) => void,
): Promise<WriteResult> {
  const [{ system, channel }, images, web] = await Promise.all([
    writerPrefix(brand, data, memories, item.type, ctx),
    item.image_brief ? imageCandidates(brand, item.type, item.image_brief, ctx) : Promise.resolve([]),
    item.research_question ? research(item.research_question, ctx) : Promise.resolve({ findings: [], rejected: [] }),
  ]);
  const extra = [renderCandidates(images), item.research_question ? renderResearch(web) : ""].filter(Boolean).join("\n\n");
  const asset = await assetBlock(brand, item, extra, ctx);

  const schema = ASSET_SCHEMAS[item.type];
  const res = await llm.json({
    step: `write:${item.type}`,
    tier: "writer",
    effort: "medium",
    system,
    input: [channel.block, asset.block, { label: "task", text: `Write the ${ASSET_LABEL[item.type]} "${item.title}" (plan item ${item.id}) now.` }],
    schema,
    schemaName: item.type,
    cacheKey: `brand:${brand.hash}`,
    maxOutputTokens: 20_000,
    ctx: { ...ctx, assetId: ctx.assetId },
    onText,
  });

  return {
    content: { type: item.type, data: res.data } as AssetContent,
    sources: { docs: [...new Set([...channel.sources, ...asset.sources])], research: web.findings, researchRejected: web.rejected, imageCandidates: images.map((i) => i.id) },
    callId: res.callId,
  };
}
